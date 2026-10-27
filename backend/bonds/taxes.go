package bonds

import (
	"slices"
	"time"

	"github.com/gringolito/debtwise/backend/decimal"
)

// incomeTaxRate returns the income tax rate on the gain of an event on date, daysHeld days after
// the purchase settled: of the rows in effect by then, the latest of each MinDays, the one with the
// most MinDays that daysHeld reaches. It is zero when no row does.
func (t Taxes) incomeTaxRate(date time.Time, daysHeld int) decimal.Decimal {
	var (
		best  IncomeTaxRate
		found bool
	)

	for _, row := range t.IncomeTax {
		if row.EffectiveFrom.After(date) || row.MinDays > daysHeld {
			continue
		}

		if !found || row.MinDays > best.MinDays ||
			(row.MinDays == best.MinDays && row.EffectiveFrom.After(best.EffectiveFrom)) {
			best, found = row, true
		}
	}

	return best.Rate
}

// iofRate returns the IOF rate on the gain of an event on date, daysHeld days after the purchase
// settled: that of the latest row in effect by then for exactly that many days. It is zero when
// there is none.
func (t Taxes) iofRate(date time.Time, daysHeld int) decimal.Decimal {
	var (
		best  IOFRate
		found bool
	)

	for _, row := range t.IOF {
		if row.EffectiveFrom.After(date) || row.Days != daysHeld {
			continue
		}

		if !found || row.EffectiveFrom.After(best.EffectiveFrom) {
			best, found = row, true
		}
	}

	return best.Rate
}

// custodyFee returns the custody fee accrued on base on each calendar day after from, through the
// day through: the yearly rate in effect that day over 365, rounded to cents once at the end. A day
// before the first row has no fee.
func (t Taxes) custodyFee(base decimal.Decimal, from, through time.Time) decimal.Decimal {
	rows := slices.SortedStableFunc(slices.Values(t.CustodyFee), func(a, b CustodyFeeRate) int {
		return a.EffectiveFrom.Compare(b.EffectiveFrom)
	})

	first, end := from.AddDate(0, 0, 1), through.AddDate(0, 0, 1)

	var yearlyDays decimal.Decimal

	for i, row := range rows {
		start, stop := row.EffectiveFrom, end
		if i+1 < len(rows) && rows[i+1].EffectiveFrom.Before(stop) {
			stop = rows[i+1].EffectiveFrom
		}

		if start.Before(first) {
			start = first
		}

		if days := calendarDays(start, stop); days > 0 {
			yearlyDays = yearlyDays.Add(row.Rate.Mul(decimal.FromInt(days)))
		}
	}

	return base.Mul(yearlyDays).Quo(daysInYear).RoundCents()
}
