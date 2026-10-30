package comparison_test

import (
	"fmt"
	"slices"
	"strings"
	"testing"
	"time"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"github.com/gringolito/debtwise/backend/bonds"
	"github.com/gringolito/debtwise/backend/comparison"
	"github.com/gringolito/debtwise/backend/decimal"
	"github.com/gringolito/debtwise/backend/indexes"
	"github.com/gringolito/debtwise/backend/mortgage"
)

// flow is a scenario's cash flow on one date as text, an empty string where it has none.
type flow struct {
	Date               string
	Installment        string
	Invested           string
	Prepaid            string
	Held               string
	Redeemed           string
	OutstandingBalance string
}

func flows(s comparison.Scenario) []flow {
	out := make([]flow, 0, len(s.CashFlows))

	for _, f := range s.CashFlows {
		row := flow{
			Date:               f.Date.Format(time.DateOnly),
			Invested:           f.Invested.String(),
			Prepaid:            f.Prepaid.String(),
			Held:               f.Held.String(),
			OutstandingBalance: f.OutstandingBalance.String(),
		}

		if f.Installment != nil {
			row.Installment = f.Installment.Amount.String()
		}

		if f.Redeemed != nil {
			row.Redeemed = f.Redeemed.Net.String()
		}

		out = append(out, row)
	}

	return out
}

func date(t *testing.T, s string) time.Time {
	t.Helper()

	d, err := time.Parse(time.DateOnly, s)
	require.NoError(t, err)

	return d
}

func dec(t *testing.T, s string) decimal.Decimal {
	t.Helper()

	d, err := decimal.Parse(s)
	require.NoError(t, err)

	return d
}

// interestFreeTerms borrow 24,000.00 over 24 months at no interest and with no indexer, insurance
// or fee, due on the 10th from 2024-02-10: every installment amortizes 1,000.00, and after the
// one of 2025-01-10, 12,000.00 is owed over the 12 months left.
func interestFreeTerms(t *testing.T) mortgage.Terms {
	t.Helper()

	from := date(t, "2024-01-10")

	return mortgage.Terms{
		ContractDate:         from,
		OriginalAmount:       dec(t, "24000.00"),
		TermMonths:           24,
		FirstInstallmentDate: date(t, "2024-02-10"),
		AmortizationSystem:   mortgage.SAC,
		Indexer:              mortgage.NoIndexer,
		AppraisalValue:       dec(t, "100000.00"),
		ContractRates:        []mortgage.ContractRate{{EffectiveFrom: from, Rate: dec(t, "0"), Basis: mortgage.Effective}},
		MIPRates:             []mortgage.MonthlyRate{{EffectiveFrom: from, Rate: dec(t, "0")}},
		DFIRates:             []mortgage.MonthlyRate{{EffectiveFrom: from, Rate: dec(t, "0")}},
		Fees:                 []mortgage.Fee{{EffectiveFrom: from, Amount: dec(t, "0")}},
	}
}

// Prepaying 5,000.00 of the 12,000.00 owed on 2025-01-10 ends the mortgage on 2025-08-10, while it
// would have run to 2026-01-10. Shortening the term keeps the 1,000.00 installment; lowering it
// spreads the 7,000.00 left over the 12 months left, and equal outflow prepays the rest of each
// 1,000.00, so it ends on the same date. Either way, the 1,000.00 the owner would still have paid
// each month from 2025-09-10 to 2026-01-10 has nowhere to go, so it is held at zero return:
// 5,000.00 on the horizon, an LTN maturing on 2027-01-01, and nothing owed.
func TestFreedCashIsHeldAtZeroReturnOnceTheMortgageIsPaidOff(t *testing.T) {
	t.Parallel()

	held := []flow{
		{"2025-09-10", "", "0.00", "0.00", "1000.00", "", "0.00"},
		{"2025-10-10", "", "0.00", "0.00", "1000.00", "", "0.00"},
		{"2025-11-10", "", "0.00", "0.00", "1000.00", "", "0.00"},
		{"2025-12-10", "", "0.00", "0.00", "1000.00", "", "0.00"},
		{"2026-01-10", "", "0.00", "0.00", "1000.00", "", "0.00"},
		{"2027-01-01", "", "0.00", "0.00", "0.00", "", "0.00"},
	}

	tests := []struct {
		effect mortgage.PrepaymentEffect
		paying []flow
	}{
		{
			effect: mortgage.ShortenTerm,
			paying: []flow{
				{"2025-01-10", "", "0.00", "5000.00", "0.00", "", "7000.00"},
				{"2025-02-10", "1000.00", "0.00", "0.00", "0.00", "", "6000.00"},
				{"2025-03-10", "1000.00", "0.00", "0.00", "0.00", "", "5000.00"},
				{"2025-04-10", "1000.00", "0.00", "0.00", "0.00", "", "4000.00"},
				{"2025-05-10", "1000.00", "0.00", "0.00", "0.00", "", "3000.00"},
				{"2025-06-10", "1000.00", "0.00", "0.00", "0.00", "", "2000.00"},
				{"2025-07-10", "1000.00", "0.00", "0.00", "0.00", "", "1000.00"},
				{"2025-08-10", "1000.00", "0.00", "0.00", "0.00", "", "0.00"},
			},
		},
		{
			effect: mortgage.LowerInstallment,
			paying: []flow{
				{"2025-01-10", "", "0.00", "5000.00", "0.00", "", "7000.00"},
				{"2025-02-10", "583.33", "0.00", "416.67", "0.00", "", "6000.00"},
				{"2025-03-10", "545.45", "0.00", "454.55", "0.00", "", "5000.00"},
				{"2025-04-10", "500.00", "0.00", "500.00", "0.00", "", "4000.00"},
				{"2025-05-10", "444.44", "0.00", "555.56", "0.00", "", "3000.00"},
				{"2025-06-10", "375.00", "0.00", "625.00", "0.00", "", "2000.00"},
				{"2025-07-10", "285.71", "0.00", "714.29", "0.00", "", "1000.00"},
				{"2025-08-10", "166.67", "0.00", "833.33", "0.00", "", "0.00"},
			},
		},
	}

	for _, tt := range tests {
		t.Run(string(tt.effect), func(t *testing.T) {
			t.Parallel()

			ltn := bonds.Bond{Type: bonds.LTN, Maturity: date(t, "2027-01-01")}
			decided := date(t, "2025-01-10")

			verdicts, err := comparison.Decide(
				comparison.Mortgage{Terms: interestFreeTerms(t)},
				comparison.Market{Quotes: []bonds.Quote{{Bond: ltn, Buy: &bonds.Price{Rate: dec(t, "0.12"), UnitPrice: dec(t, "800.00")}}}},
				comparison.Decision{Amount: dec(t, "5000.00"), Date: decided, Effect: tt.effect},
				decided,
			)
			require.NoError(t, err)
			require.Len(t, verdicts, 1)

			prepay := verdicts[0].Prepay
			assert.Equal(t, append(slices.Clone(tt.paying), held...), flows(prepay))
			assert.Equal(t, "5000.00", prepay.Cash.String())
			assert.Equal(t, "0.00", prepay.OutstandingBalance.String())
			assert.Equal(t, "5000.00", prepay.NetWorth.String())
		})
	}
}

