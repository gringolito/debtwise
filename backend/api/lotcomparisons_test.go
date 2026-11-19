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
func compareLot(t *testing.T, handler http.Handler, effect, body string) lotComparison {
	t.Helper()

	var got lotComparison
	require.NoError(t, json.Unmarshal([]byte(do(t, handler, http.MethodPost, "/lots/comparison?effect="+effect, body, http.StatusOK)), &got))

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

	got := compareLot(t, s.handler, "shorten_term", lotBody("ltn", "2027-01-01", "2026-07-10", "0.14", "800.00", "5.00"))

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

// expensiveLongMortgage lends 300,000.00 on 2026-01-10 over 360 months under Price at 40% a year,
// with no indexer, insurance or fee, due on the 10th from 2026-02-10. It is long enough that the
// mortgage is still being paid on any horizon of these tests, and its 2.8436% a month (1.4^(1/12) - 1)
// makes each month of a shortened term worth much more than the bonds yield.
func expensiveLongMortgage() string {
	body := fmt.Sprintf(interestFreeMortgage, "none")
	for _, r := range [][2]string{
		{`"original_amount": "24000.00"`, `"original_amount": "300000.00"`},
		{`"term_months": 24`, `"term_months": 360`},
		{`"amortization_system": "sac"`, `"amortization_system": "price"`},
		{`"rate": "0"`, `"rate": "0.40"`},
	} {
		body = strings.Replace(body, r[0], r[1], 1)
	}

	return body
}

// A mortgage charging 40% a year over 360 months makes prepaying win a lot comparison when it shortens
// the term, even with the installment's slack ignored. The lot's 6,500.00 invested on 2026-02-02,
// before the first installment, is held 1,064 days to the horizon of 2029-01-01, 10,000.00 gross: the
// 58.30 custody fee is 0.20% a year of it over 1,064 days, and income tax of 15% on the 3,500.00 gain
// left after it is 516.26, which leaves 9,425.44 net. Holding the lot pays 35 installments to
// 2028-12-10 and owes 299,979.32 (Price amortizes 20.68 in all, at 8,531.20 a month). Prepaying
// 6,500.00 shortens the term to 137 months, 293,500.00 over which needs at most that 8,531.20 (over
// 136 it needs 8,534.40), and its 35 installments leave 282,760.79 owed: 17,218.53 less than holding,
// beyond the 6,500.00 itself because each installment amortizes more of a shorter term. Investing is
// worth 9,425.44 - 17,218.53 = -7,793.09 more than prepaying. Lowering the installment keeps the
// 360 months, so the same prepayment amortizes only 6,499.75 more, 293,479.57 owed, and what it saves
// each month is the slack nothing prepays: investing is better by 2,925.69.
func TestALotComparisonFavoursPrepayingWhenTheMortgageCostsMoreAndTheTermIsShortened(t *testing.T) {
	t.Parallel()

	s := newServer(t, sgsWithRows(nil), quotingRadar(), onDay(date(2026, time.October, 28)))
	do(t, s.handler, http.MethodPut, "/mortgage", expensiveLongMortgage(), http.StatusOK)

	body := lotBody("ltn", "2029-01-01", "2026-02-02", "0.11", "650.00", "10.00")
	shortened := compareLot(t, s.handler, "shorten_term", body)
	lowered := compareLot(t, s.handler, "lower_installment", body)

	assert.Equal(t, "shorten_term", shortened.Effect)
	assert.Equal(t, "lower_installment", lowered.Effect)

	maturity := &decisionAmount{Gross: "10000.00", IOF: "0.00", IncomeTax: "516.26", CustodyFee: "58.30", Net: "9425.44", ProjectedBy: []projectedBy{}}

	for _, c := range []lotComparison{shortened, lowered} {
		assert.Empty(t, c.Unavailable)
		assert.Equal(t, "6500.00", c.AmountInvested)
		assert.Equal(t, maturity, c.Maturity)
		assert.Equal(t, "2925.44", c.Gain)
	}

	assert.Equal(t, "-7793.09", shortened.Advantage)
	assert.Equal(t, "2925.69", lowered.Advantage)
}

// A lot bought before the mortgage's contract date still has its Maturity Value and gain, but no
// advantage, since there was nothing to prepay. An NTN-B Principal whose VNA needs IBGE's index
// number of June 2000, which this server never fetched, has neither.
func TestALotComparisonWithoutAnAdvantageSaysWhy(t *testing.T) {
	t.Parallel()

	s := newServer(t, sgsWithRows(nil), quotingRadar(), onDay(date(2026, time.October, 28)))
	do(t, s.handler, http.MethodPut, "/mortgage", fmt.Sprintf(interestFreeMortgage, "none"), http.StatusOK)

	before := compareLot(t, s.handler, "shorten_term", lotBody("ltn", "2027-01-01", "2026-01-09", "0.14", "800.00", "5.00"))
	assert.Equal(t, "before_contract", before.Unavailable)
	assert.Equal(t, "4000.00", before.AmountInvested)
	require.NotNil(t, before.Maturity)
	assert.Equal(t, "5000.00", before.Maturity.Gross)
	assert.Equal(t, "792.18", before.Gain)
	assert.Empty(t, before.Advantage)

	missing := compareLot(t, s.handler, "shorten_term", lotBody("ntn_b_principal", "2032-08-15", "2026-05-04", "0.07", "3200.00", "1.00"))
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
