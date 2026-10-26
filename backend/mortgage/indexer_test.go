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

// indexedRow is an installment as text with its indexer correction and the index values behind it,
// such as "tr 0.0218 2023-12-15..2024-01-15" or "tr missing 2024-01-15..2024-02-15", joined by
// "; ", or "" when no index value applies.
type indexedRow struct {
	Number             int
	Correction         string
	Interest           string
	Amortization       string
	MIP                string
	Amount             string
	OutstandingBalance string
	Index              string
}

func indexedSchedule(terms mortgage.Terms, history mortgage.History, today time.Time) []indexedRow {
	var rows []indexedRow

	for m := range terms.Schedule(history, today) {
		values := make([]string, 0, len(m.IndexValues))

		for _, v := range m.IndexValues {
			value := v.Value.String()
			if v.Missing {
				value = "missing"
			}

			values = append(values, fmt.Sprintf("%s %s %s..%s", v.Index, value,
				v.PeriodStart.Format(time.DateOnly), v.PeriodEnd.Format(time.DateOnly)))
		}

		rows = append(rows, indexedRow{
			Number:             m.Number,
			Correction:         m.Correction.String(),
			Interest:           m.Interest.String(),
			Amortization:       m.Amortization.String(),
			MIP:                m.MIP.String(),
			Amount:             m.Amount.String(),
			OutstandingBalance: m.OutstandingBalance.String(),
			Index:              strings.Join(values, "; "),
		})
	}

	return rows
}

// published is one index value as SGS publishes it, in percent.
func published(t *testing.T, start, end, value string) indexes.Value {
	t.Helper()

	return indexes.Value{PeriodStart: date(t, start), PeriodEnd: date(t, end), Value: dec(t, value)}
}

// indexedSAC lends amount under SAC over months at 1% a month, installments on the 15th from
// January 2024, corrected by indexer. It charges no insurance or fee.
func indexedSAC(t *testing.T, indexer mortgage.Indexer, amount string, months int) mortgage.Terms {
	t.Helper()

	return mortgage.Terms{
		ContractDate:         date(t, "2023-12-15"),
		OriginalAmount:       dec(t, amount),
		TermMonths:           months,
		FirstInstallmentDate: date(t, "2024-01-15"),
		AmortizationSystem:   mortgage.SAC,
		Indexer:              indexer,
		AppraisalValue:       dec(t, "200000.00"),
		ContractRates: []mortgage.ContractRate{
			{EffectiveFrom: date(t, "2023-12-15"), Rate: dec(t, "0.12"), Basis: mortgage.Nominal},
		},
		MIPRates: []mortgage.MonthlyRate{{EffectiveFrom: date(t, "2023-12-15"), Rate: dec(t, "0")}},
		DFIRates: []mortgage.MonthlyRate{{EffectiveFrom: date(t, "2023-12-15"), Rate: dec(t, "0")}},
		Fees:     []mortgage.Fee{{EffectiveFrom: date(t, "2023-12-15"), Amount: dec(t, "0")}},
	}
}

// publishedTR2024 is the TR SGS series 226 published for the monthly periods starting on the 15th,
// from December 2023 to November 2024. SGS also publishes shorter periods starting on the same
// day around month ends, such as the one starting on the 15th of January, which must not be read.
func publishedTR2024(t *testing.T) []indexes.Value {
	t.Helper()

	return []indexes.Value{
		published(t, "2023-12-15", "2024-01-15", "0.0218"),
		published(t, "2024-01-15", "2024-02-15", "0.0717"),
		published(t, "2024-01-15", "2024-02-14", "9.9999"),
		published(t, "2024-02-15", "2024-03-15", "0.0665"),
		published(t, "2024-03-15", "2024-04-15", "0.0519"),
		published(t, "2024-04-15", "2024-05-15", "0.0824"),
		published(t, "2024-05-15", "2024-06-15", "0.1143"),
		published(t, "2024-06-15", "2024-07-15", "0.0399"),
		published(t, "2024-07-15", "2024-08-15", "0.0744"),
		published(t, "2024-08-15", "2024-09-15", "0.0708"),
		published(t, "2024-09-15", "2024-10-15", "0.0694"),
		published(t, "2024-10-15", "2024-11-15", "0.1076"),
		published(t, "2024-11-15", "2024-12-15", "0.0660"),
	}
}

