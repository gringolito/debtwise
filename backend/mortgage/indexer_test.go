package mortgage_test

import (
	"fmt"
	"iter"
	"slices"
	"strings"
	"testing"
	"time"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"github.com/gringolito/debtwise/backend/indexes"
	"github.com/gringolito/debtwise/backend/mortgage"
)

// indexedRow is an installment as text with its indexer correction and the index values behind it,
// such as "tr 0.0218 2023-12-15..2024-01-15" or "tr missing 2024-01-15..2024-02-15", joined by
// "; ", or "" when no index value applies. A projected value ends with its methods, such as
// "tr 0.0635 2024-03-15..2024-04-15 (tr trailing_12)".
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

// publishedValues is the published history of each index, as indexes.Store's History returns it.
type publishedValues = map[indexes.Index][]indexes.Value

// outlookOf is the Outlook over published values alone: no Focus expectations, and every index
// projected by its default method.
func outlookOf(history publishedValues) indexes.Outlook {
	return indexes.NewOutlook(history, indexes.Expectations{}, nil)
}

// methodsText is the suffix of an index value's row that names the methods behind a projected value,
// such as " (tr trailing_12, selic_target trailing_12)", and is empty for a published one.
func methodsText(methods []indexes.ProjectionMethod) string {
	if len(methods) == 0 {
		return ""
	}

	names := make([]string, 0, len(methods))
	for _, m := range methods {
		names = append(names, fmt.Sprintf("%s %s", m.Index, m.Method))
	}

	return " (" + strings.Join(names, ", ") + ")"
}

func indexedSchedule(terms mortgage.Terms, outlook indexes.Outlook, today time.Time) []indexedRow {
	return indexedRows(terms.Schedule(outlook, mortgage.Events{}, today))
}

