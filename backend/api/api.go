// Package api is DebtWise's JSON HTTP API and the OpenAPI contract that describes it.
package api

import (
	"context"
	"log/slog"
	"net/http"
	"slices"
	"time"

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
	now    func() time.Time
}

// WithLogger sets the logger failed requests are logged to. Nil uses slog.Default().
func WithLogger(l *slog.Logger) Option {
	return func(o *options) { o.logger = l }
}

// WithClock sets the clock the API reads today from: the day installments start being projected
// after, and the time the market data's freshness is judged at. Nil uses time.Now.
func WithClock(now func() time.Time) Option {
	return func(o *options) { o.now = now }
}

// Services are what the API's operations read and write. A caller sets only those its requests
// reach: an operation whose service is nil fails if it is called.
type Services struct {
	Database   Database
	Indexes    IndexStore
	Lots       Lots
	MarketData MarketData
	Mortgages  Mortgages
	Quotes     Quotes
}

// NewHandler serves the API under /api, and its OpenAPI contract at /api/openapi.json.
//
// Each failed operation is logged once with its request_id: a 5xx at Error with the cause its
// handler returned, a 4xx at Debug. A 4xx answers its problem detail; a 5xx answers only its
// status and request_id.
func NewHandler(services Services, opts ...Option) http.Handler {
	var o options
	for _, opt := range opts {
		opt(&o)
	}

	logger := o.logger
	if logger == nil {
		logger = slog.Default()
	}

	now := o.now
	if now == nil {
		now = time.Now
	}

	return newHandler(logger, func(humaAPI huma.API) {
		registerHealth(humaAPI, services.Database)
		registerIndexes(humaAPI, services.Indexes, services.MarketData, now)
		registerProjections(humaAPI, services.Indexes)
		registerBonds(humaAPI, services.Quotes)
		registerLots(humaAPI, services.Lots, services.Quotes, services.Indexes, now)
		registerMortgage(humaAPI, services.Mortgages, services.Indexes, now)
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
