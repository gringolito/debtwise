package mortgage_test

import (
	"testing"
	"time"

	"github.com/stretchr/testify/assert"

	"github.com/gringolito/debtwise/backend/indexes"
	"github.com/gringolito/debtwise/backend/mortgage"
)

// outcome is a prepayment's outcome as text.
type outcome struct {
	Date                 string
	MonthsShortened      int
	InstallmentReduction string
}

// outcomesOf replays events and returns what each prepayment changed, and the totals.
func outcomesOf(terms mortgage.Terms, events mortgage.Events) (outcomes []outcome, amount string, months int) {
	got := terms.PrepaymentOutcomes(indexes.Outlook{}, events, time.Time{})

	outcomes = make([]outcome, 0, len(got.Prepayments))
	for _, o := range got.Prepayments {
		outcomes = append(outcomes, outcome{
			Date:                 o.Prepayment.Date.Format(time.DateOnly),
			MonthsShortened:      o.MonthsShortened,
			InstallmentReduction: o.InstallmentReduction.String(),
		})
	}

	return outcomes, got.TotalAmount.String(), got.MonthsShortened
}

// sacTerms' installments are 10,610.00, 10,510.00, 10,410.00, 10,310.00, 10,210.00 and 10,110.00.
// Each prepayment is compared with the schedule that has the ones before it. The 20,000.00 on
// February 10 ends the schedule two months early and takes 200.00 off the 3rd installment, which
// becomes 10,210.00. The 5,000.00 on March 20 then finds a 4th installment of 10,110.00, and
// lowers it to 5,060.00, the 5,000.00 left amortized plus 50.00 interest and the 10.00 fee.
func TestPrepaymentOutcomesAreSequential(t *testing.T) {
	t.Parallel()

	events := mortgage.Events{Prepayments: []mortgage.Prepayment{
		prepayment(t, "2024-02-10", "20000.00", mortgage.ShortenTerm),
		prepayment(t, "2024-03-20", "5000.00", mortgage.LowerInstallment),
	}}

	outcomes, amount, months := outcomesOf(sacTerms(t), events)

	assert.Equal(t, []outcome{
		{Date: "2024-02-10", MonthsShortened: 2, InstallmentReduction: "200.00"},
		{Date: "2024-03-20", MonthsShortened: 0, InstallmentReduction: "5050.00"},
	}, outcomes)
	assert.Equal(t, "25000.00", amount)
	assert.Equal(t, 2, months)
}

func TestPrepaymentOutcomesOfAMortgageWithoutPrepayments(t *testing.T) {
	t.Parallel()

	events := mortgage.Events{Statements: []mortgage.Statement{statement(t, "2024-02-20", "40123.45")}}

	outcomes, amount, months := outcomesOf(sacTerms(t), events)

	assert.Equal(t, []outcome{}, outcomes)
	assert.Equal(t, "0.00", amount)
	assert.Equal(t, 0, months)
}

// The bank stated 49,000.00 on January 20, 1,000.00 less than computed, so the schedule goes on
// from it: 9,800.00 a month over 5 months, the 3rd installment 10,202.00. Prepaying 19,600.00 on the
// 2nd installment's due date leaves 19,600.00, which 2 months of 9,800.00 amortize, so the 3rd
// installment falls to 10,006.00 and the schedule ends 2 months early.
func TestPrepaymentOutcomesReplayTheStatements(t *testing.T) {
	t.Parallel()

	events := mortgage.Events{
		Prepayments: []mortgage.Prepayment{prepayment(t, "2024-02-10", "19600.00", mortgage.ShortenTerm)},
		Statements:  []mortgage.Statement{statement(t, "2024-01-20", "49000.00")},
	}

	outcomes, amount, months := outcomesOf(sacTerms(t), events)

	assert.Equal(t, []outcome{{Date: "2024-02-10", MonthsShortened: 2, InstallmentReduction: "196.00"}}, outcomes)
	assert.Equal(t, "19600.00", amount)
	assert.Equal(t, 2, months)
}

// A prepayment that pays off everything owed on January 20 leaves no 2nd installment: the schedule
// ends after the 1st, 5 installments early, and the 10,510.00 it would have charged is not paid. A
// prepayment after that takes nothing off, and so changes nothing.
func TestPrepaymentOutcomesOfPrepaymentsThatPayOffOrComeTooLate(t *testing.T) {
	t.Parallel()

	events := mortgage.Events{Prepayments: []mortgage.Prepayment{
		prepayment(t, "2024-01-20", "100000.00", mortgage.ShortenTerm),
		prepayment(t, "2024-07-01", "1000.00", mortgage.ShortenTerm),
	}}

	outcomes, amount, months := outcomesOf(sacTerms(t), events)

	assert.Equal(t, []outcome{
		{Date: "2024-01-20", MonthsShortened: 5, InstallmentReduction: "10510.00"},
		{Date: "2024-07-01", MonthsShortened: 0, InstallmentReduction: "0.00"},
	}, outcomes)
	assert.Equal(t, "101000.00", amount)
	assert.Equal(t, 5, months)
}

// No installment is due after the 6th's due date, so a prepayment then has none to lower.
func TestPrepaymentOutcomeAfterTheLastInstallment(t *testing.T) {
	t.Parallel()

	events := mortgage.Events{Prepayments: []mortgage.Prepayment{
		prepayment(t, "2024-07-01", "1000.00", mortgage.LowerInstallment),
	}}

	outcomes, amount, months := outcomesOf(sacTerms(t), events)

	assert.Equal(t, []outcome{{Date: "2024-07-01", MonthsShortened: 0, InstallmentReduction: "0.00"}}, outcomes)
	assert.Equal(t, "1000.00", amount)
	assert.Equal(t, 0, months)
}