func indexedRows(installments iter.Seq[mortgage.Installment]) []indexedRow {
	var rows []indexedRow

	for m := range installments {
		values := make([]string, 0, len(m.IndexValues))

		for _, v := range m.IndexValues {
			value := v.Value.String()
			if v.Missing {
				value = "missing"
			}

			values = append(values, fmt.Sprintf("%s %s %s..%s%s", v.Index, value,
				v.PeriodStart.Format(time.DateOnly), v.PeriodEnd.Format(time.DateOnly), methodsText(v.Methods)))
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

// Each installment, the 1st included, grows the balance by the TR of the month up to its due date
// before interest, amortization and MIP (0.03%) are charged on it. The 1st installment charges 31
// days of interest, from the contract date to its due date. Figures worked out independently from
// the published TR.
func TestTRIndexedScheduleCorrectsTheBalanceWithPublishedTR(t *testing.T) {
	t.Parallel()

	terms := indexedSAC(t, mortgage.TR, "120000.00", 12)
	terms.MIPRates = []mortgage.MonthlyRate{{EffectiveFrom: date(t, "2023-12-15"), Rate: dec(t, "0.0003")}}

	rows := indexedSchedule(terms, outlookOf(publishedValues{indexes.TR: publishedTR2024(t)}), date(t, "2026-10-25"))

	assert.Equal(t, []indexedRow{
		{1, "26.16", "1240.27", "9962.17", "36.01", "11238.45", "110063.99", "tr 0.0218 2023-12-15..2024-01-15"},
		{2, "78.92", "1101.43", "10012.99", "33.04", "11147.46", "100129.92", "tr 0.0717 2024-01-15..2024-02-15"},
		{3, "66.59", "1001.97", "10019.65", "30.06", "11051.68", "90176.86", "tr 0.0665 2024-02-15..2024-03-15"},
		{4, "46.80", "902.24", "10024.85", "27.07", "10954.16", "80198.81", "tr 0.0519 2024-03-15..2024-04-15"},
		{5, "66.08", "802.65", "10033.11", "24.08", "10859.84", "70231.78", "tr 0.0824 2024-04-15..2024-05-15"},
		{6, "80.27", "703.12", "10044.58", "21.09", "10768.79", "60267.47", "tr 0.1143 2024-05-15..2024-06-15"},
		{7, "24.05", "602.92", "10048.59", "18.09", "10669.60", "50242.93", "tr 0.0399 2024-06-15..2024-07-15"},
		{8, "37.38", "502.80", "10056.06", "15.08", "10573.94", "40224.25", "tr 0.0744 2024-07-15..2024-08-15"},
		{9, "28.48", "402.53", "10063.18", "12.08", "10477.79", "30189.55", "tr 0.0708 2024-08-15..2024-09-15"},
		{10, "20.95", "302.11", "10070.17", "9.06", "10381.34", "20140.33", "tr 0.0694 2024-09-15..2024-10-15"},
		{11, "21.67", "201.62", "10081.00", "6.05", "10288.67", "10081.00", "tr 0.1076 2024-10-15..2024-11-15"},
		{12, "6.65", "100.88", "10087.65", "3.03", "10191.56", "0.00", "tr 0.0660 2024-11-15..2024-12-15"},
	}, rows)
}

// An installment is corrected by the IPCA of the second month before the anniversary that ends
// its period: the anniversary on 2024-03-10 reads January 2024's IPCA.
func TestIPCAIndexedScheduleReadsTheIPCAOfTwoMonthsBefore(t *testing.T) {
	t.Parallel()

	terms := indexedSAC(t, mortgage.IPCA, "30000.00", 3)
	terms.ContractDate = date(t, "2024-01-10")
	terms.FirstInstallmentDate = date(t, "2024-02-10")
	history := outlookOf(publishedValues{indexes.IPCA: {
		published(t, "2023-11-01", "2023-11-01", "0.28"),
		published(t, "2023-12-01", "2023-12-01", "0.56"),
		published(t, "2024-01-01", "2024-01-01", "0.42"),
		published(t, "2024-02-01", "2024-02-01", "0.83"),
	}})

	assert.Equal(t, []indexedRow{
		{1, "0.00", "310.00", "9990.00", "0.00", "10300.00", "20010.00", ""},
		{2, "84.04", "200.94", "10047.02", "0.00", "10247.96", "10047.02", "ipca 0.42 2024-01-01..2024-01-01"},
		{3, "83.39", "101.30", "10130.41", "0.00", "10231.71", "0.00", "ipca 0.83 2024-02-01..2024-02-01"},
	}, indexedSchedule(terms, history, date(t, "2026-10-25")))
}

// Under IPCA the first installment is never corrected, even when it isn't due yet and its month's
// value is projected, and the month that ends on the first anniversary corrects no later
// installment either: the 2nd installment is corrected for the second anniversary only. Figures
// worked out independently.
func TestFirstIPCAInstallmentIsNeverCorrected(t *testing.T) {
	t.Parallel()

	terms := indexedSAC(t, mortgage.IPCA, "20000.00", 2)
	terms.ContractDate = date(t, "2024-03-10")
	terms.FirstInstallmentDate = date(t, "2024-04-10")
	outlook := indexes.NewOutlook(publishedValues{indexes.IPCA: {
		published(t, "2024-01-01", "2024-01-01", "0.42"),
	}}, indexes.Expectations{MonthlyIPCA: []indexes.MonthMedian{
		{Month: date(t, "2024-02-01"), Median: dec(t, "0.83")},
		{Month: date(t, "2024-03-01"), Median: dec(t, "0.45")},
	}}, nil)

	assert.Equal(t, []indexedRow{
		{1, "0.00", "206.67", "9993.33", "0.00", "10200.00", "10006.67", ""},
		{2, "45.03", "100.52", "10051.70", "0.00", "10152.22", "0.00", "ipca 0.45 2024-03-01..2024-03-01 (ipca focus)"},
	}, indexedSchedule(terms, outlook, date(t, "2024-03-20")))
}

// Under TR the first installment is updated as any other, by the TR of the month from the contract
// date to its due date, projected here as it isn't due yet. Figures worked out independently.
func TestFirstTRInstallmentIsUpdatedAsAnyOther(t *testing.T) {
	t.Parallel()

	terms := indexedSAC(t, mortgage.TR, "20000.00", 2)
	terms.ContractDate = date(t, "2024-03-15")
	terms.FirstInstallmentDate = date(t, "2024-04-15")

	assert.Equal(t, []indexedRow{
		{
			1, "12.70", "206.80", "9999.68", "0.00", "10206.48", "10013.02",
			"tr 0.0635 2024-03-15..2024-04-15 (tr trailing_12)",
		},
		{
			2, "6.36", "100.19", "10019.38", "0.00", "10119.57", "0.00",
			"tr 0.0635 2024-04-15..2024-05-15 (tr trailing_12)",
		},
	}, indexedSchedule(terms, outlookOf(projectedTRHistory(t)), date(t, "2024-03-20")))
}

// The TR of the period that started on 2024-01-15 was never stored, so the 2nd installment is
// left uncorrected and marked; the months before and after it still correct theirs.
func TestPastMonthWithoutPublishedIndexIsMarkedMissing(t *testing.T) {
	t.Parallel()

	history := outlookOf(publishedValues{indexes.TR: {
		published(t, "2023-12-15", "2024-01-15", "0.0218"),
		published(t, "2024-02-15", "2024-03-15", "0.0665"),
	}})

	assert.Equal(t, []indexedRow{
		{1, "6.54", "310.07", "9992.18", "0.00", "10302.25", "20014.36", "tr 0.0218 2023-12-15..2024-01-15"},
		{2, "0.00", "200.14", "10007.18", "0.00", "10207.32", "10007.18", "tr missing 2024-01-15..2024-02-15"},
		{3, "6.65", "100.14", "10013.83", "0.00", "10113.97", "0.00", "tr 0.0665 2024-02-15..2024-03-15"},
	}, indexedSchedule(indexedSAC(t, mortgage.TR, "30000.00", 3), history, date(t, "2026-10-25")))
}

// A TR-indexed installment is updated from the previous installment's due date, or from the
// contract date for the 1st, to its own, by the TR of the periods that start on the due day,
// whatever the contract's day of the month: the TR of the months between contract anniversaries is
// published too, and must not be read. An update reads the period that starts on the first due day
// on or after its start, in full when it covers it whole and for its days over 30, rounded down,
// otherwise: signed five days before the due day, the 1st installment is updated by 26/30 of the TR
// of the month after its due date, and signed on the 31st with installments on the 29th, by 29/30
// of it. A 1st installment due on the contract date isn't updated at all, and one deferred by a
// month is updated by both months since the contract date. Periods counted from a due day some
// months lack start on the 1st from the first short month on, as SGS dates those periods: with
// installments due on the 31st, they are those of the contract anniversaries. Figures worked out
// independently.
func TestTRCorrectionsFollowTheDueDates(t *testing.T) {
	t.Parallel()

	history := outlookOf(publishedValues{indexes.TR: append(publishedTR2024(t),
		published(t, "2024-01-20", "2024-02-20", "0.5000"),
		published(t, "2024-02-20", "2024-03-20", "0.0400"),
		published(t, "2024-01-31", "2024-03-01", "0.0300"),
		published(t, "2024-02-29", "2024-03-29", "0.0620"),
		published(t, "2024-03-01", "2024-03-31", "0.0331"),
		published(t, "2024-03-01", "2024-04-01", "0.0331"),
		published(t, "2024-03-29", "2024-04-29", "0.0500"),
		published(t, "2024-12-18", "2025-01-18", "0.1289"),
		published(t, "2024-12-19", "2025-01-19", "0.1039"),
		published(t, "2025-01-18", "2025-02-18", "0.1523"),
		published(t, "2025-01-19", "2025-02-19", "0.1694"),
	)})

	tests := []struct {
		name             string
		contract         string
		firstInstallment string
		amount           string
		months           int
		want             []indexedRow
	}{
		{
			name:             "installments due the day after each anniversary",
			contract:         "2024-11-18",
			firstInstallment: "2024-12-19",
			amount:           "30000.00",
			months:           3,
			want: []indexedRow{
				{1, "0.00", "310.00", "9990.00", "0.00", "10300.00", "20010.00", "tr missing 2024-11-19..2024-12-19"},
				{2, "20.79", "200.31", "10015.40", "0.00", "10215.71", "10015.39", "tr 0.1039 2024-12-19..2025-01-19"},
				{3, "16.97", "100.32", "10032.36", "0.00", "10132.68", "0.00", "tr 0.1694 2025-01-19..2025-02-19"},
			},
		},
		{
			name:             "installments due five days after each anniversary",
			contract:         "2023-12-15",
			firstInstallment: "2024-01-20",
			amount:           "30000.00",
			months:           3,
			want: []indexedRow{
				{1, "0.00", "360.00", "9940.00", "0.00", "10300.00", "20060.00", "tr missing 2023-12-20..2024-01-20"},
				{2, "100.30", "201.60", "10080.15", "0.00", "10281.75", "10080.15", "tr 0.5000 2024-01-20..2024-02-20"},
				{3, "4.03", "100.84", "10084.18", "0.00", "10185.02", "0.00", "tr 0.0400 2024-02-20..2024-03-20"},
			},
		},
		{
			name:             "installments due five days before each anniversary",
			contract:         "2023-12-20",
			firstInstallment: "2024-01-15",
			amount:           "30000.00",
			months:           3,
			want: []indexedRow{
				{1, "18.64", "260.16", "10046.24", "0.00", "10306.40", "19972.40", "tr 0.0717 2024-01-15..2024-02-15"},
				{2, "14.32", "199.87", "9993.36", "0.00", "10193.23", "9993.36", "tr 0.0717 2024-01-15..2024-02-15"},
				{3, "6.65", "100.00", "10000.01", "0.00", "10100.01", "0.00", "tr 0.0665 2024-02-15..2024-03-15"},
			},
		},
		{
			name:             "contract on the 31st",
			contract:         "2024-01-31",
			firstInstallment: "2024-02-29",
			amount:           "30000.00",
			months:           3,
			want: []indexedRow{
				{1, "17.98", "290.17", "10016.00", "0.00", "10306.17", "20001.98", "tr 0.0620 2024-02-29..2024-03-29"},
				{2, "12.40", "200.14", "10007.19", "0.00", "10207.33", "10007.19", "tr 0.0620 2024-02-29..2024-03-29"},
				{3, "5.00", "100.12", "10012.19", "0.00", "10112.31", "0.00", "tr 0.0500 2024-03-29..2024-04-29"},
			},
		},
		{
			name:             "contract on the 29th of a leap January",
			contract:         "2024-01-29",
			firstInstallment: "2024-02-29",
			amount:           "20000.00",
			months:           2,
			want: []indexedRow{
				{1, "0.00", "206.67", "9993.33", "0.00", "10200.00", "10006.67", "tr missing 2024-01-29..2024-02-29"},
				{2, "6.20", "100.13", "10012.87", "0.00", "10113.00", "0.00", "tr 0.0620 2024-02-29..2024-03-29"},
			},
		},
		{
			name:             "installments due on the 31st",
			contract:         "2023-12-31",
			firstInstallment: "2024-01-31",
			amount:           "30000.00",
			months:           3,
			want: []indexedRow{
				{1, "0.00", "310.00", "9990.00", "0.00", "10300.00", "20010.00", "tr missing 2023-12-31..2024-01-31"},
				{2, "5.80", "200.16", "10007.90", "0.00", "10208.06", "10007.90", "tr 0.0300 2024-01-31..2024-03-01"},
				{3, "3.42", "100.11", "10011.32", "0.00", "10111.43", "0.00", "tr 0.0331 2024-03-01..2024-04-01"},
			},
		},
		{
			name:             "first installment on the contract date",
			contract:         "2023-12-15",
			firstInstallment: "2023-12-15",
			amount:           "30000.00",
			months:           3,
			want: []indexedRow{
				{1, "0.00", "0.00", "10300.00", "0.00", "10300.00", "19700.00", ""},
				{2, "4.29", "197.04", "9852.15", "0.00", "10049.19", "9852.14", "tr 0.0218 2023-12-15..2024-01-15"},
				{3, "7.06", "98.59", "9859.20", "0.00", "9957.79", "0.00", "tr 0.0717 2024-01-15..2024-02-15"},
			},
		},
		{
			name:             "installments due on the 31st, the first deferred past a short month",
			contract:         "2023-12-31",
			firstInstallment: "2024-03-31",
			amount:           "20000.00",
			months:           2,
			want: []indexedRow{
				{
					1, "12.62", "607.05", "9599.39", "0.00", "10206.44", "10413.23",
					"tr missing 2023-12-31..2024-01-31; tr 0.0300 2024-01-31..2024-03-01; tr 0.0331 2024-03-01..2024-04-01",
				},
				{2, "0.00", "104.13", "10413.23", "0.00", "10517.36", "0.00", "tr missing 2024-04-01..2024-05-01"},
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
					1, "28.05", "620.58", "14693.73", "0.00", "15314.31", "15334.32",
					"tr 0.0218 2023-12-15..2024-01-15; tr 0.0717 2024-01-15..2024-02-15",
				},
				{2, "10.20", "153.45", "15344.52", "0.00", "15497.97", "0.00", "tr 0.0665 2024-02-15..2024-03-15"},
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

// An update across more than one TR period compounds them: a 1st installment deferred by a month
// is updated by 1% of 30,000.00 for the month to 2024-01-15, 300.00, and then by 2% of the
// 30,300.00 that leaves, 606.00. Figures worked out independently.
func TestTRUpdateAcrossPeriodsCompoundsThem(t *testing.T) {
	t.Parallel()

	terms := indexedSAC(t, mortgage.TR, "30000.00", 2)
	terms.FirstInstallmentDate = date(t, "2024-02-15")
	history := outlookOf(publishedValues{indexes.TR: {
		published(t, "2023-12-15", "2024-01-15", "1.0000"),
		published(t, "2024-01-15", "2024-02-15", "2.0000"),
	}})

	assert.Equal(t, []indexedRow{
		{
			1, "906.00", "638.72", "15123.34", "0.00", "15762.06", "15782.66",
			"tr 1.0000 2023-12-15..2024-01-15; tr 2.0000 2024-01-15..2024-02-15",
		},
		{2, "0.00", "157.83", "15782.66", "0.00", "15940.49", "0.00", "tr missing 2024-02-15..2024-03-15"},
	}, indexedSchedule(terms, history, date(t, "2026-10-25")))
}

// A projected TR follows the periods between due days too: signed on 2024-03-10 with installments
// on the 15th, the 1st installment is updated by 36/30 of the projection for 2024-03-15 to
// 2024-04-15, and the 2nd by the projection for 2024-04-15 to 2024-05-15. Figures worked out
// independently.
func TestProjectedTRFollowsTheDueDates(t *testing.T) {
	t.Parallel()

	terms := indexedSAC(t, mortgage.TR, "20000.00", 2)
	terms.ContractDate = date(t, "2024-03-10")
	terms.FirstInstallmentDate = date(t, "2024-04-15")

	assert.Equal(t, []indexedRow{
		{
			1, "15.24", "240.18", "9967.59", "0.00", "10207.77", "10047.65",
			"tr 0.0635 2024-03-15..2024-04-15 (tr trailing_12)",
		},
		{
			2, "6.38", "100.54", "10054.03", "0.00", "10154.57", "0.00",
			"tr 0.0635 2024-04-15..2024-05-15 (tr trailing_12)",
		},
	}, indexedSchedule(terms, outlookOf(projectedTRHistory(t)), date(t, "2024-03-20")))
}

// fiveDaysAfterTheAnniversary lends 30,000.00 under TR signed on 2023-12-15 with installments on
// the 20th, so the 2nd installment, due 2024-02-20, is corrected by 0.5000% on its due date, and
// the 3rd by 0.0400%.
func fiveDaysAfterTheAnniversary(t *testing.T) (mortgage.Terms, indexes.Outlook) {
	t.Helper()

	terms := indexedSAC(t, mortgage.TR, "30000.00", 3)
	terms.FirstInstallmentDate = date(t, "2024-01-20")

	return terms, outlookOf(publishedValues{indexes.TR: {
		published(t, "2024-01-20", "2024-02-20", "0.5000"),
		published(t, "2024-02-20", "2024-03-20", "0.0400"),
	}})
}

// A prepayment first updates the balance pro rata die since the 1st installment's due date by the
// TR of 2024-01-20 to 2024-02-20 (0.5000%), for 26 or 30 of its days, rounded down, and then comes
// off it. The 2nd installment is updated from the prepayment's date by the TR of the period that
// starts on its due date (0.0400%), for 5 or 1 days, and the 3rd by that period whole. Figures
// worked out independently.
func TestPrepaymentFirstUpdatesTheTRBalanceProRataDie(t *testing.T) {
	t.Parallel()

	tests := []struct {
		name string
		day  string
		want []indexedRow
	}{
		{
			name: "on the anniversary",
			day:  "2024-02-15",
			want: []indexedRow{
				{1, "0.00", "360.00", "9940.00", "0.00", "10300.00", "15146.92", "tr missing 2023-12-20..2024-01-20"},
				{2, "1.00", "151.48", "7573.96", "0.00", "7725.44", "7573.96", "tr 0.0400 2024-02-20..2024-03-20"},
				{3, "3.03", "75.77", "7576.99", "0.00", "7652.76", "0.00", "tr 0.0400 2024-02-20..2024-03-20"},
			},
		},
		{
			name: "the day before the due date",
			day:  "2024-02-19",
			want: []indexedRow{
				{1, "0.00", "360.00", "9940.00", "0.00", "10300.00", "15160.30", "tr missing 2023-12-20..2024-01-20"},
				{2, "0.20", "151.61", "7580.25", "0.00", "7731.86", "7580.25", "tr 0.0400 2024-02-20..2024-03-20"},
				{3, "3.03", "75.83", "7583.28", "0.00", "7659.11", "0.00", "tr 0.0400 2024-02-20..2024-03-20"},
			},
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			t.Parallel()

			terms, outlook := fiveDaysAfterTheAnniversary(t)
			events := mortgage.Events{Prepayments: []mortgage.Prepayment{
				prepayment(t, tt.day, "5000.00", mortgage.LowerInstallment),
			}}

			assert.Equal(t, tt.want, indexedRows(terms.Schedule(outlook, events, date(t, "2026-10-25"))))
		})
	}
}

// A statement dated before the next installment's due date is compared with the balance before
// that installment's correction, whether the due day comes after the contract's or before it, under
// TR and IPCA alike. A statement doesn't update a TR balance pro rata die to its date.
func TestStatementSeesTheBalanceBeforeTheNextCorrection(t *testing.T) {
	t.Parallel()

	dueBeforeTheAnniversary := func(t *testing.T) (mortgage.Terms, indexes.Outlook) {
		t.Helper()

		terms := indexedSAC(t, mortgage.TR, "30000.00", 3)
		terms.ContractDate = date(t, "2023-12-20")

		return terms, outlookOf(publishedValues{indexes.TR: publishedTR2024(t)})
	}
	ipca := func(t *testing.T) (mortgage.Terms, indexes.Outlook) {
		t.Helper()

		terms := indexedSAC(t, mortgage.IPCA, "30000.00", 3)
		terms.FirstInstallmentDate = date(t, "2024-01-20")

		return terms, outlookOf(publishedValues{indexes.IPCA: {published(t, "2023-12-01", "2023-12-01", "0.56")}})
	}

	tests := []struct {
		name     string
		mortgage func(t *testing.T) (mortgage.Terms, indexes.Outlook)
		day      string
		computed string
	}{
		{name: "TR on the anniversary", mortgage: fiveDaysAfterTheAnniversary, day: "2024-02-15", computed: "20060.00"},
		{name: "TR the day before the due date", mortgage: fiveDaysAfterTheAnniversary, day: "2024-02-19", computed: "20060.00"},
		{name: "TR due before the anniversary, on it", mortgage: dueBeforeTheAnniversary, day: "2024-01-20", computed: "19972.40"},
		{name: "IPCA after the anniversary", mortgage: ipca, day: "2024-02-16", computed: "20060.00"},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			t.Parallel()

			terms, outlook := tt.mortgage(t)
			events := mortgage.Events{Statements: []mortgage.Statement{statement(t, tt.day, "20000.00")}}

			drifts := terms.Drifts(outlook, events, date(t, "2026-10-25"))

			require.Len(t, drifts, 1)
			assert.Equal(t, tt.computed, drifts[0].ComputedBalance.String())
		})
	}
}

// A plan's balances on its start and on its end, from the anniversary before the 2nd installment up
// to the day before its due date, are those before that installment's TR correction.
func TestPlanBalancesExcludeTheTRCorrectionBeforeTheDueDate(t *testing.T) {
	t.Parallel()

	tests := []struct {
		name         string
		start, until string
	}{
		{name: "both on the anniversary", start: "2024-02-15", until: "2024-02-15"},
		{name: "across the anniversary", start: "2024-02-10", until: "2024-02-19"},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			t.Parallel()

			terms, outlook := fiveDaysAfterTheAnniversary(t)
			planned := terms.Plan(outlook, mortgage.Events{}, date(t, "2026-10-25"), mortgage.Plan{
				Start: date(t, tt.start),
				Until: date(t, tt.until),
			})

			assert.Equal(t, "20060.00", planned.AtStart.String())
			assert.Equal(t, "20060.00", planned.Balance.String())
		})
	}
}

// A month whose correction lacks any published value it needs is left uncorrected and marked
// missing for the period it needed. The 2nd installment falls due on the 2024-02-15 anniversary;
// under TR the 1st reads the month before it, which isn't published either.
func TestMissingIndexInputsAreMarkedMissing(t *testing.T) {
	t.Parallel()

	tests := []struct {
		name    string
		indexer mortgage.Indexer
		history publishedValues
		first   string
		want    string
	}{
		{
			name:    "TR published only for a shorter period starting the same day",
			indexer: mortgage.TR,
			history: publishedValues{indexes.TR: {published(t, "2024-01-15", "2024-02-14", "0.0717")}},
			first:   "tr missing 2023-12-15..2024-01-15",
			want:    "tr missing 2024-01-15..2024-02-15",
		},
		{
			name:    "IPCA of two months before the anniversary",
			indexer: mortgage.IPCA,
			history: publishedValues{indexes.IPCA: {published(t, "2024-01-01", "2024-01-01", "0.42")}},
			want:    "ipca missing 2023-12-01..2023-12-01",
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			t.Parallel()

			assert.Equal(t, []indexedRow{
				{1, "0.00", "206.67", "9993.33", "0.00", "10200.00", "10006.67", tt.first},
				{2, "0.00", "100.07", "10006.67", "0.00", "10106.74", "0.00", tt.want},
			}, indexedSchedule(indexedSAC(t, tt.indexer, "20000.00", 2), outlookOf(tt.history), date(t, "2026-10-25")))
		})
	}
}

