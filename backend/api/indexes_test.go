package api_test

import (
	"errors"
	"net/http"
	"testing"
	"time"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"github.com/gringolito/debtwise/backend/marketdata/sgs"
)

// The period that starts on March 1, 2024, and its TR.
const (
	marchStart = "2024-03-01"
	marchTR    = "0.0331"
)

// trRows are series 226 rows as SGS publishes them: the period that starts on March 1 appears
// once for each period end.
func trRows() []sgs.Observation {
	return []sgs.Observation{
		{Start: date(2024, time.February, 29), End: date(2024, time.March, 29), Value: mustDecimal("0.0620")},
		{Start: date(2024, time.March, 1), End: date(2024, time.March, 30), Value: mustDecimal(marchTR)},
		{Start: date(2024, time.March, 1), End: date(2024, time.March, 31), Value: mustDecimal(marchTR)},
		{Start: date(2024, time.March, 1), End: date(2024, time.April, 1), Value: mustDecimal(marchTR)},
	}
}

func wantTR() []indexValue {
	return []indexValue{
		{PeriodStart: "2024-02-29", PeriodEnd: "2024-03-29", Value: "0.0620"},
		{PeriodStart: marchStart, PeriodEnd: "2024-03-30", Value: marchTR},
		{PeriodStart: marchStart, PeriodEnd: "2024-03-31", Value: marchTR},
		{PeriodStart: marchStart, PeriodEnd: "2024-04-01", Value: marchTR},
	}
}

// withoutFetchTimes checks every value was fetched within [from, to] and returns the values
// with their fetch time cleared, to compare them with literals.
func withoutFetchTimes(t *testing.T, values []indexValue, from, to time.Time) []indexValue {
	t.Helper()

	cleared := make([]indexValue, 0, len(values))
	for _, v := range values {
		assert.WithinRange(t, v.FetchedAt, from.Truncate(time.Second), to, "fetched_at of %+v", v)
		v.FetchedAt = time.Time{}
		cleared = append(cleared, v)
	}

	return cleared
}

func TestRefreshStoresTheHistoryOfEveryIndex(t *testing.T) {
	t.Parallel()

	start := time.Now()
	s := newServer(t, sgsWithRows(map[int][]sgs.Observation{
		226: trRows(),
		432: {
			{Start: date(2026, time.October, 24), Value: mustDecimal("13.75")},
			{Start: date(2026, time.November, 4), Value: mustDecimal("13.75")},
		},
		433: {{Start: date(2026, time.August, 1), Value: mustDecimal("-0.32")}},
	}))

	tr := s.history(t, "tr")
	assert.Equal(t, "tr", tr.Index)
	assert.Equal(t, wantTR(), withoutFetchTimes(t, tr.Values, start, time.Now()))

	selicTarget := s.history(t, "selic_target")
	assert.Equal(t, "selic_target", selicTarget.Index)
	assert.Equal(t, []indexValue{
		{PeriodStart: "2026-10-24", PeriodEnd: "2026-10-24", Value: "13.75"},
		{PeriodStart: "2026-11-04", PeriodEnd: "2026-11-04", Value: "13.75"},
	}, withoutFetchTimes(t, selicTarget.Values, start, time.Now()))

	ipca := s.history(t, "ipca")
	assert.Equal(t, []indexValue{
		{PeriodStart: "2026-08-01", PeriodEnd: "2026-08-01", Value: "-0.32"},
	}, withoutFetchTimes(t, ipca.Values, start, time.Now()))

	for _, index := range []string{"poupanca_yield", "selic"} {
		assert.Equal(t, wantDefaultRow(), withoutFetchTimes(t, s.history(t, index).Values, start, time.Now()), index)
	}
}

func TestRefreshingAgainKeepsOneValuePerPeriod(t *testing.T) {
	t.Parallel()

	source := sgsWithRows(map[int][]sgs.Observation{
		226: trRows(),
		432: {{Start: date(2099, time.January, 1), Value: mustDecimal("13.75")}},
	})
	s := newServer(t, source)

	revised := trRows()
	revised[0].Value = mustDecimal("0.0625")
	source.answer(226, revised)

	secondRefresh := time.Now()

	s.refresh(t)

	want := wantTR()
	want[0].Value = "0.0625"
	assert.Equal(t, want, withoutFetchTimes(t, s.history(t, "tr").Values, secondRefresh, time.Now()),
		"a refetched period keeps one row, with the latest value and fetch time")

	assert.Equal(t, date(2024, time.March, 1), source.lastFrom(226),
		"the second refresh starts from the latest stored period")
	assert.WithinRange(t, source.lastFrom(432), secondRefresh, time.Now(),
		"and from today for an index whose latest stored period is in the future")
}

