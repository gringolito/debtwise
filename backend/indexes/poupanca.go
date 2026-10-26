package indexes

import "github.com/gringolito/debtwise/backend/decimal"

// DerivePoupancaYield returns the poupança yield of a monthly period from the period's TR and the
// Selic target in force on its first day, all in percent, by the legal rule (Lei 8.177/1991, art.
// 12): TR compounded with 0.5% a month while the Selic target is above 8.5% a year, or with 70% of
// the Selic target turned into a monthly rate while it is at or below 8.5%.
func DerivePoupancaYield(tr, selicTarget decimal.Decimal) decimal.Decimal {
	hundred := decimal.FromInt(100)
	one := decimal.FromInt(1)

	additional := decimal.FromInt(5).Quo(decimal.FromInt(10))
	if selicTarget.Cmp(decimal.FromInt(85).Quo(decimal.FromInt(10))) <= 0 {
		seventyPercent := selicTarget.Mul(decimal.FromInt(7)).Quo(decimal.FromInt(1000))
		additional = decimal.AnnualToMonthly(seventyPercent).Mul(hundred).RoundPoupancaPercent()
	}

	factor := one.Add(tr.Quo(hundred)).Mul(one.Add(additional.Quo(hundred)))

	return factor.Sub(one).Mul(hundred).RoundPoupancaPercent()
}