// On 2024-02-15 the first two installments are due and corrected, and the 3rd, not due yet, is
// corrected too: the TR of its month, published already, is a published value, so it records no
// projection method (ADR-0009 replaces ADR-0006's rule that only installments due by today are
// corrected). Figures worked out independently.
func TestFutureMonthWithPublishedIndexIsCorrectedByIt(t *testing.T) {
	t.Parallel()

	history := outlookOf(publishedValues{indexes.TR: publishedTR2024(t)})

	assert.Equal(t, []indexedRow{
		{1, "6.54", "310.07", "9992.18", "0.00", "10302.25", "20014.36", "tr 0.0218 2023-12-15..2024-01-15"},
		{2, "14.35", "200.29", "10014.36", "0.00", "10214.65", "10014.35", "tr 0.0717 2024-01-15..2024-02-15"},
		{3, "6.66", "100.21", "10021.01", "0.00", "10121.22", "0.00", "tr 0.0665 2024-02-15..2024-03-15"},
	}, indexedSchedule(indexedSAC(t, mortgage.TR, "30000.00", 3), history, date(t, "2024-02-15")))
}

// monthlyTR is the TR of the 60 monthly periods from the 1st of a month to the 1st of the next,
// March 2019 to February 2024, that trailing averages read: 0.0100% in the first period and 0.0010
// more in each next one, up to 0.0690%. The latest 12 average 0.0635% and all 60 average 0.0395%.
func monthlyTR(t *testing.T) []indexes.Value {
	t.Helper()

	first := date(t, "2019-03-01")
	values := make([]indexes.Value, 0, 60)

	for i := range 60 {
		start, end := first.AddDate(0, i, 0), first.AddDate(0, i+1, 0)
		values = append(values, published(t, start.Format(time.DateOnly), end.Format(time.DateOnly),
			fmt.Sprintf("0.%04d", 100+10*i)))
	}

	return values
}

