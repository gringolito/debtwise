package mortgage

import (
	"slices"
	"time"

	"github.com/gringolito/debtwise/backend/decimal"
	"github.com/gringolito/debtwise/backend/indexes"
)

// Plan is what an owner would do with the mortgage on top of its recorded events: prepay Amount
// on Start, then, after each installment due after Start, prepay what TopUp returns for it on its
// due date. Every prepayment of the plan has Effect. The plan's schedule runs up to Until.
type Plan struct {
	Start  time.Time
	Amount decimal.Decimal
	Effect PrepaymentEffect
	// TopUp is given each installment due after Start once it is charged, and returns what to
	// prepay right after it. Nil, or a result that isn't positive, prepays nothing.
	TopUp func(Installment) decimal.Decimal
	Until time.Time
}

// PlannedInstallment is an installment of a planned schedule, with what the plan's top-up after it
// took off the outstanding balance.
type PlannedInstallment struct {
	Installment
	TopUp decimal.Decimal
}

// Planned is a mortgage's schedule under a plan, up to the plan's Until.
type Planned struct {
	// Initial is what the plan's prepayment on Start took off the outstanding balance.
	Initial decimal.Decimal
	// AtStart is the outstanding balance once the events dated on or before Start have applied.
	AtStart decimal.Decimal
	// Installments are those due on or before Until. Their Prepaid includes the plan's
	// prepayments, and the events applied after the last of them are only those dated on or
	// before Until.
	Installments []PlannedInstallment
	// Balance is the outstanding balance on Until.
	Balance decimal.Decimal
}

// Plan replays the schedule of valid terms as Schedule does, with the plan's prepayments added to
// the events (ADR-0011). The prepayment on Start applies with the recorded events of its date,
// after their prepayments and before their statements. A top-up applies right after the
// installment it follows, before the events dated on its due date.
func (t Terms) Plan(outlook indexes.Outlook, events Events, today time.Time, plan Plan) Planned {
	r := t.replayer(outlook, events, today)
	if plan.Amount.Cmp(decimal.Decimal{}) > 0 {
		r.schedule(event{
			date:       plan.Start,
			prepayment: &Prepayment{Date: plan.Start, Amount: plan.Amount, Effect: plan.Effect},
			planned:    true,
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
		topUp := p.topUp(number, installment)
		installment.Prepaid = topUp.Add(p.apply(number, addMonths(t.FirstInstallmentDate, number)))
		installment.OutstandingBalance = r.balance
		p.planned.Installments = append(p.planned.Installments, PlannedInstallment{Installment: installment, TopUp: topUp})
		paid = number
	}

	p.apply(paid, p.until)
	p.planned.Initial = r.initial.RoundCents()
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

// schedule adds e to the events still to apply, after those of earlier dates and the prepayments
// of its date, and before the statements of its date.
func (r *replayer) schedule(e event) {
	i := slices.IndexFunc(r.events, func(other event) bool {
		return other.date.After(e.date) || other.date.Equal(e.date) && other.statement != nil
	})
	if i < 0 {
		i = len(r.events)
	}

	r.events = slices.Insert(r.events, i, e)
}
