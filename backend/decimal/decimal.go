// Package decimal is DebtWise's exact arithmetic for money, rates, prices and index values
// (ADR-0003). It wraps cockroachdb/apd behind an immutable value type and one precision context:
// 34 significant digits, the precision of IEEE 754 decimal128, rounded half to even. Tesouro's
// rounding and truncation rules are named operations on that type.
package decimal

import (
	"fmt"
	"regexp"

	"github.com/cockroachdb/apd/v3"
)

// Decimal is an exact decimal number. Its zero value is 0, and operations return new values
// without changing their operands.
type Decimal struct {
	d apd.Decimal
}

// ctx is the one precision context every operation rounds to. It is never modified.
var ctx = apd.Context{
	Precision:   34,
	MaxExponent: apd.MaxExponent,
	MinExponent: apd.MinExponent,
	Traps:       apd.DefaultTraps,
	Rounding:    apd.RoundHalfEven,
}

var decimalString = regexp.MustCompile(`^-?(0|[1-9][0-9]*)(\.[0-9]+)?$`)

// Parse reads a decimal string such as "48.81" or "-0.0125" exactly, keeping every digit and
// trailing zero, so String returns the same text.
func Parse(s string) (Decimal, error) {
	var x Decimal
	if _, _, err := x.d.SetString(s); err != nil || !decimalString.MatchString(s) {
		return Decimal{}, fmt.Errorf("decimal: parse %q: not a decimal string", s)
	}

	return x, nil
}

// String formats x as a decimal string without an exponent, keeping its places.
func (x Decimal) String() string {
	return x.d.Text('f')
}

// FromInt returns n as a Decimal, such as a count of business days.
func FromInt(n int64) Decimal {
	var x Decimal
	x.d.SetInt64(n)

	return x
}

// Cmp returns -1, 0 or +1 as x is less than, equal to or greater than y, whatever their places.
func (x Decimal) Cmp(y Decimal) int {
	return x.d.Cmp(&y.d)
}

// Add returns x + y.
func (x Decimal) Add(y Decimal) Decimal {
	var z Decimal
	must(ctx.Add(&z.d, &x.d, &y.d))

	return z
}

// Sub returns x - y.
func (x Decimal) Sub(y Decimal) Decimal {
	var z Decimal
	must(ctx.Sub(&z.d, &x.d, &y.d))

	return z
}

// Mul returns x × y.
func (x Decimal) Mul(y Decimal) Decimal {
	var z Decimal
	must(ctx.Mul(&z.d, &x.d, &y.d))

	return z
}

// Quo returns x / y. Like integer division, it panics when y is zero.
func (x Decimal) Quo(y Decimal) Decimal {
	var z Decimal
	must(ctx.Quo(&z.d, &x.d, &y.d))

	return z
}

// Pow returns x raised to the power y, which may be fractional, as in (1 + rate)^(du/252). It
// panics when the power is undefined: a fractional power of a negative number, or a negative
// power of zero.
func (x Decimal) Pow(y Decimal) Decimal {
	var z Decimal
	must(ctx.Pow(&z.d, &x.d, &y.d))

	if z.d.Form != apd.Finite {
		panic(fmt.Errorf("decimal: %s to the power %s is undefined", x, y))
	}

	return z
}

// quantize rounds x to places decimal places in the given direction.
func (x Decimal) quantize(places int32, rounding apd.Rounder) Decimal {
	c := ctx
	c.Rounding = rounding

	var z Decimal
	must(c.Quantize(&z.d, &x.d, -places))

	return z
}

// must panics on the conditions ctx traps. They are programming errors, such as division by zero,
// in the same way they are for Go's integers.
func must(_ apd.Condition, err error) {
	if err != nil {
		panic(fmt.Errorf("decimal: %w", err))
	}
}
