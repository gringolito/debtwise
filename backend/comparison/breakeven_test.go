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

// breakEvenCase decides on amount on date between prepaying m and buying bond at rate, with today
// the day projected values start after, the decision's date when empty.
type breakEvenCase struct {
	name     string
	m        comparison.Mortgage
	ipca     bonds.IPCA
	bond     bonds.Bond
	rate     string
	amount   string
	decision string
	today    string
}

// verdict is the verdict at rate, which must have scenarios.
func (c breakEvenCase) verdict(t *testing.T, rate decimal.Decimal) comparison.Verdict {
	t.Helper()

	v := c.decide(t, rate)
	require.Empty(t, v.Unavailable)

	return v
}

func (c breakEvenCase) decide(t *testing.T, rate decimal.Decimal) comparison.Verdict {
	t.Helper()

	decided, today := date(t, c.decision), date(t, c.decision)
	if c.today != "" {
		today = date(t, c.today)
	}

	market := comparison.Market{
		Quotes: []bonds.Quote{{Bond: c.bond, Buy: &bonds.Price{Rate: rate}}},
		Taxes:  lotTaxes(t),
		IPCA:   c.ipca,
	}

	verdicts, err := comparison.Decide(c.m, market,
		comparison.Decision{Amount: dec(t, c.amount), Date: decided, Effect: mortgage.ShortenTerm}, today)
	require.NoError(t, err)
	require.Len(t, verdicts, 1)

	return verdicts[0]
}

func ipcaBreakEvenCase(t *testing.T, name string, bondType bonds.Type) breakEvenCase {
	t.Helper()

	m, outlook := ipcaMortgage(t, "0.20")

	return breakEvenCase{
		name: name,
		m:    m,
		ipca: bonds.IPCA{
			Numbers: bonds.IPCANumbers{date(t, "2000-06-01"): dec(t, "1614.62"), date(t, "2025-09-01"): dec(t, "7300.00")},
			Outlook: outlook,
		},
		bond:     bonds.Bond{Type: bondType, Maturity: date(t, "2026-08-15")},
		rate:     "0.075",
		amount:   "10000.00",
		decision: "2025-11-03",
	}
}

// Quoted back as the bond's buy rate, the Break-even Rate buys the bond at the price that rate
// gives on the decision's date, through the VNA projected to that date for an IPCA+ bond, and
// leaves investing and prepaying within a centavo of each other on the horizon. A decision dated a
// month after today buys an IPCA+ bond at the VNA grown past the 15th in between.
func TestABreakEvenRateFedBackGivesAnAdvantageOfZero(t *testing.T) {
	t.Parallel()

	later := ipcaBreakEvenCase(t, "NTN-B Principal bought a month after today", bonds.NTNBPrincipal)
	later.decision, later.today = "2025-12-03", "2025-11-03"

	tests := []breakEvenCase{
		{
			name: "LTN against a TR mortgage", m: trMortgage(t),
			bond: bonds.Bond{Type: bonds.LTN, Maturity: date(t, "2031-01-01")},
			rate: "0.1504", amount: "30034.32", decision: "2025-01-08",
		},
		{
			name: "NTN-F against a TR mortgage", m: trMortgage(t),
			bond: bonds.Bond{Type: bonds.NTNF, Maturity: date(t, "2031-01-01")},
			rate: "0.1388", amount: "5000.00", decision: "2025-01-08",
		},
		ipcaBreakEvenCase(t, "NTN-B Principal against an IPCA mortgage", bonds.NTNBPrincipal),
		ipcaBreakEvenCase(t, "NTN-B against an IPCA mortgage", bonds.NTNB),
		later,
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			t.Parallel()

			v := tt.verdict(t, dec(t, tt.rate))
			require.Empty(t, v.NoBreakEven)

			fedBack := tt.verdict(t, v.BreakEvenRate)
			assertNear(t, "0", fedBack.Advantage, "0.01")
			assert.Equal(t, v.BreakEvenRate.String(), fedBack.BreakEvenRate.String())
		})
	}
}

// Tesouro Direto sells hundredths of a bond, and what the amount can't buy is held as cash. Between
// two rates one hundredth apart, 10,000.00 buys 21.76 or 21.77 LTN maturing on 2031-01-01, and the
// advantage jumps from about -3.58 to 0.92 without passing through zero. Against a mortgage at no
// interest, 7.90 buys a hundredth of an LTN maturing on 2027-01-01 only above about 12.5%, far
// above the rate whose gain would just pay its custody fee, so the advantage jumps from nothing
// bought to that hundredth's gain. Either way the Break-even Rate is the lowest at which investing
// comes out ahead: a ten-billionth below it, the advantage is below zero by more than a centavo,
// or the amount buys no hundredth.
func TestWhereTheAdvantageJumpsOverZeroTheBreakEvenRateIsTheLowestThatMakesItPositive(t *testing.T) {
	t.Parallel()

	tests := []breakEvenCase{
		{
			name: "one more hundredth", m: trMortgage(t), bond: bonds.Bond{Type: bonds.LTN, Maturity: date(t, "2031-01-01")},
			rate: "0.1504", amount: "10000.00", decision: "2025-01-08",
		},
		{
			name: "the first hundredth", m: comparison.Mortgage{Terms: interestFreeTerms(t)},
			bond: bonds.Bond{Type: bonds.LTN, Maturity: date(t, "2027-01-01")}, rate: "0.1276", amount: "7.90", decision: "2025-01-10",
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			t.Parallel()

			v := tt.verdict(t, dec(t, tt.rate))
			require.Empty(t, v.NoBreakEven)

			fedBack := tt.verdict(t, v.BreakEvenRate)
			assert.Positive(t, fedBack.Advantage.Cmp(dec(t, "0.01")), "advantage %s", fedBack.Advantage)

			below := tt.decide(t, v.BreakEvenRate.Sub(dec(t, "0.0000000001")))
			if below.Unavailable == "" {
				assert.Negative(t, below.Advantage.Cmp(dec(t, "-0.01")), "advantage %s", below.Advantage)
			} else {
				assert.Equal(t, comparison.AmountTooSmall, below.Unavailable)
			}
		})
	}
}

// A mortgage at 150% a year costs more than the bond pays at 100%; one that shrinks by half a year
// costs less than it pays at 0%.
func TestAVerdictSaysWhenNoRateGivesAnAdvantageOfZero(t *testing.T) {
	t.Parallel()

	withContractRate := func(rate string) comparison.Mortgage {
		m := trMortgage(t)
		m.Terms.ContractRates[0].Rate = dec(t, rate)

		return m
	}
	ltn := bonds.Bond{Type: bonds.LTN, Maturity: date(t, "2031-01-01")}

	tests := []struct {
		breakEvenCase

		want comparison.NoBreakEven
	}{
		{
			breakEvenCase{name: "prepaying wins at every rate", m: withContractRate("1.50"), bond: ltn, rate: "0.1504", amount: "10000.00", decision: "2025-01-08"},
			comparison.AboveRange,
		},
		{
			breakEvenCase{name: "investing wins at every rate", m: withContractRate("-0.50"), bond: ltn, rate: "0.1504", amount: "10000.00", decision: "2025-01-08"},
			comparison.BelowRange,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			t.Parallel()

			v := tt.verdict(t, dec(t, tt.rate))
			assert.Equal(t, tt.want, v.NoBreakEven)
			assert.Equal(t, "0", v.BreakEvenRate.String())
		})
	}
}
