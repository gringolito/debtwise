package mortgage

import (
	"slices"
	"time"

	"github.com/gringolito/debtwise/backend/decimal"
	"github.com/gringolito/debtwise/backend/indexes"
)

// Indexes returns the indexes the schedule of t reads: those its indexer corrects by, and the Selic
// target when a contract rate adds the poupança yield's additional part.
func (t Terms) Indexes() []indexes.Index {
	read := t.Indexer.indexes()
	if slices.ContainsFunc(t.ContractRates, func(r ContractRate) bool { return r.PoupancaAdditional }) {
		read = append(read, indexes.SelicTarget)
	}

	return read
}

// indexes returns the indexes a correction by i reads.
func (i Indexer) indexes() []indexes.Index {
	switch i {
	case TR:
		return []indexes.Index{indexes.TR}
	case IPCA:
		return []indexes.Index{indexes.IPCA}
	default:
		return nil
	}
}

// IndexValue is an index value, in percent, that corrected an installment's outstanding balance,
// and the period it is for. Methods are the projection methods the value comes from, and are empty
// for a published value. When Missing, no value was available for the period, or only a projected
// one for an installment that is due and is corrected by published values only, and the balance was
// not corrected by it.
type IndexValue struct {
	Index       indexes.Index
	PeriodStart time.Time
	PeriodEnd   time.Time
	Value       decimal.Decimal
	Methods     []indexes.ProjectionMethod
	Missing     bool
}

type period struct {
	start, end time.Time
}

// corrections finds the index values that correct a mortgage once a month, one for each month, on
// the due date of the installment they correct: an IPCA-indexed mortgage's outstanding balance,
// and a TR-indexed mortgage's appraisal value (ADR-0015). Months run from one day to the same day
// of the next month, or to the 1st of the month after when the next month is too short, as SGS
// dates TR; from then on they start on the 1st. TR months of installments due on another day than
// the contract's start on the first installment's due date. Other months start on the contract's
// first anniversary: TR months are corrected by their TR, and IPCA months, under a fixed two-month
// lag, by the IPCA of the second calendar month before they end. Each value is read through the
// Outlook: the published one where there is one, else the projected one (ADR-0009).
type corrections struct {
	indexer Indexer
	outlook indexes.Outlook
	// month is the next month to correct for.
	month period
}

// newCorrections starts at the first month that ends after both the first anniversary and the
// first installment: the first installment is never corrected, and the months up to the first
// anniversary are corrected by no installment.
func newCorrections(terms Terms, outlook indexes.Outlook) *corrections {
	firstAnniversary := monthAfter(terms.ContractDate)
	byDueDate := terms.Indexer == TR && terms.FirstInstallmentDate.Day() != terms.ContractDate.Day()

	start, after := firstAnniversary, terms.FirstInstallmentDate
	if byDueDate {
		start, after = terms.FirstInstallmentDate, firstAnniversary
	}

	month := period{start, monthAfter(start)}
	for !month.end.After(after) {
		month = period{month.end, monthAfter(month.end)}
	}

	return &corrections{
		indexer: terms.Indexer,
		outlook: outlook,
		month:   month,
	}
}

// through returns the index values of the months that end on or before day that it has not
// returned yet, in order. With publishedOnly, as for an installment due by today, a projected value
// is missing; otherwise it is returned with its methods. A mortgage without an indexer has none.
func (c *corrections) through(day time.Time, publishedOnly bool) []IndexValue {
	var values []IndexValue

	for ; !c.month.end.After(day); c.month = (period{c.month.end, monthAfter(c.month.end)}) {
		value, ok := c.value(c.month, publishedOnly)
		if !ok {
			return nil
		}

		values = append(values, value)
	}

	return values
}

// value returns the index value that corrects month, or false when the indexer corrects nothing.
func (c *corrections) value(month period, publishedOnly bool) (IndexValue, bool) {
	switch c.indexer {
	case TR:
		estimate, found := c.outlook.TR(month.start, month.end)

		return estimated(IndexValue{Index: indexes.TR, PeriodStart: month.start, PeriodEnd: month.end},
			estimate, found, publishedOnly), true
	case IPCA:
		first := time.Date(month.end.Year(), month.end.Month()-2, 1, 0, 0, 0, 0, time.UTC)
		estimate, found := c.outlook.IPCA(first)

		return estimated(IndexValue{Index: indexes.IPCA, PeriodStart: first, PeriodEnd: first},
			estimate, found, publishedOnly), true
	default:
		return IndexValue{}, false
	}
}

