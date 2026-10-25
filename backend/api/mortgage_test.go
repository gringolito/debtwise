package api_test

import (
	"encoding/json"
	"log/slog"
	"net/http"
	"net/http/httptest"
	"path/filepath"
	"strings"
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"github.com/gringolito/debtwise/backend/api"
	"github.com/gringolito/debtwise/backend/db"
	"github.com/gringolito/debtwise/backend/mortgage"
)

// newAPI serves the API over a fresh, migrated database.
func newAPI(t *testing.T) http.Handler {
	t.Helper()

	conn, err := db.Open(t.Context(), filepath.Join(t.TempDir(), "debtwise.db"))
	require.NoError(t, err)

	t.Cleanup(func() { _ = conn.Close() })

	_, err = db.Migrate(t.Context(), conn)
	require.NoError(t, err)

	return api.NewHandler(db.New(conn), nil, nil, mortgage.NewStore(conn))
}

// closedAPI serves the API over a database that no longer answers.
func closedAPI(t *testing.T, opts ...api.Option) http.Handler {
	t.Helper()

	conn, err := db.Open(t.Context(), filepath.Join(t.TempDir(), "debtwise.db"))
	require.NoError(t, err)
	require.NoError(t, conn.Close())

	return api.NewHandler(db.New(conn), nil, nil, mortgage.NewStore(conn), opts...)
}

func serve(t *testing.T, handler http.Handler, method, path, body string) *httptest.ResponseRecorder {
	t.Helper()

	req := httptest.NewRequestWithContext(t.Context(), method, "/api"+path, strings.NewReader(body))
	if body != "" {
		req.Header.Set("Content-Type", "application/json")
	}

	rec := httptest.NewRecorder()
	handler.ServeHTTP(rec, req)

	return rec
}

// sacMortgage lends 60,000.00 over 6 months under SAC at 12% a year nominal. MIP moves to a new age
// band on April 1.
const sacMortgage = `{
	"contract_date": "2023-12-10",
	"original_amount": "60000.00",
	"term_months": 6,
	"first_installment_date": "2024-01-10",
	"amortization_system": "sac",
	"appraisal_value": "100000.00",
	"contract_rates": [{"effective_from": "2023-12-10", "rate": "0.12", "basis": "nominal"}],
	"mip_rates": [
		{"effective_from": "2023-12-10", "rate": "0.0003"},
		{"effective_from": "2024-04-01", "rate": "0.0005"}
	],
	"dfi_rates": [{"effective_from": "2023-12-10", "rate": "0.0001"}],
	"fees": [{"effective_from": "2023-12-10", "amount": "12.50"}]
}`

// sacMortgageRead is sacMortgage as the API answers it, with the effective rate derived.
const sacMortgageRead = `{
	"contract_date": "2023-12-10",
	"original_amount": "60000.00",
	"term_months": 6,
	"first_installment_date": "2024-01-10",
	"amortization_system": "sac",
	"appraisal_value": "100000.00",
	"contract_rates": [{
		"effective_from": "2023-12-10",
		"basis": "nominal",
		"nominal": "0.12",
		"effective": "0.126825030131969720661201"
	}],
	"mip_rates": [
		{"effective_from": "2023-12-10", "rate": "0.0003"},
		{"effective_from": "2024-04-01", "rate": "0.0005"}
	],
	"dfi_rates": [{"effective_from": "2023-12-10", "rate": "0.0001"}],
	"fees": [{"effective_from": "2023-12-10", "amount": "12.50"}]
}`

func TestMortgageIsRegisteredAndReadBack(t *testing.T) {
	t.Parallel()

	handler := newAPI(t)

	saved := serve(t, handler, http.MethodPut, "/mortgage", sacMortgage)
	require.Equal(t, http.StatusOK, saved.Code, saved.Body.String())
	assert.JSONEq(t, sacMortgageRead, saved.Body.String())

	read := serve(t, handler, http.MethodGet, "/mortgage", "")
	require.Equal(t, http.StatusOK, read.Code, read.Body.String())
	assert.JSONEq(t, sacMortgageRead, read.Body.String())
}