// Each month the balance grows by the period's TR before interest, amortization and MIP (0.03%)
// are charged on it. Figures worked out independently from the published TR.
func TestTRIndexedScheduleCorrectsTheBalanceWithPublishedTR(t *testing.T) {
	t.Parallel()

	terms := indexedSAC(t, mortgage.TR, "120000.00", 12)
	terms.MIPRates = []mortgage.MonthlyRate{{EffectiveFrom: date(t, "2023-12-15"), Rate: dec(t, "0.0003")}}

	rows := indexedSchedule(terms, mortgage.History{indexes.TR: publishedTR2024(t)}, date(t, "2026-10-25"))

	assert.Equal(t, []indexedRow{
		{1, "26.16", "1200.26", "10002.18", "36.01", "11238.45", "110023.98", "tr 0.0218 2023-12-15..2024-01-15"},
		{2, "78.89", "1101.03", "10009.35", "33.03", "11143.41", "100093.52", "tr 0.0717 2024-01-15..2024-02-15"},
		{3, "66.56", "1001.60", "10016.01", "30.05", "11047.66", "90144.07", "tr 0.0665 2024-02-15..2024-03-15"},
		{4, "46.78", "901.91", "10021.21", "27.06", "10950.18", "80169.64", "tr 0.0519 2024-03-15..2024-04-15"},
		{5, "66.06", "802.36", "10029.46", "24.07", "10855.89", "70206.24", "tr 0.0824 2024-04-15..2024-05-15"},
		{6, "80.25", "702.86", "10040.93", "21.09", "10764.88", "60245.56", "tr 0.1143 2024-05-15..2024-06-15"},
		{7, "24.04", "602.70", "10044.93", "18.08", "10665.71", "50224.67", "tr 0.0399 2024-06-15..2024-07-15"},
		{8, "37.37", "502.62", "10052.41", "15.08", "10570.11", "40209.63", "tr 0.0744 2024-07-15..2024-08-15"},
		{9, "28.47", "402.38", "10059.53", "12.07", "10473.98", "30178.57", "tr 0.0708 2024-08-15..2024-09-15"},
		{10, "20.94", "302.00", "10066.50", "9.06", "10377.56", "20133.01", "tr 0.0694 2024-09-15..2024-10-15"},
		{11, "21.66", "201.55", "10077.34", "6.05", "10284.94", "10077.33", "tr 0.1076 2024-10-15..2024-11-15"},
		{12, "6.65", "100.84", "10083.98", "3.03", "10187.85", "0.00", "tr 0.0660 2024-11-15..2024-12-15"},
	}, rows)
}

