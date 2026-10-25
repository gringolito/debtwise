package decimal_test

import (
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"github.com/gringolito/debtwise/backend/decimal"
)

func TestParseRoundTripsDecimalStrings(t *testing.T) {
	t.Parallel()

	tests := []struct {
		name  string
		input string
	}{
		{name: "zero", input: "0"},
		{name: "integer", input: "1000"},
		{name: "negative", input: "-48.81"},
		{name: "trailing zeros keep their places", input: "1.10"},
		{name: "zero with places", input: "0.000000"},
		{name: "small rate", input: "0.00000000000001"},
		{
			name:  "more digits than the arithmetic precision",
			input: "123456789012345678901234567890.123456789012345678901234567890",
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			t.Parallel()

			d, err := decimal.Parse(tt.input)
			require.NoError(t, err)
			assert.Equal(t, tt.input, d.String())
		})
	}
}

func TestParseRejectsNonDecimalStrings(t *testing.T) {
	t.Parallel()

	tests := []struct {
		name  string
		input string
	}{
		{name: "empty", input: ""},
		{name: "word", input: "abc"},
		{name: "exponent", input: "1e3"},
		{name: "not a number", input: "NaN"},
		{name: "infinity", input: "Infinity"},
		{name: "decimal comma", input: "48,81"},
		{name: "missing integer part", input: ".5"},
		{name: "missing fraction", input: "1."},
		{name: "plus sign", input: "+1"},
		{name: "leading zero", input: "01"},
		{name: "surrounding space", input: " 1"},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			t.Parallel()

			_, err := decimal.Parse(tt.input)
			assert.Error(t, err)
		})
	}
}

func TestArithmetic(t *testing.T) {
	t.Parallel()

	tests := []struct {
		name string
		op   func(x, y decimal.Decimal) decimal.Decimal
		x, y string
		want string
	}{
		{name: "add has no binary rounding error", op: decimal.Decimal.Add, x: "0.1", y: "0.2", want: "0.3"},
		{name: "sub", op: decimal.Decimal.Sub, x: "1000", y: "246.684677", want: "753.315323"},
		{name: "mul", op: decimal.Decimal.Mul, x: "48.81", y: "3", want: "146.43"},
		{name: "quo exact", op: decimal.Decimal.Quo, x: "10", y: "4", want: "2.5"},
		{
			name: "quo rounds to 34 significant digits",
			op:   decimal.Decimal.Quo,
			x:    "1",
			y:    "3",
			want: "0.3333333333333333333333333333333333",
		},
		{
			name: "a tie at the 34th digit rounds half to even",
			op:   decimal.Decimal.Add,
			x:    "1.000000000000000000000000000000000",
			y:    "0.0000000000000000000000000000000005",
			want: "1",
		},
		{
			name: "fractional power",
			op:   decimal.Decimal.Pow,
			x:    "1.10",
			y:    "0.5",
			want: "1.048808848170151546991453513679938",
		},
		{name: "integer power is exact", op: decimal.Decimal.Pow, x: "1.01", y: "12", want: "1.126825030131969720661201"},
		{name: "negative power", op: decimal.Decimal.Pow, x: "4", y: "-1", want: "0.25"},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			t.Parallel()

			assertDecimal(t, tt.want, tt.op(parse(t, tt.x), parse(t, tt.y)))
		})
	}
}

func TestUndefinedArithmeticPanics(t *testing.T) {
	t.Parallel()

	tests := []struct {
		name string
		op   func(x, y decimal.Decimal) decimal.Decimal
		x, y string
	}{
		{name: "division by zero", op: decimal.Decimal.Quo, x: "1", y: "0"},
		{name: "fractional power of a negative number", op: decimal.Decimal.Pow, x: "-1", y: "0.5"},
		{name: "negative power of zero", op: decimal.Decimal.Pow, x: "0", y: "-1"},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			t.Parallel()

			x, y := parse(t, tt.x), parse(t, tt.y)
			assert.Panics(t, func() { tt.op(x, y) })
		})
	}
}

func TestFromInt(t *testing.T) {
	t.Parallel()

	assert.Equal(t, "-252", decimal.FromInt(-252).String())
}

func TestCmp(t *testing.T) {
	t.Parallel()

	tests := []struct {
		name string
		x, y string
		want int
	}{
		{name: "less", x: "903.075615", y: "903.075616", want: -1},
		{name: "equal regardless of places", x: "146.430", y: "146.43", want: 0},
		{name: "greater", x: "0", y: "-0.01", want: 1},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			t.Parallel()

			assert.Equal(t, tt.want, parse(t, tt.x).Cmp(parse(t, tt.y)))
		})
	}
}

func parse(t *testing.T, s string) decimal.Decimal {
	t.Helper()

	d, err := decimal.Parse(s)
	require.NoError(t, err)

	return d
}

// assertDecimal compares by value, so a result's incidental trailing zeros don't matter.
func assertDecimal(t *testing.T, want string, got decimal.Decimal) {
	t.Helper()

	assert.Zero(t, parse(t, want).Cmp(got), "want %s, got %s", want, got)
}
