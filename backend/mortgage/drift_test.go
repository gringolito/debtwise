package mortgage_test

import (
	"testing"

	"github.com/stretchr/testify/assert"

	"github.com/gringolito/debtwise/backend/mortgage"
)

// A drift under 0.001% of the computed balance either way is the centavos the bank and the schedule
// round differently, not terms that no longer match the contract. On 100,000.00 that is a real.
func TestDriftWithinRounding(t *testing.T) {
	t.Parallel()

	tests := []struct {
		name     string
		computed string
		drift    string
		want     bool
	}{
		{name: "none", computed: "100000.00", drift: "0.00", want: true},
		{name: "a centavo", computed: "100000.00", drift: "0.01", want: true},
		{name: "just under 0.001%, above", computed: "100000.00", drift: "0.99", want: true},
		{name: "just under 0.001%, below", computed: "100000.00", drift: "-0.99", want: true},
		{name: "exactly 0.001%, above", computed: "100000.00", drift: "1.00", want: false},
		{name: "exactly 0.001%, below", computed: "100000.00", drift: "-1.00", want: false},
		{name: "under a real but over 0.001% of a smaller balance", computed: "10000.00", drift: "0.50", want: false},
		{name: "over a real but under 0.001% of a larger balance", computed: "500000.00", drift: "-4.99", want: true},
		{name: "nothing computed and nothing stated", computed: "0.00", drift: "0.00", want: true},
		{name: "nothing computed and a centavo stated", computed: "0.00", drift: "0.01", want: false},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			t.Parallel()

			drift := mortgage.Drift{ComputedBalance: dec(t, tt.computed), Amount: dec(t, tt.drift)}
			assert.Equal(t, tt.want, drift.WithinRounding())
		})
	}
}
