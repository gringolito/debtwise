package marketdata_test

import (
	"bytes"
	"cmp"
	"context"
	"encoding/json"
	"errors"
	"log/slog"
	"maps"
	"slices"
	"sync"
	"testing"
	"testing/synctest"
	"time"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"github.com/gringolito/debtwise/backend/bonds"
	"github.com/gringolito/debtwise/backend/decimal"
	"github.com/gringolito/debtwise/backend/indexes"
	"github.com/gringolito/debtwise/backend/marketdata"
	"github.com/gringolito/debtwise/backend/marketdata/focus"
	"github.com/gringolito/debtwise/backend/marketdata/radar"
	"github.com/gringolito/debtwise/backend/marketdata/sgs"
	"github.com/gringolito/debtwise/backend/marketdata/sidra"
)

type request struct {
	series   int
	from, to time.Time
}

// fakeSource stands in for both SGS and SIDRA. It records the requests it gets, a SIDRA request
// under its variable as the series, and answers each with rows and err. While block is open, a
// request waits until block closes or its context is done.
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

func (f *fakeSource) MonthlyValues(ctx context.Context, _, variable int, from, to time.Time) ([]sidra.Value, error) {
	rows, err := f.Observations(ctx, variable, from, to)

	values := make([]sidra.Value, 0, len(rows))
	for _, r := range rows {
		values = append(values, sidra.Value{Month: r.Start, Value: r.Value})
	}

	return values, err
}

