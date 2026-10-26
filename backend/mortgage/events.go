package mortgage

import (
	"slices"
	"time"

	"github.com/gringolito/debtwise/backend/decimal"
)

// PrepaymentEffect says what a prepayment changes in the installments that follow it.
type PrepaymentEffect string

const (
	// ShortenTerm keeps the amortization system's installment and ends the schedule earlier.
	ShortenTerm PrepaymentEffect = "shorten_term"
	// LowerInstallment keeps the end date and lowers the installments.
	LowerInstallment PrepaymentEffect = "lower_installment"
)

// Prepayment is a payment the owner made against the outstanding balance outside the schedule.
type Prepayment struct {
	ID     int64
	Date   time.Time
	Amount decimal.Decimal
	Effect PrepaymentEffect
}

// Statement is the outstanding balance the bank reported on a date.
type Statement struct {
	ID                 int64
	Date               time.Time
	OutstandingBalance decimal.Decimal
}

// Events are what really happened to a mortgage: the prepayments the owner made and the statements
// the bank issued. The zero value has none.
type Events struct {
	Prepayments []Prepayment
	Statements  []Statement
}

// Drift is how far a statement's balance is from the one the schedule computed for its date.
type Drift struct {
	Statement       Statement
	ComputedBalance decimal.Decimal
	// Amount is the stated balance minus the computed one.
	Amount decimal.Decimal
}

// Validate returns every rule the prepayment breaks for terms. The schema checks the effect.
func (p Prepayment) Validate(terms Terms) []Violation {
	var violations []Violation

	if p.Date.Before(terms.ContractDate) {
		violations = append(violations, Violation{"date", notBeforeContract})
	}

	if p.Amount.Cmp(decimal.Decimal{}) <= 0 {
		violations = append(violations, Violation{"amount", "must be greater than zero"})
	}

	return violations
}

// Validate returns every rule the statement breaks for terms. The schema checks that the balance
// is not negative.
func (s Statement) Validate(terms Terms) []Violation {
	if s.Date.Before(terms.ContractDate) {
		return []Violation{{"date", notBeforeContract}}
	}

	return nil
}

// event is a prepayment or a statement.
type event struct {
	date       time.Time
	prepayment *Prepayment
	statement  *Statement
}

// inOrder returns the events by date. On the same date, prepayments come before statements, as a
// statement reports the balance a prepayment that day left: they are listed first and the sort is
// stable.
func (e Events) inOrder() []event {
	events := make([]event, 0, len(e.Prepayments)+len(e.Statements))

	for i := range e.Prepayments {
		events = append(events, event{date: e.Prepayments[i].Date, prepayment: &e.Prepayments[i]})
	}

	for i := range e.Statements {
		events = append(events, event{date: e.Statements[i].Date, statement: &e.Statements[i]})
	}

	slices.SortStableFunc(events, func(a, b event) int { return a.date.Compare(b.date) })

	return events
}
