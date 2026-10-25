package decimal_test

import (
	"testing"

	"github.com/stretchr/testify/assert"

	"github.com/gringolito/debtwise/backend/decimal"
)

// ntnfCoupon is the R$ 48.81 an NTN-F pays each semester, at the five places Tesouro carries it.
const ntnfCoupon = "48.80885"

func TestRoundCouponGivesTheNTNFCoupon(t *testing.T) {
	t.Parallel()

	one := decimal.FromInt(1)
	coupon := decimal.FromInt(1000).Mul(parse(t, "1.10").Pow(parse(t, "0.5")).Sub(one))

	assert.Equal(t, ntnfCoupon, coupon.RoundCoupon().String())
}

func TestNamedRoundingPlacesAndDirection(t *testing.T) {
	t.Parallel()

	tests := []struct {
		name  string
		op    func(decimal.Decimal) decimal.Decimal
		input string
		want  string
	}{
		{
			name:  "exponent truncates at 14 places",
			op:    decimal.Decimal.TruncateExponent,
			input: "0.999999999999999",
			want:  "0.99999999999999",
		},
		{
			name:  "exponent pads to 14 places",
			op:    decimal.Decimal.TruncateExponent,
			input: "2",
			want:  "2.00000000000000",
		},
		{
			name:  "unit price truncates at 6 places",
			op:    decimal.Decimal.TruncateUnitPrice,
			input: "753.3153239",
			want:  "753.315323",
		},
		{
			name:  "coupon rounds a tie at 5 places up",
			op:    decimal.Decimal.RoundCoupon,
			input: "48.808845",
			want:  ntnfCoupon,
		},
		{
			name:  "coupon rounds below a tie down",
			op:    decimal.Decimal.RoundCoupon,
			input: "48.8088449",
			want:  "48.80884",
		},
		{
			name:  "discounted flow rounds a tie at 9 places up",
			op:    decimal.Decimal.RoundDiscountedFlow,
			input: "48.1193716105",
			want:  "48.119371611",
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			t.Parallel()

			assert.Equal(t, tt.want, tt.op(parse(t, tt.input)).String())
		})
	}
}

// Tesouro's worked LTN example ("Metodologia de Cálculo dos Títulos Públicos Federais Ofertados
// nos Leilões Primários"): settled 2008-05-21 at 14.36% a year, 532 business days to maturity.
func TestLTNUnitPriceMatchesTesouro(t *testing.T) {
	t.Parallel()

	assert.Equal(t, "753.315323", discount(t, "1000", "0.1436", 532).TruncateUnitPrice().String())
}

// Tesouro's worked NTN-F example, from the same document: settled 2008-05-21 at 13.66% a year,
// maturing 2014-01-01. Each flow is the coupon, the last one with the face value added.
func TestNTNFUnitPriceMatchesTesouro(t *testing.T) {
	t.Parallel()

	flows := []struct {
		businessDays int64
		flow         string
		present      string
	}{
		{28, ntnfCoupon, "48.119371611"},
		{159, ntnfCoupon, "45.020757190"},
		{281, ntnfCoupon, "42.314735474"},
		{409, ntnfCoupon, "39.650299657"},
		{532, ntnfCoupon, "37.248144536"},
		{660, ntnfCoupon, "34.902737214"},
		{784, ntnfCoupon, "32.771550709"},
		{911, ntnfCoupon, "30.723628208"},
		{1036, ntnfCoupon, "28.832967367"},
		{1162, ntnfCoupon, "27.044908383"},
		{1285, ntnfCoupon, "25.406432363"},
		{1415, "1048.80885", "511.040083815"},
	}

	var price decimal.Decimal

	for _, f := range flows {
		present := discount(t, f.flow, "0.1366", f.businessDays).RoundDiscountedFlow()
		assert.Equal(t, f.present, present.String(), "flow at %d business days", f.businessDays)

		price = price.Add(present)
	}

	assert.Equal(t, "903.075616", price.TruncateUnitPrice().String())
}

// discount compounds rate over businessDays/252 the way Tesouro does, and divides value by it.
func discount(t *testing.T, value, rate string, businessDays int64) decimal.Decimal {
	t.Helper()

	exponent := decimal.FromInt(businessDays).Quo(decimal.FromInt(252)).TruncateExponent()
	factor := decimal.FromInt(1).Add(parse(t, rate)).Pow(exponent)

	return parse(t, value).Quo(factor)
}
