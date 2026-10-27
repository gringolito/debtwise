package indexes

import (
	"maps"
	"slices"
	"sort"
	"time"

	"github.com/gringolito/debtwise/backend/calendar"
	"github.com/gringolito/debtwise/backend/decimal"
)

// Outlook answers each index's value for a period: the published value while there is one, and
// past the published values the one projected by the index's method (ADR-0009). It reads no
// database, and its zero value has nothing published and nothing projected.
type Outlook struct {
	tr       map[period]decimal.Decimal
	selic    map[time.Time]decimal.Decimal
	ipca     map[time.Time]decimal.Decimal
	methods  map[Index]Method
	latest   map[Index]time.Time
	trailing map[Index]decimal.Decimal

	// selicSteps are the Focus Selic target medians by the day each takes effect, in that order.
	selicSteps []selicStep
	// monthlyIPCA holds the Focus median of each month, and annualIPCA the monthly equivalent of
	// each year's median, which holds for the years after annualIPCALast.
	monthlyIPCA    map[time.Time]decimal.Decimal
	annualIPCA     map[int]decimal.Decimal
	annualIPCALast int
}

// period is a published period, its days at midnight UTC.
type period struct {
	start, end time.Time
}

// selicStep is the Selic target a Focus median sets from the day it takes effect.
type selicStep struct {
	effective time.Time
	median    decimal.Decimal
}

// NewOutlook returns the Outlook over the published history of each index, the Focus
// expectations and the method each projected index is projected by. An index missing from methods
// is projected by its default.
func NewOutlook(history map[Index][]Value, expectations Expectations, methods []ProjectionMethod) Outlook {
	o := Outlook{
		tr:      make(map[period]decimal.Decimal),
		selic:   make(map[time.Time]decimal.Decimal),
		ipca:    make(map[time.Time]decimal.Decimal),
		methods: make(map[Index]Method, len(methods)),
		latest:  make(map[Index]time.Time),
	}

	for _, m := range methods {
		o.methods[m.Index] = m.Method
	}

	// monthly are the values a trailing average reads, by the first day of their month.
	monthly := map[Index]map[time.Time]decimal.Decimal{TR: {}, SelicTarget: {}, IPCA: {}}

	for index, values := range history {
		for _, v := range values {
			start, end := day(v.PeriodStart), day(v.PeriodEnd)

			switch index {
			case TR:
				o.tr[period{start, end}] = v.Value

				if isMonth(start, end) {
					monthly[TR][start] = v.Value

					o.noteLatest(TR, start)
				}
			case PoupancaYield:
				if isMonth(start, end) {
					o.noteLatest(PoupancaYield, start)
				}
			case SelicTarget:
				o.selic[start] = v.Value

				if start.Day() == 1 {
					monthly[SelicTarget][start] = v.Value
				}

				o.noteLatest(SelicTarget, start)
			case IPCA:
				o.ipca[start] = v.Value

				if start.Day() == 1 {
					monthly[IPCA][start] = v.Value
				}

				o.noteLatest(IPCA, start)
			default:
			}
		}
	}

	o.trailing = make(map[Index]decimal.Decimal)

	for _, index := range Projected() {
		method := o.method(index)

		if n := trailingMonths(method); n > 0 {
			if average, ok := trailingAverage(monthly[index], n); ok {
				o.trailing[index] = average
			}

			continue
		}

		if method != Focus {
			continue
		}

		switch index {
		case SelicTarget:
			o.selicSteps = focusSelicSteps(expectations.Selic)

			// A survey older than the published targets can't override them.
			if latest, ok := o.latest[SelicTarget]; ok {
				o.selicSteps = slices.DeleteFunc(o.selicSteps, func(s selicStep) bool {
					return !s.effective.After(latest)
				})
			}
		case IPCA:
			o.setFocusIPCA(expectations)
		default:
		}
	}

	return o
}

// TR returns the TR in percent for the period from start to end: the published value of exactly
// that period, else the trailing average its method projects.
func (o Outlook) TR(start, end time.Time) (Estimate, bool) {
	if v, ok := o.tr[period{day(start), day(end)}]; ok {
		return Estimate{Value: v}, true
	}

	return o.trailingEstimate(TR)
}

