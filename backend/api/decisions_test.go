package api_test

import (
	"encoding/json"
	"fmt"
	"net/http"
	"slices"
	"strings"
	"testing"
	"time"

	"github.com/gringolito/debtwise/backend/decimal"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"github.com/gringolito/debtwise/backend/marketdata/sgs"
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

const (
	// termPayingOffByNTNF is the months over which interestFreeMortgage, lengthened, is paid off on
	// 2037-01-10, nine days after the NTN-F on offer matures.
	termPayingOffByNTNF = 132
	// termPayingOffByNTNB is the months paying it off on 2038-01-10, after the NTN-B on offer matures
	// on 2037-05-15.
	termPayingOffByNTNB = 144
)

// decisionMortgage is interestFreeMortgage over the given months, still amortizing 1,000.00 a
// month. A decision only compares the bonds that mature before the mortgage's payoff, the due date
// of its last installment, 2026-02-10 plus the months less one.
func decisionMortgage(indexer string, months int) string {
	return amortizingMortgage(indexer, months, 1000)
}

// amortizingMortgage is interestFreeMortgage over the given months, which borrows the amortization
// for each.
func amortizingMortgage(indexer string, months, amortization int) string {
	return strings.NewReplacer(
		`"original_amount": "24000.00"`, fmt.Sprintf(`"original_amount": "%d.00"`, months*amortization),
		`"term_months": 24`, fmt.Sprintf(`"term_months": %d`, months),
	).Replace(fmt.Sprintf(interestFreeMortgage, indexer))
}

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
	NetWorth           string               `json:"net_worth"`
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

type decisionLoweredInstallment struct {
	ChargesAvoided string `json:"charges_avoided"`
	PaidLess       string `json:"paid_less"`
}

type decisionVerdict struct {
	Type               string                      `json:"type"`
	Maturity           string                      `json:"maturity"`
	Rate               string                      `json:"rate"`
	Unavailable        string                      `json:"unavailable"`
	UnitPrice          string                      `json:"unit_price"`
	MinimumAmount      string                      `json:"minimum_amount"`
	Quantity           string                      `json:"quantity"`
	Advantage          string                      `json:"advantage"`
	AdvantageShare     string                      `json:"advantage_share"`
	NearTie            *bool                       `json:"near_tie"`
	HorizonMonths      *int                        `json:"horizon_months"`
	AvoidedCost        string                      `json:"avoided_cost"`
	LoweredInstallment *decisionLoweredInstallment `json:"lowered_installment"`
	BreakEvenRate      string                      `json:"break_even_rate"`
	NoBreakEven        string                      `json:"no_break_even"`
	Invest             *decisionScenario           `json:"invest"`
	Prepay             *decisionScenario           `json:"prepay"`
	ProjectedBy        []projectedBy               `json:"projected_by"`
	MarketData         verdictMarketData           `json:"market_data"`
}

type decisionResult struct {
	Amount      string            `json:"amount"`
	Date        string            `json:"date"`
	Effect      string            `json:"effect"`
	PrepaySlack bool              `json:"prepay_slack"`
	Verdicts    []decisionVerdict `json:"verdicts"`
}

// installmentFlow is a cash flow on an installment's due date.
func installmentFlow(day string, number int, balance, netWorth string) decisionFlow {
	return decisionFlow{
		Date: day, Installment: &decisionInstallment{Number: number, Amount: "1000.00"},
		Invested: "0.00", Prepaid: "0.00", Held: "0.00", OutstandingBalance: balance, NetWorth: netWorth,
	}
}

// installmentRun is the cash flows of count installments of 1,000.00 due monthly from first, numbered
// from number, each paying 1,000.00 off the balance owed before the first. With owed, a flow's net
// worth is the balance owed, as when nothing else is held.
func installmentRun(first time.Time, number, count, balance int, owed bool) []decisionFlow {
	flows := make([]decisionFlow, 0, count)

	for i := range count {
		balance -= 1000

		flow := installmentFlow(first.AddDate(0, i, 0).Format(time.DateOnly), number+i, fmt.Sprintf("%d.00", balance), "")
		if owed {
			flow.NetWorth = fmt.Sprintf("%d.00", -balance)
		}

		flows = append(flows, flow)
	}

	return flows
}

// withoutNetWorths returns the scenario with its cash flows' net worths cleared, and those net
// worths in order, so a test reads the flows apart from the net worths it checks one by one.
func withoutNetWorths(s decisionScenario) (decisionScenario, []string) {
	worths := make([]string, 0, len(s.CashFlows))
	flows := make([]decisionFlow, 0, len(s.CashFlows))

	for _, f := range s.CashFlows {
		worths = append(worths, f.NetWorth)
		f.NetWorth = ""
		flows = append(flows, f)
	}

	s.CashFlows = flows

	return s, worths
}

func (s server) decide(t *testing.T, body string) decisionResult {
	t.Helper()

	var got decisionResult
	require.NoError(t, json.Unmarshal([]byte(do(t, s.handler, http.MethodPost, "/decisions", body, http.StatusOK)), &got))

	return got
}

// On 2026-10-28, 5,000.00 either prepays the interest-free mortgage or buys one of the bonds on
// offer that follow a mortgage without an indexer: the LTN maturing on 2029-01-01, and next to it
// the NTN-F maturing on 2037-01-01. The mortgage lasts 132 months, so its payoff, 2037-01-10, is
// after both. At its buy rate of 12.76%, over the 543 business days ANBIMA's calendar counts to its
// maturity, an LTN costs 772.001684, so 5,000.00 buys 6.47 of them for 4,994.85 and the 5.15 left is
// held. Held 796 days, they pay 6,470.00, less 28.22 of custody fee at 0.20% a year and 217.04 of
// income tax at 15% on the gain: 6,224.74. The figures are worked out in Python's decimal module.
//
// After the installment of 2026-10-10, 123,000.00 is owed. Prepaying leaves 118,000.00, and each
// installment pays 1,000.00 off, so on the LTN's horizon, after the 26 installments of 2026-11-10 to
// 2028-12-10, 92,000.00 is owed; investing leaves 97,000.00 owed and holds 5.15 from the start.
// With no interest, prepaying avoids nothing, and the advantage is the bond's net gain.
func TestADecisionComparesPrepayingWithBuyingEachBondOnOffer(t *testing.T) {
	t.Parallel()

	s := newServer(t, sgsWithRows(nil), quotingRadar(), onDay(date(2026, time.October, 28)))
	do(t, s.handler, http.MethodPut, "/mortgage", decisionMortgage("none", termPayingOffByNTNF), http.StatusOK)

	got := s.decide(t, `{"amount": "5000.00", "effect": "shorten_term", "prepay_slack": true}`)
	status := s.status(t)

	require.Len(t, got.Verdicts, 2)
	assert.Equal(t, "5000.00", got.Amount)
	assert.Equal(t, "2026-10-28", got.Date, "today by default")
	assert.Equal(t, "shorten_term", got.Effect)
	assert.True(t, got.PrepaySlack)

	assert.Equal(t, "ntn_f", got.Verdicts[1].Type)

	v := got.Verdicts[0]
	assert.Equal(t, "ltn", v.Type)
	assert.Equal(t, "2029-01-01", v.Maturity)
	assert.Equal(t, "0.1276", v.Rate)
	assert.Empty(t, v.Unavailable)
	assert.Equal(t, "772.001684", v.UnitPrice)
	assert.Equal(t, "6.47", v.Quantity)
	assert.Equal(t, "1229.89", v.Advantage)
	assert.Equal(t, "0.00", v.AvoidedCost)
	assert.Nil(t, v.LoweredInstallment)
	assert.Equal(t, []projectedBy{}, v.ProjectedBy)
	assert.Equal(t, verdictMarketData{Bonds: status.Bonds, Focus: status.Focus, Indexes: []indexStatus{}}, v.MarketData)

	// The advantages, 1,229.89 and 5,384.51 on 5,000.00, are 0.2460 and 1.0769 of it, far from a tie.
	// 2026-10-28 is 26 whole months from 2029-01-01, which falls before the 28th of its month, and
	// 122 from 2037-01-01.
	type yardstick struct {
		share   string
		nearTie *bool
		months  *int
	}

	yardsticks := make([]yardstick, 0, len(got.Verdicts))

	for _, w := range got.Verdicts {
		yardsticks = append(yardsticks, yardstick{w.AdvantageShare, w.NearTie, w.HorizonMonths})
	}

	assert.Equal(t, []yardstick{
		{"0.2460", new(false), new(26)},
		{"1.0769", new(false), new(122)},
	}, yardsticks)

	maturity := &decisionAmount{
		Gross: "6470.00", IOF: "0.00", IncomeTax: "217.04", CustodyFee: "28.22", Net: "6224.74", ProjectedBy: []projectedBy{},
	}

	require.NotNil(t, v.Prepay)
	assert.Equal(t, decisionScenario{
		NetWorth: "-92000.00", Cash: "0.00", OutstandingBalance: "92000.00",
		CashFlows: slices.Concat(
			[]decisionFlow{{Date: "2026-10-28", Invested: "0.00", Prepaid: "5000.00", Held: "0.00", OutstandingBalance: "118000.00", NetWorth: "-118000.00"}},
			installmentRun(date(2026, time.November, 10), 10, 26, 118000, true),
			[]decisionFlow{{Date: "2029-01-01", Invested: "0.00", Prepaid: "0.00", Held: "0.00", OutstandingBalance: "92000.00", NetWorth: "-92000.00"}},
		),
	}, *v.Prepay)

	require.NotNil(t, v.Invest)

	invest, worths := withoutNetWorths(*v.Invest)
	assert.Equal(t, decisionScenario{
		NetWorth: "-90770.11", Cash: "5.15", OutstandingBalance: "97000.00", Bond: maturity,
		CashFlows: slices.Concat(
			[]decisionFlow{{Date: "2026-10-28", Invested: "4994.85", Prepaid: "0.00", Held: "5.15", OutstandingBalance: "123000.00"}},
			installmentRun(date(2026, time.November, 10), 10, 26, 123000, false),
			[]decisionFlow{{Date: "2029-01-01", Invested: "0.00", Prepaid: "0.00", Held: "0.00", Redeemed: maturity, OutstandingBalance: "97000.00"}},
		),
	}, invest)

	// Right after buying, the 5.15 held and the 4,994.85 bond leave the owner 118,000.00 below the
	// 123,000.00 owed, as prepaying does. Each installment then pays 1,000.00 off, and the bond is
	// worth its Accrual net of IOF, income tax and custody fee that day, which the figures in
	// Python's decimal module reproduce, up to its Maturity Value on the horizon.
	assert.Equal(t, []string{
		"-118000.00", "-116993.77", "-115947.05", "-114910.15", "-113872.90", "-112835.23", "-111793.39",
		"-110749.14", "-109705.11", "-108660.60", "-107617.74", "-106572.35", "-105528.60", "-104470.54",
		"-103424.54", "-102378.12", "-101326.66", "-100283.83", "-99236.02", "-98192.40", "-97138.93",
		"-96094.44", "-95039.91", "-93989.68", "-92938.93", "-91854.00", "-90805.86", "-90770.11",
	}, worths)
}

// Without prepay_slack, the 5,000.00 prepaid on the interest-free mortgage above, here with a 0.1%
// MIP on the balance, leaves 118,000.00 of the 123,000.00 owed over the 123 months left, and each
// scenario pays only its own installments. The MIP of an installment is 0.1% of the balance before
// it, and a verdict counts the installments to its bond's horizon: 26 for the LTN, the last due on
// 2028-12-10, and 122 for the NTN-F, the last on 2036-12-10.
//
// The status quo's installments charge 123.00 down to 98.00 of MIP, 2,873.00, and 123.00 down to
// 2.00, 7,625.00. Shortening the term pays 1,000.00 a month off 118,000.00, charging 118.00 down to
// 93.00, 2,743.00, and 118.00 down to 1.00, 7,021.00, as it is paid off on 2036-08-10; it avoids
// 130.00 or 604.00. Lowering the installment spreads the 118,000.00 over the 123 months left, each
// amortizing what is owed over the months left, to the centavo, charging 2,756.20 and 7,315.04, so
// it avoids 116.80 or 309.96. It amortizes 24,943.10 on the LTN's horizon, leaving 93,056.90 owed,
// and 117,040.66 on the NTN-F's, so its installments charge 26,000.00 − 24,943.10 + 116.80 =
// 1,173.70 and 122,000.00 − 117,040.66 + 309.96 = 5,269.30 less. Only it says what it gives.
//
// Nothing is held, so prepaying ends with nothing but the debt, 92,000.00 or 93,056.90 on the LTN's
// horizon, while investing ends with the bond and the 5.15, 6,229.89 ahead of the 97,000.00 owed:
// ahead of prepaying by 1,229.89 or 2,286.79.
func TestADecisionIgnoresTheSlackUnlessAskedToPrepayIt(t *testing.T) {
	t.Parallel()

	type slackOff struct {
		bond, avoided string
		lowered       *decisionLoweredInstallment
	}

	tests := []struct {
		effect    string
		verdicts  []slackOff
		advantage string
		owed      string
	}{
		{
			effect:    "shorten_term",
			verdicts:  []slackOff{{"ltn", "130.00", nil}, {"ntn_f", "604.00", nil}},
			advantage: "1229.89",
			owed:      "92000.00",
		},
		{
			effect: "lower_installment",
			verdicts: []slackOff{
				{"ltn", "116.80", &decisionLoweredInstallment{ChargesAvoided: "116.80", PaidLess: "1173.70"}},
				{"ntn_f", "309.96", &decisionLoweredInstallment{ChargesAvoided: "309.96", PaidLess: "5269.30"}},
			},
			advantage: "2286.79",
			owed:      "93056.90",
		},
	}

	for _, tt := range tests {
		t.Run(tt.effect, func(t *testing.T) {
			t.Parallel()

			s := newServer(t, sgsWithRows(nil), quotingRadar(), onDay(date(2026, time.October, 28)))

			var terms map[string]json.RawMessage
			require.NoError(t, json.Unmarshal([]byte(decisionMortgage("none", termPayingOffByNTNF)), &terms))
			terms["mip_rates"] = json.RawMessage(`[{"effective_from": "2026-01-10", "rate": "0.001"}]`)
			body, err := json.Marshal(terms)
			require.NoError(t, err)
			do(t, s.handler, http.MethodPut, "/mortgage", string(body), http.StatusOK)

			got := s.decide(t, fmt.Sprintf(`{"amount": "5000.00", "effect": %q}`, tt.effect))
			assert.False(t, got.PrepaySlack)

			verdicts := make([]slackOff, 0, len(got.Verdicts))
			for _, v := range got.Verdicts {
				verdicts = append(verdicts, slackOff{v.Type, v.AvoidedCost, v.LoweredInstallment})
			}

			assert.Equal(t, tt.verdicts, verdicts)
			require.Len(t, got.Verdicts, 2)

			v := got.Verdicts[0]
			assert.Equal(t, tt.advantage, v.Advantage)

			require.NotNil(t, v.Prepay)
			assert.Equal(t, []string{"-" + tt.owed, "0.00", tt.owed}, []string{v.Prepay.NetWorth, v.Prepay.Cash, v.Prepay.OutstandingBalance})

			flows := v.Prepay.CashFlows
			require.GreaterOrEqual(t, len(flows), 2)
			assert.Equal(t, "2028-12-10", flows[len(flows)-2].Date)
			assert.Equal(t, "2029-01-01", flows[len(flows)-1].Date)

			for _, f := range flows[1:] {
				assert.Equal(t, []string{"0.00", "0.00"}, []string{f.Prepaid, f.Held}, f.Date)
			}
		})
	}
}

// Quoted back as the LTN's buy rate, the Break-even Rate the API answers leaves investing and
// prepaying within a centavo of each other on the horizon, whether the slack is prepaid or not.
func TestABreakEvenRateQuotedBackGivesAnAdvantageOfZero(t *testing.T) {
	t.Parallel()

	tests := []struct {
		name, mortgage, decision string
	}{
		{
			name:     "slack prepaid",
			mortgage: decisionMortgage("none", termPayingOffByNTNF),
			decision: `{"amount": "5000.00", "effect": "shorten_term", "prepay_slack": true}`,
		},
		{
			name:     "slack ignored",
			mortgage: expensiveLongMortgage(),
			decision: `{"amount": "5000.00", "effect": "lower_installment"}`,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			t.Parallel()

			today := onDay(date(2026, time.October, 28))

			s := newServer(t, sgsWithRows(nil), quotingRadar(), today)
			do(t, s.handler, http.MethodPut, "/mortgage", tt.mortgage, http.StatusOK)

			got := s.decide(t, tt.decision)

			types := make([]string, 0, len(got.Verdicts))
			for _, v := range got.Verdicts {
				types = append(types, v.Type)
			}

			require.Equal(t, []string{"ltn", "ntn_f"}, types)

			v := got.Verdicts[0]
			require.Empty(t, v.NoBreakEven)

			breakEven := decimal.MustParse(v.BreakEvenRate)
			assert.Positive(t, breakEven.Cmp(decimal.MustParse("0")), "a bond at 0% loses its custody fee")
			assert.Negative(t, breakEven.Cmp(decimal.MustParse(v.Rate)), "the LTN's buy rate favours investing")

			ltn := radarBonds()[1]
			require.Equal(t, ltn2029, ltn.Name)
			ltn.InvestmentRate = &breakEven
			quoted := radarWithBonds([]string{ltn2029}, ltn)
			fedBack := newServer(t, sgsWithRows(nil), quoted, today)
			do(t, fedBack.handler, http.MethodPut, "/mortgage", tt.mortgage, http.StatusOK)

			again := fedBack.decide(t, tt.decision)
			require.Len(t, again.Verdicts, 1)
			assert.Equal(t, v.BreakEvenRate, again.Verdicts[0].Rate)

			advantage := decimal.MustParse(again.Verdicts[0].Advantage)
			assert.LessOrEqual(t, advantage.Cmp(decimal.MustParse("0.01")), 0, advantage.String())
			assert.GreaterOrEqual(t, advantage.Cmp(decimal.MustParse("-0.01")), 0, advantage.String())
		})
	}
}

