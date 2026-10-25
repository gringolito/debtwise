package mortgage_test

import (
	"testing"
	"time"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"github.com/gringolito/debtwise/backend/decimal"
	"github.com/gringolito/debtwise/backend/mortgage"
)

// row is an installment as text, so a whole schedule compares against literals.
type row struct {
	Number             int
	DueDate            string
	Interest           string
	Amortization       string
	MIP                string
	DFI                string
	Fee                string
	Amount             string
	OutstandingBalance string
}

func schedule(terms mortgage.Terms) []row {
	var rows []row
	for m := range terms.Schedule() {
		rows = append(rows, row{
			Number:             m.Number,
			DueDate:            m.DueDate.Format(time.DateOnly),
			Interest:           m.Interest.String(),
			Amortization:       m.Amortization.String(),
			MIP:                m.MIP.String(),
			DFI:                m.DFI.String(),
			Fee:                m.Fee.String(),
			Amount:             m.Amount.String(),
			OutstandingBalance: m.OutstandingBalance.String(),
		})
	}

	return rows
}

func date(t *testing.T, s string) time.Time {
	t.Helper()

	d, err := time.Parse(time.DateOnly, s)
	require.NoError(t, err)

	return d
}

func dec(t *testing.T, s string) decimal.Decimal {
	t.Helper()

	d, err := decimal.Parse(s)
	require.NoError(t, err)

	return d
}

// 120,000.00 over 12 months at 1% a month amortizes 10,000.00 a month, so each month's interest
// falls by 100.00 and its MIP, at 0.03% of the outstanding balance, by 3.00. DFI is 0.01% of the
// 200,000.00 appraisal every month. Installments fall on the last day of each month.
func TestSACSchedule(t *testing.T) {
	t.Parallel()

	terms := mortgage.Terms{
		ContractDate:         date(t, "2023-12-31"),
		OriginalAmount:       dec(t, "120000.00"),
		TermMonths:           12,
		FirstInstallmentDate: date(t, "2024-01-31"),
		AmortizationSystem:   mortgage.SAC,
		AppraisalValue:       dec(t, "200000.00"),
		ContractRates: []mortgage.ContractRate{
			{EffectiveFrom: date(t, "2023-12-31"), Rate: dec(t, "0.12"), Basis: mortgage.Nominal},
		},
		MIPRates: []mortgage.MonthlyRate{{EffectiveFrom: date(t, "2023-12-31"), Rate: dec(t, "0.0003")}},
		DFIRates: []mortgage.MonthlyRate{{EffectiveFrom: date(t, "2023-12-31"), Rate: dec(t, "0.0001")}},
		Fees:     []mortgage.Fee{{EffectiveFrom: date(t, "2023-12-31"), Amount: dec(t, "25.00")}},
	}

	assert.Equal(t, []row{
		{1, "2024-01-31", "1200.00", "10000.00", "36.00", "20.00", "25.00", "11281.00", "110000.00"},
		{2, "2024-02-29", "1100.00", "10000.00", "33.00", "20.00", "25.00", "11178.00", "100000.00"},
		{3, "2024-03-31", "1000.00", "10000.00", "30.00", "20.00", "25.00", "11075.00", "90000.00"},
		{4, "2024-04-30", "900.00", "10000.00", "27.00", "20.00", "25.00", "10972.00", "80000.00"},
		{5, "2024-05-31", "800.00", "10000.00", "24.00", "20.00", "25.00", "10869.00", "70000.00"},
		{6, "2024-06-30", "700.00", "10000.00", "21.00", "20.00", "25.00", "10766.00", "60000.00"},
		{7, "2024-07-31", "600.00", "10000.00", "18.00", "20.00", "25.00", "10663.00", "50000.00"},
		{8, "2024-08-31", "500.00", "10000.00", "15.00", "20.00", "25.00", "10560.00", "40000.00"},
		{9, "2024-09-30", "400.00", "10000.00", "12.00", "20.00", "25.00", "10457.00", "30000.00"},
		{10, "2024-10-31", "300.00", "10000.00", "9.00", "20.00", "25.00", "10354.00", "20000.00"},
		{11, "2024-11-30", "200.00", "10000.00", "6.00", "20.00", "25.00", "10251.00", "10000.00"},
		{12, "2024-12-31", "100.00", "10000.00", "3.00", "20.00", "25.00", "10148.00", "0.00"},
	}, schedule(terms))
}

