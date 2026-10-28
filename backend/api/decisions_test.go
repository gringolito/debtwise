package api_test

import (
	"encoding/json"
	"fmt"
	"net/http"
	"testing"
	"time"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

// interestFreeMortgage lends 24,000.00 on 2026-01-10 over 24 months under SAC at no interest, with
// no indexer, insurance or fee: every installment amortizes 1,000.00, and after the one of
// 2026-10-10, 15,000.00 is owed over the 15 months left.
const interestFreeMortgage = `{
	"contract_date": "2026-01-10",
	"original_amount": "24000.00",
	"term_months": 24,
	"first_installment_date": "2026-02-10",
	"amortization_system": "sac",
	"indexer": %q,
	"appraisal_value": "100000.00",
	"contract_rates": [{"effective_from": "2026-01-10", "rate": "0", "basis": "effective"}],
	"mip_rates": [{"effective_from": "2026-01-10", "rate": "0"}],
	"dfi_rates": [{"effective_from": "2026-01-10", "rate": "0"}],
	"fees": [{"effective_from": "2026-01-10", "amount": "0.00"}]
}`

type decisionAmount struct {
	Gross       string        `json:"gross"`
	IOF         string        `json:"iof"`
	IncomeTax   string        `json:"income_tax"`
	CustodyFee  string        `json:"custody_fee"`
	Net         string        `json:"net"`
	ProjectedBy []projectedBy `json:"projected_by"`
}

type decisionInstallment struct {
	Number int    `json:"number"`
	Amount string `json:"amount"`
}

type decisionFlow struct {
	Date               string               `json:"date"`
	Installment        *decisionInstallment `json:"installment"`
	Invested           string               `json:"invested"`
	Prepaid            string               `json:"prepaid"`
	Held               string               `json:"held"`
	Redeemed           *decisionAmount      `json:"redeemed"`
	OutstandingBalance string               `json:"outstanding_balance"`
}

type decisionScenario struct {
	NetWorth           string          `json:"net_worth"`
	Cash               string          `json:"cash"`
	OutstandingBalance string          `json:"outstanding_balance"`
	Bond               *decisionAmount `json:"bond"`
	CashFlows          []decisionFlow  `json:"cash_flows"`
}

type verdictMarketData struct {
	Bonds   freshness     `json:"bonds"`
	Focus   freshness     `json:"focus"`
	Indexes []indexStatus `json:"indexes"`
}

type decisionVerdict struct {
	Type        string            `json:"type"`
	Maturity    string            `json:"maturity"`
	Rate        string            `json:"rate"`
	Unavailable string            `json:"unavailable"`
	UnitPrice   string            `json:"unit_price"`
	Quantity    string            `json:"quantity"`
	Advantage   string            `json:"advantage"`
	AvoidedCost string            `json:"avoided_cost"`
	Invest      *decisionScenario `json:"invest"`
	Prepay      *decisionScenario `json:"prepay"`
	ProjectedBy []projectedBy     `json:"projected_by"`
	MarketData  verdictMarketData `json:"market_data"`
}

type decisionResult struct {
	Amount   string            `json:"amount"`
	Date     string            `json:"date"`
	Effect   string            `json:"effect"`
	Verdicts []decisionVerdict `json:"verdicts"`
}

// installmentFlow is a cash flow on an installment's due date.
func installmentFlow(day string, number int, amount, prepaid, held, balance string) decisionFlow {
	return decisionFlow{
		Date: day, Installment: &decisionInstallment{Number: number, Amount: amount},
		Invested: "0.00", Prepaid: prepaid, Held: held, OutstandingBalance: balance,
	}
}

// heldFlow is the 1,000.00 installment of the status quo held on its due date once the mortgage is
// paid off.
func heldFlow(day string) decisionFlow {
	return decisionFlow{Date: day, Invested: "0.00", Prepaid: "0.00", Held: "1000.00", OutstandingBalance: "0.00"}
}

func (s server) decide(t *testing.T, body string) decisionResult {
	t.Helper()

	var got decisionResult
	require.NoError(t, json.Unmarshal([]byte(do(t, s.handler, http.MethodPost, "/decisions", body, http.StatusOK)), &got))

	return got
}

// On 2026-10-28, 5,000.00 either prepays the interest-free mortgage or buys LTN maturing on
// 2029-01-01, the only bond on offer that follows a mortgage without an indexer. At its buy rate of
// 12.76%, over the 543 business days ANBIMA's calendar counts to its maturity, an LTN costs
// 772.001684, so 5,000.00 buys 6.47 of them for 4,994.85 and the 5.15 left is prepaid. Held 796 days,
// they pay 6,470.00, less 28.22 of custody fee at 0.20% a year and 217.04 of income tax at 15% on
// the gain: 6,224.74. The figures are worked out in Python's decimal module.
//
// Prepaying shortens the mortgage by 5 months, so the 5,000.00 it would have paid from 2027-09-10
// to 2028-01-10 is held. Investing prepays the 5.15 left, which lowers each SAC installment by a
// few centavos that equal outflow prepays too, so the last installment is 5.15 short of 1,000.00.
// With no interest, prepaying avoids nothing, and the advantage is the bond's net gain.
func TestADecisionComparesPrepayingWithBuyingEachBondOnOffer(t *testing.T) {
	t.Parallel()

	s := newServer(t, sgsWithRows(nil), quotingRadar(), onDay(date(2026, time.October, 28)))
	do(t, s.handler, http.MethodPut, "/mortgage", fmt.Sprintf(interestFreeMortgage, "none"), http.StatusOK)

	got := s.decide(t, `{"amount": "5000.00", "effect": "shorten_term"}`)
	status := s.status(t)

	require.Len(t, got.Verdicts, 1)
	assert.Equal(t, "5000.00", got.Amount)
	assert.Equal(t, "2026-10-28", got.Date, "today by default")
	assert.Equal(t, "shorten_term", got.Effect)

	v := got.Verdicts[0]
	assert.Equal(t, "ltn", v.Type)
	assert.Equal(t, "2029-01-01", v.Maturity)
	assert.Equal(t, "0.1276", v.Rate)
	assert.Empty(t, v.Unavailable)
	assert.Equal(t, "772.001684", v.UnitPrice)
	assert.Equal(t, "6.47", v.Quantity)
	assert.Equal(t, "1229.89", v.Advantage)
	assert.Equal(t, "0.00", v.AvoidedCost)
	assert.Equal(t, []projectedBy{}, v.ProjectedBy)
	assert.Equal(t, verdictMarketData{Bonds: status.Bonds, Focus: status.Focus, Indexes: []indexStatus{}}, v.MarketData)

	maturity := &decisionAmount{
		Gross: "6470.00", IOF: "0.00", IncomeTax: "217.04", CustodyFee: "28.22", Net: "6224.74", ProjectedBy: []projectedBy{},
	}

	require.NotNil(t, v.Prepay)
	assert.Equal(t, decisionScenario{
		NetWorth: "5000.00", Cash: "5000.00", OutstandingBalance: "0.00",
		CashFlows: []decisionFlow{
			{Date: "2026-10-28", Invested: "0.00", Prepaid: "5000.00", Held: "0.00", OutstandingBalance: "10000.00"},
			installmentFlow("2026-11-10", 10, "1000.00", "0.00", "0.00", "9000.00"),
			installmentFlow("2026-12-10", 11, "1000.00", "0.00", "0.00", "8000.00"),
			installmentFlow("2027-01-10", 12, "1000.00", "0.00", "0.00", "7000.00"),
			installmentFlow("2027-02-10", 13, "1000.00", "0.00", "0.00", "6000.00"),
			installmentFlow("2027-03-10", 14, "1000.00", "0.00", "0.00", "5000.00"),
			installmentFlow("2027-04-10", 15, "1000.00", "0.00", "0.00", "4000.00"),
			installmentFlow("2027-05-10", 16, "1000.00", "0.00", "0.00", "3000.00"),
			installmentFlow("2027-06-10", 17, "1000.00", "0.00", "0.00", "2000.00"),
			installmentFlow("2027-07-10", 18, "1000.00", "0.00", "0.00", "1000.00"),
			installmentFlow("2027-08-10", 19, "1000.00", "0.00", "0.00", "0.00"),
			heldFlow("2027-09-10"),
			heldFlow("2027-10-10"),
			heldFlow("2027-11-10"),
			heldFlow("2027-12-10"),
			heldFlow("2028-01-10"),
			{Date: "2029-01-01", Invested: "0.00", Prepaid: "0.00", Held: "0.00", OutstandingBalance: "0.00"},
		},
	}, *v.Prepay)

	require.NotNil(t, v.Invest)
	assert.Equal(t, decisionScenario{
		NetWorth: "6229.89", Cash: "5.15", OutstandingBalance: "0.00", Bond: maturity,
		CashFlows: []decisionFlow{
			{Date: "2026-10-28", Invested: "4994.85", Prepaid: "5.15", Held: "0.00", OutstandingBalance: "14994.85"},
			installmentFlow("2026-11-10", 10, "999.66", "0.34", "0.00", "13994.85"),
			installmentFlow("2026-12-10", 11, "999.63", "0.37", "0.00", "12994.85"),
			installmentFlow("2027-01-10", 12, "999.60", "0.40", "0.00", "11994.85"),
			installmentFlow("2027-02-10", 13, "999.57", "0.43", "0.00", "10994.85"),
			installmentFlow("2027-03-10", 14, "999.53", "0.47", "0.00", "9994.85"),
			installmentFlow("2027-04-10", 15, "999.49", "0.51", "0.00", "8994.85"),
			installmentFlow("2027-05-10", 16, "999.43", "0.57", "0.00", "7994.85"),
			installmentFlow("2027-06-10", 17, "999.36", "0.64", "0.00", "6994.85"),
			installmentFlow("2027-07-10", 18, "999.26", "0.74", "0.00", "5994.85"),
			installmentFlow("2027-08-10", 19, "999.14", "0.86", "0.00", "4994.85"),
			installmentFlow("2027-09-10", 20, "998.97", "1.03", "0.00", "3994.85"),
			installmentFlow("2027-10-10", 21, "998.71", "1.29", "0.00", "2994.85"),
			installmentFlow("2027-11-10", 22, "998.28", "1.72", "0.00", "1994.85"),
			installmentFlow("2027-12-10", 23, "997.43", "2.57", "0.00", "994.85"),
			installmentFlow("2028-01-10", 24, "994.85", "0.00", "5.15", "0.00"),
			{Date: "2029-01-01", Invested: "0.00", Prepaid: "0.00", Held: "0.00", Redeemed: maturity, OutstandingBalance: "0.00"},
		},
	}, *v.Invest)
}

// An IPCA mortgage is compared with the NTN-B Principal on offer, whose VNA needs IBGE's index
// number of June 2000, which this server never fetched. Its verdict says the IPCA is missing, and
// names how fresh the IPCA and its index numbers are.
func TestAnNTNBPrincipalVerdictWithoutTheIPCAItFollowsIsUnavailable(t *testing.T) {
	t.Parallel()

	s := newServer(t, sgsWithRows(nil), quotingRadar(), onDay(date(2026, time.October, 28)))
	do(t, s.handler, http.MethodPut, "/mortgage", fmt.Sprintf(interestFreeMortgage, "ipca"), http.StatusOK)

	got := s.decide(t, `{"amount": "5000.00", "date": "2026-11-03", "effect": "lower_installment"}`)
	status := s.status(t)

	var ipcaStatuses []indexStatus

	for _, index := range status.Indexes {
		if index.Index == "ipca" || index.Index == "ipca_number" {
			ipcaStatuses = append(ipcaStatuses, index)
		}
	}

	assert.Equal(t, decisionResult{
		Amount: "5000.00", Date: "2026-11-03", Effect: "lower_installment",
		Verdicts: []decisionVerdict{{
			Type: "ntn_b_principal", Maturity: "2032-08-15", Rate: "0.0672", Unavailable: "missing_ipca",
			ProjectedBy: []projectedBy{},
			MarketData:  verdictMarketData{Bonds: status.Bonds, Focus: status.Focus, Indexes: ipcaStatuses},
		}},
	}, got)
}

// 7.71 buys less than a hundredth of the LTN on offer, at 772.001684 a bond, so its verdict has the
// price and no scenarios.
func TestAnAmountBelowAHundredthOfTheBondHasNoScenarios(t *testing.T) {
	t.Parallel()

	s := newServer(t, sgsWithRows(nil), quotingRadar(), onDay(date(2026, time.October, 28)))
	do(t, s.handler, http.MethodPut, "/mortgage", fmt.Sprintf(interestFreeMortgage, "none"), http.StatusOK)

	got := s.decide(t, `{"amount": "7.71", "effect": "shorten_term"}`)
	status := s.status(t)

	assert.Equal(t, decisionResult{
		Amount: "7.71", Date: "2026-10-28", Effect: "shorten_term",
		Verdicts: []decisionVerdict{{
			Type: "ltn", Maturity: "2029-01-01", Rate: "0.1276", Unavailable: "amount_too_small",
			UnitPrice: "772.001684", Quantity: "0.00", ProjectedBy: []projectedBy{},
			MarketData: verdictMarketData{Bonds: status.Bonds, Focus: status.Focus, Indexes: []indexStatus{}},
		}},
	}, got)
}

func TestADecisionFailsWithoutAMortgageOrWithAnInvalidRequest(t *testing.T) {
	t.Parallel()

	const moneyPattern = `expected string to match pattern ^(0|[1-9][0-9]{0,14})(\.[0-9]{1,2})?$`

	s := newServer(t, sgsWithRows(nil), quotingRadar(), onDay(date(2026, time.October, 28)))

	rec := serve(t, s.handler, http.MethodPost, "/decisions", `{"amount": "5000.00", "effect": "shorten_term"}`)
	assert.Equal(t, http.StatusNotFound, rec.Code, rec.Body.String())

	do(t, s.handler, http.MethodPut, "/mortgage", fmt.Sprintf(interestFreeMortgage, "none"), http.StatusOK)

	tests := []struct {
		name string
		body string
		want []errorDetail
	}{
		{
			name: "date before today",
			body: `{"amount": "5000.00", "date": "2026-10-27", "effect": "shorten_term"}`,
			want: []errorDetail{{"body.date", "must not be before today"}},
		},
		{
			name: "zero amount",
			body: `{"amount": "0.00", "effect": "shorten_term"}`,
			want: []errorDetail{{"body.amount", "must be greater than zero"}},
		},
		{
			name: "amount below a centavo",
			body: `{"amount": "10.001", "effect": "shorten_term"}`,
			want: []errorDetail{{"body.amount", moneyPattern}},
		},
		{
			name: "unknown effect",
			body: `{"amount": "10.00", "effect": "skip_installment"}`,
			want: []errorDetail{{"body.effect", `expected value to be one of "shorten_term, lower_installment"`}},
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			t.Parallel()

			rec := serve(t, s.handler, http.MethodPost, "/decisions", tt.body)
			require.Equal(t, http.StatusUnprocessableEntity, rec.Code, rec.Body.String())

			var problem struct {
				Errors []errorDetail `json:"errors"`
			}
			require.NoError(t, json.Unmarshal(rec.Body.Bytes(), &problem))
			assert.Equal(t, tt.want, problem.Errors)
		})
	}
}
