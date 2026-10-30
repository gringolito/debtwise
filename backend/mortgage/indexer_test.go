package mortgage_test

import (
	"fmt"
	"slices"
	"strings"
	"testing"
	"time"

	"github.com/stretchr/testify/assert"

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
	var rows []indexedRow

	for m := range terms.Schedule(outlook, mortgage.Events{}, today) {
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
// and MIP (0.03%) are charged on it. Figures worked out independently from the published TR.
func TestTRIndexedScheduleCorrectsTheBalanceWithPublishedTR(t *testing.T) {
	t.Parallel()

	terms := indexedSAC(t, mortgage.TR, "120000.00", 12)
	terms.MIPRates = []mortgage.MonthlyRate{{EffectiveFrom: date(t, "2023-12-15"), Rate: dec(t, "0.0003")}}

	rows := indexedSchedule(terms, outlookOf(publishedValues{indexes.TR: publishedTR2024(t)}), date(t, "2026-10-25"))

	assert.Equal(t, []indexedRow{
		{1, "0.00", "1200.00", "10000.00", "36.00", "11236.00", "110000.00", ""},
		{2, "78.87", "1100.79", "10007.17", "33.02", "11140.98", "100071.70", "tr 0.0717 2024-01-15..2024-02-15"},
		{3, "66.55", "1001.38", "10013.83", "30.04", "11045.25", "90124.42", "tr 0.0665 2024-02-15..2024-03-15"},
		{4, "46.77", "901.71", "10019.02", "27.05", "10947.78", "80152.17", "tr 0.0519 2024-03-15..2024-04-15"},
		{5, "66.05", "802.18", "10027.28", "24.07", "10853.53", "70190.94", "tr 0.0824 2024-04-15..2024-05-15"},
		{6, "80.23", "702.71", "10038.74", "21.08", "10762.53", "60232.43", "tr 0.1143 2024-05-15..2024-06-15"},
		{7, "24.03", "602.56", "10042.74", "18.08", "10663.38", "50213.72", "tr 0.0399 2024-06-15..2024-07-15"},
		{8, "37.36", "502.51", "10050.22", "15.08", "10567.81", "40200.86", "tr 0.0744 2024-07-15..2024-08-15"},
		{9, "28.46", "402.29", "10057.33", "12.07", "10471.69", "30171.99", "tr 0.0708 2024-08-15..2024-09-15"},
		{10, "20.94", "301.93", "10064.31", "9.06", "10375.30", "20128.62", "tr 0.0694 2024-09-15..2024-10-15"},
		{11, "21.66", "201.50", "10075.14", "6.05", "10282.69", "10075.14", "tr 0.1076 2024-10-15..2024-11-15"},
		{12, "6.65", "100.82", "10081.79", "3.02", "10185.63", "0.00", "tr 0.0660 2024-11-15..2024-12-15"},
	}, rows)
}

// The contract was signed on 2021-11-02, and the 1st installment is never corrected. The Selic
// target was 7.75% when the second period started, on 2021-12-02, so poupança paid TR plus 70% of
// Selic, and 9.25% from the third on, so it paid TR plus 0.5%. The yields are those SGS series 195
// published for the same periods. Price levels the installment again on each corrected balance.
func TestPoupancaIndexedMonthsFollowTheSelicRule(t *testing.T) {
	t.Parallel()

	terms := mortgage.Terms{
		ContractDate:         date(t, "2021-11-02"),
		OriginalAmount:       dec(t, "30000.00"),
		TermMonths:           4,
		FirstInstallmentDate: date(t, "2021-12-02"),
		AmortizationSystem:   mortgage.Price,
		Indexer:              mortgage.PoupancaYield,
		AppraisalValue:       dec(t, "50000.00"),
		ContractRates: []mortgage.ContractRate{
			{EffectiveFrom: date(t, "2021-11-02"), Rate: dec(t, "0.12"), Basis: mortgage.Nominal},
		},
		MIPRates: []mortgage.MonthlyRate{{EffectiveFrom: date(t, "2021-11-02"), Rate: dec(t, "0")}},
		DFIRates: []mortgage.MonthlyRate{{EffectiveFrom: date(t, "2021-11-02"), Rate: dec(t, "0")}},
		Fees:     []mortgage.Fee{{EffectiveFrom: date(t, "2021-11-02"), Amount: dec(t, "0")}},
	}
	history := outlookOf(publishedValues{
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
	})

	assert.Equal(t, []indexedRow{
		{1, "0.00", "300.00", "7388.43", "0.00", "7688.43", "22611.57", ""},
		{2, "107.16", "227.19", "7497.68", "0.00", "7724.87", "15221.05", "poupanca_yield 0.4739 2021-12-02..2022-01-02"},
		{3, "89.38", "153.10", "7617.13", "0.00", "7770.23", "7693.30", "poupanca_yield 0.5872 2022-01-02..2022-02-02"},
		{4, "38.47", "77.32", "7731.77", "0.00", "7809.09", "0.00", "poupanca_yield 0.5000 2022-02-02..2022-03-02"},
	}, indexedSchedule(terms, history, date(t, "2026-10-25")))
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
		{1, "0.00", "300.00", "10000.00", "0.00", "10300.00", "20000.00", ""},
		{2, "84.00", "200.84", "10042.00", "0.00", "10242.84", "10042.00", "ipca 0.42 2024-01-01..2024-01-01"},
		{3, "83.35", "101.25", "10125.35", "0.00", "10226.60", "0.00", "ipca 0.83 2024-02-01..2024-02-01"},
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
				2, "6.35", "100.06", "10006.35", "0.00", "10106.41", "0.00",
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
			want: indexedRow{2, "45.00", "100.45", "10045.00", "0.00", "10145.45", "0.00", "ipca 0.45 2024-03-01..2024-03-01 (ipca focus)"},
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			t.Parallel()

			terms := indexedSAC(t, tt.indexer, "20000.00", 2)
			terms.ContractDate = date(t, tt.contract)
			terms.FirstInstallmentDate = date(t, tt.contract).AddDate(0, 1, 0)

			assert.Equal(t, []indexedRow{
				{1, "0.00", "200.00", "10000.00", "0.00", "10200.00", "10000.00", ""},
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
		{1, "0.00", "300.00", "10000.00", "0.00", "10300.00", "20000.00", ""},
		{2, "0.00", "200.00", "10000.00", "0.00", "10200.00", "10000.00", "tr missing 2024-01-15..2024-02-15"},
		{3, "6.65", "100.07", "10006.65", "0.00", "10106.72", "0.00", "tr 0.0665 2024-02-15..2024-03-15"},
	}, indexedSchedule(indexedSAC(t, mortgage.TR, "30000.00", 3), history, date(t, "2026-10-25")))
}

// From the 2nd installment on, each installment is corrected for the contract anniversaries since
// the one before it, on the contract's day of the month whatever day installments fall due. The
// 1st installment is never corrected, whenever it falls due, and the first anniversary's month
// corrects no installment: an installment due on the contract date leaves the 2nd uncorrected, and
// one deferred by a month leaves the second anniversary's month uncorrected too. The TR of periods
// starting on installment due dates is published too, and must not be read. A contract signed on a
// day some months lack has its anniversaries on the 1st from the first one on, as SGS dates those
// periods.
func TestCorrectionsFollowTheContractAnniversaries(t *testing.T) {
	t.Parallel()

	history := outlookOf(publishedValues{indexes.TR: append(publishedTR2024(t),
		published(t, "2024-01-20", "2024-02-20", "0.5000"),
		published(t, "2024-02-29", "2024-03-29", "0.0620"),
		published(t, "2024-03-01", "2024-03-31", "0.0331"),
		published(t, "2024-03-01", "2024-04-01", "0.0331"),
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
			name:             "contract on the 31st",
			contract:         "2024-01-31",
			firstInstallment: "2024-02-29",
			amount:           "30000.00",
			months:           3,
			want: []indexedRow{
				{1, "0.00", "300.00", "10000.00", "0.00", "10300.00", "20000.00", ""},
				{2, "0.00", "200.00", "10000.00", "0.00", "10200.00", "10000.00", ""},
				{3, "3.31", "100.03", "10003.31", "0.00", "10103.34", "0.00", "tr 0.0331 2024-03-01..2024-04-01"},
			},
		},
		{
			name:             "contract on the 29th of a leap January",
			contract:         "2024-01-29",
			firstInstallment: "2024-02-29",
			amount:           "20000.00",
			months:           2,
			want: []indexedRow{
				{1, "0.00", "200.00", "10000.00", "0.00", "10200.00", "10000.00", ""},
				{2, "6.20", "100.06", "10006.20", "0.00", "10106.26", "0.00", "tr 0.0620 2024-02-29..2024-03-29"},
			},
		},
		{
			name:             "installments due five days after each anniversary",
			contract:         "2023-12-15",
			firstInstallment: "2024-01-20",
			amount:           "30000.00",
			months:           3,
			want: []indexedRow{
				{1, "0.00", "300.00", "10000.00", "0.00", "10300.00", "20000.00", ""},
				{2, "14.34", "200.14", "10007.17", "0.00", "10207.31", "10007.17", "tr 0.0717 2024-01-15..2024-02-15"},
				{3, "6.65", "100.14", "10013.82", "0.00", "10113.96", "0.00", "tr 0.0665 2024-02-15..2024-03-15"},
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
				{2, "0.00", "200.00", "10000.00", "0.00", "10200.00", "10000.00", ""},
				{3, "7.17", "100.07", "10007.17", "0.00", "10107.24", "0.00", "tr 0.0717 2024-01-15..2024-02-15"},
			},
		},
		{
			name:             "first installment deferred by a month",
			contract:         "2023-12-15",
			firstInstallment: "2024-02-15",
			amount:           "30000.00",
			months:           2,
			want: []indexedRow{
				{1, "0.00", "300.00", "15000.00", "0.00", "15300.00", "15000.00", ""},
				{2, "9.98", "150.10", "15009.98", "0.00", "15160.08", "0.00", "tr 0.0665 2024-02-15..2024-03-15"},
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
			name:    "poupança yield without the period's TR",
			indexer: mortgage.PoupancaYield,
			history: publishedValues{indexes.SelicTarget: {published(t, "2024-01-15", "2024-01-15", "11.75")}},
			want:    "poupanca_yield missing 2024-01-15..2024-02-15",
		},
		{
			name:    "poupança yield without the Selic target on the period's first day",
			indexer: mortgage.PoupancaYield,
			history: publishedValues{
				indexes.TR:          {published(t, "2024-01-15", "2024-02-15", "0.0717")},
				indexes.SelicTarget: {published(t, "2024-01-14", "2024-01-14", "11.75")},
			},
			want: "poupanca_yield missing 2024-01-15..2024-02-15",
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
				{1, "0.00", "200.00", "10000.00", "0.00", "10200.00", "10000.00", ""},
				{2, "0.00", "100.00", "10000.00", "0.00", "10100.00", "0.00", tt.want},
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
		{1, "0.00", "300.00", "10000.00", "0.00", "10300.00", "20000.00", ""},
		{2, "14.34", "200.14", "10007.17", "0.00", "10207.31", "10007.17", "tr 0.0717 2024-01-15..2024-02-15"},
		{3, "6.65", "100.14", "10013.82", "0.00", "10113.96", "0.00", "tr 0.0665 2024-02-15..2024-03-15"},
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
		{1, "0.00", "500.00", "10000.00", "0.00", "10500.00", "40000.00", ""},
		{2, "0.00", "400.00", "10000.00", "0.00", "10400.00", "30000.00", "tr missing 2024-01-15..2024-02-15"},
		{3, "19.95", "300.20", "10006.65", "0.00", "10306.85", "20013.30", "tr 0.0665 2024-02-15..2024-03-15"},
		{
			4, "12.71", "200.26", "10013.01", "0.00", "10213.27", "10013.00",
			"tr 0.0635 2024-03-15..2024-04-15 (tr trailing_12)",
		},
		{
			5, "6.36", "100.19", "10019.36", "0.00", "10119.55", "0.00",
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
				{1, "0.00", "500.00", "10000.00", "0.00", "10500.00", "40000.00", ""},
				{2, "0.00", "400.00", "10000.00", "0.00", "10400.00", "30000.00", "tr missing 2024-01-15..2024-02-15"},
				{3, "19.95", "300.20", "10006.65", "0.00", "10306.85", "20013.30", "tr 0.0665 2024-02-15..2024-03-15"},
				{
					4, "12.71", "200.26", "10013.01", "0.00", "10213.27", "10013.00",
					"tr 0.0635 2024-03-15..2024-04-15 (tr trailing_12)",
				},
				{
					5, "6.36", "100.19", "10019.36", "0.00", "10119.55", "0.00",
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
		{1, "0.00", "500.00", "10000.00", "0.00", "10500.00", "40000.00", ""},
		{2, "0.00", "400.00", "10000.00", "0.00", "10400.00", "30000.00", "tr missing 2024-01-15..2024-02-15"},
		{3, "19.95", "300.20", "10006.65", "0.00", "10306.85", "20013.30", "tr 0.0665 2024-02-15..2024-03-15"},
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
					4, "12.71", "200.26", "10013.01", "0.00", "10213.27", "10013.00",
					"tr 0.0635 2024-03-15..2024-04-15 (tr trailing_12)",
				},
				{
					5, "6.36", "100.19", "10019.36", "0.00", "10119.55", "0.00",
					"tr 0.0635 2024-04-15..2024-05-15 (tr trailing_12)",
				},
			},
		},
		{
			name:   "trailing 60",
			method: indexes.Trailing60,
			future: []indexedRow{
				{
					4, "7.91", "200.21", "10010.61", "0.00", "10210.82", "10010.60",
					"tr 0.0395 2024-03-15..2024-04-15 (tr trailing_60)",
				},
				{
					5, "3.95", "100.15", "10014.55", "0.00", "10114.70", "0.00",
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

// The poupança yield records the methods of the inputs it projects, and only those. On 2024-02-20
// the 3rd installment, not due yet, reads the TR already published for its month and the Selic
// target of 2024-02-15, which isn't published, projected by the trailing 12 months (13.0833%), so
// it records only the Selic target's method; the 4th has neither the TR nor the Selic target
// published and records both. The 2nd, due, is published, and the 1st is never corrected. Figures
// worked out independently.
func TestFuturePoupancaMonthRecordsOnlyTheProjectedInputs(t *testing.T) {
	t.Parallel()

	selicMonths := []string{
		"13.75", "13.75", "13.75", "13.75", "13.75", "13.75", "13.25", "12.75", "12.75", "12.25", "11.75", "11.75",
	}
	selic := make([]indexes.Value, 0, 1+len(selicMonths))

	for i, v := range selicMonths {
		first := date(t, "2023-02-01").AddDate(0, i, 0).Format(time.DateOnly)
		selic = append(selic, published(t, first, first, v))
	}

	selic = append(selic, published(t, "2024-01-15", "2024-01-15", "11.75"))

	history := publishedValues{
		indexes.TR: append(monthlyTR(t),
			published(t, "2024-01-15", "2024-02-15", "0.0717"),
			published(t, "2024-02-15", "2024-03-15", "0.0665"),
		),
		indexes.SelicTarget: selic,
	}
	outlook := indexes.NewOutlook(history, indexes.Expectations{}, []indexes.ProjectionMethod{
		{Index: indexes.TR, Method: indexes.Trailing12},
		{Index: indexes.SelicTarget, Method: indexes.Trailing12},
	})

	assert.Equal(t, []indexedRow{
		{1, "0.00", "400.00", "10000.00", "0.00", "10400.00", "30000.00", ""},
		{2, "171.63", "301.72", "10057.21", "0.00", "10358.93", "20114.42", "poupanca_yield 0.5721 2024-01-15..2024-02-15"},
		{
			3, "114.01", "202.28", "10114.22", "0.00", "10316.50", "10114.21",
			"poupanca_yield 0.5668 2024-02-15..2024-03-15 (selic_target trailing_12)",
		},
		{
			4, "57.02", "101.71", "10171.23", "0.00", "10272.94", "0.00",
			"poupanca_yield 0.5638 2024-03-15..2024-04-15 (tr trailing_12, selic_target trailing_12)",
		},
	}, indexedSchedule(indexedSAC(t, mortgage.PoupancaYield, "40000.00", 4), outlook, date(t, "2024-02-20")))
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
		{1, "0.00", "300.00", "7500.00", "0.00", "7800.00", "22500.00", ""},
		{2, "94.50", "225.95", "7531.50", "0.00", "7757.45", "15063.00", "ipca 0.42 2024-01-01..2024-01-01"},
		{
			3, "125.02", "151.88", "7594.01", "0.00", "7745.89", "7594.01",
			"ipca 0.83 2024-02-01..2024-02-01 (ipca focus)",
		},
		{
			4, "34.17", "76.28", "7628.18", "0.00", "7704.46", "0.00",
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
				{1, "0.00", "200.00", "10000.00", "0.00", "10200.00", "10000.00", ""},
				{2, "0.00", "100.00", "10000.00", "0.00", "10100.00", "0.00", tt.want},
			}, indexedSchedule(indexedSAC(t, tt.indexer, "20000.00", 2), outlookOf(tt.history), date(t, "2024-01-01")))
		})
	}
}

// A mortgage without an indexer is never corrected, whatever indexes are published.
func TestScheduleWithoutIndexerIsNotCorrected(t *testing.T) {
	t.Parallel()

	history := outlookOf(publishedValues{indexes.TR: publishedTR2024(t)})

	assert.Equal(t, []indexedRow{
		{1, "0.00", "300.00", "10000.00", "0.00", "10300.00", "20000.00", ""},
		{2, "0.00", "200.00", "10000.00", "0.00", "10200.00", "10000.00", ""},
		{3, "0.00", "100.00", "10000.00", "0.00", "10100.00", "0.00", ""},
	}, indexedSchedule(indexedSAC(t, mortgage.NoIndexer, "30000.00", 3), history, date(t, "2026-10-25")))
}
