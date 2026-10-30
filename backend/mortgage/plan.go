package mortgage

import (
	"slices"
	"time"

	"github.com/gringolito/debtwise/backend/decimal"
	"github.com/gringolito/debtwise/backend/indexes"
)

// Plan is what an owner would do with the mortgage on top of its recorded events: prepay Amount
// on Start, prepay each of Prepayments on its date, and, after each installment due after Start,
// prepay what TopUp returns for it on its due date. Every prepayment of the plan has Effect. The
// plan's schedule runs up to Until.
type Plan struct {
	Start  time.Time
	Amount decimal.Decimal
	Effect PrepaymentEffect
	// Prepayments are dated after Start and on or before Until. Their Effect is ignored.
	Prepayments []Prepayment
	// TopUp is given each installment due after Start once it is charged, and returns what to
	// prepay on its due date. Nil, or a result that isn't positive, prepays nothing.
	TopUp func(Installment) decimal.Decimal
	Until time.Time
}

// PlannedInstallment is an installment of a planned schedule, with what the plan's top-up after it
// took off the outstanding balance, and the outstanding balance once the events of its due date
// and the top-up have applied.
type PlannedInstallment struct {
	Installment
	TopUp           decimal.Decimal
	BalanceOnDueDay decimal.Decimal
}

// PlannedPrepayment is what one of a plan's Prepayments took off the outstanding balance, and the
// outstanding balance it left.
type PlannedPrepayment struct {
	Prepaid            decimal.Decimal
	OutstandingBalance decimal.Decimal
}

// Planned is a mortgage's schedule under a plan, up to the plan's Until.
type Planned struct {
	// Initial is what the plan's prepayment on Start took off the outstanding balance.
	Initial decimal.Decimal
	// AtStart is the outstanding balance once the events dated on or before Start have applied.
	AtStart decimal.Decimal
	// Prepayments are what the plan's Prepayments took, in the plan's order.
	Prepayments []PlannedPrepayment
	// Installments are those due on or before Until. Their Prepaid includes the plan's
	// prepayments, and the events applied after the last of them are only those dated on or
	// before Until.
	Installments []PlannedInstallment
	// Balance is the outstanding balance on Until.
	Balance decimal.Decimal
}

// Plan replays the schedule of valid terms as Schedule does, with the plan's prepayments added to
// the events (ADR-0011). They never happened, so a recorded event can't account for them: each
// applies after the recorded events of its date, a top-up after the installment it follows too.
func (t Terms) Plan(outlook indexes.Outlook, events Events, today time.Time, plan Plan) Planned {
	none := decimal.Decimal{}.RoundCents()
	r := t.replayer(outlook, events, today)

	initial := PlannedPrepayment{Prepaid: none}
	if plan.Amount.Cmp(decimal.Decimal{}) > 0 {
		r.schedule(event{
			date:       plan.Start,
			prepayment: &Prepayment{Date: plan.Start, Amount: plan.Amount, Effect: plan.Effect},
			planned:    &initial,
		})
	}

	prepayments := make([]PlannedPrepayment, len(plan.Prepayments))
	for i, prepayment := range plan.Prepayments {
		prepayments[i].Prepaid = none
		r.schedule(event{
			date:       prepayment.Date,
			prepayment: &Prepayment{Date: prepayment.Date, Amount: prepayment.Amount, Effect: plan.Effect},
			planned:    &prepayments[i],
		})
	}

	p := planner{r: r, plan: plan, until: plan.Until.AddDate(0, 0, 1), afterStart: plan.Start.AddDate(0, 0, 1)}
	p.apply(0, t.FirstInstallmentDate)

	paid := 0

	for number := 1; number <= r.term; number++ {
		due := addMonths(t.FirstInstallmentDate, number-1)
		if due.After(plan.Until) {
			break
		}

		installment := r.charge(number)
		sameDay := p.apply(number, due.AddDate(0, 0, 1))
		topUp := p.topUp(number, installment)
		onDueDay := r.balance
		installment.Prepaid = sameDay.Add(topUp).Add(p.apply(number, addMonths(t.FirstInstallmentDate, number)))
		installment.OutstandingBalance = r.balance
		p.planned.Installments = append(p.planned.Installments, PlannedInstallment{Installment: installment, TopUp: topUp, BalanceOnDueDay: onDueDay})
		paid = number
	}

	p.apply(paid, p.until)
	p.planned.Initial = initial.Prepaid
	p.planned.Prepayments = prepayments
	p.planned.Balance = r.balance

	return p.planned
}

// planner replays a plan's schedule and collects it.
type planner struct {
	r                 *replayer
	plan              Plan
	until, afterStart time.Time
	started           bool
	planned           Planned
}

// apply applies the events dated before next and on or before Until, after paid installments, noting
// the balance once those dated on or before Start have applied, and returns what their
// prepayments took off the balance.
func (p *planner) apply(paid int, next time.Time) decimal.Decimal {
	if p.until.Before(next) {
		next = p.until
	}

	if p.started || next.Before(p.afterStart) {
		return p.r.applyBefore(paid, next)
	}

	prepaid := p.r.applyBefore(paid, p.afterStart)
	p.started, p.planned.AtStart = true, p.r.balance

	return prepaid.Add(p.r.applyBefore(paid, next))
}

// topUp prepays what the plan tops up installment number with, and returns what it took: nothing
// once nothing is owed, though the plan is still told of the installment.
func (p *planner) topUp(number int, installment Installment) decimal.Decimal {
	none := decimal.Decimal{}.RoundCents()

	if p.plan.TopUp == nil || !installment.DueDate.After(p.plan.Start) {
		return none
	}

	amount := p.plan.TopUp(installment)
	if amount.Cmp(decimal.Decimal{}) <= 0 || p.r.balance.Cmp(decimal.Decimal{}) <= 0 {
		return none
	}

	took := p.r.prepay(number, Prepayment{Date: installment.DueDate, Amount: amount, Effect: p.plan.Effect})
	if p.r.balance.Cmp(decimal.Decimal{}) == 0 {
		p.r.term = number
	}

	return took
}

// schedule adds e to the events still to apply, after every event dated on or before its date.
func (r *replayer) schedule(e event) {
	i := slices.IndexFunc(r.events, func(other event) bool { return other.date.After(e.date) })
	if i < 0 {
		i = len(r.events)
	}

	r.events = slices.Insert(r.events, i, e)
}