// A statement the bank issued on the decision's date reports the balance without the decision's
// prepayment, which never happened, so the prepayment applies after it: the 11,500.00 the bank
// reports on 2025-01-10, less the 5,000.00, leaves 6,500.00. At no interest, prepaying avoids
// nothing.
func TestADecisionPrepaysAfterTheStatementsOfItsDate(t *testing.T) {
	t.Parallel()

	decided := date(t, "2025-01-10")
	events := mortgage.Events{
		Prepayments: []mortgage.Prepayment{{Date: date(t, "2024-06-10"), Amount: dec(t, "2000.00"), Effect: mortgage.ShortenTerm}},
		Statements:  []mortgage.Statement{{Date: decided, OutstandingBalance: dec(t, "11500.00")}},
	}

	verdicts, err := comparison.Decide(
		comparison.Mortgage{Terms: interestFreeTerms(t), Events: events},
		comparison.Market{Quotes: []bonds.Quote{{
			Bond: bonds.Bond{Type: bonds.LTN, Maturity: date(t, "2027-01-01")},
			Buy:  &bonds.Price{Rate: dec(t, "0.12"), UnitPrice: dec(t, "800.00")},
		}}},
		comparison.Decision{Amount: dec(t, "5000.00"), Date: decided, Effect: mortgage.ShortenTerm},
		decided,
	)
	require.NoError(t, err)
	require.Len(t, verdicts, 1)

	v := verdicts[0]
	assert.Equal(t, flow{"2025-01-10", "", "0.00", "5000.00", "0.00", "", "6500.00"}, flows(v.Prepay)[0])
	assert.Equal(t, "0.00", v.AvoidedCost.String())
}

// A top-up follows the recorded events of its due date too: the statement of 2025-03-10 sets the
// balance to 5,000.00 after that day's 545.45 installment, and only then is the 454.55 it leaves of
// the status quo's 1,000.00 prepaid, leaving 4,545.45.
func TestATopUpPrepaysAfterTheStatementsOfItsDueDate(t *testing.T) {
	t.Parallel()

	decided := date(t, "2025-01-10")
	events := mortgage.Events{Statements: []mortgage.Statement{{Date: date(t, "2025-03-10"), OutstandingBalance: dec(t, "5000.00")}}}

	verdicts, err := comparison.Decide(
		comparison.Mortgage{Terms: interestFreeTerms(t), Events: events},
		comparison.Market{Quotes: []bonds.Quote{{
			Bond: bonds.Bond{Type: bonds.LTN, Maturity: date(t, "2027-01-01")},
			Buy:  &bonds.Price{Rate: dec(t, "0.12"), UnitPrice: dec(t, "800.00")},
		}}},
		comparison.Decision{Amount: dec(t, "5000.00"), Date: decided, Effect: mortgage.LowerInstallment},
		decided,
	)
	require.NoError(t, err)
	require.Len(t, verdicts, 1)

	assert.Equal(t, []flow{
		{"2025-01-10", "", "0.00", "5000.00", "0.00", "", "7000.00"},
		{"2025-02-10", "583.33", "0.00", "416.67", "0.00", "", "6000.00"},
		{"2025-03-10", "545.45", "0.00", "454.55", "0.00", "", "4545.45"},
	}, flows(verdicts[0].Prepay)[:3])
}

// trMortgage borrows 300,000.00 on 2020-01-01 over 360 months under SAC, at 10.06% a year
// effective plus TR, with no insurance or fee, due on the 1st from 2020-02-01. TR is published as
// 0.1488% for every month of 2024, the 1.8% a year the spreadsheet assumes, and projected by its
// trailing 12-month average, the same 0.1488%, from 2025 on.
func trMortgage(t *testing.T) comparison.Mortgage {
	t.Helper()

	from := date(t, "2020-01-01")
	terms := mortgage.Terms{
		ContractDate:         from,
		OriginalAmount:       dec(t, "300000.00"),
		TermMonths:           360,
		FirstInstallmentDate: date(t, "2020-02-01"),
		AmortizationSystem:   mortgage.SAC,
		Indexer:              mortgage.TR,
		AppraisalValue:       dec(t, "400000.00"),
		ContractRates:        []mortgage.ContractRate{{EffectiveFrom: from, Rate: dec(t, "0.1006"), Basis: mortgage.Effective}},
		MIPRates:             []mortgage.MonthlyRate{{EffectiveFrom: from, Rate: dec(t, "0")}},
		DFIRates:             []mortgage.MonthlyRate{{EffectiveFrom: from, Rate: dec(t, "0")}},
		Fees:                 []mortgage.Fee{{EffectiveFrom: from, Amount: dec(t, "0")}},
	}

	var tr []indexes.Value

	for month := date(t, "2024-01-01"); month.Year() == 2024; month = month.AddDate(0, 1, 0) {
		tr = append(tr, indexes.Value{PeriodStart: month, PeriodEnd: month.AddDate(0, 1, 0), Value: dec(t, "0.1488")})
	}

	outlook := indexes.NewOutlook(map[indexes.Index][]indexes.Value{indexes.TR: tr}, indexes.Expectations{}, nil)

	return comparison.Mortgage{Terms: terms, Outlook: outlook}
}

