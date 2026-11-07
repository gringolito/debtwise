package mortgage_test

import (
	"testing"
	"time"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"github.com/gringolito/debtwise/backend/decimal"
	"github.com/gringolito/debtwise/backend/indexes"
	"github.com/gringolito/debtwise/backend/mortgage"
)

// previewed is a prepayment preview as text. The installments are empty when there is none.
type previewed struct {
	CurrentPayoff, Payoff           string
	CurrentInstallment, Installment string
}

func installmentText(amount *decimal.Decimal) string {
	if amount == nil {
		return ""
	}

	return amount.String()
}

// sacTerms' installments are 10,610.00, 10,510.00, 10,410.00, 10,310.00, 10,210.00 and 10,110.00,
// the last due on June 10.
func TestPreviewPrepayment(t *testing.T) {
	t.Parallel()

	recorded := mortgage.Prepayment{
		ID: 1, Date: date(t, "2024-02-10"), Amount: dec(t, "20000.00"), Effect: mortgage.ShortenTerm,
	}

	tests := []struct {
		name     string
		recorded mortgage.Events
		previews mortgage.Prepayment
		replaces int64
		want     previewed
	}{
		{
			name:     "a new prepayment ends the schedule two months early and lowers the 3rd installment",
			previews: prepayment(t, "2024-02-10", "20000.00", mortgage.ShortenTerm),
			want: previewed{
				CurrentPayoff: "2024-06-10", Payoff: "2024-04-10",
				CurrentInstallment: "10410.00", Installment: "10210.00",
			},
		},
		{
			// 10,000.00 off leaves 30,000.00 for the 4 months left: 7,500.00 amortization, 300.00
			// interest and the 10.00 fee on the 3rd installment.
			name:     "replacing a prepayment compares the schedule without it",
			recorded: mortgage.Events{Prepayments: []mortgage.Prepayment{recorded}},
			previews: prepayment(t, "2024-02-10", "10000.00", mortgage.LowerInstallment),
			replaces: 1,
			want: previewed{
				CurrentPayoff: "2024-04-10", Payoff: "2024-06-10",
				CurrentInstallment: "10210.00", Installment: "7810.00",
			},
		},
		{
			name:     "a prepayment that replaces none is added to the recorded ones",
			recorded: mortgage.Events{Prepayments: []mortgage.Prepayment{recorded}},
			previews: prepayment(t, "2024-03-20", "5000.00", mortgage.LowerInstallment),
			want: previewed{
				CurrentPayoff: "2024-04-10", Payoff: "2024-04-10",
				CurrentInstallment: "10110.00", Installment: "5060.00",
			},
		},
		{
			// The recorded 20,000.00 lowers the installment: 4 months left of 5,000.00 each, the 3rd
			// 5,210.00. Shortening the term by 10,000.00 after it leaves 10,000.00, which 2 months of
			// 5,000.00 amortize: the 3rd falls to 5,110.00 and the schedule ends on April 10. Had the
			// shortening applied first, 30,000.00 would take 3 months of 10,000.00, and the lowering
			// that follows would leave 3,333.33 a month, ending on May 10.
			name: "a new prepayment applies after the recorded ones of its date",
			recorded: mortgage.Events{Prepayments: []mortgage.Prepayment{
				{ID: 1, Date: date(t, "2024-02-10"), Amount: dec(t, "20000.00"), Effect: mortgage.LowerInstallment},
			}},
			previews: prepayment(t, "2024-02-10", "10000.00", mortgage.ShortenTerm),
			want: previewed{
				CurrentPayoff: "2024-06-10", Payoff: "2024-04-10",
				CurrentInstallment: "5210.00", Installment: "5110.00",
			},
		},
		{
			name:     "a prepayment after the last installment has none to change",
			previews: prepayment(t, "2024-07-01", "1000.00", mortgage.ShortenTerm),
			want:     previewed{CurrentPayoff: "2024-06-10", Payoff: "2024-06-10"},
		},
		{
			name:     "a prepayment that pays off the mortgage leaves no installment after it",
			previews: prepayment(t, "2024-01-20", "100000.00", mortgage.ShortenTerm),
			want: previewed{
				CurrentPayoff: "2024-06-10", Payoff: "2024-01-10", CurrentInstallment: "10510.00",
			},
		},
		{
			name:     "a prepayment that pays off the mortgage before the 1st installment pays it off that day",
			previews: prepayment(t, "2023-12-20", "100000.00", mortgage.ShortenTerm),
			want: previewed{
				CurrentPayoff: "2024-06-10", Payoff: "2023-12-20", CurrentInstallment: "10610.00",
			},
		},
		{
			name: "a mortgage a statement already paid off before the 1st installment was paid off that day",
			recorded: mortgage.Events{
				Statements: []mortgage.Statement{statement(t, "2023-12-20", "0.00")},
			},
			previews: prepayment(t, "2024-01-20", "1000.00", mortgage.ShortenTerm),
			want:     previewed{CurrentPayoff: "2023-12-20", Payoff: "2023-12-20"},
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			t.Parallel()

			got, err := sacTerms(t).PreviewPrepayment(indexes.Outlook{}, tt.recorded, time.Time{}, tt.previews, tt.replaces)

			require.NoError(t, err)
			assert.Equal(t, tt.want, previewed{
				CurrentPayoff:      got.CurrentPayoff.Format(time.DateOnly),
				Payoff:             got.Payoff.Format(time.DateOnly),
				CurrentInstallment: installmentText(got.CurrentInstallment),
				Installment:        installmentText(got.Installment),
			})
		})
	}
}

