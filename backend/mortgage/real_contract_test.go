package mortgage_test

import (
	"encoding/csv"
	"fmt"
	"os"
	"strconv"
	"testing"
	"time"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"github.com/gringolito/debtwise/backend/decimal"
	"github.com/gringolito/debtwise/backend/indexes"
	"github.com/gringolito/debtwise/backend/mortgage"
)

// recordedInstallment is one installment as the bank's records show it.
type recordedInstallment struct {
	number             int
	dueDate            string
	insurance          decimal.Decimal
	amount             decimal.Decimal
	outstandingBalance decimal.Decimal
}

func loadRecordedInstallments(t *testing.T, name string) []recordedInstallment {
	t.Helper()

	root, err := os.OpenRoot("testdata")
	require.NoError(t, err)

	defer func() { _ = root.Close() }()

	f, err := root.Open(name)
	require.NoError(t, err)

	defer func() { _ = f.Close() }()

	reader := csv.NewReader(f)
	reader.Comment = '#'

	records, err := reader.ReadAll()
	require.NoError(t, err)
	require.NotEmpty(t, records)

	installments := make([]recordedInstallment, 0, len(records)-1)
	for _, record := range records[1:] {
		number, err := strconv.Atoi(record[0])
		require.NoError(t, err)

		installments = append(installments, recordedInstallment{
			number:             number,
			dueDate:            record[1],
			insurance:          dec(t, record[4]),
			amount:             dec(t, record[6]),
			outstandingBalance: dec(t, record[7]),
		})
	}

	return installments
}

// assertWithinTolerance asserts that what's figure got is within 0.001% of the recorded want.
func assertWithinTolerance(t *testing.T, what string, want, got decimal.Decimal) {
	t.Helper()

	diff := got.Sub(want)
	if diff.Cmp(decimal.Decimal{}) < 0 {
		diff = diff.Mul(decimal.FromInt(-1))
	}

	assert.LessOrEqual(t, diff.Mul(decimal.FromInt(100_000)).Cmp(want), 0,
		"%s: got %s, want %s within 0.001%%", what, got, want)
}

// The contract is TR-indexed SAC, 630,000.00 over 420 months, signed on 2024-11-18 with
// installments due on the 19th, at 10.06% effective a year. The installment 1 balance is the
// bank's: its records leave out how much of the 2024-12-17 prepayment reached the principal and
// what corrected installment 1 (#38), so a statement on 2024-12-18 pins it to installment 1's
// amortization plus the balance after it. TR is SGS 226 for each period between due dates.
// Insurance is left out of the amount: the bank's doesn't follow the balance (#70).
func TestScheduleMatchesARealContractsInstallments(t *testing.T) {
	t.Parallel()

	signed := date(t, "2024-11-18")
	terms := mortgage.Terms{
		ContractDate:         signed,
		OriginalAmount:       dec(t, "630000.00"),
		TermMonths:           420,
		FirstInstallmentDate: date(t, "2024-12-19"),
		AmortizationSystem:   mortgage.SAC,
		Indexer:              mortgage.TR,
		AppraisalValue:       dec(t, "1426000.00"),
		ContractRates:        []mortgage.ContractRate{{EffectiveFrom: signed, Rate: dec(t, "0.1006"), Basis: mortgage.Effective}},
		MIPRates:             []mortgage.MonthlyRate{{EffectiveFrom: signed, Rate: dec(t, "0")}},
		DFIRates:             []mortgage.MonthlyRate{{EffectiveFrom: signed, Rate: dec(t, "0")}},
		Fees:                 []mortgage.Fee{{EffectiveFrom: signed, Amount: dec(t, "25.00")}},
	}
	outlook := indexes.NewOutlook(map[indexes.Index][]indexes.Value{indexes.TR: {
		published(t, "2024-12-19", "2025-01-19", "0.1039"),
		published(t, "2025-01-19", "2025-02-19", "0.1694"),
		published(t, "2025-02-19", "2025-03-19", "0.0741"),
		published(t, "2025-03-19", "2025-04-19", "0.1722"),
		published(t, "2025-04-19", "2025-05-19", "0.1115"),
	}}, indexes.Expectations{}, nil)
	events := mortgage.Events{Statements: []mortgage.Statement{
		{Date: date(t, "2024-12-18"), OutstandingBalance: dec(t, "629149.12")},
	}}

	recorded := loadRecordedInstallments(t, "caixa_tr_sac_installments.csv")

	computed := make(map[int]mortgage.Installment, len(recorded))
	for m := range terms.Schedule(outlook, events, date(t, "2025-05-19")) {
		if m.Number > len(recorded) {
			break
		}

		computed[m.Number] = m
	}

	for _, want := range recorded {
		got, ok := computed[want.number]
		require.True(t, ok, "installment %d", want.number)

		assert.Equal(t, want.dueDate, got.DueDate.Format(time.DateOnly), "installment %d due date", want.number)
		assertWithinTolerance(t, fmt.Sprintf("installment %d amount without insurance", want.number),
			want.amount.Sub(want.insurance), got.Amount)
		assertWithinTolerance(t, fmt.Sprintf("installment %d outstanding balance", want.number),
			want.outstandingBalance, got.OutstandingBalance)
	}
}