func TestMortgageScheduleIsServed(t *testing.T) {
	t.Parallel()

	handler := newAPI(t)
	require.Equal(t, http.StatusOK, serve(t, handler, http.MethodPut, "/mortgage", sacMortgage).Code)

	rec := serve(t, handler, http.MethodGet, "/mortgage/schedule", "")

	require.Equal(t, http.StatusOK, rec.Code, rec.Body.String())
	assert.JSONEq(t, `{"installments": [
		{"number": 1, "due_date": "2024-01-10", "interest": "600.00", "amortization": "10000.00",
		 "mip": "18.00", "dfi": "10.00", "fee": "12.50", "amount": "10640.50",
		 "outstanding_balance": "50000.00"},
		{"number": 2, "due_date": "2024-02-10", "interest": "500.00", "amortization": "10000.00",
		 "mip": "15.00", "dfi": "10.00", "fee": "12.50", "amount": "10537.50",
		 "outstanding_balance": "40000.00"},
		{"number": 3, "due_date": "2024-03-10", "interest": "400.00", "amortization": "10000.00",
		 "mip": "12.00", "dfi": "10.00", "fee": "12.50", "amount": "10434.50",
		 "outstanding_balance": "30000.00"},
		{"number": 4, "due_date": "2024-04-10", "interest": "300.00", "amortization": "10000.00",
		 "mip": "15.00", "dfi": "10.00", "fee": "12.50", "amount": "10337.50",
		 "outstanding_balance": "20000.00"},
		{"number": 5, "due_date": "2024-05-10", "interest": "200.00", "amortization": "10000.00",
		 "mip": "10.00", "dfi": "10.00", "fee": "12.50", "amount": "10232.50",
		 "outstanding_balance": "10000.00"},
		{"number": 6, "due_date": "2024-06-10", "interest": "100.00", "amortization": "10000.00",
		 "mip": "5.00", "dfi": "10.00", "fee": "12.50", "amount": "10127.50",
		 "outstanding_balance": "0.00"}
	]}`, rec.Body.String())
}

// Editing replaces the terms whole, rate and fee rows included.
func TestMortgageIsEdited(t *testing.T) {
	t.Parallel()

	handler := newAPI(t)
	require.Equal(t, http.StatusOK, serve(t, handler, http.MethodPut, "/mortgage", sacMortgage).Code)

	edited := serve(t, handler, http.MethodPut, "/mortgage", `{
		"contract_date": "2024-01-05",
		"original_amount": "250000.00",
		"term_months": 360,
		"first_installment_date": "2024-02-05",
		"amortization_system": "price",
		"appraisal_value": "320000.00",
		"contract_rates": [{"effective_from": "2024-01-05", "rate": "0.10", "basis": "effective"}],
		"mip_rates": [{"effective_from": "2024-01-05", "rate": "0.000258"}],
		"dfi_rates": [{"effective_from": "2024-01-05", "rate": "0.000071"}],
		"fees": [{"effective_from": "2024-01-05", "amount": "25.00"}]
	}`)
	require.Equal(t, http.StatusOK, edited.Code, edited.Body.String())

	read := serve(t, handler, http.MethodGet, "/mortgage", "")
	require.Equal(t, http.StatusOK, read.Code, read.Body.String())
	assert.JSONEq(t, `{
		"contract_date": "2024-01-05",
		"original_amount": "250000.00",
		"term_months": 360,
		"first_installment_date": "2024-02-05",
		"amortization_system": "price",
		"appraisal_value": "320000.00",
		"contract_rates": [{
			"effective_from": "2024-01-05",
			"basis": "effective",
			"nominal": "0.095689685146844892792382130678764",
			"effective": "0.10"
		}],
		"mip_rates": [{"effective_from": "2024-01-05", "rate": "0.000258"}],
		"dfi_rates": [{"effective_from": "2024-01-05", "rate": "0.000071"}],
		"fees": [{"effective_from": "2024-01-05", "amount": "25.00"}]
	}`, read.Body.String())
}

