package bonds

import (
	"fmt"
	"slices"
	"time"

	"github.com/gringolito/debtwise/backend/decimal"
	"github.com/gringolito/debtwise/backend/indexes"
)

// vnaValue is a VNA and the projection methods of the projected IPCA it depends on, empty when it
// depends on published values only.
type vnaValue struct {
	value       decimal.Decimal
	projectedBy []indexes.ProjectionMethod
}

// vnaSource reads VNAs from published IPCA index numbers, and grows the latest of them by the
// monthly IPCA of the outlook for the months IBGE hasn't published yet.
type vnaSource struct {
	ipca IPCA
	// latest is the month of the latest published index number, and hasLatest whether there is one.
	latest    time.Time
	hasLatest bool
	// grown are the index numbers of the months after latest, by month, once read.
	grown map[time.Time]vnaValue
	vnas  map[time.Time]vnaValue
}

func newVNASource(ipca IPCA) *vnaSource {
	s := &vnaSource{ipca: ipca, grown: make(map[time.Time]vnaValue), vnas: make(map[time.Time]vnaValue)}

	for month := range ipca.Numbers {
		if !s.hasLatest || month.After(s.latest) {
			s.latest, s.hasLatest = month, true
		}
	}

	return s
}

// on returns the VNA projected to settlement: the VNA of the last 15th on or before it, grown pro
// rata by the IPCA of that 15th's month when settlement is after it. Both are read from the index
// numbers where published, and projected where not.
func (s *vnaSource) on(settlement time.Time) (vnaValue, error) {
	if cached, ok := s.vnas[settlement]; ok {
		return cached, nil
	}

	year, month, day := settlement.Date()

	last := time.Date(year, month, 15, 0, 0, 0, 0, time.UTC)
	if day < 15 {
		last = last.AddDate(0, -1, 0)
	}

	previousMonth := firstOfMonth(last.Year(), last.Month()-1)

	previous, err := s.number(previousMonth)
	if err != nil {
		return vnaValue{}, err
	}

	numbers := IPCANumbers{previousMonth: previous.value}
	if base, ok := s.ipca.Numbers[baseMonth]; ok {
		numbers[baseMonth] = base
	}

	projectedIPCA, projectedBy := decimal.Decimal{}, previous.projectedBy

	if day != 15 {
		estimate, err := s.monthlyIPCA(firstOfMonth(last.Year(), last.Month()))
		if err != nil {
			return vnaValue{}, err
		}

		projectedIPCA = decimal.PercentToFraction(estimate.Value)
		projectedBy = union(projectedBy, estimate.Methods)
	}

	value, err := ProjectedVNA(settlement, numbers, projectedIPCA)
	if err != nil {
		return vnaValue{}, err
	}

	vna := vnaValue{value: value, projectedBy: projectedBy}
	s.vnas[settlement] = vna

	return vna, nil
}

// number returns the IPCA index number of month: the published one, or the latest published one
// grown by the IPCA of each month after it, with the methods of the projected ones.
func (s *vnaSource) number(month time.Time) (vnaValue, error) {
	if published, ok := s.ipca.Numbers[month]; ok {
		return vnaValue{value: published}, nil
	}

	if grown, ok := s.grown[month]; ok {
		return grown, nil
	}

	if !s.hasLatest || !month.After(s.latest) {
		return vnaValue{}, fmt.Errorf("%w for %s", ErrMissingIPCANumber, month.Format("2006-01"))
	}

	number := vnaValue{value: s.ipca.Numbers[s.latest]}

	for next := s.latest.AddDate(0, 1, 0); !next.After(month); next = next.AddDate(0, 1, 0) {
		if grown, ok := s.grown[next]; ok {
			number = grown

			continue
		}

		estimate, err := s.monthlyIPCA(next)
		if err != nil {
			return vnaValue{}, err
		}

		number = vnaValue{
			value:       number.value.Mul(one.Add(decimal.PercentToFraction(estimate.Value))),
			projectedBy: union(number.projectedBy, estimate.Methods),
		}
		s.grown[next] = number
	}

	return number, nil
}

// monthlyIPCA returns the IPCA of month from the outlook, or ErrMissingIPCANumber when it has none.
func (s *vnaSource) monthlyIPCA(month time.Time) (indexes.Estimate, error) {
	if s.ipca.Outlook != nil {
		if estimate, ok := s.ipca.Outlook.IPCA(month); ok {
			return estimate, nil
		}
	}

	return indexes.Estimate{}, fmt.Errorf("%w: no IPCA for %s", ErrMissingIPCANumber, month.Format("2006-01"))
}

// union returns the methods of a followed by those of b that a doesn't have, in that order.
func union(a, b []indexes.ProjectionMethod) []indexes.ProjectionMethod {
	merged := slices.Clone(a)

	for _, method := range b {
		if !slices.Contains(merged, method) {
			merged = append(merged, method)
		}
	}

	return merged
}
