package api_test

import (
	"database/sql"
	"encoding/json"
	"log/slog"
	"net/http"
	"net/http/httptest"
	"path/filepath"
	"strings"
	"testing"
	"time"

	"github.com/gringolito/debtwise/backend/decimal"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"github.com/gringolito/debtwise/backend/api"
	"github.com/gringolito/debtwise/backend/db"
	"github.com/gringolito/debtwise/backend/indexes"
	"github.com/gringolito/debtwise/backend/mortgage"
)

// migratedDatabase is a fresh database with every migration applied.
func migratedDatabase(t *testing.T) *sql.DB {
	t.Helper()

	conn, err := db.Open(t.Context(), filepath.Join(t.TempDir(), "debtwise.db"))
	require.NoError(t, err)

	t.Cleanup(func() { _ = conn.Close() })

	_, err = db.Migrate(t.Context(), conn)
	require.NoError(t, err)

	return conn
}

// newAPI serves the API over a fresh, migrated database.
func newAPI(t *testing.T) http.Handler {
	t.Helper()

	return apiOver(migratedDatabase(t))
}

func apiOver(conn *sql.DB) http.Handler {
	return api.NewHandler(mortgageServices(conn), api.WithLogger(slog.New(slog.DiscardHandler)))
}

func mortgageServices(conn *sql.DB) api.Services {
	return api.Services{Database: db.New(conn), Indexes: indexes.NewStore(conn), Mortgages: mortgage.NewStore(conn)}
}

// closedAPI serves the API over a database that no longer answers.
func closedAPI(t *testing.T, opts ...api.Option) http.Handler {
	t.Helper()

	conn, err := db.Open(t.Context(), filepath.Join(t.TempDir(), "debtwise.db"))
	require.NoError(t, err)
	require.NoError(t, conn.Close())

	return api.NewHandler(mortgageServices(conn), opts...)
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

// sacMortgage lends 60,000.00 over 6 months under SAC at 12% a year nominal, without an indexer.
// The contract is signed 30 days before the 1st installment, so that installment charges a full
// month's interest. MIP moves to a new age band on April 1.
const sacMortgage = `{
	"contract_date": "2023-12-11",
	"original_amount": "60000.00",
	"term_months": 6,
	"first_installment_date": "2024-01-10",
	"amortization_system": "sac",
	"indexer": "none",
	"appraisal_value": "100000.00",
	"contract_rates": [{"effective_from": "2023-12-11", "rate": "0.12", "basis": "nominal"}],
	"mip_rates": [
		{"effective_from": "2023-12-11", "rate": "0.0003"},
		{"effective_from": "2024-04-01", "rate": "0.0005"}
	],
	"dfi_rates": [{"effective_from": "2023-12-11", "rate": "0.0001"}],
	"fees": [{"effective_from": "2023-12-11", "amount": "12.50"}]
}`

// sacMortgageRead is sacMortgage as the API answers it, with the effective rate derived.
const sacMortgageRead = `{
	"contract_date": "2023-12-11",
	"original_amount": "60000.00",
	"term_months": 6,
	"first_installment_date": "2024-01-10",
	"amortization_system": "sac",
	"indexer": "none",
	"appraisal_value": "100000.00",
	"contract_rates": [{
		"effective_from": "2023-12-11",
		"basis": "nominal",
		"nominal": "0.12",
		"effective": "0.126825030131969720661201",
		"poupanca_additional": false
	}],
	"mip_rates": [
		{"effective_from": "2023-12-11", "rate": "0.0003"},
		{"effective_from": "2024-04-01", "rate": "0.0005"}
	],
	"dfi_rates": [{"effective_from": "2023-12-11", "rate": "0.0001"}],
	"fees": [{"effective_from": "2023-12-11", "amount": "12.50"}]
}`

// sacRate is the rate every installment of sacMortgage is charged at, as the schedule answers it.
const sacRate = `"rate": "0.126825030131969720661201", "rate_index_values": []`

// sacSchedule is the schedule of sacMortgage as the API answers it, worked out by hand: 10,000.00
// of amortization a month, interest on the balance of the month before, MIP stepping down with the
// balance and up on April 1.
const sacSchedule = `{"installments": [
	{"number": 1, "due_date": "2024-01-10", "correction": "0.00", "index_values": [], ` + sacRate + `, "interest": "600.00",
	 "amortization": "10000.00", "mip": "18.00", "dfi": "10.00", "fee": "12.50", "amount": "10640.50",
	 "prepaid": "0.00", "outstanding_balance": "50000.00"},
	{"number": 2, "due_date": "2024-02-10", "correction": "0.00", "index_values": [], ` + sacRate + `, "interest": "500.00",
	 "amortization": "10000.00", "mip": "15.00", "dfi": "10.00", "fee": "12.50", "amount": "10537.50",
	 "prepaid": "0.00", "outstanding_balance": "40000.00"},
	{"number": 3, "due_date": "2024-03-10", "correction": "0.00", "index_values": [], ` + sacRate + `, "interest": "400.00",
	 "amortization": "10000.00", "mip": "12.00", "dfi": "10.00", "fee": "12.50", "amount": "10434.50",
	 "prepaid": "0.00", "outstanding_balance": "30000.00"},
	{"number": 4, "due_date": "2024-04-10", "correction": "0.00", "index_values": [], ` + sacRate + `, "interest": "300.00",
	 "amortization": "10000.00", "mip": "15.00", "dfi": "10.00", "fee": "12.50", "amount": "10337.50",
	 "prepaid": "0.00", "outstanding_balance": "20000.00"},
	{"number": 5, "due_date": "2024-05-10", "correction": "0.00", "index_values": [], ` + sacRate + `, "interest": "200.00",
	 "amortization": "10000.00", "mip": "10.00", "dfi": "10.00", "fee": "12.50", "amount": "10232.50",
	 "prepaid": "0.00", "outstanding_balance": "10000.00"},
	{"number": 6, "due_date": "2024-06-10", "correction": "0.00", "index_values": [], ` + sacRate + `, "interest": "100.00",
	 "amortization": "10000.00", "mip": "5.00", "dfi": "10.00", "fee": "12.50", "amount": "10127.50",
	 "prepaid": "0.00", "outstanding_balance": "0.00"}
]}`

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
	assert.JSONEq(t, sacSchedule, rec.Body.String())
}

