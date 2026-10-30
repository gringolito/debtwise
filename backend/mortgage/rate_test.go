package mortgage_test

import (
	"fmt"
	"strings"
	"testing"
	"time"

	"github.com/stretchr/testify/assert"

	"github.com/gringolito/debtwise/backend/indexes"
	"github.com/gringolito/debtwise/backend/mortgage"
)

// ratedRow is an installment as text with the effective annual rate its interest was charged at,
// the index values behind its correction and those behind its rate, written as indexedRow writes
// them.
type ratedRow struct {
	Number     int
	Correction string
	Interest   string
	Rate       string
	Index      string
	RateIndex  string
}

func indexValuesText(values []mortgage.IndexValue) string {
	texts := make([]string, 0, len(values))

	for _, v := range values {
		value := v.Value.String()
		if v.Missing {
			value = "missing"
		}

		texts = append(texts, fmt.Sprintf("%s %s %s..%s%s", v.Index, value,
			v.PeriodStart.Format(time.DateOnly), v.PeriodEnd.Format(time.DateOnly), methodsText(v.Methods)))
	}

	return strings.Join(texts, "; ")
}

func ratedSchedule(terms mortgage.Terms, outlook indexes.Outlook, today time.Time) []ratedRow {
	var rows []ratedRow

	for m := range terms.Schedule(outlook, mortgage.Events{}, today) {
		rows = append(rows, ratedRow{
			Number:     m.Number,
			Correction: m.Correction.String(),
			Interest:   m.Interest.String(),
			Rate:       m.Rate.String(),
			Index:      indexValuesText(m.IndexValues),
			RateIndex:  indexValuesText(m.RateIndexValues),
		})
	}

	return rows
}

// poupancaLinkedSAC lends amount under SAC over months, installments on the 10th from February
// 2024, at a contract rate of 3.89% effective a year plus the poupança yield's additional part. It
// charges no insurance or fee.
func poupancaLinkedSAC(t *testing.T, indexer mortgage.Indexer, amount string, months int) mortgage.Terms {
	t.Helper()

	return mortgage.Terms{
		ContractDate:         date(t, "2024-01-10"),
		OriginalAmount:       dec(t, amount),
		TermMonths:           months,
		FirstInstallmentDate: date(t, "2024-02-10"),
		AmortizationSystem:   mortgage.SAC,
		Indexer:              indexer,
		AppraisalValue:       dec(t, "200000.00"),
		ContractRates: []mortgage.ContractRate{{
			EffectiveFrom: date(t, "2024-01-10"), Rate: dec(t, "0.0389"), Basis: mortgage.Effective, PoupancaAdditional: true,
		}},
		MIPRates: []mortgage.MonthlyRate{{EffectiveFrom: date(t, "2024-01-10"), Rate: dec(t, "0")}},
		DFIRates: []mortgage.MonthlyRate{{EffectiveFrom: date(t, "2024-01-10"), Rate: dec(t, "0")}},
		Fees:     []mortgage.Fee{{EffectiveFrom: date(t, "2024-01-10"), Amount: dec(t, "0")}},
	}
}

// Each installment's rate adds to the fixed 3.89% the poupança yield's additional part of the
// month that ends on its due date, set by the Selic target on the month's first day and turned
// into an effective annual rate. With the target at 11.75%, above 8.5%, the part is 0.5% a month,
// 6.1678% a year, so the rate is 10.0578%. At 8.5% and at 7.75% the part is 70% of the target as a
// monthly rate, rounded at 4 places: 0.4828% and 0.4412% a month. TR alone corrects the balance:
// the 2nd installment's correction is 0.05% of 20,000.00. Figures worked out independently with
// python's decimal.
func TestPoupancaLinkedRateAddsTheAdditionalPartOfEachMonth(t *testing.T) {
	t.Parallel()

	history := outlookOf(publishedValues{
		indexes.TR: {
			published(t, "2024-01-10", "2024-02-10", "0.0300"),
			published(t, "2024-02-10", "2024-03-10", "0.0500"),
			published(t, "2024-03-10", "2024-04-10", "0.0000"),
		},
		indexes.SelicTarget: {
			published(t, "2024-01-10", "2024-01-10", "11.75"),
			published(t, "2024-02-10", "2024-02-10", "8.50"),
			published(t, "2024-03-10", "2024-03-10", "7.75"),
		},
	})

	assert.Equal(t, []ratedRow{
		{
			1, "0.00", "240.55", "0.1005778118644995687897076174316406",
			"", "selic_target 11.75 2024-01-10..2024-01-10",
		},
		{
			2, "10.00", "157.12", "0.09839946209275988313680493669517718",
			"tr 0.0500 2024-02-10..2024-03-10", "selic_target 8.50 2024-02-10..2024-02-10",
		},
		{
			3, "0.00", "74.53", "0.09314782222766095662103739171089309",
			"tr 0.0000 2024-03-10..2024-04-10", "selic_target 7.75 2024-03-10..2024-03-10",
		},
	}, ratedSchedule(poupancaLinkedSAC(t, mortgage.TR, "30000.00", 3), history, date(t, "2026-10-25")))
}