// With the slack prepaid, a mortgage at 100% a year costs more by 2029 than the LTN maturing then
// would pay at 100% a year, so no rate makes it come out even. The NTN-F is held eight years
// longer, to 2037, so compounds enough for some rate to.
func TestAVerdictWithoutABreakEvenRateSaysWhy(t *testing.T) {
	t.Parallel()

	s := newServer(t, sgsWithRows(nil), quotingRadar(), onDay(date(2026, time.October, 28)))

	var terms map[string]json.RawMessage
	require.NoError(t, json.Unmarshal([]byte(decisionMortgage("none", termPayingOffByNTNF)), &terms))
	terms["contract_rates"] = json.RawMessage(`[{"effective_from": "2026-01-10", "rate": "1.00", "basis": "effective"}]`)
	body, err := json.Marshal(terms)
	require.NoError(t, err)
	do(t, s.handler, http.MethodPut, "/mortgage", string(body), http.StatusOK)

	got := s.decide(t, `{"amount": "5000.00", "effect": "shorten_term", "prepay_slack": true}`)

	require.Len(t, got.Verdicts, 2)

	ltn, ntnf := got.Verdicts[0], got.Verdicts[1]
	assert.Equal(t, []string{"ltn", "", "above_range"}, []string{ltn.Type, ltn.BreakEvenRate, ltn.NoBreakEven})
	assert.Equal(t, "ntn_f", ntnf.Type)
	assert.NotEmpty(t, ntnf.BreakEvenRate)
	assert.Empty(t, ntnf.NoBreakEven)
}

