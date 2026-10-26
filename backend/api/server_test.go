package api_test

import (
	"context"
	"database/sql"
	"encoding/json"
	"errors"
	"log/slog"
	"maps"
	"net/http"
	"net/http/httptest"
	"path/filepath"
	"sync"
	"testing"
	"time"

	"github.com/stretchr/testify/require"

	"github.com/gringolito/debtwise/backend/api"
	"github.com/gringolito/debtwise/backend/bonds"
	"github.com/gringolito/debtwise/backend/db"
	"github.com/gringolito/debtwise/backend/decimal"
	"github.com/gringolito/debtwise/backend/indexes"
	"github.com/gringolito/debtwise/backend/marketdata"
	"github.com/gringolito/debtwise/backend/marketdata/radar"
	"github.com/gringolito/debtwise/backend/marketdata/sgs"
	"github.com/gringolito/debtwise/backend/marketdata/sidra"
)

// fakeSGS stands in for SGS and SIDRA. It answers every request for a series, a SIDRA request
// under its variable as the series, with the rows it holds for it that start on or after the date
// the request starts from, as SGS does, and its error. It records each request's start.
type fakeSGS struct {
	mu       sync.Mutex
	rows     map[int][]sgs.Observation
	failures map[int]error
	from     map[int]time.Time
}

func (f *fakeSGS) Observations(_ context.Context, series int, from, _ time.Time) ([]sgs.Observation, error) {
	f.mu.Lock()
	defer f.mu.Unlock()

	f.from[series] = from
	day := date(from.Date())

	var rows []sgs.Observation

	for _, row := range f.rows[series] {
		if !row.Start.Before(day) {
			rows = append(rows, row)
		}
	}

	return rows, f.failures[series]
}

func (f *fakeSGS) MonthlyValues(ctx context.Context, _, variable int, from, to time.Time) ([]sidra.Value, error) {
	rows, err := f.Observations(ctx, variable, from, to)

	values := make([]sidra.Value, 0, len(rows))
	for _, r := range rows {
		values = append(values, sidra.Value{Month: r.Start, Value: r.Value})
	}

	return values, err
}

func (f *fakeSGS) fail(series int, err error) {
	f.mu.Lock()
	defer f.mu.Unlock()

	f.failures[series] = err
}

func (f *fakeSGS) answer(series int, rows []sgs.Observation) {
	f.mu.Lock()
	defer f.mu.Unlock()

	f.rows[series] = rows
	delete(f.failures, series)
}

// lastFrom returns the date the latest request for series started from.
func (f *fakeSGS) lastFrom(series int) time.Time {
	f.mu.Lock()
	defer f.mu.Unlock()

	return f.from[series]
}

// sgsWithRows answers one row for every series DebtWise reads, SIDRA's IPCA index numbers
// (variable 2266) among them, or the rows passed for the series they key.
func sgsWithRows(rows map[int][]sgs.Observation) *fakeSGS {
	f := &fakeSGS{rows: map[int][]sgs.Observation{}, failures: map[int]error{}, from: map[int]time.Time{}}
	for _, series := range []int{226, 195, 432, 11, 433, 2266} {
		f.rows[series] = []sgs.Observation{{Start: date(2026, time.September, 1), Value: mustDecimal("1.00")}}
	}

	maps.Copy(f.rows, rows)

	return f
}

// wantDefaultRow is the history the row sgsWithRows answers by default is stored as.
func wantDefaultRow() []indexValue {
	return []indexValue{{PeriodStart: "2026-09-01", PeriodEnd: "2026-09-01", Value: "1.00"}}
}

// fakeRadar lists names, or fails the list with listErr, and answers each bond it holds, or its
// failure. A bond it neither holds nor fails answers an error, so asking for it fails the refresh.
type fakeRadar struct {
	mu       sync.Mutex
	names    []string
	listErr  error
	bonds    map[string]radar.Bond
	failures map[string]error
}

func (f *fakeRadar) Names(context.Context) ([]string, error) {
	f.mu.Lock()
	defer f.mu.Unlock()

	return f.names, f.listErr
}

func (f *fakeRadar) Bond(_ context.Context, name string) (radar.Bond, error) {
	f.mu.Lock()
	defer f.mu.Unlock()

	if err := f.failures[name]; err != nil {
		return radar.Bond{}, err
	}

	b, ok := f.bonds[name]
	if !ok {
		return radar.Bond{}, errors.New("fakeRadar: unexpected request for " + name)
	}

	return b, nil
}

func (f *fakeRadar) fail(name string, err error) {
	f.mu.Lock()
	defer f.mu.Unlock()

	f.failures[name] = err
}

func (f *fakeRadar) list(names []string) {
	f.mu.Lock()
	defer f.mu.Unlock()

	f.names = names
}

func (f *fakeRadar) failList(err error) {
	f.mu.Lock()
	defer f.mu.Unlock()

	f.listErr = err
}

func (f *fakeRadar) answer(b radar.Bond) {
	f.mu.Lock()
	defer f.mu.Unlock()

	f.bonds[b.Name] = b
}