// Investing holds the indivisible bond remainder rather than prepaying it, even when the mortgage
// accrues interest. Its schedule and horizon balance must therefore match the status quo.
func TestInvestingHoldsRemainderWithoutChangingMortgage(t *testing.T) {
	t.Parallel()

	m := trMortgage(t)
	decided := date(t, "2025-01-08")
	maturity := date(t, "2031-01-01")
	market := comparison.Market{Quotes: []bonds.Quote{{
		Bond: bonds.Bond{Type: bonds.LTN, Maturity: maturity},
		Buy:  &bonds.Price{Rate: dec(t, "0.1504")},
	}}}
	status := m.Terms.Plan(m.Outlook, m.Events, decided, mortgage.Plan{Start: decided, Until: maturity})

	for _, effect := range []mortgage.PrepaymentEffect{mortgage.ShortenTerm, mortgage.LowerInstallment} {
		t.Run(string(effect), func(t *testing.T) {
			t.Parallel()
			amount := dec(t, "30034.32")
			verdicts, err := comparison.Decide(m, market, comparison.Decision{Amount: amount, Date: decided, Effect: effect}, decided)
			require.NoError(t, err)
			require.Len(t, verdicts, 1)
			v := verdicts[0]
			require.Empty(t, v.Unavailable)
			remainder := amount.Sub(v.UnitPrice.Mul(v.Quantity).RoundCents())
			require.Positive(t, remainder.Cmp(decimal.Decimal{}))
			require.NotEmpty(t, v.Invest.CashFlows)
			first := v.Invest.CashFlows[0]
			assert.Equal(t, "0.00", first.Prepaid.String())
			assert.Equal(t, remainder.String(), first.Held.String())
			assert.Equal(t, status.AtStart.String(), first.OutstandingBalance.String())
			assert.Equal(t, remainder.String(), v.Invest.Cash.String())
			assert.Equal(t, status.Balance.String(), v.Invest.OutstandingBalance.String())
			require.NotNil(t, v.Invest.Bond)
			assert.Equal(t, v.Invest.Bond.Net.Add(remainder).Sub(status.Balance).String(), v.Invest.NetWorth.String())
			assert.Equal(t, v.Invest.NetWorth.Sub(v.Prepay.NetWorth).String(), v.Advantage.String())

			for _, f := range v.Invest.CashFlows[1:] {
				assert.Equal(t, "0.00", f.Prepaid.String())
				assert.Equal(t, "0.00", f.Held.String())
			}
		})
	}
}

// The spreadsheet's first lot spent 30,034.32 on 2025-01-08 on 69 LTN maturing on 2031-01-01, and
// counted 26,260 as the cost prepaying it would have avoided by then: the contract rate compounded
// on it, corrected by TR, but not the TR correction of the prepaid amount itself. Prepaying it
// avoids both, (((1 + 10.06%)(1 + 1.8%))^(2,184/365) − 1) × 30,034.32, about 29,268 in the
// spreadsheet's calendar days. The schedule counts the 72 months whose installments fall due by
// the horizon, so it lands a little above.
func TestAvoidedCostOfTheSpreadsheetsFirstLotIncludesTheCorrectionOfThePrepaidAmount(t *testing.T) {
	t.Parallel()

	decided := date(t, "2025-01-08")
	ltn := bonds.Bond{Type: bonds.LTN, Maturity: date(t, "2031-01-01")}

	verdicts, err := comparison.Decide(
		trMortgage(t),
		comparison.Market{Quotes: []bonds.Quote{{Bond: ltn, Buy: &bonds.Price{Rate: dec(t, "0.1504"), UnitPrice: dec(t, "435.28")}}}},
		comparison.Decision{Amount: dec(t, "30034.32"), Date: decided, Effect: mortgage.ShortenTerm},
		decided,
	)
	require.NoError(t, err)
	require.Len(t, verdicts, 1)

	assertNear(t, "29268", verdicts[0].AvoidedCost, "150")
}

// assertNear asserts got is within tolerance of want.
func assertNear(t *testing.T, want string, got decimal.Decimal, tolerance string) {
	t.Helper()

	off := got.Sub(dec(t, want))
	if off.Cmp(decimal.Decimal{}) < 0 {
		off = decimal.Decimal{}.Sub(off)
	}

	assert.LessOrEqual(t, off.Cmp(dec(t, tolerance)), 0, "%s is more than %s away from %s", got, tolerance, want)
}

// Under equal outflow, whatever a prepayment frees of an installment is prepaid the same month, so
// shortening the term and lowering the installment leave about the same balance on the horizon:
// only the centavos each installment rounds differ.
func TestShorteningTheTermAndLoweringTheInstallmentGiveNearlyTheSameAdvantage(t *testing.T) {
	t.Parallel()

	for _, system := range []mortgage.AmortizationSystem{mortgage.SAC, mortgage.Price} {
		t.Run(string(system), func(t *testing.T) {
			t.Parallel()

			m := trMortgage(t)
			m.Terms.AmortizationSystem = system
			decided := date(t, "2025-01-08")
			market := comparison.Market{Quotes: []bonds.Quote{{
				Bond: bonds.Bond{Type: bonds.LTN, Maturity: date(t, "2031-01-01")},
				Buy:  &bonds.Price{Rate: dec(t, "0.1504"), UnitPrice: dec(t, "435.28")},
			}}}

			advantage := func(effect mortgage.PrepaymentEffect) decimal.Decimal {
				verdicts, err := comparison.Decide(m, market, comparison.Decision{Amount: dec(t, "30034.32"), Date: decided, Effect: effect}, decided)
				require.NoError(t, err)
				require.Len(t, verdicts, 1)

				return verdicts[0].Advantage
			}

			shortened, lowered := advantage(mortgage.ShortenTerm), advantage(mortgage.LowerInstallment)
			t.Log(shortened, lowered)
			assertNear(t, shortened.String(), lowered, "5.00")
		})
	}
}

