package bonds

import (
	"errors"
	"fmt"
	"time"

	"github.com/gringolito/debtwise/backend/decimal"
)

// IPCANumbers are IBGE's IPCA index numbers by month, as SIDRA publishes them (table 1737, variable
// 2266). Each key is the first day of its month at midnight UTC.
type IPCANumbers map[time.Time]decimal.Decimal

// ErrMissingIPCANumber is returned when a VNA needs an IPCA index number IPCANumbers doesn't have,
// such as the number of a month IBGE hasn't published yet.
var ErrMissingIPCANumber = errors.New("bonds: missing IPCA index number")

var (
	// vnaBase is the VNA on its base date, 2000-07-15, by definition.
	vnaBase = decimal.FromInt(1000)
	// baseMonth is the month whose index number every VNA is relative to.
	baseMonth = firstOfMonth(2000, time.June)
	// baseDate is the first 15th with a VNA.
	baseDate = time.Date(2000, time.July, 15, 0, 0, 0, 0, time.UTC)
)

// VNA is the NTN-B's updated nominal value (VNA) on fifteenth, a 15th at midnight UTC: R$ 1,000 on
// the base date, 2000-07-15, moved on each 15th by the ratio of the previous month's IPCA index
// number to June 2000's, truncated at 6 places.
func VNA(fifteenth time.Time, numbers IPCANumbers) (decimal.Decimal, error) {
	if fifteenth.Day() != 15 || fifteenth.Before(baseDate) {
		return decimal.Decimal{}, fmt.Errorf("bonds: %s is not a 15th on or after %s, so it has no VNA",
			fifteenth.Format(time.DateOnly), baseDate.Format(time.DateOnly))
	}

	previous, err := numbers.of(firstOfMonth(fifteenth.Year(), fifteenth.Month()-1))
	if err != nil {
		return decimal.Decimal{}, err
	}

	base, err := numbers.of(baseMonth)
	if err != nil {
		return decimal.Decimal{}, err
	}

	return vnaBase.Mul(previous.Quo(base).TruncateIndexRatio()).TruncateVNA(), nil
}

// ProjectedVNA is the VNA on settlement, between 15ths: the VNA of the last 15th on or before
// settlement times (1 + projectedIPCA)^(calendar days since that 15th / calendar days between it
// and the next 15th), the exponent and the factor truncated at 14 places and the result at 6.
// projectedIPCA is a fraction, 0.0046 for 0.46%: the IPCA projected for the month of that 15th,
// whose index number isn't known yet. It is used as given.
func ProjectedVNA(settlement time.Time, numbers IPCANumbers, projectedIPCA decimal.Decimal) (decimal.Decimal, error) {
	year, month, day := settlement.Date()

	last := time.Date(year, month, 15, 0, 0, 0, 0, time.UTC)
	if day < 15 {
		last = last.AddDate(0, -1, 0)
	}

	vna, err := VNA(last, numbers)
	if err != nil {
		return decimal.Decimal{}, err
	}

	elapsed := calendarDays(last, time.Date(year, month, day, 0, 0, 0, 0, time.UTC))
	period := calendarDays(last, last.AddDate(0, 1, 0))
	exponent := decimal.FromInt(elapsed).Quo(decimal.FromInt(period)).TruncateExponent()
	factor := one.Add(projectedIPCA).Pow(exponent).TruncateFactor()

	return vna.Mul(factor).TruncateVNA(), nil
}

func (n IPCANumbers) of(month time.Time) (decimal.Decimal, error) {
	number, ok := n[month]
	if !ok {
		return decimal.Decimal{}, fmt.Errorf("%w for %s", ErrMissingIPCANumber, month.Format("2006-01"))
	}

	return number, nil
}

func firstOfMonth(year int, month time.Month) time.Time {
	return time.Date(year, month, 1, 0, 0, 0, 0, time.UTC)
}

// calendarDays counts the days from start, inclusive, to end, exclusive, both at midnight UTC.
func calendarDays(start, end time.Time) int64 {
	return int64(end.Sub(start) / (24 * time.Hour))
}