// priceTerms lends 100,000.00 over 12 months under Price at the given contract rates, with no
// insurance or fee, installments on the 10th from January 2024.
func priceTerms(t *testing.T, rates ...mortgage.ContractRate) mortgage.Terms {
	t.Helper()

	return mortgage.Terms{
		ContractDate:         date(t, "2023-12-10"),
		OriginalAmount:       dec(t, "100000.00"),
		TermMonths:           12,
		FirstInstallmentDate: date(t, "2024-01-10"),
		AmortizationSystem:   mortgage.Price,
		AppraisalValue:       dec(t, "150000.00"),
		ContractRates:        rates,
		MIPRates:             []mortgage.MonthlyRate{{EffectiveFrom: date(t, "2023-12-10"), Rate: dec(t, "0")}},
		DFIRates:             []mortgage.MonthlyRate{{EffectiveFrom: date(t, "2023-12-10"), Rate: dec(t, "0")}},
		Fees:                 []mortgage.Fee{{EffectiveFrom: date(t, "2023-12-10"), Amount: dec(t, "0")}},
	}
}

// 100,000.00 over 12 months at 1% a month is the textbook Price installment of 8,884.88. The last
// one is 3 centavos lower: it pays off what rounding left.
func TestPriceScheduleIsTheSameForEquivalentNominalAndEffectiveRates(t *testing.T) {
	t.Parallel()

	tests := []struct {
		name  string
		rate  string
		basis mortgage.RateBasis
	}{
		{name: "nominal", rate: "0.12", basis: mortgage.Nominal},
		{name: "effective", rate: "0.126825030131969720661201", basis: mortgage.Effective},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			t.Parallel()

			terms := priceTerms(t, mortgage.ContractRate{
				EffectiveFrom: date(t, "2023-12-10"), Rate: dec(t, tt.rate), Basis: tt.basis,
			})

			assert.Equal(t, []row{
				{1, "2024-01-10", "1000.00", "7884.88", "0.00", "0.00", "0.00", "8884.88", "92115.12"},
				{2, "2024-02-10", "921.15", "7963.73", "0.00", "0.00", "0.00", "8884.88", "84151.39"},
				{3, "2024-03-10", "841.51", "8043.37", "0.00", "0.00", "0.00", "8884.88", "76108.02"},
				{4, "2024-04-10", "761.08", "8123.80", "0.00", "0.00", "0.00", "8884.88", "67984.22"},
				{5, "2024-05-10", "679.84", "8205.04", "0.00", "0.00", "0.00", "8884.88", "59779.18"},
				{6, "2024-06-10", "597.79", "8287.09", "0.00", "0.00", "0.00", "8884.88", "51492.09"},
				{7, "2024-07-10", "514.92", "8369.96", "0.00", "0.00", "0.00", "8884.88", "43122.13"},
				{8, "2024-08-10", "431.22", "8453.66", "0.00", "0.00", "0.00", "8884.88", "34668.47"},
				{9, "2024-09-10", "346.68", "8538.20", "0.00", "0.00", "0.00", "8884.88", "26130.27"},
				{10, "2024-10-10", "261.30", "8623.58", "0.00", "0.00", "0.00", "8884.88", "17506.69"},
				{11, "2024-11-10", "175.07", "8709.81", "0.00", "0.00", "0.00", "8884.88", "8796.88"},
				{12, "2024-12-10", "87.97", "8796.88", "0.00", "0.00", "0.00", "8884.85", "0.00"},
			}, schedule(terms))
		})
	}
}