// A decision offers the bonds that follow the mortgage's indexer (ADR-0007): an NTN-B Principal or
// an NTN-B against an IPCA mortgage, an LTN or an NTN-F against any other. Only bonds on offer,
// maturing after the decision's date, are compared. Without IPCA index numbers, the VNA of an IPCA+
// bond is unknown, so its verdict says so.
func TestADecisionComparesTheBondsThatFollowTheMortgagesIndexer(t *testing.T) {
	t.Parallel()

	buy := &bonds.Price{Rate: dec(t, "0.07"), UnitPrice: dec(t, "500.00")}
	quote := func(bondType bonds.Type, maturity string, buy *bonds.Price) bonds.Quote {
		return bonds.Quote{Bond: bonds.Bond{Type: bondType, Maturity: date(t, maturity)}, Buy: buy}
	}
	market := comparison.Market{Quotes: []bonds.Quote{
		quote(bonds.LTN, "2025-01-01", buy),
		quote(bonds.LTN, "2028-01-01", buy),
		quote(bonds.LTN, "2029-01-01", nil),
		quote(bonds.LTN, "2030-01-01", buy),
		quote(bonds.NTNF, "2031-01-01", buy),
		quote(bonds.NTNBPrincipal, "2029-05-15", buy),
		quote(bonds.NTNBPrincipal, "2033-05-15", buy),
		quote(bonds.NTNBPrincipal, "2035-05-15", nil),
		quote(bonds.NTNB, "2033-05-15", buy),
	}}

	tests := []struct {
		indexer mortgage.Indexer
		want    []string
	}{
		{mortgage.NoIndexer, []string{"ltn 2028-01-01", "ltn 2030-01-01", "ntn_f 2031-01-01"}},
		{mortgage.TR, []string{"ltn 2028-01-01", "ltn 2030-01-01", "ntn_f 2031-01-01"}},
		{mortgage.PoupancaYield, []string{"ltn 2028-01-01", "ltn 2030-01-01", "ntn_f 2031-01-01"}},
		{mortgage.IPCA, []string{
			"ntn_b_principal 2029-05-15 missing_ipca", "ntn_b_principal 2033-05-15 missing_ipca", "ntn_b 2033-05-15 missing_ipca",
		}},
	}

	for _, tt := range tests {
		t.Run(string(tt.indexer), func(t *testing.T) {
			t.Parallel()

			terms := interestFreeTerms(t)
			terms.Indexer = tt.indexer
			decided := date(t, "2025-01-10")

			verdicts, err := comparison.Decide(comparison.Mortgage{Terms: terms}, market,
				comparison.Decision{Amount: dec(t, "5000.00"), Date: decided, Effect: mortgage.ShortenTerm}, decided)
			require.NoError(t, err)

			got := make([]string, 0, len(verdicts))
			for _, v := range verdicts {
				got = append(got, strings.TrimSpace(fmt.Sprintf("%s %s %s", v.Bond.Type, v.Bond.Maturity.Format(time.DateOnly), v.Unavailable)))
			}

			assert.Equal(t, tt.want, got)
		})
	}
}

// amountView is a bond amount as text.
type amountView struct {
	Gross, IOF, IncomeTax, CustodyFee, Net string
}

func amountOf(a *bonds.Amount) amountView {
	if a == nil {
		return amountView{}
	}

	return amountView{a.Gross.String(), a.IOF.String(), a.IncomeTax.String(), a.CustodyFee.String(), a.Net.String()}
}

// ipcaMortgage borrows 50,000.00 on 2025-01-03 over 24 months under SAC, at 6% a year effective
// plus IPCA, with no insurance or fee, due on the 3rd from 2025-02-03. The first installment isn't
// corrected, and each later anniversary corrects the balance by the IPCA of the second month before
// it. IPCA is published at ipca% for every month from 2024-11 to 2025-10, and projected by its
// trailing 12-month average, the same, after.
func ipcaMortgage(t *testing.T, ipca string) (comparison.Mortgage, indexes.Outlook) {
	t.Helper()

	from := date(t, "2025-01-03")
	terms := mortgage.Terms{
		ContractDate:         from,
		OriginalAmount:       dec(t, "50000.00"),
		TermMonths:           24,
		FirstInstallmentDate: date(t, "2025-02-03"),
		AmortizationSystem:   mortgage.SAC,
		Indexer:              mortgage.IPCA,
		AppraisalValue:       dec(t, "100000.00"),
		ContractRates:        []mortgage.ContractRate{{EffectiveFrom: from, Rate: dec(t, "0.06"), Basis: mortgage.Effective}},
		MIPRates:             []mortgage.MonthlyRate{{EffectiveFrom: from, Rate: dec(t, "0")}},
		DFIRates:             []mortgage.MonthlyRate{{EffectiveFrom: from, Rate: dec(t, "0")}},
		Fees:                 []mortgage.Fee{{EffectiveFrom: from, Amount: dec(t, "0")}},
	}

	var history []indexes.Value

	for month := date(t, "2024-11-01"); !month.After(date(t, "2025-10-01")); month = month.AddDate(0, 1, 0) {
		history = append(history, indexes.Value{PeriodStart: month, PeriodEnd: month, Value: dec(t, ipca)})
	}

	outlook := indexes.NewOutlook(map[indexes.Index][]indexes.Value{indexes.IPCA: history}, indexes.Expectations{},
		[]indexes.ProjectionMethod{{Index: indexes.IPCA, Method: indexes.Trailing12}})

	return comparison.Mortgage{Terms: terms, Outlook: outlook}, outlook
}

// lotTaxes are the income tax brackets of Lei 11.033/2004 and a custody fee of 0.20% a year.
func lotTaxes(t *testing.T) bonds.Taxes {
	t.Helper()

	from := date(t, "2005-01-01")

	return bonds.Taxes{
		IncomeTax: []bonds.IncomeTaxRate{
			{EffectiveFrom: from, MinDays: 0, Rate: dec(t, "0.225")},
			{EffectiveFrom: from, MinDays: 181, Rate: dec(t, "0.20")},
			{EffectiveFrom: from, MinDays: 361, Rate: dec(t, "0.175")},
			{EffectiveFrom: from, MinDays: 721, Rate: dec(t, "0.15")},
		},
		CustodyFee: []bonds.CustodyFeeRate{{EffectiveFrom: from, Rate: dec(t, "0.0020")}},
	}
}

