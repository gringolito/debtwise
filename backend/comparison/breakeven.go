package comparison

import (
	"github.com/gringolito/debtwise/backend/decimal"
	"github.com/gringolito/debtwise/backend/mortgage"
)

// NoBreakEven says why no bond rate from 0% to 100% a year is a break-even rate.
type NoBreakEven string

const (
	// BelowRange is a verdict whose advantage favours investing even at 0% a year.
	BelowRange NoBreakEven = "below_range"
	// AboveRange is a verdict whose advantage favours prepaying even at 100% a year.
	AboveRange NoBreakEven = "above_range"
)

var (
	centavo = decimal.MustParse("0.01")
	half    = decimal.MustParse("0.5")
	// highestRate is the top of the rates the break-even search tries, 100% a year; the bottom is
	// 0%.
	highestRate = decimal.MustParse("1")
	// firstStep is how far from the buy rate the break-even search first looks, a percentage point.
	firstStep = decimal.MustParse("0.01")
	// rateStep is the closest two rates the break-even search tries are.
	rateStep = decimal.MustParse("0.0000000001")
)

// breakEven searches the rates from 0% to 100% a year, at 10 places, for one at which buying the
// bond with the decision's amount gives an advantage within a centavo of zero. Where the advantage
// jumps over zero instead, it returns the lowest rate at which the advantage is positive. from is
// the advantage at the buy rate, and prepay the scenario every advantage is measured against.
//
// A higher rate buys the bond cheaper, so the advantage grows with it: smoothly while the amount
// buys the same quantity, and in a jump where it buys one more hundredth, which is worth more on the
// horizon than the cash it takes. The search steps away from the buy rate until the advantage
// changes sign, then narrows the rates between.
func (c comparer) breakEven(statusQuo mortgage.Planned, prepay Scenario, from point) (decimal.Decimal, NoBreakEven, error) {
	s := search{comparer: c, statusQuo: statusQuo, prepay: prepay}

	b, end, err := s.bracket(from)
	if err != nil {
		return decimal.Decimal{}, "", err
	}

	if end == nil {
		if end, err = s.narrow(b); err != nil {
			return decimal.Decimal{}, "", err
		}
	}

	return end.rate, end.none, nil
}

// point is the advantage of buying the bond with the decision's amount at a rate, and the quantity
// the amount buys at it.
type point struct {
	rate, quantity, advantage decimal.Decimal
}

// evens reports whether p is a break-even: the amount buys at least a hundredth of the bond at
// p's rate, and the advantage is within a centavo of zero.
func (p point) evens() bool {
	return p.quantity.Cmp(smallestFraction) >= 0 &&
		p.advantage.Cmp(centavo) <= 0 && zero.Sub(p.advantage).Cmp(centavo) <= 0
}

// short reports whether p falls short of a break-even from below: its advantage is negative, or
// the amount buys no hundredth of the bond at p's rate, where a decision has no verdict.
func (p point) short() bool {
	return p.advantage.Cmp(zero) < 0 || p.quantity.Cmp(smallestFraction) < 0
}

// outcome is where a break-even search ends: at a rate, or with why there is none.
type outcome struct {
	rate decimal.Decimal
	none NoBreakEven
}

// search looks for a verdict's break-even rate.
type search struct {
	comparer

	statusQuo mortgage.Planned
	prepay    Scenario
}

// at returns the advantage of buying the bond at rate.
func (s search) at(rate decimal.Decimal) (point, error) {
	price, _, err := s.bond.PriceOn(rate, s.decision.Date, s.market.IPCA)
	if err != nil {
		return point{}, err
	}

	quantity := s.quantity(price)

	invest, _, err := s.invest(s.statusQuo, rate, price, quantity)
	if err != nil {
		return point{}, err
	}

	return point{rate: rate, quantity: quantity, advantage: invest.NetWorth.Sub(s.prepay.NetWorth)}, nil
}

// bracket steps from p, toward the rates where the advantage is closer to zero, doubling each step
// from a percentage point, until the advantage changes sign. It returns the rates on both sides of
// the change, or the outcome when a rate it tries evens or the search's bound is reached first.
func (s search) bracket(p point) (bracket, *outcome, error) {
	var err error

	switch {
	case p.rate.Cmp(zero) < 0:
		p, err = s.at(decimal.Decimal{})
	case p.rate.Cmp(highestRate) > 0:
		p, err = s.at(highestRate)
	}

	if err != nil {
		return bracket{}, nil, err
	}

	for step := firstStep; ; step = step.Add(step) {
		if p.evens() {
			return bracket{}, &outcome{rate: p.rate}, nil
		}

		rising := p.short()

		var next decimal.Decimal

		switch {
		case rising && p.rate.Cmp(highestRate) == 0:
			return bracket{}, &outcome{none: AboveRange}, nil
		case !rising && p.rate.Cmp(zero) == 0:
			return bracket{}, &outcome{none: BelowRange}, nil
		case rising:
			next = p.rate.Add(step)
			if next.Cmp(highestRate) > 0 {
				next = highestRate
			}
		default:
			next = p.rate.Sub(step)
			if next.Cmp(zero) < 0 {
				next = decimal.Decimal{}
			}
		}

		q, err := s.at(next)
		if err != nil {
			return bracket{}, nil, err
		}

		if q.evens() {
			return bracket{}, &outcome{rate: q.rate}, nil
		}

		switch {
		case rising && !q.short():
			return newBracket(p, q), nil, nil
		case !rising && q.short():
			return newBracket(q, p), nil, nil
		}

		p = q
	}
}