// SelicTarget returns the Selic target in percent a year in force on a day: the published value
// of that day, else the one its method projects. Nothing is projected for a day inside the
// published range, up to the latest published day.
func (o Outlook) SelicTarget(at time.Time) (Estimate, bool) {
	at = day(at)

	if v, ok := o.selic[at]; ok {
		return Estimate{Value: v}, true
	}

	latest, published := o.latest[SelicTarget]
	if published && !at.After(latest) {
		return Estimate{}, false
	}

	if estimate, ok := o.trailingEstimate(SelicTarget); ok {
		return estimate, true
	}

	if len(o.selicSteps) == 0 {
		return Estimate{}, false
	}

	focus := o.projectedBy(SelicTarget)

	// The step in force is the last one that took effect by the day.
	i := sort.Search(len(o.selicSteps), func(i int) bool { return o.selicSteps[i].effective.After(at) })
	if i > 0 {
		return Estimate{Value: o.selicSteps[i-1].median, Methods: focus}, true
	}

	// Before the first meeting takes effect, the target of the latest published day holds.
	if !published {
		return Estimate{}, false
	}

	return Estimate{Value: o.selic[latest], Methods: focus}, true
}

// PoupancaYield returns the poupança yield in percent for the period from start to end, derived
// by the legal rule from its TR and the Selic target on its first day. Its methods are those of
// the inputs that were projected.
func (o Outlook) PoupancaYield(start, end time.Time) (Estimate, bool) {
	tr, ok := o.TR(start, end)
	if !ok {
		return Estimate{}, false
	}

	selic, ok := o.SelicTarget(start)
	if !ok {
		return Estimate{}, false
	}

	return Estimate{
		Value:   DerivePoupancaYield(tr.Value, selic.Value),
		Methods: slices.Concat(tr.Methods, selic.Methods),
	}, true
}

// IPCA returns the IPCA in percent for the month that starts on month: the published value of
// that month, else the one its method projects.
func (o Outlook) IPCA(month time.Time) (Estimate, bool) {
	if v, ok := o.ipca[day(month)]; ok {
		return Estimate{Value: v}, true
	}

	if estimate, ok := o.trailingEstimate(IPCA); ok {
		return estimate, true
	}

	first := firstOfMonth(month)

	if v, ok := o.monthlyIPCA[first]; ok {
		return Estimate{Value: v, Methods: o.projectedBy(IPCA)}, true
	}

	year := min(first.Year(), o.annualIPCALast)
	if v, ok := o.annualIPCA[year]; ok {
		return Estimate{Value: v, Methods: o.projectedBy(IPCA)}, true
	}

	return Estimate{}, false
}

// Path returns the projected path of index for charts: the estimates of the months after the ones
// published, up to months of them, leaving out a month that has none. TR and the poupança yield
// are of the periods from the 1st of a month to the 1st of the next, after their latest published
// period of that kind; the Selic target is of the 1st of each month after the month of its latest
// published day; IPCA is of each month after its latest published month. It is empty when nothing
// is published for index, and nil for an index that is not projected.
func (o Outlook) Path(index Index, months int) []PathValue {
	switch index {
	case TR:
		return o.path(TR, months, true, o.TR)
	case PoupancaYield:
		return o.path(PoupancaYield, months, true, o.PoupancaYield)
	case SelicTarget:
		return o.path(SelicTarget, months, false, func(start, _ time.Time) (Estimate, bool) {
			return o.SelicTarget(start)
		})
	case IPCA:
		return o.path(IPCA, months, false, func(start, _ time.Time) (Estimate, bool) {
			return o.IPCA(start)
		})
	default:
		return nil
	}
}

// path returns the estimates of the months after the latest published one of index. A period spans
// its month when toNextMonth, and is the single first day of the month otherwise.
func (o Outlook) path(
	index Index, months int, toNextMonth bool, estimate func(start, end time.Time) (Estimate, bool),
) []PathValue {
	path := make([]PathValue, 0, max(months, 0))

	latest, ok := o.latest[index]
	if !ok {
		return path
	}

	for i := 1; i <= months; i++ {
		start := time.Date(latest.Year(), latest.Month()+time.Month(i), 1, 0, 0, 0, 0, time.UTC)
		end := start

		if toNextMonth {
			end = start.AddDate(0, 1, 0)
		}

		e, ok := estimate(start, end)
		if !ok {
			continue
		}

		path = append(path, PathValue{PeriodStart: start, PeriodEnd: end, Estimate: e})
	}

	return path
}

// method returns the method index is projected by.
func (o Outlook) method(index Index) Method {
	if m, ok := o.methods[index]; ok {
		return m
	}

	return DefaultMethod(index)
}

// projectedBy returns the methods a value projected for index records.
func (o Outlook) projectedBy(index Index) []ProjectionMethod {
	return []ProjectionMethod{{Index: index, Method: o.method(index)}}
}

