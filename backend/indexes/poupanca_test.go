package indexes_test

import (
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"github.com/gringolito/debtwise/backend/decimal"
	"github.com/gringolito/debtwise/backend/indexes"
)

// Each case is one day's TR (SGS 226) and Selic target (SGS 432), and the poupança yield BCB
// published for the same period (SGS 195), all in percent.
func TestDerivePoupancaYieldMatchesThePublishedYield(t *testing.T) {
	t.Parallel()

	tests := []struct {
		name        string
		tr          string
		selicTarget string
		want        string
	}{
		{name: "Selic above 8.5% adds 0.5% to TR (2024-01-25)", tr: "0.0376", selicTarget: "11.25", want: "0.5378"},
		{name: "Selic just above 8.5% (2017-07-27)", tr: "0.0209", selicTarget: "9.25", want: "0.5210"},
		{name: "a tie rounds to even (2014-12-14)", tr: "0.0500", selicTarget: "11.75", want: "0.5502"},
		{name: "Selic at 8.5% adds 70% of it (2012-06-04)", tr: "0.0100", selicTarget: "8.50", want: "0.4928"},
		{name: "Selic below 8.5% adds 70% of it (2021-12-02)", tr: "0.0326", selicTarget: "7.75", want: "0.4739"},
		{name: "zero TR (2021-01-01)", tr: "0.0000", selicTarget: "2.00", want: "0.1159"},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			t.Parallel()

			got := indexes.DerivePoupancaYield(percent(t, tt.tr), percent(t, tt.selicTarget))
			assert.Equal(t, tt.want, got.String())
		})
	}
}

func percent(t *testing.T, s string) decimal.Decimal {
	t.Helper()

	d, err := decimal.Parse(s)
	require.NoError(t, err)

	return d
}
