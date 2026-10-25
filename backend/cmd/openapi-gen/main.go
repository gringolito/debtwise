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

	"github.com/gringolito/debtwise/backend/api"
)

const outputPath = "../docs/openapi.json"

// noDatabase stands in for the database, which serving the contract never reads.
type noDatabase struct{}

func (noDatabase) Ping(context.Context) (int64, error) { return 0, nil }

func main() {
	if err := run(); err != nil {
		_, _ = fmt.Fprintln(os.Stderr, "openapi-gen:", err)

		os.Exit(1)
	}
}

func run() error {
	req := httptest.NewRequestWithContext(context.Background(), http.MethodGet, "/api/openapi.json", nil)
	rec := httptest.NewRecorder()
	api.NewHandler(noDatabase{}).ServeHTTP(rec, req)

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