// Against an IPCA mortgage, 10,000.00 on 2025-11-03 either prepays it or buys an NTN-B Principal
// maturing on 2026-08-15 at 7.5% a year over IPCA. The expected figures come from a separate
// implementation in Python's decimal module of the schedule, Tesouro's VNA and quotation over
// ANBIMA's holiday list, and the taxes. The two IPCA lags differ: the mortgage corrects each month
// by the IPCA of the second month before its anniversary, while the VNA moves on each 15th by the
// index number of the month before, from 7,300.00 for 2025-09 against 1,614.62 for June 2000, and
// pro rata in between. Income tax falls on the IPCA correction of the bond too, so a higher IPCA
// raises both the avoided cost and the tax, and the advantage doesn't stay put.
func TestAnNTNBPrincipalVerdictFollowsTheIPCAPathInBothScenarios(t *testing.T) {
	t.Parallel()

	tests := []struct {
		name, ipca, unitPrice, quantity string
		maturity                        amountView
		avoided                         string
		prepay                          []flow
	}{
		{
			name:      "low IPCA path, 0.20% a month",
			ipca:      "0.20",
			unitPrice: "4279.129184",
			quantity:  "2.33",
			maturity:  amountView{Gross: "10746.96", IOF: "0.00", IncomeTax: "151.96", CustodyFee: "16.78", Net: "10578.22"},
			avoided:   "636.22",
			prepay: []flow{
				{"2025-11-03", "", "0.00", "10000.00", "0.00", "", "19695.89"},
				{"2025-12-03", "2069.59", "0.00", "200.63", "0.00", "", "17561.12"},
				{"2026-01-03", "2040.79", "0.00", "223.60", "0.00", "", "15417.50"},
				{"2026-02-03", "2006.24", "0.00", "252.29", "0.00", "", "13265.01"},
				{"2026-03-03", "1963.49", "0.00", "289.14", "0.00", "", "11103.61"},
				{"2026-04-03", "1908.46", "0.00", "338.25", "0.00", "", "8933.27"},
				{"2026-05-03", "1833.80", "0.00", "406.96", "0.00", "", "6753.95"},
				{"2026-06-03", "1724.81", "0.00", "509.96", "0.00", "", "4565.63"},
				{"2026-07-03", "1547.19", "0.00", "681.56", "0.00", "", "2368.28"},
				{"2026-08-03", "1198.06", "0.00", "1024.63", "0.00", "", "161.88"},
				{"2026-08-15", "", "0.00", "0.00", "0.00", "", "161.88"},
			},
		},
		{
			name:      "high IPCA path, 0.80% a month",
			ipca:      "0.80",
			unitPrice: "4294.815776",
			quantity:  "2.32",
			maturity:  amountView{Gross: "11359.15", IOF: "0.00", IncomeTax: "275.49", CustodyFee: "17.74", Net: "11065.92"},
			avoided:   "1223.41",
			prepay: []flow{
				{"2025-11-03", "", "0.00", "10000.00", "0.00", "", "21335.14"},
				{"2025-12-03", "2255.26", "0.00", "154.62", "0.00", "", "19200.62"},
				{"2026-01-03", "2244.68", "0.00", "173.41", "0.00", "", "17030.34"},
				{"2026-02-03", "2229.38", "0.00", "196.89", "0.00", "", "14823.87"},
				{"2026-03-03", "2207.37", "0.00", "227.06", "0.00", "", "12580.76"},
				{"2026-04-03", "2175.30", "0.00", "267.27", "0.00", "", "10300.57"},
				{"2026-05-03", "2127.13", "0.00", "323.55", "0.00", "", "7982.83"},
				{"2026-06-03", "2050.84", "0.00", "407.93", "0.00", "", "5627.09"},
				{"2026-07-03", "1918.31", "0.00", "548.52", "0.00", "", "3232.89"},
				{"2026-08-03", "1645.24", "0.00", "829.62", "0.00", "", "799.75"},
				{"2026-08-15", "", "0.00", "0.00", "0.00", "", "799.75"},
			},
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			t.Parallel()

			m, outlook := ipcaMortgage(t, tt.ipca)
			decided := date(t, "2025-11-03")
			market := comparison.Market{
				Quotes: []bonds.Quote{{
					Bond: bonds.Bond{Type: bonds.NTNBPrincipal, Maturity: date(t, "2026-08-15")},
					Buy:  &bonds.Price{Rate: dec(t, "0.075"), UnitPrice: dec(t, "4000.00")},
				}},
				Taxes: lotTaxes(t),
				IPCA: bonds.IPCA{
					Numbers: bonds.IPCANumbers{date(t, "2000-06-01"): dec(t, "1614.62"), date(t, "2025-09-01"): dec(t, "7300.00")},
					Outlook: outlook,
				},
			}

			verdicts, err := comparison.Decide(m, market,
				comparison.Decision{Amount: dec(t, "10000.00"), Date: decided, Effect: mortgage.ShortenTerm}, decided)
			require.NoError(t, err)
			require.Len(t, verdicts, 1)

			v := verdicts[0]
			assert.Equal(t, tt.unitPrice, v.UnitPrice.String())
			assert.Equal(t, tt.quantity, v.Quantity.String())
			assert.Equal(t, tt.maturity, amountOf(v.Invest.Bond))
			status := m.Terms.Plan(m.Outlook, m.Events, decided, mortgage.Plan{Start: decided, Until: market.Quotes[0].Bond.Maturity})
			cost := v.UnitPrice.Mul(v.Quantity).RoundCents()
			remainder := dec(t, "10000.00").Sub(cost)
			expectedWorth := v.Invest.Bond.Net.Add(remainder).Sub(status.Balance)
			assert.Equal(t, expectedWorth.String(), v.Invest.NetWorth.String())
			assert.Equal(t, expectedWorth.Sub(v.Prepay.NetWorth).String(), v.Advantage.String())
			assert.Equal(t, tt.avoided, v.AvoidedCost.String())
			assert.Equal(t, tt.prepay, flows(v.Prepay))
			require.Equal(t, flow{Date: "2025-11-03", Invested: cost.String(), Prepaid: "0.00", Held: remainder.String(), OutstandingBalance: status.AtStart.String()}, flows(v.Invest)[0])

			for _, installment := range status.Installments {
				if !installment.DueDate.After(decided) {
					continue
				}

				found := false

				for _, f := range v.Invest.CashFlows {
					if f.Date.Equal(installment.DueDate) {
						require.NotNil(t, f.Installment)
						assert.Equal(t, installment.Amount.String(), f.Installment.Amount.String())
						assert.Equal(t, installment.OutstandingBalance.String(), f.OutstandingBalance.String())
						assert.Equal(t, "0.00", f.Prepaid.String())

						found = true
					}
				}

				assert.True(t, found, "missing installment %s", installment.DueDate)
			}

			assert.Equal(t, []indexes.ProjectionMethod{{Index: indexes.IPCA, Method: indexes.Trailing12}}, v.ProjectedBy)
			assert.Equal(t, []indexes.Index{indexes.IPCA, indexes.IPCANumber}, v.Indexes)
		})
	}
}