// The contract was signed on 2021-12-02. The Selic target was 7.75% when the first period started,
// so poupança paid TR plus 70% of Selic, and 9.25% from the second on, so it paid TR plus 0.5%.
// The yields are those SGS series 195 published for the same periods. Price levels the installment
// again on each corrected balance.
func TestPoupancaIndexedMonthsFollowTheSelicRule(t *testing.T) {
	t.Parallel()

	terms := mortgage.Terms{
		ContractDate:         date(t, "2021-12-02"),
		OriginalAmount:       dec(t, "30000.00"),
		TermMonths:           3,
		FirstInstallmentDate: date(t, "2022-01-02"),
		AmortizationSystem:   mortgage.Price,
		Indexer:              mortgage.PoupancaYield,
		AppraisalValue:       dec(t, "50000.00"),
		ContractRates: []mortgage.ContractRate{
			{EffectiveFrom: date(t, "2021-12-02"), Rate: dec(t, "0.12"), Basis: mortgage.Nominal},
		},
		MIPRates: []mortgage.MonthlyRate{{EffectiveFrom: date(t, "2021-12-02"), Rate: dec(t, "0")}},
		DFIRates: []mortgage.MonthlyRate{{EffectiveFrom: date(t, "2021-12-02"), Rate: dec(t, "0")}},
		Fees:     []mortgage.Fee{{EffectiveFrom: date(t, "2021-12-02"), Amount: dec(t, "0")}},
	}
	history := mortgage.History{
		indexes.TR: {
			published(t, "2021-12-02", "2022-01-02", "0.0326"),
			published(t, "2022-01-02", "2022-02-02", "0.0868"),
			published(t, "2022-02-02", "2022-03-02", "0.0000"),
		},
		indexes.SelicTarget: {
			published(t, "2021-12-01", "2021-12-01", "7.75"),
			published(t, "2021-12-02", "2021-12-02", "7.75"),
			published(t, "2022-01-02", "2022-01-02", "9.25"),
			published(t, "2022-02-02", "2022-02-02", "9.25"),
		},
	}

	assert.Equal(t, []indexedRow{
		{1, "142.17", "301.42", "9947.58", "0.00", "10249.00", "20194.59", "poupanca_yield 0.4739 2021-12-02..2022-01-02"},
		{2, "118.58", "203.13", "10106.06", "0.00", "10309.19", "10207.11", "poupanca_yield 0.5872 2022-01-02..2022-02-02"},
		{3, "51.04", "102.58", "10258.15", "0.00", "10360.73", "0.00", "poupanca_yield 0.5000 2022-02-02..2022-03-02"},
	}, indexedSchedule(terms, history, date(t, "2026-10-25")))
}

// An installment is corrected by the IPCA of the second month before the anniversary that ends
// its period: the anniversary on 2024-02-10 reads December 2023's IPCA.
func TestIPCAIndexedScheduleReadsTheIPCAOfTwoMonthsBefore(t *testing.T) {
	t.Parallel()

	terms := indexedSAC(t, mortgage.IPCA, "20000.00", 2)
	terms.ContractDate = date(t, "2024-01-10")
	terms.FirstInstallmentDate = date(t, "2024-02-10")
	history := mortgage.History{indexes.IPCA: {
		published(t, "2023-11-01", "2023-11-01", "0.28"),
		published(t, "2023-12-01", "2023-12-01", "0.56"),
		published(t, "2024-01-01", "2024-01-01", "0.42"),
		published(t, "2024-02-01", "2024-02-01", "0.83"),
	}}

	assert.Equal(t, []indexedRow{
		{1, "112.00", "201.12", "10056.00", "0.00", "10257.12", "10056.00", "ipca 0.56 2023-12-01..2023-12-01"},
		{2, "42.24", "100.98", "10098.24", "0.00", "10199.22", "0.00", "ipca 0.42 2024-01-01..2024-01-01"},
	}, indexedSchedule(terms, history, date(t, "2026-10-25")))
}

// The TR of the period that started on 2024-01-15 was never stored, so the 2nd installment is
// left uncorrected and marked; the months around it are still corrected.
func TestPastMonthWithoutPublishedIndexIsMarkedMissing(t *testing.T) {
	t.Parallel()

	history := mortgage.History{indexes.TR: {
		published(t, "2023-12-15", "2024-01-15", "0.0218"),
		published(t, "2024-02-15", "2024-03-15", "0.0665"),
	}}

	assert.Equal(t, []indexedRow{
		{1, "6.54", "300.07", "10002.18", "0.00", "10302.25", "20004.36", "tr 0.0218 2023-12-15..2024-01-15"},
		{2, "0.00", "200.04", "10002.18", "0.00", "10202.22", "10002.18", "tr missing 2024-01-15..2024-02-15"},
		{3, "6.65", "100.09", "10008.83", "0.00", "10108.92", "0.00", "tr 0.0665 2024-02-15..2024-03-15"},
	}, indexedSchedule(indexedSAC(t, mortgage.TR, "30000.00", 3), history, date(t, "2026-10-25")))
}

