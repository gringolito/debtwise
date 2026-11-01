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

const (
	// NoMarketValue is an early sale check on a lot whose bond Tesouro Direto quotes no sell price
	// for.
	NoMarketValue Unavailable = "no_market_value"
	// Matured is an early sale check on a lot whose bond has matured.
	Matured Unavailable = "matured"
)

// EarlySaleCheck compares selling Lot today at its Market Value and prepaying the proceeds with
// holding it to the horizon, its bond's maturity, and prepaying each coupon it still pays on its
// date. Unless it is Unavailable, it sells the lot at SellPrice.
type EarlySaleCheck struct {
	Lot bonds.Lot
	// SellPrice is the price Tesouro Direto buys the lot's bond back at, nil when it quotes none.
	SellPrice   *bonds.Price
	Unavailable Unavailable
	// MarketValue is what selling the lot today pays, which the selling scenario prepays.
	MarketValue bonds.Amount
	// Advantage is the holding scenario's net worth on the horizon less the selling one's.
	Advantage decimal.Decimal
	Hold      Scenario
	Sell      Scenario
	// ProjectedBy names the projection method of each index a projected value of the check comes
	// from, in the order of indexes.All.
	ProjectedBy []indexes.ProjectionMethod
	// Indexes are the indexes the check reads, in the order of indexes.All.
	Indexes []indexes.Index
}

// Sells reports whether selling the lot today beats holding it: the advantage of holding is
// negative.
func (c EarlySaleCheck) Sells() bool {
	return c.Unavailable == "" && c.Advantage.Cmp(zero) < 0
}

// CheckEarlySales returns an early sale check for every lot, each sold on today at the sell price
// of its bond's quote, and the proceeds prepaid with effect. The checks are ranked by advantage,
// lowest first, so the lots selling favours most lead; those unavailable follow in the order of
// lots.
func CheckEarlySales(m Mortgage, market Market, lots []bonds.Lot, effect mortgage.PrepaymentEffect, today time.Time) ([]EarlySaleCheck, error) {
	sells := make(map[bonds.Bond]bonds.Price, len(market.Quotes))
	for _, q := range market.Quotes {
		sells[q.Bond] = q.Sell
	}

	checks := make([]EarlySaleCheck, 0, len(lots))

	for _, l := range lots {
		var sell *bonds.Price
		if p, ok := sells[l.Bond]; ok {
			sell = &p
		}

		c := comparer{mortgage: m, market: market, decision: Decision{Date: today, Effect: effect}, today: today, bond: l.Bond}

		check, err := c.earlySale(l, sell)
		if err != nil {
			return nil, fmt.Errorf("comparison: early sale of lot %d: %w", l.ID, err)
		}

		checks = append(checks, check)
	}

	slices.SortStableFunc(checks, func(a, b EarlySaleCheck) int {
		switch {
		case a.Unavailable != "" || b.Unavailable != "":
			return rank(a.Unavailable) - rank(b.Unavailable)
		default:
			return a.Advantage.Cmp(b.Advantage)
		}
	})

	return checks, nil
}

// rank orders a check that has scenarios before one that is unavailable.
func rank(u Unavailable) int {
	if u == "" {
		return 0
	}

	return 1
}

// earlySale checks selling l on the decision's date at sell against holding it to maturity.
func (c comparer) earlySale(l bonds.Lot, sell *bonds.Price) (EarlySaleCheck, error) {
	check := EarlySaleCheck{Lot: l, SellPrice: sell, Indexes: c.indexes()}

	if !l.Bond.Maturity.After(c.decision.Date) {
		check.Unavailable = Matured

		return check, nil
	}

	valuation, err := l.Value(c.decision.Date, c.market.Taxes, c.market.IPCA, sell)

	switch {
	case errors.Is(err, bonds.ErrMissingIPCANumber):
		check.Unavailable = MissingIPCA

		return check, nil
	case err != nil:
		return EarlySaleCheck{}, err
	case valuation.Market == nil:
		check.Unavailable = NoMarketValue

		return check, nil
	}

	check.MarketValue = *valuation.Market
	c.decision.Amount = check.MarketValue.Net

	methods := [][]indexes.ProjectionMethod{check.MarketValue.ProjectedBy, valuation.Maturity.ProjectedBy}

	var coupons []bonds.CouponPayment

	for _, coupon := range valuation.Coupons {
		if coupon.Date.After(c.decision.Date) {
			coupons = append(coupons, coupon)
			methods = append(methods, coupon.ProjectedBy)
		}
	}

	statusQuo := c.plan(zero, nil, nil)
	check.Hold = c.scenario(statusQuo, zero, zero, zero, nil, coupons, &valuation.Maturity)
	check.Sell = c.scenario(statusQuo, c.decision.Amount, zero, zero, valuation.Market, nil, nil)
	check.Advantage = check.Hold.NetWorth.Sub(check.Sell.NetWorth)
	check.ProjectedBy = projectedBy(statusQuo.Installments, methods...)

	return check, nil
}
