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
	Coupon             *decisionAmount      `json:"coupon"`
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
func installmentFlow(day string, number int, balance string) decisionFlow {
	return decisionFlow{
		Date: day, Installment: &decisionInstallment{Number: number, Amount: "1000.00"},
		Invested: "0.00", Prepaid: "0.00", Held: "0.00", OutstandingBalance: balance,
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

// On 2026-10-28, 5,000.00 either prepays the interest-free mortgage or buys one of the bonds on
// offer that follow a mortgage without an indexer: the LTN maturing on 2029-01-01, and next to it
// the NTN-F maturing on 2037-01-01. At its buy rate of 12.76%, over the 543 business days ANBIMA's
// calendar counts to its maturity, an LTN costs 772.001684, so 5,000.00 buys 6.47 of them for
// 4,994.85 and the 5.15 left is held. Held 796 days, they pay 6,470.00, less 28.22 of custody fee
// at 0.20% a year and 217.04 of income tax at 15% on the gain: 6,224.74. The figures are worked out
// in Python's decimal module.
//
// Prepaying shortens the mortgage by 5 months, so the 5,000.00 it would have paid from 2027-09-10
// to 2028-01-10 is held. Investing leaves the mortgage unchanged and holds 5.15 from the start.
// With no interest, prepaying avoids nothing, and the advantage is the bond's net gain.
//
// The NTN-F costs 880.904015 at 12.88%, so 5,000.00 buys 5.67 of them. Its first coupon, on
// 2027-01-01, pays 276.75, but only 23.62 of income tax: most of it returns the interest the price
// paid for. Its 251.31 net is prepaid that day, off the 13,000.00 owed since 2026-12-10.
func TestADecisionComparesPrepayingWithBuyingEachBondOnOffer(t *testing.T) {
	t.Parallel()

	s := newServer(t, sgsWithRows(nil), quotingRadar(), onDay(date(2026, time.October, 28)))
	do(t, s.handler, http.MethodPut, "/mortgage", fmt.Sprintf(interestFreeMortgage, "none"), http.StatusOK)

	got := s.decide(t, `{"amount": "5000.00", "effect": "shorten_term"}`)
	status := s.status(t)

	require.Len(t, got.Verdicts, 2)
	assert.Equal(t, "5000.00", got.Amount)
	assert.Equal(t, "2026-10-28", got.Date, "today by default")
	assert.Equal(t, "shorten_term", got.Effect)

	ntnf := got.Verdicts[1]
	assert.Equal(t, "ntn_f", ntnf.Type)
	assert.Equal(t, "2037-01-01", ntnf.Maturity)
	assert.Equal(t, "880.904015", ntnf.UnitPrice)
	assert.Equal(t, "5.67", ntnf.Quantity)
	require.NotNil(t, ntnf.Invest)
	assert.Contains(t, ntnf.Invest.CashFlows, decisionFlow{
		Date: "2027-01-01", Invested: "0.00", Prepaid: "251.31", Held: "0.00", OutstandingBalance: "12748.69",
		Coupon: &decisionAmount{
			Gross: "276.75", IOF: "0.00", IncomeTax: "23.62", CustodyFee: "1.82", Net: "251.31", ProjectedBy: []projectedBy{},
		},
	})

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
			installmentFlow("2026-11-10", 10, "9000.00"),
			installmentFlow("2026-12-10", 11, "8000.00"),
			installmentFlow("2027-01-10", 12, "7000.00"),
			installmentFlow("2027-02-10", 13, "6000.00"),
			installmentFlow("2027-03-10", 14, "5000.00"),
			installmentFlow("2027-04-10", 15, "4000.00"),
			installmentFlow("2027-05-10", 16, "3000.00"),
			installmentFlow("2027-06-10", 17, "2000.00"),
			installmentFlow("2027-07-10", 18, "1000.00"),
			installmentFlow("2027-08-10", 19, "0.00"),
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
			{Date: "2026-10-28", Invested: "4994.85", Prepaid: "0.00", Held: "5.15", OutstandingBalance: "15000.00"},
			installmentFlow("2026-11-10", 10, "14000.00"),
			installmentFlow("2026-12-10", 11, "13000.00"),
			installmentFlow("2027-01-10", 12, "12000.00"),
			installmentFlow("2027-02-10", 13, "11000.00"),
			installmentFlow("2027-03-10", 14, "10000.00"),
			installmentFlow("2027-04-10", 15, "9000.00"),
			installmentFlow("2027-05-10", 16, "8000.00"),
			installmentFlow("2027-06-10", 17, "7000.00"),
			installmentFlow("2027-07-10", 18, "6000.00"),
			installmentFlow("2027-08-10", 19, "5000.00"),
			installmentFlow("2027-09-10", 20, "4000.00"),
			installmentFlow("2027-10-10", 21, "3000.00"),
			installmentFlow("2027-11-10", 22, "2000.00"),
			installmentFlow("2027-12-10", 23, "1000.00"),
			installmentFlow("2028-01-10", 24, "0.00"),
			{Date: "2029-01-01", Invested: "0.00", Prepaid: "0.00", Held: "0.00", Redeemed: maturity, OutstandingBalance: "0.00"},
		},
	}, *v.Invest)
}

