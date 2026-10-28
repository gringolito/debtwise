package decimal

import "github.com/cockroachdb/apd/v3"

// Tesouro's rounding and truncation rules for pricing LTN, NTN-F and NTN-B, from its "Metodologia
// de Cálculo dos Títulos Públicos Federais Ofertados nos Leilões Primários" (2024-04-29).

// TruncateExponent truncates the exponent of a compounding factor at 14 places: business days/252,
// or for a projected VNA the calendar days since the last 15th over those between 15ths.
func (x Decimal) TruncateExponent() Decimal {
	return x.quantize(14, apd.RoundDown)
}

// TruncateUnitPrice truncates a bond's unit price (PU) at 6 places.
func (x Decimal) TruncateUnitPrice() Decimal {
	return x.quantize(6, apd.RoundDown)
}

// TruncateQuantity truncates a quantity of bonds at 2 places, the hundredth of a bond Tesouro
// Direto sells.
func (x Decimal) TruncateQuantity() Decimal {
	return x.quantize(2, apd.RoundDown)
}

// RoundCoupon rounds an NTN-F coupon at 5 places, half up.
func (x Decimal) RoundCoupon() Decimal {
	return x.quantize(5, apd.RoundHalfUp)
}

// RoundDiscountedFlow rounds the present value of one of a bond's flows at 9 places, half up.
func (x Decimal) RoundDiscountedFlow() Decimal {
	return x.quantize(9, apd.RoundHalfUp)
}

// TruncateFactor truncates the pro rata factor (1 + projected IPCA)^exponent of a projected VNA at
// 14 places.
func (x Decimal) TruncateFactor() Decimal {
	return x.quantize(14, apd.RoundDown)
}

// TruncateVNA truncates a VNA, or a projected VNA, at 6 places.
func (x Decimal) TruncateVNA() Decimal {
	return x.quantize(6, apd.RoundDown)
}

// TruncateQuotation truncates an NTN-B quotation, a percentage of its VNA, at 4 places.
func (x Decimal) TruncateQuotation() Decimal {
	return x.quantize(4, apd.RoundDown)
}

// RoundQuotationCoupon rounds an NTN-B coupon, a percentage of its VNA, at 6 places, half up.
func (x Decimal) RoundQuotationCoupon() Decimal {
	return x.quantize(6, apd.RoundHalfUp)
}

// RoundQuotationFlow rounds the present value of one of an NTN-B's flows, a percentage of its VNA,
// at 10 places, half up.
func (x Decimal) RoundQuotationFlow() Decimal {
	return x.quantize(10, apd.RoundHalfUp)
}

// TruncateIndexRatio truncates the ratio of two IPCA index numbers, the factor that updates a VNA,
// at 16 places.
func (x Decimal) TruncateIndexRatio() Decimal {
	return x.quantize(16, apd.RoundDown)
}
