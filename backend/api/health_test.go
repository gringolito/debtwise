package api_test

import (
	"bytes"
	"encoding/json"
	"log/slog"
	"net/http"
	"net/http/httptest"
	"path/filepath"
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"github.com/gringolito/debtwise/backend/api"
	"github.com/gringolito/debtwise/backend/db"
)

func openDatabase(t *testing.T) *db.Queries {
	t.Helper()

	conn, err := db.Open(t.Context(), filepath.Join(t.TempDir(), "debtwise.db"))
	require.NoError(t, err)

	t.Cleanup(func() { _ = conn.Close() })

	return db.New(conn)
}

// closedDatabase is a database that no longer answers.
func closedDatabase(t *testing.T) *db.Queries {
	t.Helper()

	conn, err := db.Open(t.Context(), filepath.Join(t.TempDir(), "debtwise.db"))
	require.NoError(t, err)
	require.NoError(t, conn.Close())

	return db.New(conn)
}

func TestHealthReportsOKWhileTheDatabaseAnswers(t *testing.T) {
	t.Parallel()

	handler := api.NewHandler(api.Services{Database: openDatabase(t)})

	rec := httptest.NewRecorder()
	handler.ServeHTTP(rec, httptest.NewRequestWithContext(t.Context(), http.MethodGet, "/api/health", nil))

	require.Equal(t, http.StatusOK, rec.Code)
	assert.JSONEq(t, `{"status":"ok"}`, rec.Body.String())
}

func TestHealthFailsWhenTheDatabaseDoesNotAnswer(t *testing.T) {
	t.Parallel()

	var logs bytes.Buffer

	logger := slog.New(slog.NewJSONHandler(&logs, &slog.HandlerOptions{Level: slog.LevelDebug}))
	handler := api.NewHandler(api.Services{Database: closedDatabase(t)}, api.WithLogger(logger))

	rec := httptest.NewRecorder()
	handler.ServeHTTP(rec, httptest.NewRequestWithContext(t.Context(), http.MethodGet, "/api/health", nil))

	require.Equal(t, http.StatusServiceUnavailable, rec.Code)

	var problem map[string]any
	require.NoError(t, json.Unmarshal(rec.Body.Bytes(), &problem))

	requestID, _ := problem["request_id"].(string)
	require.NotEmpty(t, requestID, "problem: %v", problem)
	assert.Equal(t, map[string]any{
		"title":      "Service Unavailable",
		"status":     float64(http.StatusServiceUnavailable),
		"detail":     "the server could not complete the request; report it with its request_id",
		"request_id": requestID,
	}, problem, "a 5xx answers no detail of its cause")

	var entry struct {
		Level       string `json:"level"`
		Msg         string `json:"msg"`
		RequestID   string `json:"request_id"`
		OperationID string `json:"operation_id"`
		Status      int    `json:"status"`
		Detail      string `json:"detail"`
		Err         string `json:"err"`
	}
	require.NoError(t, json.Unmarshal(logs.Bytes(), &entry), "exactly one log entry: %s", logs.String())
	assert.Equal(t, "ERROR", entry.Level)
	assert.Equal(t, "request failed", entry.Msg)
	assert.Equal(t, requestID, entry.RequestID)
	assert.Equal(t, "health", entry.OperationID)
	assert.Equal(t, http.StatusServiceUnavailable, entry.Status)
	assert.Equal(t, "database is unavailable", entry.Detail)
	assert.Contains(t, entry.Err, "database is closed")
}

func TestEveryRequestGetsItsOwnRequestID(t *testing.T) {
	t.Parallel()

	handler := api.NewHandler(api.Services{Database: closedDatabase(t)}, api.WithLogger(slog.New(slog.DiscardHandler)))

	requestIDs := make(map[string]bool)

	for range 2 {
		req := httptest.NewRequestWithContext(t.Context(), http.MethodGet, "/api/health", nil)
		req.Header.Set("X-Request-Id", "chosen-by-the-client")

		rec := httptest.NewRecorder()
		handler.ServeHTTP(rec, req)

		var problem struct {
			RequestID string `json:"request_id"`
		}
		require.NoError(t, json.Unmarshal(rec.Body.Bytes(), &problem))
		requestIDs[problem.RequestID] = true
	}

	assert.Len(t, requestIDs, 2)
	assert.NotContains(t, requestIDs, "chosen-by-the-client")
	assert.NotContains(t, requestIDs, "")
}

func TestOpenAPIContractIsServed(t *testing.T) {
	t.Parallel()

	handler := api.NewHandler(api.Services{Database: openDatabase(t)})

	rec := httptest.NewRecorder()
	handler.ServeHTTP(rec, httptest.NewRequestWithContext(t.Context(), http.MethodGet, "/api/openapi.json", nil))

	require.Equal(t, http.StatusOK, rec.Code)

	var contract struct {
		Paths map[string]map[string]struct {
			OperationID string `json:"operationId"`
		} `json:"paths"`
	}
	require.NoError(t, json.Unmarshal(rec.Body.Bytes(), &contract))

	const get = "get"

	assert.Equal(t, map[string]map[string]struct {
		OperationID string `json:"operationId"`
	}{
		"/bonds":                             {get: {OperationID: "list-bonds"}},
		"/decisions":                         {"post": {OperationID: "decide"}},
		"/health":                            {get: {OperationID: "health"}},
		"/indexes/{index}/history":           {get: {OperationID: "index-history"}},
		"/indexes/projection-methods":        {get: {OperationID: "projection-methods"}},
		"/indexes/{index}/projection":        {get: {OperationID: "index-projection"}},
		"/indexes/{index}/projection-method": {"put": {OperationID: "save-projection-method"}},
		"/lots":                              {get: {OperationID: "list-lots"}, "post": {OperationID: "add-lot"}},
		"/lots/{id}":                         {"put": {OperationID: "edit-lot"}, "delete": {OperationID: "delete-lot"}},
		"/market-data/status":                {get: {OperationID: "market-data-status"}},
		"/market-data/refresh":               {"post": {OperationID: "refresh-market-data"}},
		"/mortgage": {
			get:      {OperationID: "read-mortgage"},
			"put":    {OperationID: "save-mortgage"},
			"delete": {OperationID: "delete-mortgage"},
		},
		"/mortgage/schedule": {get: {OperationID: "read-mortgage-schedule"}},
		"/mortgage/prepayments": {
			get:    {OperationID: "list-prepayments"},
			"post": {OperationID: "add-prepayment"},
		},
		"/mortgage/prepayments/{id}": {
			"put":    {OperationID: "edit-prepayment"},
			"delete": {OperationID: "delete-prepayment"},
		},
		"/mortgage/statements": {
			get:    {OperationID: "list-statements"},
			"post": {OperationID: "add-statement"},
		},
		"/mortgage/statements/{id}": {
			"put":    {OperationID: "edit-statement"},
			"delete": {OperationID: "delete-statement"},
		},
	}, contract.Paths)
}
