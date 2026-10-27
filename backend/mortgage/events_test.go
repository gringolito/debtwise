package mortgage_test

import (
	"testing"
	"time"

	"github.com/stretchr/testify/assert"

	"github.com/gringolito/debtwise/backend/indexes"
	"github.com/gringolito/debtwise/backend/mortgage"
)

// replayed is an installment as text, with what prepayments took off the balance after it.
type replayed struct {
	Number             int
	DueDate            string
	Interest           string
	Amortization       string
	Amount             string
	Prepaid            string
	OutstandingBalance string
}

func replay(terms mortgage.Terms, events mortgage.Events) []replayed {
	var rows []replayed
	for m := range terms.Schedule(indexes.Outlook{}, events, time.Time{}) {
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

	return rows
}

func prepayment(t *testing.T, day, amount string, effect mortgage.PrepaymentEffect) mortgage.Prepayment {
	t.Helper()

	return mortgage.Prepayment{Date: date(t, day), Amount: dec(t, amount), Effect: effect}
}

func statement(t *testing.T, day, balance string) mortgage.Statement {
	t.Helper()

	return mortgage.Statement{Date: date(t, day), OutstandingBalance: dec(t, balance)}
}

// sacTerms owes 40,000.00 after the 2nd installment, amortizing 10,000.00 a month. Prepaying
// 20,000.00 on that installment's due date keeps the 10,000.00 a month and ends the schedule two
// months early, or keeps the end date and halves the amortization.
func TestSACPrepayment(t *testing.T) {
	t.Parallel()

	tests := []struct {
		name   string
		effect mortgage.PrepaymentEffect
		want   []replayed
	}{
		{
			name:   "shortens the term",
			effect: mortgage.ShortenTerm,
			want: []replayed{
				{1, "2024-01-10", "600.00", "10000.00", "10610.00", "0.00", "50000.00"},
				{2, "2024-02-10", "500.00", "10000.00", "10510.00", "20000.00", "20000.00"},
				{3, "2024-03-10", "200.00", "10000.00", "10210.00", "0.00", "10000.00"},
				{4, "2024-04-10", "100.00", "10000.00", "10110.00", "0.00", "0.00"},
			},
		},
		{
			name:   "lowers the installment",
			effect: mortgage.LowerInstallment,
			want: []replayed{
				{1, "2024-01-10", "600.00", "10000.00", "10610.00", "0.00", "50000.00"},
				{2, "2024-02-10", "500.00", "10000.00", "10510.00", "20000.00", "20000.00"},
				{3, "2024-03-10", "200.00", "5000.00", "5210.00", "0.00", "15000.00"},
				{4, "2024-04-10", "150.00", "5000.00", "5160.00", "0.00", "10000.00"},
				{5, "2024-05-10", "100.00", "5000.00", "5110.00", "0.00", "5000.00"},
				{6, "2024-06-10", "50.00", "5000.00", "5060.00", "0.00", "0.00"},
			},
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			t.Parallel()

			events := mortgage.Events{Prepayments: []mortgage.Prepayment{
				prepayment(t, "2024-02-10", "20000.00", tt.effect),
			}}

			assert.Equal(t, tt.want, replay(sacTerms(t), events))
		})
	}
}

