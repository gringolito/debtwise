package mortgage

import (
	"time"

	"github.com/gringolito/debtwise/backend/decimal"
	"github.com/gringolito/debtwise/backend/indexes"
)

// History is the published values of each index, as indexes.Store's History returns them.
type History map[indexes.Index][]indexes.Value

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
// and the period it was published for. When Missing, no value was available for the period and the
// balance was not corrected by it.
type IndexValue struct {
	Index       indexes.Index
	PeriodStart time.Time
	PeriodEnd   time.Time
	Value       decimal.Decimal
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
// the second calendar month before its anniversary.
type corrections struct {
	indexer Indexer
	// month is the next month to correct for.
	month       period
	tr          map[period]decimal.Decimal
	selicTarget map[time.Time]decimal.Decimal
	ipca        map[time.Time]decimal.Decimal
}

func newCorrections(terms Terms, history History) *corrections {
	c := &corrections{
		indexer:     terms.Indexer,
		month:       period{terms.ContractDate, monthAfter(terms.ContractDate)},
		tr:          map[period]decimal.Decimal{},
		selicTarget: map[time.Time]decimal.Decimal{},
		ipca:        map[time.Time]decimal.Decimal{},
	}

	for _, v := range history[indexes.TR] {
		c.tr[period{v.PeriodStart, v.PeriodEnd}] = v.Value
	}

	for _, v := range history[indexes.SelicTarget] {
		c.selicTarget[v.PeriodStart] = v.Value
	}

	for _, v := range history[indexes.IPCA] {
		c.ipca[v.PeriodStart] = v.Value
	}

	return c
}

// through returns the index values of the anniversaries on or before day that it has not returned
// yet, in order. A mortgage without an indexer has none.
func (c *corrections) through(day time.Time) []IndexValue {
	var values []IndexValue

	for ; !c.month.end.After(day); c.month = (period{c.month.end, monthAfter(c.month.end)}) {
		value, ok := c.value(c.month)
		if !ok {
			return nil
		}

		values = append(values, value)
	}

	return values
}

// value returns the index value that corrects the balance for month, or false when the indexer
// corrects nothing.
func (c *corrections) value(month period) (IndexValue, bool) {
	switch c.indexer {
	case TR:
		tr, ok := c.tr[month]

		return IndexValue{Index: indexes.TR, PeriodStart: month.start, PeriodEnd: month.end, Value: tr, Missing: !ok}, true
	case PoupancaYield:
		tr, trOK := c.tr[month]
		selicTarget, selicOK := c.selicTarget[month.start]

		value := IndexValue{Index: indexes.PoupancaYield, PeriodStart: month.start, PeriodEnd: month.end}
		if !trOK || !selicOK {
			value.Missing = true

			return value, true
		}

		value.Value = indexes.DerivePoupancaYield(tr, selicTarget)

		return value, true
	case IPCA:
		first := time.Date(month.end.Year(), month.end.Month()-2, 1, 0, 0, 0, 0, time.UTC)
		ipca, ok := c.ipca[first]

		return IndexValue{Index: indexes.IPCA, PeriodStart: first, PeriodEnd: first, Value: ipca, Missing: !ok}, true
	default:
		return IndexValue{}, false
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
