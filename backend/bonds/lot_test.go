package bonds_test

import (
	"testing"
	"time"

	"github.com/stretchr/testify/assert"

	"github.com/gringolito/debtwise/backend/bonds"
)

// validLot is a lot that breaks no rule on 2026-10-27, which each case of the table below spoils in
// one way or two.
func validLot(t *testing.T, edit func(*bonds.Lot)) bonds.Lot {
	t.Helper()

	lot := bonds.Lot{
		Bond:         bonds.Bond{Type: bonds.LTN, Maturity: date(2030, time.January, 1)},
		PurchaseDate: date(2026, time.October, 20),
		Rate:         mustDecimal(t, "0.1288"),
		UnitPrice:    mustDecimal(t, "700.123456"),
		Quantity:     mustDecimal(t, "1.5"),
	}

	if edit != nil {
		edit(&lot)
	}

	return lot
}

func TestLotValidateAcceptsALotThatBreaksNoRule(t *testing.T) {
	t.Parallel()

	tests := []struct {
		name string
		edit func(*bonds.Lot)
	}{
		{name: "LTN", edit: nil},
		{name: "purchased today", edit: func(l *bonds.Lot) { l.PurchaseDate = date(2026, time.October, 27) }},
		{name: "NTN-F maturing in January", edit: func(l *bonds.Lot) {
			l.Bond = bonds.Bond{Type: bonds.NTNF, Maturity: date(2035, time.January, 1)}
		}},
		{name: "NTN-F maturing in July", edit: func(l *bonds.Lot) {
			l.Bond = bonds.Bond{Type: bonds.NTNF, Maturity: date(2035, time.July, 1)}
		}},
		{name: "NTN-B Principal", edit: func(l *bonds.Lot) {
			l.Bond = bonds.Bond{Type: bonds.NTNBPrincipal, Maturity: date(2035, time.May, 15)}
		}},
		{name: "NTN-B", edit: func(l *bonds.Lot) {
			l.Bond = bonds.Bond{Type: bonds.NTNB, Maturity: date(2040, time.August, 15)}
		}},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			t.Parallel()

			assert.Empty(t, validLot(t, tt.edit).Validate(date(2026, time.October, 27)))
		})
	}
}

func TestLotValidateReturnsEveryRuleTheLotBreaksInFieldOrder(t *testing.T) {
	t.Parallel()

	tests := []struct {
		name string
		edit func(*bonds.Lot)
		want []bonds.Violation
	}{
		{
			name: "purchased after today",
			edit: func(l *bonds.Lot) { l.PurchaseDate = date(2026, time.October, 28) },
			want: []bonds.Violation{{Field: "purchase_date", Reason: "must not be after today"}},
		},
		{
			name: "maturing on the purchase date",
			edit: func(l *bonds.Lot) { l.Bond.Maturity = l.PurchaseDate },
			want: []bonds.Violation{
				{Field: "maturity", Reason: "must be after the purchase date"},
				{Field: "maturity", Reason: "must be the 1st of a month"},
			},
		},
		{
			name: "maturing before the purchase date",
			edit: func(l *bonds.Lot) { l.Bond.Maturity = date(2026, time.October, 1) },
			want: []bonds.Violation{{Field: "maturity", Reason: "must be after the purchase date"}},
		},
		{
			name: "LTN not maturing on the 1st",
			edit: func(l *bonds.Lot) { l.Bond.Maturity = date(2030, time.January, 2) },
			want: []bonds.Violation{{Field: "maturity", Reason: "must be the 1st of a month"}},
		},
		{
			name: "NTN-F maturing on the 15th",
			edit: func(l *bonds.Lot) { l.Bond = bonds.Bond{Type: bonds.NTNF, Maturity: date(2030, time.January, 15)} },
			want: []bonds.Violation{{Field: "maturity", Reason: "must be the 1st of January or July"}},
		},
		{
			name: "NTN-F maturing on the 1st of another month",
			edit: func(l *bonds.Lot) { l.Bond = bonds.Bond{Type: bonds.NTNF, Maturity: date(2030, time.March, 1)} },
			want: []bonds.Violation{{Field: "maturity", Reason: "must be the 1st of January or July"}},
		},
		{
			name: "NTN-B Principal maturing on the 1st",
			edit: func(l *bonds.Lot) { l.Bond = bonds.Bond{Type: bonds.NTNBPrincipal, Maturity: date(2035, time.May, 1)} },
			want: []bonds.Violation{{Field: "maturity", Reason: "must be the 15th of a month"}},
		},
		{
			name: "NTN-B maturing on the 14th",
			edit: func(l *bonds.Lot) { l.Bond = bonds.Bond{Type: bonds.NTNB, Maturity: date(2040, time.August, 14)} },
			want: []bonds.Violation{{Field: "maturity", Reason: "must be the 15th of a month"}},
		},
		{
			name: "unit price of zero",
			edit: func(l *bonds.Lot) { l.UnitPrice = mustDecimal(t, "0") },
			want: []bonds.Violation{{Field: "unit_price", Reason: "must be greater than zero"}},
		},
		{
			name: "negative unit price",
			edit: func(l *bonds.Lot) { l.UnitPrice = mustDecimal(t, "-700") },
			want: []bonds.Violation{{Field: "unit_price", Reason: "must be greater than zero"}},
		},
		{
			name: "quantity of zero",
			edit: func(l *bonds.Lot) { l.Quantity = mustDecimal(t, "0.00") },
			want: []bonds.Violation{{Field: "quantity", Reason: "must be greater than zero"}},
		},
		{
			name: "negative quantity",
			edit: func(l *bonds.Lot) { l.Quantity = mustDecimal(t, "-1") },
			want: []bonds.Violation{{Field: "quantity", Reason: "must be greater than zero"}},
		},
		{
			name: "everything wrong at once",
			edit: func(l *bonds.Lot) {
				l.Bond.Maturity = date(2020, time.January, 2)
				l.PurchaseDate = date(2026, time.October, 28)
				l.UnitPrice = mustDecimal(t, "0")
				l.Quantity = mustDecimal(t, "-1")
			},
			want: []bonds.Violation{
				{Field: "maturity", Reason: "must be after the purchase date"},
				{Field: "maturity", Reason: "must be the 1st of a month"},
				{Field: "purchase_date", Reason: "must not be after today"},
				{Field: "unit_price", Reason: "must be greater than zero"},
				{Field: "quantity", Reason: "must be greater than zero"},
			},
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			t.Parallel()

			assert.Equal(t, tt.want, validLot(t, tt.edit).Validate(date(2026, time.October, 27)))
		})
	}
}