// priceTerms owes 51,492.09 after the 6th installment of 8,884.88. Prepaying 20,000.00 leaves
// 31,492.09: 4 months is the shortest term whose level installment, 8,070.83, is not above the one
// in force, while keeping the 6 months left levels it at 5,433.91.
func TestPricePrepayment(t *testing.T) {
	t.Parallel()

	paid := []replayed{
		{1, "2024-01-10", "1000.00", "7884.88", "8884.88", "0.00", "92115.12"},
		{2, "2024-02-10", "921.15", "7963.73", "8884.88", "0.00", "84151.39"},
		{3, "2024-03-10", "841.51", "8043.37", "8884.88", "0.00", "76108.02"},
		{4, "2024-04-10", "761.08", "8123.80", "8884.88", "0.00", "67984.22"},
		{5, "2024-05-10", "679.84", "8205.04", "8884.88", "0.00", "59779.18"},
		{6, "2024-06-10", "597.79", "8287.09", "8884.88", "20000.00", "31492.09"},
	}

	tests := []struct {
		name   string
		effect mortgage.PrepaymentEffect
		want   []replayed
	}{
		{
			name:   "shortens the term",
			effect: mortgage.ShortenTerm,
			want: []replayed{
				{7, "2024-07-10", "314.92", "7755.91", "8070.83", "0.00", "23736.18"},
				{8, "2024-08-10", "237.36", "7833.47", "8070.83", "0.00", "15902.71"},
				{9, "2024-09-10", "159.03", "7911.80", "8070.83", "0.00", "7990.91"},
				{10, "2024-10-10", "79.91", "7990.91", "8070.82", "0.00", "0.00"},
			},
		},
		{
			name:   "lowers the installment",
			effect: mortgage.LowerInstallment,
			want: []replayed{
				{7, "2024-07-10", "314.92", "5118.99", "5433.91", "0.00", "26373.10"},
				{8, "2024-08-10", "263.73", "5170.18", "5433.91", "0.00", "21202.92"},
				{9, "2024-09-10", "212.03", "5221.88", "5433.91", "0.00", "15981.04"},
				{10, "2024-10-10", "159.81", "5274.10", "5433.91", "0.00", "10706.94"},
				{11, "2024-11-10", "107.07", "5326.84", "5433.91", "0.00", "5380.10"},
				{12, "2024-12-10", "53.80", "5380.10", "5433.90", "0.00", "0.00"},
			},
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			t.Parallel()

			terms := priceTerms(t, mortgage.ContractRate{
				EffectiveFrom: date(t, "2023-12-10"), Rate: dec(t, "0.12"), Basis: mortgage.Nominal,
			})
			events := mortgage.Events{Prepayments: []mortgage.Prepayment{
				prepayment(t, "2024-06-25", "20000.00", tt.effect),
			}}

			assert.Equal(t, append(paid, tt.want...), replay(terms, events))
		})
	}
}

// A prepayment of more than is owed pays off what is owed, and the schedule ends there. Under either
// effect, prepayments after that take nothing off.
func TestPrepaymentPaysOffTheMortgage(t *testing.T) {
	t.Parallel()

	for _, effect := range []mortgage.PrepaymentEffect{mortgage.ShortenTerm, mortgage.LowerInstallment} {
		t.Run(string(effect), func(t *testing.T) {
			t.Parallel()

			events := mortgage.Events{Prepayments: []mortgage.Prepayment{
				prepayment(t, "2024-03-01", "50000.00", effect),
				prepayment(t, "2024-03-05", "1000.00", effect),
			}}

			assert.Equal(t, []replayed{
				{1, "2024-01-10", "600.00", "10000.00", "10610.00", "0.00", "50000.00"},
				{2, "2024-02-10", "500.00", "10000.00", "10510.00", "40000.00", "0.00"},
			}, replay(sacTerms(t), events))
		})
	}
}

// Prepayments between two installments add up on the earlier one, and one dated before the first
// installment lowers the balance the first one starts from. They apply in date order whatever
// order they come in.
func TestPrepaymentsApplyInDateOrder(t *testing.T) {
	t.Parallel()

	events := mortgage.Events{Prepayments: []mortgage.Prepayment{
		prepayment(t, "2024-03-09", "4000.00", mortgage.LowerInstallment),
		prepayment(t, "2023-12-20", "6000.00", mortgage.LowerInstallment),
		prepayment(t, "2024-02-15", "6000.00", mortgage.LowerInstallment),
	}}

	assert.Equal(t, []replayed{
		{1, "2024-01-10", "540.00", "9000.00", "9550.00", "0.00", "45000.00"},
		{2, "2024-02-10", "450.00", "9000.00", "9460.00", "10000.00", "26000.00"},
		{3, "2024-03-10", "260.00", "6500.00", "6770.00", "0.00", "19500.00"},
		{4, "2024-04-10", "195.00", "6500.00", "6705.00", "0.00", "13000.00"},
		{5, "2024-05-10", "130.00", "6500.00", "6640.00", "0.00", "6500.00"},
		{6, "2024-06-10", "65.00", "6500.00", "6575.00", "0.00", "0.00"},
	}, replay(sacTerms(t), events))
}

