package mortgage

import (
	"slices"
	"time"

	"github.com/gringolito/debtwise/backend/decimal"
	"github.com/gringolito/debtwise/backend/indexes"
)

// PrepaymentOutcome is what a prepayment changed in the schedule, compared with the schedule
// replayed with the statements and the prepayments before it (ADR-0016).
type PrepaymentOutcome struct {
	Prepayment Prepayment
	// MonthsShortened is how many installments fewer the schedule has with the prepayment.
	MonthsShortened int
	// InstallmentReduction is how much lower the first installment due after the prepayment's date
	// is with the prepayment: nothing when no installment is due after it, and the whole
	// installment when the prepayment leaves none with that number.
	InstallmentReduction decimal.Decimal
}

// Outcomes are what the prepayments of events changed, in the order of events.Prepayments.
type Outcomes struct {
	Prepayments []PrepaymentOutcome
	// TotalAmount is the sum of the prepayments' amounts.
	TotalAmount decimal.Decimal
	// MonthsShortened is how many installments fewer the schedule has with every prepayment than
	// with the statements alone. It is the sum of the prepayments' MonthsShortened.
	MonthsShortened int
}

// PrepaymentOutcomes returns what each prepayment of events changed (ADR-0016). Each is compared
// with the schedule replayed with the statements and the prepayments before it, so that what one
// changes is not credited to another. events.Prepayments are in the order the schedule replays
// them.
func (t Terms) PrepaymentOutcomes(outlook indexes.Outlook, events Events, today time.Time) Outcomes {
	outcomes := Outcomes{
		Prepayments: make([]PrepaymentOutcome, 0, len(events.Prepayments)),
		TotalAmount: decimal.Decimal{}.RoundCents(),
	}

	replay := func(prepayments []Prepayment) []Installment {
		return slices.Collect(t.Schedule(outlook, Events{Prepayments: prepayments, Statements: events.Statements}, today))
	}

	without := replay(nil)
	statementsOnly := len(without)

	for i, p := range events.Prepayments {
		with := replay(events.Prepayments[:i+1])

		outcomes.Prepayments = append(outcomes.Prepayments, PrepaymentOutcome{
			Prepayment:           p,
			MonthsShortened:      len(without) - len(with),
			InstallmentReduction: installmentReduction(without, with, p.Date),
		})
		outcomes.TotalAmount = outcomes.TotalAmount.Add(p.Amount)
		without = with
	}

	outcomes.MonthsShortened = statementsOnly - len(without)

	return outcomes
}

// installmentReduction returns the first installment due after day in without, minus the
// installment of the same number in with, or minus nothing when with ends before it. It is zero
// when without has no installment due after day.
func installmentReduction(without, with []Installment, day time.Time) decimal.Decimal {
	next, found := firstDueAfter(without, day)
	if !found {
		return decimal.Decimal{}.RoundCents()
	}

	reduction := without[next].Amount
	if next < len(with) {
		reduction = reduction.Sub(with[next].Amount)
	}

	return reduction
}

// firstDueAfter returns the index of the first installment due after day, and whether there is
// one.
func firstDueAfter(installments []Installment, day time.Time) (int, bool) {
	i := slices.IndexFunc(installments, func(m Installment) bool { return m.DueDate.After(day) })

	return i, i >= 0
}