// projectedTRHistory is the TR published for the third month of the schedule of
// TestPastMonthsKeepPublishedValuesWhileFutureMonthsAreProjected, and none for the second, next to
// the monthly periods of monthlyTR that no anniversary of the contract reads.
func projectedTRHistory(t *testing.T) publishedValues {
	t.Helper()

	return publishedValues{indexes.TR: append(monthlyTR(t),
		published(t, "2024-02-15", "2024-03-15", "0.0665"),
	)}
}

// On 2024-03-20 the first three installments are due and the last two are not. Those due keep the
// published TR: the 3rd is corrected by it, and the 1st and 2nd stay missing, though the trailing
// 12 months average (0.0635%) could be projected for their periods. The two later ones are
// corrected by that projection, with its method. Figures worked out independently.
func TestPastMonthsKeepPublishedValuesWhileFutureMonthsAreProjected(t *testing.T) {
	t.Parallel()

	outlook := indexes.NewOutlook(projectedTRHistory(t), indexes.Expectations{}, nil)

	assert.Equal(t, []indexedRow{
		{1, "0.00", "516.67", "9983.33", "0.00", "10500.00", "40016.67", "tr missing 2023-12-15..2024-01-15"},
		{2, "0.00", "400.17", "10004.17", "0.00", "10404.34", "30012.50", "tr missing 2024-01-15..2024-02-15"},
		{3, "19.96", "300.32", "10010.82", "0.00", "10311.14", "20021.64", "tr 0.0665 2024-02-15..2024-03-15"},
		{
			4, "12.71", "200.34", "10017.18", "0.00", "10217.52", "10017.17",
			"tr 0.0635 2024-03-15..2024-04-15 (tr trailing_12)",
		},
		{
			5, "6.36", "100.24", "10023.53", "0.00", "10123.77", "0.00",
			"tr 0.0635 2024-04-15..2024-05-15 (tr trailing_12)",
		},
	}, indexedSchedule(indexedSAC(t, mortgage.TR, "50000.00", 5), outlook, date(t, "2024-03-20")))
}