// Previewing answers the schedule the terms would give, without a registered mortgage and without
// registering one.
func TestMortgageSchedulePreviewIsServedWithoutRegistering(t *testing.T) {
	t.Parallel()

	handler := newAPI(t)

	rec := serve(t, handler, http.MethodPost, "/mortgage/schedule/preview", sacMortgage)

	require.Equal(t, http.StatusOK, rec.Code, rec.Body.String())
	assert.JSONEq(t, sacSchedule, rec.Body.String())

	assert.Equal(t, http.StatusNotFound, serve(t, handler, http.MethodGet, "/mortgage", "").Code,
		"a previewed mortgage is not registered")
}

// Previewing other terms leaves the registered mortgage, and its schedule, as they were.
func TestMortgageSchedulePreviewLeavesTheRegisteredMortgageAlone(t *testing.T) {
	t.Parallel()

	handler := newAPI(t)
	require.Equal(t, http.StatusOK, serve(t, handler, http.MethodPut, "/mortgage", sacMortgage).Code)

	preview := serve(t, handler, http.MethodPost, "/mortgage/schedule/preview", withField(t, "term_months", "1"))

	require.Equal(t, http.StatusOK, preview.Code, preview.Body.String())
	assert.JSONEq(t, `{"installments": [
		{"number": 1, "due_date": "2024-01-10", "correction": "0.00", "index_values": [], `+sacRate+`, "interest": "600.00",
		 "amortization": "60000.00", "mip": "18.00", "dfi": "10.00", "fee": "12.50", "amount": "60640.50",
		 "prepaid": "0.00", "outstanding_balance": "0.00"}
	]}`, preview.Body.String())

	read := serve(t, handler, http.MethodGet, "/mortgage", "")
	require.Equal(t, http.StatusOK, read.Code, read.Body.String())
	assert.JSONEq(t, sacMortgageRead, read.Body.String())

	schedule := serve(t, handler, http.MethodGet, "/mortgage/schedule", "")
	require.Equal(t, http.StatusOK, schedule.Code, schedule.Body.String())
	assert.JSONEq(t, sacSchedule, schedule.Body.String())
}