// An amount that buys less than a hundredth of the bond has no scenarios, but its price still names
// the projected IPCA its VNA was grown by: settled on 2025-12-03, a month after today, the VNA
// grows pro rata from 2025-11-15 by the projected IPCA of November.
func TestAnAmountTooSmallForAHundredthOfTheBondHasNoScenarios(t *testing.T) {
	t.Parallel()

	m, outlook := ipcaMortgage(t, "0.20")
	decided := date(t, "2025-12-03")
	market := comparison.Market{
		Quotes: []bonds.Quote{{
			Bond: bonds.Bond{Type: bonds.NTNBPrincipal, Maturity: date(t, "2026-08-15")},
			Buy:  &bonds.Price{Rate: dec(t, "0.075"), UnitPrice: dec(t, "4000.00")},
		}},
		Taxes: lotTaxes(t),
		IPCA: bonds.IPCA{
			Numbers: bonds.IPCANumbers{date(t, "2000-06-01"): dec(t, "1614.62"), date(t, "2025-09-01"): dec(t, "7300.00")},
			Outlook: outlook,
		},
	}

	verdicts, err := comparison.Decide(m, market,
		comparison.Decision{Amount: dec(t, "42.79"), Date: decided, Effect: mortgage.ShortenTerm}, date(t, "2025-11-03"))
	require.NoError(t, err)
	require.Len(t, verdicts, 1)

	v := verdicts[0]
	assert.Equal(t, comparison.AmountTooSmall, v.Unavailable)
	assert.Equal(t, "4313.493690", v.UnitPrice.String())
	assert.Equal(t, "0.00", v.Quantity.String())
	assert.Equal(t, []indexes.ProjectionMethod{{Index: indexes.IPCA, Method: indexes.Trailing12}}, v.ProjectedBy)
	assert.Empty(t, v.Prepay.CashFlows)
	assert.Empty(t, v.Invest.CashFlows)
}

// A decision dated after today starts from a balance corrected by the projected TR of the months
// before it, though no installment falls due between it and the horizon, so the verdict names the
// TR's method. Today is 2025-01-08; the installments of 2025-01-10 and 2025-02-10 are corrected by
// the projected TR, and the LTN matures on 2025-03-01, before the next one.
func TestAVerdictNamesTheProjectionsTheBalancesBeforeTheDecisionRead(t *testing.T) {
	t.Parallel()

	m := trMortgage(t)
	m.Terms = interestFreeTerms(t)
	m.Terms.Indexer = mortgage.TR

	verdicts, err := comparison.Decide(m,
		comparison.Market{Quotes: []bonds.Quote{{
			Bond: bonds.Bond{Type: bonds.LTN, Maturity: date(t, "2025-03-01")},
			Buy:  &bonds.Price{Rate: dec(t, "0.12"), UnitPrice: dec(t, "990.00")},
		}}},
		comparison.Decision{Amount: dec(t, "5000.00"), Date: date(t, "2025-02-15"), Effect: mortgage.ShortenTerm},
		date(t, "2025-01-08"),
	)
	require.NoError(t, err)
	require.Len(t, verdicts, 1)

	assert.Equal(t, []indexes.ProjectionMethod{{Index: indexes.TR, Method: indexes.Trailing12}}, verdicts[0].ProjectedBy)
}

// couponFlow is a scenario's cash flow on one date as text, with the coupon the bond paid that
// day, gross, income tax, custody fee and net, where it paid one.
type couponFlow struct {
	flow
	Coupon amountView
}

func couponFlows(s comparison.Scenario) []couponFlow {
	out := make([]couponFlow, 0, len(s.CashFlows))

	for i, f := range flows(s) {
		row := couponFlow{flow: f}
		if coupon := s.CashFlows[i].Coupon; coupon != nil {
			row.Coupon = amountOf(coupon)
		}

		out = append(out, row)
	}

	return out
}

