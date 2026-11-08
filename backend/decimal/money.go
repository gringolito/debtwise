package decimal

import "github.com/cockroachdb/apd/v3"

// RoundCents rounds money to centavos, half up, as the mortgage's bank rounds each charge on an
// installment.
func (x Decimal) RoundCents() Decimal {
	return x.quantize(2, apd.RoundHalfUp)
}

// TruncateCents truncates money to centavos, as the mortgage's bank rounds down a pro rata die
// update of the outstanding balance.
func (x Decimal) TruncateCents() Decimal {
	return x.quantize(2, apd.RoundDown)
}

// CeilCents rounds money up to centavos, as the smallest amount that covers a price.
func (x Decimal) CeilCents() Decimal {
	return x.quantize(2, apd.RoundCeiling)
}
