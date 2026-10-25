package marketdata_test

import (
	"bytes"
	"cmp"
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

	"github.com/gringolito/debtwise/backend/decimal"
	"github.com/gringolito/debtwise/backend/indexes"
	"github.com/gringolito/debtwise/backend/marketdata"
	"github.com/gringolito/debtwise/backend/marketdata/sgs"
)

type request struct {
	series   int
	from, to time.Time
}

// fakeSource records the requests it gets and answers each with rows and err. While block is
// open, a request waits until block closes or its context is done.
type fakeSource struct {
	mu       sync.Mutex
	requests []request
	rows     []sgs.Observation
	err      error
	block    chan struct{}
}

func (f *fakeSource) Observations(ctx context.Context, series int, from, to time.Time) ([]sgs.Observation, error) {
	f.mu.Lock()
	f.requests = append(f.requests, request{series: series, from: from, to: to})
	block := f.block
	f.mu.Unlock()

	if block != nil {
		select {
		case <-block:
		case <-ctx.Done():
			return nil, ctx.Err()
		}
	}

	return f.rows, f.err
}

func (f *fakeSource) requested() []request {
	f.mu.Lock()
	defer f.mu.Unlock()

	return slices.Clone(f.requests)
}

type failure struct {
	index  indexes.Index
	values []indexes.Value
}

// fakeStore holds the latest period start and the refresh times it is given, records the
// failures it saves, or fails every call with err.
type fakeStore struct {
	mu       sync.Mutex
	latest   map[indexes.Index]time.Time
	times    []indexes.RefreshTimes
	failures []failure
	err      error
}

func (f *fakeStore) LatestPeriodStart(_ context.Context, index indexes.Index) (time.Time, error) {
	f.mu.Lock()
	defer f.mu.Unlock()

	return f.latest[index], f.err
}

func (f *fakeStore) SaveRefresh(context.Context, indexes.Index, []indexes.Value, time.Time) error {
	return f.err
}

func (f *fakeStore) SaveFailure(_ context.Context, index indexes.Index, values []indexes.Value, _ time.Time) error {
	f.mu.Lock()
	defer f.mu.Unlock()

	f.failures = append(f.failures, failure{index: index, values: values})

	return f.err
}

func (f *fakeStore) RefreshTimes(context.Context) ([]indexes.RefreshTimes, error) {
	f.mu.Lock()
	defer f.mu.Unlock()

	return f.times, f.err
}

func (f *fakeStore) savedFailures() []failure {
	f.mu.Lock()
	defer f.mu.Unlock()

	return slices.Clone(f.failures)
}

// runJob runs job until the test ends.
func runJob(t *testing.T, job *marketdata.Job) {
	t.Helper()

	ctx, cancel := context.WithCancel(t.Context())
	done := make(chan struct{})

	go func() {
		defer close(done)

		job.Run(ctx)
	}()

	t.Cleanup(func() {
		cancel()
		<-done
	})
}

