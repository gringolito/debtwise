package api_test

import (
	"net/http"
	"testing"
	"time"

	"github.com/stretchr/testify/assert"

	"github.com/gringolito/debtwise/backend/marketdata/sgs"
)

// Installments of sacMortgage are 10,640.50, 10,537.50, 10,434.50, 10,337.50, 10,232.50 and
// 10,127.50, each amortizing 10,000.00. Each prepayment is compared with the schedule that has the
// ones before it: the 20,000.00 on February 10 ends the schedule two months early and takes 206.00
// off the 3rd installment, which becomes 10,228.50. The 5,000.00 on March 10, after the 3rd
// installment, leaves 5,000.00 for the 4th, the last: 5,075.00 where 10,127.50 was due. The
// 100.00 after the last installment has none to change.
func TestPrepaymentOutcomesAreListed(t *testing.T) {
	t.Parallel()

	handler := registered(t)
	do(t, handler, http.MethodPost, "/mortgage/prepayments",
		`{"date": "2024-02-10", "amount": "20000.00", "effect": "shorten_term"}`, http.StatusCreated)
	do(t, handler, http.MethodPost, "/mortgage/prepayments",
		`{"date": "2024-03-10", "amount": "5000.00", "effect": "lower_installment"}`, http.StatusCreated)
	do(t, handler, http.MethodPost, "/mortgage/prepayments",
		`{"date": "2024-12-01", "amount": "100.00", "effect": "shorten_term"}`, http.StatusCreated)

	assert.JSONEq(t, `{"prepayments": [
		{"id": 1, "date": "2024-02-10", "amount": "20000.00", "effect": "shorten_term",
		 "months_shortened": 2, "installment_reduction": "206.00"},
		{"id": 2, "date": "2024-03-10", "amount": "5000.00", "effect": "lower_installment",
		 "months_shortened": 0, "installment_reduction": "5052.50"},
		{"id": 3, "date": "2024-12-01", "amount": "100.00", "effect": "shorten_term",
		 "months_shortened": 0, "installment_reduction": "0.00"}
	], "total_amount": "25100.00", "months_shortened": 2}`,
		do(t, handler, http.MethodGet, "/mortgage/prepayments", "", http.StatusOK))
}

// Previewing records nothing: the schedule and the list are as they were.
func TestPreviewsRecordNothing(t *testing.T) {
	t.Parallel()

	handler := registered(t)
	schedule := do(t, handler, http.MethodGet, "/mortgage/schedule", "", http.StatusOK)

	do(t, handler, http.MethodPost, "/mortgage/prepayments/preview",
		`{"date": "2024-02-10", "amount": "20000.00", "effect": "shorten_term"}`, http.StatusOK)
	do(t, handler, http.MethodPost, "/mortgage/statements/preview",
		`{"date": "2024-02-20", "outstanding_balance": "40123.45"}`, http.StatusOK)

	assert.JSONEq(t, `{"prepayments": [], "total_amount": "0.00", "months_shortened": 0}`,
		do(t, handler, http.MethodGet, "/mortgage/prepayments", "", http.StatusOK))
	assert.JSONEq(t, `{"statements": []}`, do(t, handler, http.MethodGet, "/mortgage/statements", "", http.StatusOK))
	assert.JSONEq(t, schedule, do(t, handler, http.MethodGet, "/mortgage/schedule", "", http.StatusOK))
}

