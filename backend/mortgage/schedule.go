package mortgage

import (
	"iter"
	"sort"
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
	// IndexValues are the index values Correction applied, each marked missing, published or
	// projected by its Methods: under TR, the TR of the periods its update since the last update
	// reads; under IPCA, one for each contract anniversary since the previous installment. There
	// are none without an indexer, nor on the first installment under IPCA.
	IndexValues []IndexValue
	// Rate is the effective annual contract rate Interest was charged at.
	Rate decimal.Decimal
	// RateIndexValues are the index values the rate's variable part follows, each marked missing,
	// published or projected by its Methods. There are none for a rate without a variable part.
	RateIndexValues []IndexValue
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
// Each installment first corrects the outstanding balance on its due date, unless the values it
// needs are missing. Under TR it updates the balance pro rata die since the last update, the
// contract date, a prepayment's date or the previous due date: by the TR of the period that starts
// on the first due day on or after the update's start and of each later period that starts before
// the due date, in full for a whole period and for the days in it over 30, rounded down, for a
// part (ADR-0006). Under IPCA it corrects the balance by the values of each contract anniversary
// since the previous installment; the first installment is never corrected, and the months up to
// the first anniversary correct no installment.
// An installment due by today is corrected by published values only, so a month whose value is
// only projected is missing. An installment due after today is corrected by the Outlook's
// estimate, published or projected, and a month with no estimate is missing (ADR-0009).
// MIP is charged on the corrected balance, and DFI on the appraisal value, which under TR is
// corrected on each due date from the first installment's on by the TR of the periods since the
// previous one (ADR-0015). Both are charged at the rates in effect on the due date.
// Each charge and correction is rounded to centavos. The last installment amortizes whatever is
// still owed, so the balance ends at zero. Under SAC the first installment charges interest for the
// days since the contract date, at the monthly rate for each 30, and amortizes what a month's
// interest plus the balance over the months left leaves of it (ADR-0014). Under Price the
// amortization plus interest is set from the balance, rate and months left on the first
// installment, whenever the rate changes and whenever the balance is corrected, prepaid or stated.
//
// Events apply in date order after the installments due on or before their date. A prepayment
// first updates a TR-indexed balance pro rata die to its date, as an installment does, and takes
// off at most what is then owed. Shortening the term keeps the months left to the fewest whose
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
	outlook     indexes.Outlook
	corrections *corrections
	// updates update the balance under TR, and appraisalUpdates the appraisal value DFI is charged
	// on, from the first installment's due date on and on due dates only.
	updates, appraisalUpdates *updates
	today                     time.Time
	events                    []event
	balance                   decimal.Decimal
	appraisal                 decimal.Decimal
	// term is the number of the last installment.
	term int
	// payment is the Price installment's amortization plus interest, levelled at paymentRate.
	payment, paymentRate decimal.Decimal
	// relevel is set when the balance changed outside an installment, so Price levels the
	// installment again.
	relevel bool
	// drifts are those of the statements applied so far.
	drifts []Drift
	// rates are the contract rates with their fixed parts converted once.
	rates []chargedRate
}

// correction is what the indexer added to the balance for an installment, and the index values
// behind it.
type correction struct {
	amount decimal.Decimal
	values []IndexValue
}

