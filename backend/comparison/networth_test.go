package comparison_test

import (
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"github.com/gringolito/debtwise/backend/bonds"
	"github.com/gringolito/debtwise/backend/comparison"
	"github.com/gringolito/debtwise/backend/decimal"
	"github.com/gringolito/debtwise/backend/mortgage"
)

// netWorths are the net worth of each of the scenario's cash flows, as text.
func netWorths(s comparison.Scenario) []string {
	out := make([]string, 0, len(s.CashFlows))

	for _, f := range s.CashFlows {
		out = append(out, f.NetWorth.String())
	}

	return out
}

// accruedNetWorths are the net worth of each of the scenario's cash flows before its horizon as the
// cash held through it, plus the net Accrual of lot that day, less what is owed: the lot valued on
// that one day alone.
func accruedNetWorths(t *testing.T, s comparison.Scenario, lot bonds.Lot) []string {
	t.Helper()

	held := decimal.MustParse("0.00")
	out := make([]string, 0, len(s.CashFlows))

	for _, f := range s.CashFlows {
		held = held.Add(f.Held)

		if f.Redeemed != nil {
			out = append(out, held.Add(f.Redeemed.Net).Sub(f.OutstandingBalance).String())

			continue
		}

		valuation, err := lot.Value(f.Date, lotTaxes(t), bonds.IPCA{}, nil)
		require.NoError(t, err)
		require.NotNil(t, valuation.Accrual)

		out = append(out, held.Add(valuation.Accrual.Net).Sub(f.OutstandingBalance).String())
	}

	return out
}

// Prepaying 5,000.00 of the 12,000.00 owed on 2025-01-10 leaves 7,000.00 owed, and the net worth
// climbs by the 1,000.00 each installment pays off until the mortgage ends on 2025-08-10; from then
// on the 1,000.00 the owner would still have paid each month is held, up to 5,000.00 on the
// horizon, which is the scenario's net worth.
func TestAPrepayScenarioHasANetWorthOnEachDate(t *testing.T) {
	t.Parallel()

	decided := date(t, "2025-01-10")
	verdicts, err := comparison.Decide(
		comparison.Mortgage{Terms: interestFreeTerms(t)},
		comparison.Market{Quotes: []bonds.Quote{{
			Bond: bonds.Bond{Type: bonds.LTN, Maturity: date(t, "2027-01-01")},
			Buy:  &bonds.Price{Rate: dec(t, "0.12"), UnitPrice: dec(t, "800.00")},
		}}},
		comparison.Decision{Amount: dec(t, "5000.00"), Date: decided, Effect: mortgage.ShortenTerm},
		decided,
	)
	require.NoError(t, err)
	require.Len(t, verdicts, 1)

	assert.Equal(t, []string{
		"-7000.00", "-6000.00", "-5000.00", "-4000.00", "-3000.00", "-2000.00", "-1000.00", "0.00",
		"1000.00", "2000.00", "3000.00", "4000.00", "5000.00", "5000.00",
	}, netWorths(verdicts[0].Prepay))
	assert.Equal(t, "5000.00", verdicts[0].Prepay.NetWorth.String())
}