// sacMortgage owes 40,000.00 after the 2nd installment. Prepaying 20,000.00 then keeps the 10,000.00
// amortization and ends the schedule on April 10, or keeps June 10 and halves the amortization
// the 3rd installment charges to 5,000.00. Prepaying 45,000.00 pays off the 40,000.00 owed, so no
// installment follows it, and 60,000.00 before the 1st installment pays everything off that day.
// The recorded prepayment is the one of 20,000.00 that shortens the term, which leaves the 3rd
// installment 10,228.50 and the schedule ending on April 10.
func TestPrepaymentIsPreviewed(t *testing.T) {
	t.Parallel()

	const recorded = `{"date": "2024-02-10", "amount": "20000.00", "effect": "shorten_term"}`

	tests := []struct {
		name     string
		recorded bool
		body     string
		want     string
	}{
		{
			name: "shortening the term",
			body: `{"date": "2024-02-10", "amount": "20000.00", "effect": "shorten_term"}`,
			want: `{"current_payoff_date": "2024-06-10", "payoff_date": "2024-04-10",
				"current_installment": "10434.50", "installment": "10228.50"}`,
		},
		{
			name: "lowering the installment",
			body: `{"date": "2024-02-10", "amount": "20000.00", "effect": "lower_installment"}`,
			want: `{"current_payoff_date": "2024-06-10", "payoff_date": "2024-06-10",
				"current_installment": "10434.50", "installment": "5228.50"}`,
		},
		{
			name: "after the last installment",
			body: `{"date": "2024-07-01", "amount": "1000.00", "effect": "shorten_term"}`,
			want: `{"current_payoff_date": "2024-06-10", "payoff_date": "2024-06-10"}`,
		},
		{
			name: "paying off the mortgage",
			body: `{"date": "2024-02-15", "amount": "45000.00", "effect": "shorten_term"}`,
			want: `{"current_payoff_date": "2024-06-10", "payoff_date": "2024-02-10", "current_installment": "10434.50"}`,
		},
		{
			name: "paying off the mortgage before the 1st installment",
			body: `{"date": "2023-12-20", "amount": "60000.00", "effect": "shorten_term"}`,
			want: `{"current_payoff_date": "2024-06-10", "payoff_date": "2023-12-20", "current_installment": "10640.50"}`,
		},
		{
			name:     "besides a recorded prepayment",
			recorded: true,
			body:     recorded,
			want: `{"current_payoff_date": "2024-04-10", "payoff_date": "2024-02-10",
				"current_installment": "10228.50"}`,
		},
		{
			name:     "replacing a recorded prepayment with itself",
			recorded: true,
			body:     `{"date": "2024-02-10", "amount": "20000.00", "effect": "shorten_term", "replaces": 1}`,
			want: `{"current_payoff_date": "2024-04-10", "payoff_date": "2024-04-10",
				"current_installment": "10228.50", "installment": "10228.50"}`,
		},
		{
			name:     "replacing a recorded prepayment with another",
			recorded: true,
			body:     `{"date": "2024-02-10", "amount": "20000.00", "effect": "lower_installment", "replaces": 1}`,
			want: `{"current_payoff_date": "2024-04-10", "payoff_date": "2024-06-10",
				"current_installment": "10228.50", "installment": "5228.50"}`,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			t.Parallel()

			handler := registered(t)
			if tt.recorded {
				do(t, handler, http.MethodPost, "/mortgage/prepayments", recorded, http.StatusCreated)
			}

			assert.JSONEq(t, tt.want, do(t, handler, http.MethodPost, "/mortgage/prepayments/preview", tt.body, http.StatusOK))
		})
	}
}

// The statements recorded are 40,123.45 on February 20, which the schedule computed as 40,000.00,
// and 10,000.00 on May 20. A statement is compared with the balance the schedule computes from the
// statements before it, the one it replaces left out: 30,000.00 on March 20 without the first, and
// 30,092.59 with it.
func TestStatementIsPreviewed(t *testing.T) {
	t.Parallel()

	tests := []struct {
		name     string
		recorded bool
		body     string
		want     string
	}{
		{
			name: "a statement of more than computed",
			body: `{"date": "2024-02-20", "outstanding_balance": "40123.45"}`,
			want: `{"computed_balance": "40000.00", "drift": "123.45", "within_rounding": false}`,
		},
		{
			name: "a statement of what is computed",
			body: `{"date": "2024-05-20", "outstanding_balance": "10000.00"}`,
			want: `{"computed_balance": "10000.00", "drift": "0.00", "within_rounding": true}`,
		},
		{
			name: "a statement of less than computed, within 0.001% of it",
			body: `{"date": "2024-05-20", "outstanding_balance": "9999.91"}`,
			want: `{"computed_balance": "10000.00", "drift": "-0.09", "within_rounding": true}`,
		},
		{
			name: "a statement of 0.001% less than computed",
			body: `{"date": "2024-05-20", "outstanding_balance": "9999.90"}`,
			want: `{"computed_balance": "10000.00", "drift": "-0.10", "within_rounding": false}`,
		},
		{
			name: "a statement of a real more than computed",
			body: `{"date": "2024-05-20", "outstanding_balance": "10001.00"}`,
			want: `{"computed_balance": "10000.00", "drift": "1.00", "within_rounding": false}`,
		},
		{
			name: "a statement of a real less than computed",
			body: `{"date": "2024-05-20", "outstanding_balance": "9999.00"}`,
			want: `{"computed_balance": "10000.00", "drift": "-1.00", "within_rounding": false}`,
		},
		{
			name:     "a statement after a recorded one",
			recorded: true,
			body:     `{"date": "2024-03-20", "outstanding_balance": "30001.00"}`,
			want:     `{"computed_balance": "30092.59", "drift": "-91.59", "within_rounding": false}`,
		},
		{
			name:     "a statement before a recorded one",
			recorded: true,
			body:     `{"date": "2024-01-20", "outstanding_balance": "49000.00"}`,
			want:     `{"computed_balance": "50000.00", "drift": "-1000.00", "within_rounding": false}`,
		},
		{
			name:     "replacing a recorded statement on its date",
			recorded: true,
			body:     `{"date": "2024-02-20", "outstanding_balance": "40000.39", "replaces": 1}`,
			want:     `{"computed_balance": "40000.00", "drift": "0.39", "within_rounding": true}`,
		},
		{
			name:     "replacing a recorded statement with one on another date",
			recorded: true,
			body:     `{"date": "2024-03-20", "outstanding_balance": "30001.00", "replaces": 1}`,
			want:     `{"computed_balance": "30000.00", "drift": "1.00", "within_rounding": false}`,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			t.Parallel()

			handler := registered(t)
			if tt.recorded {
				do(t, handler, http.MethodPost, "/mortgage/statements",
					`{"date": "2024-02-20", "outstanding_balance": "40123.45"}`, http.StatusCreated)
				do(t, handler, http.MethodPost, "/mortgage/statements",
					`{"date": "2024-05-20", "outstanding_balance": "10000.00"}`, http.StatusCreated)
			}

			assert.JSONEq(t, tt.want, do(t, handler, http.MethodPost, "/mortgage/statements/preview", tt.body, http.StatusOK))
		})
	}
}

