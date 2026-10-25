package calendar_test

import (
	"testing"
	"time"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"github.com/gringolito/debtwise/backend/calendar"
)

func TestBusinessDays(t *testing.T) {
	t.Parallel()

	cal, err := calendar.New()
	require.NoError(t, err)

	// Settlement date of the worked examples in Tesouro's "Metodologia de Cálculo dos Títulos
	// Públicos Federais Ofertados nos Leilões Primários", which publishes their business days.
	tesouroSettlement := date(2008, time.May, 21)

	tests := []struct {
		name     string
		from, to time.Time
		want     int
	}{
		{
			name: "Tesouro: across Corpus Christi the day after settlement",
			from: tesouroSettlement, to: date(2008, time.July, 1),
			want: 28,
		},
		{
			name: "Tesouro: across holidays on weekends and December 31, to a New Year coupon",
			from: tesouroSettlement, to: date(2009, time.January, 1),
			want: 159,
		},
		{
			name: "Tesouro: LTN maturity",
			from: tesouroSettlement, to: date(2010, time.July, 1),
			want: 532,
		},
		{
			name: "Tesouro: NTN-F maturity",
			from: tesouroSettlement, to: date(2014, time.January, 1),
			want: 1415,
		},
		{
			name: "Tesouro: LFT maturity",
			from: tesouroSettlement, to: date(2014, time.March, 7),
			want: 1459,
		},
		{
			name: "holiday on a Saturday takes no business day",
			from: date(2024, time.September, 2), to: date(2024, time.September, 9),
			want: 5,
		},
		{
			name: "Consciência Negra, a national holiday since 2024",
			from: date(2024, time.November, 18), to: date(2024, time.November, 25),
			want: 4,
		},
		{
			name: "Carnaval Monday and Tuesday",
			from: date(2025, time.February, 28), to: date(2025, time.March, 7),
			want: 3,
		},
		{
			name: "December 31 is a business day",
			from: date(2025, time.December, 30), to: date(2026, time.January, 2),
			want: 2,
		},
		{
			name: "from a holiday",
			from: date(2026, time.January, 1), to: date(2026, time.January, 5),
			want: 1,
		},
		{
			name: "New Year on a Friday before a weekend",
			from: date(2027, time.January, 1), to: date(2027, time.January, 4),
			want: 0,
		},
		{
			name: "Carnaval decades ahead",
			from: date(2050, time.February, 18), to: date(2050, time.February, 25),
			want: 3,
		},
		{
			name: "last year of the list, across Christmas and December 31",
			from: date(2099, time.December, 24), to: date(2100, time.January, 1),
			want: 5,
		},
		{name: "same day", from: date(2026, time.March, 2), to: date(2026, time.March, 2), want: 0},
		{
			name: "to before from counts backwards",
			from: date(2026, time.January, 2), to: date(2025, time.December, 30),
			want: -2,
		},
		{
			name: "counts the calendar date of each time in its own zone",
			from: time.Date(2025, time.December, 30, 23, 0, 0, 0, time.FixedZone("BRT", -3*60*60)),
			to:   time.Date(2026, time.January, 2, 1, 0, 0, 0, time.UTC),
			want: 2,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			t.Parallel()

			assert.Equal(t, tt.want, cal.BusinessDays(tt.from, tt.to))
		})
	}
}

func date(year int, month time.Month, day int) time.Time {
	return time.Date(year, month, day, 0, 0, 0, 0, time.UTC)
}