// The rate reads the month that ends on each due date, not the contract's anniversary month: signed
// on 2024-01-05 with installments on the 10th, the 1st installment reads the Selic target of
// 2024-01-10, not of 2024-01-05. A fixed part printed as 12% nominal is 12.6825% effective before
// the additional part is added to it. Under Price, the installment is levelled again whenever the
// additional part changes the rate. Figures worked out independently with python's decimal.
func TestPoupancaLinkedPriceRateReadsTheMonthOfEachDueDate(t *testing.T) {
	t.Parallel()

	terms := poupancaLinkedSAC(t, mortgage.NoIndexer, "30000.00", 3)
	terms.ContractDate = date(t, "2024-01-05")
	terms.AmortizationSystem = mortgage.Price
	terms.ContractRates[0] = mortgage.ContractRate{
		EffectiveFrom: date(t, "2024-01-05"), Rate: dec(t, "0.12"), Basis: mortgage.Nominal, PoupancaAdditional: true,
	}

	history := outlookOf(publishedValues{indexes.SelicTarget: {
		published(t, "2024-01-05", "2024-01-05", "7.00"),
		published(t, "2024-01-10", "2024-01-10", "11.75"),
		published(t, "2024-02-05", "2024-02-05", "7.00"),
		published(t, "2024-02-10", "2024-02-10", "8.50"),
		published(t, "2024-03-05", "2024-03-05", "7.00"),
		published(t, "2024-03-10", "2024-03-10", "7.75"),
	}})

	assert.Equal(t, []ratedRow{
		{
			1, "0.00", "434.86", "0.1885028419964692894509086174316406",
			"", "selic_target 11.75 2024-01-10..2024-01-10",
		},
		{
			2, "0.00", "288.86", "0.1863244922247296037980059366951772",
			"", "selic_target 8.50 2024-02-10..2024-02-10",
		},
		{
			3, "0.00", "141.66", "0.1810728523596306772822383917108931",
			"", "selic_target 7.75 2024-03-10..2024-03-10",
		},
	}, ratedSchedule(terms, history, date(t, "2026-10-25")))
}

// Shortening the term finds the fewest months at the rate of the next installment, the
// poupança-linked one: 40,000.00 prepaid after the 1st installment of a 6-month Price mortgage at
// 12% nominal plus the part of a Selic target at 11.75% leaves 10,356.30, paid off by the next
// installment alone. At the fixed part alone it would take two. Figures worked out independently
// with python's decimal.
func TestShortenedTermUsesThePoupancaLinkedRateOfTheNextInstallment(t *testing.T) {
	t.Parallel()

	terms := poupancaLinkedSAC(t, mortgage.NoIndexer, "60000.00", 6)
	terms.AmortizationSystem = mortgage.Price
	terms.ContractRates[0].Rate, terms.ContractRates[0].Basis = dec(t, "0.12"), mortgage.Nominal

	selic := make([]indexes.Value, 0, 6)

	for i := range 6 {
		day := date(t, "2024-01-10").AddDate(0, i, 0).Format(time.DateOnly)
		selic = append(selic, published(t, day, day, "11.75"))
	}

	events := mortgage.Events{Prepayments: []mortgage.Prepayment{
		{Date: date(t, "2024-02-10"), Amount: dec(t, "40000.00"), Effect: mortgage.ShortenTerm},
	}}

	var rows []replayed
	for m := range terms.Schedule(outlookOf(publishedValues{indexes.SelicTarget: selic}), events, date(t, "2026-10-25")) {
		rows = append(rows, replayed{
			Number:             m.Number,
			DueDate:            m.DueDate.Format(time.DateOnly),
			Interest:           m.Interest.String(),
			Amortization:       m.Amortization.String(),
			Amount:             m.Amount.String(),
			Prepaid:            m.Prepaid.String(),
			OutstandingBalance: m.OutstandingBalance.String(),
		})
	}

	assert.Equal(t, []replayed{
		{1, "2024-02-10", "869.72", "9643.70", "10513.42", "40000.00", "10356.30"},
		{2, "2024-03-10", "150.12", "10356.30", "10506.42", "0.00", "0.00"},
	}, rows)
}

