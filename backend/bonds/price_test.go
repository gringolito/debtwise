package bonds_test

import (
	"strings"
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

// Tesouro's NTN-B worked example in its "Metodologia de Cálculo dos Títulos Públicos Federais
// Ofertados nos Leilões Primários" (2024-04-29), maturing 2010-08-15, settled 2008-05-21 at 8.29% a
// year: five flows of 61, 190, 314, 439 and 564 business days, a quotation of 97.0813% of the VNA
// projected for the settlement, R$ 1.728,461136, and a price of R$ 1.678,012540.
func TestNTNBPriceMatchesTesouroWorkedExample(t *testing.T) {
	t.Parallel()

	bond := bonds.Bond{Type: bonds.NTNB, Maturity: date(2010, time.August, 15)}
	rate := mustDecimal(t, "0.0829")
	settlement := date(2008, time.May, 21)

	assert.Equal(t, "97.0813", bond.Quotation(rate, settlement).String())
	assert.Equal(t, "1678.012540", bond.IPCAUnitPrice(rate, settlement, mustDecimal(t, "1728.461136")).String())
}

// A buyer settling on a coupon date doesn't get that coupon, so the quotation drops by about the
// coupon, 2.956301% of the VNA, from the business day before: here Friday 2010-02-12 to Monday
// 2010-02-15.
func TestNTNBQuotationLeavesOutTheCouponPaidOnSettlement(t *testing.T) {
	t.Parallel()

	bond := bonds.Bond{Type: bonds.NTNB, Maturity: date(2010, time.August, 15)}
	rate := mustDecimal(t, "0.0829")

	drop := bond.Quotation(rate, date(2010, time.February, 12)).Sub(bond.Quotation(rate, date(2010, time.February, 15)))

	assert.True(t, drop.Cmp(mustDecimal(t, "2.9")) > 0 && drop.Cmp(mustDecimal(t, "2.96")) < 0,
		"quotation drops by %s", drop)
}

// Tesouro Direto's NTN-B 2017 example from the IPCA index numbers: the VNA of 2011-12-15 projected
// to 2012-01-03 with Tesouro's 0.53% for December, priced at 5.32% a year, is R$ 2.187,17.
func TestNTNBPriceFromIndexNumbersMatchesTesouroDireto(t *testing.T) {
	t.Parallel()

	bond := bonds.Bond{Type: bonds.NTNB, Maturity: date(2017, time.May, 15)}
	settlement := date(2012, time.January, 3)

	vna, err := bonds.ProjectedVNA(settlement, ipcaNumbers(t), mustDecimal(t, "0.0053"))
	require.NoError(t, err)

	price := bond.IPCAUnitPrice(mustDecimal(t, "0.0532"), settlement, vna)
	published := mustDecimal(t, "2187.17")

	assert.True(t, price.Cmp(published) >= 0 && price.Cmp(published.Add(mustDecimal(t, "0.01"))) < 0,
		"price %s truncates to %s", price, published)
}

// Tesouro Direto's worked examples ("Cálculo da Rentabilidade dos Títulos Públicos ofertados no
// Tesouro Direto"), both settled on 2012-01-03 with a VNA projected to R$ 2.104,390122. The
// document shows the NTN-B Principal price as R$ 1.776,7723 and the NTN-B's as R$ 2.187,1747225,
// and both as R$ 1.776,77 and R$ 2.187,17 at the cents Tesouro Direto sells at.
func TestIPCAUnitPriceMatchesTesouroDiretoWorkedExamples(t *testing.T) {
	t.Parallel()

	tests := []struct {
		name          string
		bond          bonds.Bond
		rate          string
		wantQuotation string
		wantPrice     string
		wantCents     string
	}{
		{
			name:          "NTN-B Principal 2015 at 5.17% a year, 846 business days",
			bond:          bonds.Bond{Type: bonds.NTNBPrincipal, Maturity: date(2015, time.May, 15)},
			rate:          "0.0517",
			wantQuotation: "84.4317",
			wantPrice:     "1776.7723",
			wantCents:     "1776.77",
		},
		{
			name:          "NTN-B 2017 at 5.32% a year, eleven coupons",
			bond:          bonds.Bond{Type: bonds.NTNB, Maturity: date(2017, time.May, 15)},
			rate:          "0.0532",
			wantQuotation: "103.9339",
			wantPrice:     "2187.1747",
			wantCents:     "2187.17",
		},
	}

	cent := mustDecimal(t, "0.01")
	vna := mustDecimal(t, "2104.390122")
	settlement := date(2012, time.January, 3)

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			t.Parallel()

			rate := mustDecimal(t, tt.rate)
			price := tt.bond.IPCAUnitPrice(rate, settlement, vna)
			cents := mustDecimal(t, tt.wantCents)

			assert.Equal(t, tt.wantQuotation, tt.bond.Quotation(rate, settlement).String())
			assert.True(t, strings.HasPrefix(price.String(), tt.wantPrice), "price %s starts with %s", price, tt.wantPrice)
			assert.True(t, price.Cmp(cents) >= 0 && price.Cmp(cents.Add(cent)) < 0,
				"price %s truncates to %s", price, tt.wantCents)
		})
	}
}

func TestUnitPriceOfATypeItCannotPricePanics(t *testing.T) {
	t.Parallel()

	tests := []struct {
		name string
		typ  bonds.Type
	}{
		{name: "NTN-B Principal needs a VNA", typ: bonds.NTNBPrincipal},
		{name: "NTN-B needs a VNA", typ: bonds.NTNB},
		{name: "unknown type", typ: "selic"},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			t.Parallel()

			bond := bonds.Bond{Type: tt.typ, Maturity: date(2035, time.May, 15)}

			assert.Panics(t, func() { bond.UnitPrice(mustDecimal(t, "0.06"), date(2026, time.October, 26)) })
		})
	}
}

func TestIPCAUnitPriceOfANonNTNBPanics(t *testing.T) {
	t.Parallel()

	vna := mustDecimal(t, "4766.335112")

	for _, typ := range []bonds.Type{bonds.LTN, bonds.NTNF} {
		t.Run(string(typ), func(t *testing.T) {
			t.Parallel()

			bond := bonds.Bond{Type: typ, Maturity: date(2035, time.January, 1)}

			assert.Panics(t, func() { bond.IPCAUnitPrice(mustDecimal(t, "0.06"), date(2026, time.October, 26), vna) })
		})
	}
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
