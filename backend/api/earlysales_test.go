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

	"github.com/gringolito/debtwise/backend/bonds"
	"github.com/gringolito/debtwise/backend/indexes"
	"github.com/gringolito/debtwise/backend/marketdata/sgs"
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
// net. Prepaying the sale leaves 10,217.64, which SAC spreads evenly over the 11 months it needs at
// most 1,000.00 a month when the term is shortened, 928.88 each as 10,217.64 over 11 is 928.876, or
// over the 15 months left, 681.18 each, when the installment is lowered. The installment's slack is
// held, so what either leaves below 1,000.00 is held at no return: on the
// horizon, 2027-01-01, the 2 installments of 2026-11-10 and 2026-12-10 leave 8,359.88 owed when
// shortened (10,217.64 less 2 x 928.88) with 2 x 71.12 = 142.24 held, or 8,855.28 owed when lowered
// (less 2 x 681.18) with 2 x 318.82 = 637.64 held: selling is worth -8,217.64 either way, since with
// no interest the 10,217.64 owed is paid off by the same 2,000.00 whichever way it is split.
// Holding owes 13,000.00 and nets 4,886.77, worth -8,113.23, so holding is better by 104.41, what it
// nets more than the 4,782.36 the sale prepays. 2.00 NTN-F maturing on 2027-01-01, bought on
// 2026-07-02 for 1,000.00 each and so paid no coupon before maturity, sell at 1,025.12: 2,037.91 net
// against 2,076.42 held, which owes 13,000.00: -10,923.58 held. The sale leaves 12,962.09 owed,
// 997.08 a month over the 13 months it needs when shortened, which leaves 10,967.93 owed after the
// two installments with 2 x 2.92 = 5.84 held, or 864.14 and 864.14 over the 15 months left when
// lowered, which leaves 11,233.81 owed with 2 x 135.86 = 271.72 held: selling is worth -10,962.09
// either way, and holding is better by 38.51, the 2,076.42 less the 2,037.91. The checks
// with an advantage lead, lowest first; after them, by purchase date, an LTN that matured on
// 2026-01-01, an LTN maturing on 2028-01-01 that Tesouro Direto doesn't quote, and an NTN-B
// Principal whose VNA needs IBGE's index number of June 2000, which this server never fetched.
func TestEarlySaleChecksListEveryLotRankedByAdvantage(t *testing.T) {
	t.Parallel()

	sellInstallment := func(day string, number int, amount, held, balance, netWorth string) earlySaleFlow {
		return earlySaleFlowOf(decisionFlow{
			Date: day, Installment: &decisionInstallment{Number: number, Amount: amount},
			Invested: "0.00", Prepaid: "0.00", Held: held, OutstandingBalance: balance, NetWorth: netWorth,
		})
	}

	tests := []struct {
		effect             string
		november, december earlySaleFlow
		balance, cash      string
	}{
		{
			effect:   "shorten_term",
			november: sellInstallment("2026-11-10", 10, "928.88", "71.12", "9288.76", "-9217.64"),
			december: sellInstallment("2026-12-10", 11, "928.88", "71.12", "8359.88", "-8217.64"),
			balance:  "8359.88",
			cash:     "142.24",
		},
		{
			effect:   "lower_installment",
			november: sellInstallment("2026-11-10", 10, "681.18", "318.82", "9536.46", "-9217.64"),
			december: sellInstallment("2026-12-10", 11, "681.18", "318.82", "8855.28", "-8217.64"),
			balance:  "8855.28",
			cash:     "637.64",
		},
	}

	const ltnAdvantage, ntnfAdvantage = "104.41", "38.51"

	for _, tt := range tests {
		t.Run(tt.effect, func(t *testing.T) {
			t.Parallel()

			s := newServer(t, sgsWithRows(nil), quotingRadar(), onDay(date(2026, time.October, 28)))
			do(t, s.handler, http.MethodPut, "/mortgage", fmt.Sprintf(interestFreeMortgage, "none"), http.StatusOK)

			matured := addLot(t, s.handler, lotBody("ltn", "2026-01-01", "2025-01-02", "0.11", "900.00", "1.00"))
			ltn := addLot(t, s.handler, lotBody("ltn", "2027-01-01", "2026-01-02", "0.14", "880.00", "5.00"))
			unquoted := addLot(t, s.handler, lotBody("ltn", "2028-01-01", "2026-03-02", "0.14", "780.00", "1.00"))
			ntnbPrincipal := addLot(t, s.handler, lotBody("ntn_b_principal", "2032-08-15", "2026-05-04", "0.07", "3200.00", "1.00"))
			ntnf := addLot(t, s.handler, lotBody("ntn_f", "2027-01-01", "2026-07-02", "0.13", "1000.00", "2.00"))

			var got earlySaleCheckList
			require.NoError(t, json.Unmarshal([]byte(do(t, s.handler, http.MethodGet, "/early-sale-checks?effect="+tt.effect, "", http.StatusOK)), &got))
			status := s.status(t)

			assert.Equal(t, "2026-10-28", got.Date)
			assert.Equal(t, tt.effect, got.Effect)

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
				{ntnf.ID, "", "hold", ntnfAdvantage},
				{ltn.ID, "", "hold", ltnAdvantage},
				{matured.ID, "matured", "", ""},
				{unquoted.ID, "no_market_value", "", ""},
				{ntnbPrincipal.ID, "missing_ipca", "", ""},
			}, summary)

			none := verdictMarketData{Bonds: status.Bonds, Focus: status.Focus, Indexes: []indexStatus{}}
			for _, c := range got.Checks[2:4] {
				assert.Equal(t, earlySaleCheck{Lot: c.Lot, Unavailable: c.Unavailable, ProjectedBy: []projectedBy{}, MarketData: none}, c)
			}

			assert.Equal(t, earlySaleCheck{
				Lot: ntnbPrincipal, Unavailable: "missing_ipca", SellPrice: &bondPrice{Rate: "0.0684", UnitPrice: "3256.93"},
				ProjectedBy: []projectedBy{}, MarketData: verdictMarketData{Bonds: status.Bonds, Focus: status.Focus, Indexes: ipcaStatuses(status)},
			}, got.Checks[4])

			sold := &decisionAmount{Gross: "4885.95", IOF: "0.00", IncomeTax: "95.59", CustodyFee: "8.00", Net: "4782.36", ProjectedBy: []projectedBy{}}
			maturity := &decisionAmount{Gross: "5000.00", IOF: "0.00", IncomeTax: "103.26", CustodyFee: "9.97", Net: "4886.77", ProjectedBy: []projectedBy{}}
			assert.Equal(t, earlySaleCheck{
				Lot: ltn, Verdict: "hold", SellPrice: &bondPrice{Rate: "0.1347", UnitPrice: "977.19"},
				MarketValue: sold, Advantage: ltnAdvantage,
				Hold: &earlySaleScenario{
					NetWorth: "-8113.23", Cash: "0.00", OutstandingBalance: "13000.00", Bond: maturity,
					CashFlows: []earlySaleFlow{
						earlySaleFlowOf(decisionFlow{Date: "2026-10-28", Invested: "0.00", Prepaid: "0.00", Held: "0.00", OutstandingBalance: "15000.00", NetWorth: "-10216.88"}),
						earlySaleFlowOf(installmentFlow("2026-11-10", 10, "14000.00", "-9200.89")),
						earlySaleFlowOf(installmentFlow("2026-12-10", 11, "13000.00", "-8158.51")),
						earlySaleFlowOf(decisionFlow{Date: "2027-01-01", Invested: "0.00", Prepaid: "0.00", Held: "0.00", Redeemed: maturity, OutstandingBalance: "13000.00", NetWorth: "-8113.23"}),
					},
				},
				Sell: &earlySaleScenario{
					NetWorth: "-8217.64", Cash: tt.cash, OutstandingBalance: tt.balance,
					CashFlows: []earlySaleFlow{
						{decisionFlow{Date: "2026-10-28", Invested: "0.00", Prepaid: "4782.36", Held: "0.00", OutstandingBalance: "10217.64", NetWorth: "-10217.64"}, sold},
						tt.november,
						tt.december,
						earlySaleFlowOf(decisionFlow{Date: "2027-01-01", Invested: "0.00", Prepaid: "0.00", Held: "0.00", OutstandingBalance: tt.balance, NetWorth: "-8217.64"}),
					},
				},
				ProjectedBy: []projectedBy{}, MarketData: none,
			}, got.Checks[1])
		})
	}
}