// A rate without a variable part reads no index, and is charged as the contract prints it.
func TestFixedRateReadsNoIndex(t *testing.T) {
	t.Parallel()

	terms := poupancaLinkedSAC(t, mortgage.NoIndexer, "20000.00", 2)
	terms.ContractRates[0].PoupancaAdditional = false

	history := outlookOf(publishedValues{indexes.SelicTarget: {published(t, "2024-01-10", "2024-01-10", "11.75")}})

	assert.Equal(t, []ratedRow{
		{1, "0.00", "63.71", "0.0389", "", ""},
		{2, "0.00", "31.85", "0.0389", "", ""},
	}, ratedSchedule(terms, history, date(t, "2026-10-25")))
}

// On 2024-02-20 the 3rd installment, due 2024-04-10, reads the Selic target of 2024-03-10, after
// the latest published day, projected by the trailing 12 months (13.0833%): its rate records the
// method. The 2nd, not due yet either, reads the target published for 2024-02-10, and records none.
func TestFuturePoupancaLinkedRateRecordsTheSelicTargetMethod(t *testing.T) {
	t.Parallel()

	months := []string{
		"13.75", "13.75", "13.75", "13.75", "13.75", "13.75", "13.25", "12.75", "12.75", "12.25", "11.75", "11.75",
	}
	selic := make([]indexes.Value, 0, 2+len(months))
	selic = append(selic,
		published(t, "2024-01-10", "2024-01-10", "11.75"),
		published(t, "2024-02-10", "2024-02-10", "11.25"),
	)

	for i, v := range months {
		first := date(t, "2023-02-01").AddDate(0, i, 0).Format(time.DateOnly)
		selic = append(selic, published(t, first, first, v))
	}

	outlook := indexes.NewOutlook(publishedValues{indexes.SelicTarget: selic}, indexes.Expectations{},
		[]indexes.ProjectionMethod{{Index: indexes.SelicTarget, Method: indexes.Trailing12}})

	assert.Equal(t, []ratedRow{
		{
			1, "0.00", "240.55", "0.1005778118644995687897076174316406",
			"", "selic_target 11.75 2024-01-10..2024-01-10",
		},
		{
			2, "0.00", "160.37", "0.1005778118644995687897076174316406",
			"", "selic_target 11.25 2024-02-10..2024-02-10",
		},
		{
			3, "0.00", "80.18", "0.1005778118644995687897076174316406",
			"", "selic_target 13.0833 2024-03-10..2024-03-10 (selic_target trailing_12)",
		},
	}, ratedSchedule(poupancaLinkedSAC(t, mortgage.NoIndexer, "30000.00", 3), outlook, date(t, "2024-02-20")))
}

// A month whose Selic target is missing, or only projected for an installment that is due, leaves
// the poupança yield's additional part out of the rate, which is charged at its fixed part, and
// marks the Selic target missing. The 2nd installment, due 2024-03-10, reads the target of
// 2024-02-10.
func TestPoupancaLinkedRateWithoutTheSelicTargetChargesTheFixedPart(t *testing.T) {
	t.Parallel()

	trailing := make([]indexes.Value, 0, 13)
	trailing = append(trailing, published(t, "2024-01-10", "2024-01-10", "11.75"))

	for i := range 12 {
		first := date(t, "2023-01-01").AddDate(0, i, 0).Format(time.DateOnly)
		trailing = append(trailing, published(t, first, first, "13.75"))
	}

	tests := []struct {
		name    string
		outlook indexes.Outlook
	}{
		{
			name: "not published",
			outlook: outlookOf(publishedValues{indexes.SelicTarget: {
				published(t, "2024-01-10", "2024-01-10", "11.75"),
				published(t, "2024-02-09", "2024-02-09", "11.75"),
			}}),
		},
		{
			name: "only projected for a due installment",
			outlook: indexes.NewOutlook(publishedValues{indexes.SelicTarget: trailing}, indexes.Expectations{},
				[]indexes.ProjectionMethod{{Index: indexes.SelicTarget, Method: indexes.Trailing12}}),
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			t.Parallel()

			assert.Equal(t, []ratedRow{
				{
					1, "0.00", "160.37", "0.1005778118644995687897076174316406",
					"", "selic_target 11.75 2024-01-10..2024-01-10",
				},
				{2, "0.00", "31.85", "0.0389", "", "selic_target missing 2024-02-10..2024-02-10"},
			}, ratedSchedule(poupancaLinkedSAC(t, mortgage.NoIndexer, "20000.00", 2), tt.outlook, date(t, "2026-10-25")))
		})
	}
}