func refreshing(t *testing.T, job *marketdata.Job) bool {
	t.Helper()

	status, err := job.Status(t.Context(), time.Now())
	require.NoError(t, err)

	return status.Refreshing
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

func TestRefreshFetchesEachIndexFromWhereItsStoredHistoryEnds(t *testing.T) {
	t.Parallel()

	source := &fakeSource{}
	store := &fakeStore{latest: map[indexes.Index]time.Time{
		indexes.TR: time.Date(2026, time.September, 30, 0, 0, 0, 0, time.UTC),
		// The Selic target in force up to the next Copom meeting, stored by an earlier refresh.
		indexes.SelicTarget: time.Date(2026, time.November, 4, 0, 0, 0, 0, time.UTC),
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
		{series: 432, from: now, to: to},
		{series: 433, from: backfillFrom, to: to},
	}, got)
}

func TestRefreshKeepsWhatAFailedFetchGotBeforeItFailed(t *testing.T) {
	t.Parallel()

	day := time.Date(2005, time.January, 3, 0, 0, 0, 0, time.UTC)
	value, err := decimal.Parse("0.069186")
	require.NoError(t, err)

	source := &fakeSource{
		rows: []sgs.Observation{{Start: day, Value: value}},
		err:  errors.New("sgs: series 11 from 01/01/2005 to 31/12/2009: status 502"),
	}
	store := &fakeStore{}
	now := time.Date(2026, time.October, 25, 12, 0, 0, 0, time.UTC)

	require.Error(t, marketdata.New(source, store).Refresh(t.Context(), now))

	failures := store.savedFailures()
	slices.SortFunc(failures, func(a, b failure) int { return cmp.Compare(a.index, b.index) })

	want := make([]failure, 0, len(indexes.All()))
	for _, index := range indexes.All() {
		want = append(want, failure{index: index, values: []indexes.Value{
			{PeriodStart: day, PeriodEnd: day, Value: value, FetchedAt: now},
		}})
	}

	slices.SortFunc(want, func(a, b failure) int { return cmp.Compare(a.index, b.index) })
	assert.Equal(t, want, failures)
}

func TestStatusTellsHowFreshEachIndexIs(t *testing.T) {
	t.Parallel()

	now := time.Date(2026, time.October, 25, 12, 0, 0, 0, time.UTC)
	store := &fakeStore{times: []indexes.RefreshTimes{
		{Index: indexes.TR, RefreshedAt: now.Add(-marketdata.StaleAfter)},
		{Index: indexes.PoupancaYield, RefreshedAt: now.Add(-marketdata.StaleAfter - time.Second)},
		{Index: indexes.SelicTarget, FailedAt: now.Add(-time.Minute)},
		{Index: indexes.Selic, RefreshedAt: now.Add(-time.Hour), FailedAt: now.Add(-time.Minute)},
	}}

	job := marketdata.New(&fakeSource{}, store)

	status, err := job.Status(t.Context(), now)
	require.NoError(t, err)
	assert.Equal(t, []marketdata.IndexStatus{
		{Index: indexes.TR, State: marketdata.Fresh, RefreshedAt: now.Add(-24 * time.Hour)},
		{Index: indexes.PoupancaYield, State: marketdata.Stale, RefreshedAt: now.Add(-24*time.Hour - time.Second)},
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
		runJob(t, job)

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
		job.Trigger()
		assert.Equal(t, 3, refreshes(), "once when triggered twice before it starts")
		assert.False(t, refreshing(t, job), "once refreshes are over")
	})
}

func TestATriggerDuringARefreshRunsAnotherAfterIt(t *testing.T) {
	t.Parallel()

	synctest.Test(t, func(t *testing.T) {
		block := make(chan struct{})
		source := &fakeSource{block: block}
		job := marketdata.New(source, &fakeStore{})
		runJob(t, job)

		synctest.Wait()
		job.Trigger()
		assert.True(t, refreshing(t, job), "while the first refresh runs")

		close(block)
		synctest.Wait()

		assert.Len(t, source.requested(), 2*len(indexes.All()))
		assert.False(t, refreshing(t, job), "after the refresh asked for during the first")
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

func TestARefreshStoppedByShutdownIsNoFailure(t *testing.T) {
	t.Parallel()

	synctest.Test(t, func(t *testing.T) {
		var logs bytes.Buffer

		store := &fakeStore{}
		job := marketdata.New(&fakeSource{block: make(chan struct{})}, store,
			marketdata.WithLogger(slog.New(slog.NewJSONHandler(&logs, nil))))

		ctx, cancel := context.WithCancel(t.Context())
		done := make(chan struct{})

		go func() {
			defer close(done)

			job.Run(ctx)
		}()

		synctest.Wait()
		cancel()
		<-done

		assert.Empty(t, store.savedFailures(), "no failure recorded")
		assert.Empty(t, logs.String(), "nothing logged")
	})
}