// An IPCA mortgage is compared with the NTN-B Principal and the NTN-B on offer, whose VNA needs
// IBGE's index number of June 2000, which this server never fetched. Their verdicts say the IPCA is
// missing, and name how fresh the IPCA and its index numbers are.
func TestAnIPCABondVerdictWithoutTheIPCAItFollowsIsUnavailable(t *testing.T) {
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

	marketData := verdictMarketData{Bonds: status.Bonds, Focus: status.Focus, Indexes: ipcaStatuses}
	assert.Equal(t, decisionResult{
		Amount: "5000.00", Date: "2026-11-03", Effect: "lower_installment",
		Verdicts: []decisionVerdict{
			{
				Type: "ntn_b_principal", Maturity: "2032-08-15", Rate: "0.0672", Unavailable: "missing_ipca",
				ProjectedBy: []projectedBy{}, MarketData: marketData,
			},
			{
				Type: "ntn_b", Maturity: "2037-05-15", Rate: "0.0670", Unavailable: "missing_ipca",
				ProjectedBy: []projectedBy{}, MarketData: marketData,
			},
		},
	}, got)
}

// 7.71 buys less than a hundredth of the bonds on offer, at 772.001684 an LTN and 880.904015 an
// NTN-F, so their verdicts have the price and no scenarios.
func TestAnAmountBelowAHundredthOfTheBondHasNoScenarios(t *testing.T) {
	t.Parallel()

	s := newServer(t, sgsWithRows(nil), quotingRadar(), onDay(date(2026, time.October, 28)))
	do(t, s.handler, http.MethodPut, "/mortgage", fmt.Sprintf(interestFreeMortgage, "none"), http.StatusOK)

	got := s.decide(t, `{"amount": "7.71", "effect": "shorten_term"}`)
	status := s.status(t)

	marketData := verdictMarketData{Bonds: status.Bonds, Focus: status.Focus, Indexes: []indexStatus{}}
	assert.Equal(t, decisionResult{
		Amount: "7.71", Date: "2026-10-28", Effect: "shorten_term",
		Verdicts: []decisionVerdict{
			{
				Type: "ltn", Maturity: "2029-01-01", Rate: "0.1276", Unavailable: "amount_too_small",
				UnitPrice: "772.001684", Quantity: "0.00", ProjectedBy: []projectedBy{}, MarketData: marketData,
			},
			{
				Type: "ntn_f", Maturity: "2037-01-01", Rate: "0.1288", Unavailable: "amount_too_small",
				UnitPrice: "880.904015", Quantity: "0.00", ProjectedBy: []projectedBy{}, MarketData: marketData,
			},
		},
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
