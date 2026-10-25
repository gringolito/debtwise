package marketdata_test

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"log/slog"
	"slices"
	"sync"
	"testing"
	"testing/synctest"
	"time"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"github.com/gringolito/debtwise/backend/indexes"
	"github.com/gringolito/debtwise/backend/marketdata"
	"github.com/gringolito/debtwise/backend/marketdata/sgs"
)

type request struct {
	series   int
	from, to time.Time
}

// fakeSource records the requests it gets and answers them with no rows, or with err.
type fakeSource struct {
	mu       sync.Mutex
	requests []request
	err      error
}

func (f *fakeSource) Observations(_ context.Context, series int, from, to time.Time) ([]sgs.Observation, error) {
	f.mu.Lock()
	defer f.mu.Unlock()

	f.requests = append(f.requests, request{series: series, from: from, to: to})

	return nil, f.err
}

func (f *fakeSource) requested() []request {
	f.mu.Lock()
	defer f.mu.Unlock()

	return slices.Clone(f.requests)
}

// fakeStore holds the latest period start and the refreshes it is given, or fails every call
// with err.
type fakeStore struct {
	mu        sync.Mutex
	latest    map[indexes.Index]time.Time
	refreshes []indexes.Refresh
	err       error
}

func (f *fakeStore) LatestPeriodStart(_ context.Context, index indexes.Index) (time.Time, error) {
	f.mu.Lock()
	defer f.mu.Unlock()

	return f.latest[index], f.err
}

func (f *fakeStore) SaveRefresh(context.Context, indexes.Index, []indexes.Value, time.Time) error {
	return f.err
}

func (f *fakeStore) SaveFailure(context.Context, indexes.Index, time.Time) error {
	return f.err
}

func (f *fakeStore) Refreshes(context.Context) ([]indexes.Refresh, error) {
	f.mu.Lock()
	defer f.mu.Unlock()

	return f.refreshes, f.err
}

func TestRefreshReportsFailuresItCouldNotRecord(t *testing.T) {
	t.Parallel()

	storeErr := errors.New("database is closed")
	err := marketdata.New(&fakeSource{}, &fakeStore{err: storeErr}).Refresh(t.Context(), time.Now())

	require.ErrorIs(t, err, storeErr)

	for _, index := range indexes.All() {
		assert.ErrorContains(t, err, "marketdata: refresh "+string(index)+": database is closed\ndatabase is closed")
	}
}

func TestStatusFailsWhenTheStoreFails(t *testing.T) {
	t.Parallel()

	storeErr := errors.New("database is closed")
	_, err := marketdata.New(&fakeSource{}, &fakeStore{err: storeErr}).Status(t.Context(), time.Now())

	require.ErrorIs(t, err, storeErr)
}

func TestRefreshBackfillsNewIndexesAndRefetchesFromTheLatestPeriodOfTheOthers(t *testing.T) {
	t.Parallel()

	source := &fakeSource{}
	store := &fakeStore{latest: map[indexes.Index]time.Time{
		indexes.TR: time.Date(2026, time.September, 30, 0, 0, 0, 0, time.UTC),
	}}
	now := time.Date(2026, time.October, 25, 12, 0, 0, 0, time.UTC)

	require.NoError(t, marketdata.New(source, store).Refresh(t.Context(), now))

	backfillFrom := time.Date(2000, time.January, 1, 0, 0, 0, 0, time.UTC)
	// Ninety days past now, to take in the Selic target in force up to the next Copom meeting.
	to := time.Date(2027, time.January, 23, 12, 0, 0, 0, time.UTC)

	got := source.requested()
	slices.SortFunc(got, func(a, b request) int { return a.series - b.series })
	assert.Equal(t, []request{
		{series: 11, from: backfillFrom, to: to},
		{series: 195, from: backfillFrom, to: to},
		{series: 226, from: time.Date(2026, time.September, 30, 0, 0, 0, 0, time.UTC), to: to},
		{series: 432, from: backfillFrom, to: to},
		{series: 433, from: backfillFrom, to: to},
	}, got)
}