// Previewing rejects the terms the same way saving does, with the same locations.
func TestInvalidMortgageSchedulePreviewIsRejected(t *testing.T) {
	t.Parallel()

	const moneyPattern = `expected string to match pattern ^(0|[1-9][0-9]{0,14})(\.[0-9]{1,2})?$`

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
			name: "original amount below a centavo",
			body: withField(t, "original_amount", `"60000.005"`),
			want: []errorDetail{{"body.original_amount", moneyPattern}},
		},
		{
			name: "zero original amount",
			body: withField(t, "original_amount", `"0"`),
			want: []errorDetail{{"body.original_amount", "must be greater than zero"}},
		},
		{
			name: "first installment before the contract date",
			body: withField(t, "contract_date", `"2024-01-11"`),
			want: []errorDetail{{"body.first_installment_date", "must not be before the contract date"}},
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

			rec := serve(t, newAPI(t), http.MethodPost, "/mortgage/schedule/preview", tt.body)

			require.Equal(t, http.StatusUnprocessableEntity, rec.Code, rec.Body.String())
			assert.Equal(t, "application/problem+json", rec.Header().Get("Content-Type"))

			var problem struct {
				Errors []errorDetail `json:"errors"`
			}
			require.NoError(t, json.Unmarshal(rec.Body.Bytes(), &problem))
			assert.Equal(t, tt.want, problem.Errors)
		})
	}
}

// publishedValue is one value of an index as SGS published it.
func publishedValue(start, end, value string) indexes.Value {
	return indexes.Value{PeriodStart: mustDate(start), PeriodEnd: mustDate(end), Value: decimal.MustParse(value), FetchedAt: time.Now()}
}

// seedPublishedTR stores the TR of the months of sacMortgage signed on 2023-12-10, as SGS
// published it, except for the period starting on 2024-03-10, which is missing.
func seedPublishedTR(t *testing.T, conn *sql.DB) {
	t.Helper()

	require.NoError(t, indexes.NewStore(conn).SaveRefresh(t.Context(), indexes.TR, []indexes.Value{
		publishedValue("2023-12-10", "2024-01-10", "0.0539"),
		publishedValue("2024-01-10", "2024-02-10", "0.1250"),
		publishedValue("2024-02-10", "2024-03-10", "0.0000"),
		publishedValue("2024-04-10", "2024-05-10", "0.0836"),
		publishedValue("2024-05-10", "2024-06-10", "0.0488"),
	}, time.Now()))
}

