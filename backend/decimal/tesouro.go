package decimal

import "github.com/cockroachdb/apd/v3"

// Tesouro's rounding and truncation rules for pricing LTN and NTN-F, from its "Metodologia de
// Cálculo dos Títulos Públicos Federais Ofertados nos Leilões Primários".

// TruncateExponent truncates the business days/252 exponent of a compounding factor at 14 places.
func (x Decimal) TruncateExponent() Decimal {
	return x.quantize(14, apd.RoundDown)
}

// TruncateUnitPrice truncates a bond's unit price (PU) at 6 places.
func (x Decimal) TruncateUnitPrice() Decimal {
	return x.quantize(6, apd.RoundDown)
}

// RoundCoupon rounds an NTN-F coupon at 5 places, half up.
func (x Decimal) RoundCoupon() Decimal {
	return x.quantize(5, apd.RoundHalfUp)
}

// RoundDiscountedFlow rounds the present value of one of a bond's flows at 9 places, half up.
func (x Decimal) RoundDiscountedFlow() Decimal {
	return x.quantize(9, apd.RoundHalfUp)
}

func (x Decimal) quantize(places int32, rounding apd.Rounder) Decimal {
	c := ctx
	c.Rounding = rounding

	var z Decimal
	must(c.Quantize(&z.d, &x.d, -places))

	return z
}
