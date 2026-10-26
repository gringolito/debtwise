package decimal

import "github.com/cockroachdb/apd/v3"

// RoundCents rounds money to centavos, half up, as the mortgage's bank rounds each charge on an
// installment.
func (x Decimal) RoundCents() Decimal {
	return x.quantize(2, apd.RoundHalfUp)
}
