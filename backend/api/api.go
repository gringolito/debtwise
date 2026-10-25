// Package api is DebtWise's JSON HTTP API and the OpenAPI contract that describes it.
package api

import (
	"context"
	"log/slog"
	"net/http"
	"slices"

	"github.com/danielgtaylor/huma/v2"
	"github.com/danielgtaylor/huma/v2/adapters/humago"
)

// Database is the subset of *db.Queries the API reads.
type Database interface {
	Ping(ctx context.Context) (int64, error)
}

type Option func(*options)

type options struct {
	logger *slog.Logger
}

// WithLogger sets the logger failed requests are logged to. Nil uses slog.Default().
func WithLogger(l *slog.Logger) Option {
	return func(o *options) { o.logger = l }
}

// NewHandler serves the API under /api, and its OpenAPI contract at /api/openapi.json.
//
// Each failed operation is logged once with its request_id: a 5xx at Error with the cause its
// handler returned, a 4xx at Debug. A 4xx answers its problem detail; a 5xx answers only its
// status and request_id.
func NewHandler(database Database, history IndexHistory, marketData MarketData, opts ...Option) http.Handler {
	var o options
	for _, opt := range opts {
		opt(&o)
	}

	logger := o.logger
	if logger == nil {
		logger = slog.Default()
	}

	return newHandler(logger, func(humaAPI huma.API) {
		registerHealth(humaAPI, database)
		registerIndexes(humaAPI, history, marketData)
	})
}

// newHandler builds the API and its failure boundary, then has registerOperations register the
// operations on it.
func newHandler(logger *slog.Logger, registerOperations func(huma.API)) http.Handler {
	cfg := huma.DefaultConfig("DebtWise API", "0.1.0")
	// No $schema links in responses, and no /schemas route for them to point at.
	cfg.SchemasPath = ""
	cfg.CreateHooks = nil
	cfg.Transformers = append(slices.Clip(cfg.Transformers), recordProblem, hideServerFailure)

	mux := http.NewServeMux()
	humaAPI := humago.NewWithPrefix(mux, "/api", cfg)
	humaAPI.UseMiddleware(failureLogger{logger: logger}.log)
	documentRequestID(humaAPI.OpenAPI().Components.Schemas)

	registerOperations(humaAPI)

	return withRequestID(mux)
}
