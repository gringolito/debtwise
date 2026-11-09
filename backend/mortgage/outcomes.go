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
	// MoneySaved is the interest, insurance and fees the prepayment avoids: what the installments
	// charge without it beyond what they charge with it, less what it took off the balance, which
	// is at most what was owed.
	MoneySaved decimal.Decimal
}

// Outcomes are what the prepayments of events changed, in the order of events.Prepayments.
type Outcomes struct {
	Prepayments []PrepaymentOutcome
	// TotalAmount is the sum of the prepayments' amounts.
	TotalAmount decimal.Decimal
	// MonthsShortened is how many installments fewer the schedule has with every prepayment than
	// with the statements alone. It is the sum of the prepayments' MonthsShortened.
	MonthsShortened int
	// MoneySaved is the sum of the prepayments' MoneySaved.
	MoneySaved decimal.Decimal
}

// PrepaymentOutcomes returns what each prepayment of events changed (ADR-0016). Each is compared
// with the schedule replayed with the statements and the prepayments before it, so that what one
// changes is not credited to another. events.Prepayments are in the order the schedule replays
// them.
func (t Terms) PrepaymentOutcomes(outlook indexes.Outlook, events Events, today time.Time) Outcomes {
	outcomes := Outcomes{
		Prepayments: make([]PrepaymentOutcome, 0, len(events.Prepayments)),
		TotalAmount: decimal.Decimal{}.RoundCents(),
		MoneySaved:  decimal.Decimal{}.RoundCents(),
	}

	without := t.replayFirst(outlook, events, today, 0)
	statementsOnly := len(without.installments)

	for i, p := range events.Prepayments {
		with := t.replayFirst(outlook, events, today, i+1)
		saved := moneySaved(without, with)

		outcomes.Prepayments = append(outcomes.Prepayments, PrepaymentOutcome{
			Prepayment:           p,
			MonthsShortened:      len(without.installments) - len(with.installments),
			InstallmentReduction: installmentReduction(without.installments, with.installments, p.Date),
			MoneySaved:           saved,
		})
		outcomes.TotalAmount = outcomes.TotalAmount.Add(p.Amount)
		outcomes.MoneySaved = outcomes.MoneySaved.Add(saved)
		without = with
	}

	outcomes.MonthsShortened = statementsOnly - len(without.installments)

	return outcomes
}

// replayFirst replays the statements of events with only the first n of their prepayments.
func (t Terms) replayFirst(outlook indexes.Outlook, events Events, today time.Time, n int) replayed {
	return t.replay(outlook, Events{Prepayments: events.Prepayments[:n], Statements: events.Statements}, today)
}

// moneySaved returns what the installments of without charge beyond those of with, less what the
// prepayment with adds took off the balance.
func moneySaved(without, with replayed) decimal.Decimal {
	return charged(without.installments).Sub(charged(with.installments)).Sub(with.prepaid.Sub(without.prepaid))
}

// charged returns the sum of the installments' amounts.
func charged(installments []Installment) decimal.Decimal {
	sum := decimal.Decimal{}.RoundCents()
	for _, installment := range installments {
		sum = sum.Add(installment.Amount)
	}

	return sum
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
