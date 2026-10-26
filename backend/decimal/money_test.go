package decimal_test

import (
	"testing"

	"github.com/stretchr/testify/assert"
)

func TestRoundCents(t *testing.T) {
	t.Parallel()

	tests := []struct {
		name  string
		input string
		want  string
	}{
		{name: "a tie rounds up", input: "921.155", want: "921.16"},
		{name: "below a tie rounds down", input: "921.1549999", want: "921.15"},
		{name: "a negative tie rounds away from zero", input: "-0.005", want: "-0.01"},
		{name: "whole amount pads to cents", input: "300000", want: "300000.00"},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			t.Parallel()

			assert.Equal(t, tt.want, parse(t, tt.input).RoundCents().String())
		})
	}
}
