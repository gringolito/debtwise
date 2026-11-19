package comparison

import (
	"errors"
	"fmt"
	"time"

	"github.com/gringolito/debtwise/backend/bonds"
	"github.com/gringolito/debtwise/backend/decimal"
	"github.com/gringolito/debtwise/backend/indexes"
	"github.com/gringolito/debtwise/backend/mortgage"
)

// BeforeContract is a lot comparison on a lot bought before the mortgage's contract date, when
// there was nothing to prepay.
const BeforeContract Unavailable = "before_contract"

// LotComparison compares a recorded lot with prepaying its Amount Invested on its purchase date
// instead, on the horizon, its bond's maturity (ADR-0011). Unless it is Unavailable, it has an
// Advantage.
type LotComparison struct {
	Lot         bonds.Lot
	Unavailable Unavailable
	// Maturity is the lot's Maturity Value. It is set unless the lot's VNA is MissingIPCA.
	Maturity bonds.Amount
	// Advantage is the investing scenario's net worth on the horizon less the prepaying one's.
	Advantage decimal.Decimal
	// ProjectedBy names the projection method of each index a projected value of the comparison
	// comes from, in the order of indexes.All.
	ProjectedBy []indexes.ProjectionMethod
}

// Gain is what the lot pays net at maturity beyond its Amount Invested.
func (c LotComparison) Gain() decimal.Decimal {
	return c.Maturity.Net.Sub(c.Lot.Cost())
}

// CompareLot compares l, bought at its own rate, unit price and quantity on its purchase date, with
// prepaying what it cost on that date with effect. today is the day installments start being
// corrected by projected values after.
func CompareLot(m Mortgage, market Market, l bonds.Lot, effect mortgage.PrepaymentEffect, today time.Time) (LotComparison, error) {
	c := comparer{
		mortgage: m,
		market:   market,
		decision: Decision{Amount: l.Cost(), Date: l.PurchaseDate, Effect: effect},
		today:    today,
		bond:     l.Bond,
	}

	out := LotComparison{Lot: l}

	valuation, err := l.Value(l.PurchaseDate, market.Taxes, market.IPCA, nil)

	switch {
	case errors.Is(err, bonds.ErrMissingIPCANumber):
		out.Unavailable = MissingIPCA

		return out, nil
	case err != nil:
		return LotComparison{}, fmt.Errorf("comparison: lot %d: %w", l.ID, err)
	}

	out.Maturity = valuation.Maturity

	if l.PurchaseDate.Before(m.Terms.ContractDate) {
		out.Unavailable = BeforeContract

		return out, nil
	}

	statusQuo := c.plan(zero, nil, nil)
	invest := c.scenario(statusQuo, zero, l.Cost(), zero, nil, valuation.Coupons, &valuation.Maturity)
	prepay := c.scenario(statusQuo, l.Cost(), zero, zero, nil, nil, nil)
	out.Advantage = invest.NetWorth.Sub(prepay.NetWorth)

	methods := [][]indexes.ProjectionMethod{valuation.Maturity.ProjectedBy, readBy(statusQuo), invest.projectedBy, prepay.projectedBy}
	for _, coupon := range valuation.Coupons {
		methods = append(methods, coupon.ProjectedBy)
	}

	out.ProjectedBy = projectedBy(methods...)

	return out, nil
}