func TestMortgageIsDeleted(t *testing.T) {
	t.Parallel()

	handler := newAPI(t)
	require.Equal(t, http.StatusOK, serve(t, handler, http.MethodPut, "/mortgage", sacMortgage).Code)

	rec := serve(t, handler, http.MethodDelete, "/mortgage", "")
	require.Equal(t, http.StatusNoContent, rec.Code, rec.Body.String())

	assert.Equal(t, http.StatusNotFound, serve(t, handler, http.MethodGet, "/mortgage", "").Code)
}

// A deleted mortgage can be registered again from scratch.
func TestMortgageIsRegisteredAgainAfterItIsDeleted(t *testing.T) {
	t.Parallel()

	handler := newAPI(t)
	require.Equal(t, http.StatusOK, serve(t, handler, http.MethodPut, "/mortgage", sacMortgage).Code)
	require.Equal(t, http.StatusNoContent, serve(t, handler, http.MethodDelete, "/mortgage", "").Code)
	require.Equal(t, http.StatusOK, serve(t, handler, http.MethodPut, "/mortgage", sacMortgage).Code)

	read := serve(t, handler, http.MethodGet, "/mortgage", "")
	require.Equal(t, http.StatusOK, read.Code, read.Body.String())
	assert.JSONEq(t, sacMortgageRead, read.Body.String())
}

func TestMortgageNotRegistered(t *testing.T) {
	t.Parallel()

	tests := []struct {
		name   string
		method string
		path   string
	}{
		{name: "read", method: http.MethodGet, path: "/mortgage"},
		{name: "schedule", method: http.MethodGet, path: "/mortgage/schedule"},
		{name: "delete", method: http.MethodDelete, path: "/mortgage"},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			t.Parallel()

			rec := serve(t, newAPI(t), tt.method, tt.path, "")

			require.Equal(t, http.StatusNotFound, rec.Code, rec.Body.String())

			var problem struct {
				Detail string `json:"detail"`
			}
			require.NoError(t, json.Unmarshal(rec.Body.Bytes(), &problem))
			assert.Equal(t, "no mortgage is registered", problem.Detail)
		})
	}
}

type errorDetail struct {
	Location string `json:"location"`
	Message  string `json:"message"`
}

// withField returns sacMortgage with one field replaced by raw JSON.
func withField(t *testing.T, field, raw string) string {
	t.Helper()

	var body map[string]json.RawMessage
	require.NoError(t, json.Unmarshal([]byte(sacMortgage), &body))

	body[field] = json.RawMessage(raw)

	out, err := json.Marshal(body)
	require.NoError(t, err)

	return string(out)
}