// An installment is due from its due date on, today included: its TR is only projected, so it stays
// missing on 2024-02-15 and on the day after. The rows are those of
// TestPastMonthsKeepPublishedValuesWhileFutureMonthsAreProjected, since the 3rd installment, not
// due yet, is corrected by the TR published for it and the 4th and 5th by the projection.
func TestInstallmentDueTodayIsCorrectedByPublishedValuesOnly(t *testing.T) {
	t.Parallel()

	tests := []struct {
		name  string
		today string
	}{
		{name: "today is the due date", today: "2024-02-15"},
		{name: "the day after the due date", today: "2024-02-16"},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			t.Parallel()

			outlook := indexes.NewOutlook(projectedTRHistory(t), indexes.Expectations{}, nil)

			assert.Equal(t, []indexedRow{
				{1, "0.00", "516.67", "9983.33", "0.00", "10500.00", "40016.67", "tr missing 2023-12-15..2024-01-15"},
				{2, "0.00", "400.17", "10004.17", "0.00", "10404.34", "30012.50", "tr missing 2024-01-15..2024-02-15"},
				{3, "19.96", "300.32", "10010.82", "0.00", "10311.14", "20021.64", "tr 0.0665 2024-02-15..2024-03-15"},
				{
					4, "12.71", "200.34", "10017.18", "0.00", "10217.52", "10017.17",
					"tr 0.0635 2024-03-15..2024-04-15 (tr trailing_12)",
				},
				{
					5, "6.36", "100.24", "10023.53", "0.00", "10123.77", "0.00",
					"tr 0.0635 2024-04-15..2024-05-15 (tr trailing_12)",
				},
			}, indexedSchedule(indexedSAC(t, mortgage.TR, "50000.00", 5), outlook, date(t, tt.today)))
		})
	}
}

