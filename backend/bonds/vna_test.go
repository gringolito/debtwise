package bonds_test

import (
	"testing"
	"time"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"github.com/gringolito/debtwise/backend/bonds"
	"github.com/gringolito/debtwise/backend/decimal"
)

// ipcaNumbers are IBGE's IPCA index numbers (base December 1993 = 100), copied from SIDRA table
// 1737, variable 2266: https://apisidra.ibge.gov.br/values/t/1737/n1/all/v/2266/p/200006,200804,201111,201204
func ipcaNumbers(t *testing.T) bonds.IPCANumbers {
	t.Helper()

	return bonds.IPCANumbers{
		date(2000, time.June, 1):     mustDecimal(t, "1614.62"),
		date(2008, time.April, 1):    mustDecimal(t, "2788.33"),
		date(2011, time.November, 1): mustDecimal(t, "3386.80"),
		date(2012, time.April, 1):    mustDecimal(t, "3467.46"),
	}
}

// Tesouro's VNAs for the same 15ths: the base value R$ 1,000 on 2000-07-15 (Tesouro Direto's
// "Cálculo da Rentabilidade ... Tesouro IPCA+"), 2008-05-15 (Tesouro's "Metodologia de Cálculo dos
// Títulos Públicos Federais Ofertados nos Leilões Primários", NTN-B example), and 2011-12-15 and
// 2012-05-15 (Tesouro Direto's NTN-B example, the second as the VNA of its first coupon).
func TestVNAMatchesTesouroPublishedVNA(t *testing.T) {
	t.Parallel()

	tests := []struct {
		name    string
		fifteen time.Time
		want    string
	}{
		{name: "base date", fifteen: date(2000, time.July, 15), want: "1000.000000"},
		{name: "15 May 2008", fifteen: date(2008, time.May, 15), want: "1726.926459"},
		{name: "15 December 2011", fifteen: date(2011, time.December, 15), want: "2097.583332"},
		{name: "15 May 2012", fifteen: date(2012, time.May, 15), want: "2147.539359"},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			t.Parallel()

			vna, err := bonds.VNA(tt.fifteen, ipcaNumbers(t))

			require.NoError(t, err)
			assert.Equal(t, tt.want, vna.String())
		})
	}
}

func TestVNAFailsWhenItCannotBeComputed(t *testing.T) {
	t.Parallel()

	tests := []struct {
		name    string
		day     time.Time
		numbers bonds.IPCANumbers
	}{
		{name: "not a 15th", day: date(2011, time.December, 16), numbers: ipcaNumbers(t)},
		{name: "before the base date", day: date(2000, time.June, 15), numbers: ipcaNumbers(t)},
		{name: "previous month's index number missing", day: date(2011, time.November, 15), numbers: ipcaNumbers(t)},
		{
			name: "base index number missing",
			day:  date(2011, time.December, 15),
			numbers: bonds.IPCANumbers{
				date(2011, time.November, 1): mustDecimal(t, "3386.80"),
			},
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			t.Parallel()

			_, err := bonds.VNA(tt.day, tt.numbers)

			assert.Error(t, err)
		})
	}
}

// Tesouro's projected VNAs: for settlement on 2008-05-21 with a projected IPCA of 0.46% for May
// (Tesouro's methodology, pro rata 6/31), and for settlement on 2012-01-03 with 0.53% for December
// (Tesouro Direto, pro rata 19/31).
func TestProjectedVNAMatchesTesouro(t *testing.T) {
	t.Parallel()

	tests := []struct {
		name       string
		settlement time.Time
		projected  string
		want       string
	}{
		{name: "after the 15th", settlement: date(2008, time.May, 21), projected: "0.0046", want: "1728.461136"},
		{name: "before the 15th", settlement: date(2012, time.January, 3), projected: "0.0053", want: "2104.390122"},
		{name: "on a 15th it is the VNA", settlement: date(2011, time.December, 15), projected: "0.0053", want: "2097.583332"},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			t.Parallel()

			vna, err := bonds.ProjectedVNA(tt.settlement, ipcaNumbers(t), mustDecimal(t, tt.projected))

			require.NoError(t, err)
			assert.Equal(t, tt.want, vna.String())
		})
	}
}

func TestProjectedVNAFailsWithoutTheLast15thsVNA(t *testing.T) {
	t.Parallel()

	_, err := bonds.ProjectedVNA(date(2012, time.February, 3), ipcaNumbers(t), decimal.FromInt(0))

	assert.ErrorIs(t, err, bonds.ErrMissingIPCANumber)
}
