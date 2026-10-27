package mortgage

import (
	"iter"
	"time"

	"github.com/gringolito/debtwise/backend/decimal"
	"github.com/gringolito/debtwise/backend/indexes"
)

// Installment is one scheduled monthly payment and what it charges, in reais rounded to centavos.
type Installment struct {
	// Number counts installments from 1.
	Number  int
	DueDate time.Time
	// Correction is what the indexer added to the outstanding balance before this installment.
	Correction decimal.Decimal
	// IndexValues are the index values Correction applied, one for each contract anniversary since
	// the previous installment, each marked missing, published or projected by its Methods. There
	// are none without an indexer.
	IndexValues []IndexValue
	// Interest is charged on the outstanding balance before this installment, once corrected.
	Interest     decimal.Decimal
	Amortization decimal.Decimal
	MIP          decimal.Decimal
	DFI          decimal.Decimal
	Fee          decimal.Decimal
	// Amount is everything the installment charges.
	Amount decimal.Decimal
	// Prepaid is what the prepayments dated from this installment's due date until the next one's
	// took off the outstanding balance.
	Prepaid decimal.Decimal
	// OutstandingBalance is what is still owed after this installment and the prepayments and
	// statements dated before the next one.
	OutstandingBalance decimal.Decimal
}

// Schedule returns the installments of valid terms in order, each priced with the rates and fee
// in effect on its due date, with events replayed between them.
//
// Each installment first corrects the outstanding balance by the indexer's value on each contract
// anniversary since the previous installment, unless that value is missing. An installment due by
// today is corrected by published values only, so a month whose value is only projected is
// missing. An installment due after today is corrected by the Outlook's estimate, published or
// projected, and a month with no estimate is missing (ADR-0009).
// Each charge and correction is rounded to centavos. The last installment amortizes whatever is
// still owed, so the balance ends at zero. Under Price the amortization plus interest is set from
// the balance, rate and months left on the first installment, whenever the rate changes and
// whenever the balance is corrected, prepaid or stated.
//
// Events apply in date order after the installments due on or before their date. A prepayment
// takes off at most what is owed. Shortening the term keeps the months left to the fewest whose
// installment, under the amortization system's rule, is no higher than before the prepayment;
// lowering the installment keeps the months left. A statement replaces the computed balance. Once
// nothing is owed the schedule ends, and later statements only report their drift.
func (t Terms) Schedule(outlook indexes.Outlook, events Events, today time.Time) iter.Seq[Installment] {
	return t.replayer(outlook, events, today).installments()
}

// Drifts returns the drift of every statement in events, in date order, as Schedule replays them.
func (t Terms) Drifts(outlook indexes.Outlook, events Events, today time.Time) []Drift {
	r := t.replayer(outlook, events, today)
	for range r.installments() {
	}

	return r.drifts
}

// replayer replays a schedule once, keeping its state between installments.
type replayer struct {
	terms       Terms
	corrections *corrections
	today       time.Time
	events      []event
	balance     decimal.Decimal
	// term is the number of the last installment.
	term int
	// payment is the Price installment's amortization plus interest, levelled at paymentRate.
	payment, paymentRate decimal.Decimal
	// relevel is set when the balance changed outside an installment, so Price levels the
	// installment again.
	relevel bool
	// drifts are those of the statements applied so far.
	drifts []Drift
}

func (t Terms) replayer(outlook indexes.Outlook, events Events, today time.Time) *replayer {
	return &replayer{
		terms:       t,
		corrections: newCorrections(t, outlook),
		today:       today,
		events:      events.inOrder(),
		balance:     t.OriginalAmount.RoundCents(),
		term:        t.TermMonths,
	}
}

func (r *replayer) installments() iter.Seq[Installment] {
	return func(yield func(Installment) bool) {
		r.applyBefore(0, r.terms.FirstInstallmentDate)

		for number := 1; number <= r.term; number++ {
			installment := r.charge(number)
			installment.Prepaid = r.applyBefore(number, addMonths(r.terms.FirstInstallmentDate, number))
			installment.OutstandingBalance = r.balance

			if !yield(installment) {
				return
			}
		}

		for len(r.events) > 0 {
			r.applyNext(r.term)
		}
	}
}

