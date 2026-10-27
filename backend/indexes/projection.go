package indexes

import (
	"errors"
	"time"

	"github.com/gringolito/debtwise/backend/decimal"
)

// Method is how an index is projected past its published values (ADR-0009).
type Method string

const (
	// Trailing12 projects an index by the average of its latest 12 monthly published values.
	Trailing12 Method = "trailing_12"
	// Trailing60 projects an index by the average of its latest 60 monthly published values.
	Trailing60 Method = "trailing_60"
	// Focus projects an index by the median expectations of BCB's Focus survey.
	Focus Method = "focus"
)

// ErrMethodNotOffered is returned for a method an index can't be projected by.
var ErrMethodNotOffered = errors.New("indexes: projection method not offered for the index")

// Projected returns the indexes the owner chooses a projection method for, in the order of All.
// The poupança yield is projected too, but derived from the projections of TR and the Selic target.
func Projected() []Index {
	return []Index{TR, SelicTarget, IPCA}
}

// Methods returns the methods index can be projected by, its default first, or none for an index
// the owner doesn't choose a method for.
func Methods(index Index) []Method {
	switch index {
	case TR:
		return []Method{Trailing12, Trailing60}
	case SelicTarget, IPCA:
		return []Method{Focus, Trailing12, Trailing60}
	default:
		return nil
	}
}

// ProjectionMethod is the method one index is projected by.
type ProjectionMethod struct {
	Index  Index
	Method Method
}

// Estimate is an index value for a period, in the index's unit, published or projected.
type Estimate struct {
	Value decimal.Decimal
	// Methods are the methods of the projected indexes the value comes from, in the order of All.
	// They are empty when the value comes from published values only.
	Methods []ProjectionMethod
}

// Projected reports whether any index the estimate comes from was projected.
func (e Estimate) Projected() bool {
	return len(e.Methods) > 0
}

// PathValue is the estimate of an index for one period of its projected path.
type PathValue struct {
	PeriodStart time.Time
	PeriodEnd   time.Time
	Estimate
}

// Expectations are the median expectations of the latest Focus surveys DebtWise fetched.
type Expectations struct {
	Selic       []MeetingMedian
	MonthlyIPCA []MonthMedian
	AnnualIPCA  []YearMedian
}

// MeetingMedian is the median expectation, in percent a year, for the Selic target the Copom sets at
// meeting Number of Year: Focus's "R{Number}/{Year}".
type MeetingMedian struct {
	Year   int
	Number int
	Median decimal.Decimal
}

// MonthMedian is the median expectation for the IPCA of a month, in percent in the month. Month is
// its first day.
type MonthMedian struct {
	Month  time.Time
	Median decimal.Decimal
}

// YearMedian is the median expectation for the IPCA of a calendar year, in percent in the year.
type YearMedian struct {
	Year   int
	Median decimal.Decimal
}

// ExpectationsRefreshTimes are when the Focus expectations were last refreshed successfully, zero
// when they never were, and when their latest refresh failed, zero when that refresh succeeded.
type ExpectationsRefreshTimes struct {
	RefreshedAt time.Time
	FailedAt    time.Time
}