// 5,000.00 on 2025-01-10, with 12,000.00 still owed interest-free at 1,000.00 a month, buys 5.14
// NTN-F maturing on 2027-01-01 at 12% a year, 970.884128 each. The expected figures come from a
// separate implementation in Python's decimal module of Tesouro's NTN-F price over ANBIMA's holiday
// list and the taxes. Each coupon of 48.80885 a bond, 250.88 for the lot, is taxed at the bracket
// of the days since the purchase: 172 days pay 22.5%, 356 days 20% and 537 days 17.5%. Its custody
// fee accrues from the purchase or the previous coupon. Each net coupon is prepaid on its date, and
// equal outflow prepays what the lower installments leave of the 1,000.00. Once nothing is owed, the
// coupon of 2026-07-01 is held.
func TestAnNTNFVerdictPrepaysEachNetCouponOnItsDate(t *testing.T) {
	t.Parallel()

	decided := date(t, "2025-01-10")
	verdicts, err := comparison.Decide(
		comparison.Mortgage{Terms: interestFreeTerms(t)},
		comparison.Market{
			Quotes: []bonds.Quote{{
				Bond: bonds.Bond{Type: bonds.NTNF, Maturity: date(t, "2027-01-01")},
				Buy:  &bonds.Price{Rate: dec(t, "0.12"), UnitPrice: dec(t, "970.00")},
			}},
			Taxes: lotTaxes(t),
		},
		comparison.Decision{Amount: dec(t, "5000.00"), Date: decided, Effect: mortgage.ShortenTerm},
		decided,
	)
	require.NoError(t, err)
	require.Len(t, verdicts, 1)

	v := verdicts[0]
	assert.Equal(t, "970.884128", v.UnitPrice.String())
	assert.Equal(t, "5.14", v.Quantity.String())

	none := amountView{}
	assert.Equal(t, []couponFlow{
		{flow{"2025-01-10", "", "4990.34", "0.00", "9.66", "", "12000.00"}, none},
		{flow{"2025-02-10", "1000.00", "0.00", "0.00", "0.00", "", "11000.00"}, none},
		{flow{"2025-03-10", "1000.00", "0.00", "0.00", "0.00", "", "10000.00"}, none},
		{flow{"2025-04-10", "1000.00", "0.00", "0.00", "0.00", "", "9000.00"}, none},
		{flow{"2025-05-10", "1000.00", "0.00", "0.00", "0.00", "", "8000.00"}, none},
		{flow{"2025-06-10", "1000.00", "0.00", "0.00", "0.00", "", "7000.00"}, none},
		{flow{"2025-07-01", "", "0.00", "190.59", "0.00", "", "6809.41"}, amountView{"250.88", "0.00", "55.33", "4.96", "190.59"}},
		{flow{"2025-07-10", "972.77", "0.00", "27.23", "0.00", "", "5809.41"}, none},
		{flow{"2025-08-10", "968.24", "0.00", "31.76", "0.00", "", "4809.41"}, none},
		{flow{"2025-09-10", "961.88", "0.00", "38.12", "0.00", "", "3809.41"}, none},
		{flow{"2025-10-10", "952.35", "0.00", "47.65", "0.00", "", "2809.41"}, none},
		{flow{"2025-11-10", "936.47", "0.00", "63.53", "0.00", "", "1809.41"}, none},
		{flow{"2025-12-10", "904.71", "0.00", "95.29", "0.00", "", "809.41"}, none},
		{flow{"2026-01-01", "", "0.00", "196.42", "0.00", "", "612.99"}, amountView{"250.88", "0.00", "49.11", "5.35", "196.42"}},
		{flow{"2026-01-10", "612.99", "0.00", "0.00", "387.01", "", "0.00"}, none},
		{flow{"2026-07-01", "", "0.00", "0.00", "202.60", "", "0.00"}, amountView{"250.88", "0.00", "42.98", "5.30", "202.60"}},
		{flow{"2027-01-01", "", "0.00", "0.00", "0.00", "5326.17", "0.00"}, none},
	}, couponFlows(v.Invest))
	assert.Equal(t, amountView{"5390.88", "0.00", "59.27", "5.44", "5326.17"}, amountOf(v.Invest.Bond))
	assert.Equal(t, "599.27", v.Invest.Cash.String())
	assert.Equal(t, "5925.44", v.Invest.NetWorth.String())
	assert.Equal(t, "925.44", v.Advantage.String())
	assert.Empty(t, v.ProjectedBy)
}

// A coupon due the same day as an installment is prepaid after it, and the day shows both on one
// row. With the interest-free mortgage due on the 1st, 5,000.00 on 2025-01-02 buys 5.16 NTN-F
// maturing on 2027-01-01 at 12% a year. On 2025-07-01, 180 days after the purchase and so still at
// 22.5% of income tax, the 1,000.00 installment leaves 6,000.00 and the 191.15 net coupon is prepaid
// from it. The figures come from the same separate implementation in Python.
func TestACouponDueWithAnInstallmentIsPrepaidAfterIt(t *testing.T) {
	t.Parallel()

	terms := interestFreeTerms(t)
	terms.FirstInstallmentDate = date(t, "2024-02-01")
	decided := date(t, "2025-01-02")

	verdicts, err := comparison.Decide(
		comparison.Mortgage{Terms: terms},
		comparison.Market{
			Quotes: []bonds.Quote{{
				Bond: bonds.Bond{Type: bonds.NTNF, Maturity: date(t, "2027-01-01")},
				Buy:  &bonds.Price{Rate: dec(t, "0.12"), UnitPrice: dec(t, "970.00")},
			}},
			Taxes: lotTaxes(t),
		},
		comparison.Decision{Amount: dec(t, "5000.00"), Date: decided, Effect: mortgage.ShortenTerm},
		decided,
	)
	require.NoError(t, err)
	require.Len(t, verdicts, 1)

	got := couponFlows(verdicts[0].Invest)
	i := slices.IndexFunc(got, func(f couponFlow) bool { return f.Date == "2025-07-01" })
	require.Positive(t, i)
	assert.Equal(t, []couponFlow{
		{flow{"2025-06-01", "1000.00", "0.00", "0.00", "0.00", "", "7000.00"}, amountView{}},
		{flow{"2025-07-01", "1000.00", "0.00", "191.15", "0.00", "", "5808.85"}, amountView{"251.85", "0.00", "55.49", "5.21", "191.15"}},
		{flow{"2025-08-01", "968.14", "0.00", "31.86", "0.00", "", "4808.85"}, amountView{}},
	}, got[i-1:i+2])
}

