package mortgage

import (
	"cmp"
	"fmt"
	"math"
	"slices"
	"time"

	"github.com/gringolito/debtwise/backend/decimal"
	"github.com/gringolito/debtwise/backend/indexes"
)

// PrepaymentPreview compares the schedule as recorded with the one a prepayment would give.
type PrepaymentPreview struct {
	// CurrentPayoff and Payoff are the due dates of the last installments of the recorded schedule
	// and of the previewed one. A schedule a prepayment or statement paid off before its first
	// installment has none, and is paid off on the date of that prepayment or statement.
	CurrentPayoff, Payoff time.Time
	// CurrentInstallment is the amount of the first installment due after the previewed
	// prepayment's date in the recorded schedule, and Installment the same-numbered installment's
	// amount in the previewed one. Each is nil when its schedule has no such installment.
	CurrentInstallment, Installment *decimal.Decimal
	// MoneySaved is what the previewed prepayment would save once recorded, as PrepaymentOutcomes
	// would report it.
	MoneySaved decimal.Decimal
}

// PreviewPrepayment replays events with p, in place of the prepayment with ID replaces when it is
// not zero, and compares the schedule with the recorded one (ADR-0016). It stores nothing. It
// returns ErrPrepaymentNotFound when events have no prepayment with ID replaces.
func (t Terms) PreviewPrepayment(outlook indexes.Outlook, events Events, today time.Time, p Prepayment, replaces int64) (PrepaymentPreview, error) {
	previewed, at, err := events.withPrepayment(p, replaces)
	if err != nil {
		return PrepaymentPreview{}, err
	}

	current := t.replay(outlook, events, today)
	with := t.replay(outlook, previewed, today)

	preview := PrepaymentPreview{
		CurrentPayoff: current.payoffDate(),
		Payoff:        with.payoffDate(),
		MoneySaved:    moneySaved(t.replayFirst(outlook, previewed, today, at), t.replayFirst(outlook, previewed, today, at+1)),
	}

	if next, found := firstDueAfter(current.installments, p.Date); found {
		currentAmount := current.installments[next].Amount
		preview.CurrentInstallment = &currentAmount

		if next < len(with.installments) {
			amount := with.installments[next].Amount
			preview.Installment = &amount
		}
	}

	return preview, nil
}

// PreviewStatement returns the drift s would have once recorded, in place of the statement with ID
// replaces when it is not zero (ADR-0016). It stores nothing. It returns ErrStatementDateTaken when
// another statement is on s's date, and ErrStatementNotFound when events have no statement with ID
// replaces.
func (t Terms) PreviewStatement(outlook indexes.Outlook, events Events, today time.Time, s Statement, replaces int64) (Drift, error) {
	previewed, err := events.withStatement(s, replaces)
	if err != nil {
		return Drift{}, err
	}

	drifts := t.Drifts(outlook, previewed, today)

	// The date is the statement's identity: a mortgage has at most one statement on each.
	return drifts[slices.IndexFunc(drifts, func(d Drift) bool { return d.Statement.Date.Equal(s.Date) })], nil
}

// replayed is a schedule replayed with its events.
type replayed struct {
	installments []Installment
	// paidOffOn is the date of the event that paid the mortgage off, which is where a schedule
	// without installments ends.
	paidOffOn time.Time
	// prepaid is what the prepayments took off the balance.
	prepaid decimal.Decimal
}

func (t Terms) replay(outlook indexes.Outlook, events Events, today time.Time) replayed {
	r := t.replayer(outlook, events, today)
	installments := slices.Collect(r.installments())

	return replayed{installments: installments, paidOffOn: r.paidOffOn, prepaid: r.prepaid}
}

// payoffDate returns the due date of the last installment, or paidOffOn when there is none.
func (r replayed) payoffDate() time.Time {
	if len(r.installments) == 0 {
		return r.paidOffOn
	}

	return r.installments[len(r.installments)-1].DueDate
}

// withPrepayment returns e with p in place of the prepayment with ID replaces when it is not zero,
// where the store would list it: a new prepayment comes after those on its date. It also returns
// where p is among the prepayments.
func (e Events) withPrepayment(p Prepayment, replaces int64) (Events, int, error) {
	prepayments := make([]Prepayment, 0, len(e.Prepayments)+1)

	for _, recorded := range e.Prepayments {
		if replaces == 0 || recorded.ID != replaces {
			prepayments = append(prepayments, recorded)
		}
	}

	if replaces != 0 && len(prepayments) == len(e.Prepayments) {
		return Events{}, 0, fmt.Errorf("mortgage: preview replacing prepayment %d: %w", replaces, ErrPrepaymentNotFound)
	}

	p.ID = cmp.Or(replaces, math.MaxInt64)
	prepayments = append(prepayments, p)
	slices.SortStableFunc(prepayments, func(a, b Prepayment) int {
		return cmp.Or(a.Date.Compare(b.Date), cmp.Compare(a.ID, b.ID))
	})
	at := slices.IndexFunc(prepayments, func(q Prepayment) bool { return q.ID == p.ID })

	return Events{Prepayments: prepayments, Statements: e.Statements}, at, nil
}

// withStatement returns e with s in place of the statement with ID replaces when it is not zero.
// Like the store, it checks the date before the ID.
func (e Events) withStatement(s Statement, replaces int64) (Events, error) {
	statements := make([]Statement, 0, len(e.Statements)+1)

	for _, recorded := range e.Statements {
		if replaces != 0 && recorded.ID == replaces {
			continue
		}

		if recorded.Date.Equal(s.Date) {
			return Events{}, fmt.Errorf("mortgage: preview statement on %s: %w", formatDate(s.Date), ErrStatementDateTaken)
		}

		statements = append(statements, recorded)
	}

	if replaces != 0 && len(statements) == len(e.Statements) {
		return Events{}, fmt.Errorf("mortgage: preview replacing statement %d: %w", replaces, ErrStatementNotFound)
	}

	s.ID = replaces
	statements = append(statements, s)
	slices.SortStableFunc(statements, func(a, b Statement) int { return a.Date.Compare(b.Date) })

	return Events{Prepayments: e.Prepayments, Statements: statements}, nil
}
