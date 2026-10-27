package bonds_test

import (
	"testing"
	"time"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"github.com/gringolito/debtwise/backend/bonds"
	"github.com/gringolito/debtwise/backend/decimal"
	"github.com/gringolito/debtwise/backend/indexes"
)

func ipcaProjectedBy(method indexes.Method) []indexes.ProjectionMethod {
	return []indexes.ProjectionMethod{{Index: indexes.IPCA, Method: method}}
}

// ipcaHistory is a monthly IPCA series in the shape of SGS 433, from 2007-05 to 2012-04, the month
// IBGE's latest index number of ipcaNumbers is of: 0.30% a month for its first 48 months and 0.60%
// for its last 12, but 0.53% for 2011-12, the projection Tesouro Direto's worked example uses. Its
// latest 12 months average 0.5942 (the sum 7.13 over 12, at 4 places half to even) and its 60 months
// 0.3588.
func ipcaHistory(t *testing.T) []indexes.Value {
	t.Helper()

	values := make([]indexes.Value, 0, 60)

	for i := range 60 {
		month := date(2007, time.May+time.Month(i), 1)

		value := "0.30"
		if i >= 48 {
			value = "0.60"
		}

		if month.Equal(date(2011, time.December, 1)) {
			value = "0.53"
		}

		values = append(values, indexes.Value{PeriodStart: month, PeriodEnd: month, Value: mustDecimal(t, value)})
	}

	return values
}

// ipcaOf is the IPCA of the months after the published numbers and series, projected by method
// from ipcaHistory and from expectations.
func ipcaOf(t *testing.T, method indexes.Method, expectations indexes.Expectations) bonds.IPCA {
	t.Helper()

	outlook := indexes.NewOutlook(
		map[indexes.Index][]indexes.Value{indexes.IPCA: ipcaHistory(t)},
		expectations,
		ipcaProjectedBy(method),
	)

	return bonds.IPCA{Numbers: ipcaNumbers(t), Outlook: outlook}
}

// ntnbTaxes are the seeded income tax and IOF tables with a custody fee of 0.30% from 2010, which
// the seeded one, from 2020, doesn't cover for lots held in 2011 and 2012.
func ntnbTaxes(t *testing.T) bonds.Taxes {
	t.Helper()

	taxes := seededTaxes(t)
	taxes.CustodyFee = []bonds.CustodyFeeRate{{EffectiveFrom: date(2010, time.January, 1), Rate: mustDecimal(t, "0.0030")}}

	return taxes
}

// ntnbPrincipalLot is one and a half NTN-B Principal maturing on 2015-05-15, bought on 2011-10-03
// at the contracted 5.17% a year for R$ 1,750.00 each, R$ 2,625.00 in all: Tesouro Direto's worked
// example of that bond.
func ntnbPrincipalLot(t *testing.T) bonds.Lot {
	t.Helper()

	return bonds.Lot{
		Bond:         bonds.Bond{Type: bonds.NTNBPrincipal, Maturity: date(2015, time.May, 15)},
		PurchaseDate: date(2011, time.October, 3),
		Rate:         mustDecimal(t, "0.0517"),
		UnitPrice:    mustDecimal(t, "1750.00"),
		Quantity:     mustDecimal(t, "1.5"),
	}
}