// radarWithBonds lists names and holds bonds.
func radarWithBonds(names []string, bonds ...radar.Bond) *fakeRadar {
	f := &fakeRadar{names: names, bonds: map[string]radar.Bond{}, failures: map[string]error{}}
	for _, b := range bonds {
		f.bonds[b.Name] = b
	}

	return f
}

type server struct {
	handler http.Handler
	job     *marketdata.Job
	conn    *sql.DB
}

func openMigrated(t *testing.T) *sql.DB {
	t.Helper()

	conn, err := db.Open(t.Context(), filepath.Join(t.TempDir(), "debtwise.db"))
	require.NoError(t, err)

	t.Cleanup(func() { _ = conn.Close() })

	_, err = db.Migrate(t.Context(), conn)
	require.NoError(t, err)

	return conn
}

// newServer serves the API over a migrated database, with the market-data refresh job running
// against indexSource, for SGS and SIDRA, and quoteSource until the test ends. It returns once the
// job's first refresh is over.
func newServer(t *testing.T, indexSource *fakeSGS, quoteSource marketdata.QuoteSource) server {
	t.Helper()

	conn := openMigrated(t)
	store := indexes.NewStore(conn)
	quotes := bonds.NewStore(conn)
	logger := slog.New(slog.DiscardHandler)
	sources := marketdata.Sources{SGS: indexSource, SIDRA: indexSource, Radar: quoteSource}
	job := marketdata.New(sources, store, quotes, marketdata.WithLogger(logger))

	ctx, cancel := context.WithCancel(context.Background())
	done := make(chan struct{})

	go func() {
		defer close(done)

		job.Run(ctx)
	}()

	t.Cleanup(func() {
		cancel()
		<-done
	})

	s := server{
		handler: api.NewHandler(api.Services{
			Database:   db.New(conn),
			Indexes:    store,
			MarketData: job,
			Quotes:     quotes,
		}, api.WithLogger(logger)),
		job:  job,
		conn: conn,
	}
	s.waitForRefresh(t)

	return s
}

func (s server) do(t *testing.T, method, path string) *httptest.ResponseRecorder {
	t.Helper()

	rec := httptest.NewRecorder()
	s.handler.ServeHTTP(rec, httptest.NewRequestWithContext(t.Context(), method, path, nil))

	return rec
}

type freshness struct {
	Status      string     `json:"status"`
	RefreshedAt *time.Time `json:"refreshed_at"`
	FailedAt    *time.Time `json:"failed_at"`
}

type indexStatus struct {
	Index string `json:"index"`
	freshness
}

type marketDataStatus struct {
	Refreshing bool          `json:"refreshing"`
	Indexes    []indexStatus `json:"indexes"`
	Bonds      freshness     `json:"bonds"`
}

func (s server) status(t *testing.T) marketDataStatus {
	t.Helper()

	rec := s.do(t, http.MethodGet, "/api/market-data/status")
	require.Equal(t, http.StatusOK, rec.Code, rec.Body.String())

	var status marketDataStatus
	require.NoError(t, json.Unmarshal(rec.Body.Bytes(), &status))

	return status
}

// refresh asks for a market-data refresh, checks the answer says it is refreshing, and waits for
// the refresh to finish.
func (s server) refresh(t *testing.T) {
	t.Helper()

	rec := s.do(t, http.MethodPost, "/api/market-data/refresh")
	require.Equal(t, http.StatusAccepted, rec.Code, rec.Body.String())

	var started marketDataStatus
	require.NoError(t, json.Unmarshal(rec.Body.Bytes(), &started))
	require.True(t, started.Refreshing, "the answer to a refresh says it is refreshing")

	s.waitForRefresh(t)
}

func (s server) waitForRefresh(t *testing.T) {
	t.Helper()

	require.Eventually(t, func() bool { return !s.status(t).Refreshing }, 5*time.Second, 5*time.Millisecond)
}

type indexValue struct {
	PeriodStart string    `json:"period_start"`
	PeriodEnd   string    `json:"period_end"`
	Value       string    `json:"value"`
	FetchedAt   time.Time `json:"fetched_at"`
}

type indexHistory struct {
	Index  string       `json:"index"`
	Values []indexValue `json:"values"`
}

func (s server) history(t *testing.T, index string) indexHistory {
	t.Helper()

	rec := s.do(t, http.MethodGet, "/api/indexes/"+index+"/history")
	require.Equal(t, http.StatusOK, rec.Code, rec.Body.String())

	var history indexHistory
	require.NoError(t, json.Unmarshal(rec.Body.Bytes(), &history))

	return history
}

func date(year int, month time.Month, day int) time.Time {
	return time.Date(year, month, day, 0, 0, 0, 0, time.UTC)
}

func mustDecimal(s string) decimal.Decimal {
	d, err := decimal.Parse(s)
	if err != nil {
		panic(err)
	}

	return d
}

func mustDate(s string) time.Time {
	d, err := time.Parse(time.DateOnly, s)
	if err != nil {
		panic(err)
	}

	return d
}