func (o Outlook) trailingEstimate(index Index) (Estimate, bool) {
	v, ok := o.trailing[index]
	if !ok {
		return Estimate{}, false
	}

	return Estimate{Value: v, Methods: o.projectedBy(index)}, true
}

// noteLatest keeps the latest start of the published values of index.
func (o *Outlook) noteLatest(index Index, start time.Time) {
	if latest, ok := o.latest[index]; !ok || start.After(latest) {
		o.latest[index] = start
	}
}

// setFocusIPCA reads the Focus medians that project the IPCA.
func (o *Outlook) setFocusIPCA(expectations Expectations) {
	o.monthlyIPCA = make(map[time.Time]decimal.Decimal, len(expectations.MonthlyIPCA))
	for _, m := range expectations.MonthlyIPCA {
		o.monthlyIPCA[firstOfMonth(m.Month)] = m.Median
	}

	hundred := decimal.FromInt(100)

	o.annualIPCA = make(map[int]decimal.Decimal, len(expectations.AnnualIPCA))
	for _, y := range expectations.AnnualIPCA {
		monthlyRate := decimal.AnnualToMonthly(decimal.PercentToFraction(y.Median))
		o.annualIPCA[y.Year] = monthlyRate.Mul(hundred).RoundProjection()
		o.annualIPCALast = max(o.annualIPCALast, y.Year)
	}
}

// focusSelicSteps places each meeting's median on the business day after its decision day, in
// that order. A meeting the Copom calendar has no date for is left out.
func focusSelicSteps(medians []MeetingMedian) []selicStep {
	decisions := copomDecisions()
	latestYear := slices.Max(slices.Collect(maps.Keys(decisions)))

	steps := make([]selicStep, 0, len(medians))

	for _, m := range medians {
		decision, ok := decisionDay(decisions, latestYear, m)
		if !ok {
			continue
		}

		steps = append(steps, selicStep{effective: nextBusinessDay(decision), median: m.Median})
	}

	slices.SortStableFunc(steps, func(a, b selicStep) int { return a.effective.Compare(b.effective) })

	return steps
}

// decisionDay returns the day the Copom announces the decision of a meeting. A year the calendar
// doesn't list takes the month and day of the same meeting in the latest year it lists.
func decisionDay(decisions map[int][]time.Time, latestYear int, m MeetingMedian) (time.Time, bool) {
	meetings, listed := decisions[m.Year]
	if !listed {
		meetings = decisions[latestYear]
	}

	if m.Number < 1 || m.Number > len(meetings) {
		return time.Time{}, false
	}

	decision := meetings[m.Number-1]
	if !listed {
		decision = time.Date(m.Year, decision.Month(), decision.Day(), 0, 0, 0, 0, time.UTC)
	}

	return decision, true
}

// nextBusinessDay returns the first business day after at.
func nextBusinessDay(at time.Time) time.Time {
	next := at.AddDate(0, 0, 1)
	for calendar.BusinessDays(next, next.AddDate(0, 0, 1)) != 1 {
		next = next.AddDate(0, 0, 1)
	}

	return next
}

// trailingMonths returns how many months a trailing method averages, or 0 for any other method.
func trailingMonths(m Method) int {
	switch m {
	case Trailing12:
		return 12
	case Trailing60:
		return 60
	default:
		return 0
	}
}

// trailingAverage returns the mean of the latest n values, by their month, rounded for a
// projection. There is none when there are fewer than n values.
func trailingAverage(values map[time.Time]decimal.Decimal, n int) (decimal.Decimal, bool) {
	if len(values) < n {
		return decimal.Decimal{}, false
	}

	months := slices.SortedFunc(maps.Keys(values), time.Time.Compare)

	var sum decimal.Decimal
	for _, month := range months[len(months)-n:] {
		sum = sum.Add(values[month])
	}

	return sum.Quo(decimal.FromInt(int64(n))).RoundProjection(), true
}

// isMonth reports whether the period runs from the 1st of a month to the 1st of the next.
func isMonth(start, end time.Time) bool {
	return start.Day() == 1 && end.Equal(start.AddDate(0, 1, 0))
}

// day returns the calendar date of t, in its own location, at midnight UTC.
func day(t time.Time) time.Time {
	year, month, d := t.Date()

	return time.Date(year, month, d, 0, 0, 0, 0, time.UTC)
}

func firstOfMonth(t time.Time) time.Time {
	year, month, _ := t.Date()

	return time.Date(year, month, 1, 0, 0, 0, 0, time.UTC)
}