// The NTN-F on offer costs 880.904015 at 12.88% on 2026-10-28, so 5,000.00 buys 5.67 of them for
// 4,994.73. The mortgage, 132 installments of 250.00 with 30,750.00 owed after the one of
// 2026-10-10, is paid off by the status quo on 2037-01-10, after the NTN-F matures. Each coupon of
// 276.75 is taxed on its yield only: the first, on 2027-01-01, pays just 23.62 of income tax, as
// most of it returns the interest the price paid the seller for. Its net is prepaid that day, and
// with prepay_slack what the lower installments leave of the 250.00 is too, so that the 18 coupons
// to 2035-07-01 leave 604.63 owed, which the installments of 2035-07-10, 2035-08-10 and 2035-09-10
// pay off. Once the mortgage is paid off, every later installment and coupon is held. The figures
// are worked out in Python's decimal module over ANBIMA's holiday list.
func TestAnNTNFVerdictListsEachCouponItPrepays(t *testing.T) {
	t.Parallel()

	s := newServer(t, sgsWithRows(nil), quotingRadar(), onDay(date(2026, time.October, 28)))
	do(t, s.handler, http.MethodPut, "/mortgage", amortizingMortgage("none", termPayingOffByNTNF, 250), http.StatusOK)

	got := s.decide(t, `{"amount": "5000.00", "effect": "shorten_term", "prepay_slack": true}`)
	require.Len(t, got.Verdicts, 2)

	v := got.Verdicts[1]
	assert.Equal(t, "ntn_f", v.Type)
	assert.Equal(t, "2037-01-01", v.Maturity)
	assert.Equal(t, "0.1288", v.Rate)
	assert.Equal(t, "880.904015", v.UnitPrice)
	assert.Equal(t, "5.67", v.Quantity)
	assert.Equal(t, "5384.51", v.Advantage)
	assert.Equal(t, "0.00", v.AvoidedCost)

	coupon := func(day, incomeTax, custodyFee, net, prepaid, held, balance string) decisionFlow {
		return decisionFlow{
			Date: day, Invested: "0.00", Prepaid: prepaid, Held: held, OutstandingBalance: balance,
			Coupon: &decisionAmount{
				Gross: "276.75", IOF: "0.00", IncomeTax: incomeTax, CustodyFee: custodyFee, Net: net, ProjectedBy: []projectedBy{},
			},
		}
	}
	held := func(day, incomeTax, custodyFee, net string) decisionFlow {
		return coupon(day, incomeTax, custodyFee, net, "0.00", net, "0.00")
	}
	maturity := &decisionAmount{
		Gross: "5946.75", IOF: "0.00", IncomeTax: "167.40", CustodyFee: "6.00", Net: "5773.35", ProjectedBy: []projectedBy{},
	}

	require.NotNil(t, v.Invest)

	invest, worths := withoutNetWorths(*v.Invest)
	assert.Equal(t, "10134.51", invest.NetWorth)
	assert.Equal(t, "4361.16", invest.Cash)
	assert.Equal(t, "0.00", invest.OutstandingBalance)
	assert.Equal(t, maturity, invest.Bond)

	flows := invest.CashFlows
	require.Len(t, flows, 144)
	assert.Equal(t, []decisionFlow{
		{Date: "2026-10-28", Invested: "4994.73", Prepaid: "0.00", Held: "5.27", OutstandingBalance: "30750.00"},
		{
			Date: "2026-11-10", Installment: &decisionInstallment{Number: 10, Amount: "250.00"},
			Invested: "0.00", Prepaid: "0.00", Held: "0.00", OutstandingBalance: "30500.00",
		},
		{
			Date: "2026-12-10", Installment: &decisionInstallment{Number: 11, Amount: "250.00"},
			Invested: "0.00", Prepaid: "0.00", Held: "0.00", OutstandingBalance: "30250.00",
		},
	}, flows[:3])
	assert.Equal(t,
		decisionFlow{Date: "2037-01-01", Invested: "0.00", Prepaid: "0.00", Held: "0.00", Redeemed: maturity, OutstandingBalance: "0.00"},
		flows[len(flows)-1])

	var coupons []decisionFlow

	for _, f := range flows {
		if f.Coupon != nil {
			coupons = append(coupons, f)
		}
	}

	assert.Equal(t, []decisionFlow{
		coupon("2027-01-01", "23.62", "1.82", "251.31", "251.31", "0.00", "29998.69"),
		coupon("2027-07-01", "54.33", "5.08", "217.34", "217.34", "0.00", "28281.35"),
		coupon("2028-01-01", "47.52", "5.19", "224.04", "224.04", "0.00", "26557.31"),
		coupon("2028-07-01", "47.53", "5.16", "224.06", "224.06", "0.00", "24833.25"),
		coupon("2029-01-01", "40.73", "5.24", "230.78", "230.78", "0.00", "23102.47"),
		coupon("2029-07-01", "40.74", "5.18", "230.83", "230.83", "0.00", "21371.64"),
		coupon("2030-01-01", "40.72", "5.29", "230.74", "230.74", "0.00", "19640.90"),
		coupon("2030-07-01", "40.73", "5.23", "230.79", "230.79", "0.00", "17910.11"),
		coupon("2031-01-01", "40.71", "5.36", "230.68", "230.68", "0.00", "16179.43"),
		coupon("2031-07-01", "40.72", "5.30", "230.73", "230.73", "0.00", "14448.70"),
		coupon("2032-01-01", "40.70", "5.44", "230.61", "230.61", "0.00", "12718.09"),
		coupon("2032-07-01", "40.70", "5.42", "230.63", "230.63", "0.00", "10987.46"),
		coupon("2033-01-01", "40.68", "5.53", "230.54", "230.54", "0.00", "9256.92"),
		coupon("2033-07-01", "40.69", "5.48", "230.58", "230.58", "0.00", "7526.34"),
		coupon("2034-01-01", "40.67", "5.63", "230.45", "230.45", "0.00", "5795.89"),
		coupon("2034-07-01", "40.67", "5.59", "230.49", "230.49", "0.00", "4065.40"),
		coupon("2035-01-01", "40.65", "5.73", "230.37", "230.37", "0.00", "2335.03"),
		coupon("2035-07-01", "40.66", "5.69", "230.40", "230.40", "0.00", "604.63"),
		held("2036-01-01", "40.64", "5.85", "230.26"),
		held("2036-07-01", "40.64", "5.85", "230.26"),
	}, coupons)

	// Whatever a flow holds or prepays, the balance falls by the installment's amount and what is
	// prepaid. An installment, with what it prepays and holds, spends its 250.00, and a coupon
	// prepays or holds its net, as does each installment due after the mortgage is paid off. What is
	// held adds up to the cash.
	balance := decimal.MustParse("30750.00")
	kept := decimal.MustParse(flows[0].Held)
	paidOff := ""

	for _, f := range flows[1 : len(flows)-1] {
		spent := decimal.MustParse(f.Prepaid)
		total := spent.Add(decimal.MustParse(f.Held))

		switch {
		case f.Coupon != nil:
			assert.Equal(t, f.Coupon.Net, total.String(), f.Date)
		case f.Installment != nil:
			amount := decimal.MustParse(f.Installment.Amount)
			spent = spent.Add(amount)
			assert.Equal(t, "250.00", total.Add(amount).String(), f.Date)
		default:
			assert.Equal(t, "250.00", total.String(), f.Date)
		}

		balance = balance.Sub(spent)
		assert.Equal(t, balance.String(), f.OutstandingBalance, f.Date)

		kept = kept.Add(decimal.MustParse(f.Held))

		if paidOff == "" && f.OutstandingBalance == "0.00" {
			paidOff = f.Date
		}
	}

	assert.Equal(t, invest.Cash, kept.String())
	assert.Equal(t, "2035-09-10", paidOff)

	// Right after buying, the 5.27 held and the bond at its cost leave the owner 25,750.00 below
	// the 30,750.00 owed; on the horizon, the scenario's net worth.
	require.Len(t, worths, 144)
	assert.Equal(t, "-25750.00", worths[0])
	assert.Equal(t, "10134.51", worths[len(worths)-1])
}

