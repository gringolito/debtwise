package api_test

import (
	"context"
	"database/sql"
	"encoding/json"
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
	"github.com/gringolito/debtwise/backend/db"
	"github.com/gringolito/debtwise/backend/decimal"
	"github.com/gringolito/debtwise/backend/indexes"
	"github.com/gringolito/debtwise/backend/marketdata"
	"github.com/gringolito/debtwise/backend/marketdata/sgs"
)

// fakeSGS answers every request for a series with the rows it holds for it, or with its error.
type fakeSGS struct {
	mu       sync.Mutex
	rows     map[int][]sgs.Observation
	failures map[int]error
}

func (f *fakeSGS) Observations(_ context.Context, series int, _, _ time.Time) ([]sgs.Observation, error) {
	f.mu.Lock()
	defer f.mu.Unlock()

	if err := f.failures[series]; err != nil {
		return nil, err
	}

	return f.rows[series], nil
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
}

// sgsWithRows answers one row for every series DebtWise reads, or the rows passed for the
// series they key.
func sgsWithRows(rows map[int][]sgs.Observation) *fakeSGS {
	f := &fakeSGS{rows: map[int][]sgs.Observation{}, failures: map[int]error{}}
	for _, series := range []int{226, 195, 432, 11, 433} {
		f.rows[series] = []sgs.Observation{{Start: date(2026, time.September, 1), Value: mustDecimal("1.00")}}
	}

	maps.Copy(f.rows, rows)

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
// against source until the test ends. It returns once the job's first refresh is over.
func newServer(t *testing.T, source marketdata.Source) server {
	t.Helper()

	conn := openMigrated(t)
	store := indexes.NewStore(conn)
	logger := slog.New(slog.DiscardHandler)
	job := marketdata.New(source, store, marketdata.WithLogger(logger))

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

	s := server{handler: api.NewHandler(db.New(conn), store, job, api.WithLogger(logger)), job: job, conn: conn}
	s.waitForRefresh(t)

	return s
}

func (s server) do(t *testing.T, method, path string) *httptest.ResponseRecorder {
	t.Helper()

	rec := httptest.NewRecorder()
	s.handler.ServeHTTP(rec, httptest.NewRequestWithContext(t.Context(), method, path, nil))

	return rec
}

type indexStatus struct {
	Index       string     `json:"index"`
	Status      string     `json:"status"`
	RefreshedAt *time.Time `json:"refreshed_at"`
	FailedAt    *time.Time `json:"failed_at"`
}

type marketDataStatus struct {
	Refreshing bool          `json:"refreshing"`
	Indexes    []indexStatus `json:"indexes"`
}

func (s server) status(t *testing.T) marketDataStatus {
	t.Helper()

	rec := s.do(t, http.MethodGet, "/api/market-data/status")
	require.Equal(t, http.StatusOK, rec.Code, rec.Body.String())

	var status marketDataStatus
	require.NoError(t, json.Unmarshal(rec.Body.Bytes(), &status))

	return status
}

// refresh asks for a market-data refresh and waits for it to finish.
func (s server) refresh(t *testing.T) {
	t.Helper()

	rec := s.do(t, http.MethodPost, "/api/market-data/refresh")
	require.Equal(t, http.StatusAccepted, rec.Code, rec.Body.String())

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
