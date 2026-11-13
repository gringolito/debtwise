package comparison

import (
	"time"

	"github.com/gringolito/debtwise/backend/decimal"
)

// nearTieShare is the fraction of the decision's amount an Advantage must stay below for the
// verdict to be a near tie.
var nearTieShare = decimal.MustParse("0.01")

// yardstick measures advantage against the decision's amount: its share of it without the sign,
// rounded to 4 places, and whether it is a near tie. A near tie is judged on the exact figures,
// not on the rounded share.
func yardstick(advantage, amount decimal.Decimal) (share decimal.Decimal, nearTie bool) {
	size := advantage.Abs()

	return size.Quo(amount).RoundShare(), size.Cmp(amount.Mul(nearTieShare)) < 0
}

// wholeMonths counts the calendar months from one date to another, a month counting only once its
// day of month is reached.
func wholeMonths(from, to time.Time) int {
	fromYear, fromMonth, fromDay := from.Date()
	toYear, toMonth, toDay := to.Date()

	months := (toYear-fromYear)*12 + int(toMonth) - int(fromMonth)
	if toDay < fromDay {
		months--
	}

	return months
}
