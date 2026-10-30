package api_test

import (
	"encoding/json"
	"log/slog"
	"net/http"
	"testing"
	"time"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"github.com/gringolito/debtwise/backend/api"
	"github.com/gringolito/debtwise/backend/indexes"
)

// registered serves the API over a fresh database with sacMortgage registered.
func registered(t *testing.T) http.Handler {
	t.Helper()

	handler := newAPI(t)
	rec := serve(t, handler, http.MethodPut, "/mortgage", sacMortgage)
	require.Equal(t, http.StatusOK, rec.Code, rec.Body.String())

	return handler
}

// do serves a request and requires the status it answers.
func do(t *testing.T, handler http.Handler, method, path, body string, status int) string {
	t.Helper()

	rec := serve(t, handler, method, path, body)
	require.Equal(t, status, rec.Code, rec.Body.String())

	return rec.Body.String()
}

func TestPrepaymentsAreListedInDateOrder(t *testing.T) {
	t.Parallel()

	handler := registered(t)

	assert.JSONEq(t, `{"prepayments": []}`, do(t, handler, http.MethodGet, "/mortgage/prepayments", "", http.StatusOK))

	assert.JSONEq(t, `{"id": 1, "date": "2024-03-10", "amount": "5000.00", "effect": "lower_installment"}`,
		do(t, handler, http.MethodPost, "/mortgage/prepayments",
			`{"date": "2024-03-10", "amount": "5000.00", "effect": "lower_installment"}`, http.StatusCreated))
	do(t, handler, http.MethodPost, "/mortgage/prepayments",
		`{"date": "2024-01-20", "amount": "1000.50", "effect": "shorten_term"}`, http.StatusCreated)
	do(t, handler, http.MethodPost, "/mortgage/prepayments",
		`{"date": "2024-03-10", "amount": "250.00", "effect": "shorten_term"}`, http.StatusCreated)

	assert.JSONEq(t, `{"prepayments": [
		{"id": 2, "date": "2024-01-20", "amount": "1000.50", "effect": "shorten_term"},
		{"id": 1, "date": "2024-03-10", "amount": "5000.00", "effect": "lower_installment"},
		{"id": 3, "date": "2024-03-10", "amount": "250.00", "effect": "shorten_term"}
	]}`, do(t, handler, http.MethodGet, "/mortgage/prepayments", "", http.StatusOK))
}

func TestPrepaymentIsEditedAndDeleted(t *testing.T) {
	t.Parallel()

	handler := registered(t)
	do(t, handler, http.MethodPost, "/mortgage/prepayments",
		`{"date": "2024-03-10", "amount": "5000.00", "effect": "lower_installment"}`, http.StatusCreated)
	do(t, handler, http.MethodPost, "/mortgage/prepayments",
		`{"date": "2024-04-10", "amount": "1000.00", "effect": "lower_installment"}`, http.StatusCreated)

	assert.JSONEq(t, `{"id": 2, "date": "2024-02-10", "amount": "2000.00", "effect": "shorten_term"}`,
		do(t, handler, http.MethodPut, "/mortgage/prepayments/2",
			`{"date": "2024-02-10", "amount": "2000.00", "effect": "shorten_term"}`, http.StatusOK))

	assert.JSONEq(t, `{"prepayments": [
		{"id": 2, "date": "2024-02-10", "amount": "2000.00", "effect": "shorten_term"},
		{"id": 1, "date": "2024-03-10", "amount": "5000.00", "effect": "lower_installment"}
	]}`, do(t, handler, http.MethodGet, "/mortgage/prepayments", "", http.StatusOK))

	do(t, handler, http.MethodDelete, "/mortgage/prepayments/2", "", http.StatusNoContent)

	assert.JSONEq(t, `{"prepayments": [
		{"id": 1, "date": "2024-03-10", "amount": "5000.00", "effect": "lower_installment"}
	]}`, do(t, handler, http.MethodGet, "/mortgage/prepayments", "", http.StatusOK))
}