// An NTN-B Principal's Accrual Value is its VNA times its quotation at the contracted rate, the
// price truncated at 6 places and the lot's value rounded to cents. The figures are worked out with
// Python's decimal module and a separate implementation of Tesouro's methodology, which gives
// Tesouro's published examples:
//
//   - On 2011-12-15, a past 15th, the VNA is the published R$ 2,097.583332 (Tesouro Direto's
//     example) and the quotation 84.2124: R$ 1,766.425265 each, R$ 2,649.64 for one and a half.
//   - On 2012-01-03, Tesouro Direto's own example: the VNA 2,104.390122 projected with 0.53% for
//     December, the quotation 84.4317 and the PU 1,776.7723 it publishes, R$ 2,665.16 for one and a
//     half. That month's IPCA is in the published series here, so nothing is projected.
//   - On 2012-06-01, the VNA of 2012-05-15 (published, 2,147.539359) is projected to 2,154.527788
//     with the projected IPCA of May, so the value is marked as projected by the IPCA's method.
func TestLotValueOfAnNTNBPrincipalAccruesFromTheVNAAndItsQuotation(t *testing.T) {
	t.Parallel()

	tests := []struct {
		name string
		on   time.Time
		want amountView
	}{
		{
			name: "on a past 15th",
			on:   date(2011, time.December, 15),
			want: amountView{Gross: "2649.64", IOF: "0.00", IncomeTax: "5.19", CustodyFee: "1.59", Net: "2642.86"},
		},
		{
			name: "between 15ths, with the IPCA of the month published",
			on:   date(2012, time.January, 3),
			want: amountView{Gross: "2665.16", IOF: "0.00", IncomeTax: "8.58", CustodyFee: "2.02", Net: "2654.56"},
		},
		{
			name: "between 15ths, with the IPCA of the month projected",
			on:   date(2012, time.June, 1),
			want: amountView{
				Gross: "2786.02", IOF: "0.00", IncomeTax: "31.10", CustodyFee: "5.54", Net: "2749.38",
				ProjectedBy: ipcaProjectedBy(indexes.Trailing12),
			},
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			t.Parallel()

			valuation, err := ntnbPrincipalLot(t).Value(tt.on, ntnbTaxes(t), ipcaOf(t, indexes.Trailing12, indexes.Expectations{}), nil)
			require.NoError(t, err)

			assert.Equal(t, tt.want, viewAmountOf(t, valuation.Accrual))
			assert.Empty(t, valuation.Coupons)
		})
	}
}

// At maturity the NTN-B Principal pays its VNA of 2015-05-15, which is the VNA of 2012-04's index
// number grown by the IPCA projected for the 36 months after it, 0.5942% each by the average of the
// latest 12: R$ 2,658.073670 each, R$ 3,987.11 for one and a half, after 1,320 days held. The
// amount is marked once as projected by the IPCA's method, not once for each month.
func TestLotValueOfAnNTNBPrincipalMaturesAtTheVNAGrownByTheProjectedIPCA(t *testing.T) {
	t.Parallel()

	valuation, err := ntnbPrincipalLot(t).Value(date(2011, time.December, 15), ntnbTaxes(t), ipcaOf(t, indexes.Trailing12, indexes.Expectations{}), nil)
	require.NoError(t, err)

	assert.Equal(t, amountView{
		Gross: "3987.11", IOF: "0.00", IncomeTax: "197.83", CustodyFee: "43.26", Net: "3746.02",
		ProjectedBy: ipcaProjectedBy(indexes.Trailing12),
	}, viewAmount(valuation.Maturity))
}

