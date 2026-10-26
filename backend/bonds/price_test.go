package bonds_test

import (
	"testing"
	"time"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"github.com/gringolito/debtwise/backend/bonds"
	"github.com/gringolito/debtwise/backend/decimal"
)

// Tesouro's worked examples in its "Metodologia de Cálculo dos Títulos Públicos Federais Ofertados
// nos Leilões Primários", both settled on 2008-05-21.
func TestUnitPriceMatchesTesouroWorkedExamples(t *testing.T) {
	t.Parallel()

	tests := []struct {
		name string
		bond bonds.Bond
		rate string
		want string
	}{
		{
			name: "LTN at 14.36% a year, 532 business days to maturity",
			bond: bonds.Bond{Type: bonds.LTN, Maturity: date(2010, time.July, 1)},
			rate: "0.1436",
			want: "753.315323",
		},
		{
			name: "NTN-F at 13.66% a year, twelve coupons to maturity",
			bond: bonds.Bond{Type: bonds.NTNF, Maturity: date(2014, time.January, 1)},
			rate: "0.1366",
			want: "903.075616",
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			t.Parallel()

			price := tt.bond.UnitPrice(mustDecimal(t, tt.rate), date(2008, time.May, 21))
			assert.Equal(t, tt.want, price.String())
		})
	}
}

// Tesouro Direto's prices published on 2026-10-23, shown in cents, for purchases and sales settled
// on the next business day, 2026-10-26.
func TestUnitPriceMatchesTesouroDiretoPublishedPrices(t *testing.T) {
	t.Parallel()

	tests := []struct {
		name      string
		bond      bonds.Bond
		rate      string
		published string
	}{
		{name: "LTN 2027 sell", bond: ltn(2027), rate: "0.1347", published: "977.19"},
		{name: "LTN 2029 buy", bond: ltn(2029), rate: "0.1276", published: "771.26"},
		{name: "LTN 2029 sell", bond: ltn(2029), rate: "0.1288", published: "769.49"},
		{name: "LTN 2032 buy", bond: ltn(2032), rate: "0.1289", published: "535.52"},
		{name: "NTN-F 2027 sell, one coupon left", bond: ntnf(2027), rate: "0.1333", published: "1025.12"},
		{name: "NTN-F 2037 buy", bond: ntnf(2037), rate: "0.1288", published: "880.05"},
		{name: "NTN-F 2037 sell", bond: ntnf(2037), rate: "0.1300", published: "874.38"},
	}

	cent := mustDecimal(t, "0.01")

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			t.Parallel()

			price := tt.bond.UnitPrice(mustDecimal(t, tt.rate), date(2026, time.October, 26))
			published := mustDecimal(t, tt.published)

			assert.True(t, price.Cmp(published) >= 0 && price.Cmp(published.Add(cent)) < 0,
				"price %s truncates to %s", price, tt.published)
		})
	}
}

func TestUnitPriceOfAnUnknownTypePanics(t *testing.T) {
	t.Parallel()

	bond := bonds.Bond{Type: "ntn_b", Maturity: date(2035, time.May, 15)}

	assert.Panics(t, func() { bond.UnitPrice(mustDecimal(t, "0.06"), date(2026, time.October, 26)) })
}

func ltn(year int) bonds.Bond {
	return bonds.Bond{Type: bonds.LTN, Maturity: date(year, time.January, 1)}
}

func ntnf(year int) bonds.Bond {
	return bonds.Bond{Type: bonds.NTNF, Maturity: date(year, time.January, 1)}
}

func date(year int, month time.Month, day int) time.Time {
	return time.Date(year, month, day, 0, 0, 0, 0, time.UTC)
}

func mustDecimal(t *testing.T, s string) decimal.Decimal {
	t.Helper()

	d, err := decimal.Parse(s)
	require.NoError(t, err)

	return d
}