// ipcaStatuses are the statuses of the IPCA and its index numbers, which an IPCA+ lot reads.
func ipcaStatuses(status marketDataStatus) []indexStatus {
	var out []indexStatus

	for _, index := range status.Indexes {
		if index.Index == "ipca" || index.Index == "ipca_number" {
			out = append(out, index)
		}
	}

	return out
}

// An IPCA+ lot is checked against a mortgage without IPCA, so its VNA's index numbers and IPCA are
// read for the lot alone. On 2012-01-03 the owner holds the 2.00 NTN-B maturing on 2012-11-15 that
// the lot valuation test values: its coupon of 2011-11-15 is paid, the one of 2012-05-15 nets 101.87
// from a VNA grown by the IPCA projected by its trailing 12 months, and its Maturity Value nets
// 4,476.67. The interest-free mortgage, lent on 2011-01-10, owes 13,000.00. Sold at 2,250.00 each,
// the 500.00 gain over the 4,000.00 paid pays 20% of income tax after 202 days, no custody fee being
// charged before 2020: 4,400.00 net, which leaves 8,600.00, spread over the 9 months it needs: 955.56
// or 955.55 each, SAC rounding each balance over the months left to the centavo. The 44.44 or 44.45
// each leaves below the status quo's 1,000.00 is held, 400.00 in all, and so is the whole 1,000.00 of
// the 2 installments after the mortgage is paid off on 2012-09-10, 2,000.00: selling is worth 2,400.00
// on the horizon, 2012-11-15, with nothing owed. Held, the coupon is still prepaid on its date,
// leaving 7,898.13 over the 8 months left, 987.27 or 987.26 each instead of the 1,000.00 that SAC
// levels, as 7,898.13 over 8 is 987.2663; the 6 of them that fall by the Maturity Value's date leave
// 1,974.53 owed against the 4,476.67 it nets, and the 12.73 or 12.74 each leaves below 1,000.00 is
// held too, 76.40 in all, so holding is worth 4,476.67 + 76.40 - 1,974.53 = 2,578.54. With no
// interest, holding is better by what it nets more than selling, 4,476.67 + 101.87 - 4,400.00 =
// 178.54, the coupon being the 101.87 prepaid.
func TestAnIPCAPlusLotIsCheckedAgainstAMortgageWithoutIPCA(t *testing.T) {
	t.Parallel()

	// The refresh stores no IPCA, so the history is only what the test saves.
	s := newServer(t, sgsWithRows(map[int][]sgs.Observation{433: {}, 2266: {}}), quotingRadar(), onDay(date(2012, time.January, 3)))
	store := indexes.NewStore(s.conn)
	require.NoError(t, store.SaveRefresh(t.Context(), indexes.IPCANumber, []indexes.Value{
		publishedValue("2000-06-01", "2000-06-01", "1614.62"),
		publishedValue("2011-10-01", "2011-10-01", "3369.28"),
		publishedValue("2011-11-01", "2011-11-01", "3386.80"),
	}, time.Now()))

	ipca := make([]indexes.Value, 0, 12)

	for month := range 12 {
		start := date(2010, time.December, 1).AddDate(0, month, 0).Format(time.DateOnly)
		ipca = append(ipca, publishedValue(start, start, "0.53"))
	}

	require.NoError(t, store.SaveRefresh(t.Context(), indexes.IPCA, ipca, time.Now()))
	require.NoError(t, store.SaveProjectionMethod(t.Context(), indexes.ProjectionMethod{Index: indexes.IPCA, Method: indexes.Trailing12}))

	ntnb := bonds.Bond{Type: bonds.NTNB, Maturity: date(2012, time.November, 15)}
	saveQuote(t, s.conn, ntnb, "0.05", "2250.00")
	do(t, s.handler, http.MethodPut, "/mortgage", strings.ReplaceAll(fmt.Sprintf(interestFreeMortgage, "none"), "2026-", "2011-"), http.StatusOK)
	lot := addLot(t, s.handler, lotBody("ntn_b", "2012-11-15", "2011-06-15", "0", "2000.00", "2"))

	var got earlySale
	require.NoError(t, json.Unmarshal([]byte(do(t, s.handler, http.MethodGet,
		fmt.Sprintf("/early-sale-checks/%d?effect=shorten_term", lot.ID), "", http.StatusOK)), &got))
	status := s.status(t)

	trailing := []projectedBy{by("ipca", "trailing_12")}
	sold := &decisionAmount{Gross: "4500.00", IOF: "0.00", IncomeTax: "100.00", CustodyFee: "0.00", Net: "4400.00", ProjectedBy: []projectedBy{}}
	maturity := &decisionAmount{Gross: "4577.78", IOF: "0.00", IncomeTax: "101.11", CustodyFee: "0.00", Net: "4476.67", ProjectedBy: trailing}
	coupon := &decisionAmount{Gross: "127.34", IOF: "0.00", IncomeTax: "25.47", CustodyFee: "0.00", Net: "101.87", ProjectedBy: trailing}
	installment := func(day string, number int, amount, held, balance, netWorth string) earlySaleFlow {
		return earlySaleFlowOf(decisionFlow{
			Date: day, Installment: &decisionInstallment{Number: number, Amount: amount},
			Invested: "0.00", Prepaid: "0.00", Held: held, OutstandingBalance: balance, NetWorth: netWorth,
		})
	}

	assert.Equal(t, earlySale{Date: "2012-01-03", Effect: "shorten_term", Check: earlySaleCheck{
		Lot: lot, Verdict: "hold", SellPrice: &bondPrice{Rate: "0.05", UnitPrice: "2250.00"},
		MarketValue: sold, Advantage: "178.54",
		Hold: &earlySaleScenario{
			NetWorth: "2578.54", Cash: "76.40", OutstandingBalance: "1974.53", Bond: maturity,
			CashFlows: []earlySaleFlow{
				earlySaleFlowOf(decisionFlow{Date: "2012-01-03", Invested: "0.00", Prepaid: "0.00", Held: "0.00", OutstandingBalance: "13000.00", NetWorth: "-8633.90"}),
				installment("2012-01-10", 12, "1000.00", "0.00", "12000.00", "-7629.64"),
				installment("2012-02-10", 13, "1000.00", "0.00", "11000.00", "-6610.71"),
				installment("2012-03-10", 14, "1000.00", "0.00", "10000.00", "-5591.90"),
				installment("2012-04-10", 15, "1000.00", "0.00", "9000.00", "-4572.57"),
				installment("2012-05-10", 16, "1000.00", "0.00", "8000.00", "-3553.45"),
				earlySaleFlowOf(decisionFlow{Date: "2012-05-15", Invested: "0.00", Coupon: coupon, Prepaid: "101.87", Held: "0.00", OutstandingBalance: "7898.13", NetWorth: "-3550.23"}),
				installment("2012-06-10", 17, "987.27", "12.73", "6910.86", "-2523.11"),
				installment("2012-07-10", 18, "987.27", "12.73", "5923.59", "-1503.74"),
				installment("2012-08-10", 19, "987.27", "12.73", "4936.32", "-484.05"),
				installment("2012-09-10", 20, "987.26", "12.74", "3949.06", "535.64"),
				installment("2012-10-10", 21, "987.27", "12.73", "2961.79", "1555.31"),
				installment("2012-11-10", 22, "987.26", "12.74", "1974.53", "2575.32"),
				earlySaleFlowOf(decisionFlow{Date: "2012-11-15", Invested: "0.00", Prepaid: "0.00", Held: "0.00", Redeemed: maturity, OutstandingBalance: "1974.53", NetWorth: "2578.54"}),
			},
		},
		Sell: &earlySaleScenario{
			NetWorth: "2400.00", Cash: "2400.00", OutstandingBalance: "0.00",
			CashFlows: []earlySaleFlow{
				{decisionFlow{Date: "2012-01-03", Invested: "0.00", Prepaid: "4400.00", Held: "0.00", OutstandingBalance: "8600.00", NetWorth: "-8600.00"}, sold},
				installment("2012-01-10", 12, "955.56", "44.44", "7644.44", "-7600.00"),
				installment("2012-02-10", 13, "955.56", "44.44", "6688.88", "-6600.00"),
				installment("2012-03-10", 14, "955.55", "44.45", "5733.33", "-5600.00"),
				installment("2012-04-10", 15, "955.56", "44.44", "4777.77", "-4600.00"),
				installment("2012-05-10", 16, "955.55", "44.45", "3822.22", "-3600.00"),
				installment("2012-06-10", 17, "955.56", "44.44", "2866.66", "-2600.00"),
				installment("2012-07-10", 18, "955.55", "44.45", "1911.11", "-1600.00"),
				installment("2012-08-10", 19, "955.56", "44.44", "955.55", "-600.00"),
				installment("2012-09-10", 20, "955.55", "44.45", "0.00", "400.00"),
				earlySaleFlowOf(heldFlow("2012-10-10", "1400.00")),
				earlySaleFlowOf(heldFlow("2012-11-10", "2400.00")),
				earlySaleFlowOf(decisionFlow{Date: "2012-11-15", Invested: "0.00", Prepaid: "0.00", Held: "0.00", OutstandingBalance: "0.00", NetWorth: "2400.00"}),
			},
		},
		ProjectedBy: trailing,
		MarketData:  verdictMarketData{Bonds: status.Bonds, Focus: status.Focus, Indexes: ipcaStatuses(status)},
	}}, got)
}