// The VNA of 2013-05-15 is 2012-04's index number grown by the twelve months projected after it,
// and each projection method grows it differently, so the Maturity Value of two NTN-B Principal
// bought on 2011-09-01 for R$ 1,700.00 moves with the method: the average of the latest 12 months,
// 0.5942% a month, gives a VNA of 2,305.772344; the average of 60, 0.3588%, 2,241.850507; and
// Focus's medians for those months, 0.40, 0.30, 0.35, 0.45, 0.50, 0.55, 0.38, 0.33, 0.42, 0.48,
// 0.52 and 0.60%, 2,263.703488.
func TestLotValueOfAnNTNBPrincipalMaturityMovesWithTheProjectionMethod(t *testing.T) {
	t.Parallel()

	lot := bonds.Lot{
		Bond:         bonds.Bond{Type: bonds.NTNBPrincipal, Maturity: date(2013, time.May, 15)},
		PurchaseDate: date(2011, time.September, 1),
		Rate:         mustDecimal(t, "0.0517"),
		UnitPrice:    mustDecimal(t, "1700.00"),
		Quantity:     mustDecimal(t, "2"),
	}

	var focus indexes.Expectations

	for i, median := range []string{"0.40", "0.30", "0.35", "0.45", "0.50", "0.55", "0.38", "0.33", "0.42", "0.48", "0.52", "0.60"} {
		focus.MonthlyIPCA = append(focus.MonthlyIPCA, indexes.MonthMedian{
			Month:  date(2012, time.May+time.Month(i), 1),
			Median: mustDecimal(t, median),
		})
	}

	tests := []struct {
		method indexes.Method
		want   amountView
	}{
		{
			method: indexes.Trailing12,
			want: amountView{
				Gross: "4611.54", IOF: "0.00", IncomeTax: "207.89", CustodyFee: "23.58", Net: "4380.07",
				ProjectedBy: ipcaProjectedBy(indexes.Trailing12),
			},
		},
		{
			method: indexes.Trailing60,
			want: amountView{
				Gross: "4483.70", IOF: "0.00", IncomeTax: "185.64", CustodyFee: "22.92", Net: "4275.14",
				ProjectedBy: ipcaProjectedBy(indexes.Trailing60),
			},
		},
		{
			method: indexes.Focus,
			want: amountView{
				Gross: "4527.41", IOF: "0.00", IncomeTax: "193.25", CustodyFee: "23.15", Net: "4311.01",
				ProjectedBy: ipcaProjectedBy(indexes.Focus),
			},
		},
	}

	for _, tt := range tests {
		t.Run(string(tt.method), func(t *testing.T) {
			t.Parallel()

			valuation, err := lot.Value(date(2011, time.December, 15), ntnbTaxes(t), ipcaOf(t, tt.method, focus), nil)
			require.NoError(t, err)

			assert.Equal(t, tt.want, viewAmount(valuation.Maturity))
		})
	}
}

// One and a half NTN-B maturing on 2014-05-15, bought on 2011-12-01 at the contracted 5.30% for
// R$ 2,090.12 (R$ 3,135.18 in all), valued on 2012-06-01, with the IPCA after 2012-04 projected by
// the average of the latest 12 months. Its figures are worked out with Python's decimal module and
// a separate implementation of Tesouro's methodology:
//
//   - A coupon is the VNA on its date times the 2.956301% coupon factor, truncated at 6 places, and
//     paid for one and a half bonds. The only coupon already paid, 2012-05-15, uses the published
//     VNA 2,147.539359 (63.487727 each, R$ 95.23), so nothing in it is projected. The three after
//     use VNAs of 2,225.249842, 2,305.772344 and 2,389.208619 grown by projected IPCA, and are marked
//     as projected.
//   - Each coupon pays the fee on the lot's accrual value that day plus the coupon, from the
//     previous coupon or the purchase, and the income tax of its bracket on what is left of it.
//   - The Accrual Value on 2012-06-01 has the VNA projected from 2012-05-15 with May's projected
//     IPCA, a quotation of 101.5840 and a PU of 2,188.655508, and its custody fee accrues from the
//     coupon of 2012-05-15, 17 days before.
//   - The Maturity Value is the VNA 2,475.664104 plus the last coupon, 2,548.852186 each, with the
//     fee accrued since the last coupon before it, 2013-11-15.
func TestLotValueOfAnNTNBListsPastCouponsFromPublishedVNAsAndFutureOnesFromProjectedIPCA(t *testing.T) {
	t.Parallel()

	lot := bonds.Lot{
		Bond:         bonds.Bond{Type: bonds.NTNB, Maturity: date(2014, time.May, 15)},
		PurchaseDate: date(2011, time.December, 1),
		Rate:         mustDecimal(t, "0.0530"),
		UnitPrice:    mustDecimal(t, "2090.12"),
		Quantity:     mustDecimal(t, "1.5"),
	}
	projected := ipcaProjectedBy(indexes.Trailing12)

	valuation, err := lot.Value(date(2012, time.June, 1), ntnbTaxes(t), ipcaOf(t, indexes.Trailing12, indexes.Expectations{}), nil)
	require.NoError(t, err)

	assert.Equal(t,
		amountView{Gross: "3282.98", IOF: "0.00", IncomeTax: "29.47", CustodyFee: "0.46", Net: "3253.05", ProjectedBy: projected},
		viewAmountOf(t, valuation.Accrual))
	assert.Equal(t,
		amountView{Gross: "3823.28", IOF: "0.00", IncomeTax: "102.36", CustodyFee: "5.69", Net: "3715.23", ProjectedBy: projected},
		viewAmount(valuation.Maturity))
	assert.Nil(t, valuation.Market)
	assert.Equal(t, []couponView{
		{Date: "2012-05-15", Amount: amountView{Gross: "95.23", IOF: "0.00", IncomeTax: "20.40", CustodyFee: "4.58", Net: "70.25"}},
		{Date: "2012-11-15", Amount: amountView{Gross: "98.68", IOF: "0.00", IncomeTax: "18.69", CustodyFee: "5.25", Net: "74.74", ProjectedBy: projected}},
		{Date: "2013-05-15", Amount: amountView{Gross: "102.25", IOF: "0.00", IncomeTax: "16.96", CustodyFee: "5.33", Net: "79.96", ProjectedBy: projected}},
		{Date: "2013-11-15", Amount: amountView{Gross: "105.95", IOF: "0.00", IncomeTax: "17.56", CustodyFee: "5.60", Net: "82.79", ProjectedBy: projected}},
	}, viewCoupons(valuation.Coupons))
}