// Each installment is corrected for the contract anniversaries since the one before it, on the
// contract's day of the month whatever day installments fall due: none before an installment due
// on the contract date, and two before one deferred by a month. The TR of periods starting on
// installment due dates is published too, and must not be read. A contract signed on a day some
// months lack has its anniversaries on the 1st from the first one on, as SGS dates those periods.
func TestCorrectionsFollowTheContractAnniversaries(t *testing.T) {
	t.Parallel()

	history := mortgage.History{indexes.TR: append(publishedTR2024(t),
		published(t, "2023-12-20", "2024-01-20", "0.5000"),
		published(t, "2024-01-20", "2024-02-20", "0.5000"),
		published(t, "2024-01-31", "2024-03-01", "0.0388"),
		published(t, "2024-02-29", "2024-03-29", "0.0620"),
		published(t, "2024-03-01", "2024-03-31", "0.0331"),
		published(t, "2024-03-01", "2024-04-01", "0.0331"),
		published(t, "2024-01-29", "2024-02-29", "0.0700"),
		published(t, "2024-01-29", "2024-03-01", "9.9999"),
	)}

	tests := []struct {
		name             string
		contract         string
		firstInstallment string
		amount           string
		months           int
		want             []indexedRow
	}{
		{
			name:             "contract on the 31st",
			contract:         "2024-01-31",
			firstInstallment: "2024-02-29",
			amount:           "30000.00",
			months:           3,
			want: []indexedRow{
				{1, "0.00", "300.00", "10000.00", "0.00", "10300.00", "20000.00", ""},
				{2, "7.76", "200.08", "10003.88", "0.00", "10203.96", "10003.88", "tr 0.0388 2024-01-31..2024-03-01"},
				{3, "3.31", "100.07", "10007.19", "0.00", "10107.26", "0.00", "tr 0.0331 2024-03-01..2024-04-01"},
			},
		},
		{
			name:             "contract on the 29th of a leap January",
			contract:         "2024-01-29",
			firstInstallment: "2024-02-29",
			amount:           "30000.00",
			months:           1,
			want: []indexedRow{
				{1, "21.00", "300.21", "30021.00", "0.00", "30321.21", "0.00", "tr 0.0700 2024-01-29..2024-02-29"},
			},
		},
		{
			name:             "installments due five days after each anniversary",
			contract:         "2023-12-15",
			firstInstallment: "2024-01-20",
			amount:           "30000.00",
			months:           3,
			want: []indexedRow{
				{1, "6.54", "300.07", "10002.18", "0.00", "10302.25", "20004.36", "tr 0.0218 2023-12-15..2024-01-15"},
				{2, "14.34", "200.19", "10009.35", "0.00", "10209.54", "10009.35", "tr 0.0717 2024-01-15..2024-02-15"},
				{3, "6.66", "100.16", "10016.01", "0.00", "10116.17", "0.00", "tr 0.0665 2024-02-15..2024-03-15"},
			},
		},
		{
			name:             "first installment on the contract date",
			contract:         "2023-12-15",
			firstInstallment: "2023-12-15",
			amount:           "30000.00",
			months:           3,
			want: []indexedRow{
				{1, "0.00", "300.00", "10000.00", "0.00", "10300.00", "20000.00", ""},
				{2, "4.36", "200.04", "10002.18", "0.00", "10202.22", "10002.18", "tr 0.0218 2023-12-15..2024-01-15"},
				{3, "7.17", "100.09", "10009.35", "0.00", "10109.44", "0.00", "tr 0.0717 2024-01-15..2024-02-15"},
			},
		},
		{
			name:             "first installment deferred by a month",
			contract:         "2023-12-15",
			firstInstallment: "2024-02-15",
			amount:           "30000.00",
			months:           2,
			want: []indexedRow{
				{
					1, "28.05", "300.28", "15014.03", "0.00", "15314.31", "15014.02",
					"tr 0.0218 2023-12-15..2024-01-15; tr 0.0717 2024-01-15..2024-02-15",
				},
				{2, "9.98", "150.24", "15024.00", "0.00", "15174.24", "0.00", "tr 0.0665 2024-02-15..2024-03-15"},
			},
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			t.Parallel()

			terms := indexedSAC(t, mortgage.TR, tt.amount, tt.months)
			terms.ContractDate = date(t, tt.contract)
			terms.FirstInstallmentDate = date(t, tt.firstInstallment)

			assert.Equal(t, tt.want, indexedSchedule(terms, history, date(t, "2026-10-25")))
		})
	}
}