func TestPreviewPrepaymentReplacingAnUnknownPrepayment(t *testing.T) {
	t.Parallel()

	recorded := mortgage.Events{Prepayments: []mortgage.Prepayment{
		{ID: 1, Date: date(t, "2024-02-10"), Amount: dec(t, "20000.00"), Effect: mortgage.ShortenTerm},
	}}

	_, err := sacTerms(t).PreviewPrepayment(indexes.Outlook{}, recorded, time.Time{},
		prepayment(t, "2024-02-10", "10000.00", mortgage.ShortenTerm), 9)

	assert.ErrorIs(t, err, mortgage.ErrPrepaymentNotFound)
}

func TestPreviewStatement(t *testing.T) {
	t.Parallel()

	recorded := mortgage.Events{Statements: []mortgage.Statement{
		{ID: 1, Date: date(t, "2024-02-20"), OutstandingBalance: dec(t, "40123.45")},
		{ID: 2, Date: date(t, "2024-05-20"), OutstandingBalance: dec(t, "10000.00")},
	}}

	tests := []struct {
		name         string
		recorded     mortgage.Events
		previews     mortgage.Statement
		replaces     int64
		wantComputed string
		wantDrift    string
	}{
		{
			name:         "a statement is compared with the balance the schedule computes for its date",
			previews:     statement(t, "2024-02-20", "40123.45"),
			wantComputed: "40000.00",
			wantDrift:    "123.45",
		},
		{
			name:         "a statement is compared after the statements before it",
			recorded:     recorded,
			previews:     statement(t, "2024-05-15", "10000.00"),
			wantComputed: "10030.86",
			wantDrift:    "-30.86",
		},
		{
			name:         "replacing a statement leaves out the one it replaces",
			recorded:     recorded,
			previews:     statement(t, "2024-03-20", "30001.00"),
			replaces:     1,
			wantComputed: "30000.00",
			wantDrift:    "1.00",
		},
		{
			name:         "replacing a statement keeps its date",
			recorded:     recorded,
			previews:     statement(t, "2024-02-20", "40000.50"),
			replaces:     1,
			wantComputed: "40000.00",
			wantDrift:    "0.50",
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			t.Parallel()

			got, err := sacTerms(t).PreviewStatement(indexes.Outlook{}, tt.recorded, time.Time{}, tt.previews, tt.replaces)

			require.NoError(t, err)
			assert.Equal(t, tt.wantComputed, got.ComputedBalance.String())
			assert.Equal(t, tt.wantDrift, got.Amount.String())
			assert.Equal(t, tt.previews.OutstandingBalance.String(), got.Statement.OutstandingBalance.String())
		})
	}
}

func TestPreviewStatementFailures(t *testing.T) {
	t.Parallel()

	recorded := mortgage.Events{Statements: []mortgage.Statement{
		{ID: 1, Date: date(t, "2024-02-20"), OutstandingBalance: dec(t, "40123.45")},
		{ID: 2, Date: date(t, "2024-05-20"), OutstandingBalance: dec(t, "10000.00")},
	}}

	tests := []struct {
		name     string
		previews mortgage.Statement
		replaces int64
		want     error
	}{
		{
			name:     "another statement is on the date",
			previews: statement(t, "2024-02-20", "1.00"),
			want:     mortgage.ErrStatementDateTaken,
		},
		{
			name:     "moved onto another statement's date",
			previews: statement(t, "2024-02-20", "1.00"),
			replaces: 2,
			want:     mortgage.ErrStatementDateTaken,
		},
		{
			name:     "replacing a statement that is not recorded",
			previews: statement(t, "2024-03-20", "1.00"),
			replaces: 9,
			want:     mortgage.ErrStatementNotFound,
		},
		{
			// The store answers the same for an edit, which checks the date before the ID.
			name:     "replacing a statement that is not recorded, on a date another has",
			previews: statement(t, "2024-02-20", "1.00"),
			replaces: 9,
			want:     mortgage.ErrStatementDateTaken,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			t.Parallel()

			_, err := sacTerms(t).PreviewStatement(indexes.Outlook{}, recorded, time.Time{}, tt.previews, tt.replaces)

			assert.ErrorIs(t, err, tt.want)
		})
	}
}