// A VNA that is neither published nor projected can't be valued: the IPCA index numbers lack the
// month before the 15th, or the outlook has no IPCA to grow the latest published number by.
func TestLotValueOfAnNTNBFailsWithoutTheIPCAItsVNANeeds(t *testing.T) {
	t.Parallel()

	tests := []struct {
		name string
		lot  bonds.Lot
		on   time.Time
		ipca bonds.IPCA
	}{
		{
			name: "no index numbers",
			lot:  ntnbPrincipalLot(t),
			on:   date(2011, time.December, 15),
			ipca: bonds.IPCA{Outlook: ipcaOf(t, indexes.Trailing12, indexes.Expectations{}).Outlook},
		},
		{
			name: "no outlook to project the months after the latest index number",
			lot:  ntnbPrincipalLot(t),
			on:   date(2011, time.December, 15),
			ipca: bonds.IPCA{Numbers: ipcaNumbers(t)},
		},
		{
			name: "an outlook with nothing to project by",
			lot:  ntnbPrincipalLot(t),
			on:   date(2011, time.December, 15),
			ipca: bonds.IPCA{Numbers: ipcaNumbers(t), Outlook: indexes.Outlook{}},
		},
		{
			name: "a month missing between published index numbers",
			lot: bonds.Lot{
				Bond:         bonds.Bond{Type: bonds.NTNBPrincipal, Maturity: date(2011, time.November, 15)},
				PurchaseDate: date(2011, time.October, 3),
				Rate:         mustDecimal(t, "0.0517"),
				UnitPrice:    mustDecimal(t, "1750.00"),
				Quantity:     mustDecimal(t, "1"),
			},
			on:   date(2011, time.October, 20),
			ipca: ipcaOf(t, indexes.Trailing12, indexes.Expectations{}),
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			t.Parallel()

			_, err := tt.lot.Value(tt.on, ntnbTaxes(t), tt.ipca, nil)

			assert.ErrorIs(t, err, bonds.ErrMissingIPCANumber)
		})
	}
}

// A sale at the sell price Tesouro Direto quotes doesn't depend on the IPCA, so the Market Value
// isn't marked as projected where the Accrual Value is: one and a half NTN-B Principal sold at
// R$ 1,800.00 on 2012-06-01, after 242 days held, gain R$ 75.00 over the R$ 2,625.00 they cost, pay
// 5.37 of custody fee and 20% of what is left, 13.93.
func TestLotValueOfAnNTNBPrincipalSoldAtTheSellPriceIsNotProjected(t *testing.T) {
	t.Parallel()

	sell := &bonds.Price{Rate: mustDecimal(t, "0.0480"), UnitPrice: mustDecimal(t, "1800.00")}

	valuation, err := ntnbPrincipalLot(t).Value(date(2012, time.June, 1), ntnbTaxes(t), ipcaOf(t, indexes.Trailing12, indexes.Expectations{}), sell)
	require.NoError(t, err)

	assert.Equal(t,
		amountView{Gross: "2700.00", IOF: "0.00", IncomeTax: "13.93", CustodyFee: "5.37", Net: "2680.70"},
		viewAmountOf(t, valuation.Market))
}