// The method the owner chose for TR decides the future months: the trailing 12 months average
// 0.0635% and the trailing 60 average 0.0395%, and each correction records the method behind it.
// The installments due keep their published values under either method.
func TestChangingTheProjectionMethodChangesTheFutureMonths(t *testing.T) {
	t.Parallel()

	due := []indexedRow{
		{1, "0.00", "516.67", "9983.33", "0.00", "10500.00", "40016.67", "tr missing 2023-12-15..2024-01-15"},
		{2, "0.00", "400.17", "10004.17", "0.00", "10404.34", "30012.50", "tr missing 2024-01-15..2024-02-15"},
		{3, "19.96", "300.32", "10010.82", "0.00", "10311.14", "20021.64", "tr 0.0665 2024-02-15..2024-03-15"},
	}

	tests := []struct {
		name   string
		method indexes.Method
		future []indexedRow
	}{
		{
			name:   "trailing 12",
			method: indexes.Trailing12,
			future: []indexedRow{
				{
					4, "12.71", "200.34", "10017.18", "0.00", "10217.52", "10017.17",
					"tr 0.0635 2024-03-15..2024-04-15 (tr trailing_12)",
				},
				{
					5, "6.36", "100.24", "10023.53", "0.00", "10123.77", "0.00",
					"tr 0.0635 2024-04-15..2024-05-15 (tr trailing_12)",
				},
			},
		},
		{
			name:   "trailing 60",
			method: indexes.Trailing60,
			future: []indexedRow{
				{
					4, "7.91", "200.30", "10014.78", "0.00", "10215.08", "10014.77",
					"tr 0.0395 2024-03-15..2024-04-15 (tr trailing_60)",
				},
				{
					5, "3.96", "100.19", "10018.73", "0.00", "10118.92", "0.00",
					"tr 0.0395 2024-04-15..2024-05-15 (tr trailing_60)",
				},
			},
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			t.Parallel()

			outlook := indexes.NewOutlook(projectedTRHistory(t), indexes.Expectations{},
				[]indexes.ProjectionMethod{{Index: indexes.TR, Method: tt.method}})

			assert.Equal(t, append(slices.Clone(due), tt.future...),
				indexedSchedule(indexedSAC(t, mortgage.TR, "50000.00", 5), outlook, date(t, "2024-03-20")))
		})
	}
}