// Prepaying 20,000.00 on the 2nd installment's due date and keeping the 10,000.00 a month ends the
// schedule two months early. Deleting the prepayment brings the schedule back.
func TestPrepaymentIsReplayedInTheScheduleUntilDeleted(t *testing.T) {
	t.Parallel()

	handler := registered(t)
	original := do(t, handler, http.MethodGet, "/mortgage/schedule", "", http.StatusOK)

	do(t, handler, http.MethodPost, "/mortgage/prepayments",
		`{"date": "2024-02-10", "amount": "20000.00", "effect": "shorten_term"}`, http.StatusCreated)

	assert.JSONEq(t, `{"installments": [
		{"number": 1, "due_date": "2024-01-10", "correction": "0.00", "index_values": [], "interest": "600.00",
		 "amortization": "10000.00", "mip": "18.00", "dfi": "10.00", "fee": "12.50", "amount": "10640.50",
		 "prepaid": "0.00", "outstanding_balance": "50000.00"},
		{"number": 2, "due_date": "2024-02-10", "correction": "0.00", "index_values": [], "interest": "500.00",
		 "amortization": "10000.00", "mip": "15.00", "dfi": "10.00", "fee": "12.50", "amount": "10537.50",
		 "prepaid": "20000.00", "outstanding_balance": "20000.00"},
		{"number": 3, "due_date": "2024-03-10", "correction": "0.00", "index_values": [], "interest": "200.00",
		 "amortization": "10000.00", "mip": "6.00", "dfi": "10.00", "fee": "12.50", "amount": "10228.50",
		 "prepaid": "0.00", "outstanding_balance": "10000.00"},
		{"number": 4, "due_date": "2024-04-10", "correction": "0.00", "index_values": [], "interest": "100.00",
		 "amortization": "10000.00", "mip": "5.00", "dfi": "10.00", "fee": "12.50", "amount": "10127.50",
		 "prepaid": "0.00", "outstanding_balance": "0.00"}
	]}`, do(t, handler, http.MethodGet, "/mortgage/schedule", "", http.StatusOK))

	do(t, handler, http.MethodDelete, "/mortgage/prepayments/1", "", http.StatusNoContent)

	assert.JSONEq(t, `{"prepayments": []}`, do(t, handler, http.MethodGet, "/mortgage/prepayments", "", http.StatusOK))
	assert.JSONEq(t, original, do(t, handler, http.MethodGet, "/mortgage/schedule", "", http.StatusOK))
}

