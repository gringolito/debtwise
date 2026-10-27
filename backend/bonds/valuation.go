package bonds

import (
	"fmt"
	"slices"
	"time"

	"github.com/gringolito/debtwise/backend/decimal"
	"github.com/gringolito/debtwise/backend/indexes"
)

var daysInYear = decimal.FromInt(365)

// event is a payment or a sale of a lot on a date: its gross value, the gain the IOF and the income
// tax are charged on, and what the custody fee is charged on, accrued since feeFrom, the day of the
// lot's last deduction. projectedBy names the projection methods of the IPCA the gross value
// depends on.
type event struct {
	date        time.Time
	gross       decimal.Decimal
	gain        decimal.Decimal
	feeBase     decimal.Decimal
	feeFrom     time.Time
	projectedBy []indexes.ProjectionMethod
}

// priced is a gross value in reais and the projection methods of the IPCA it depends on.
type priced struct {
	gross       decimal.Decimal
	projectedBy []indexes.ProjectionMethod
}

// Value returns the lot's valuation on the date on (see ADR-0010). sell is the price Tesouro Direto
// buys the bond back at on that date, nil when there is none. ipca is read only for an NTN-B
// Principal or NTN-B, and a VNA neither published nor projected returns ErrMissingIPCANumber.
func (l Lot) Value(on time.Time, taxes Taxes, ipca IPCA, sell *Price) (Valuation, error) {
	switch l.Bond.Type {
	case LTN, NTNF, NTNBPrincipal, NTNB:
	default:
		return Valuation{}, fmt.Errorf("bonds: value lot %d: no valuation for a bond of type %q", l.ID, l.Bond.Type)
	}

	v := valuer{lot: l, taxes: taxes, coupons: l.couponDates(), vnas: newVNASource(ipca)}

	valuation, err := v.value(on, sell)
	if err != nil {
		return Valuation{}, fmt.Errorf("bonds: value lot %d on %s: %w", l.ID, on.Format(time.DateOnly), err)
	}

	return valuation, nil
}

// valuer values one lot against the tax tables.
type valuer struct {
	lot     Lot
	taxes   Taxes
	coupons []time.Time
	vnas    *vnaSource
}

func (v valuer) value(on time.Time, sell *Price) (Valuation, error) {
	valuation := Valuation{On: on}

	if on.Before(v.lot.Bond.Maturity) {
		accrual, err := v.accrual(on)
		if err != nil {
			return Valuation{}, err
		}

		amount := v.settle(v.sale(on, accrual))
		valuation.Accrual = &amount

		if sell != nil {
			gross := sell.UnitPrice.Mul(v.lot.Quantity).RoundCents()
			amount := v.settle(v.sale(on, priced{gross: gross}))
			valuation.Market = &amount
		}
	}

	maturity, err := v.maturity()
	if err != nil {
		return Valuation{}, err
	}

	valuation.Maturity = v.settle(v.sale(v.lot.Bond.Maturity, maturity))

	for i, date := range v.coupons {
		coupon, err := v.coupon(i, date)
		if err != nil {
			return Valuation{}, err
		}

		valuation.Coupons = append(valuation.Coupons, CouponPayment{Date: date, Amount: v.settle(coupon)})
	}

	return valuation, nil
}

// couponDates returns the dates the lot is paid a coupon on, in date order: every sixth month
// counted back from maturity, after the purchase and before maturity. The coupon on maturity is
// paid with the bond's face value. An LTN and an NTN-B Principal pay none.
func (l Lot) couponDates() []time.Time {
	if l.Bond.Type != NTNF && l.Bond.Type != NTNB {
		return nil
	}

	var dates []time.Time

	for date := l.Bond.Maturity.AddDate(0, -6, 0); date.After(l.PurchaseDate); date = date.AddDate(0, -6, 0) {
		dates = append(dates, date)
	}

	slices.Reverse(dates)

	return dates
}

// accrual is the lot's value at its contracted rate for settlement on date.
func (v valuer) accrual(date time.Time) (priced, error) {
	bond, quantity := v.lot.Bond, v.lot.Quantity

	if bond.Type != NTNBPrincipal && bond.Type != NTNB {
		return priced{gross: bond.UnitPrice(v.lot.Rate, date).Mul(quantity).RoundCents()}, nil
	}

	vna, err := v.vnas.on(date)
	if err != nil {
		return priced{}, err
	}

	unitPrice := bond.IPCAUnitPrice(v.lot.Rate, date, vna.value)

	return priced{gross: unitPrice.Mul(quantity).RoundCents(), projectedBy: vna.projectedBy}, nil
}