// trSchedule is the schedule of the sacMortgage signed on 2023-12-10 with the TR as indexer, over
// the TR seedPublishedTR stores.
const trSchedule = `{"installments": [
	{"number": 1, "due_date": "2024-01-10", "correction": "32.34",
	 "index_values": [{"index": "tr", "status": "published", "value": "0.0539",
	                   "period_start": "2023-12-10", "period_end": "2024-01-10", "methods": []}], ` + sacRate + `,
	 "interest": "620.33", "amortization": "9985.38", "mip": "18.01", "dfi": "10.00", "fee": "12.50",
	 "amount": "10646.22", "prepaid": "0.00", "outstanding_balance": "50046.96"},
	{"number": 2, "due_date": "2024-02-10", "correction": "62.56",
	 "index_values": [{"index": "tr", "status": "published", "value": "0.1250",
	                   "period_start": "2024-01-10", "period_end": "2024-02-10", "methods": []}], ` + sacRate + `,
	 "interest": "501.10", "amortization": "10021.90", "mip": "15.03", "dfi": "10.01", "fee": "12.50",
	 "amount": "10560.54", "prepaid": "0.00", "outstanding_balance": "40087.62"},
	{"number": 3, "due_date": "2024-03-10", "correction": "0.00",
	 "index_values": [{"index": "tr", "status": "published", "value": "0.0000",
	                   "period_start": "2024-02-10", "period_end": "2024-03-10", "methods": []}], ` + sacRate + `,
	 "interest": "400.88", "amortization": "10021.91", "mip": "12.03", "dfi": "10.01", "fee": "12.50",
	 "amount": "10457.33", "prepaid": "0.00", "outstanding_balance": "30065.71"},
	{"number": 4, "due_date": "2024-04-10", "correction": "0.00",
	 "index_values": [{"index": "tr", "status": "missing", "period_start": "2024-03-10", "period_end": "2024-04-10",
	                   "methods": []}], ` + sacRate + `,
	 "interest": "300.66", "amortization": "10021.90", "mip": "15.03", "dfi": "10.01", "fee": "12.50",
	 "amount": "10360.10", "prepaid": "0.00", "outstanding_balance": "20043.81"},
	{"number": 5, "due_date": "2024-05-10", "correction": "16.76",
	 "index_values": [{"index": "tr", "status": "published", "value": "0.0836",
	                   "period_start": "2024-04-10", "period_end": "2024-05-10", "methods": []}], ` + sacRate + `,
	 "interest": "200.61", "amortization": "10030.29", "mip": "10.03", "dfi": "10.02", "fee": "12.50",
	 "amount": "10263.45", "prepaid": "0.00", "outstanding_balance": "10030.28"},
	{"number": 6, "due_date": "2024-06-10", "correction": "4.89",
	 "index_values": [{"index": "tr", "status": "published", "value": "0.0488",
	                   "period_start": "2024-05-10", "period_end": "2024-06-10", "methods": []}], ` + sacRate + `,
	 "interest": "100.35", "amortization": "10035.17", "mip": "5.02", "dfi": "10.03", "fee": "12.50",
	 "amount": "10163.07", "prepaid": "0.00", "outstanding_balance": "0.00"}
]}`

// Previewing reads the published index history the terms need, with no mortgage registered: the
// schedule is the one registering the same terms would give.
func TestMortgageSchedulePreviewIsCorrectedByPublishedValues(t *testing.T) {
	t.Parallel()

	conn := migratedDatabase(t)
	handler := apiOver(conn)
	seedPublishedTR(t, conn)

	rec := serve(t, handler, http.MethodPost, "/mortgage/schedule/preview",
		withFieldOf(t, signedOnDecember10(), "indexer", `"tr"`))

	require.Equal(t, http.StatusOK, rec.Code, rec.Body.String())
	assert.JSONEq(t, trSchedule, rec.Body.String())

	assert.Equal(t, http.StatusNotFound, serve(t, handler, http.MethodGet, "/mortgage", "").Code,
		"a previewed mortgage is not registered")
}

// The TR of each period is stored as SGS published it, except for the period starting on
// 2024-03-10, which is reported missing and leaves the 4th installment uncorrected. A TR of zero
// is published, not missing. Each installment's balance is updated by the TR of the month that
// ends on its due date, the 1st's from the contract date. The 100,000.00 appraisal value DFI is
// charged on is updated from the 2nd installment on, by the TR of the month that ends on each due
// date; the 1st leaves it as it is. Figures worked out independently with python's decimal from
// the published TR.
func TestIndexedMortgageScheduleIsCorrectedByPublishedValues(t *testing.T) {
	t.Parallel()

	conn := migratedDatabase(t)
	handler := apiOver(conn)

	seedPublishedTR(t, conn)

	saved := serve(t, handler, http.MethodPut, "/mortgage", withFieldOf(t, signedOnDecember10(), "indexer", `"tr"`))
	require.Equal(t, http.StatusOK, saved.Code, saved.Body.String())

	rec := serve(t, handler, http.MethodGet, "/mortgage/schedule", "")

	require.Equal(t, http.StatusOK, rec.Code, rec.Body.String())
	assert.JSONEq(t, trSchedule, rec.Body.String())
}