// Shortening the term keeps the 10,000.00 a month whenever the prepayment comes: before the first
// installment, 30,000.00 off leaves 3 months; after the 3rd, 25,000.00 off leaves the 5,000.00 one
// month pays.
func TestShortenedTermFromAnyInstallment(t *testing.T) {
	t.Parallel()

	tests := []struct {
		name       string
		prepayment mortgage.Prepayment
		want       []replayed
	}{
		{
			name:       "before the first installment",
			prepayment: prepayment(t, "2023-12-20", "30000.00", mortgage.ShortenTerm),
			want: []replayed{
				{1, "2024-01-10", "300.00", "10000.00", "10310.00", "0.00", "20000.00"},
				{2, "2024-02-10", "200.00", "10000.00", "10210.00", "0.00", "10000.00"},
				{3, "2024-03-10", "100.00", "10000.00", "10110.00", "0.00", "0.00"},
			},
		},
		{
			name:       "down to one month",
			prepayment: prepayment(t, "2024-03-10", "25000.00", mortgage.ShortenTerm),
			want: []replayed{
				{1, "2024-01-10", "600.00", "10000.00", "10610.00", "0.00", "50000.00"},
				{2, "2024-02-10", "500.00", "10000.00", "10510.00", "0.00", "40000.00"},
				{3, "2024-03-10", "400.00", "10000.00", "10410.00", "25000.00", "5000.00"},
				{4, "2024-04-10", "50.00", "5000.00", "5060.00", "0.00", "0.00"},
			},
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			t.Parallel()

			events := mortgage.Events{Prepayments: []mortgage.Prepayment{tt.prepayment}}

			assert.Equal(t, tt.want, replay(sacTerms(t), events))
		})
	}
}

// The bank stated 40,123.45 owed on February 20, where the schedule had computed 40,000.00: the
// schedule continues from the stated balance, amortizing it over the 4 months left.
func TestStatementOverridesTheComputedBalance(t *testing.T) {
	t.Parallel()

	events := mortgage.Events{Statements: []mortgage.Statement{statement(t, "2024-02-20", "40123.45")}}

	assert.Equal(t, []replayed{
		{1, "2024-01-10", "600.00", "10000.00", "10610.00", "0.00", "50000.00"},
		{2, "2024-02-10", "500.00", "10000.00", "10510.00", "0.00", "40123.45"},
		{3, "2024-03-10", "401.23", "10030.86", "10442.09", "0.00", "30092.59"},
		{4, "2024-04-10", "300.93", "10030.86", "10341.79", "0.00", "20061.73"},
		{5, "2024-05-10", "200.62", "10030.87", "10241.49", "0.00", "10030.86"},
		{6, "2024-06-10", "100.31", "10030.86", "10141.17", "0.00", "0.00"},
	}, replay(sacTerms(t), events))
}

// Price levels the installment again from a stated balance: 30,000.00 over the 9 months left at 1%
// a month is 3,502.21.
func TestPriceInstallmentIsLevelledAgainFromAStatement(t *testing.T) {
	t.Parallel()

	terms := priceTerms(t, mortgage.ContractRate{
		EffectiveFrom: date(t, "2023-12-10"), Rate: dec(t, "0.12"), Basis: mortgage.Nominal,
	})
	events := mortgage.Events{Statements: []mortgage.Statement{statement(t, "2024-03-10", "30000.00")}}

	assert.Equal(t, []replayed{
		{1, "2024-01-10", "1000.00", "7884.88", "8884.88", "0.00", "92115.12"},
		{2, "2024-02-10", "921.15", "7963.73", "8884.88", "0.00", "84151.39"},
		{3, "2024-03-10", "841.51", "8043.37", "8884.88", "0.00", "30000.00"},
		{4, "2024-04-10", "300.00", "3202.21", "3502.21", "0.00", "26797.79"},
		{5, "2024-05-10", "267.98", "3234.23", "3502.21", "0.00", "23563.56"},
		{6, "2024-06-10", "235.64", "3266.57", "3502.21", "0.00", "20296.99"},
		{7, "2024-07-10", "202.97", "3299.24", "3502.21", "0.00", "16997.75"},
		{8, "2024-08-10", "169.98", "3332.23", "3502.21", "0.00", "13665.52"},
		{9, "2024-09-10", "136.66", "3365.55", "3502.21", "0.00", "10299.97"},
		{10, "2024-10-10", "103.00", "3399.21", "3502.21", "0.00", "6900.76"},
		{11, "2024-11-10", "69.01", "3433.20", "3502.21", "0.00", "3467.56"},
		{12, "2024-12-10", "34.68", "3467.56", "3502.24", "0.00", "0.00"},
	}, replay(terms, events))
}

// correctedRow is an installment as text, with its indexer correction and what was prepaid after it.
type correctedRow struct {
	Number             int
	Correction         string
	Interest           string
	Amortization       string
	Amount             string
	Prepaid            string
	OutstandingBalance string
}

