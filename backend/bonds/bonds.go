// Package bonds keeps the catalogue of bonds DebtWise compares against a prepayment, with their
// current quotes, and prices them the way Tesouro does.
package bonds

import "time"

// Type is a kind of bond DebtWise compares (ADR-0007).
type Type string

const (
	// LTN is Tesouro Prefixado, which pays its face value at maturity.
	LTN Type = "ltn"
	// NTNF is Tesouro Prefixado com Juros Semestrais, which also pays a coupon every semester.
	NTNF Type = "ntn_f"
	// NTNBPrincipal is Tesouro IPCA+, which pays its IPCA-corrected value at maturity.
	NTNBPrincipal Type = "ntn_b_principal"
	// NTNB is Tesouro IPCA+ com Juros Semestrais, which also pays a coupon every semester.
	NTNB Type = "ntn_b"
)

// Types returns every Type, in the order the catalogue lists them.
func Types() []Type {
	return []Type{LTN, NTNF, NTNBPrincipal, NTNB}
}

// Bond is one bond: a type and its maturity date, at midnight UTC.
type Bond struct {
	Type     Type
	Maturity time.Time
}