// The bank stated 40,123.45 on February 20, where the schedule had computed 40,000.00, and
// 10,000.00 on May 15, where it had computed 10,030.86 from the earlier statement on. Deleting both
// brings the schedule back.
func TestStatementsSetTheScheduleAndShowTheirDriftUntilDeleted(t *testing.T) {
	t.Parallel()

	handler := registered(t)
	original := do(t, handler, http.MethodGet, "/mortgage/schedule", "", http.StatusOK)

	assert.JSONEq(t, `{"id": 1, "date": "2024-05-15", "outstanding_balance": "10000.00"}`,
		do(t, handler, http.MethodPost, "/mortgage/statements",
			`{"date": "2024-05-15", "outstanding_balance": "10000.00"}`, http.StatusCreated))
	do(t, handler, http.MethodPost, "/mortgage/statements",
		`{"date": "2024-02-20", "outstanding_balance": "40123.45"}`, http.StatusCreated)

	assert.JSONEq(t, `{"statements": [
		{"id": 2, "date": "2024-02-20", "outstanding_balance": "40123.45", "computed_balance": "40000.00",
		 "drift": "123.45"},
		{"id": 1, "date": "2024-05-15", "outstanding_balance": "10000.00", "computed_balance": "10030.86",
		 "drift": "-30.86"}
	]}`, do(t, handler, http.MethodGet, "/mortgage/statements", "", http.StatusOK))

	assert.JSONEq(t, `{"installments": [
		{"number": 1, "due_date": "2024-01-10", "correction": "0.00", "index_values": [], "interest": "600.00",
		 "amortization": "10000.00", "mip": "18.00", "dfi": "10.00", "fee": "12.50", "amount": "10640.50",
		 "prepaid": "0.00", "outstanding_balance": "50000.00"},
		{"number": 2, "due_date": "2024-02-10", "correction": "0.00", "index_values": [], "interest": "500.00",
		 "amortization": "10000.00", "mip": "15.00", "dfi": "10.00", "fee": "12.50", "amount": "10537.50",
		 "prepaid": "0.00", "outstanding_balance": "40123.45"},
		{"number": 3, "due_date": "2024-03-10", "correction": "0.00", "index_values": [], "interest": "401.23",
		 "amortization": "10030.86", "mip": "12.04", "dfi": "10.00", "fee": "12.50", "amount": "10466.63",
		 "prepaid": "0.00", "outstanding_balance": "30092.59"},
		{"number": 4, "due_date": "2024-04-10", "correction": "0.00", "index_values": [], "interest": "300.93",
		 "amortization": "10030.86", "mip": "15.05", "dfi": "10.00", "fee": "12.50", "amount": "10369.34",
		 "prepaid": "0.00", "outstanding_balance": "20061.73"},
		{"number": 5, "due_date": "2024-05-10", "correction": "0.00", "index_values": [], "interest": "200.62",
		 "amortization": "10030.87", "mip": "10.03", "dfi": "10.00", "fee": "12.50", "amount": "10264.02",
		 "prepaid": "0.00", "outstanding_balance": "10000.00"},
		{"number": 6, "due_date": "2024-06-10", "correction": "0.00", "index_values": [], "interest": "100.00",
		 "amortization": "10000.00", "mip": "5.00", "dfi": "10.00", "fee": "12.50", "amount": "10127.50",
		 "prepaid": "0.00", "outstanding_balance": "0.00"}
	]}`, do(t, handler, http.MethodGet, "/mortgage/schedule", "", http.StatusOK))

	do(t, handler, http.MethodDelete, "/mortgage/statements/1", "", http.StatusNoContent)

	assert.JSONEq(t, `{"statements": [
		{"id": 2, "date": "2024-02-20", "outstanding_balance": "40123.45", "computed_balance": "40000.00",
		 "drift": "123.45"}
	]}`, do(t, handler, http.MethodGet, "/mortgage/statements", "", http.StatusOK))

	do(t, handler, http.MethodDelete, "/mortgage/statements/2", "", http.StatusNoContent)

	assert.JSONEq(t, `{"statements": []}`, do(t, handler, http.MethodGet, "/mortgage/statements", "", http.StatusOK))
	assert.JSONEq(t, original, do(t, handler, http.MethodGet, "/mortgage/schedule", "", http.StatusOK))
}

// The edited statement on March 20 restarts the schedule from 30,001.00, which the 4th and 5th
// installments amortize to 10,000.33 by May 20. The statement on May 20 is left as it was.
func TestStatementIsEdited(t *testing.T) {
	t.Parallel()

	handler := registered(t)
	do(t, handler, http.MethodPost, "/mortgage/statements",
		`{"date": "2024-02-20", "outstanding_balance": "40123.45"}`, http.StatusCreated)
	do(t, handler, http.MethodPost, "/mortgage/statements",
		`{"date": "2024-05-20", "outstanding_balance": "10000.00"}`, http.StatusCreated)

	assert.JSONEq(t, `{"id": 1, "date": "2024-03-20", "outstanding_balance": "30000.00"}`,
		do(t, handler, http.MethodPut, "/mortgage/statements/1",
			`{"date": "2024-03-20", "outstanding_balance": "30000.00"}`, http.StatusOK))
	do(t, handler, http.MethodPut, "/mortgage/statements/1",
		`{"date": "2024-03-20", "outstanding_balance": "30001.00"}`, http.StatusOK)

	assert.JSONEq(t, `{"statements": [
		{"id": 1, "date": "2024-03-20", "outstanding_balance": "30001.00", "computed_balance": "30000.00",
		 "drift": "1.00"},
		{"id": 2, "date": "2024-05-20", "outstanding_balance": "10000.00", "computed_balance": "10000.33",
		 "drift": "-0.33"}
	]}`, do(t, handler, http.MethodGet, "/mortgage/statements", "", http.StatusOK))
}