// An IPCA mortgage is compared with the NTN-B Principal and the NTN-B on offer, whose VNA needs
// IBGE's index number of June 2000, which this server never fetched. Their verdicts say the IPCA is
// missing, and name how fresh the IPCA and its index numbers are.
func TestAnIPCABondVerdictWithoutTheIPCAItFollowsIsUnavailable(t *testing.T) {
	t.Parallel()

	s := newServer(t, sgsWithRows(nil), quotingRadar(), onDay(date(2026, time.October, 28)))
	do(t, s.handler, http.MethodPut, "/mortgage", decisionMortgage("ipca", termPayingOffByNTNB), http.StatusOK)

	got := s.decide(t, `{"amount": "5000.00", "effect": "lower_installment"}`)
	status := s.status(t)

	var ipcaStatuses []indexStatus

	for _, index := range status.Indexes {
		if index.Index == "ipca" || index.Index == "ipca_number" {
			ipcaStatuses = append(ipcaStatuses, index)
		}
	}

	marketData := verdictMarketData{Bonds: status.Bonds, Focus: status.Focus, Indexes: ipcaStatuses}
	assert.Equal(t, decisionResult{
		Amount: "5000.00", Date: "2026-10-28", Effect: "lower_installment",
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

// A poupança-linked rate reads the Selic target, so a decision loads its history. On 2026-10-28,
// the installments due after today read targets past the latest published one, of 2026-10-01,
// projected by the trailing 12 months, so each verdict names that method and how fresh the Selic
// target is.
func TestADecisionReadsTheSelicTargetAPoupancaLinkedRateNeeds(t *testing.T) {
	t.Parallel()

	var selic []sgs.Observation
	for month := date(2025, time.November, 1); !month.After(date(2026, time.October, 1)); month = month.AddDate(0, 1, 0) {
		selic = append(selic, sgs.Observation{Start: month, Value: decimal.MustParse("15.00")})
	}

	s := newServer(t, sgsWithRows(map[int][]sgs.Observation{432: selic}), quotingRadar(), onDay(date(2026, time.October, 28)))
	require.Equal(t, http.StatusOK, s.chooseMethod(t, "selic_target", "trailing_12").Code)

	var terms map[string]json.RawMessage
	require.NoError(t, json.Unmarshal([]byte(decisionMortgage("tr", termPayingOffByNTNF)), &terms))
	terms["contract_rates"] = json.RawMessage(
		`[{"effective_from": "2026-01-10", "rate": "0", "basis": "effective", "poupanca_additional": true}]`)
	body, err := json.Marshal(terms)
	require.NoError(t, err)
	do(t, s.handler, http.MethodPut, "/mortgage", string(body), http.StatusOK)

	got := s.decide(t, `{"amount": "5000.00", "effect": "shorten_term"}`)
	status := s.status(t)

	var selicStatuses []indexStatus

	for _, index := range status.Indexes {
		if index.Index == "tr" || index.Index == "selic_target" {
			selicStatuses = append(selicStatuses, index)
		}
	}

	require.Len(t, got.Verdicts, 2)

	for _, v := range got.Verdicts {
		assert.Equal(t, []projectedBy{by("selic_target", "trailing_12")}, v.ProjectedBy, v.Type)
		assert.Equal(t, selicStatuses, v.MarketData.Indexes, v.Type)
	}
}

// 7.71 buys less than a hundredth of the bonds on offer, at 772.001684 an LTN and 880.904015 an
// NTN-F, so their verdicts have the price and no scenarios. They name the smallest amount that
// buys a hundredth: 7.72001684 and 8.80904015 rounded up to the centavo.
func TestAnAmountBelowAHundredthOfTheBondHasNoScenarios(t *testing.T) {
	t.Parallel()

	s := newServer(t, sgsWithRows(nil), quotingRadar(), onDay(date(2026, time.October, 28)))
	do(t, s.handler, http.MethodPut, "/mortgage", decisionMortgage("none", termPayingOffByNTNF), http.StatusOK)

	got := s.decide(t, `{"amount": "7.71", "effect": "shorten_term"}`)
	status := s.status(t)

	marketData := verdictMarketData{Bonds: status.Bonds, Focus: status.Focus, Indexes: []indexStatus{}}
	assert.Equal(t, decisionResult{
		Amount: "7.71", Date: "2026-10-28", Effect: "shorten_term",
		Verdicts: []decisionVerdict{
			{
				Type: "ltn", Maturity: "2029-01-01", Rate: "0.1276", Unavailable: "amount_too_small",
				UnitPrice: "772.001684", MinimumAmount: "7.73", Quantity: "0.00", ProjectedBy: []projectedBy{}, MarketData: marketData,
			},
			{
				Type: "ntn_f", Maturity: "2037-01-01", Rate: "0.1288", Unavailable: "amount_too_small",
				UnitPrice: "880.904015", MinimumAmount: "8.81", Quantity: "0.00", ProjectedBy: []projectedBy{}, MarketData: marketData,
			},
		},
	}, got)
}

// A decision compares only the bonds that mature before the mortgage's payoff, the due date of its
// last installment: the LTN maturing on 2029-01-01 and the NTN-F maturing on 2037-01-01 against a
// mortgage paid off on 2028-01-10, 2029-01-10 and 2037-01-10.
func TestADecisionOnlyComparesBondsMaturingBeforeThePayoff(t *testing.T) {
	t.Parallel()

	type bond struct{ Type, Maturity string }

	tests := []struct {
		name   string
		months int
		want   []bond
	}{
		{name: "payoff before both", months: 24, want: []bond{}},
		{name: "payoff between them", months: 36, want: []bond{{"ltn", "2029-01-01"}}},
		{name: "payoff after both", months: termPayingOffByNTNF, want: []bond{{"ltn", "2029-01-01"}, {"ntn_f", "2037-01-01"}}},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			t.Parallel()

			s := newServer(t, sgsWithRows(nil), quotingRadar(), onDay(date(2026, time.October, 28)))
			do(t, s.handler, http.MethodPut, "/mortgage", decisionMortgage("none", tt.months), http.StatusOK)

			got := s.decide(t, `{"amount": "5000.00", "effect": "shorten_term"}`)

			compared := make([]bond, 0, len(got.Verdicts))
			for _, v := range got.Verdicts {
				compared = append(compared, bond{v.Type, v.Maturity})
			}

			assert.Equal(t, tt.want, compared)
		})
	}
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
			name: "a date",
			body: `{"amount": "5000.00", "date": "2026-11-03", "effect": "shorten_term"}`,
			want: []errorDetail{{"body.date", "unexpected property"}},
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

func TestARejectedDecisionNamesTheRuleItBreaks(t *testing.T) {
	t.Parallel()

	s := newServer(t, sgsWithRows(nil), quotingRadar(), onDay(date(2026, time.October, 28)))
	do(t, s.handler, http.MethodPut, "/mortgage", fmt.Sprintf(interestFreeMortgage, "none"), http.StatusOK)

	rec := serve(t, s.handler, http.MethodPost, "/decisions", `{"amount": "0.00", "effect": "shorten_term"}`)

	require.Equal(t, http.StatusUnprocessableEntity, rec.Code, rec.Body.String())

	var problem struct {
		Errors []ruleDetail `json:"errors"`
	}
	require.NoError(t, json.Unmarshal(rec.Body.Bytes(), &problem))
	assert.Equal(t, []ruleDetail{{"body.amount", "not_positive"}}, problem.Errors)
}

// Every decision is dated today, so a mortgage whose contract starts after today has nothing to
// prepay yet. On the contract date itself, the decision is compared.
func TestADecisionBeforeTheContractStartsConflictsWithTheMortgage(t *testing.T) {
	t.Parallel()

	before := newServer(t, sgsWithRows(nil), quotingRadar(), onDay(date(2026, time.January, 9)))
	do(t, before.handler, http.MethodPut, "/mortgage", fmt.Sprintf(interestFreeMortgage, "none"), http.StatusOK)

	rec := serve(t, before.handler, http.MethodPost, "/decisions", `{"amount": "5000.00", "effect": "shorten_term"}`)

	require.Equal(t, http.StatusConflict, rec.Code, rec.Body.String())

	var problem struct {
		Detail string `json:"detail"`
	}
	require.NoError(t, json.Unmarshal(rec.Body.Bytes(), &problem))
	assert.Equal(t, "the mortgage's contract starts after today", problem.Detail)

	signed := newServer(t, sgsWithRows(nil), quotingRadar(), onDay(date(2026, time.January, 10)))
	do(t, signed.handler, http.MethodPut, "/mortgage", fmt.Sprintf(interestFreeMortgage, "none"), http.StatusOK)
	assert.Equal(t, "2026-01-10", signed.decide(t, `{"amount": "5000.00", "effect": "shorten_term"}`).Date)
}
