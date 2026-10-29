package bonds

import (
	"fmt"
	"time"

	"github.com/gringolito/debtwise/backend/calendar"
	"github.com/gringolito/debtwise/backend/decimal"
	"github.com/gringolito/debtwise/backend/indexes"
)

var (
	one          = decimal.FromInt(1)
	hundred      = decimal.FromInt(100)
	faceValue    = decimal.FromInt(1000)
	businessYear = decimal.FromInt(252)
	ntnfCoupon   = semesterCoupon()
	ntnbCoupon   = quotationCoupon()
)

// quotationCoupon is the coupon an NTN-B pays each semester as a percentage of its VNA: the
// semester's share of 6% a year, 2.956301 at the six places Tesouro carries it.
func quotationCoupon() decimal.Decimal {
	yearly := decimal.PercentToFraction(decimal.FromInt(6))
	semester := one.Add(yearly).Pow(one.Quo(decimal.FromInt(2))).Sub(one)

	return hundred.Mul(semester).RoundQuotationCoupon()
}

// semesterCoupon is the coupon an NTN-F pays each semester: the semester's share of 10% a year on
// its face value, 48.80885 at the five places Tesouro carries it.
func semesterCoupon() decimal.Decimal {
	yearly := decimal.PercentToFraction(decimal.FromInt(10))
	semester := one.Add(yearly).Pow(one.Quo(decimal.FromInt(2))).Sub(one)

	return faceValue.Mul(semester).RoundCoupon()
}

// UnitPrice is the price (PU) of one bond bought or sold at rate, a yearly effective rate, for
// settlement on the date of settlement, by Tesouro's methodology: each flow is discounted over its
// business days/252 and the price truncated at six places. It prices an LTN or an NTN-F; an NTN-B
// Principal or NTN-B needs a VNA (IPCAUnitPrice), and for them or an unknown type it panics.
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

// Quotation is the price of an NTN-B Principal or NTN-B bought or sold at rate, a yearly effective
// rate, for settlement on the date of settlement, as a percentage of its projected VNA, truncated
// at 4 places: 100 discounted over business days/252 for a Principal, and for an NTN-B the sum of
// its coupons and 100, each flow's present value rounded at 10 places. It panics for a type that
// isn't an NTN-B.
func (b Bond) Quotation(rate decimal.Decimal, settlement time.Time) decimal.Decimal {
	switch b.Type {
	case NTNBPrincipal:
		return discount(hundred, rate, settlement, b.Maturity).TruncateQuotation()
	case NTNB:
		return b.ntnbQuotation(rate, settlement)
	default:
		panic(fmt.Sprintf("bonds: quotation of a bond of type %q", b.Type))
	}
}

// IPCAUnitPrice is the price (PU) of one NTN-B Principal or NTN-B bought or sold at rate for
// settlement on the date of settlement, when the VNA projected to that date is projectedVNA (see
// ProjectedVNA): the VNA times the quotation, truncated at 6 places. It panics for a type that
// isn't an NTN-B.
func (b Bond) IPCAUnitPrice(rate decimal.Decimal, settlement time.Time, projectedVNA decimal.Decimal) decimal.Decimal {
	return projectedVNA.Mul(b.Quotation(rate, settlement)).Quo(hundred).TruncateUnitPrice()
}

// PriceOn is the price (PU) of one bond bought or sold at rate for settlement on the date of
// settlement: UnitPrice for an LTN or NTN-F, and for an NTN-B Principal or NTN-B its IPCAUnitPrice
// with the VNA projected to that date from ipca, which also returns the projection methods of the
// IPCA it depends on. A VNA neither published nor projected returns ErrMissingIPCANumber.
func (b Bond) PriceOn(rate decimal.Decimal, settlement time.Time, ipca IPCA) (decimal.Decimal, []indexes.ProjectionMethod, error) {
	if b.Type != NTNBPrincipal && b.Type != NTNB {
		return b.UnitPrice(rate, settlement), nil, nil
	}

	vna, err := newVNASource(ipca).on(settlement)
	if err != nil {
		return decimal.Decimal{}, nil, err
	}

	return b.IPCAUnitPrice(rate, settlement, vna.value), vna.projectedBy, nil
}

func (b Bond) ntnbQuotation(rate decimal.Decimal, settlement time.Time) decimal.Decimal {
	quotation := discount(hundred.Add(ntnbCoupon), rate, settlement, b.Maturity).RoundQuotationFlow()
	for coupon := b.Maturity.AddDate(0, -6, 0); coupon.After(settlement); coupon = coupon.AddDate(0, -6, 0) {
		quotation = quotation.Add(discount(ntnbCoupon, rate, settlement, coupon).RoundQuotationFlow())
	}

	return quotation.TruncateQuotation()
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
