package api

import (
	"bytes"
	"context"
	"encoding/json"
	"log/slog"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/danielgtaylor/huma/v2"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

// The test registers its own operation, one that requires a query parameter, so the failure it
// checks doesn't depend on any domain's rules.
func TestClientFailureAnswersItsProblemAndIsLoggedAtDebug(t *testing.T) {
	t.Parallel()

	var logs bytes.Buffer

	logger := slog.New(slog.NewJSONHandler(&logs, &slog.HandlerOptions{Level: slog.LevelDebug}))
	handler := newHandler(logger, func(humaAPI huma.API) {
		register(humaAPI, huma.Operation{
			OperationID: "echo",
			Method:      http.MethodGet,
			Path:        "/echo",
		}, func(context.Context, *struct {
			Word string `query:"word" required:"true"`
		},
		) (*struct{}, error) {
			return &struct{}{}, nil
		})
	})

	rec := httptest.NewRecorder()
	handler.ServeHTTP(rec, httptest.NewRequestWithContext(t.Context(), http.MethodGet, "/api/echo", nil))

	require.Equal(t, http.StatusUnprocessableEntity, rec.Code)

	var problem struct {
		Detail    string `json:"detail"`
		RequestID string `json:"request_id"`
		Errors    []struct {
			Location string `json:"location"`
			Message  string `json:"message"`
		} `json:"errors"`
	}
	require.NoError(t, json.Unmarshal(rec.Body.Bytes(), &problem))
	assert.Equal(t, "validation failed", problem.Detail)
	assert.Empty(t, problem.RequestID, "only a 5xx answers its request_id")
	require.Len(t, problem.Errors, 1)
	assert.Equal(t, "query.word", problem.Errors[0].Location)
	assert.Equal(t, "required query parameter is missing", problem.Errors[0].Message)

	var entry struct {
		Level       string `json:"level"`
		Msg         string `json:"msg"`
		RequestID   string `json:"request_id"`
		OperationID string `json:"operation_id"`
		Status      int    `json:"status"`
		Detail      string `json:"detail"`
	}
	require.NoError(t, json.Unmarshal(logs.Bytes(), &entry), "exactly one log entry: %s", logs.String())
	assert.Equal(t, "DEBUG", entry.Level)
	assert.Equal(t, "request failed", entry.Msg)
	assert.NotEmpty(t, entry.RequestID)
	assert.Equal(t, "echo", entry.OperationID)
	assert.Equal(t, http.StatusUnprocessableEntity, entry.Status)
	assert.Equal(t, "validation failed", entry.Detail)
}