// updates finds the TR values that update a TR-indexed mortgage's outstanding balance pro rata
// die, from the last update, inclusive, to the date of the next one, exclusive: a prepayment's
// date or an installment's due date (ADR-0006). The first update starts on the contract date.
// An update reads the TR of the period that starts on the first due day on or after its start, and
// of each period after it that starts before its date. A period it covers whole applies its TR in
// full; otherwise the TR applies for the update's calendar days up to the period's end over 30.
// Periods start on the first due day on or after the contract date and run from one day to the
// same day of the next month, or to the 1st of the month after when the next month is too short, as
// SGS dates TR; from then on they start on the 1st. Each value is read through the Outlook: the
// published one where there is one, else the projected one (ADR-0009).
type updates struct {
	outlook indexes.Outlook
	// since is the date of the last update.
	since time.Time
	// month is the period the next update reads first, or one before it.
	month period
}

// trPart is the part of a TR value an update applies: all of it, or the update's days in its
// period over 30.
type trPart struct {
	value IndexValue
	days  int
	whole bool
}

func newUpdates(terms Terms, outlook indexes.Outlook) *updates {
	start := dueDayFrom(terms.ContractDate, terms.FirstInstallmentDate.Day())

	return &updates{
		outlook: outlook,
		since:   terms.ContractDate,
		month:   period{start, monthAfter(start)},
	}
}

// to returns the parts of the TR values that update the balance from the last update to day, in
// order, and makes day the last update. With publishedOnly, as for an update dated by today, a
// projected value is missing; otherwise it is returned with its methods.
func (u *updates) to(day time.Time, publishedOnly bool) []trPart {
	if !u.since.Before(day) {
		return nil
	}

	var parts []trPart

	for u.month.start.Before(u.since) {
		u.month = period{u.month.end, monthAfter(u.month.end)}
	}

	month := u.month

	for from := u.since; from.Before(day); from, month = month.end, (period{month.end, monthAfter(month.end)}) {
		end := month.end
		if day.Before(end) {
			end = day
		}

		estimate, found := u.outlook.TR(month.start, month.end)
		parts = append(parts, trPart{
			value: estimated(IndexValue{Index: indexes.TR, PeriodStart: month.start, PeriodEnd: month.end},
				estimate, found, publishedOnly),
			days:  days(from, end),
			whole: from.Equal(month.start) && end.Equal(month.end),
		})
	}

	u.since = day

	return parts
}

// of returns what the part updates amount by, in centavos: rounded for a whole period, and rounded
// down otherwise.
func (p trPart) of(amount decimal.Decimal) decimal.Decimal {
	update := amount.Mul(p.value.Value).Quo(decimal.FromInt(100))
	if p.whole {
		return update.RoundCents()
	}

	return update.Mul(decimal.FromInt(int64(p.days))).Quo(decimal.FromInt(30)).TruncateCents()
}

// estimated returns value with the estimate found for it, or marked missing when there is none, or
// only a projected one and publishedOnly.
func estimated(value IndexValue, estimate indexes.Estimate, found, publishedOnly bool) IndexValue {
	if !found || (publishedOnly && estimate.Projected()) {
		value.Missing = true

		return value
	}

	value.Value, value.Methods = estimate.Value, estimate.Methods

	return value
}

// dueDayFrom returns the first day on or after day that falls on dueDay of its month, or on the 1st
// of the month after a month too short for it.
func dueDayFrom(day time.Time, dueDay int) time.Time {
	for month := time.Date(day.Year(), day.Month(), 1, 0, 0, 0, 0, time.UTC); ; month = month.AddDate(0, 1, 0) {
		start := month.AddDate(0, 0, dueDay-1)
		if start.Month() != month.Month() {
			start = month.AddDate(0, 1, 0)
		}

		if !start.Before(day) {
			return start
		}
	}
}

// monthAfter returns the end of the month-long period SGS publishes TR for from start: the same day
// of the next month, or the first day of the month after it when the next month is too short.
func monthAfter(start time.Time) time.Time {
	next := time.Date(start.Year(), start.Month()+1, 1, 0, 0, 0, 0, time.UTC)
	if start.Day() > next.AddDate(0, 1, -1).Day() {
		return next.AddDate(0, 1, 0)
	}

	return next.AddDate(0, 0, start.Day()-1)
}