// 5,000.00 on 2025-01-10 buys 5.14 NTN-F maturing on 2027-01-01 at 12% a year, 970.884128 each, for
// 4,990.34. Right after buying, the 9.66 held and the bond at its cost leave the owner 7,000.00
// below the 12,000.00 owed, as prepaying does. Until the horizon the bond is worth its Accrual that
// day, net of its taxes and fee, and on the horizon its Maturity Value; the last flow's net worth is
// the scenario's.
func TestAnInvestScenarioValuesTheBondAtItsAccrualUntilTheHorizon(t *testing.T) {
	t.Parallel()

	decided := date(t, "2025-01-10")
	maturity := date(t, "2027-01-01")
	verdicts, err := comparison.Decide(
		comparison.Mortgage{Terms: interestFreeTerms(t)},
		comparison.Market{
			Quotes: []bonds.Quote{{
				Bond: bonds.Bond{Type: bonds.NTNF, Maturity: maturity},
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
	got := netWorths(v.Invest)

	require.Len(t, got, 17)
	assert.Equal(t, "-7000.00", got[0])
	assert.Equal(t, "5925.44", got[len(got)-1])
	assert.Equal(t, v.Invest.NetWorth.String(), got[len(got)-1])

	lot := bonds.Lot{
		Bond: bonds.Bond{Type: bonds.NTNF, Maturity: maturity}, PurchaseDate: decided,
		Rate: dec(t, "0.12"), UnitPrice: v.UnitPrice, Quantity: v.Quantity,
	}
	assert.Equal(t, accruedNetWorths(t, v.Invest, lot), got)
}

// The last flow's net worth is the scenario's, for the prepaying scenario and the investing one.
func TestTheLastFlowsNetWorthIsTheScenariosNetWorth(t *testing.T) {
	t.Parallel()

	decided := date(t, "2025-01-10")
	verdicts, err := comparison.Decide(
		comparison.Mortgage{Terms: interestFreeTerms(t)},
		comparison.Market{
			Quotes: []bonds.Quote{
				{Bond: bonds.Bond{Type: bonds.LTN, Maturity: date(t, "2027-01-01")}, Buy: &bonds.Price{Rate: dec(t, "0.12")}},
				{Bond: bonds.Bond{Type: bonds.NTNF, Maturity: date(t, "2027-01-01")}, Buy: &bonds.Price{Rate: dec(t, "0.12")}},
			},
			Taxes: lotTaxes(t),
		},
		comparison.Decision{Amount: dec(t, "5000.00"), Date: decided, Effect: mortgage.LowerInstallment},
		decided,
	)
	require.NoError(t, err)
	require.Len(t, verdicts, 2)

	for _, v := range verdicts {
		for name, s := range map[string]comparison.Scenario{"invest": v.Invest, "prepay": v.Prepay} {
			last := s.CashFlows[len(s.CashFlows)-1]
			assert.Equal(t, s.NetWorth.String(), last.NetWorth.String(), "%s %s", v.Bond.Type, name)
		}
	}
}

// Selling the lot on 2025-01-10 prepays its 4,404.89 net Market Value, which leaves 7,595.11 owed
// and no bond. Holding it keeps the 12,000.00 owed and the bond, worth its Accrual that day until
// the horizon; the last flows' net worths are the scenarios'.
func TestAnEarlySaleCheckHasANetWorthOnEachDateOfBothScenarios(t *testing.T) {
	t.Parallel()

	today := date(t, "2025-01-10")
	ltn := bonds.Bond{Type: bonds.LTN, Maturity: date(t, "2027-01-01")}
	lot := bonds.Lot{ID: 7, Bond: ltn, PurchaseDate: date(t, "2024-01-02"), Rate: dec(t, "0.11"), UnitPrice: dec(t, "800.00"), Quantity: dec(t, "5.00")}

	checks, err := comparison.CheckEarlySales(
		comparison.Mortgage{Terms: interestFreeTerms(t)},
		comparison.Market{
			Quotes: []bonds.Quote{{Bond: ltn, Sell: bonds.Price{Rate: dec(t, "0.0845"), UnitPrice: dec(t, "900.00")}}},
			Taxes:  lotTaxes(t),
		},
		[]bonds.Lot{lot}, mortgage.ShortenTerm, today,
	)
	require.NoError(t, err)
	require.Len(t, checks, 1)

	c := checks[0]

	assert.Equal(t, []string{
		"-7595.11", "-6595.11", "-5595.11", "-4595.11", "-3595.11", "-2595.11", "-1595.11", "-595.11",
		"404.89", "1404.89", "2404.89", "3404.89", "4404.89", "4404.89",
	}, netWorths(c.Sell))
	assert.Equal(t, c.Sell.NetWorth.String(), netWorths(c.Sell)[13])

	hold := netWorths(c.Hold)
	require.Len(t, hold, 14)
	assert.Equal(t, "4824.50", hold[13])
	assert.Equal(t, c.Hold.NetWorth.String(), hold[13])
	assert.Equal(t, accruedNetWorths(t, c.Hold, lot), hold)
}

// An amount below a hundredth of the bond names the smallest one that buys it: a hundredth of the
// NTN-F's 970.884128 on 2025-01-10 is 9.70884128, which costs 9.71 rounded up to the centavo. 9.70
// buys none of it, and 9.71 buys exactly that hundredth.
func TestAnAmountTooSmallNamesTheMinimumAmountThatBuysAHundredth(t *testing.T) {
	t.Parallel()

	decided := date(t, "2025-01-10")
	decide := func(amount string) comparison.Verdict {
		verdicts, err := comparison.Decide(
			comparison.Mortgage{Terms: interestFreeTerms(t)},
			comparison.Market{
				Quotes: []bonds.Quote{{
					Bond: bonds.Bond{Type: bonds.NTNF, Maturity: date(t, "2027-01-01")},
					Buy:  &bonds.Price{Rate: dec(t, "0.12")},
				}},
				Taxes: lotTaxes(t),
			},
			comparison.Decision{Amount: dec(t, amount), Date: decided, Effect: mortgage.ShortenTerm},
			decided,
		)
		require.NoError(t, err)
		require.Len(t, verdicts, 1)

		return verdicts[0]
	}

	below := decide("9.70")
	assert.Equal(t, comparison.AmountTooSmall, below.Unavailable)
	assert.Equal(t, "970.884128", below.UnitPrice.String())
	assert.Equal(t, "9.71", below.MinimumAmount.String())

	exact := decide(below.MinimumAmount.String())
	assert.Empty(t, exact.Unavailable)
	assert.Equal(t, "0.01", exact.Quantity.String())
	assert.Equal(t, decimal.Decimal{}, exact.MinimumAmount)
}