// A future installment reads the IPCA of the second month before its anniversary, as the past ones
// do. On 2024-03-15 the 3rd installment, anniversary 2024-04-10, reads February's Focus median
// (0.83%) and the 4th, anniversary 2024-05-10, March's (0.45%), not the months of their
// anniversaries (April's median is 0.31%). January's median (0.99%) is left unread, as January's
// published IPCA (0.42%) corrects the 2nd installment, which is due. Figures worked out
// independently.
func TestFutureIPCAMonthsReadTheProjectedIPCAOfTwoMonthsBefore(t *testing.T) {
	t.Parallel()

	terms := indexedSAC(t, mortgage.IPCA, "30000.00", 4)
	terms.ContractDate = date(t, "2024-01-10")
	terms.FirstInstallmentDate = date(t, "2024-02-10")

	history := publishedValues{indexes.IPCA: {
		published(t, "2023-11-01", "2023-11-01", "0.28"),
		published(t, "2024-01-01", "2024-01-01", "0.42"),
	}}
	expectations := indexes.Expectations{MonthlyIPCA: []indexes.MonthMedian{
		{Month: date(t, "2024-01-01"), Median: dec(t, "0.99")},
		{Month: date(t, "2024-02-01"), Median: dec(t, "0.83")},
		{Month: date(t, "2024-03-01"), Median: dec(t, "0.45")},
		{Month: date(t, "2024-04-01"), Median: dec(t, "0.31")},
	}}

	assert.Equal(t, []indexedRow{
		{1, "0.00", "310.00", "7490.00", "0.00", "7800.00", "22510.00", ""},
		{2, "94.54", "226.05", "7534.85", "0.00", "7760.90", "15069.69", "ipca 0.42 2024-01-01..2024-01-01"},
		{
			3, "125.08", "151.95", "7597.39", "0.00", "7749.34", "7597.38",
			"ipca 0.83 2024-02-01..2024-02-01 (ipca focus)",
		},
		{
			4, "34.19", "76.32", "7631.57", "0.00", "7707.89", "0.00",
			"ipca 0.45 2024-03-01..2024-03-01 (ipca focus)",
		},
	}, indexedSchedule(terms, indexes.NewOutlook(history, expectations, nil), date(t, "2024-03-15")))
}

// A future month with neither a published value nor a projection is reported missing, and the
// balance is not corrected by it. Both installments fall due after today; under TR the 1st reads
// the month before the 2nd's, which has no estimate either.
func TestFutureMonthWithoutAnEstimateIsMarkedMissing(t *testing.T) {
	t.Parallel()

	tests := []struct {
		name    string
		indexer mortgage.Indexer
		history publishedValues
		first   string
		want    string
	}{
		{
			name:    "TR without a published period or enough months to average",
			indexer: mortgage.TR,
			history: publishedValues{indexes.TR: {published(t, "2024-01-15", "2024-02-14", "0.0717")}},
			first:   "tr missing 2023-12-15..2024-01-15",
			want:    "tr missing 2024-01-15..2024-02-15",
		},
		{
			name:    "IPCA without a published month or Focus expectations",
			indexer: mortgage.IPCA,
			history: publishedValues{indexes.IPCA: {published(t, "2024-01-01", "2024-01-01", "0.42")}},
			want:    "ipca missing 2023-12-01..2023-12-01",
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			t.Parallel()

			assert.Equal(t, []indexedRow{
				{1, "0.00", "206.67", "9993.33", "0.00", "10200.00", "10006.67", tt.first},
				{2, "0.00", "100.07", "10006.67", "0.00", "10106.74", "0.00", tt.want},
			}, indexedSchedule(indexedSAC(t, tt.indexer, "20000.00", 2), outlookOf(tt.history), date(t, "2024-01-01")))
		})
	}
}

// A mortgage without an indexer is never corrected, whatever indexes are published.
func TestScheduleWithoutIndexerIsNotCorrected(t *testing.T) {
	t.Parallel()

	history := outlookOf(publishedValues{indexes.TR: publishedTR2024(t)})
	terms := indexedSAC(t, mortgage.NoIndexer, "30000.00", 3)
	// Signed 30 days before the first installment, so it charges a month's interest.
	signed := date(t, "2023-12-16")
	terms.ContractDate = signed
	terms.ContractRates[0].EffectiveFrom = signed
	terms.MIPRates[0].EffectiveFrom = signed
	terms.DFIRates[0].EffectiveFrom = signed
	terms.Fees[0].EffectiveFrom = signed

	assert.Equal(t, []indexedRow{
		{1, "0.00", "300.00", "10000.00", "0.00", "10300.00", "20000.00", ""},
		{2, "0.00", "200.00", "10000.00", "0.00", "10200.00", "10000.00", ""},
		{3, "0.00", "100.00", "10000.00", "0.00", "10100.00", "0.00", ""},
	}, indexedSchedule(terms, history, date(t, "2026-10-25")))
}

