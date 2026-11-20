package mortgage

import (
	"context"
	"database/sql"
	"errors"
	"fmt"

	"github.com/gringolito/debtwise/backend/db"
	"github.com/gringolito/debtwise/backend/decimal"
)

// DefaultComparison is the prepayment Início's answer weighs against investing until the owner
// compares another amount: an amount prepaid today, and what prepaying it changes.
type DefaultComparison struct {
	Amount decimal.Decimal
	Effect PrepaymentEffect
}

// initialDefaultComparison is the default comparison Início makes until the owner saves one.
var initialDefaultComparison = DefaultComparison{Amount: decimal.MustParse("10000.00"), Effect: ShortenTerm}

// defaultComparisonMinimum is the least amount the default comparison accepts. It is DebtWise's own
// floor: Tesouro Direto sells from 1% of a bond, which a comparison checks bond by bond.
var defaultComparisonMinimum = decimal.MustParse("50.00")

// Validate returns every rule the default comparison breaks. The schema checks the effect.
func (c DefaultComparison) Validate() []Violation {
	if c.Amount.Cmp(defaultComparisonMinimum) < 0 {
		return []Violation{{"amount", RuleBelowMinimum}}
	}

	return nil
}

// DefaultComparison returns the default comparison the owner saved, or R$ 10.000,00 prepaid to
// shorten the term while he has saved none.
func (s *Store) DefaultComparison(ctx context.Context) (DefaultComparison, error) {
	row, err := db.New(s.conn).FindDefaultComparison(ctx)
	if errors.Is(err, sql.ErrNoRows) {
		return initialDefaultComparison, nil
	}

	if err != nil {
		return DefaultComparison{}, fmt.Errorf("mortgage: default comparison: %w", err)
	}

	var p parser

	c := DefaultComparison{Amount: p.decimal(row.Amount), Effect: PrepaymentEffect(row.Effect)}
	if p.err != nil {
		return DefaultComparison{}, fmt.Errorf("mortgage: default comparison: %w", p.err)
	}

	return c, nil
}

// SaveDefaultComparison stores c as the default comparison Início makes, in place of the one it made.
func (s *Store) SaveDefaultComparison(ctx context.Context, c DefaultComparison) error {
	err := db.New(s.conn).UpsertDefaultComparison(ctx, db.UpsertDefaultComparisonParams{
		Amount: c.Amount.String(),
		Effect: string(c.Effect),
	})
	if err != nil {
		return fmt.Errorf("mortgage: save default comparison: %w", err)
	}

	return nil
}
