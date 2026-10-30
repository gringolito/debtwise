package mortgage

import (
	"time"

	"github.com/gringolito/debtwise/backend/decimal"
	"github.com/gringolito/debtwise/backend/indexes"
)

// Indexes returns the indexes a correction by i reads.
func (i Indexer) Indexes() []indexes.Index {
	switch i {
	case TR:
		return []indexes.Index{indexes.TR}
	case PoupancaYield:
		return []indexes.Index{indexes.TR, indexes.SelicTarget}
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

// corrections finds the index values that correct the outstanding balance, one on each monthly
// anniversary of the contract, for the month that ends there. Months run from one anniversary to
// the same day of the next month, or to the 1st of the month after when the next month is too
// short, as SGS dates TR and the poupança yield; from then on the anniversaries fall on the 1st.
// A month is corrected by its TR, its poupança yield, or, under a fixed two-month lag, the IPCA of
// the second calendar month before its anniversary. Each value is read through the Outlook: the
// published one where there is one, else the projected one (ADR-0009).
type corrections struct {
	indexer Indexer
	outlook indexes.Outlook
	// month is the next month to correct for.
	month period
}

// newCorrections starts at the first month after both the first anniversary and the first
// installment: the first installment is never corrected, and the first anniversary's month is
// corrected by no installment.
func newCorrections(terms Terms, outlook indexes.Outlook) *corrections {
	month := period{monthAfter(terms.ContractDate), monthAfter(monthAfter(terms.ContractDate))}
	for !month.end.After(terms.FirstInstallmentDate) {
		month = period{month.end, monthAfter(month.end)}
	}

	return &corrections{indexer: terms.Indexer, outlook: outlook, month: month}
}

// through returns the index values of the anniversaries on or before day that it has not returned
// yet, in order. With publishedOnly, as for an installment due by today, a projected value is
// missing; otherwise it is returned with its methods. A mortgage without an indexer has none.
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

// value returns the index value that corrects the balance for month, or false when the indexer
// corrects nothing.
func (c *corrections) value(month period, publishedOnly bool) (IndexValue, bool) {
	var (
		estimate indexes.Estimate
		found    bool
	)

	value := IndexValue{PeriodStart: month.start, PeriodEnd: month.end}

	switch c.indexer {
	case TR:
		value.Index = indexes.TR
		estimate, found = c.outlook.TR(month.start, month.end)
	case PoupancaYield:
		value.Index = indexes.PoupancaYield
		estimate, found = c.outlook.PoupancaYield(month.start, month.end)
	case IPCA:
		value.Index = indexes.IPCA
		first := time.Date(month.end.Year(), month.end.Month()-2, 1, 0, 0, 0, 0, time.UTC)
		value.PeriodStart, value.PeriodEnd = first, first
		estimate, found = c.outlook.IPCA(first)
	default:
		return IndexValue{}, false
	}

	if !found || (publishedOnly && estimate.Projected()) {
		value.Missing = true

		return value, true
	}

	value.Value, value.Methods = estimate.Value, estimate.Methods

	return value, true
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