// A prepayment or a statement on February 20 leaves 35,000.00 owed. The TR of 1% for the month to
// March 10 corrects that balance, 350.00, and the 3rd installment charges 1% interest on the
// corrected 35,350.00, 353.50, then amortizes it over the 4 months left, 8,837.50 a month. The
// months without a published TR are not corrected.
func TestIndexCorrectionAfterAnEventAppliesToTheBalanceItLeft(t *testing.T) {
	t.Parallel()

	tests := []struct {
		name    string
		events  mortgage.Events
		prepaid string
	}{
		{
			name: "prepayment",
			events: mortgage.Events{Prepayments: []mortgage.Prepayment{
				prepayment(t, "2024-02-20", "5000.00", mortgage.LowerInstallment),
			}},
			prepaid: "5000.00",
		},
		{
			name:    "statement",
			events:  mortgage.Events{Statements: []mortgage.Statement{statement(t, "2024-02-20", "35000.00")}},
			prepaid: "0.00",
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			t.Parallel()

			terms := sacTerms(t)
			terms.Indexer = mortgage.TR
			outlook := indexes.NewOutlook(map[indexes.Index][]indexes.Value{
				indexes.TR: {published(t, "2024-02-10", "2024-03-10", "1.0000")},
			}, indexes.Expectations{}, nil)

			var rows []correctedRow
			for m := range terms.Schedule(outlook, tt.events, date(t, "2026-10-25")) {
				rows = append(rows, correctedRow{
					Number:             m.Number,
					Correction:         m.Correction.String(),
					Interest:           m.Interest.String(),
					Amortization:       m.Amortization.String(),
					Amount:             m.Amount.String(),
					Prepaid:            m.Prepaid.String(),
					OutstandingBalance: m.OutstandingBalance.String(),
				})
			}

			assert.Equal(t, []correctedRow{
				{1, "0.00", "600.00", "10000.00", "10610.00", "0.00", "50000.00"},
				{2, "0.00", "500.00", "10000.00", "10510.00", tt.prepaid, "35000.00"},
				{3, "350.00", "353.50", "8837.50", "9201.00", "0.00", "26512.50"},
				{4, "0.00", "265.13", "8837.50", "9112.63", "0.00", "17675.00"},
				{5, "0.00", "176.75", "8837.50", "9024.25", "0.00", "8837.50"},
				{6, "0.00", "88.38", "8837.50", "8935.88", "0.00", "0.00"},
			}, rows)
		})
	}
}

type drift struct {
	Date     string
	Stated   string
	Computed string
	Drift    string
}

func drifts(terms mortgage.Terms, events mortgage.Events) []drift {
	all := terms.Drifts(indexes.Outlook{}, events, time.Time{})

	out := make([]drift, 0, len(all))
	for _, d := range all {
		out = append(out, drift{
			Date:     d.Statement.Date.Format(time.DateOnly),
			Stated:   d.Statement.OutstandingBalance.String(),
			Computed: d.ComputedBalance.String(),
			Drift:    d.Amount.String(),
		})
	}

	return out
}

// Each statement is compared with the balance computed for its date, after the prepayments before
// it and from the statement before it. Once the mortgage is paid off, the computed balance is zero.
func TestDriftOfEachStatement(t *testing.T) {
	t.Parallel()

	events := mortgage.Events{
		Prepayments: []mortgage.Prepayment{prepayment(t, "2024-02-20", "5000.00", mortgage.LowerInstallment)},
		Statements: []mortgage.Statement{
			statement(t, "2024-07-01", "15.00"),
			statement(t, "2024-04-10", "17499.00"),
			statement(t, "2024-02-20", "35100.00"),
		},
	}

	assert.Equal(t, []drift{
		{"2024-02-20", "35100.00", "35000.00", "100.00"},
		{"2024-04-10", "17499.00", "17550.00", "-51.00"},
		{"2024-07-01", "15.00", "0.00", "15.00"},
	}, drifts(sacTerms(t), events))
}