// A two-installment mortgage whose schedule reads the stored history of every index its terms
// need. Under TR each installment is updated by the TR of the month that ends on its due date; the
// IPCA's 1st installment is the one that is not corrected, so the correction that shows the read
// is the 2nd's. A rate of 3.89% effective plus the poupança yield's additional part reads the
// Selic target on the first day of the month that ends on each due date: at 11.75%, above 8.5%, the
// part is 0.5% a month and the rate 10.0578%, and TR alone updates the balance and, from the 2nd
// installment, the appraisal value DFI is charged on. Figures worked out independently with
// python's decimal.
func TestScheduleReadsTheIndexesItsTermsNeed(t *testing.T) {
	t.Parallel()

	tests := []struct {
		name    string
		indexer string
		rate    string
		history map[indexes.Index][]indexes.Value
		want    string
	}{
		{
			name:    "poupança-linked rate",
			indexer: "tr",
			rate:    `[{"effective_from": "2023-12-10", "rate": "0.0389", "basis": "effective", "poupanca_additional": true}]`,
			history: map[indexes.Index][]indexes.Value{
				indexes.TR: {
					publishedValue("2023-12-10", "2024-01-10", "0.0539"),
					publishedValue("2024-01-10", "2024-02-10", "0.1250"),
				},
				indexes.SelicTarget: {
					publishedValue("2023-12-10", "2023-12-10", "11.75"),
					publishedValue("2024-01-10", "2024-01-10", "11.75"),
				},
			},
			want: `{"number": 1, "due_date": "2024-01-10", "correction": "32.34",
				"index_values": [{"index": "tr", "status": "published", "value": "0.0539",
				                  "period_start": "2023-12-10", "period_end": "2024-01-10", "methods": []}],
				"rate": "0.1005778118644995687897076174316406",
				"rate_index_values": [{"index": "selic_target", "status": "published", "value": "11.75",
				                       "period_start": "2023-12-10", "period_end": "2023-12-10", "methods": []}],
				"interest": "497.40", "amortization": "30000.12", "mip": "18.01", "dfi": "10.00", "fee": "12.50",
				"amount": "30538.03", "prepaid": "0.00", "outstanding_balance": "30032.22"},
				{"number": 2, "due_date": "2024-02-10", "correction": "37.54",
				"index_values": [{"index": "tr", "status": "published", "value": "0.1250",
				                  "period_start": "2024-01-10", "period_end": "2024-02-10", "methods": []}],
				"rate": "0.1005778118644995687897076174316406",
				"rate_index_values": [{"index": "selic_target", "status": "published", "value": "11.75",
				                       "period_start": "2024-01-10", "period_end": "2024-01-10", "methods": []}],
				"interest": "241.11", "amortization": "30069.76", "mip": "9.02", "dfi": "10.01", "fee": "12.50",
				"amount": "30342.40", "prepaid": "0.00", "outstanding_balance": "0.00"}`,
		},
		{
			name:    "IPCA",
			indexer: "ipca",
			rate:    `[{"effective_from": "2023-12-10", "rate": "0.12", "basis": "nominal"}]`,
			history: map[indexes.Index][]indexes.Value{
				indexes.IPCA: {publishedValue("2023-12-01", "2023-12-01", "0.56")},
			},
			want: `{"number": 1, "due_date": "2024-01-10", "correction": "0.00", "index_values": [], ` + sacRate + `,
				"interest": "620.00", "amortization": "29980.00", "mip": "18.00", "dfi": "10.00", "fee": "12.50",
				"amount": "30640.50", "prepaid": "0.00", "outstanding_balance": "30020.00"},
				{"number": 2, "due_date": "2024-02-10", "correction": "168.11",
				"index_values": [{"index": "ipca", "status": "published", "value": "0.56",
				                  "period_start": "2023-12-01", "period_end": "2023-12-01", "methods": []}], ` + sacRate + `,
				"interest": "301.88", "amortization": "30188.11", "mip": "9.06", "dfi": "10.00", "fee": "12.50",
				"amount": "30521.55", "prepaid": "0.00", "outstanding_balance": "0.00"}`,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			t.Parallel()

			conn := migratedDatabase(t)
			handler := apiOver(conn)

			for index, values := range tt.history {
				require.NoError(t, indexes.NewStore(conn).SaveRefresh(t.Context(), index, values, time.Now()))
			}

			var body map[string]json.RawMessage
			require.NoError(t, json.Unmarshal([]byte(withFieldOf(t, signedOnDecember10(), "indexer", `"`+tt.indexer+`"`)), &body))
			body["term_months"] = json.RawMessage("2")
			body["contract_rates"] = json.RawMessage(tt.rate)
			terms, err := json.Marshal(body)
			require.NoError(t, err)

			saved := serve(t, handler, http.MethodPut, "/mortgage", string(terms))
			require.Equal(t, http.StatusOK, saved.Code, saved.Body.String())

			rec := serve(t, handler, http.MethodGet, "/mortgage/schedule", "")

			require.Equal(t, http.StatusOK, rec.Code, rec.Body.String())
			assert.JSONEq(t, `{"installments": [`+tt.want+`]}`, rec.Body.String())
		})
	}
}