// charge returns installment number, corrected, priced and amortized from the balance.
func (r *replayer) charge(number int) Installment {
	t := r.terms
	due := addMonths(t.FirstInstallmentDate, number-1)
	rate := inEffect(t.ContractRates, due).monthly()
	left := r.term - number + 1

	values := r.corrections.through(due, !due.After(r.today))

	correction := decimal.Decimal{}.RoundCents()

	for _, v := range values {
		if v.Missing {
			continue
		}

		corrected := r.balance.Mul(v.Value).Quo(decimal.FromInt(100)).RoundCents()
		correction = correction.Add(corrected)
		r.balance = r.balance.Add(corrected)
	}

	interest := r.balance.Mul(rate).RoundCents()

	var amortization decimal.Decimal

	switch {
	case left == 1:
		amortization = r.balance
	case t.AmortizationSystem == SAC:
		amortization = level(SAC, r.balance, rate, left)
	default:
		if number == 1 || r.relevel || rate.Cmp(r.paymentRate) != 0 || correction.Cmp(decimal.Decimal{}) != 0 {
			r.payment, r.paymentRate = pricePayment(r.balance, rate, left), rate
		}

		amortization = r.payment.Sub(interest)
	}

	r.relevel = false
	mip := r.balance.Mul(inEffect(t.MIPRates, due).Rate).RoundCents()
	dfi := t.AppraisalValue.Mul(inEffect(t.DFIRates, due).Rate).RoundCents()
	fee := inEffect(t.Fees, due).Amount.RoundCents()
	r.balance = r.balance.Sub(amortization)

	return Installment{
		Number:       number,
		DueDate:      due,
		Correction:   correction,
		IndexValues:  values,
		Interest:     interest,
		Amortization: amortization,
		MIP:          mip,
		DFI:          dfi,
		Fee:          fee,
		Amount:       amortization.Add(interest).Add(mip).Add(dfi).Add(fee),
	}
}

// applyBefore applies the events dated before until, after paid installments, and returns what
// their prepayments took off the balance.
func (r *replayer) applyBefore(paid int, until time.Time) decimal.Decimal {
	prepaid := decimal.Decimal{}.RoundCents()

	for len(r.events) > 0 && r.events[0].date.Before(until) {
		prepaid = prepaid.Add(r.applyNext(paid))
	}

	return prepaid
}

// applyNext applies the next event after paid installments, ends the schedule there if nothing is
// owed any more, and returns what a prepayment took off the balance.
func (r *replayer) applyNext(paid int) decimal.Decimal {
	e := r.events[0]
	r.events = r.events[1:]

	prepaid := decimal.Decimal{}.RoundCents()

	switch {
	case e.statement != nil:
		r.applyStatement(*e.statement)
	case r.balance.Cmp(decimal.Decimal{}) > 0:
		prepaid = r.prepay(paid, *e.prepayment)
	}

	if r.balance.Cmp(decimal.Decimal{}) == 0 {
		r.term = paid
	}

	return prepaid
}

// prepay takes p off the balance after paid installments and returns how much it took.
func (r *replayer) prepay(paid int, p Prepayment) decimal.Decimal {
	amount := p.Amount
	if amount.Cmp(r.balance) > 0 {
		amount = r.balance
	}

	left := r.term - paid
	rate := inEffect(r.terms.ContractRates, addMonths(r.terms.FirstInstallmentDate, paid)).monthly()
	before := level(r.terms.AmortizationSystem, r.balance, rate, left)
	r.balance = r.balance.Sub(amount)
	r.relevel = true

	if p.Effect == ShortenTerm && r.balance.Cmp(decimal.Decimal{}) > 0 {
		months := 1
		for months < left && level(r.terms.AmortizationSystem, r.balance, rate, months).Cmp(before) > 0 {
			months++
		}

		r.term = paid + months
	}

	return amount
}

// applyStatement records the statement's drift and replaces the balance with its balance, unless
// nothing is owed any more.
func (r *replayer) applyStatement(s Statement) {
	r.drifts = append(r.drifts, Drift{Statement: s, ComputedBalance: r.balance, Amount: s.OutstandingBalance.Sub(r.balance)})

	if r.balance.Cmp(decimal.Decimal{}) > 0 {
		r.balance = s.OutstandingBalance
		r.relevel = true
	}
}

// level returns the installment's amortization under SAC, or its amortization plus interest under
// Price, that pays balance off over months at a monthly rate.
func level(system AmortizationSystem, balance, rate decimal.Decimal, months int) decimal.Decimal {
	if system == SAC {
		return balance.Quo(decimal.FromInt(int64(months))).RoundCents()
	}

	return pricePayment(balance, rate, months)
}

// pricePayment returns the level amortization plus interest that pays balance off over months at
// a monthly rate. A rate too small to discount at all, zero included, splits the balance evenly.
func pricePayment(balance, rate decimal.Decimal, months int) decimal.Decimal {
	one := decimal.FromInt(1)

	discount := one.Sub(one.Add(rate).Pow(decimal.FromInt(int64(-months))))
	if discount.Cmp(decimal.Decimal{}) == 0 {
		return balance.Quo(decimal.FromInt(int64(months))).RoundCents()
	}

	return balance.Mul(rate).Quo(discount).RoundCents()
}

// addMonths returns the date months after day, on the same day of the month or on the month's
// last day when it is shorter.
func addMonths(day time.Time, months int) time.Time {
	first := time.Date(day.Year(), day.Month()+time.Month(months), 1, 0, 0, 0, 0, time.UTC)
	lastDay := first.AddDate(0, 1, -1).Day()

	return first.AddDate(0, 0, min(day.Day(), lastDay)-1)
}
