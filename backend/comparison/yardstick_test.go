package comparison_test

import (
	"testing"

	"github.com/stretchr/testify/assert"

	"github.com/gringolito/debtwise/backend/comparison"
)

func TestTheYardstickMeasuresTheAdvantageAgainstTheAmount(t *testing.T) {
	t.Parallel()

	tests := []struct {
		name      string
		advantage string
		amount    string
		share     string
		nearTie   bool
	}{
		{name: "a share rounds half up at the 4th place", advantage: "814.50", amount: "10000.00", share: "0.0815", nearTie: false},
		{name: "a share below a half rounds down", advantage: "814.49", amount: "10000.00", share: "0.0814", nearTie: false},
		{name: "the share of 814.22 on 10000.00", advantage: "814.22", amount: "10000.00", share: "0.0814", nearTie: false},
		{name: "just under 1% is a near tie", advantage: "99.99", amount: "10000.00", share: "0.0100", nearTie: true},
		{name: "exactly 1% is not a near tie", advantage: "100.00", amount: "10000.00", share: "0.0100", nearTie: false},
		{name: "just over 1% is not a near tie", advantage: "100.01", amount: "10000.00", share: "0.0100", nearTie: false},
		{name: "zero is a near tie", advantage: "0.00", amount: "10000.00", share: "0.0000", nearTie: true},
		{name: "a negative advantage has an unsigned share", advantage: "-814.22", amount: "10000.00", share: "0.0814", nearTie: false},
		{name: "a negative advantage under 1% is a near tie", advantage: "-99.99", amount: "10000.00", share: "0.0100", nearTie: true},
		{name: "a negative advantage of exactly 1% is not a near tie", advantage: "-100.00", amount: "10000.00", share: "0.0100", nearTie: false},
		{name: "the tie is judged on the exact share, not the rounded one", advantage: "99.50", amount: "10000.00", share: "0.0100", nearTie: true},
		{name: "an advantage above the amount", advantage: "12500.00", amount: "10000.00", share: "1.2500", nearTie: false},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			t.Parallel()

			share, nearTie := comparison.Yardstick(dec(t, tt.advantage), dec(t, tt.amount))

			assert.Equal(t, tt.share, share.String())
			assert.Equal(t, tt.nearTie, nearTie)
		})
	}
}

func TestTheHorizonCountsWholeCalendarMonthsOnceTheirDayIsReached(t *testing.T) {
	t.Parallel()

	tests := []struct {
		name     string
		from, to string
		want     int
	}{
		{name: "across years, the maturity's day before the decision's", from: "2026-11-12", to: "2032-01-01", want: 61},
		{name: "the day before the decision's day of month", from: "2026-11-12", to: "2026-12-11", want: 0},
		{name: "the decision's day of month", from: "2026-11-12", to: "2026-12-12", want: 1},
		{name: "a later day of month", from: "2026-11-12", to: "2026-12-20", want: 1},
		{name: "the same day", from: "2026-11-12", to: "2026-11-12", want: 0},
		{name: "exactly years apart", from: "2026-11-12", to: "2029-11-12", want: 36},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			t.Parallel()

			assert.Equal(t, tt.want, comparison.WholeMonths(date(t, tt.from), date(t, tt.to)))
		})
	}
}
