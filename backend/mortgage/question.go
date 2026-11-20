package mortgage

import (
	"context"
	"database/sql"
	"errors"
	"fmt"

	"github.com/gringolito/debtwise/backend/db"
	"github.com/gringolito/debtwise/backend/decimal"
)

// Question is the prepayment Início's answer weighs against investing: an amount prepaid today, and
// what prepaying it changes.
type Question struct {
	Amount decimal.Decimal
	Effect PrepaymentEffect
}

// defaultQuestion is the question Início asks until the owner saves one.
var defaultQuestion = Question{Amount: decimal.MustParse("10000.00"), Effect: ShortenTerm}

// Validate returns every rule the question breaks. The schema checks the effect.
func (q Question) Validate() []Violation {
	if q.Amount.Cmp(decimal.Decimal{}) <= 0 {
		return []Violation{{"amount", RuleNotPositive}}
	}

	return nil
}

// Question returns the question the owner saved, or R$ 10.000,00 prepaid to shorten the term while
// he has saved none.
func (s *Store) Question(ctx context.Context) (Question, error) {
	row, err := db.New(s.conn).FindDashboardQuestion(ctx)
	if errors.Is(err, sql.ErrNoRows) {
		return defaultQuestion, nil
	}

	if err != nil {
		return Question{}, fmt.Errorf("mortgage: question: %w", err)
	}

	var p parser

	q := Question{Amount: p.decimal(row.Amount), Effect: PrepaymentEffect(row.Effect)}
	if p.err != nil {
		return Question{}, fmt.Errorf("mortgage: question: %w", p.err)
	}

	return q, nil
}

// SaveQuestion stores q as the question Início asks, in place of the one it asked.
func (s *Store) SaveQuestion(ctx context.Context, q Question) error {
	err := db.New(s.conn).UpsertDashboardQuestion(ctx, db.UpsertDashboardQuestionParams{
		Amount: q.Amount.String(),
		Effect: string(q.Effect),
	})
	if err != nil {
		return fmt.Errorf("mortgage: save question: %w", err)
	}

	return nil
}
