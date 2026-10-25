package api

import (
	"context"
	"fmt"
	"net/http"

	"github.com/danielgtaylor/huma/v2"
)

type health struct {
	Status string `json:"status" enum:"ok" doc:"Always ok: the server is up and its database answers."`
}

type healthOutput struct {
	Body health
}

func registerHealth(humaAPI huma.API, database Database) {
	register(humaAPI, huma.Operation{
		OperationID: "health",
		Method:      http.MethodGet,
		Path:        "/health",
		Summary:     "Check server health",
		Description: "Reports whether the server is up and able to read its data.",
		Tags:        []string{"Health"},
	}, func(ctx context.Context, _ *struct{}) (*healthOutput, error) {
		if _, err := database.Ping(ctx); err != nil {
			return nil, fmt.Errorf("%w: %w", huma.Error503ServiceUnavailable("database is unavailable"), err)
		}

		out := &healthOutput{}
		out.Body.Status = "ok"

		return out, nil
	})
}