// dfiCharged is the DFI each installment of the schedule charges on today.
func dfiCharged(t *testing.T, terms mortgage.Terms, outlook indexes.Outlook, today string) []string {
	t.Helper()

	var dfi []string
	for m := range terms.Schedule(outlook, mortgage.Events{}, date(t, today)) {
		dfi = append(dfi, m.DFI.String())
	}

	return dfi
}

// withDFIRaisedOnTheThirdInstallment charges DFI at 0.1% of the appraisal value, and at 0.2% from
// 2024-03-15, the 3rd installment's due date.
func withDFIRaisedOnTheThirdInstallment(t *testing.T, terms mortgage.Terms) mortgage.Terms {
	t.Helper()

	terms.DFIRates = []mortgage.MonthlyRate{
		{EffectiveFrom: date(t, "2023-12-15"), Rate: dec(t, "0.001")},
		{EffectiveFrom: date(t, "2024-03-15"), Rate: dec(t, "0.002")},
	}

	return terms
}

// Under TR, the 200,000.00 appraisal value is corrected on each due date from the 2nd installment's
// on, by the TR of the months that end by it, and DFI is charged on it at the rate in force on the
// due date: 0.0717% makes it 200,143.40 for the 2nd installment, and 0.0665% (133.10) 200,276.50 for
// the 3rd, charged at 0.2%. A prepayment, which updates the balance pro rata die, leaves it as it
// is. With installments due on the 31st, the month from 2024-01-31 ends on 2024-03-01, after the
// 2nd installment, so its 0.0300% only corrects it for the 3rd: 200,060.00 at 0.1%. Figures worked
// out independently from the published TR.
func TestTRIndexedDFIFollowsTheAppraisalValueCorrectedByTR(t *testing.T) {
	t.Parallel()

	dueOnThe31st := indexedSAC(t, mortgage.TR, "30000.00", 3)
	dueOnThe31st.ContractDate = date(t, "2023-12-31")
	dueOnThe31st.FirstInstallmentDate = date(t, "2024-01-31")
	dueOnThe31st.DFIRates = []mortgage.MonthlyRate{{EffectiveFrom: date(t, "2023-12-31"), Rate: dec(t, "0.001")}}

	tests := []struct {
		name    string
		terms   mortgage.Terms
		history []indexes.Value
		events  mortgage.Events
		want    []string
	}{
		{
			name:    "without events",
			terms:   withDFIRaisedOnTheThirdInstallment(t, indexedSAC(t, mortgage.TR, "120000.00", 3)),
			history: publishedTR2024(t),
			want:    []string{"200.00", "200.14", "400.55"},
		},
		{
			name:    "with a prepayment",
			terms:   withDFIRaisedOnTheThirdInstallment(t, indexedSAC(t, mortgage.TR, "120000.00", 3)),
			history: publishedTR2024(t),
			events: mortgage.Events{Prepayments: []mortgage.Prepayment{
				prepayment(t, "2024-02-01", "1000.00", mortgage.LowerInstallment),
			}},
			want: []string{"200.00", "200.14", "400.55"},
		},
		{
			name:    "installments due on the 31st",
			terms:   dueOnThe31st,
			history: []indexes.Value{published(t, "2024-01-31", "2024-03-01", "0.0300")},
			want:    []string{"200.00", "200.00", "200.06"},
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			t.Parallel()

			var dfi []string
			for m := range tt.terms.Schedule(outlookOf(publishedValues{indexes.TR: tt.history}), tt.events, date(t, "2026-10-25")) {
				dfi = append(dfi, m.DFI.String())
			}

			assert.Equal(t, tt.want, dfi)
		})
	}
}

// On 2024-03-20, with the TR of TestPastMonthsKeepPublishedValuesWhileFutureMonthsAreProjected,
// DFI at 0.1% follows the appraisal value as the balance's corrections do: the 2nd installment's
// missing month leaves it at 200,000.00, the 3rd's published 0.0665% makes it 200,133.00, and the
// projected 0.0635% of the 4th and 5th, not due yet, makes it 200,260.08 and then 200,387.25.
// Figures worked out independently.
func TestTRIndexedDFIFollowsTheAppraisalValueCorrectedByProjectedTR(t *testing.T) {
	t.Parallel()

	terms := indexedSAC(t, mortgage.TR, "50000.00", 5)
	terms.DFIRates = []mortgage.MonthlyRate{{EffectiveFrom: date(t, "2023-12-15"), Rate: dec(t, "0.001")}}

	assert.Equal(t, []string{"200.00", "200.00", "200.13", "200.26", "200.39"},
		dfiCharged(t, terms, indexes.NewOutlook(projectedTRHistory(t), indexes.Expectations{}, nil), "2024-03-20"))
}

// Without TR, DFI is charged on the appraisal value as signed, whatever corrects the balance.
func TestDFIFollowsTheSignedAppraisalValueWithoutTR(t *testing.T) {
	t.Parallel()

	history := outlookOf(publishedValues{
		indexes.TR: publishedTR2024(t),
		indexes.IPCA: {
			published(t, "2023-12-01", "2023-12-01", "0.56"),
			published(t, "2024-01-01", "2024-01-01", "0.42"),
		},
	})

	for _, indexer := range []mortgage.Indexer{mortgage.NoIndexer, mortgage.IPCA} {
		t.Run(string(indexer), func(t *testing.T) {
			t.Parallel()

			terms := withDFIRaisedOnTheThirdInstallment(t, indexedSAC(t, indexer, "120000.00", 3))

			assert.Equal(t, []string{"200.00", "200.00", "400.00"}, dfiCharged(t, terms, history, "2026-10-25"))
		})
	}
}