// monthlyOutlook is an IPCA outlook that gives 0.50% for every month, projected by the methods it
// lists for the month, if any.
type monthlyOutlook map[time.Time][]indexes.Method

func (o monthlyOutlook) IPCA(month time.Time) (indexes.Estimate, bool) {
	estimate := indexes.Estimate{Value: decimal.FromInt(1).Quo(decimal.FromInt(2))}
	for _, method := range o[month] {
		estimate.Methods = append(estimate.Methods, indexes.ProjectionMethod{Index: indexes.IPCA, Method: method})
	}

	return estimate, true
}

// An amount depending on IPCA months projected by different methods names each method once, in the
// order of the months that first use it: the VNA of 2012-08-15 grows 2012-04's index number by
// May, June and July, projected by Focus, by the average of 12 months, and by Focus and the
// average of 60, and the Accrual Value of 2012-05-20 depends on May alone.
func TestLotValueNamesEachProjectionMethodOnceInTheOrderOfTheMonthsUsingIt(t *testing.T) {
	t.Parallel()

	lot := bonds.Lot{
		Bond:         bonds.Bond{Type: bonds.NTNBPrincipal, Maturity: date(2012, time.August, 15)},
		PurchaseDate: date(2011, time.December, 1),
		Rate:         mustDecimal(t, "0.0517"),
		UnitPrice:    mustDecimal(t, "1700.00"),
		Quantity:     mustDecimal(t, "1"),
	}
	outlook := monthlyOutlook{
		date(2012, time.May, 1):  {indexes.Focus},
		date(2012, time.June, 1): {indexes.Trailing12},
		date(2012, time.July, 1): {indexes.Focus, indexes.Trailing60},
	}

	valuation, err := lot.Value(date(2012, time.May, 20), ntnbTaxes(t), bonds.IPCA{Numbers: ipcaNumbers(t), Outlook: outlook}, nil)
	require.NoError(t, err)

	assert.Equal(t, ipcaProjectedBy(indexes.Focus), valuation.Accrual.ProjectedBy)
	assert.Equal(t, []indexes.ProjectionMethod{
		{Index: indexes.IPCA, Method: indexes.Focus},
		{Index: indexes.IPCA, Method: indexes.Trailing12},
		{Index: indexes.IPCA, Method: indexes.Trailing60},
	}, valuation.Maturity.ProjectedBy)
}

// An NTN-B's Maturity Value is rounded to centavos once, after the quantity multiplies the VNA
// times 102.956301/100: the VNA of 2014-05-15 is 2,475.664104, which makes the unit value
// 2,548.85218666... For 10.52 NTN-B bought for R$ 21,988.06 that is R$ 26,813.93, a centavo more
// than 10.52 times the unit value truncated at 6 places, 2,548.852186, which is 26,813.92. After
// 896 days held the fee accrues on it since the coupon of 2013-11-15, 39.89, and the 15% IR is of
// what the gain of 4,825.87 leaves: 717.90.
func TestLotValueOfAnNTNBRoundsItsMaturityValueOnceAfterTheQuantity(t *testing.T) {
	t.Parallel()

	lot := bonds.Lot{
		Bond:         bonds.Bond{Type: bonds.NTNB, Maturity: date(2014, time.May, 15)},
		PurchaseDate: date(2011, time.December, 1),
		Rate:         mustDecimal(t, "0.0530"),
		UnitPrice:    mustDecimal(t, "2090.12"),
		Quantity:     mustDecimal(t, "10.52"),
	}

	valuation, err := lot.Value(date(2012, time.June, 1), ntnbTaxes(t), ipcaOf(t, indexes.Trailing12, indexes.Expectations{}), nil)
	require.NoError(t, err)

	assert.Equal(t, amountView{
		Gross: "26813.93", IOF: "0.00", IncomeTax: "717.90", CustodyFee: "39.89", Net: "26056.14",
		ProjectedBy: ipcaProjectedBy(indexes.Trailing12),
	}, viewAmount(valuation.Maturity))
}
