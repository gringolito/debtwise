package api_test

import (
	"encoding/json"
	"fmt"
	"net/http"
	"strings"
	"testing"
	"time"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

type lotComparison struct {
	AmountInvested string          `json:"amount_invested"`
	Maturity       *decisionAmount `json:"maturity"`
	Gain           string          `json:"gain"`
	Horizon        string          `json:"horizon"`
	Effect         string          `json:"effect"`
	Unavailable    string          `json:"unavailable"`
	Advantage      string          `json:"advantage"`
	ProjectedBy    []projectedBy   `json:"projected_by"`
}

// compareLot compares the lot body with prepaying, and returns the comparison as the API answers it.
func compareLot(t *testing.T, handler http.Handler, body string) lotComparison {
	t.Helper()

	var got lotComparison
	require.NoError(t, json.Unmarshal([]byte(do(t, handler, http.MethodPost, "/lots/comparison?effect=shorten_term", body, http.StatusOK)), &got))

	return got
}

// On 2026-07-10 the owner bought 5.00 LTN maturing on 2027-01-01 for 800.00 each, and compares the
// lot on 2026-10-28, without recording it. Held 175 days to maturity, the 1,000.00 gain pays 22.5%
// of income tax after the 4.79 custody fee. Prepaying the 4,000.00 instead on its purchase date
// leaves 4,000.00 less owed on the horizon on the interest-free mortgage, which avoids nothing, so
// the lot is better by its whole gain.
func TestALotComparesWithPrepayingOnItsPurchaseDate(t *testing.T) {
	t.Parallel()

	s := newServer(t, sgsWithRows(nil), quotingRadar(), onDay(date(2026, time.October, 28)))
	do(t, s.handler, http.MethodPut, "/mortgage", fmt.Sprintf(interestFreeMortgage, "none"), http.StatusOK)

	got := compareLot(t, s.handler, lotBody("ltn", "2027-01-01", "2026-07-10", "0.14", "800.00", "5.00"))

	assert.Equal(t, lotComparison{
		AmountInvested: "4000.00",
		Maturity:       &decisionAmount{Gross: "5000.00", IOF: "0.00", IncomeTax: "223.92", CustodyFee: "4.79", Net: "4771.29", ProjectedBy: []projectedBy{}},
		Gain:           "771.29",
		Horizon:        "2027-01-01",
		Effect:         "shorten_term",
		Advantage:      "771.29",
		ProjectedBy:    []projectedBy{},
	}, got)

	var recorded struct {
		Lots []lotRow `json:"lots"`
	}
	require.NoError(t, json.Unmarshal([]byte(do(t, s.handler, http.MethodGet, "/lots", "", http.StatusOK)), &recorded))
	assert.Empty(t, recorded.Lots)
}

// A mortgage charging 40% a year costs far more than an LTN bought at 11% a year earns, so prepaying
// the lot's amount invested on its purchase date wins.
func TestALotComparisonFavoursPrepayingWhenTheMortgageCostsMore(t *testing.T) {
	t.Parallel()

	s := newServer(t, sgsWithRows(nil), quotingRadar(), onDay(date(2026, time.October, 28)))
	do(t, s.handler, http.MethodPut, "/mortgage",
		strings.Replace(fmt.Sprintf(interestFreeMortgage, "none"), `"rate": "0"`, `"rate": "0.40"`, 1), http.StatusOK)

	got := compareLot(t, s.handler, lotBody("ltn", "2029-01-01", "2026-02-02", "0.11", "650.00", "10.00"))

	assert.Empty(t, got.Unavailable)
	assert.True(t, strings.HasPrefix(got.Advantage, "-"), got.Advantage)
}

// A lot bought before the mortgage's contract date still has its Maturity Value and gain, but no
// advantage, since there was nothing to prepay. An NTN-B Principal whose VNA needs IBGE's index
// number of June 2000, which this server never fetched, has neither.
func TestALotComparisonWithoutAnAdvantageSaysWhy(t *testing.T) {
	t.Parallel()

	s := newServer(t, sgsWithRows(nil), quotingRadar(), onDay(date(2026, time.October, 28)))
	do(t, s.handler, http.MethodPut, "/mortgage", fmt.Sprintf(interestFreeMortgage, "none"), http.StatusOK)

	before := compareLot(t, s.handler, lotBody("ltn", "2027-01-01", "2026-01-09", "0.14", "800.00", "5.00"))
	assert.Equal(t, "before_contract", before.Unavailable)
	assert.Equal(t, "4000.00", before.AmountInvested)
	require.NotNil(t, before.Maturity)
	assert.Equal(t, "5000.00", before.Maturity.Gross)
	assert.Equal(t, "792.18", before.Gain)
	assert.Empty(t, before.Advantage)

	missing := compareLot(t, s.handler, lotBody("ntn_b_principal", "2032-08-15", "2026-05-04", "0.07", "3200.00", "1.00"))
	assert.Equal(t, lotComparison{
		AmountInvested: "3200.00",
		Horizon:        "2032-08-15",
		Effect:         "shorten_term",
		Unavailable:    "missing_ipca",
		ProjectedBy:    []projectedBy{},
	}, missing)
}

func TestALotComparisonFailsWithoutAMortgageOrWithAnInvalidLotOrEffect(t *testing.T) {
	t.Parallel()

	s := newServer(t, sgsWithRows(nil), quotingRadar(), onDay(date(2026, time.October, 28)))
	valid := lotBody("ltn", "2027-01-01", "2026-07-10", "0.14", "800.00", "5.00")

	rec := serve(t, s.handler, http.MethodPost, "/lots/comparison?effect=shorten_term", valid)
	assert.Equal(t, http.StatusNotFound, rec.Code, rec.Body.String())
	assert.Contains(t, rec.Body.String(), "no mortgage is registered")

	do(t, s.handler, http.MethodPut, "/mortgage", fmt.Sprintf(interestFreeMortgage, "none"), http.StatusOK)

	tests := []struct {
		name, query, body string
		want              []errorDetail
	}{
		{name: "no effect", query: "", body: valid, want: []errorDetail{{"query.effect", "required query parameter is missing"}}},
		{
			name: "unknown effect", query: "?effect=skip_installment", body: valid,
			want: []errorDetail{{"query.effect", `expected value to be one of "shorten_term, lower_installment"`}},
		},
		{
			name: "bought after today", query: "?effect=shorten_term",
			body: lotBody("ltn", "2027-01-01", "2026-10-29", "0.14", "800.00", "5.00"),
			want: []errorDetail{{"body.purchase_date", "must not be after today"}},
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			t.Parallel()

			rec := serve(t, s.handler, http.MethodPost, "/lots/comparison"+tt.query, tt.body)
			require.Equal(t, http.StatusUnprocessableEntity, rec.Code, rec.Body.String())

			var problem struct {
				Errors []errorDetail `json:"errors"`
			}
			require.NoError(t, json.Unmarshal(rec.Body.Bytes(), &problem))
			assert.Equal(t, tt.want, problem.Errors)
		})
	}
}
