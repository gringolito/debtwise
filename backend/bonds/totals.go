package bonds

import (
	"errors"
	"fmt"
	"time"

	"github.com/gringolito/debtwise/backend/decimal"
)

// Pricing is what valuing lots reads besides the lots: the tax tables, the sell side of each
// bond's quote, and the IPCA, which only an NTN-B Principal or NTN-B lot reads.
type Pricing struct {
	Taxes Taxes
	Sells map[Bond]Price
	IPCA  IPCA
}

// ValuedLot is a lot with its values on a date. Valuation is nil when the IPCA the lot follows is
// not available yet.
type ValuedLot struct {
	Lot       Lot
	Valuation *Valuation
}

// ValueAll values each of lots on the date on, in their order.
func (p Pricing) ValueAll(lots []Lot, on time.Time) ([]ValuedLot, error) {
	valued := make([]ValuedLot, 0, len(lots))

	for i, l := range lots {
		var sell *Price
		if price, ok := p.Sells[l.Bond]; ok {
			sell = &price
		}

		v, err := l.Value(on, p.Taxes, p.IPCA, sell)

		switch {
		case errors.Is(err, ErrMissingIPCANumber):
			valued = append(valued, ValuedLot{Lot: l})
		case err != nil:
			return nil, fmt.Errorf("bonds: value lot %d of %d: %w", i+1, len(lots), err)
		default:
			valued = append(valued, ValuedLot{Lot: l, Valuation: &v})
		}
	}

	return valued, nil
}

// MarketTotal adds up the Market Value of the lots that have one. It reports false when none has.
func MarketTotal(valued []ValuedLot) (Amount, bool) {
	var (
		total     Amount
		hasMarket bool
	)

	for _, l := range valued {
		if l.Valuation == nil || l.Valuation.Market == nil {
			continue
		}

		m := l.Valuation.Market
		total.Gross, total.Net = total.Gross.Add(m.Gross), total.Net.Add(m.Net)
		total.IOF, total.IncomeTax = total.IOF.Add(m.IOF), total.IncomeTax.Add(m.IncomeTax)
		total.CustodyFee = total.CustodyFee.Add(m.CustodyFee)
		hasMarket = true
	}

	return total, hasMarket
}

// Totals are what a set of lots adds up to: the Amount Invested in all of them, and the net
// Maturity Value of the WithValues lots that have values. Projected reports whether that value
// depends on projected index values, and WithoutValues counts the lots left out of it.
type Totals struct {
	Invested      decimal.Decimal
	MaturityNet   decimal.Decimal
	Projected     bool
	WithValues    int
	WithoutValues int
}

// TotalsOf adds up the valued lots.
func TotalsOf(valued []ValuedLot) Totals {
	var t Totals

	for _, l := range valued {
		t.Invested = t.Invested.Add(l.Lot.Cost())

		if l.Valuation == nil {
			t.WithoutValues++

			continue
		}

		t.WithValues++
		t.MaturityNet = t.MaturityNet.Add(l.Valuation.Maturity.Net)
		t.Projected = t.Projected || len(l.Valuation.Maturity.ProjectedBy) > 0
	}

	return t
}