func TestInvalidMortgageIsRejected(t *testing.T) {
	t.Parallel()

	const (
		moneyPattern = `expected string to match pattern ^(0|[1-9][0-9]{0,14})(\.[0-9]{1,2})?$`
		ratePattern  = `expected string to match pattern ^(0|[1-9][0-9]{0,2})(\.[0-9]{1,12})?$`
	)

	tests := []struct {
		name string
		body string
		want []errorDetail
	}{
		{
			name: "no months",
			body: withField(t, "term_months", "0"),
			want: []errorDetail{{"body.term_months", "expected number >= 1"}},
		},
		{
			name: "negative original amount",
			body: withField(t, "original_amount", `"-60000.00"`),
			want: []errorDetail{{"body.original_amount", moneyPattern}},
		},
		{
			name: "original amount over 15 digits",
			body: withField(t, "original_amount", `"1234567890123456"`),
			want: []errorDetail{{"body.original_amount", moneyPattern}},
		},
		{
			name: "original amount below a centavo",
			body: withField(t, "original_amount", `"60000.005"`),
			want: []errorDetail{{"body.original_amount", moneyPattern}},
		},
		{
			name: "contract rate over 12 places",
			body: withField(t, "contract_rates", `[{"effective_from": "2023-12-10", "rate": "0.1234567890123", "basis": "nominal"}]`),
			want: []errorDetail{{"body.contract_rates[0].rate", ratePattern}},
		},
		{
			name: "appraisal value below a centavo",
			body: withField(t, "appraisal_value", `"100000.001"`),
			want: []errorDetail{{"body.appraisal_value", moneyPattern}},
		},
		{
			name: "fee below a centavo",
			body: withField(t, "fees", `[{"effective_from": "2023-12-10", "amount": "12.505"}]`),
			want: []errorDetail{{"body.fees[0].amount", moneyPattern}},
		},
		{
			name: "MIP rate over 12 places",
			body: withField(t, "mip_rates", `[{"effective_from": "2023-12-10", "rate": "0.0003000000001"}]`),
			want: []errorDetail{{"body.mip_rates[0].rate", ratePattern}},
		},
		{
			name: "contract rate of 1000 times",
			body: withField(t, "contract_rates", `[{"effective_from": "2023-12-10", "rate": "1000", "basis": "nominal"}]`),
			want: []errorDetail{{"body.contract_rates[0].rate", ratePattern}},
		},
		{
			name: "term over 50 years",
			body: withField(t, "term_months", "601"),
			want: []errorDetail{{"body.term_months", "expected number <= 600"}},
		},
		{
			name: "contract date not a date",
			body: withField(t, "contract_date", `"10/12/2023"`),
			want: []errorDetail{{"body.contract_date", "expected string to be RFC 3339 date"}},
		},
		{
			name: "negative MIP rate",
			body: withField(t, "mip_rates", `[{"effective_from": "2023-12-10", "rate": "-0.0003"}]`),
			want: []errorDetail{{"body.mip_rates[0].rate", ratePattern}},
		},
		{
			name: "unknown rate basis",
			body: withField(t, "contract_rates", `[{"effective_from": "2023-12-10", "rate": "0.12", "basis": "annual"}]`),
			want: []errorDetail{{"body.contract_rates[0].basis", `expected value to be one of "nominal, effective"`}},
		},
		{
			name: "zero original amount",
			body: withField(t, "original_amount", `"0"`),
			want: []errorDetail{{"body.original_amount", "must be greater than zero"}},
		},
		{
			name: "negative appraisal value",
			body: withField(t, "appraisal_value", `"-1"`),
			want: []errorDetail{{"body.appraisal_value", moneyPattern}},
		},
		{
			name: "negative fee",
			body: withField(t, "fees", `[{"effective_from": "2023-12-10", "amount": "-10.00"}]`),
			want: []errorDetail{{"body.fees[0].amount", moneyPattern}},
		},
		{
			name: "negative contract rate",
			body: withField(t, "contract_rates", `[{"effective_from": "2023-12-10", "rate": "-0.12", "basis": "nominal"}]`),
			want: []errorDetail{{"body.contract_rates[0].rate", ratePattern}},
		},
		{
			name: "first installment before the contract date",
			body: withField(t, "contract_date", `"2024-01-11"`),
			want: []errorDetail{{"body.first_installment_date", "must not be before the contract date"}},
		},
		{
			name: "no fee in effect on the first installment",
			body: withField(t, "fees", `[{"effective_from": "2024-01-11", "amount": "10.00"}]`),
			want: []errorDetail{{"body.fees", "needs a row effective on or before the first installment date"}},
		},
		{
			name: "no contract rate",
			body: withField(t, "contract_rates", `[]`),
			want: []errorDetail{{"body.contract_rates", "needs a row effective on or before the first installment date"}},
		},
		{
			name: "two MIP rates on one date",
			body: withField(t, "mip_rates", `[
				{"effective_from": "2023-12-10", "rate": "0.0003"},
				{"effective_from": "2024-04-01", "rate": "0.0005"},
				{"effective_from": "2023-12-10", "rate": "0.0004"}
			]`),
			want: []errorDetail{{"body.mip_rates[2].effective_from", "repeats the date of another row"}},
		},
		{
			name: "unknown amortization system",
			body: withField(t, "amortization_system", `"sacre"`),
			want: []errorDetail{{"body.amortization_system", `expected value to be one of "sac, price"`}},
		},
		{
			name: "every broken rule at once",
			body: withField(t, "dfi_rates", `[
				{"effective_from": "2024-02-01", "rate": "0.0001"},
				{"effective_from": "2024-02-01", "rate": "0.0002"}
			]`),
			want: []errorDetail{
				{"body.dfi_rates", "needs a row effective on or before the first installment date"},
				{"body.dfi_rates[1].effective_from", "repeats the date of another row"},
			},
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			t.Parallel()

			handler := newAPI(t)

			rec := serve(t, handler, http.MethodPut, "/mortgage", tt.body)

			require.Equal(t, http.StatusUnprocessableEntity, rec.Code, rec.Body.String())
			assert.Equal(t, "application/problem+json", rec.Header().Get("Content-Type"))

			var problem struct {
				Errors []errorDetail `json:"errors"`
			}
			require.NoError(t, json.Unmarshal(rec.Body.Bytes(), &problem))
			assert.Equal(t, tt.want, problem.Errors)

			assert.Equal(t, http.StatusNotFound, serve(t, handler, http.MethodGet, "/mortgage", "").Code,
				"a rejected mortgage is not registered")
		})
	}
}