// The schedule a statement is compared with is corrected by the published TR, but not on the 1st
// installment: after the 2nd installment it owes 40,050.00, as
// TestIndexedMortgageScheduleIsCorrectedByPublishedValues works out.
func TestStatementDriftFollowsIndexCorrections(t *testing.T) {
	t.Parallel()

	conn := migratedDatabase(t)
	handler := apiOver(conn)

	require.NoError(t, indexes.NewStore(conn).SaveRefresh(t.Context(), indexes.TR, []indexes.Value{
		publishedValue("2023-12-10", "2024-01-10", "0.0539"),
		publishedValue("2024-01-10", "2024-02-10", "0.1250"),
	}, time.Now()))
	do(t, handler, http.MethodPut, "/mortgage", withField(t, "indexer", `"tr"`), http.StatusOK)
	do(t, handler, http.MethodPost, "/mortgage/statements",
		`{"date": "2024-02-20", "outstanding_balance": "40100.00"}`, http.StatusCreated)

	assert.JSONEq(t, `{"statements": [
		{"id": 1, "date": "2024-02-20", "outstanding_balance": "40100.00", "computed_balance": "40050.00",
		 "drift": "50.00"}
	]}`, do(t, handler, http.MethodGet, "/mortgage/statements", "", http.StatusOK))
}

// Editing the terms keeps the prepayments and statements, and deleting the mortgage deletes them.
func TestEventsGoWithTheMortgage(t *testing.T) {
	t.Parallel()

	handler := registered(t)
	do(t, handler, http.MethodPost, "/mortgage/prepayments",
		`{"date": "2024-03-10", "amount": "5000.00", "effect": "lower_installment"}`, http.StatusCreated)
	do(t, handler, http.MethodPost, "/mortgage/statements",
		`{"date": "2024-02-20", "outstanding_balance": "40123.45"}`, http.StatusCreated)

	do(t, handler, http.MethodPut, "/mortgage", withField(t, "term_months", "12"), http.StatusOK)
	assert.JSONEq(t, `{"prepayments": [
		{"id": 1, "date": "2024-03-10", "amount": "5000.00", "effect": "lower_installment"}
	]}`, do(t, handler, http.MethodGet, "/mortgage/prepayments", "", http.StatusOK), "editing the terms keeps them")
	assert.JSONEq(t, `{"statements": [
		{"id": 1, "date": "2024-02-20", "outstanding_balance": "40123.45", "computed_balance": "50000.00",
		 "drift": "-9876.55"}
	]}`, do(t, handler, http.MethodGet, "/mortgage/statements", "", http.StatusOK), "editing the terms keeps them")

	do(t, handler, http.MethodDelete, "/mortgage", "", http.StatusNoContent)
	do(t, handler, http.MethodPut, "/mortgage", sacMortgage, http.StatusOK)

	assert.JSONEq(t, `{"prepayments": []}`, do(t, handler, http.MethodGet, "/mortgage/prepayments", "", http.StatusOK))
	assert.JSONEq(t, `{"statements": []}`, do(t, handler, http.MethodGet, "/mortgage/statements", "", http.StatusOK))
}

