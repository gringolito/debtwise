// Package comparison weighs prepaying the mortgage against buying a bond. It builds both scenarios
// under equal outflow and values them on the horizon (ADR-0011). It is pure: the mortgage, the
// market, the index outlook and today all arrive as arguments.
package comparison

import (
	"errors"
	"fmt"
	"slices"
	"time"

	"github.com/gringolito/debtwise/backend/bonds"
	"github.com/gringolito/debtwise/backend/decimal"
	"github.com/gringolito/debtwise/backend/indexes"
	"github.com/gringolito/debtwise/backend/mortgage"
)

// Mortgage is the owner's mortgage: its terms, its recorded events and the outlook its indexer is
// read from.
type Mortgage struct {
	Terms   mortgage.Terms
	Events  mortgage.Events
	Outlook indexes.Outlook
}

// Market is what bonds are bought and valued with: Tesouro Direto's quotes, the tax and fee tables,
// and what an NTN-B Principal's VNA is computed from.
type Market struct {
	Quotes []bonds.Quote
	Taxes  bonds.Taxes
	IPCA   bonds.IPCA
}

// Decision asks what to do with Amount on Date: prepay it with Effect, or buy a bond with it.
type Decision struct {
	Amount decimal.Decimal
	Date   time.Time
	Effect mortgage.PrepaymentEffect
}

// Unavailable says why a verdict has no scenarios.
type Unavailable string

const (
	// MissingIPCA is a verdict on a bond whose VNA follows an IPCA that isn't available.
	MissingIPCA Unavailable = "missing_ipca"
	// AmountTooSmall is a verdict on a bond the amount can't buy the smallest fraction of.
	AmountTooSmall Unavailable = "amount_too_small"
)

// Verdict compares prepaying the decision's amount with buying Bond with it, on the horizon, the
// bond's maturity. Unless it is Unavailable, it buys Quantity bonds at UnitPrice, the price at
// Rate for settlement on the decision's date.
type Verdict struct {
	Bond        bonds.Bond
	Rate        decimal.Decimal
	UnitPrice   decimal.Decimal
	Quantity    decimal.Decimal
	Unavailable Unavailable
	// Advantage is the investing scenario's net worth on the horizon less the prepaying one's.
	Advantage decimal.Decimal
	// AvoidedCost is what prepaying the amount saves by the horizon, beyond the amount itself.
	AvoidedCost decimal.Decimal
	Invest      Scenario
	Prepay      Scenario
	// ProjectedBy names the projection method of each index a projected value of the verdict
	// comes from, in the order of indexes.All.
	ProjectedBy []indexes.ProjectionMethod
	// Indexes are the indexes the verdict reads, in the order of indexes.All.
	Indexes []indexes.Index
}

// Scenario is one way of spending the amount, followed to the horizon under equal outflow.
type Scenario struct {
	// CashFlows are the scenario's flows from the decision's date to the horizon, by date.
	CashFlows []CashFlow
	// Bond is the bond's Maturity Value, which the investing scenario is paid on the horizon.
	Bond *bonds.Amount
	// Cash is the money held at zero return on the horizon.
	Cash decimal.Decimal
	// OutstandingBalance is what is still owed on the horizon.
	OutstandingBalance decimal.Decimal
	// NetWorth is the bond's net Maturity Value and Cash, less the OutstandingBalance.
	NetWorth decimal.Decimal
}

// CashFlow is what a scenario pays and receives on one date, in reais.
type CashFlow struct {
	Date time.Time
	// Installment is the one due that day, nil when none is.
	Installment *mortgage.Installment
	// Invested is what the bond cost.
	Invested decimal.Decimal
	// Coupon is the bond's coupon paid that day, nil when none is.
	Coupon *bonds.Amount
	// Prepaid is what the scenario's own prepayments that day took off the outstanding balance.
	Prepaid decimal.Decimal
	// Held is the cash set aside that day, including any uninvested remainder.
	Held decimal.Decimal
	// Redeemed is the bond's Maturity Value, on the horizon.
	Redeemed *bonds.Amount
	// OutstandingBalance is what is owed once the day's flows are done.
	OutstandingBalance decimal.Decimal
}

var (
	zero = decimal.Decimal{}.RoundCents()
	// smallestFraction is the smallest quantity of a bond Tesouro Direto sells.
	smallestFraction = func() decimal.Decimal {
		fraction, err := decimal.Parse("0.01")
		if err != nil {
			panic(err)
		}

		return fraction
	}()
)

