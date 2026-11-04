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
// installments due on the 19th, at 10.06% effective a year. A "lower the installment" prepayment
// on 2024-12-17 first updates the balance pro rata die for the 29 days since signing, by 29/30 of
// the TR of 2024-11-19 to 2024-12-19 (0.0742%): 451.87, rounded down. Caixa's update was 455.55,
// so the 1,350.00 prepayment left it 629,105.55, installment 1's amortization plus the balance
// after it less its correction of 43.57, and 3.68 more than computed. A statement on 2024-12-18
// pins Caixa's balance. Installment 1 is updated for the 2 days since the prepayment by 2/30 of
// the TR of 2024-12-19 to 2025-01-19 (0.1039%), rounded down; the later ones by the TR of each
// period between due dates, which is SGS 226.
// The bank records MIP and DFI as one figure, so their rates are the pair that best fits it on
// installments 1 to 6, MIP on the corrected balance and DFI on the appraisal value corrected by TR
// (#70).
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
		MIPRates:             []mortgage.MonthlyRate{{EffectiveFrom: signed, Rate: dec(t, "0.0001584")}},
		DFIRates:             []mortgage.MonthlyRate{{EffectiveFrom: signed, Rate: dec(t, "0.00006394")}},
		Fees:                 []mortgage.Fee{{EffectiveFrom: signed, Amount: dec(t, "25.00")}},
	}
	outlook := indexes.NewOutlook(map[indexes.Index][]indexes.Value{indexes.TR: {
		published(t, "2024-11-19", "2024-12-19", "0.0742"),
		published(t, "2024-12-19", "2025-01-19", "0.1039"),
		published(t, "2025-01-19", "2025-02-19", "0.1694"),
		published(t, "2025-02-19", "2025-03-19", "0.0741"),
		published(t, "2025-03-19", "2025-04-19", "0.1722"),
		published(t, "2025-04-19", "2025-05-19", "0.1115"),
	}}, indexes.Expectations{}, nil)
	events := mortgage.Events{
		Prepayments: []mortgage.Prepayment{prepayment(t, "2024-12-17", "1350.00", mortgage.LowerInstallment)},
		Statements:  []mortgage.Statement{statement(t, "2024-12-18", "629105.55")},
	}
	today := date(t, "2025-05-19")

	drifts := terms.Drifts(outlook, events, today)
	require.Len(t, drifts, 1)
	assert.Equal(t, "629101.87", drifts[0].ComputedBalance.String(), "balance the prepayment left")
	assert.Equal(t, "3.68", drifts[0].Amount.String(), "drift from Caixa's balance")

	recorded := loadRecordedInstallments(t, "caixa_tr_sac_installments.csv")

	computed := make(map[int]mortgage.Installment, len(recorded))
	for m := range terms.Schedule(outlook, events, today) {
		if m.Number > len(recorded) {
			break
		}

		computed[m.Number] = m
	}

	assert.Equal(t, "43.57", computed[1].Correction.String(), "installment 1 correction")

	for _, want := range recorded {
		got, ok := computed[want.number]
		require.True(t, ok, "installment %d", want.number)

		assert.Equal(t, want.dueDate, got.DueDate.Format(time.DateOnly), "installment %d due date", want.number)
		assertWithinTolerance(t, fmt.Sprintf("installment %d amount", want.number), want.amount, got.Amount)
		assertWithinTolerance(t, fmt.Sprintf("installment %d outstanding balance", want.number),
			want.outstandingBalance, got.OutstandingBalance)
	}
}