// A month whose correction lacks any published value it needs is left uncorrected and marked
// missing for the period it needed. The one installment falls due on the 2024-01-15 anniversary.
func TestMissingIndexInputsAreMarkedMissing(t *testing.T) {
	t.Parallel()

	tests := []struct {
		name    string
		indexer mortgage.Indexer
		history mortgage.History
		want    string
	}{
		{
			name:    "TR published only for a shorter period starting the same day",
			indexer: mortgage.TR,
			history: mortgage.History{indexes.TR: {published(t, "2023-12-15", "2024-01-14", "0.0218")}},
			want:    "tr missing 2023-12-15..2024-01-15",
		},
		{
			name:    "poupança yield without the period's TR",
			indexer: mortgage.PoupancaYield,
			history: mortgage.History{indexes.SelicTarget: {published(t, "2023-12-15", "2023-12-15", "11.75")}},
			want:    "poupanca_yield missing 2023-12-15..2024-01-15",
		},
		{
			name:    "poupança yield without the Selic target on the period's first day",
			indexer: mortgage.PoupancaYield,
			history: mortgage.History{
				indexes.TR:          {published(t, "2023-12-15", "2024-01-15", "0.0218")},
				indexes.SelicTarget: {published(t, "2023-12-14", "2023-12-14", "11.75")},
			},
			want: "poupanca_yield missing 2023-12-15..2024-01-15",
		},
		{
			name:    "IPCA of two months before the anniversary",
			indexer: mortgage.IPCA,
			history: mortgage.History{indexes.IPCA: {published(t, "2023-12-01", "2023-12-01", "0.56")}},
			want:    "ipca missing 2023-11-01..2023-11-01",
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			t.Parallel()

			assert.Equal(t, []indexedRow{
				{1, "0.00", "100.00", "10000.00", "0.00", "10100.00", "0.00", tt.want},
			}, indexedSchedule(indexedSAC(t, tt.indexer, "10000.00", 1), tt.history, date(t, "2026-10-25")))
		})
	}
}

// On 2024-02-15 the 2nd installment falls due and is corrected, while the 3rd is not due yet, so it
// is not corrected even though its TR is already published, and has no index value.
func TestMonthNotDueYetIsNotCorrected(t *testing.T) {
	t.Parallel()

	history := mortgage.History{indexes.TR: publishedTR2024(t)}

	assert.Equal(t, []indexedRow{
		{1, "6.54", "300.07", "10002.18", "0.00", "10302.25", "20004.36", "tr 0.0218 2023-12-15..2024-01-15"},
		{2, "14.34", "200.19", "10009.35", "0.00", "10209.54", "10009.35", "tr 0.0717 2024-01-15..2024-02-15"},
		{3, "0.00", "100.09", "10009.35", "0.00", "10109.44", "0.00", ""},
	}, indexedSchedule(indexedSAC(t, mortgage.TR, "30000.00", 3), history, date(t, "2024-02-15")))
}

// A mortgage without an indexer is never corrected, whatever indexes are published.
func TestScheduleWithoutIndexerIsNotCorrected(t *testing.T) {
	t.Parallel()

	history := mortgage.History{indexes.TR: publishedTR2024(t)}

	assert.Equal(t, []indexedRow{
		{1, "0.00", "300.00", "10000.00", "0.00", "10300.00", "20000.00", ""},
		{2, "0.00", "200.00", "10000.00", "0.00", "10200.00", "10000.00", ""},
		{3, "0.00", "100.00", "10000.00", "0.00", "10100.00", "0.00", ""},
	}, indexedSchedule(indexedSAC(t, mortgage.NoIndexer, "30000.00", 3), history, date(t, "2026-10-25")))
}