// Decide returns a verdict for every bond on offer that follows the mortgage's indexer (ADR-0007)
// and matures after the decision's date, in the order of the quotes. today is the day installments
// start being corrected by projected values after.
func Decide(m Mortgage, market Market, d Decision, today time.Time) ([]Verdict, error) {
	var verdicts []Verdict

	for _, q := range market.Quotes {
		if q.Buy == nil || !q.Bond.Maturity.After(d.Date) || !follows(q.Bond.Type, m.Terms.Indexer) {
			continue
		}

		c := comparer{mortgage: m, market: market, decision: d, today: today, bond: q.Bond}

		v, err := c.verdict(q.Buy.Rate)
		if err != nil {
			return nil, fmt.Errorf("comparison: %s maturing on %s: %w", q.Bond.Type, q.Bond.Maturity.Format(time.DateOnly), err)
		}

		verdicts = append(verdicts, v)
	}

	return verdicts, nil
}

// follows reports whether a bond of type t follows a mortgage's indexer: the IPCA+ bonds an IPCA
// mortgage, and the fixed-rate bonds any other.
func follows(t bonds.Type, indexer mortgage.Indexer) bool {
	if indexer == mortgage.IPCA {
		return t == bonds.NTNBPrincipal || t == bonds.NTNB
	}

	return t == bonds.LTN || t == bonds.NTNF
}

// comparer builds the verdict on one bond.
type comparer struct {
	mortgage Mortgage
	market   Market
	decision Decision
	today    time.Time
	bond     bonds.Bond
}

func (c comparer) verdict(rate decimal.Decimal) (Verdict, error) {
	v := Verdict{Bond: c.bond, Rate: rate, Indexes: c.indexes()}

	price, priceBy, err := c.bond.PriceOn(rate, c.decision.Date, c.market.IPCA)
	if err != nil {
		return unavailable(v, err)
	}

	v.UnitPrice = price
	v.Quantity = c.decision.Amount.Quo(price).TruncateQuantity()
	v.ProjectedBy = projectedBy(nil, priceBy)

	if v.Quantity.Cmp(smallestFraction) < 0 {
		v.Unavailable = AmountTooSmall

		return v, nil
	}

	lot := bonds.Lot{Bond: c.bond, PurchaseDate: c.decision.Date, Rate: rate, UnitPrice: price, Quantity: v.Quantity}

	valuation, err := lot.Value(c.decision.Date, c.market.Taxes, c.market.IPCA, nil)
	if err != nil {
		return unavailable(v, err)
	}

	cost := price.Mul(v.Quantity).RoundCents()
	statusQuo := c.plan(zero, nil, nil)

	v.Prepay = c.scenario(statusQuo, c.decision.Amount, zero, zero, nil, nil)
	v.Invest = c.scenario(statusQuo, zero, cost, c.decision.Amount.Sub(cost), valuation.Coupons, &valuation.Maturity)
	v.Advantage = v.Invest.NetWorth.Sub(v.Prepay.NetWorth)
	v.AvoidedCost = statusQuo.Balance.Sub(v.Prepay.OutstandingBalance).Add(v.Prepay.Cash).Sub(c.decision.Amount)

	methods := [][]indexes.ProjectionMethod{priceBy, valuation.Maturity.ProjectedBy}
	for _, coupon := range valuation.Coupons {
		methods = append(methods, coupon.ProjectedBy)
	}

	v.ProjectedBy = projectedBy(statusQuo.Installments, methods...)

	return v, nil
}

// unavailable returns v marked as missing the IPCA when err says so, and err otherwise.
func unavailable(v Verdict, err error) (Verdict, error) {
	if !errors.Is(err, bonds.ErrMissingIPCANumber) {
		return Verdict{}, err
	}

	v.Unavailable = MissingIPCA

	return v, nil
}

// indexes returns the indexes the verdict reads: those the mortgage's indexer corrects by, and the
// IPCA and its index numbers that an NTN-B Principal's or NTN-B's VNA follows.
func (c comparer) indexes() []indexes.Index {
	read := c.mortgage.Terms.Indexer.Indexes()
	if c.bond.Type == bonds.NTNBPrincipal || c.bond.Type == bonds.NTNB {
		read = append(read, indexes.IPCA, indexes.IPCANumber)
	}

	var out []indexes.Index

	for _, index := range indexes.All() {
		if slices.Contains(read, index) {
			out = append(out, index)
		}
	}

	return out
}

// plan replays the mortgage from the decision's date to the horizon with prepaid prepaid on the
// date, prepayments on theirs, and every installment topped up by topUp.
func (c comparer) plan(prepaid decimal.Decimal, prepayments []mortgage.Prepayment, topUp func(mortgage.Installment) decimal.Decimal) mortgage.Planned {
	m := c.mortgage

	return m.Terms.Plan(m.Outlook, m.Events, c.today, mortgage.Plan{
		Start:       c.decision.Date,
		Amount:      prepaid,
		Effect:      c.decision.Effect,
		Prepayments: prepayments,
		TopUp:       topUp,
		Until:       c.bond.Maturity,
	})
}