// A mortgage charging 40% a year over 360 months (expensiveLongMortgage) makes selling the lot win
// when the sale shortens the term, even with the installment's slack held at no return. On
// 2026-10-28, after 9 installments, 299,996.45 is owed. The 10.00 LTN maturing on 2029-01-01, bought
// on 2025-01-02, sell at 769.49: 664 days after the purchase the 7,694.90 gross pays a 28.00 custody
// fee and 17.5% of the 1,166.90 gain left after it, 204.21: 7,462.69 net. Held 1,460 days to maturity
// the 10,000.00 gross pays an 80.00 custody fee and 15% of the 3,420.00 gain left, 513.00: 9,407.00
// net, with 299,979.32 owed after the 26 installments to 2028-12-10, worth 9,407.00 - 299,979.32 =
// -290,572.32. Selling shortens the term to the 132 months left (141 in all) that 292,533.76 needs at
// most the 8,531.20 paid before (131 months need 8,535.30, 132 need 8,529.15), and leaves 284,586.12
// owed after the same installments, 15,393.20 less than holding. Each installment leaves 8,531.20 -
// 8,529.15 = 2.05 below the status quo's, held: 26 x 2.05 = 53.30, so selling is worth -284,586.12 +
// 53.30 = -284,532.82, and holding is worth -290,572.32 + 284,532.82 = -6,039.50 more than selling:
// selling is better. Lowering the installment keeps the 360 months, so the sale leaves 292,516.96
// owed and the installment falls to 8,318.98, 212.22 below the status quo's, held: 26 x 212.22 =
// 5,517.72. Selling is worth -292,516.96 + 5,517.72 = -286,999.24, and holding is worth -290,572.32 +
// 286,999.24 = -3,573.08 more than selling, so selling is better too: the held slack earns nothing,
// but the 40% the mortgage charges on what the sale amortizes is worth more than the bond. The check
// of a single lot answers the same as its entry in the list.
func TestAnEarlySaleCheckOfOneLotFavoursSellingWhenTheMortgageCostsMoreAndTheTermIsShortened(t *testing.T) {
	t.Parallel()

	s := newServer(t, sgsWithRows(nil), quotingRadar(), onDay(date(2026, time.October, 28)))
	do(t, s.handler, http.MethodPut, "/mortgage", expensiveLongMortgage(), http.StatusOK)

	ltn := addLot(t, s.handler, lotBody("ltn", "2029-01-01", "2025-01-02", "0.11", "650.00", "10.00"))
	maturity := &decisionAmount{Gross: "10000.00", IOF: "0.00", IncomeTax: "513.00", CustodyFee: "80.00", Net: "9407.00", ProjectedBy: []projectedBy{}}

	tests := []struct {
		effect, verdict, advantage, sellBalance, sellCash, sellNetWorth string
	}{
		{"shorten_term", "sell", "-6039.50", "284586.12", "53.30", "-284532.82"},
		{"lower_installment", "sell", "-3573.08", "292516.96", "5517.72", "-286999.24"},
	}

	for _, tt := range tests {
		t.Run(tt.effect, func(t *testing.T) {
			t.Parallel()

			var got earlySale
			require.NoError(t, json.Unmarshal([]byte(do(t, s.handler, http.MethodGet,
				fmt.Sprintf("/early-sale-checks/%d?effect=%s", ltn.ID, tt.effect), "", http.StatusOK)), &got))

			assert.Equal(t, "2026-10-28", got.Date)
			assert.Equal(t, tt.effect, got.Effect)
			assert.Equal(t, ltn, got.Check.Lot)
			assert.Equal(t, tt.verdict, got.Check.Verdict)
			assert.Equal(t, tt.advantage, got.Check.Advantage)
			assert.Equal(t, "-290572.32", got.Check.Hold.NetWorth)
			assert.Equal(t, "299979.32", got.Check.Hold.OutstandingBalance)
			assert.Equal(t, maturity, got.Check.Hold.Bond)
			assert.Equal(t, tt.sellNetWorth, got.Check.Sell.NetWorth)
			assert.Equal(t, tt.sellCash, got.Check.Sell.Cash)
			assert.Equal(t, tt.sellBalance, got.Check.Sell.OutstandingBalance)

			var list earlySaleCheckList
			require.NoError(t, json.Unmarshal([]byte(do(t, s.handler, http.MethodGet, "/early-sale-checks?effect="+tt.effect, "", http.StatusOK)), &list))
			assert.Equal(t, []earlySaleCheck{got.Check}, list.Checks)
		})
	}
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
