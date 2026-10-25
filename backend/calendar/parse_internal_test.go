package calendar

import (
	"testing"

	"github.com/stretchr/testify/assert"
)

// The holiday list is refreshed by hand, so a malformed line has to fail New rather than drop a
// holiday from every count.
func TestParseHolidaysRejectsMalformedLists(t *testing.T) {
	t.Parallel()

	tests := []struct {
		name string
		data string
	}{
		{name: "empty", data: ""},
		{name: "date in the spreadsheet's dd/mm/yyyy format", data: "date,name\n01/01/2027,Confraternização Universal\n"},
		{name: "missing name", data: "date,name\n2027-01-01\n"},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			t.Parallel()

			_, err := parseHolidays(tt.data)
			assert.Error(t, err)
		})
	}
}
