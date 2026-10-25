package api

import (
	"context"
	"crypto/rand"
	"log/slog"
	"net/http"
	"reflect"

	"github.com/danielgtaylor/huma/v2"
)

type requestIDKey struct{}

// withRequestID gives every request an ID of its own. An inbound X-Request-Id is ignored: no
// trusted proxy in front of the server sets one.
func withRequestID(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		next.ServeHTTP(w, r.WithContext(context.WithValue(r.Context(), requestIDKey{}, rand.Text())))
	})
}

func requestID(ctx context.Context) string {
	id, _ := ctx.Value(requestIDKey{}).(string)

	return id
}

// register registers op on humaAPI as huma.Register does, and hands the error handler returns
// to the failure log.
//
// A handler returns the cause of a 5xx as it is: its text reaches the log and never the client.
// To answer a 5xx other than 500, wrap the cause in a huma.StatusError:
// fmt.Errorf("%w: %w", huma.Error503ServiceUnavailable("..."), cause).
func register[I, O any](humaAPI huma.API, op huma.Operation, handler func(context.Context, *I) (*O, error)) {
	huma.Register(humaAPI, op, func(ctx context.Context, input *I) (*O, error) {
		out, err := handler(ctx, input)
		if f, ok := ctx.Value(failureKey{}).(*failure); ok {
			f.err = err
		}

		return out, err
	})
}

type failureKey struct{}

type failure struct {
	err     error
	problem huma.StatusError
}

// recordProblem keeps the error response Huma renders, which a request that fails validation
// never hands to a handler.
func recordProblem(ctx huma.Context, _ string, v any) (any, error) {
	if f, ok := ctx.Context().Value(failureKey{}).(*failure); ok {
		if problem, ok := v.(huma.StatusError); ok {
			f.problem = problem
		}
	}

	return v, nil
}

// documentRequestID declares the request_id a 5xx answers on the ErrorModel schema every error
// response refers to, which forbids undeclared properties.
func documentRequestID(registry huma.Registry) {
	ref := registry.Schema(reflect.TypeFor[huma.ErrorModel](), true, "").Ref
	registry.SchemaFromRef(ref).Properties["request_id"] = &huma.Schema{
		Type:        huma.TypeString,
		Description: "The ID of a request that failed with a 5xx, to quote when reporting the failure.",
	}
}

// serverFailure is the body of every 5xx.
type serverFailure struct {
	Title     string `json:"title"`
	Status    int    `json:"status"`
	Detail    string `json:"detail"`
	RequestID string `json:"request_id,omitempty"`
}

// hideServerFailure replaces the problem detail of a 5xx, which can carry the handler's error
// text, after recordProblem has kept it for the log.
func hideServerFailure(ctx huma.Context, _ string, v any) (any, error) {
	problem, ok := v.(huma.StatusError)
	if !ok || problem.GetStatus() < http.StatusInternalServerError {
		return v, nil
	}

	return serverFailure{
		Title:     http.StatusText(problem.GetStatus()),
		Status:    problem.GetStatus(),
		Detail:    "the server could not complete the request; report it with its request_id",
		RequestID: requestID(ctx.Context()),
	}, nil
}

// failureLogger logs each failed operation once, after its response is written: a 5xx at Error
// with the error the handler returned, a 4xx at Debug.
type failureLogger struct {
	logger *slog.Logger
}

func (l failureLogger) log(ctx huma.Context, next func(huma.Context)) {
	f := &failure{}
	next(huma.WithValue(ctx, failureKey{}, f))

	status := ctx.Status()
	if status < http.StatusBadRequest {
		return
	}

	attrs := []any{
		"request_id", requestID(ctx.Context()),
		"operation_id", ctx.Operation().OperationID,
		"status", status,
	}
	if f.problem != nil {
		attrs = append(attrs, "detail", f.problem.Error())
	}

	if f.err != nil {
		attrs = append(attrs, "err", f.err.Error())
	}

	level := slog.LevelDebug
	if status >= http.StatusInternalServerError {
		level = slog.LevelError
	}

	l.logger.Log(ctx.Context(), level, "request failed", attrs...)
}