// Moving the contract after recorded events keeps replaying them, before the first installment:
// the statement of February 20 is compared with the 60,000.00 borrowed, and the 5,000.00 prepaid
// on March 10 leaves 35,123.45 for the 6 installments to amortize, 5,853.91 a month.
func TestEventsBeforeAMovedContractStillReplay(t *testing.T) {
	t.Parallel()

	handler := registered(t)
	do(t, handler, http.MethodPost, "/mortgage/prepayments",
		`{"date": "2024-03-10", "amount": "5000.00", "effect": "lower_installment"}`, http.StatusCreated)
	do(t, handler, http.MethodPost, "/mortgage/statements",
		`{"date": "2024-02-20", "outstanding_balance": "40123.45"}`, http.StatusCreated)

	var terms map[string]json.RawMessage
	require.NoError(t, json.Unmarshal([]byte(sacMortgage), &terms))
	terms["contract_date"] = json.RawMessage(`"2024-04-01"`)
	terms["first_installment_date"] = json.RawMessage(`"2024-05-01"`)
	moved, err := json.Marshal(terms)
	require.NoError(t, err)
	do(t, handler, http.MethodPut, "/mortgage", string(moved), http.StatusOK)

	assert.JSONEq(t, `{"statements": [
		{"id": 1, "date": "2024-02-20", "outstanding_balance": "40123.45", "computed_balance": "60000.00",
		 "drift": "-19876.55"}
	]}`, do(t, handler, http.MethodGet, "/mortgage/statements", "", http.StatusOK))
	assert.JSONEq(t, `{"installments": [
		{"number": 1, "due_date": "2024-05-01", "correction": "0.00", "index_values": [], "interest": "351.23",
		 "amortization": "5853.91", "mip": "17.56", "dfi": "10.00", "fee": "12.50", "amount": "6245.20",
		 "prepaid": "0.00", "outstanding_balance": "29269.54"},
		{"number": 2, "due_date": "2024-06-01", "correction": "0.00", "index_values": [], "interest": "292.70",
		 "amortization": "5853.91", "mip": "14.63", "dfi": "10.00", "fee": "12.50", "amount": "6183.74",
		 "prepaid": "0.00", "outstanding_balance": "23415.63"},
		{"number": 3, "due_date": "2024-07-01", "correction": "0.00", "index_values": [], "interest": "234.16",
		 "amortization": "5853.91", "mip": "11.71", "dfi": "10.00", "fee": "12.50", "amount": "6122.28",
		 "prepaid": "0.00", "outstanding_balance": "17561.72"},
		{"number": 4, "due_date": "2024-08-01", "correction": "0.00", "index_values": [], "interest": "175.62",
		 "amortization": "5853.91", "mip": "8.78", "dfi": "10.00", "fee": "12.50", "amount": "6060.81",
		 "prepaid": "0.00", "outstanding_balance": "11707.81"},
		{"number": 5, "due_date": "2024-09-01", "correction": "0.00", "index_values": [], "interest": "117.08",
		 "amortization": "5853.91", "mip": "5.85", "dfi": "10.00", "fee": "12.50", "amount": "5999.34",
		 "prepaid": "0.00", "outstanding_balance": "5853.90"},
		{"number": 6, "due_date": "2024-10-01", "correction": "0.00", "index_values": [], "interest": "58.54",
		 "amortization": "5853.90", "mip": "2.93", "dfi": "10.00", "fee": "12.50", "amount": "5937.87",
		 "prepaid": "0.00", "outstanding_balance": "0.00"}
	]}`, do(t, handler, http.MethodGet, "/mortgage/schedule", "", http.StatusOK))
}

// An event on the contract date itself is not before it. The statement that day follows the
// prepayment, so it matches the 55,000.00 the prepayment left.
func TestEventOnTheContractDateIsRecorded(t *testing.T) {
	t.Parallel()

	handler := registered(t)

	do(t, handler, http.MethodPost, "/mortgage/prepayments",
		`{"date": "2023-12-10", "amount": "5000.00", "effect": "lower_installment"}`, http.StatusCreated)
	do(t, handler, http.MethodPost, "/mortgage/statements",
		`{"date": "2023-12-10", "outstanding_balance": "55000.00"}`, http.StatusCreated)

	assert.JSONEq(t, `{"prepayments": [
		{"id": 1, "date": "2023-12-10", "amount": "5000.00", "effect": "lower_installment"}
	]}`, do(t, handler, http.MethodGet, "/mortgage/prepayments", "", http.StatusOK))
	assert.JSONEq(t, `{"statements": [
		{"id": 1, "date": "2023-12-10", "outstanding_balance": "55000.00", "computed_balance": "55000.00",
		 "drift": "0.00"}
	]}`, do(t, handler, http.MethodGet, "/mortgage/statements", "", http.StatusOK))
}