// maturity is what the lot pays on its bond's maturity date, the last coupon included.
func (v valuer) maturity() (priced, error) {
	bond, quantity := v.lot.Bond, v.lot.Quantity

	switch bond.Type {
	case LTN:
		return priced{gross: faceValue.Mul(quantity).RoundCents()}, nil
	case NTNF:
		return priced{gross: faceValue.Add(ntnfCoupon).Mul(quantity).RoundCents()}, nil
	default:
	}

	vna, err := v.vnas.on(bond.Maturity)
	if err != nil {
		return priced{}, err
	}

	// An NTN-B pays its VNA and the last coupon's share of it, so its value is the VNA times
	// 100 + 2.956301 over 100, rounded once at the end like the other bonds' values.
	factor := one
	if bond.Type == NTNB {
		factor = hundred.Add(ntnbCoupon).Quo(hundred)
	}

	return priced{gross: vna.value.Mul(factor).Mul(quantity).RoundCents(), projectedBy: vna.projectedBy}, nil
}

// coupon is the payment of the lot's ith coupon, on date. Its custody fee accrues on the lot's
// accrual value that day, which no longer holds the coupon, plus the coupon.
func (v valuer) coupon(i int, date time.Time) (event, error) {
	coupon, err := v.couponGross(date)
	if err != nil {
		return event{}, err
	}

	accrual, err := v.accrual(date)
	if err != nil {
		return event{}, err
	}

	feeFrom := v.lot.PurchaseDate
	if i > 0 {
		feeFrom = v.coupons[i-1]
	}

	return event{
		date:        date,
		gross:       coupon.gross,
		gain:        coupon.gross,
		feeBase:     accrual.gross.Add(coupon.gross),
		feeFrom:     feeFrom,
		projectedBy: union(coupon.projectedBy, accrual.projectedBy),
	}, nil
}

// couponGross is what the lot is paid by its bond's coupon on date: an NTN-F's fixed coupon, or an
// NTN-B's share of its VNA on that date.
func (v valuer) couponGross(date time.Time) (priced, error) {
	quantity := v.lot.Quantity

	if v.lot.Bond.Type == NTNF {
		return priced{gross: ntnfCoupon.Mul(quantity).RoundCents()}, nil
	}

	vna, err := v.vnas.on(date)
	if err != nil {
		return priced{}, err
	}

	unitPrice := vna.value.Mul(ntnbCoupon).Quo(hundred).TruncateUnitPrice()

	return priced{gross: unitPrice.Mul(quantity).RoundCents(), projectedBy: vna.projectedBy}, nil
}

// sale is the event of the lot being sold on date, or paying at maturity, for the gross value.
func (v valuer) sale(date time.Time, p priced) event {
	return event{
		date:        date,
		gross:       p.gross,
		gain:        p.gross.Sub(v.lot.cost()),
		feeBase:     p.gross,
		feeFrom:     v.lastDeduction(date),
		projectedBy: p.projectedBy,
	}
}

// lastDeduction is the day the custody fee was last deducted on or before date: the latest coupon
// date, or the purchase when no coupon has been paid.
func (v valuer) lastDeduction(date time.Time) time.Time {
	last := v.lot.PurchaseDate

	for _, coupon := range v.coupons {
		if coupon.After(date) {
			break
		}

		last = coupon
	}

	return last
}

// cost is what the lot cost, in reais.
func (l Lot) cost() decimal.Decimal {
	return l.UnitPrice.Mul(l.Quantity).RoundCents()
}

// settle takes the IOF, the income tax and the custody fee off the gross value of the event.
func (v valuer) settle(e event) Amount {
	daysHeld := int(calendarDays(v.lot.PurchaseDate, e.date))

	iof := v.taxes.iofRate(e.date, daysHeld).Mul(positive(e.gain)).RoundCents()
	fee := v.taxes.custodyFee(e.feeBase, e.feeFrom, e.date)
	tax := v.taxes.incomeTaxRate(e.date, daysHeld).Mul(positive(e.gain.Sub(iof).Sub(fee))).RoundCents()

	return Amount{
		Gross:       e.gross,
		IOF:         iof,
		IncomeTax:   tax,
		CustodyFee:  fee,
		Net:         e.gross.Sub(iof).Sub(tax).Sub(fee),
		ProjectedBy: e.projectedBy,
	}
}

// positive returns x, or zero when x is negative.
func positive(x decimal.Decimal) decimal.Decimal {
	if x.Cmp(decimal.Decimal{}) < 0 {
		return decimal.Decimal{}
	}

	return x
}
