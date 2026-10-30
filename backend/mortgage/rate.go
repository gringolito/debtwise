package mortgage

import (
	"time"

	"github.com/gringolito/debtwise/backend/decimal"
	"github.com/gringolito/debtwise/backend/indexes"
)

// charge is an annual contract rate as an effective annual rate and as the monthly rate charged.
type charge struct {
	effective, monthly decimal.Decimal
}

// chargedRate is a contract rate from a date, its fixed part converted once.
type chargedRate struct {
	from  time.Time
	fixed charge
	// plusAdditional is nil for a rate without a variable part. Otherwise it keeps the rate with
	// each poupança yield's additional part converted so far, by that part, as converting is slow
	// and the part takes few values.
	plusAdditional map[string]charge
}

func (c chargedRate) effectiveFrom() time.Time { return c.from }

func chargedRates(rates []ContractRate) []chargedRate {
	charged := make([]chargedRate, 0, len(rates))

	for _, r := range rates {
		c := chargedRate{from: r.EffectiveFrom, fixed: charge{effective: r.Effective(), monthly: r.monthly()}}
		if r.PoupancaAdditional {
			c.plusAdditional = make(map[string]charge)
		}

		charged = append(charged, c)
	}

	return charged
}

// installmentRate is the contract rate an installment is charged at, and the index values its
// variable part follows.
type installmentRate struct {
	charge

	values []IndexValue
}

// rateOf returns the rate installment number is charged at: the contract rate in effect on its due
// date, plus, when it adds the poupança yield's additional part, that of the month that ends on the
// due date, set by the Selic target in force on the month's first day. An installment due by today
// reads a published Selic target only. Without one, the Selic target is marked missing and the
// rate is its fixed part alone.
func (r *replayer) rateOf(number int) installmentRate {
	due := addMonths(r.terms.FirstInstallmentDate, number-1)
	rate := inEffect(r.rates, due)

	if rate.plusAdditional == nil {
		return installmentRate{charge: rate.fixed}
	}

	start := addMonths(r.terms.FirstInstallmentDate, number-2)
	value := IndexValue{Index: indexes.SelicTarget, PeriodStart: start, PeriodEnd: start}

	estimate, found := r.outlook.SelicTarget(start)
	if !found || (!due.After(r.today) && estimate.Projected()) {
		value.Missing = true

		return installmentRate{charge: rate.fixed, values: []IndexValue{value}}
	}

	value.Value, value.Methods = estimate.Value, estimate.Methods
	additional := indexes.PoupancaAdditional(estimate.Value)

	c, ok := rate.plusAdditional[additional.String()]
	if !ok {
		c.effective = rate.fixed.effective.Add(decimal.MonthlyToAnnual(decimal.PercentToFraction(additional)))
		c.monthly = decimal.AnnualToMonthly(c.effective)
		rate.plusAdditional[additional.String()] = c
	}

	return installmentRate{charge: c, values: []IndexValue{value}}
}