// Previews and outcomes replay at the clock's today, as the schedule does. The mortgage is the one of
// TestStatementDriftsReadTheClock: TR-indexed, 8 installments from 2026-07-01 under SAC at 1% a
// month, with no insurance or fee, owing 30,030.01 after the 4th on 2026-10-01. The 5th, due on
// November 1, is corrected by the TR of October: projected at 0.0200% on 2026-10-15, so 6.01 and
// 30,036.02 to amortize over the 4 months left, 7,509.01 and 300.36 interest, 7,809.37; missing on
// 2026-12-15, when that installment is due by today, so 30,030.01, 7,507.50 and 300.30, 7,807.80.
// Prepaying 10,000.00 on October 1, keeping the 4 months left, leaves 20,030.01: corrected by 4.01 to
// 20,034.02, the 5th is 5,008.51 and 200.34, 5,208.85; not corrected, 5,007.50 and 200.30, 5,207.80.
// A statement on December 20 compares 20,000.00 with the 15,021.01 and 15,015.01 left after the 6th.
func TestPreviewsAndOutcomesReadTheClock(t *testing.T) {
	t.Parallel()

	tests := []struct {
		name           string
		today          time.Time
		wantPrepayment string
		wantStatement  string
		wantReduction  string
	}{
		{
			name:  "installments that are not due yet are projected",
			today: date(2026, time.October, 15),
			wantPrepayment: `{"current_payoff_date": "2027-02-01", "payoff_date": "2027-02-01",
				"current_installment": "7809.37", "installment": "5208.85"}`,
			wantStatement: `{"computed_balance": "15021.01", "drift": "4978.99", "within_rounding": false}`,
			wantReduction: "2600.52",
		},
		{
			name:  "installments due by today are not",
			today: date(2026, time.December, 15),
			wantPrepayment: `{"current_payoff_date": "2027-02-01", "payoff_date": "2027-02-01",
				"current_installment": "7807.80", "installment": "5207.80"}`,
			wantStatement: `{"computed_balance": "15015.01", "drift": "4984.99", "within_rounding": false}`,
			wantReduction: "2600.00",
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			t.Parallel()

			s := newServer(t, sgsWithRows(map[int][]sgs.Observation{226: monthlyTR()}), quotingRadar(), onDay(tt.today))
			do(t, s.handler, http.MethodPut, "/mortgage",
				indexedMortgage("tr", "60000.00", "2026-06-01", "2026-07-01", 8), http.StatusOK)

			const prepayment = `{"date": "2026-10-01", "amount": "10000.00", "effect": "lower_installment"}`

			assert.JSONEq(t, tt.wantPrepayment,
				do(t, s.handler, http.MethodPost, "/mortgage/prepayments/preview", prepayment, http.StatusOK))
			assert.JSONEq(t, tt.wantStatement, do(t, s.handler, http.MethodPost, "/mortgage/statements/preview",
				`{"date": "2026-12-20", "outstanding_balance": "20000.00"}`, http.StatusOK))

			do(t, s.handler, http.MethodPost, "/mortgage/prepayments", prepayment, http.StatusCreated)

			assert.JSONEq(t, `{"prepayments": [
				{"id": 1, "date": "2026-10-01", "amount": "10000.00", "effect": "lower_installment",
				 "months_shortened": 0, "installment_reduction": "`+tt.wantReduction+`"}
			], "total_amount": "10000.00", "months_shortened": 0}`,
				do(t, s.handler, http.MethodGet, "/mortgage/prepayments", "", http.StatusOK))
		})
	}
}