// From July the rate doubles to 2% a month, and Price levels the installment again over the six
// months left: 51,492.09 × 0.02 / (1 - 1.02⁻⁶) = 9,192.67.
func TestPriceInstallmentIsRecalculatedWhenTheRateChanges(t *testing.T) {
	t.Parallel()

	terms := priceTerms(t,
		mortgage.ContractRate{EffectiveFrom: date(t, "2023-12-10"), Rate: dec(t, "0.12"), Basis: mortgage.Nominal},
		mortgage.ContractRate{EffectiveFrom: date(t, "2024-07-01"), Rate: dec(t, "0.24"), Basis: mortgage.Nominal},
	)

	assert.Equal(t, []row{
		{1, "2024-01-10", "1000.00", "7884.88", "0.00", "0.00", "0.00", "8884.88", "92115.12"},
		{2, "2024-02-10", "921.15", "7963.73", "0.00", "0.00", "0.00", "8884.88", "84151.39"},
		{3, "2024-03-10", "841.51", "8043.37", "0.00", "0.00", "0.00", "8884.88", "76108.02"},
		{4, "2024-04-10", "761.08", "8123.80", "0.00", "0.00", "0.00", "8884.88", "67984.22"},
		{5, "2024-05-10", "679.84", "8205.04", "0.00", "0.00", "0.00", "8884.88", "59779.18"},
		{6, "2024-06-10", "597.79", "8287.09", "0.00", "0.00", "0.00", "8884.88", "51492.09"},
		{7, "2024-07-10", "1029.84", "8162.83", "0.00", "0.00", "0.00", "9192.67", "43329.26"},
		{8, "2024-08-10", "866.59", "8326.08", "0.00", "0.00", "0.00", "9192.67", "35003.18"},
		{9, "2024-09-10", "700.06", "8492.61", "0.00", "0.00", "0.00", "9192.67", "26510.57"},
		{10, "2024-10-10", "530.21", "8662.46", "0.00", "0.00", "0.00", "9192.67", "17848.11"},
		{11, "2024-11-10", "356.96", "8835.71", "0.00", "0.00", "0.00", "9192.67", "9012.40"},
		{12, "2024-12-10", "180.25", "9012.40", "0.00", "0.00", "0.00", "9192.65", "0.00"},
	}, schedule(terms))
}

// sacTerms lends 60,000.00 over 6 months under SAC, amortizing 10,000.00 a month, installments on
// the 10th from January 2024. The rows apply from the contract date unless the test adds later
// ones.
func sacTerms(t *testing.T) mortgage.Terms {
	t.Helper()

	return mortgage.Terms{
		ContractDate:         date(t, "2023-12-10"),
		OriginalAmount:       dec(t, "60000.00"),
		TermMonths:           6,
		FirstInstallmentDate: date(t, "2024-01-10"),
		AmortizationSystem:   mortgage.SAC,
		AppraisalValue:       dec(t, "100000.00"),
		ContractRates: []mortgage.ContractRate{
			{EffectiveFrom: date(t, "2023-12-10"), Rate: dec(t, "0.12"), Basis: mortgage.Nominal},
		},
		MIPRates: []mortgage.MonthlyRate{{EffectiveFrom: date(t, "2023-12-10"), Rate: dec(t, "0")}},
		DFIRates: []mortgage.MonthlyRate{{EffectiveFrom: date(t, "2023-12-10"), Rate: dec(t, "0")}},
		Fees:     []mortgage.Fee{{EffectiveFrom: date(t, "2023-12-10"), Amount: dec(t, "10.00")}},
	}
}

