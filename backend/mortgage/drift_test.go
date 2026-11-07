package mortgage_test

import (
	"testing"

	"github.com/stretchr/testify/assert"

	"github.com/gringolito/debtwise/backend/mortgage"
)

// A drift under a real is the centavos the bank and the schedule round differently, not terms that
// no longer match the contract.
func TestDriftWithinRounding(t *testing.T) {
	t.Parallel()

	tests := []struct {
		name  string
		drift string
		want  bool
	}{
		{name: "none", drift: "0.00", want: true},
		{name: "a centavo", drift: "0.01", want: true},
		{name: "just under a real, above", drift: "0.99", want: true},
		{name: "just under a real, below", drift: "-0.99", want: true},
		{name: "exactly a real, above", drift: "1.00", want: false},
		{name: "exactly a real, below", drift: "-1.00", want: false},
		{name: "above", drift: "123.45", want: false},
		{name: "below", drift: "-30.86", want: false},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			t.Parallel()

			assert.Equal(t, tt.want, mortgage.Drift{Amount: dec(t, tt.drift)}.WithinRounding())
		})
	}
}