// sources wires the fakes, with a Focus that answers nothing. Tests of the expectations set Focus.
func sources(indexes *fakeSource, quotes *fakeQuoteSource) marketdata.Sources {
	return marketdata.Sources{SGS: indexes, SIDRA: indexes, Radar: quotes, Focus: &fakeFocus{}}
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
// failures it saves, the expectations it saves and the expectation failures it saves, or fails
// every call with err, or only the expectations refresh times with expectationTimesErr.
type fakeStore struct {
	mu                  sync.Mutex
	latest              map[indexes.Index]time.Time
	times               []indexes.RefreshTimes
	expectationTimes    indexes.ExpectationsRefreshTimes
	expectationTimesErr error
	failures            []failure
	expectations        []savedExpectations
	expectationFailures []time.Time
	err                 error
}

type savedExpectations struct {
	expectations indexes.Expectations
	at           time.Time
}

func (f *fakeStore) SaveExpectations(_ context.Context, e indexes.Expectations, at time.Time) error {
	f.mu.Lock()
	defer f.mu.Unlock()

	if f.err == nil {
		f.expectations = append(f.expectations, savedExpectations{expectations: e, at: at})
	}

	return f.err
}

func (f *fakeStore) SaveExpectationsFailure(_ context.Context, at time.Time) error {
	f.mu.Lock()
	defer f.mu.Unlock()

	f.expectationFailures = append(f.expectationFailures, at)

	return f.err
}

func (f *fakeStore) ExpectationsRefreshTimes(context.Context) (indexes.ExpectationsRefreshTimes, error) {
	f.mu.Lock()
	defer f.mu.Unlock()

	return f.expectationTimes, cmp.Or(f.err, f.expectationTimesErr)
}

func (f *fakeStore) savedExpectations() []savedExpectations {
	f.mu.Lock()
	defer f.mu.Unlock()

	return slices.Clone(f.expectations)
}

func (f *fakeStore) savedExpectationFailures() []time.Time {
	f.mu.Lock()
	defer f.mu.Unlock()

	return slices.Clone(f.expectationFailures)
}

// fakeFocus answers each survey with the rows it holds, or its error, and records the day each
// was asked for. While block is open, a request waits until block closes or its context is done.
type fakeFocus struct {
	mu       sync.Mutex
	meetings []focus.Meeting
	months   []focus.Month
	years    []focus.Year
	errs     map[string]error // by method name
	asked    map[string]time.Time
	block    chan struct{}
}

func (f *fakeFocus) ask(ctx context.Context, method string, day time.Time) error {
	f.mu.Lock()

	if f.asked == nil {
		f.asked = map[string]time.Time{}
	}

	f.asked[method] = day
	block, err := f.block, f.errs[method]
	f.mu.Unlock()

	if block != nil {
		select {
		case <-block:
		case <-ctx.Done():
			return ctx.Err()
		}
	}

	return err
}

func (f *fakeFocus) Selic(ctx context.Context, day time.Time) ([]focus.Meeting, error) {
	return f.meetings, f.ask(ctx, "Selic", day)
}

func (f *fakeFocus) MonthlyIPCA(ctx context.Context, day time.Time) ([]focus.Month, error) {
	return f.months, f.ask(ctx, "MonthlyIPCA", day)
}

func (f *fakeFocus) AnnualIPCA(ctx context.Context, day time.Time) ([]focus.Year, error) {
	return f.years, f.ask(ctx, "AnnualIPCA", day)
}

func (f *fakeFocus) askedFor() map[string]time.Time {
	f.mu.Lock()
	defer f.mu.Unlock()

	return maps.Clone(f.asked)
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

// fakeQuoteSource lists one LTN and quotes it. While block is open, a request waits until block
// closes or its context is done.
type fakeQuoteSource struct {
	block chan struct{}
}

const ltn2029 = "Tesouro Prefixado 2029"

func (f *fakeQuoteSource) Names(ctx context.Context) ([]string, error) {
	if f.block != nil {
		select {
		case <-f.block:
		case <-ctx.Done():
			return nil, ctx.Err()
		}
	}

	return []string{ltn2029}, nil
}

func (f *fakeQuoteSource) Bond(_ context.Context, name string) (radar.Bond, error) {
	if name != ltn2029 {
		return radar.Bond{}, errors.New("fakeQuoteSource: unexpected request for " + name)
	}

	rate, price := decimal.FromInt(13), decimal.FromInt(800)

	return radar.Bond{
		Name:            ltn2029,
		Maturity:        time.Date(2029, time.January, 1, 0, 0, 0, 0, time.UTC),
		RedemptionRate:  &rate,
		RedemptionPrice: price,
	}, nil
}

// fakeQuoteStore counts the failures it saves, or fails every call with err.
type fakeQuoteStore struct {
	mu       sync.Mutex
	failures int
	err      error
}

func (f *fakeQuoteStore) SaveQuotes(context.Context, []bonds.Quote, time.Time) error {
	return f.err
}

func (f *fakeQuoteStore) SaveFailure(context.Context, time.Time) error {
	f.mu.Lock()
	defer f.mu.Unlock()

	f.failures++

	return f.err
}

func (f *fakeQuoteStore) RefreshTimes(context.Context) (bonds.RefreshTimes, error) {
	return bonds.RefreshTimes{}, f.err
}

func (f *fakeQuoteStore) savedFailures() int {
	f.mu.Lock()
	defer f.mu.Unlock()

	return f.failures
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
	err := marketdata.New(sources(&fakeSource{}, &fakeQuoteSource{}), &fakeStore{err: storeErr}, &fakeQuoteStore{err: storeErr}).
		Refresh(t.Context(), time.Now())

	require.ErrorIs(t, err, storeErr)

	failed := make([]string, 0, len(indexes.All())+2)
	failed = append(failed, "bonds", "focus expectations")

	for _, index := range indexes.All() {
		failed = append(failed, string(index))
	}

	for _, source := range failed {
		assert.ErrorContains(t, err, "marketdata: refresh "+source+": database is closed\ndatabase is closed")
	}
}

func TestStatusFailsWhenAStoreFails(t *testing.T) {
	t.Parallel()

	storeErr := errors.New("database is closed")

	tests := []struct {
		name       string
		indexStore *fakeStore
		quoteStore *fakeQuoteStore
	}{
		{name: "index store", indexStore: &fakeStore{err: storeErr}, quoteStore: &fakeQuoteStore{}},
		{name: "quote store", indexStore: &fakeStore{}, quoteStore: &fakeQuoteStore{err: storeErr}},
		{
			name:       "expectations refresh times",
			indexStore: &fakeStore{expectationTimesErr: storeErr},
			quoteStore: &fakeQuoteStore{},
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			t.Parallel()

			_, err := marketdata.New(sources(&fakeSource{}, &fakeQuoteSource{}), tt.indexStore, tt.quoteStore).
				Status(t.Context(), time.Now())

			require.ErrorIs(t, err, storeErr)
		})
	}
}

func TestRefreshFetchesEachIndexFromWhereItsStoredHistoryEnds(t *testing.T) {
	t.Parallel()

	source := &fakeSource{}
	store := &fakeStore{latest: map[indexes.Index]time.Time{
		indexes.TR: time.Date(2026, time.September, 30, 0, 0, 0, 0, time.UTC),
		// The Selic target in force up to the next Copom meeting, stored by an earlier refresh.
		indexes.SelicTarget: time.Date(2026, time.November, 4, 0, 0, 0, 0, time.UTC),
		indexes.IPCANumber:  time.Date(2026, time.August, 1, 0, 0, 0, 0, time.UTC),
	}}
	now := time.Date(2026, time.October, 25, 12, 0, 0, 0, time.UTC)

	require.NoError(t, marketdata.New(sources(source, &fakeQuoteSource{}), store, &fakeQuoteStore{}).Refresh(t.Context(), now))

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
		// The IPCA index numbers, SIDRA variable 2266.
		{series: 2266, from: time.Date(2026, time.August, 1, 0, 0, 0, 0, time.UTC), to: to},
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

	require.Error(t, marketdata.New(sources(source, &fakeQuoteSource{}), store, &fakeQuoteStore{}).Refresh(t.Context(), now))

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

	job := marketdata.New(sources(&fakeSource{}, &fakeQuoteSource{}), store, &fakeQuoteStore{})

	status, err := job.Status(t.Context(), now)
	require.NoError(t, err)
	assert.Equal(t, []marketdata.IndexStatus{
		{Index: indexes.TR, State: marketdata.Fresh, RefreshedAt: now.Add(-48 * time.Hour)},
		{Index: indexes.PoupancaYield, State: marketdata.Stale, RefreshedAt: now.Add(-48*time.Hour - time.Second)},
		{Index: indexes.SelicTarget, State: marketdata.Failed, FailedAt: now.Add(-time.Minute)},
		{
			Index:       indexes.Selic,
			State:       marketdata.Failed,
			RefreshedAt: now.Add(-time.Hour),
			FailedAt:    now.Add(-time.Minute),
		},
		{Index: indexes.IPCA, State: marketdata.Missing},
		{Index: indexes.IPCANumber, State: marketdata.Missing},
	}, status.Indexes)
	assert.Equal(t, marketdata.Freshness{State: marketdata.Missing}, status.Quotes, "quotes never refreshed")
	assert.Equal(t, marketdata.Freshness{State: marketdata.Missing}, status.Focus, "expectations never refreshed")
	assert.True(t, status.Refreshing, "a new job has its first refresh pending")
}

func TestStatusTellsHowFreshTheFocusExpectationsAre(t *testing.T) {
	t.Parallel()

	now := time.Date(2026, time.October, 25, 12, 0, 0, 0, time.UTC)

	tests := []struct {
		name  string
		times indexes.ExpectationsRefreshTimes
		want  marketdata.Freshness
	}{
		{
			name:  "refreshed within the stale limit",
			times: indexes.ExpectationsRefreshTimes{RefreshedAt: now.Add(-marketdata.StaleAfter)},
			want:  marketdata.Freshness{State: marketdata.Fresh, RefreshedAt: now.Add(-marketdata.StaleAfter)},
		},
		{
			name:  "refreshed before the stale limit",
			times: indexes.ExpectationsRefreshTimes{RefreshedAt: now.Add(-marketdata.StaleAfter - time.Second)},
			want: marketdata.Freshness{
				State:       marketdata.Stale,
				RefreshedAt: now.Add(-marketdata.StaleAfter - time.Second),
			},
		},
		{
			name: "latest refresh failed",
			times: indexes.ExpectationsRefreshTimes{
				RefreshedAt: now.Add(-time.Hour),
				FailedAt:    now.Add(-time.Minute),
			},
			want: marketdata.Freshness{
				State:       marketdata.Failed,
				RefreshedAt: now.Add(-time.Hour),
				FailedAt:    now.Add(-time.Minute),
			},
		},
		{
			name: "never refreshed",
			want: marketdata.Freshness{State: marketdata.Missing},
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			t.Parallel()

			job := marketdata.New(sources(&fakeSource{}, &fakeQuoteSource{}),
				&fakeStore{expectationTimes: tt.times}, &fakeQuoteStore{})

			status, err := job.Status(t.Context(), now)
			require.NoError(t, err)
			assert.Equal(t, tt.want, status.Focus)
		})
	}
}