// Prepaying everything after the 2nd installment ends the schedule there. The statements after
// that are compared with nothing owed, and none of them brings the balance back.
func TestStatementsAfterThePayoffOnlyReportTheirDrift(t *testing.T) {
	t.Parallel()

	events := mortgage.Events{
		Prepayments: []mortgage.Prepayment{prepayment(t, "2024-03-01", "50000.00", mortgage.ShortenTerm)},
		Statements: []mortgage.Statement{
			statement(t, "2024-03-05", "15.00"),
			statement(t, "2024-07-01", "20.00"),
		},
	}

	assert.Equal(t, []replayed{
		{1, "2024-01-10", "600.00", "10000.00", "10610.00", "0.00", "50000.00"},
		{2, "2024-02-10", "500.00", "10000.00", "10510.00", "40000.00", "0.00"},
	}, replay(sacTerms(t), events))
	assert.Equal(t, []drift{
		{"2024-03-05", "15.00", "0.00", "15.00"},
		{"2024-07-01", "20.00", "0.00", "20.00"},
	}, drifts(sacTerms(t), events))
}

// A statement that nothing is owed ends the schedule.
func TestStatementOfNothingOwedEndsTheSchedule(t *testing.T) {
	t.Parallel()

	events := mortgage.Events{Statements: []mortgage.Statement{statement(t, "2024-02-20", "0.00")}}

	assert.Equal(t, []replayed{
		{1, "2024-01-10", "600.00", "10000.00", "10610.00", "0.00", "50000.00"},
		{2, "2024-02-10", "500.00", "10000.00", "10510.00", "0.00", "0.00"},
	}, replay(sacTerms(t), events))
}

// A statement before the first installment sets the balance the first one starts from: 59,000.00
// over 6 months amortizes 9,833.33 a month, the rounding settling on the 3rd and 5th.
func TestStatementBeforeTheFirstInstallment(t *testing.T) {
	t.Parallel()

	events := mortgage.Events{Statements: []mortgage.Statement{statement(t, "2023-12-20", "59000.00")}}

	assert.Equal(t, []replayed{
		{1, "2024-01-10", "590.00", "9833.33", "10433.33", "0.00", "49166.67"},
		{2, "2024-02-10", "491.67", "9833.33", "10335.00", "0.00", "39333.34"},
		{3, "2024-03-10", "393.33", "9833.34", "10236.67", "0.00", "29500.00"},
		{4, "2024-04-10", "295.00", "9833.33", "10138.33", "0.00", "19666.67"},
		{5, "2024-05-10", "196.67", "9833.34", "10040.01", "0.00", "9833.33"},
		{6, "2024-06-10", "98.33", "9833.33", "9941.66", "0.00", "0.00"},
	}, replay(sacTerms(t), events))
	assert.Equal(t, []drift{{"2023-12-20", "59000.00", "60000.00", "-1000.00"}}, drifts(sacTerms(t), events))
}

// The rate doubles to 2% a month from the 7th installment, so shortening the term after the 6th
// compares installments at 2%: 9,192.67 over 6 months before the prepayment, and 9,186.26 over 3
// months after it. At the 1% in force on the 6th, 3 months would cost more than before, and 4 would
// be needed.
func TestShortenedTermUsesTheRateOfTheNextInstallment(t *testing.T) {
	t.Parallel()

	terms := priceTerms(t,
		mortgage.ContractRate{EffectiveFrom: date(t, "2023-12-10"), Rate: dec(t, "0.12"), Basis: mortgage.Nominal},
		mortgage.ContractRate{EffectiveFrom: date(t, "2024-07-01"), Rate: dec(t, "0.24"), Basis: mortgage.Nominal},
	)
	events := mortgage.Events{Prepayments: []mortgage.Prepayment{
		prepayment(t, "2024-06-25", "25000.00", mortgage.ShortenTerm),
	}}

	assert.Equal(t, []replayed{
		{1, "2024-01-10", "1000.00", "7884.88", "8884.88", "0.00", "92115.12"},
		{2, "2024-02-10", "921.15", "7963.73", "8884.88", "0.00", "84151.39"},
		{3, "2024-03-10", "841.51", "8043.37", "8884.88", "0.00", "76108.02"},
		{4, "2024-04-10", "761.08", "8123.80", "8884.88", "0.00", "67984.22"},
		{5, "2024-05-10", "679.84", "8205.04", "8884.88", "0.00", "59779.18"},
		{6, "2024-06-10", "597.79", "8287.09", "8884.88", "25000.00", "26492.09"},
		{7, "2024-07-10", "529.84", "8656.42", "9186.26", "0.00", "17835.67"},
		{8, "2024-08-10", "356.71", "8829.55", "9186.26", "0.00", "9006.12"},
		{9, "2024-09-10", "180.12", "9006.12", "9186.24", "0.00", "0.00"},
	}, replay(terms, events))
}