// An indexed mortgage's schedule needs the index history, so failing to read it fails the schedule.
func TestIndexedScheduleFailsWithoutTheIndexHistory(t *testing.T) {
	t.Parallel()

	conn := migratedDatabase(t)
	handler := apiOver(conn)
	require.Equal(t, http.StatusOK, serve(t, handler, http.MethodPut, "/mortgage", withField(t, "indexer", `"tr"`)).Code)

	_, err := conn.ExecContext(t.Context(), "DROP TABLE index_values")
	require.NoError(t, err)

	rec := serve(t, handler, http.MethodGet, "/mortgage/schedule", "")

	assert.Equal(t, http.StatusInternalServerError, rec.Code, rec.Body.String())
}

// Replaying a mortgage reads the Focus expectations and the projection methods, whatever its
// indexer, so failing to read either fails the schedule and the statements' drifts.
func TestReplayFailsWithoutTheExpectationsOrTheProjectionMethods(t *testing.T) {
	t.Parallel()

	tables := []string{"focus_selic", "focus_ipca_monthly", "focus_ipca_annual", "projection_methods"}
	paths := []string{"/mortgage/schedule", "/mortgage/statements"}

	for _, table := range tables {
		for _, path := range paths {
			t.Run(table+" "+path, func(t *testing.T) {
				t.Parallel()

				conn := migratedDatabase(t)
				handler := apiOver(conn)
				require.Equal(t, http.StatusOK, serve(t, handler, http.MethodPut, "/mortgage", sacMortgage).Code)

				_, err := conn.ExecContext(t.Context(), "DROP TABLE "+table)
				require.NoError(t, err)

				rec := serve(t, handler, http.MethodGet, path, "")

				assert.Equal(t, http.StatusInternalServerError, rec.Code, rec.Body.String())
			})
		}
	}
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
		"indexer": "tr",
		"appraisal_value": "320000.00",
		"contract_rates": [{"effective_from": "2024-01-05", "rate": "0.10", "basis": "effective", "poupanca_additional": true}],
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
		"indexer": "tr",
		"appraisal_value": "320000.00",
		"contract_rates": [{
			"effective_from": "2024-01-05",
			"basis": "effective",
			"nominal": "0.095689685146844892792382130678764",
			"effective": "0.10",
			"poupanca_additional": true
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

	return withFieldOf(t, sacMortgage, field, raw)
}

// signedOnDecember10 is sacMortgage signed on 2023-12-10, 31 days before its 1st installment, with
// every row effective from that date. An indexed mortgage takes its anniversaries from the day it
// is signed.
func signedOnDecember10() string {
	return strings.ReplaceAll(sacMortgage, "2023-12-11", "2023-12-10")
}

// withFieldOf returns the terms in body with one field replaced by raw JSON.
func withFieldOf(t *testing.T, body, field, raw string) string {
	t.Helper()

	var terms map[string]json.RawMessage
	require.NoError(t, json.Unmarshal([]byte(body), &terms))

	terms[field] = json.RawMessage(raw)

	out, err := json.Marshal(terms)
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
			body: withField(t, "contract_rates", `[{"effective_from": "2023-12-11", "rate": "0.1234567890123", "basis": "nominal"}]`),
			want: []errorDetail{{"body.contract_rates[0].rate", ratePattern}},
		},
		{
			name: "appraisal value below a centavo",
			body: withField(t, "appraisal_value", `"100000.001"`),
			want: []errorDetail{{"body.appraisal_value", moneyPattern}},
		},
		{
			name: "fee below a centavo",
			body: withField(t, "fees", `[{"effective_from": "2023-12-11", "amount": "12.505"}]`),
			want: []errorDetail{{"body.fees[0].amount", moneyPattern}},
		},
		{
			name: "MIP rate over 12 places",
			body: withField(t, "mip_rates", `[{"effective_from": "2023-12-11", "rate": "0.0003000000001"}]`),
			want: []errorDetail{{"body.mip_rates[0].rate", ratePattern}},
		},
		{
			name: "contract rate of 1000 times",
			body: withField(t, "contract_rates", `[{"effective_from": "2023-12-11", "rate": "1000", "basis": "nominal"}]`),
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
			body: withField(t, "mip_rates", `[{"effective_from": "2023-12-11", "rate": "-0.0003"}]`),
			want: []errorDetail{{"body.mip_rates[0].rate", ratePattern}},
		},
		{
			name: "unknown rate basis",
			body: withField(t, "contract_rates", `[{"effective_from": "2023-12-11", "rate": "0.12", "basis": "annual"}]`),
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
			body: withField(t, "fees", `[{"effective_from": "2023-12-11", "amount": "-10.00"}]`),
			want: []errorDetail{{"body.fees[0].amount", moneyPattern}},
		},
		{
			name: "negative contract rate",
			body: withField(t, "contract_rates", `[{"effective_from": "2023-12-11", "rate": "-0.12", "basis": "nominal"}]`),
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
				{"effective_from": "2023-12-11", "rate": "0.0003"},
				{"effective_from": "2024-04-01", "rate": "0.0005"},
				{"effective_from": "2023-12-11", "rate": "0.0004"}
			]`),
			want: []errorDetail{{"body.mip_rates[2].effective_from", "repeats the date of another row"}},
		},
		{
			name: "unknown amortization system",
			body: withField(t, "amortization_system", `"sacre"`),
			want: []errorDetail{{"body.amortization_system", `expected value to be one of "sac, price"`}},
		},
		{
			name: "unknown indexer",
			body: withField(t, "indexer", `"igpm"`),
			want: []errorDetail{{"body.indexer", `expected value to be one of "none, tr, ipca"`}},
		},
		{
			name: "the poupança yield as indexer",
			body: withField(t, "indexer", `"poupanca_yield"`),
			want: []errorDetail{{"body.indexer", `expected value to be one of "none, tr, ipca"`}},
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
		{name: "first installment on the contract date", field: "first_installment_date", raw: `"2023-12-11"`},
		{name: "fee effective on the first installment date", field: "fees", raw: `[{"effective_from": "2024-01-10", "amount": "12.50"}]`},
		{name: "term of 50 years", field: "term_months", raw: "600"},
		{name: "original amount of 15 digits", field: "original_amount", raw: `"999999999999999.99"`},
		{name: "original amount of one place", field: "original_amount", raw: `"60000.5"`},
		{
			name:  "contract rate of 999 times",
			field: "contract_rates",
			raw:   `[{"effective_from": "2023-12-11", "rate": "999", "basis": "nominal"}]`,
		},
		{
			name:  "MIP rate of 12 places",
			field: "mip_rates",
			raw:   `[{"effective_from": "2023-12-11", "rate": "0.000300000001"}]`,
		},
		{
			name:  "contract rate of 12 places",
			field: "contract_rates",
			raw:   `[{"effective_from": "2023-12-11", "rate": "0.123456789012", "basis": "nominal"}]`,
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

// failingOn makes every statement of kind ("INSERT", "UPDATE" or "DELETE") on table fail.
func failingOn(kind, table string) string {
	return "CREATE TRIGGER fail_" + table + " BEFORE " + kind + " ON " + table +
		" BEGIN SELECT RAISE(FAIL, 'injected failure'); END"
}

// A registered mortgage whose data is missing or damaged fails to read with a 500, never as a
// missing mortgage or a panic.
func TestDamagedMortgageFailsToRead(t *testing.T) {
	t.Parallel()

	tests := []struct {
		name   string
		damage string
	}{
		{name: "no mortgages table", damage: "DROP TABLE mortgages"},
		{name: "no contract rates table", damage: "DROP TABLE mortgage_contract_rates"},
		{name: "no MIP rates table", damage: "DROP TABLE mortgage_mip_rates"},
		{name: "no DFI rates table", damage: "DROP TABLE mortgage_dfi_rates"},
		{name: "no fees table", damage: "DROP TABLE mortgage_fees"},
		{name: "an amount that is no decimal", damage: "UPDATE mortgages SET original_amount = 'lots'"},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			t.Parallel()

			conn := migratedDatabase(t)
			handler := api.NewHandler(mortgageServices(conn), api.WithLogger(slog.New(slog.DiscardHandler)))
			require.Equal(t, http.StatusOK, serve(t, handler, http.MethodPut, "/mortgage", sacMortgage).Code)

			_, err := conn.ExecContext(t.Context(), tt.damage)
			require.NoError(t, err)

			rec := serve(t, handler, http.MethodGet, "/mortgage", "")

			assert.Equal(t, http.StatusInternalServerError, rec.Code, rec.Body.String())
		})
	}
}

// A save the database refuses part way fails with a 500 and leaves the terms as they were: the
// registered mortgage, or none.
func TestRefusedSaveKeepsTheTermsAsTheyWere(t *testing.T) {
	t.Parallel()

	tests := []struct {
		name       string
		registered bool
		damage     string
	}{
		{name: "registering", damage: failingOn("INSERT", "mortgages")},
		{name: "editing", registered: true, damage: failingOn("UPDATE", "mortgages")},
		{name: "clearing the old rows", registered: true, damage: failingOn("DELETE", "mortgage_contract_rates")},
		{name: "a contract rate", damage: failingOn("INSERT", "mortgage_contract_rates")},
		{name: "a MIP rate", registered: true, damage: failingOn("INSERT", "mortgage_mip_rates")},
		{name: "a DFI rate", damage: failingOn("INSERT", "mortgage_dfi_rates")},
		{name: "a fee", registered: true, damage: failingOn("INSERT", "mortgage_fees")},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			t.Parallel()

			conn := migratedDatabase(t)
			handler := api.NewHandler(mortgageServices(conn), api.WithLogger(slog.New(slog.DiscardHandler)))

			if tt.registered {
				require.Equal(t, http.StatusOK, serve(t, handler, http.MethodPut, "/mortgage", sacMortgage).Code)
			}

			_, err := conn.ExecContext(t.Context(), tt.damage)
			require.NoError(t, err)

			rec := serve(t, handler, http.MethodPut, "/mortgage", withField(t, "term_months", "12"))
			require.Equal(t, http.StatusInternalServerError, rec.Code, rec.Body.String())

			read := serve(t, handler, http.MethodGet, "/mortgage", "")
			if !tt.registered {
				assert.Equal(t, http.StatusNotFound, read.Code, read.Body.String())

				return
			}

			require.Equal(t, http.StatusOK, read.Code, read.Body.String())
			assert.JSONEq(t, sacMortgageRead, read.Body.String())
		})
	}
}

func TestSaveFailsWithoutTheMortgagesTable(t *testing.T) {
	t.Parallel()

	conn := migratedDatabase(t)
	handler := api.NewHandler(mortgageServices(conn), api.WithLogger(slog.New(slog.DiscardHandler)))

	_, err := conn.ExecContext(t.Context(), "DROP TABLE mortgages")
	require.NoError(t, err)

	rec := serve(t, handler, http.MethodPut, "/mortgage", sacMortgage)

	assert.Equal(t, http.StatusInternalServerError, rec.Code, rec.Body.String())
}