func TestRefreshThatFailsForOneIndexStoresTheOthers(t *testing.T) {
	t.Parallel()

	source := sgsWithRows(map[int][]sgs.Observation{226: trRows()})
	// The default row for 432 comes back with the error, as rows fetched before a failing window do.
	source.fail(432, errors.New("sgs: series 432: status 502"))

	start := time.Now()
	s := newServer(t, source)
	firstRefreshDone := time.Now()

	assert.Equal(t, wantTR(), withoutFetchTimes(t, s.history(t, "tr").Values, start, firstRefreshDone))
	assert.Equal(t, wantDefaultRow(), withoutFetchTimes(t, s.history(t, "selic_target").Values, start, firstRefreshDone),
		"a failed index keeps what it fetched before the failure")

	status := s.status(t)
	assert.False(t, status.Refreshing)
	require.Len(t, status.Indexes, 5)

	for i, index := range []string{"tr", "poupanca_yield", "selic_target", "selic", "ipca"} {
		got := status.Indexes[i]
		assert.Equal(t, index, got.Index)

		if index == "selic_target" {
			assert.Equal(t, "failed", got.Status)
			assert.Nil(t, got.RefreshedAt, "selic_target never refreshed")
			require.NotNil(t, got.FailedAt)
			assert.WithinRange(t, *got.FailedAt, start.Truncate(time.Second), firstRefreshDone)

			continue
		}

		assert.Equal(t, "fresh", got.Status, index)
		assert.Nil(t, got.FailedAt, index)
		require.NotNil(t, got.RefreshedAt, index)
		assert.WithinRange(t, *got.RefreshedAt, start.Truncate(time.Second), firstRefreshDone, index)
	}

	source.answer(226, nil)
	source.fail(226, errors.New("sgs: series 226: status 406"))
	source.answer(432, []sgs.Observation{{Start: date(2026, time.October, 1), Value: mustDecimal("13.75")}})

	secondRefresh := time.Now()

	s.refresh(t)

	status = s.status(t)

	tr := status.Indexes[0]
	assert.Equal(t, "failed", tr.Status, "an index whose latest refresh failed")
	require.NotNil(t, tr.RefreshedAt)
	assert.WithinRange(t, *tr.RefreshedAt, start.Truncate(time.Second), firstRefreshDone,
		"keeps the time of its last successful refresh")
	require.NotNil(t, tr.FailedAt)
	assert.WithinRange(t, *tr.FailedAt, secondRefresh.Truncate(time.Second), time.Now())
	assert.Equal(t, wantTR(), withoutFetchTimes(t, s.history(t, "tr").Values, start, firstRefreshDone),
		"and keeps the values it had")

	selicTarget := status.Indexes[2]
	assert.Equal(t, "fresh", selicTarget.Status, "an index whose refresh succeeds after a failure")
	assert.Nil(t, selicTarget.FailedAt)
	require.NotNil(t, selicTarget.RefreshedAt)
	assert.WithinRange(t, *selicTarget.RefreshedAt, secondRefresh.Truncate(time.Second), time.Now())
}

func TestStatusWarnsWhenTheLastRefreshIsStale(t *testing.T) {
	t.Parallel()

	s := newServer(t, sgsWithRows(nil))

	require.NoError(t, s.job.Refresh(t.Context(), time.Now().Add(-25*time.Hour)))

	status := s.status(t)
	require.Len(t, status.Indexes, 5)

	for _, index := range status.Indexes {
		assert.Equal(t, "stale", index.Status, index.Index)
	}
}

func TestHistoryOfAnUnknownIndexIsRefused(t *testing.T) {
	t.Parallel()

	s := newServer(t, sgsWithRows(nil))

	rec := s.do(t, http.MethodGet, "/api/indexes/cdi/history")
	assert.Equal(t, http.StatusUnprocessableEntity, rec.Code, rec.Body.String())
}

func TestIndexOperationsFailWhenTheDatabaseDoesNotAnswer(t *testing.T) {
	t.Parallel()

	s := newServer(t, sgsWithRows(nil))
	require.NoError(t, s.conn.Close())

	tests := []struct {
		method string
		path   string
	}{
		{method: http.MethodGet, path: "/api/indexes/tr/history"},
		{method: http.MethodGet, path: "/api/market-data/status"},
		{method: http.MethodPost, path: "/api/market-data/refresh"},
	}

	for _, tt := range tests {
		t.Run(tt.method+" "+tt.path, func(t *testing.T) {
			t.Parallel()

			rec := s.do(t, tt.method, tt.path)
			assert.Equal(t, http.StatusInternalServerError, rec.Code, rec.Body.String())
		})
	}
}