// A coupon's prepayment has the effect the owner chose. Over 240 months the interest-free mortgage
// charges 100.00 a month, and on 2025-07-01 the NTN-F's 190.59 net coupon leaves 22,109.41 owed
// over the 223 months left. Shortening the term drops one of them and keeps the installment at
// most 100.00; lowering it spreads the balance over all 223. Equal outflow prepays the rest of each
// 100.00. The figures come from the same separate implementation in Python.
func TestACouponPrepaymentHasTheEffectTheOwnerChose(t *testing.T) {
	t.Parallel()

	tests := []struct {
		effect mortgage.PrepaymentEffect
		after  []couponFlow
	}{
		{mortgage.ShortenTerm, []couponFlow{
			{flow{"2025-07-10", "99.59", "0.00", "0.41", "0.00", "", "22009.41"}, amountView{}},
			{flow{"2025-08-10", "99.59", "0.00", "0.41", "0.00", "", "21909.41"}, amountView{}},
		}},
		{mortgage.LowerInstallment, []couponFlow{
			{flow{"2025-07-10", "99.15", "0.00", "0.85", "0.00", "", "22009.41"}, amountView{}},
			{flow{"2025-08-10", "99.14", "0.00", "0.86", "0.00", "", "21909.41"}, amountView{}},
		}},
	}

	for _, tt := range tests {
		t.Run(string(tt.effect), func(t *testing.T) {
			t.Parallel()

			terms := interestFreeTerms(t)
			terms.TermMonths = 240
			decided := date(t, "2025-01-10")

			verdicts, err := comparison.Decide(
				comparison.Mortgage{Terms: terms},
				comparison.Market{
					Quotes: []bonds.Quote{{
						Bond: bonds.Bond{Type: bonds.NTNF, Maturity: date(t, "2027-01-01")},
						Buy:  &bonds.Price{Rate: dec(t, "0.12"), UnitPrice: dec(t, "970.00")},
					}},
					Taxes: lotTaxes(t),
				},
				comparison.Decision{Amount: dec(t, "5000.00"), Date: decided, Effect: tt.effect},
				decided,
			)
			require.NoError(t, err)
			require.Len(t, verdicts, 1)

			got := couponFlows(verdicts[0].Invest)
			i := slices.IndexFunc(got, func(f couponFlow) bool { return f.Date == "2025-07-01" })
			require.Positive(t, i)
			assert.Equal(t, append([]couponFlow{
				{flow{"2025-06-10", "100.00", "0.00", "0.00", "0.00", "", "22300.00"}, amountView{}},
				{flow{"2025-07-01", "", "0.00", "190.59", "0.00", "", "22109.41"}, amountView{"250.88", "0.00", "55.33", "4.96", "190.59"}},
			}, tt.after...), got[i-1:i+3])
		})
	}
}

// Against an IPCA mortgage, 10,000.00 on 2025-11-03 buys 2.20 NTN-B maturing on 2026-08-15 at 7.5%
// a year over IPCA. Its coupon of 2026-02-15 is 2.956301% of that day's VNA, 4,557.465802, which
// needs January's index number: IBGE's latest, 7,300.00 for 2025-09, grown by October's published
// IPCA and the projected IPCA of the months after, so the coupon is marked projected. The expected
// figures come from a separate implementation in Python's decimal module, whose schedule reproduces
// the prepay scenario of the NTN-B Principal test above. 104 days after the purchase the coupon pays
// 22.5% of income tax, and its net is prepaid on its date, between the installments of 2026-02-03
// and 2026-03-03; equal outflow then prepays what the lower installments leave.
func TestAnNTNBVerdictPrepaysItsProjectedCoupons(t *testing.T) {
	t.Parallel()

	m, outlook := ipcaMortgage(t, "0.20")
	decided := date(t, "2025-11-03")
	market := comparison.Market{
		Quotes: []bonds.Quote{{
			Bond: bonds.Bond{Type: bonds.NTNB, Maturity: date(t, "2026-08-15")},
			Buy:  &bonds.Price{Rate: dec(t, "0.075"), UnitPrice: dec(t, "4000.00")},
		}},
		Taxes: lotTaxes(t),
		IPCA: bonds.IPCA{
			Numbers: bonds.IPCANumbers{date(t, "2000-06-01"): dec(t, "1614.62"), date(t, "2025-09-01"): dec(t, "7300.00")},
			Outlook: outlook,
		},
	}

	verdicts, err := comparison.Decide(m, market,
		comparison.Decision{Amount: dec(t, "10000.00"), Date: decided, Effect: mortgage.ShortenTerm}, decided)
	require.NoError(t, err)
	require.Len(t, verdicts, 1)

	v := verdicts[0]
	assert.Equal(t, "4536.718091", v.UnitPrice.String())
	assert.Equal(t, "2.20", v.Quantity.String())
	assert.Equal(t, amountView{"10447.33", "0.00", "95.01", "10.36", "10341.96"}, amountOf(v.Invest.Bond))

	none := amountView{}
	assert.Equal(t, []couponFlow{
		{flow{"2025-11-03", "", "9980.78", "0.00", "19.22", "", "29695.89"}, none},
		{flow{"2025-12-03", "2270.22", "0.00", "0.00", "0.00", "", "27629.90"}, none},
		{flow{"2026-01-03", "2264.39", "0.00", "0.00", "0.00", "", "25555.53"}, none},
		{flow{"2026-02-03", "2258.53", "0.00", "0.00", "0.00", "", "23472.75"}, none},
		{flow{"2026-02-15", "", "0.00", "229.43", "0.00", "", "23243.32"}, amountView{"296.41", "0.00", "61.13", "5.85", "229.43"}},
		{flow{"2026-03-03", "2230.62", "0.00", "22.01", "0.00", "", "21150.54"}, none},
		{flow{"2026-04-03", "2222.44", "0.00", "24.27", "0.00", "", "19049.29"}, none},
		{flow{"2026-05-03", "2213.73", "0.00", "27.03", "0.00", "", "16939.54"}, none},
		{flow{"2026-06-03", "2204.30", "0.00", "30.47", "0.00", "", "14821.27"}, none},
		{flow{"2026-07-03", "2193.85", "0.00", "34.90", "0.00", "", "12694.45"}, none},
		{flow{"2026-08-03", "2181.88", "0.00", "40.81", "0.00", "", "10559.06"}, none},
		{flow{"2026-08-15", "", "0.00", "0.00", "0.00", "10341.96", "10559.06"}, none},
	}, couponFlows(v.Invest))
	assert.Equal(t, "-197.88", v.Invest.NetWorth.String())
	assert.Equal(t, "-36.00", v.Advantage.String())

	trailing := []indexes.ProjectionMethod{{Index: indexes.IPCA, Method: indexes.Trailing12}}
	assert.Equal(t, trailing, v.Invest.CashFlows[4].Coupon.ProjectedBy)
	assert.Equal(t, trailing, v.ProjectedBy)
	assert.Equal(t, []indexes.Index{indexes.IPCA, indexes.IPCANumber}, v.Indexes)
}
