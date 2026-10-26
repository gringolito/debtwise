// Package bonds keeps the catalogue of bonds DebtWise compares against a prepayment, with their
// current quotes, and prices them the way Tesouro does.
package bonds

import "time"

// Type is a kind of bond DebtWise compares (ADR-0001).
type Type string

const (
	// LTN is Tesouro Prefixado, which pays its face value at maturity.
	LTN Type = "ltn"
	// NTNF is Tesouro Prefixado com Juros Semestrais, which also pays a coupon every semester.
	NTNF Type = "ntn_f"
)

// Types returns every Type, in the order the catalogue lists them.
func Types() []Type {
	return []Type{LTN, NTNF}
}

// Bond is one bond: a type and its maturity date, at midnight UTC.
type Bond struct {
	Type     Type
	Maturity time.Time
}