// The rate doubles from March 15, between the 3rd and 4th installments, so the 4th is the first to
// pay 2%. The fee rises on May 10, the 5th installment's due date, which already pays it.
func TestRateAndFeeChangesApplyFromTheirEffectiveDate(t *testing.T) {
	t.Parallel()

	terms := sacTerms(t)
	terms.ContractRates = append(terms.ContractRates,
		mortgage.ContractRate{EffectiveFrom: date(t, "2024-03-15"), Rate: dec(t, "0.24"), Basis: mortgage.Nominal})
	terms.Fees = append(terms.Fees, mortgage.Fee{EffectiveFrom: date(t, "2024-05-10"), Amount: dec(t, "15.00")})

	assert.Equal(t, []row{
		{1, "2024-01-10", "600.00", "10000.00", "0.00", "0.00", "10.00", "10610.00", "50000.00"},
		{2, "2024-02-10", "500.00", "10000.00", "0.00", "0.00", "10.00", "10510.00", "40000.00"},
		{3, "2024-03-10", "400.00", "10000.00", "0.00", "0.00", "10.00", "10410.00", "30000.00"},
		{4, "2024-04-10", "600.00", "10000.00", "0.00", "0.00", "10.00", "10610.00", "20000.00"},
		{5, "2024-05-10", "400.00", "10000.00", "0.00", "0.00", "15.00", "10415.00", "10000.00"},
		{6, "2024-06-10", "200.00", "10000.00", "0.00", "0.00", "15.00", "10215.00", "0.00"},
	}, schedule(terms))
}

// MIP is 0.03% of the outstanding balance until the age band changes on April 1, and 0.05% from
// the 4th installment on. DFI is 0.012% of the 100,000.00 appraisal however low the balance gets.
func TestMIPFollowsTheBalanceAndAgeBandWhileDFIFollowsTheAppraisal(t *testing.T) {
	t.Parallel()

	terms := sacTerms(t)
	terms.MIPRates = []mortgage.MonthlyRate{
		{EffectiveFrom: date(t, "2024-04-01"), Rate: dec(t, "0.0005")},
		{EffectiveFrom: date(t, "2023-12-10"), Rate: dec(t, "0.0003")},
	}
	terms.DFIRates = []mortgage.MonthlyRate{{EffectiveFrom: date(t, "2023-12-10"), Rate: dec(t, "0.00012")}}

	assert.Equal(t, []row{
		{1, "2024-01-10", "600.00", "10000.00", "18.00", "12.00", "10.00", "10640.00", "50000.00"},
		{2, "2024-02-10", "500.00", "10000.00", "15.00", "12.00", "10.00", "10537.00", "40000.00"},
		{3, "2024-03-10", "400.00", "10000.00", "12.00", "12.00", "10.00", "10434.00", "30000.00"},
		{4, "2024-04-10", "300.00", "10000.00", "15.00", "12.00", "10.00", "10337.00", "20000.00"},
		{5, "2024-05-10", "200.00", "10000.00", "10.00", "12.00", "10.00", "10232.00", "10000.00"},
		{6, "2024-06-10", "100.00", "10000.00", "5.00", "12.00", "10.00", "10127.00", "0.00"},
	}, schedule(terms))
}

// SAC amortizes the balance over the months left: 66,666.67 / 2 = 33,333.335 rounds up, so the
// 2nd installment amortizes a centavo more than the 1st and the 3rd.
func TestSACAmortizesTheBalanceOverTheMonthsLeft(t *testing.T) {
	t.Parallel()

	terms := sacTerms(t)
	terms.OriginalAmount = dec(t, "100000.00")
	terms.TermMonths = 3
	terms.ContractRates = []mortgage.ContractRate{
		{EffectiveFrom: date(t, "2023-12-10"), Rate: dec(t, "0"), Basis: mortgage.Nominal},
	}

	assert.Equal(t, []row{
		{1, "2024-01-10", "0.00", "33333.33", "0.00", "0.00", "10.00", "33343.33", "66666.67"},
		{2, "2024-02-10", "0.00", "33333.34", "0.00", "0.00", "10.00", "33343.34", "33333.33"},
		{3, "2024-03-10", "0.00", "33333.33", "0.00", "0.00", "10.00", "33343.33", "0.00"},
	}, schedule(terms))
}

