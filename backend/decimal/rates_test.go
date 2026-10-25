package decimal_test

import (
	"testing"

	"github.com/stretchr/testify/assert"

	"github.com/gringolito/debtwise/backend/decimal"
)

func TestRateConversions(t *testing.T) {
	t.Parallel()

	tests := []struct {
		name    string
		convert func(decimal.Decimal) decimal.Decimal
		rate    string
		want    string
	}{
		{
			name:    "monthly to annual",
			convert: decimal.MonthlyToAnnual,
			rate:    "0.01",
			want:    "0.126825030131969720661201",
		},
		{
			name:    "annual to monthly",
			convert: decimal.AnnualToMonthly,
			rate:    "0.10",
			want:    "0.007974140428903741066031844223230333",
		},
		{
			name:    "nominal to effective",
			convert: decimal.NominalToEffective,
			rate:    "0.12",
			want:    "0.126825030131969720661201",
		},
		{
			name:    "effective to nominal",
			convert: decimal.EffectiveToNominal,
			rate:    "0.10",
			want:    "0.095689685146844892792382130678764",
		},
		{name: "zero stays zero", convert: decimal.EffectiveToNominal, rate: "0", want: "0"},
	}

	// Compared as text: a converted rate carries no trailing zeros, so the API shows it as it is.
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			t.Parallel()

			assert.Equal(t, tt.want, tt.convert(parse(t, tt.rate)).String())
		})
	}
}

// Converted to effective and back, a nominal rate keeps 30 decimal places, far more than the few a
// contract prints.
func TestNominalToEffectiveAndBackReturnsTheRate(t *testing.T) {
	t.Parallel()

	tests := []struct {
		name    string
		nominal string
	}{
		{name: "whole percent", nominal: "0.12"},
		{name: "contract rate", nominal: "0.093807"},
		{name: "nominal of 10% effective", nominal: "0.095690"},
		{name: "tiny rate", nominal: "0.0000001"},
		{name: "high rate", nominal: "1.5"},
		{name: "negative rate", nominal: "-0.03"},
	}

	below, above := parse(t, "-0.000000000000000000000000000001"), parse(t, "0.000000000000000000000000000001")

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			t.Parallel()

			nominal := parse(t, tt.nominal)
			back := decimal.EffectiveToNominal(decimal.NominalToEffective(nominal))

			diff := back.Sub(nominal)
			assert.True(t, diff.Cmp(below) > 0 && diff.Cmp(above) < 0, "nominal %s came back as %s", nominal, back)
		})
	}
}

func TestRateOfMinus100PercentOrLessPanics(t *testing.T) {
	t.Parallel()

	assert.Panics(t, func() { decimal.AnnualToMonthly(parse(t, "-1.5")) })
}