// A rejected event leaves the recorded ones as they were. Their figures: 40,123.45 stated after the
// 2nd installment amortizes 10,030.86 on the 3rd, which with the 5,000.00 prepaid leaves 25,092.59;
// the 4th and 5th amortize 8,364.20 each, so 8,364.19 is computed for May 20.
func TestInvalidEventIsRejected(t *testing.T) {
	t.Parallel()

	const moneyPattern = `expected string to match pattern ^(0|[1-9][0-9]{0,14})(\.[0-9]{1,2})?$`

	tests := []struct {
		name   string
		method string
		path   string
		body   string
		want   []errorDetail
	}{
		{
			name:   "zero prepayment",
			method: http.MethodPost,
			path:   "/mortgage/prepayments",
			body:   `{"date": "2024-03-10", "amount": "0.00", "effect": "shorten_term"}`,
			want:   []errorDetail{{"body.amount", "must be greater than zero"}},
		},
		{
			name:   "prepayment before the contract and below a centavo",
			method: http.MethodPost,
			path:   "/mortgage/prepayments",
			body:   `{"date": "2023-12-09", "amount": "10.001", "effect": "shorten_term"}`,
			want:   []errorDetail{{"body.amount", moneyPattern}},
		},
		{
			name:   "prepayment before the contract",
			method: http.MethodPut,
			path:   "/mortgage/prepayments/1",
			body:   `{"date": "2023-12-09", "amount": "0", "effect": "shorten_term"}`,
			want: []errorDetail{
				{"body.date", "must not be before the contract date"},
				{"body.amount", "must be greater than zero"},
			},
		},
		{
			name:   "prepayment recorded before the contract",
			method: http.MethodPost,
			path:   "/mortgage/prepayments",
			body:   `{"date": "2023-12-09", "amount": "10.00", "effect": "shorten_term"}`,
			want:   []errorDetail{{"body.date", "must not be before the contract date"}},
		},
		{
			name:   "statement recorded before the contract",
			method: http.MethodPost,
			path:   "/mortgage/statements",
			body:   `{"date": "2023-12-09", "outstanding_balance": "60000.00"}`,
			want:   []errorDetail{{"body.date", "must not be before the contract date"}},
		},
		{
			name:   "unknown prepayment effect",
			method: http.MethodPost,
			path:   "/mortgage/prepayments",
			body:   `{"date": "2024-03-10", "amount": "10.00", "effect": "skip_installment"}`,
			want:   []errorDetail{{"body.effect", `expected value to be one of "shorten_term, lower_installment"`}},
		},
		{
			name:   "negative statement",
			method: http.MethodPost,
			path:   "/mortgage/statements",
			body:   `{"date": "2024-03-10", "outstanding_balance": "-1.00"}`,
			want:   []errorDetail{{"body.outstanding_balance", moneyPattern}},
		},
		{
			name:   "statement before the contract",
			method: http.MethodPut,
			path:   "/mortgage/statements/1",
			body:   `{"date": "2023-12-09", "outstanding_balance": "60000.00"}`,
			want:   []errorDetail{{"body.date", "must not be before the contract date"}},
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			t.Parallel()

			handler := registered(t)
			do(t, handler, http.MethodPost, "/mortgage/prepayments",
				`{"date": "2024-03-10", "amount": "5000.00", "effect": "lower_installment"}`, http.StatusCreated)
			do(t, handler, http.MethodPost, "/mortgage/statements",
				`{"date": "2024-02-20", "outstanding_balance": "40123.45"}`, http.StatusCreated)
			do(t, handler, http.MethodPost, "/mortgage/statements",
				`{"date": "2024-05-20", "outstanding_balance": "10000.00"}`, http.StatusCreated)

			rec := serve(t, handler, tt.method, tt.path, tt.body)

			require.Equal(t, http.StatusUnprocessableEntity, rec.Code, rec.Body.String())

			var problem struct {
				Errors []errorDetail `json:"errors"`
			}
			require.NoError(t, json.Unmarshal(rec.Body.Bytes(), &problem))
			assert.Equal(t, tt.want, problem.Errors)

			assert.JSONEq(t, `{"prepayments": [
				{"id": 1, "date": "2024-03-10", "amount": "5000.00", "effect": "lower_installment"}
			]}`, do(t, handler, http.MethodGet, "/mortgage/prepayments", "", http.StatusOK))
			assert.JSONEq(t, `{"statements": [
				{"id": 1, "date": "2024-02-20", "outstanding_balance": "40123.45", "computed_balance": "40000.00",
				 "drift": "123.45"},
				{"id": 2, "date": "2024-05-20", "outstanding_balance": "10000.00", "computed_balance": "8364.19",
				 "drift": "1635.81"}
			]}`, do(t, handler, http.MethodGet, "/mortgage/statements", "", http.StatusOK))
		})
	}
}