// At 0% Price splits the balance evenly, 8,333.33 a month, and the last installment pays the
// 4 centavos rounding left.
func TestPriceScheduleWithoutInterest(t *testing.T) {
	t.Parallel()

	terms := priceTerms(t, mortgage.ContractRate{
		EffectiveFrom: date(t, "2023-12-10"), Rate: dec(t, "0"), Basis: mortgage.Nominal,
	})

	assert.Equal(t, []row{
		{1, "2024-01-10", "0.00", "8333.33", "0.00", "0.00", "0.00", "8333.33", "91666.67"},
		{2, "2024-02-10", "0.00", "8333.33", "0.00", "0.00", "0.00", "8333.33", "83333.34"},
		{3, "2024-03-10", "0.00", "8333.33", "0.00", "0.00", "0.00", "8333.33", "75000.01"},
		{4, "2024-04-10", "0.00", "8333.33", "0.00", "0.00", "0.00", "8333.33", "66666.68"},
		{5, "2024-05-10", "0.00", "8333.33", "0.00", "0.00", "0.00", "8333.33", "58333.35"},
		{6, "2024-06-10", "0.00", "8333.33", "0.00", "0.00", "0.00", "8333.33", "50000.02"},
		{7, "2024-07-10", "0.00", "8333.33", "0.00", "0.00", "0.00", "8333.33", "41666.69"},
		{8, "2024-08-10", "0.00", "8333.33", "0.00", "0.00", "0.00", "8333.33", "33333.36"},
		{9, "2024-09-10", "0.00", "8333.33", "0.00", "0.00", "0.00", "8333.33", "25000.03"},
		{10, "2024-10-10", "0.00", "8333.33", "0.00", "0.00", "0.00", "8333.33", "16666.70"},
		{11, "2024-11-10", "0.00", "8333.33", "0.00", "0.00", "0.00", "8333.33", "8333.37"},
		{12, "2024-12-10", "0.00", "8333.37", "0.00", "0.00", "0.00", "8333.37", "0.00"},
	}, schedule(terms))
}

// A 30-year Price mortgage at 10% a year effective, with installments on the 31st that fall on
// each month's last day, a MIP age band from June 2030, and figures worked out independently at 60
// significant digits.
func TestThirtyYearPriceSchedule(t *testing.T) {
	t.Parallel()

	terms := mortgage.Terms{
		ContractDate:         date(t, "2023-12-31"),
		OriginalAmount:       dec(t, "250000.00"),
		TermMonths:           360,
		FirstInstallmentDate: date(t, "2024-01-31"),
		AmortizationSystem:   mortgage.Price,
		AppraisalValue:       dec(t, "320000.00"),
		ContractRates: []mortgage.ContractRate{
			{EffectiveFrom: date(t, "2023-12-31"), Rate: dec(t, "0.10"), Basis: mortgage.Effective},
		},
		MIPRates: []mortgage.MonthlyRate{
			{EffectiveFrom: date(t, "2023-12-31"), Rate: dec(t, "0.000258")},
			{EffectiveFrom: date(t, "2030-06-01"), Rate: dec(t, "0.000412")},
		},
		DFIRates: []mortgage.MonthlyRate{{EffectiveFrom: date(t, "2023-12-31"), Rate: dec(t, "0.000071")}},
		Fees:     []mortgage.Fee{{EffectiveFrom: date(t, "2023-12-31"), Amount: dec(t, "25.00")}},
	}

	rows := schedule(terms)

	require.Len(t, rows, 360)
	assert.Equal(t, []row{
		{1, "2024-01-31", "1993.54", "121.19", "64.50", "22.72", "25.00", "2226.95", "249878.81"},
		{2, "2024-02-29", "1992.57", "122.16", "64.47", "22.72", "25.00", "2226.92", "249756.65"},
		{12, "2024-12-31", "1982.47", "132.26", "64.14", "22.72", "25.00", "2226.59", "248480.15"},
		{13, "2025-01-31", "1981.42", "133.31", "64.11", "22.72", "25.00", "2226.56", "248346.84"},
		{77, "2030-05-31", "1893.10", "221.63", "61.25", "22.72", "25.00", "2223.70", "237182.66"},
		{78, "2030-06-30", "1891.33", "223.40", "97.72", "22.72", "25.00", "2260.17", "236959.26"},
		{360, "2053-12-31", "16.68", "2092.13", "0.86", "22.72", "25.00", "2157.39", "0.00"},
	}, []row{rows[0], rows[1], rows[11], rows[12], rows[76], rows[77], rows[359]})
}
