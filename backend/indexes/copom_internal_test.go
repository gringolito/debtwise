package indexes

import (
	"testing"
	"time"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

// The Copom holds eight ordinary meetings a year, each deciding on a Wednesday, the second day of
// the meeting, and in the order of the year. The calendar lists 2017 to 2027.
func TestCopomDecisionsCalendar(t *testing.T) {
	t.Parallel()

	decisions := copomDecisions()
	require.Len(t, decisions, 11)

	for year := 2017; year <= 2027; year++ {
		days, listed := decisions[year]
		require.True(t, listed, "year %d", year)
		require.Len(t, days, 8, "year %d", year)

		for i, d := range days {
			assert.Equal(t, year, d.Year(), "year %d meeting %d", year, i+1)
			assert.Equal(t, time.Wednesday, d.Weekday(), "%s", d.Format(time.DateOnly))

			if i > 0 {
				assert.True(t, d.After(days[i-1]), "year %d meeting %d is not after meeting %d", year, i+1, i)
			}
		}
	}
}