// A statement on a date that already has one conflicts with it, and changes nothing.
func TestSecondStatementOnADateConflicts(t *testing.T) {
	t.Parallel()

	tests := []struct {
		name   string
		method string
		path   string
	}{
		{name: "recorded", method: http.MethodPost, path: "/mortgage/statements"},
		{name: "moved onto another's date", method: http.MethodPut, path: "/mortgage/statements/2"},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			t.Parallel()

			handler := registered(t)
			do(t, handler, http.MethodPost, "/mortgage/statements",
				`{"date": "2024-02-20", "outstanding_balance": "40123.45"}`, http.StatusCreated)
			do(t, handler, http.MethodPost, "/mortgage/statements",
				`{"date": "2024-05-20", "outstanding_balance": "10000.00"}`, http.StatusCreated)

			rec := serve(t, handler, tt.method, tt.path, `{"date": "2024-02-20", "outstanding_balance": "1.00"}`)

			require.Equal(t, http.StatusConflict, rec.Code, rec.Body.String())

			var problem struct {
				Detail string `json:"detail"`
			}
			require.NoError(t, json.Unmarshal(rec.Body.Bytes(), &problem))
			assert.Equal(t, "a statement is already recorded on this date", problem.Detail)

			assert.JSONEq(t, `{"statements": [
				{"id": 1, "date": "2024-02-20", "outstanding_balance": "40123.45", "computed_balance": "40000.00",
				 "drift": "123.45"},
				{"id": 2, "date": "2024-05-20", "outstanding_balance": "10000.00", "computed_balance": "10030.86",
				 "drift": "-30.86"}
			]}`, do(t, handler, http.MethodGet, "/mortgage/statements", "", http.StatusOK))
		})
	}
}

func TestUnknownEventIsNotFound(t *testing.T) {
	t.Parallel()

	tests := []struct {
		name   string
		method string
		path   string
		body   string
		detail string
	}{
		{
			name:   "edit prepayment",
			method: http.MethodPut,
			path:   "/mortgage/prepayments/9",
			body:   `{"date": "2024-03-10", "amount": "10.00", "effect": "shorten_term"}`,
			detail: "no such prepayment",
		},
		{name: "delete prepayment", method: http.MethodDelete, path: "/mortgage/prepayments/9", detail: "no such prepayment"},
		{
			name:   "edit statement",
			method: http.MethodPut,
			path:   "/mortgage/statements/9",
			body:   `{"date": "2024-03-10", "outstanding_balance": "10.00"}`,
			detail: "no such statement",
		},
		{name: "delete statement", method: http.MethodDelete, path: "/mortgage/statements/9", detail: "no such statement"},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			t.Parallel()

			rec := serve(t, registered(t), tt.method, tt.path, tt.body)

			require.Equal(t, http.StatusNotFound, rec.Code, rec.Body.String())

			var problem struct {
				Detail string `json:"detail"`
			}
			require.NoError(t, json.Unmarshal(rec.Body.Bytes(), &problem))
			assert.Equal(t, tt.detail, problem.Detail)
		})
	}
}

