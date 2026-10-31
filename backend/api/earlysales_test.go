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

type earlySaleFlow struct {
	decisionFlow

	Sold *decisionAmount `json:"sold"`
}

type earlySaleScenario struct {
	NetWorth           string          `json:"net_worth"`
	Cash               string          `json:"cash"`
	OutstandingBalance string          `json:"outstanding_balance"`
	Bond               *decisionAmount `json:"bond"`
	CashFlows          []earlySaleFlow `json:"cash_flows"`
}

type earlySaleCheck struct {
	Lot         lotRow             `json:"lot"`
	Unavailable string             `json:"unavailable"`
	Verdict     string             `json:"verdict"`
	SellPrice   *bondPrice         `json:"sell_price"`
	MarketValue *decisionAmount    `json:"market_value"`
	Advantage   string             `json:"advantage"`
	Hold        *earlySaleScenario `json:"hold"`
	Sell        *earlySaleScenario `json:"sell"`
	ProjectedBy []projectedBy      `json:"projected_by"`
	MarketData  verdictMarketData  `json:"market_data"`
}

type earlySaleCheckList struct {
	Date   string           `json:"date"`
	Effect string           `json:"effect"`
	Checks []earlySaleCheck `json:"checks"`
}

type earlySale struct {
	Date   string         `json:"date"`
	Effect string         `json:"effect"`
	Check  earlySaleCheck `json:"check"`
}

// addLot records a lot and returns it as the API answers it.
func addLot(t *testing.T, handler http.Handler, body string) lotRow {
	t.Helper()

	var got lotRow
	require.NoError(t, json.Unmarshal([]byte(do(t, handler, http.MethodPost, "/lots", body, http.StatusCreated)), &got))

	return got
}

// earlySaleFlowOf is a cash flow of an early sale check that sells no lot.
func earlySaleFlowOf(f decisionFlow) earlySaleFlow {
	return earlySaleFlow{decisionFlow: f}
}

