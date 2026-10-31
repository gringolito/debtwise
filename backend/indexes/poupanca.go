package indexes

import "github.com/gringolito/debtwise/backend/decimal"

// DerivePoupancaYield returns the poupança yield of a monthly period from the period's TR and the
// Selic target in force on its first day, all in percent, by the legal rule (Lei 8.177/1991, art.
// 12): TR compounded with the additional part PoupancaAdditional returns.
func DerivePoupancaYield(tr, selicTarget decimal.Decimal) decimal.Decimal {
	hundred := decimal.FromInt(100)
	one := decimal.FromInt(1)

	factor := one.Add(tr.Quo(hundred)).Mul(one.Add(PoupancaAdditional(selicTarget).Quo(hundred)))

	return factor.Sub(one).Mul(hundred).RoundPoupancaPercent()
}

// PoupancaAdditional returns the poupança yield's additional part over TR for a monthly period, in
// percent a month, from the Selic target in force on its first day, by the legal rule: 0.5% while
// the Selic target is above 8.5% a year, or 70% of the Selic target turned into a monthly rate
// while it is at or below 8.5%.
func PoupancaAdditional(selicTarget decimal.Decimal) decimal.Decimal {
	if selicTarget.Cmp(decimal.FromInt(85).Quo(decimal.FromInt(10))) > 0 {
		return decimal.FromInt(5).Quo(decimal.FromInt(10))
	}

	seventyPercent := selicTarget.Mul(decimal.FromInt(7)).Quo(decimal.FromInt(1000))

	return decimal.AnnualToMonthly(seventyPercent).Mul(decimal.FromInt(100)).RoundPoupancaPercent()
}
