package bonds

import (
	"fmt"
	"time"

	"github.com/gringolito/debtwise/backend/calendar"
	"github.com/gringolito/debtwise/backend/decimal"
)

var (
	one          = decimal.FromInt(1)
	faceValue    = decimal.FromInt(1000)
	businessYear = decimal.FromInt(252)
	ntnfCoupon   = semesterCoupon()
)

// semesterCoupon is the coupon an NTN-F pays each semester: the semester's share of 10% a year on
// its face value, 48.80885 at the five places Tesouro carries it.
func semesterCoupon() decimal.Decimal {
	yearly := decimal.PercentToFraction(decimal.FromInt(10))
	semester := one.Add(yearly).Pow(one.Quo(decimal.FromInt(2))).Sub(one)

	return faceValue.Mul(semester).RoundCoupon()
}

// UnitPrice is the price (PU) of one bond bought or sold at rate, a yearly effective rate, for
// settlement on the date of settlement, by Tesouro's methodology: each flow is discounted over its
// business days/252 and the price truncated at six places. It panics for a type it doesn't know.
func (b Bond) UnitPrice(rate decimal.Decimal, settlement time.Time) decimal.Decimal {
	switch b.Type {
	case LTN:
		return discount(faceValue, rate, settlement, b.Maturity).TruncateUnitPrice()
	case NTNF:
		return b.ntnfUnitPrice(rate, settlement)
	default:
		panic(fmt.Sprintf("bonds: unit price of a bond of type %q", b.Type))
	}
}

func (b Bond) ntnfUnitPrice(rate decimal.Decimal, settlement time.Time) decimal.Decimal {
	price := discount(faceValue.Add(ntnfCoupon), rate, settlement, b.Maturity).RoundDiscountedFlow()
	for coupon := b.Maturity.AddDate(0, -6, 0); coupon.After(settlement); coupon = coupon.AddDate(0, -6, 0) {
		price = price.Add(discount(ntnfCoupon, rate, settlement, coupon).RoundDiscountedFlow())
	}

	return price.TruncateUnitPrice()
}

// discount returns the value on settlement of flow paid on date at rate.
func discount(flow, rate decimal.Decimal, settlement, date time.Time) decimal.Decimal {
	businessDays := decimal.FromInt(int64(calendar.BusinessDays(settlement, date)))
	factor := one.Add(rate).Pow(businessDays.Quo(businessYear).TruncateExponent())

	return flow.Quo(factor)
}