// On 2026-10-28 the owner holds five lots, against the interest-free mortgage that owes 15,000.00.
// 5.00 LTN maturing on 2027-01-01, bought on 2026-01-02 for 880.00 each, sell at 977.19: 299 days
// after the purchase, the 485.95 gain pays 20% of income tax after the 8.00 custody fee, 4,782.36
// net. Held 364 days to maturity, the 600.00 gain pays 17.5% after the 9.97 custody fee, 4,886.77
// net. Prepaying the sale shortens the term to the 11 months 10,217.64 needs at most 1,000.00 a
// month, over which SAC spreads it evenly, and equal outflow prepays the rest of each 1,000.00. With
// no interest, holding is better by the difference of the two net values, 104.41. 2.00 NTN-F
// maturing on 2027-01-01, bought on 2026-07-02 for 1,000.00 each and so paid no coupon before
// maturity, sell at 1,025.12: 2,037.91 net against 2,076.42 held, 38.51 better held. The checks
// with an advantage lead, lowest first; after them, by purchase date, an LTN that matured on
// 2026-01-01, an LTN maturing on 2028-01-01 that Tesouro Direto doesn't quote, and an NTN-B
// Principal whose VNA needs IBGE's index number of June 2000, which this server never fetched.
func TestEarlySaleChecksListEveryLotRankedByAdvantage(t *testing.T) {
	t.Parallel()

	s := newServer(t, sgsWithRows(nil), quotingRadar(), onDay(date(2026, time.October, 28)))
	do(t, s.handler, http.MethodPut, "/mortgage", fmt.Sprintf(interestFreeMortgage, "none"), http.StatusOK)

	matured := addLot(t, s.handler, lotBody("ltn", "2026-01-01", "2025-01-02", "0.11", "900.00", "1.00"))
	ltn := addLot(t, s.handler, lotBody("ltn", "2027-01-01", "2026-01-02", "0.14", "880.00", "5.00"))
	unquoted := addLot(t, s.handler, lotBody("ltn", "2028-01-01", "2026-03-02", "0.14", "780.00", "1.00"))
	ntnbPrincipal := addLot(t, s.handler, lotBody("ntn_b_principal", "2032-08-15", "2026-05-04", "0.07", "3200.00", "1.00"))
	ntnf := addLot(t, s.handler, lotBody("ntn_f", "2027-01-01", "2026-07-02", "0.13", "1000.00", "2.00"))

	var got earlySaleCheckList
	require.NoError(t, json.Unmarshal([]byte(do(t, s.handler, http.MethodGet, "/early-sale-checks?effect=shorten_term", "", http.StatusOK)), &got))
	status := s.status(t)

	assert.Equal(t, "2026-10-28", got.Date)
	assert.Equal(t, "shorten_term", got.Effect)

	type ranked struct {
		Lot         int64
		Unavailable string
		Verdict     string
		Advantage   string
	}

	summary := make([]ranked, 0, len(got.Checks))
	for _, c := range got.Checks {
		summary = append(summary, ranked{c.Lot.ID, c.Unavailable, c.Verdict, c.Advantage})
	}

	assert.Equal(t, []ranked{
		{ntnf.ID, "", "hold", "38.51"},
		{ltn.ID, "", "hold", "104.41"},
		{matured.ID, "matured", "", ""},
		{unquoted.ID, "no_market_value", "", ""},
		{ntnbPrincipal.ID, "missing_ipca", "", ""},
	}, summary)

	none := verdictMarketData{Bonds: status.Bonds, Focus: status.Focus, Indexes: []indexStatus{}}
	for _, c := range got.Checks[2:4] {
		assert.Equal(t, earlySaleCheck{Lot: c.Lot, Unavailable: c.Unavailable, ProjectedBy: []projectedBy{}, MarketData: none}, c)
	}

	var ipcaStatuses []indexStatus

	for _, index := range status.Indexes {
		if index.Index == "ipca" || index.Index == "ipca_number" {
			ipcaStatuses = append(ipcaStatuses, index)
		}
	}

	assert.Equal(t, earlySaleCheck{
		Lot: ntnbPrincipal, Unavailable: "missing_ipca", SellPrice: &bondPrice{Rate: "0.0684", UnitPrice: "3256.93"},
		ProjectedBy: []projectedBy{}, MarketData: verdictMarketData{Bonds: status.Bonds, Focus: status.Focus, Indexes: ipcaStatuses},
	}, got.Checks[4])

	sold := &decisionAmount{Gross: "4885.95", IOF: "0.00", IncomeTax: "95.59", CustodyFee: "8.00", Net: "4782.36", ProjectedBy: []projectedBy{}}
	maturity := &decisionAmount{Gross: "5000.00", IOF: "0.00", IncomeTax: "103.26", CustodyFee: "9.97", Net: "4886.77", ProjectedBy: []projectedBy{}}
	assert.Equal(t, earlySaleCheck{
		Lot: ltn, Verdict: "hold", SellPrice: &bondPrice{Rate: "0.1347", UnitPrice: "977.19"},
		MarketValue: sold, Advantage: "104.41",
		Hold: &earlySaleScenario{
			NetWorth: "-8113.23", Cash: "0.00", OutstandingBalance: "13000.00", Bond: maturity,
			CashFlows: []earlySaleFlow{
				earlySaleFlowOf(decisionFlow{Date: "2026-10-28", Invested: "0.00", Prepaid: "0.00", Held: "0.00", OutstandingBalance: "15000.00"}),
				earlySaleFlowOf(installmentFlow("2026-11-10", 10, "14000.00")),
				earlySaleFlowOf(installmentFlow("2026-12-10", 11, "13000.00")),
				earlySaleFlowOf(decisionFlow{Date: "2027-01-01", Invested: "0.00", Prepaid: "0.00", Held: "0.00", Redeemed: maturity, OutstandingBalance: "13000.00"}),
			},
		},
		Sell: &earlySaleScenario{
			NetWorth: "-8217.64", Cash: "0.00", OutstandingBalance: "8217.64",
			CashFlows: []earlySaleFlow{
				{decisionFlow{Date: "2026-10-28", Invested: "0.00", Prepaid: "4782.36", Held: "0.00", OutstandingBalance: "10217.64"}, sold},
				earlySaleFlowOf(decisionFlow{
					Date: "2026-11-10", Installment: &decisionInstallment{Number: 10, Amount: "928.88"},
					Invested: "0.00", Prepaid: "71.12", Held: "0.00", OutstandingBalance: "9217.64",
				}),
				earlySaleFlowOf(decisionFlow{
					Date: "2026-12-10", Installment: &decisionInstallment{Number: 11, Amount: "921.76"},
					Invested: "0.00", Prepaid: "78.24", Held: "0.00", OutstandingBalance: "8217.64",
				}),
				earlySaleFlowOf(decisionFlow{Date: "2027-01-01", Invested: "0.00", Prepaid: "0.00", Held: "0.00", OutstandingBalance: "8217.64"}),
			},
		},
		ProjectedBy: []projectedBy{}, MarketData: none,
	}, got.Checks[1])
}