// narrow narrows b by regula falsi with the Illinois step, bisecting when that fails to halve it,
// until a rate evens or b is a single step wide, when its high end is the lowest rate at which the
// advantage is positive. Once a single hundredth's jump is left in b, it keeps to the side of the
// jump whose advantage crosses zero, if either does.
func (s search) narrow(b bracket) (*outcome, error) {
	for b.hi.rate.Sub(b.lo.rate).Cmp(rateStep) > 0 {
		if b.hi.quantity.Sub(b.lo.quantity).Cmp(smallestFraction) == 0 {
			side, end, err := s.acrossJump(b)
			if err != nil || end != nil {
				return end, err
			}

			b = side

			continue
		}

		p, err := s.at(b.next())
		if err != nil {
			return nil, err
		}

		if p.evens() {
			return &outcome{rate: p.rate}, nil
		}

		b.narrow(p)
	}

	return &outcome{rate: b.hi.rate}, nil
}

// acrossJump finds the rate at which b's high quantity is first bought, and returns the side of it
// whose advantage crosses zero. When a rate on either side of it evens, or the advantage jumps over
// zero at it, it returns the outcome instead: the jump's rate is then the lowest at which the
// advantage is positive.
func (s search) acrossJump(b bracket) (bracket, *outcome, error) {
	jump, err := s.jump(b)
	if err != nil {
		return bracket{}, nil, err
	}

	before, after := b.lo, b.hi

	if r := jump.Sub(rateStep); r.Cmp(b.lo.rate) > 0 {
		if before, err = s.at(r); err != nil {
			return bracket{}, nil, err
		}
	}

	if jump.Cmp(b.hi.rate) < 0 {
		if after, err = s.at(jump); err != nil {
			return bracket{}, nil, err
		}
	}

	switch {
	case before.evens():
		return bracket{}, &outcome{rate: before.rate}, nil
	case after.evens():
		return bracket{}, &outcome{rate: after.rate}, nil
	case !before.short():
		return newBracket(b.lo, before), nil, nil
	case after.short():
		return newBracket(after, b.hi), nil, nil
	default:
		return bracket{}, &outcome{rate: after.rate}, nil
	}
}

// jump returns the lowest rate above b's low end at which the decision's amount buys the quantity
// it buys at b's high end. Only the price is computed for each rate tried.
func (s search) jump(b bracket) (decimal.Decimal, error) {
	lo, hi := b.lo.rate, b.hi.rate

	for hi.Sub(lo).Cmp(rateStep) > 0 {
		rate := lo.Add(hi.Sub(lo).Mul(half)).TruncateBreakEvenRate()

		price, _, err := s.bond.PriceOn(rate, s.decision.Date, s.market.IPCA)
		if err != nil {
			return decimal.Decimal{}, err
		}

		if s.quantity(price).Cmp(b.hi.quantity) < 0 {
			lo = rate
		} else {
			hi = rate
		}
	}

	return hi, nil
}

// bracket holds the rates between a negative advantage, at lo, and a positive one, at hi, and how
// regula falsi with the Illinois step narrows them.
type bracket struct {
	lo, hi point
	// atLo and atHi are the advantages regula falsi interpolates between: lo's and hi's, halved
	// each time the other end is replaced twice in a row.
	atLo, atHi decimal.Decimal
	// replaced is -1 when lo was the last end replaced, and 1 when hi was.
	replaced int
	// bisect is set when the last step failed to halve the bracket.
	bisect bool
}

func newBracket(lo, hi point) bracket {
	return bracket{lo: lo, hi: hi, atLo: lo.advantage, atHi: hi.advantage}
}

// next returns the rate to try next, at 10 places and strictly between the ends.
func (b bracket) next() decimal.Decimal {
	width := b.hi.rate.Sub(b.lo.rate)
	if b.bisect {
		return b.lo.rate.Add(width.Mul(half)).TruncateBreakEvenRate()
	}

	rate := b.lo.rate.Add(width.Mul(b.atLo).Quo(b.atLo.Sub(b.atHi))).TruncateBreakEvenRate()

	switch {
	case rate.Cmp(b.lo.rate) <= 0:
		return b.lo.rate.Add(rateStep)
	case rate.Cmp(b.hi.rate) >= 0:
		return b.hi.rate.Sub(rateStep)
	default:
		return rate
	}
}

// narrow replaces the end on p's side of zero with p.
func (b *bracket) narrow(p point) {
	width := b.hi.rate.Sub(b.lo.rate)

	if p.short() {
		b.lo, b.atLo = p, p.advantage
		if b.replaced < 0 {
			b.atHi = b.atHi.Mul(half)
		}

		b.replaced = -1
	} else {
		b.hi, b.atHi = p, p.advantage
		if b.replaced > 0 {
			b.atLo = b.atLo.Mul(half)
		}

		b.replaced = 1
	}

	b.bisect = !b.bisect && b.hi.rate.Sub(b.lo.rate).Cmp(width.Mul(half)) > 0
}