func (t Terms) replayer(outlook indexes.Outlook, events Events, today time.Time) *replayer {
	return &replayer{
		terms:            t,
		outlook:          outlook,
		corrections:      newCorrections(t, outlook),
		updates:          newUpdates(t, outlook, t.ContractDate),
		appraisalUpdates: newUpdates(t, outlook, t.FirstInstallmentDate),
		today:            today,
		events:           events.inOrder(),
		balance:          t.OriginalAmount.RoundCents(),
		appraisal:        t.AppraisalValue,
		term:             t.TermMonths,
		rates:            chargedRates(t.ContractRates),
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
	rate := r.rateOf(number)
	left := r.term - number + 1
	correction := r.correct(number)

	interest := r.balance.Mul(rate.monthly).RoundCents()
	monthsInterest := interest

	if number == 1 && t.AmortizationSystem == SAC {
		interest = r.balance.Mul(rate.monthly).Mul(decimal.FromInt(int64(days(t.ContractDate, due)))).Quo(decimal.FromInt(30)).RoundCents()
	}

	var amortization decimal.Decimal

	switch {
	case left == 1:
		amortization = r.balance
	case t.AmortizationSystem == SAC:
		amortization = level(SAC, r.balance, rate.monthly, left).Add(monthsInterest).Sub(interest)
	default:
		if number == 1 || r.relevel || rate.monthly.Cmp(r.paymentRate) != 0 || correction.amount.Cmp(decimal.Decimal{}) != 0 {
			r.payment, r.paymentRate = pricePayment(r.balance, rate.monthly, left), rate.monthly
		}

		amortization = r.payment.Sub(interest)
	}

	r.relevel = false
	mip := r.balance.Mul(inEffect(t.MIPRates, due).Rate).RoundCents()
	dfi := r.appraisal.Mul(inEffect(t.DFIRates, due).Rate).RoundCents()
	fee := inEffect(t.Fees, due).Amount.RoundCents()
	r.balance = r.balance.Sub(amortization)

	return Installment{
		Number:          number,
		DueDate:         due,
		Correction:      correction.amount,
		IndexValues:     correction.values,
		Rate:            rate.effective,
		RateIndexValues: rate.values,
		Interest:        interest,
		Amortization:    amortization,
		MIP:             mip,
		DFI:             dfi,
		Fee:             fee,
		Amount:          amortization.Add(interest).Add(mip).Add(dfi).Add(fee),
	}
}

// correct corrects the balance for installment number, and returns its correction: under TR, the
// update to its due date. Under TR it updates the appraisal value to its due date too.
func (r *replayer) correct(number int) correction {
	due := addMonths(r.terms.FirstInstallmentDate, number-1)
	if r.terms.Indexer == TR {
		for _, part := range r.appraisalUpdates.to(due, !due.After(r.today)) {
			if !part.value.Missing {
				r.appraisal = r.appraisal.Add(part.of(r.appraisal))
			}
		}

		return r.update(due)
	}

	c := correction{
		amount: decimal.Decimal{}.RoundCents(),
		values: r.corrections.through(due, !due.After(r.today)),
	}

	for _, v := range c.values {
		if v.Missing {
			continue
		}

		corrected := r.balance.Mul(v.Value).Quo(decimal.FromInt(100)).RoundCents()
		c.amount = c.amount.Add(corrected)
		r.balance = r.balance.Add(corrected)
	}

	return c
}

// update updates the balance of a TR-indexed mortgage pro rata die to day, and returns the update.
func (r *replayer) update(day time.Time) correction {
	c := correction{amount: decimal.Decimal{}.RoundCents()}

	for _, part := range r.updates.to(day, !day.After(r.today)) {
		c.values = append(c.values, part.value)
		if part.value.Missing {
			continue
		}

		updated := part.of(r.balance)
		c.amount = c.amount.Add(updated)
		r.balance = r.balance.Add(updated)
	}

	return c
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
// owed any more, and returns what a prepayment took off the balance. A planned prepayment also
// notes what it took and the balance it left.
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

	if e.planned != nil {
		e.planned.Prepaid, e.planned.OutstandingBalance = prepaid.RoundCents(), r.balance
	}

	if r.balance.Cmp(decimal.Decimal{}) == 0 {
		r.term = paid
	}

	return prepaid
}

// prepay takes p off the balance after paid installments, once a TR-indexed mortgage's balance is
// updated to its date, and returns how much it took.
func (r *replayer) prepay(paid int, p Prepayment) decimal.Decimal {
	if r.terms.Indexer == TR {
		r.update(p.Date)
	}

	amount := p.Amount
	if amount.Cmp(r.balance) > 0 {
		amount = r.balance
	}

	left := r.term - paid
	rate := r.rateOf(paid + 1).monthly
	before := level(r.terms.AmortizationSystem, r.balance, rate, left)
	r.balance = r.balance.Sub(amount)
	r.relevel = true

	if p.Effect == ShortenTerm && r.balance.Cmp(decimal.Decimal{}) > 0 {
		// The installment only falls as the months grow, so the fewest months it fits in can be
		// searched for.
		months := 1 + sort.Search(left-1, func(i int) bool {
			return level(r.terms.AmortizationSystem, r.balance, rate, i+1).Cmp(before) <= 0
		})

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

// days counts the days from start to end, both at midnight UTC.
func days(start, end time.Time) int {
	return int(end.Sub(start) / (24 * time.Hour))
}