// A mortgage charging 40% a year costs far more than the 12.88% a year an LTN maturing on
// 2029-01-01 still yields at its sell price, so selling the lot and prepaying wins. The check of a
// single lot answers the same as its entry in the list.
func TestAnEarlySaleCheckOfOneLotFavoursSellingWhenTheMortgageCostsMore(t *testing.T) {
	t.Parallel()

	s := newServer(t, sgsWithRows(nil), quotingRadar(), onDay(date(2026, time.October, 28)))
	do(t, s.handler, http.MethodPut, "/mortgage",
		strings.Replace(fmt.Sprintf(interestFreeMortgage, "none"), `"rate": "0"`, `"rate": "0.40"`, 1), http.StatusOK)

	ltn := addLot(t, s.handler, lotBody("ltn", "2029-01-01", "2025-01-02", "0.11", "650.00", "10.00"))

	var got earlySale
	require.NoError(t, json.Unmarshal([]byte(do(t, s.handler, http.MethodGet,
		fmt.Sprintf("/early-sale-checks/%d?effect=lower_installment", ltn.ID), "", http.StatusOK)), &got))

	assert.Equal(t, "2026-10-28", got.Date)
	assert.Equal(t, "lower_installment", got.Effect)
	assert.Equal(t, ltn, got.Check.Lot)
	assert.Equal(t, "sell", got.Check.Verdict)
	assert.True(t, strings.HasPrefix(got.Check.Advantage, "-"), got.Check.Advantage)

	var list earlySaleCheckList
	require.NoError(t, json.Unmarshal([]byte(do(t, s.handler, http.MethodGet, "/early-sale-checks?effect=lower_installment", "", http.StatusOK)), &list))
	assert.Equal(t, []earlySaleCheck{got.Check}, list.Checks)
}

func TestAnEarlySaleCheckFailsWithoutAMortgageOrALotOrWithAnInvalidEffect(t *testing.T) {
	t.Parallel()

	s := newServer(t, sgsWithRows(nil), quotingRadar(), onDay(date(2026, time.October, 28)))
	ltn := addLot(t, s.handler, lotBody("ltn", "2029-01-01", "2025-01-02", "0.11", "650.00", "10.00"))
	one := fmt.Sprintf("/early-sale-checks/%d", ltn.ID)

	for _, path := range []string{"/early-sale-checks?effect=shorten_term", one + "?effect=shorten_term"} {
		rec := serve(t, s.handler, http.MethodGet, path, "")
		assert.Equal(t, http.StatusNotFound, rec.Code, rec.Body.String())
		assert.Contains(t, rec.Body.String(), "no mortgage is registered")
	}

	do(t, s.handler, http.MethodPut, "/mortgage", fmt.Sprintf(interestFreeMortgage, "none"), http.StatusOK)

	rec := serve(t, s.handler, http.MethodGet, fmt.Sprintf("/early-sale-checks/%d?effect=shorten_term", ltn.ID+1), "")
	assert.Equal(t, http.StatusNotFound, rec.Code, rec.Body.String())
	assert.Contains(t, rec.Body.String(), "no such lot")

	tests := []struct {
		name  string
		query string
		want  []errorDetail
	}{
		{name: "no effect", query: "", want: []errorDetail{{"query.effect", "required query parameter is missing"}}},
		{
			name:  "unknown effect",
			query: "?effect=skip_installment",
			want:  []errorDetail{{"query.effect", `expected value to be one of "shorten_term, lower_installment"`}},
		},
	}

	for _, tt := range tests {
		for _, path := range []string{"/early-sale-checks", one} {
			t.Run(tt.name+" "+path, func(t *testing.T) {
				t.Parallel()

				rec := serve(t, s.handler, http.MethodGet, path+tt.query, "")
				require.Equal(t, http.StatusUnprocessableEntity, rec.Code, rec.Body.String())

				var problem struct {
					Errors []errorDetail `json:"errors"`
				}
				require.NoError(t, json.Unmarshal(rec.Body.Bytes(), &problem))
				assert.Equal(t, tt.want, problem.Errors)
			})
		}
	}
}