func TestRunRefreshesAtStartEveryIntervalAndWhenTriggered(t *testing.T) {
	t.Parallel()

	synctest.Test(t, func(t *testing.T) {
		source := &fakeSource{}
		job := marketdata.New(sources(source, &fakeQuoteSource{}), &fakeStore{}, &fakeQuoteStore{}, marketdata.WithInterval(time.Hour))
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
		job := marketdata.New(sources(source, &fakeQuoteSource{}), &fakeStore{}, &fakeQuoteStore{})
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
		job := marketdata.New(sources(source, &fakeQuoteSource{}), &fakeStore{}, &fakeQuoteStore{}, marketdata.WithLogger(logger))

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
		quoteStore := &fakeQuoteStore{}
		block := make(chan struct{})
		src := sources(&fakeSource{block: block}, &fakeQuoteSource{block: block})
		src.Focus = &fakeFocus{block: block}
		job := marketdata.New(src, store, quoteStore,
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

		assert.Empty(t, store.savedFailures(), "no index failure recorded")
		assert.Empty(t, store.savedExpectationFailures(), "no expectations failure recorded")
		assert.Zero(t, quoteStore.savedFailures(), "no quote failure recorded")
		assert.Empty(t, logs.String(), "nothing logged")
	})
}

func TestRefreshStoresTheFocusExpectationsItAskedForNow(t *testing.T) {
	t.Parallel()

	november := time.Date(2026, time.November, 1, 0, 0, 0, 0, time.UTC)
	december := time.Date(2026, time.December, 1, 0, 0, 0, 0, time.UTC)
	focusSource := &fakeFocus{
		meetings: []focus.Meeting{
			{Year: 2026, Number: 8, Median: mustDecimal(t, "14.25")},
			{Year: 2027, Number: 1, Median: mustDecimal(t, "13.5")},
		},
		months: []focus.Month{
			{Month: november, Median: mustDecimal(t, "0.34")},
			{Month: december, Median: mustDecimal(t, "0.52")},
		},
		years: []focus.Year{
			{Year: 2026, Median: mustDecimal(t, "4.8")},
			{Year: 2027, Median: mustDecimal(t, "4.1")},
		},
	}
	src := sources(&fakeSource{}, &fakeQuoteSource{})
	src.Focus = focusSource
	store := &fakeStore{}
	now := time.Date(2026, time.October, 25, 12, 0, 0, 0, time.UTC)

	require.NoError(t, marketdata.New(src, store, &fakeQuoteStore{}).Refresh(t.Context(), now))

	assert.Equal(t, []savedExpectations{{
		at: now,
		expectations: indexes.Expectations{
			Selic: []indexes.MeetingMedian{
				{Year: 2026, Number: 8, Median: mustDecimal(t, "14.25")},
				{Year: 2027, Number: 1, Median: mustDecimal(t, "13.5")},
			},
			MonthlyIPCA: []indexes.MonthMedian{
				{Month: november, Median: mustDecimal(t, "0.34")},
				{Month: december, Median: mustDecimal(t, "0.52")},
			},
			AnnualIPCA: []indexes.YearMedian{
				{Year: 2026, Median: mustDecimal(t, "4.8")},
				{Year: 2027, Median: mustDecimal(t, "4.1")},
			},
		},
	}}, store.savedExpectations())
	assert.Empty(t, store.savedExpectationFailures())
	assert.Equal(t, map[string]time.Time{"Selic": now, "MonthlyIPCA": now, "AnnualIPCA": now}, focusSource.askedFor())
}

func TestAFailedFocusFetchRecordsAFailureAndStoresNothing(t *testing.T) {
	t.Parallel()

	for _, method := range []string{"Selic", "MonthlyIPCA", "AnnualIPCA"} {
		t.Run(method, func(t *testing.T) {
			t.Parallel()

			focusErr := errors.New("focus: status 502")
			src := sources(&fakeSource{}, &fakeQuoteSource{})
			src.Focus = &fakeFocus{errs: map[string]error{method: focusErr}}
			store := &fakeStore{}
			now := time.Date(2026, time.October, 25, 12, 0, 0, 0, time.UTC)

			err := marketdata.New(src, store, &fakeQuoteStore{}).Refresh(t.Context(), now)

			require.ErrorIs(t, err, focusErr)
			require.ErrorContains(t, err, "marketdata: refresh focus expectations: focus: status 502")
			assert.Empty(t, store.savedExpectations(), "the stored expectations stay")
			assert.Equal(t, []time.Time{now}, store.savedExpectationFailures())
		})
	}
}

func mustDecimal(t *testing.T, s string) decimal.Decimal {
	t.Helper()

	d, err := decimal.Parse(s)
	require.NoError(t, err)

	return d
}
