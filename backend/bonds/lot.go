package bonds

import (
	"errors"
	"time"

	"github.com/gringolito/debtwise/backend/decimal"
	"github.com/gringolito/debtwise/backend/indexes"
)

// ErrLotNotFound is returned for a lot ID that no recorded lot has.
var ErrLotNotFound = errors.New("bonds: no such lot")

// Lot is one purchase of a bond, settled on PurchaseDate, at a contracted yearly effective Rate (a
// real rate over IPCA for an NTN-B Principal or NTN-B), UnitPrice in reais per bond, and a
// Quantity of bonds, which can be fractional.
type Lot struct {
	ID           int64
	Bond         Bond
	PurchaseDate time.Time
	Rate         decimal.Decimal
	UnitPrice    decimal.Decimal
	Quantity     decimal.Decimal
}

// Violation is a rule a lot breaks. Field names the field it concerns in the snake_case the API
// uses, such as "purchase_date".
type Violation struct {
	Field string
	Rule  Rule
}

// Rule is a rule of a lot that a value can break, named by a code a client can match.
type Rule string

// The rules of a lot.
const (
	RuleNotAfterPurchase Rule = "not_after_purchase"
	RuleNotMaturityDay   Rule = "not_maturity_day"
	RuleAfterToday       Rule = "after_today"
	RuleNotPositive      Rule = "not_positive"
)

// Rules returns every rule, in the order the API documents them.
func Rules() []Rule {
	return []Rule{RuleNotAfterPurchase, RuleNotMaturityDay, RuleAfterToday, RuleNotPositive}
}

// Reason says what the rule asks, in English, for API consumers.
func (r Rule) Reason() string {
	switch r {
	case RuleNotAfterPurchase:
		return "must be after the purchase date"
	case RuleNotMaturityDay:
		return "must be a date Tesouro matures this type of bond on"
	case RuleAfterToday:
		return "must not be after today"
	case RuleNotPositive:
		return "must be greater than zero"
	default:
		return ""
	}
}

// Taxes are the income tax, IOF and custody fee tables, each row in effect from its date on.
type Taxes struct {
	IncomeTax  []IncomeTaxRate
	IOF        []IOFRate
	CustodyFee []CustodyFeeRate
}

// IncomeTaxRate is the income tax rate on the gain of an event at least MinDays calendar days after
// the purchase settled, from EffectiveFrom on.
type IncomeTaxRate struct {
	EffectiveFrom time.Time
	MinDays       int
	Rate          decimal.Decimal
}

// IOFRate is the IOF rate on the gain of an event Days calendar days after the purchase settled,
// from EffectiveFrom on.
type IOFRate struct {
	EffectiveFrom time.Time
	Days          int
	Rate          decimal.Decimal
}

// CustodyFeeRate is the yearly custody fee rate, from EffectiveFrom on.
type CustodyFeeRate struct {
	EffectiveFrom time.Time
	Rate          decimal.Decimal
}

// IPCAOutlook gives the IPCA, in percent, of the month starting on month, published or projected.
// indexes.Outlook satisfies it.
type IPCAOutlook interface {
	IPCA(month time.Time) (indexes.Estimate, bool)
}

// IPCA is what an NTN-B Principal's or NTN-B's VNA is computed from: IBGE's published index
// numbers, and the monthly IPCA that grows the latest of them past the months published.
type IPCA struct {
	Numbers IPCANumbers
	Outlook IPCAOutlook
}

// Amount is what a lot pays out in one case, in reais: Gross, the IOF, income tax and custody fee
// taken from it, and Net, what is left. ProjectedBy names the projection methods of the projected
// IPCA values it depends on, and is empty when it depends on published values only.
type Amount struct {
	Gross       decimal.Decimal
	IOF         decimal.Decimal
	IncomeTax   decimal.Decimal
	CustodyFee  decimal.Decimal
	Net         decimal.Decimal
	ProjectedBy []indexes.ProjectionMethod
}

// CouponPayment is one coupon a lot is paid before its bond matures, on Date.
type CouponPayment struct {
	Date time.Time
	Amount
}

// Valuation is a lot's worth on a date. Accrual is nil from the bond's maturity on; Market is nil
// then too, and when there is no sell price. Coupons are every coupon paid after the purchase and
// before maturity, past and future, in date order; the coupon paid at maturity is in Maturity.
type Valuation struct {
	On       time.Time
	Accrual  *Amount
	Market   *Amount
	Maturity Amount
	Coupons  []CouponPayment
}

// Validate returns every rule the lot breaks, in field order, on the day today. The bond's type,
// the rate's range and the precision of the unit price and quantity are the caller's to check.
func (l Lot) Validate(today time.Time) []Violation {
	var violations []Violation

	if !l.Bond.Maturity.After(l.PurchaseDate) {
		violations = append(violations, Violation{"maturity", RuleNotAfterPurchase})
	}

	if !maturesOnADayOf(l.Bond) {
		violations = append(violations, Violation{"maturity", RuleNotMaturityDay})
	}

	if l.PurchaseDate.After(today) {
		violations = append(violations, Violation{"purchase_date", RuleAfterToday})
	}

	if l.UnitPrice.Cmp(decimal.Decimal{}) <= 0 {
		violations = append(violations, Violation{"unit_price", RuleNotPositive})
	}

	if l.Quantity.Cmp(decimal.Decimal{}) <= 0 {
		violations = append(violations, Violation{"quantity", RuleNotPositive})
	}

	return violations
}

// maturesOnADayOf reports whether the maturity of bond is a date Tesouro matures that type of bond
// on; a bond of an unknown type does.
func maturesOnADayOf(bond Bond) bool {
	month, day := bond.Maturity.Month(), bond.Maturity.Day()

	switch bond.Type {
	case LTN:
		return day == 1
	case NTNF:
		return day == 1 && (month == time.January || month == time.July)
	case NTNBPrincipal, NTNB:
		return day == 15
	}

	return true
}
