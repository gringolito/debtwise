package api_test

import (
	"encoding/json"
	"net/http"
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

const questionPath = "/dashboard/question"

func TestDashboardQuestionIsTenThousandToShortenTheTermUntilSaved(t *testing.T) {
	t.Parallel()

	assert.JSONEq(t, `{"amount": "10000.00", "effect": "shorten_term"}`,
		do(t, newAPI(t), http.MethodGet, questionPath, "", http.StatusOK))
}

func TestSavedDashboardQuestionIsReadBack(t *testing.T) {
	t.Parallel()

	tests := []struct {
		name string
		body string
	}{
		{name: "an amount to lower the installment", body: `{"amount": "5000.50", "effect": "lower_installment"}`},
		{name: "an amount too small to buy any bond", body: `{"amount": "0.01", "effect": "shorten_term"}`},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			t.Parallel()

			handler := newAPI(t)
			do(t, handler, http.MethodPut, questionPath, `{"amount": "20000.00", "effect": "shorten_term"}`, http.StatusOK)

			assert.JSONEq(t, tt.body, do(t, handler, http.MethodPut, questionPath, tt.body, http.StatusOK))
			assert.JSONEq(t, tt.body, do(t, handler, http.MethodGet, questionPath, "", http.StatusOK))
		})
	}
}

func TestInvalidDashboardQuestionIsRejectedAndNotSaved(t *testing.T) {
	t.Parallel()

	tests := []struct {
		name string
		body string
		want []ruleDetail
	}{
		{
			name: "an amount of zero",
			body: `{"amount": "0.00", "effect": "lower_installment"}`,
			want: []ruleDetail{{"body.amount", "not_positive"}},
		},
		{
			name: "a negative amount",
			body: `{"amount": "-5000.00", "effect": "lower_installment"}`,
			want: []ruleDetail{{"body.amount", ""}},
		},
		{
			name: "an amount with fractions of a centavo",
			body: `{"amount": "5000.001", "effect": "lower_installment"}`,
			want: []ruleDetail{{"body.amount", ""}},
		},
		{
			name: "an amount that is not a number",
			body: `{"amount": "cinco mil", "effect": "lower_installment"}`,
			want: []ruleDetail{{"body.amount", ""}},
		},
		{
			name: "an effect prepaying does not have",
			body: `{"amount": "5000.00", "effect": "skip_installments"}`,
			want: []ruleDetail{{"body.effect", ""}},
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			t.Parallel()

			handler := newAPI(t)
			saved := `{"amount": "20000.00", "effect": "shorten_term"}`
			do(t, handler, http.MethodPut, questionPath, saved, http.StatusOK)

			rec := serve(t, handler, http.MethodPut, questionPath, tt.body)
			require.Equal(t, http.StatusUnprocessableEntity, rec.Code, rec.Body.String())

			var problem struct {
				Errors []ruleDetail `json:"errors"`
			}
			require.NoError(t, json.Unmarshal(rec.Body.Bytes(), &problem))
			assert.Equal(t, tt.want, problem.Errors)

			assert.JSONEq(t, saved, do(t, handler, http.MethodGet, questionPath, "", http.StatusOK), "the saved question")
		})
	}
}