func TestEventsNeedAMortgage(t *testing.T) {
	t.Parallel()

	tests := []struct {
		name   string
		method string
		path   string
		body   string
	}{
		{name: "list prepayments", method: http.MethodGet, path: "/mortgage/prepayments"},
		{
			name:   "add prepayment",
			method: http.MethodPost,
			path:   "/mortgage/prepayments",
			body:   `{"date": "2024-03-10", "amount": "10.00", "effect": "shorten_term"}`,
		},
		{
			name:   "edit prepayment",
			method: http.MethodPut,
			path:   "/mortgage/prepayments/1",
			body:   `{"date": "2024-03-10", "amount": "10.00", "effect": "shorten_term"}`,
		},
		{name: "delete prepayment", method: http.MethodDelete, path: "/mortgage/prepayments/1"},
		{name: "list statements", method: http.MethodGet, path: "/mortgage/statements"},
		{
			name:   "add statement",
			method: http.MethodPost,
			path:   "/mortgage/statements",
			body:   `{"date": "2024-03-10", "outstanding_balance": "10.00"}`,
		},
		{
			name:   "edit statement",
			method: http.MethodPut,
			path:   "/mortgage/statements/1",
			body:   `{"date": "2024-03-10", "outstanding_balance": "10.00"}`,
		},
		{name: "delete statement", method: http.MethodDelete, path: "/mortgage/statements/1"},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			t.Parallel()

			rec := serve(t, newAPI(t), tt.method, tt.path, tt.body)

			require.Equal(t, http.StatusNotFound, rec.Code, rec.Body.String())

			var problem struct {
				Detail string `json:"detail"`
			}
			require.NoError(t, json.Unmarshal(rec.Body.Bytes(), &problem))
			assert.Equal(t, "no mortgage is registered", problem.Detail)
		})
	}
}

// Without their tables, events fail to read or write with a 500, and so does the schedule that
// replays them.
func TestEventsFailWithoutTheirTables(t *testing.T) {
	t.Parallel()

	tests := []struct {
		name   string
		table  string
		method string
		path   string
		body   string
	}{
		{name: "list prepayments", table: "mortgage_prepayments", method: http.MethodGet, path: "/mortgage/prepayments"},
		{name: "schedule", table: "mortgage_prepayments", method: http.MethodGet, path: "/mortgage/schedule"},
		{
			name:   "add prepayment",
			table:  "mortgage_prepayments",
			method: http.MethodPost,
			path:   "/mortgage/prepayments",
			body:   `{"date": "2024-03-10", "amount": "10.00", "effect": "shorten_term"}`,
		},
		{
			name:   "edit prepayment",
			table:  "mortgage_prepayments",
			method: http.MethodPut,
			path:   "/mortgage/prepayments/1",
			body:   `{"date": "2024-03-10", "amount": "10.00", "effect": "shorten_term"}`,
		},
		{name: "delete prepayment", table: "mortgage_prepayments", method: http.MethodDelete, path: "/mortgage/prepayments/1"},
		{name: "list statements", table: "mortgage_statements", method: http.MethodGet, path: "/mortgage/statements"},
		{
			name:   "add statement",
			table:  "mortgage_statements",
			method: http.MethodPost,
			path:   "/mortgage/statements",
			body:   `{"date": "2024-03-10", "outstanding_balance": "10.00"}`,
		},
		{
			name:   "edit statement",
			table:  "mortgage_statements",
			method: http.MethodPut,
			path:   "/mortgage/statements/1",
			body:   `{"date": "2024-03-10", "outstanding_balance": "10.00"}`,
		},
		{name: "delete statement", table: "mortgage_statements", method: http.MethodDelete, path: "/mortgage/statements/1"},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			t.Parallel()

			conn := migratedDatabase(t)
			handler := api.NewHandler(mortgageServices(conn), api.WithLogger(slog.New(slog.DiscardHandler)))
			do(t, handler, http.MethodPut, "/mortgage", sacMortgage, http.StatusOK)

			_, err := conn.ExecContext(t.Context(), "DROP TABLE "+tt.table)
			require.NoError(t, err)

			rec := serve(t, handler, tt.method, tt.path, tt.body)

			assert.Equal(t, http.StatusInternalServerError, rec.Code, rec.Body.String())
		})
	}
}

// A statement whose drift needs the index history fails to list without it.
func TestStatementsFailWithoutTheIndexHistory(t *testing.T) {
	t.Parallel()

	conn := migratedDatabase(t)
	handler := apiOver(conn)
	do(t, handler, http.MethodPut, "/mortgage", withField(t, "indexer", `"tr"`), http.StatusOK)

	_, err := conn.ExecContext(t.Context(), "DROP TABLE index_values")
	require.NoError(t, err)

	rec := serve(t, handler, http.MethodGet, "/mortgage/statements", "")

	assert.Equal(t, http.StatusInternalServerError, rec.Code, rec.Body.String())
}
