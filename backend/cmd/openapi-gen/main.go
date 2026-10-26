// Command openapi-gen writes the API's OpenAPI contract to docs/openapi.json, from which
// `mise run generate:openapi` generates the frontend's TypeScript SDK. Run it from backend/.
package main

import (
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"net/http/httptest"
	"os"
	"time"

	"github.com/gringolito/debtwise/backend/api"
	"github.com/gringolito/debtwise/backend/bonds"
	"github.com/gringolito/debtwise/backend/indexes"
	"github.com/gringolito/debtwise/backend/marketdata"
	"github.com/gringolito/debtwise/backend/mortgage"
)

const outputPath = "../docs/openapi.json"

// unused stands in for the database and the domain packages, which serving the contract never
// reads.
type unused struct{}

func (unused) Ping(context.Context) (int64, error) { return 0, nil }

func (unused) History(context.Context, indexes.Index) ([]indexes.Value, error) { return nil, nil }

func (unused) Status(context.Context, time.Time) (marketdata.Status, error) {
	return marketdata.Status{}, nil
}

func (unused) Trigger() {}

func (unused) Find(context.Context) (mortgage.Terms, error) { return mortgage.Terms{}, nil }

func (unused) Save(context.Context, mortgage.Terms) (mortgage.Terms, error) {
	return mortgage.Terms{}, nil
}

func (unused) Delete(context.Context) error { return nil }

func (unused) Quotes(context.Context) ([]bonds.Quote, error) { return nil, nil }

func main() {
	if err := run(); err != nil {
		_, _ = fmt.Fprintln(os.Stderr, "openapi-gen:", err)

		os.Exit(1)
	}
}

func run() error {
	req := httptest.NewRequestWithContext(context.Background(), http.MethodGet, "/api/openapi.json", nil)
	rec := httptest.NewRecorder()
	api.NewHandler(unused{}, unused{}, unused{}, unused{}, unused{}).ServeHTTP(rec, req)

	if rec.Code != http.StatusOK {
		return fmt.Errorf("GET /api/openapi.json returned %d", rec.Code)
	}

	// Re-indented so the committed file diffs line by line.
	var contract any
	if err := json.Unmarshal(rec.Body.Bytes(), &contract); err != nil {
		return fmt.Errorf("parse contract: %w", err)
	}

	indented, err := json.MarshalIndent(contract, "", "  ")
	if err != nil {
		return fmt.Errorf("indent contract: %w", err)
	}

	if err := os.WriteFile(outputPath, append(indented, '\n'), 0o600); err != nil {
		return fmt.Errorf("write %s: %w", outputPath, err)
	}

	return nil
}