// The limits themselves are valid.
func TestMortgageOnTheLimitsIsAccepted(t *testing.T) {
	t.Parallel()

	tests := []struct {
		name  string
		field string
		raw   string
	}{
		{name: "first installment on the contract date", field: "first_installment_date", raw: `"2023-12-10"`},
		{name: "fee effective on the first installment date", field: "fees", raw: `[{"effective_from": "2024-01-10", "amount": "12.50"}]`},
		{name: "term of 50 years", field: "term_months", raw: "600"},
		{name: "original amount of 15 digits", field: "original_amount", raw: `"999999999999999.99"`},
		{name: "original amount of one place", field: "original_amount", raw: `"60000.5"`},
		{
			name:  "contract rate of 999 times",
			field: "contract_rates",
			raw:   `[{"effective_from": "2023-12-10", "rate": "999", "basis": "nominal"}]`,
		},
		{
			name:  "MIP rate of 12 places",
			field: "mip_rates",
			raw:   `[{"effective_from": "2023-12-10", "rate": "0.000300000001"}]`,
		},
		{
			name:  "contract rate of 12 places",
			field: "contract_rates",
			raw:   `[{"effective_from": "2023-12-10", "rate": "0.123456789012", "basis": "nominal"}]`,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			t.Parallel()

			rec := serve(t, newAPI(t), http.MethodPut, "/mortgage", withField(t, tt.field, tt.raw))

			assert.Equal(t, http.StatusOK, rec.Code, rec.Body.String())
		})
	}
}

// A database failure is a 500 that answers no detail of its cause, never a missing mortgage.
func TestMortgageFailsWhenTheDatabaseDoesNotAnswer(t *testing.T) {
	t.Parallel()

	tests := []struct {
		name   string
		method string
		path   string
		body   string
	}{
		{name: "read", method: http.MethodGet, path: "/mortgage"},
		{name: "save", method: http.MethodPut, path: "/mortgage", body: sacMortgage},
		{name: "delete", method: http.MethodDelete, path: "/mortgage"},
		{name: "schedule", method: http.MethodGet, path: "/mortgage/schedule"},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			t.Parallel()

			rec := serve(t, closedAPI(t, api.WithLogger(slog.New(slog.DiscardHandler))), tt.method, tt.path, tt.body)

			require.Equal(t, http.StatusInternalServerError, rec.Code, rec.Body.String())

			var problem struct {
				Detail string `json:"detail"`
			}
			require.NoError(t, json.Unmarshal(rec.Body.Bytes(), &problem))
			assert.Equal(t, "the server could not complete the request; report it with its request_id", problem.Detail)
		})
	}
}