// scenario follows the decision's amount prepaid, invested in the bond, or held as cash on the
// decision's date. Each net coupon the bond pays is prepaid on its date. Each month it pays what
// the status quo would, prepaying what its own installment leaves of it, and holding what nothing
// is owed for. The bond is redeemed on the horizon.
func (c comparer) scenario(statusQuo mortgage.Planned, prepaid, invested, cash decimal.Decimal, coupons []bonds.CouponPayment, redeemed *bonds.Amount) Scenario {
	outflow := make(map[int]decimal.Decimal)

	for _, i := range statusQuo.Installments {
		if i.DueDate.After(c.decision.Date) {
			outflow[i.Number] = i.Amount
		}
	}

	prepayments := make([]mortgage.Prepayment, 0, len(coupons))
	for _, coupon := range coupons {
		prepayments = append(prepayments, mortgage.Prepayment{Date: coupon.Date, Amount: coupon.Net})
	}

	freed := make(map[int]decimal.Decimal)
	planned := c.plan(prepaid, prepayments, func(i mortgage.Installment) decimal.Decimal {
		freed[i.Number] = outflow[i.Number].Sub(i.Amount)

		return freed[i.Number]
	})

	s := Scenario{Bond: redeemed}
	byDate := make(map[time.Time]int)
	on := func(date time.Time) *CashFlow {
		if i, ok := byDate[date]; ok {
			return &s.CashFlows[i]
		}

		byDate[date] = len(s.CashFlows)
		s.CashFlows = append(s.CashFlows, CashFlow{Date: date, Invested: zero, Prepaid: zero, Held: zero})

		return &s.CashFlows[len(s.CashFlows)-1]
	}
	hold := func(f *CashFlow, held decimal.Decimal) {
		f.Held = f.Held.Add(held)
		s.Cash = s.Cash.Add(held)
	}

	start := on(c.decision.Date)
	start.Invested, start.Prepaid, start.OutstandingBalance = invested, planned.Initial, planned.AtStart
	hold(start, cash.Add(prepaid.Sub(planned.Initial)))

	// A coupon on a due date is prepaid before that day's top-up, so the installment's balance is
	// the day's last.
	for n, coupon := range coupons {
		took := planned.Prepayments[n]
		f := on(coupon.Date)
		f.Coupon, f.Prepaid, f.OutstandingBalance = &coupon.Amount, f.Prepaid.Add(took.Prepaid), took.OutstandingBalance
		hold(f, coupon.Net.Sub(took.Prepaid))
	}

	charged := make(map[int]bool)

	for _, i := range planned.Installments {
		if !i.DueDate.After(c.decision.Date) {
			continue
		}

		charged[i.Number] = true
		f := on(i.DueDate)
		f.Installment, f.Prepaid, f.OutstandingBalance = &i.Installment, f.Prepaid.Add(i.TopUp), i.BalanceOnDueDay
		hold(f, freed[i.Number].Sub(i.TopUp))
	}

	for _, i := range statusQuo.Installments {
		if !i.DueDate.After(c.decision.Date) || charged[i.Number] {
			continue
		}

		f := on(i.DueDate)
		f.OutstandingBalance = planned.Balance
		hold(f, i.Amount)
	}

	horizon := on(c.bond.Maturity)
	horizon.Redeemed, horizon.OutstandingBalance = redeemed, planned.Balance

	slices.SortStableFunc(s.CashFlows, func(a, b CashFlow) int { return a.Date.Compare(b.Date) })

	s.OutstandingBalance = planned.Balance
	s.NetWorth = s.Cash.Sub(planned.Balance)

	if redeemed != nil {
		s.NetWorth = s.NetWorth.Add(redeemed.Net)
	}

	return s
}

// projectedBy returns the projection methods of the index values that corrected the installments
// up to the horizon and of methods, those of the bond's price and payments, each index once, in
// the order of indexes.All. The status quo's installments are those every scenario's balance is
// built on.
func projectedBy(installments []mortgage.PlannedInstallment, methods ...[]indexes.ProjectionMethod) []indexes.ProjectionMethod {
	byIndex := make(map[indexes.Index]indexes.ProjectionMethod)

	note := func(methods []indexes.ProjectionMethod) {
		for _, m := range methods {
			byIndex[m.Index] = m
		}
	}

	for _, m := range methods {
		note(m)
	}

	for _, i := range installments {
		for _, v := range i.IndexValues {
			note(v.Methods)
		}
	}

	var out []indexes.ProjectionMethod

	for _, index := range indexes.All() {
		if m, ok := byIndex[index]; ok {
			out = append(out, m)
		}
	}

	return out
}