func TestStatusTellsHowFreshEachIndexIs(t *testing.T) {
	t.Parallel()

	now := time.Date(2026, time.October, 25, 12, 0, 0, 0, time.UTC)
	store := &fakeStore{refreshes: []indexes.Refresh{
		{Index: indexes.TR, RefreshedAt: now.Add(-marketdata.StaleAfter)},
		{Index: indexes.Poupanca, RefreshedAt: now.Add(-marketdata.StaleAfter - time.Second)},
		{Index: indexes.SelicTarget, FailedAt: now.Add(-time.Minute)},
		{Index: indexes.Selic, RefreshedAt: now.Add(-time.Hour), FailedAt: now.Add(-time.Minute)},
	}}

	job := marketdata.New(&fakeSource{}, store)

	status, err := job.Status(t.Context(), now)
	require.NoError(t, err)
	assert.Equal(t, []marketdata.IndexStatus{
		{Index: indexes.TR, State: marketdata.Fresh, RefreshedAt: now.Add(-24 * time.Hour)},
		{Index: indexes.Poupanca, State: marketdata.Stale, RefreshedAt: now.Add(-24*time.Hour - time.Second)},
		{Index: indexes.SelicTarget, State: marketdata.Failed, FailedAt: now.Add(-time.Minute)},
		{
			Index:       indexes.Selic,
			State:       marketdata.Failed,
			RefreshedAt: now.Add(-time.Hour),
			FailedAt:    now.Add(-time.Minute),
		},
		{Index: indexes.IPCA, State: marketdata.Missing},
	}, status.Indexes)
	assert.True(t, status.Refreshing, "a new job has its first refresh pending")
}

func TestRunRefreshesAtStartEveryIntervalAndWhenTriggered(t *testing.T) {
	t.Parallel()

	synctest.Test(t, func(t *testing.T) {
		source := &fakeSource{}
		job := marketdata.New(source, &fakeStore{}, marketdata.WithInterval(time.Hour))

		ctx, cancel := context.WithCancel(t.Context())
		done := make(chan struct{})

		go func() {
			defer close(done)

			job.Run(ctx)
		}()

		refreshes := func() int {
			synctest.Wait()

			return len(source.requested()) / len(indexes.All())
		}

		assert.Equal(t, 1, refreshes(), "at start")

		time.Sleep(time.Hour - time.Nanosecond)
		assert.Equal(t, 1, refreshes(), "not before the interval")

		time.Sleep(time.Nanosecond)
		assert.Equal(t, 2, refreshes(), "after an interval")

		job.Trigger()
		assert.Equal(t, 3, refreshes(), "when triggered")

		status, err := job.Status(t.Context(), time.Now())
		require.NoError(t, err)
		assert.False(t, status.Refreshing, "once refreshes are over")

		cancel()
		<-done
	})
}

func TestRunLogsAFailedRefreshOnce(t *testing.T) {
	t.Parallel()

	synctest.Test(t, func(t *testing.T) {
		var logs bytes.Buffer

		logger := slog.New(slog.NewJSONHandler(&logs, nil))
		source := &fakeSource{err: errors.New("status 502")}
		job := marketdata.New(source, &fakeStore{}, marketdata.WithLogger(logger))

		ctx, cancel := context.WithCancel(t.Context())
		done := make(chan struct{})

		go func() {
			defer close(done)

			job.Run(ctx)
		}()

		synctest.Wait()
		cancel()
		<-done

		var entry struct {
			Level string `json:"level"`
			Msg   string `json:"msg"`
			Err   string `json:"err"`
		}
		require.NoError(t, json.Unmarshal(logs.Bytes(), &entry), "exactly one log entry: %s", logs.String())
		assert.Equal(t, "ERROR", entry.Level)
		assert.Equal(t, "market data refresh failed", entry.Msg)

		for _, index := range indexes.All() {
			assert.Contains(t, entry.Err, "marketdata: refresh "+string(index)+": status 502")
		}
	})
}
