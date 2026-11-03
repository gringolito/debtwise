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

// From the 2nd installment on, the balance grows by the period's TR before interest, amortization
// and MIP (0.03%) are charged on it. The 1st installment charges 31 days of interest, from the
// contract date to its due date. Figures worked out independently from the published TR.
func TestTRIndexedScheduleCorrectsTheBalanceWithPublishedTR(t *testing.T) {
	t.Parallel()

	terms := indexedSAC(t, mortgage.TR, "120000.00", 12)
	terms.MIPRates = []mortgage.MonthlyRate{{EffectiveFrom: date(t, "2023-12-15"), Rate: dec(t, "0.0003")}}

	rows := indexedSchedule(terms, outlookOf(publishedValues{indexes.TR: publishedTR2024(t)}), date(t, "2026-10-25"))

	assert.Equal(t, []indexedRow{
		{1, "0.00", "1240.00", "9960.00", "36.00", "11236.00", "110040.00", ""},
		{2, "78.90", "1101.19", "10010.81", "33.04", "11145.04", "100108.09", "tr 0.0717 2024-01-15..2024-02-15"},
		{3, "66.57", "1001.75", "10017.47", "30.05", "11049.27", "90157.19", "tr 0.0665 2024-02-15..2024-03-15"},
		{4, "46.79", "902.04", "10022.66", "27.06", "10951.76", "80181.32", "tr 0.0519 2024-03-15..2024-04-15"},
		{5, "66.07", "802.47", "10030.92", "24.07", "10857.46", "70216.47", "tr 0.0824 2024-04-15..2024-05-15"},
		{6, "80.26", "702.97", "10042.39", "21.09", "10766.45", "60254.34", "tr 0.1143 2024-05-15..2024-06-15"},
		{7, "24.04", "602.78", "10046.40", "18.08", "10667.26", "50231.98", "tr 0.0399 2024-06-15..2024-07-15"},
		{8, "37.37", "502.69", "10053.87", "15.08", "10571.64", "40215.48", "tr 0.0744 2024-07-15..2024-08-15"},
		{9, "28.47", "402.44", "10060.99", "12.07", "10475.50", "30182.96", "tr 0.0708 2024-08-15..2024-09-15"},
		{10, "20.95", "302.04", "10067.97", "9.06", "10379.07", "20135.94", "tr 0.0694 2024-09-15..2024-10-15"},
		{11, "21.67", "201.58", "10078.81", "6.05", "10286.44", "10078.80", "tr 0.1076 2024-10-15..2024-11-15"},
		{12, "6.65", "100.85", "10085.45", "3.03", "10189.33", "0.00", "tr 0.0660 2024-11-15..2024-12-15"},
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

// The first installment is never corrected, even when it isn't due yet and its month's value is
// projected, and the month that ends on the first anniversary corrects no later installment
// either: the 2nd installment is corrected for the second anniversary only. Figures worked out
// independently.
func TestFirstInstallmentIsNeverCorrected(t *testing.T) {
	t.Parallel()

	tests := []struct {
		name     string
		indexer  mortgage.Indexer
		contract string
		outlook  indexes.Outlook
		want     indexedRow
	}{
		{
			name:     "projected TR",
			indexer:  mortgage.TR,
			contract: "2024-03-15",
			outlook:  outlookOf(projectedTRHistory(t)),
			want: indexedRow{
				2, "6.35", "100.13", "10013.02", "0.00", "10113.15", "0.00",
				"tr 0.0635 2024-04-15..2024-05-15 (tr trailing_12)",
			},
		},
		{
			name:     "projected IPCA",
			indexer:  mortgage.IPCA,
			contract: "2024-03-10",
			outlook: indexes.NewOutlook(publishedValues{indexes.IPCA: {
				published(t, "2024-01-01", "2024-01-01", "0.42"),
			}}, indexes.Expectations{MonthlyIPCA: []indexes.MonthMedian{
				{Month: date(t, "2024-02-01"), Median: dec(t, "0.83")},
				{Month: date(t, "2024-03-01"), Median: dec(t, "0.45")},
			}}, nil),
			want: indexedRow{2, "45.03", "100.52", "10051.70", "0.00", "10152.22", "0.00", "ipca 0.45 2024-03-01..2024-03-01 (ipca focus)"},
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			t.Parallel()

			terms := indexedSAC(t, tt.indexer, "20000.00", 2)
			terms.ContractDate = date(t, tt.contract)
			terms.FirstInstallmentDate = date(t, tt.contract).AddDate(0, 1, 0)

			assert.Equal(t, []indexedRow{
				{1, "0.00", "206.67", "9993.33", "0.00", "10200.00", "10006.67", ""},
				tt.want,
			}, indexedSchedule(terms, tt.outlook, date(t, "2024-03-20")))
		})
	}
}

// The TR of the period that started on 2024-01-15 was never stored, so the 2nd installment is
// left uncorrected and marked; the month after it is still corrected.
func TestPastMonthWithoutPublishedIndexIsMarkedMissing(t *testing.T) {
	t.Parallel()

	history := outlookOf(publishedValues{indexes.TR: {
		published(t, "2023-12-15", "2024-01-15", "0.0218"),
		published(t, "2024-02-15", "2024-03-15", "0.0665"),
	}})

	assert.Equal(t, []indexedRow{
		{1, "0.00", "310.00", "9990.00", "0.00", "10300.00", "20010.00", ""},
		{2, "0.00", "200.10", "10005.00", "0.00", "10205.10", "10005.00", "tr missing 2024-01-15..2024-02-15"},
		{3, "6.65", "100.12", "10011.65", "0.00", "10111.77", "0.00", "tr 0.0665 2024-02-15..2024-03-15"},
	}, indexedSchedule(indexedSAC(t, mortgage.TR, "30000.00", 3), history, date(t, "2026-10-25")))
}

// From the 2nd installment on, a TR-indexed installment is corrected by the TR of the month from
// the previous installment's due date to its own, whatever the contract's day of the month: the TR
// of the months between contract anniversaries is published too, and must not be read. The 1st
// installment is never corrected, whenever it falls due, and a month that ends on or before the
// first anniversary corrects no installment: an installment due on the contract date leaves the
// 2nd uncorrected. Months counted from a due date some months lack start on the 1st from the first
// short month on, as SGS dates those periods, and an installment is corrected by the months that
// end by its due date: with installments due on the contract's 31st, the corrections are those of
// the contract anniversaries. Figures worked out independently.
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
				{1, "0.00", "310.00", "9990.00", "0.00", "10300.00", "20010.00", ""},
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
				{1, "0.00", "360.00", "9940.00", "0.00", "10300.00", "20060.00", ""},
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
				{1, "0.00", "260.00", "10040.00", "0.00", "10300.00", "19960.00", ""},
				{2, "14.31", "199.74", "9987.16", "0.00", "10186.90", "9987.15", "tr 0.0717 2024-01-15..2024-02-15"},
				{3, "6.64", "99.94", "9993.79", "0.00", "10093.73", "0.00", "tr 0.0665 2024-02-15..2024-03-15"},
			},
		},
		{
			name:             "contract on the 31st",
			contract:         "2024-01-31",
			firstInstallment: "2024-02-29",
			amount:           "30000.00",
			months:           3,
			want: []indexedRow{
				{1, "0.00", "290.00", "10010.00", "0.00", "10300.00", "19990.00", ""},
				{2, "12.39", "200.02", "10001.20", "0.00", "10201.22", "10001.19", "tr 0.0620 2024-02-29..2024-03-29"},
				{3, "5.00", "100.06", "10006.19", "0.00", "10106.25", "0.00", "tr 0.0500 2024-03-29..2024-04-29"},
			},
		},
		{
			name:             "contract on the 29th of a leap January",
			contract:         "2024-01-29",
			firstInstallment: "2024-02-29",
			amount:           "20000.00",
			months:           2,
			want: []indexedRow{
				{1, "0.00", "206.67", "9993.33", "0.00", "10200.00", "10006.67", ""},
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
				{1, "0.00", "310.00", "9990.00", "0.00", "10300.00", "20010.00", ""},
				{2, "0.00", "200.10", "10005.00", "0.00", "10205.10", "10005.00", ""},
				{3, "3.00", "100.08", "10008.00", "0.00", "10108.08", "0.00", "tr 0.0300 2024-01-31..2024-03-01"},
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
				{2, "0.00", "197.00", "9850.00", "0.00", "10047.00", "9850.00", ""},
				{3, "7.06", "98.57", "9857.06", "0.00", "9955.63", "0.00", "tr 0.0717 2024-01-15..2024-02-15"},
			},
		},
		{
			name:             "installments due on the 31st, the first deferred past a short month",
			contract:         "2023-12-31",
			firstInstallment: "2024-03-31",
			amount:           "20000.00",
			months:           2,
			want: []indexedRow{
				{1, "0.00", "606.67", "9593.33", "0.00", "10200.00", "10406.67", ""},
				{2, "3.44", "104.10", "10410.11", "0.00", "10514.21", "0.00", "tr 0.0331 2024-03-01..2024-04-01"},
			},
		},
		{
			name:             "first installment deferred by a month",
			contract:         "2023-12-15",
			firstInstallment: "2024-02-15",
			amount:           "30000.00",
			months:           2,
			want: []indexedRow{
				{1, "0.00", "620.00", "14680.00", "0.00", "15300.00", "15320.00", ""},
				{2, "10.19", "153.30", "15330.19", "0.00", "15483.49", "0.00", "tr 0.0665 2024-02-15..2024-03-15"},
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

// A projected TR follows the months between due dates too: signed on 2024-03-10 with installments
// on the 15th, the 2nd installment is corrected by the projection for 2024-04-15 to 2024-05-15.
func TestProjectedTRFollowsTheDueDates(t *testing.T) {
	t.Parallel()

	terms := indexedSAC(t, mortgage.TR, "20000.00", 2)
	terms.ContractDate = date(t, "2024-03-10")
	terms.FirstInstallmentDate = date(t, "2024-04-15")

	assert.Equal(t, []indexedRow{
		{1, "0.00", "240.00", "9960.00", "0.00", "10200.00", "10040.00", ""},
		{
			2, "6.38", "100.46", "10046.38", "0.00", "10146.84", "0.00",
			"tr 0.0635 2024-04-15..2024-05-15 (tr trailing_12)",
		},
	}, indexedSchedule(terms, outlookOf(projectedTRHistory(t)), date(t, "2024-03-20")))
}

// fiveDaysAfterTheAnniversary lends 30,000.00 under TR signed on 2023-12-15 with installments on
// the 20th, so the 2nd installment, due 2024-02-20, is corrected by 0.5000% on the 2024-02-15
// anniversary, and the 3rd by 0.0400%.
func fiveDaysAfterTheAnniversary(t *testing.T) (mortgage.Terms, indexes.Outlook) {
	t.Helper()

	terms := indexedSAC(t, mortgage.TR, "30000.00", 3)
	terms.FirstInstallmentDate = date(t, "2024-01-20")

	return terms, outlookOf(publishedValues{indexes.TR: {
		published(t, "2024-01-20", "2024-02-20", "0.5000"),
		published(t, "2024-02-20", "2024-03-20", "0.0400"),
	}})
}

// A prepayment dated on the anniversary before the 2nd installment or later comes off the corrected
// balance, and one dated before it comes off the balance the correction then applies to:
// 0.5000% of 20,000.00 or of 15,000.00. The 1st installment's outstanding balance is what the
// prepayment left, so it includes the 2nd's correction when that applied first. Figures worked out
// independently.
func TestTRCorrectionAppliesOnTheAnniversaryBeforeTheDueDate(t *testing.T) {
	t.Parallel()

	before := []indexedRow{
		{1, "0.00", "360.00", "9940.00", "0.00", "10300.00", "15060.00", ""},
		{2, "75.30", "151.35", "7567.65", "0.00", "7719.00", "7567.65", "tr 0.5000 2024-01-20..2024-02-20"},
		{3, "3.03", "75.71", "7570.68", "0.00", "7646.39", "0.00", "tr 0.0400 2024-02-20..2024-03-20"},
	}
	after := []indexedRow{
		{1, "0.00", "360.00", "9940.00", "0.00", "10300.00", "15160.30", ""},
		{2, "100.30", "151.60", "7580.15", "0.00", "7731.75", "7580.15", "tr 0.5000 2024-01-20..2024-02-20"},
		{3, "3.03", "75.83", "7583.18", "0.00", "7659.01", "0.00", "tr 0.0400 2024-02-20..2024-03-20"},
	}

	tests := []struct {
		name string
		day  string
		want []indexedRow
	}{
		{name: "the day before the anniversary", day: "2024-02-14", want: before},
		{name: "on the anniversary", day: "2024-02-15", want: after},
		{name: "the day before the due date", day: "2024-02-19", want: after},
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

// Installments due on the contract's day are corrected on their due dates, as they were, though the
// anniversaries of a contract signed on the 31st fall on the 1st: a prepayment on 2024-04-15 comes
// off before the 2024-04-30 installment's correction of 0.0331%, which applies to the 5,000.00
// left. Figures worked out independently.
func TestTRCorrectionOfInstallmentsDueOnTheContractDayAppliesOnTheDueDate(t *testing.T) {
	t.Parallel()

	terms := indexedSAC(t, mortgage.TR, "20000.00", 2)
	terms.ContractDate = date(t, "2023-12-31")
	terms.FirstInstallmentDate = date(t, "2024-03-31")
	outlook := outlookOf(publishedValues{indexes.TR: {published(t, "2024-03-01", "2024-04-01", "0.0331")}})
	events := mortgage.Events{Prepayments: []mortgage.Prepayment{
		prepayment(t, "2024-04-15", "5000.00", mortgage.LowerInstallment),
	}}

	assert.Equal(t, []indexedRow{
		{1, "0.00", "606.67", "9593.33", "0.00", "10200.00", "5406.67", ""},
		{2, "1.79", "54.08", "5408.46", "0.00", "5462.54", "0.00", "tr 0.0331 2024-03-01..2024-04-01"},
	}, indexedRows(terms.Schedule(outlook, events, date(t, "2026-10-25"))))
}

// A statement is compared with the balance corrected for the next installment from the day that
// correction applies: under TR the anniversary before the due date, in the month before it when the
// due day comes before the contract's, and under IPCA the due date itself.
func TestStatementSeesTheCorrectionFromTheDayItApplies(t *testing.T) {
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
		{name: "TR the day before the anniversary", mortgage: fiveDaysAfterTheAnniversary, day: "2024-02-14", computed: "20060.00"},
		{name: "TR on the anniversary", mortgage: fiveDaysAfterTheAnniversary, day: "2024-02-15", computed: "20160.30"},
		{name: "TR the day before the due date", mortgage: fiveDaysAfterTheAnniversary, day: "2024-02-19", computed: "20160.30"},
		{name: "TR due before the anniversary, the day before it", mortgage: dueBeforeTheAnniversary, day: "2024-01-19", computed: "19960.00"},
		{name: "TR due before the anniversary, on it", mortgage: dueBeforeTheAnniversary, day: "2024-01-20", computed: "19974.31"},
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

// A plan's balances on its start and on its end include the TR correction of the anniversary before
// the 2nd installment once that anniversary has come, with no event to see it, and the plan reports
// the index values behind a correction its end balance includes for an installment due after it.
func TestPlanBalancesIncludeTheTRCorrectionFromTheAnniversary(t *testing.T) {
	t.Parallel()

	tests := []struct {
		name             string
		start, until     string
		atStart, balance string
		indexValues      string
	}{
		{
			name: "both before the anniversary", start: "2024-02-14", until: "2024-02-14",
			atStart: "20060.00", balance: "20060.00",
		},
		{
			name: "both on the anniversary", start: "2024-02-15", until: "2024-02-15",
			atStart: "20160.30", balance: "20160.30", indexValues: "tr 0.5000 2024-01-20..2024-02-20",
		},
		{
			name: "across the anniversary", start: "2024-02-10", until: "2024-02-19",
			atStart: "20060.00", balance: "20160.30", indexValues: "tr 0.5000 2024-01-20..2024-02-20",
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			t.Parallel()

			terms, outlook := fiveDaysAfterTheAnniversary(t)
			planned := terms.Plan(outlook, mortgage.Events{}, date(t, "2026-10-25"), mortgage.Plan{
				Start: date(t, tt.start),
				Until: date(t, tt.until),
			})

			assert.Equal(t, tt.atStart, planned.AtStart.String())
			assert.Equal(t, tt.balance, planned.Balance.String())
			assert.Equal(t, tt.indexValues, indexValuesText(planned.BalanceIndexValues))
		})
	}
}

// A month whose correction lacks any published value it needs is left uncorrected and marked
// missing for the period it needed. The 2nd installment falls due on the 2024-02-15 anniversary.
func TestMissingIndexInputsAreMarkedMissing(t *testing.T) {
	t.Parallel()

	tests := []struct {
		name    string
		indexer mortgage.Indexer
		history publishedValues
		want    string
	}{
		{
			name:    "TR published only for a shorter period starting the same day",
			indexer: mortgage.TR,
			history: publishedValues{indexes.TR: {published(t, "2024-01-15", "2024-02-14", "0.0717")}},
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
				{1, "0.00", "206.67", "9993.33", "0.00", "10200.00", "10006.67", ""},
				{2, "0.00", "100.07", "10006.67", "0.00", "10106.74", "0.00", tt.want},
			}, indexedSchedule(indexedSAC(t, tt.indexer, "20000.00", 2), outlookOf(tt.history), date(t, "2026-10-25")))
		})
	}
}

// On 2024-02-15 the 2nd installment falls due and is corrected, and the 3rd, not due yet, is
// corrected too: the TR of its month, published already, is a published value, so it records no
// projection method (ADR-0009 replaces ADR-0006's rule that only installments due by today are
// corrected).
func TestFutureMonthWithPublishedIndexIsCorrectedByIt(t *testing.T) {
	t.Parallel()

	history := outlookOf(publishedValues{indexes.TR: publishedTR2024(t)})

	assert.Equal(t, []indexedRow{
		{1, "0.00", "310.00", "9990.00", "0.00", "10300.00", "20010.00", ""},
		{2, "14.35", "200.24", "10012.18", "0.00", "10212.42", "10012.17", "tr 0.0717 2024-01-15..2024-02-15"},
		{3, "6.66", "100.19", "10018.83", "0.00", "10119.02", "0.00", "tr 0.0665 2024-02-15..2024-03-15"},
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

// On 2024-03-20 the first three installments are due and the last two are not. The 1st is never
// corrected. The others due keep the published TR: the 3rd is corrected by it, and the 2nd stays
// missing, though the trailing 12 months average (0.0635%) could be projected for its period. The
// two later ones are corrected by that projection, with its method. Figures worked out
// independently.
func TestPastMonthsKeepPublishedValuesWhileFutureMonthsAreProjected(t *testing.T) {
	t.Parallel()

	outlook := indexes.NewOutlook(projectedTRHistory(t), indexes.Expectations{}, nil)

	assert.Equal(t, []indexedRow{
		{1, "0.00", "516.67", "9983.33", "0.00", "10500.00", "40016.67", ""},
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
				{1, "0.00", "516.67", "9983.33", "0.00", "10500.00", "40016.67", ""},
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
		{1, "0.00", "516.67", "9983.33", "0.00", "10500.00", "40016.67", ""},
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
// balance is not corrected by it. The 2nd installment falls due on 2024-02-15, after today.
func TestFutureMonthWithoutAnEstimateIsMarkedMissing(t *testing.T) {
	t.Parallel()

	tests := []struct {
		name    string
		indexer mortgage.Indexer
		history publishedValues
		want    string
	}{
		{
			name:    "TR without a published period or enough months to average",
			indexer: mortgage.TR,
			history: publishedValues{indexes.TR: {published(t, "2024-01-15", "2024-02-14", "0.0717")}},
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
				{1, "0.00", "206.67", "9993.33", "0.00", "10200.00", "10006.67", ""},
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
