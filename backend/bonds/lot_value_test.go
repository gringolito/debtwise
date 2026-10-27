package bonds_test

import (
	"testing"
	"time"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"github.com/gringolito/debtwise/backend/bonds"
	"github.com/gringolito/debtwise/backend/indexes"
)

// amountView is an Amount with its reais as text, so a test reads and compares the cents it expects.
type amountView struct {
	Gross       string
	IOF         string
	IncomeTax   string
	CustodyFee  string
	Net         string
	ProjectedBy []indexes.ProjectionMethod
}

func viewAmount(a bonds.Amount) amountView {
	return amountView{
		Gross:       a.Gross.String(),
		IOF:         a.IOF.String(),
		IncomeTax:   a.IncomeTax.String(),
		CustodyFee:  a.CustodyFee.String(),
		Net:         a.Net.String(),
		ProjectedBy: a.ProjectedBy,
	}
}

// viewAmountOf is viewAmount of an amount a valuation may not have, which fails the test when it
// doesn't.
func viewAmountOf(t *testing.T, a *bonds.Amount) amountView {
	t.Helper()

	require.NotNil(t, a)

	return viewAmount(*a)
}

// seededTaxes are the tables the migration seeds: the income tax brackets of Lei 11.033/2004, the
// IOF of Decreto 6.306/2007 for days 1 to 29, and B3's custody fee.
func seededTaxes(t *testing.T) bonds.Taxes {
	t.Helper()

	income := []bonds.IncomeTaxRate{
		{EffectiveFrom: date(2005, time.January, 1), MinDays: 0, Rate: mustDecimal(t, "0.225")},
		{EffectiveFrom: date(2005, time.January, 1), MinDays: 181, Rate: mustDecimal(t, "0.20")},
		{EffectiveFrom: date(2005, time.January, 1), MinDays: 361, Rate: mustDecimal(t, "0.175")},
		{EffectiveFrom: date(2005, time.January, 1), MinDays: 721, Rate: mustDecimal(t, "0.15")},
	}

	rates := []string{
		"0.96", "0.93", "0.90", "0.86", "0.83", "0.80", "0.76", "0.73", "0.70", "0.66",
		"0.63", "0.60", "0.56", "0.53", "0.50", "0.46", "0.43", "0.40", "0.36", "0.33",
		"0.30", "0.26", "0.23", "0.20", "0.16", "0.13", "0.10", "0.06", "0.03",
	}

	iof := make([]bonds.IOFRate, 0, len(rates))
	for i, rate := range rates {
		iof = append(iof, bonds.IOFRate{EffectiveFrom: date(2008, time.January, 1), Days: i + 1, Rate: mustDecimal(t, rate)})
	}

	return bonds.Taxes{
		IncomeTax: income,
		IOF:       iof,
		CustodyFee: []bonds.CustodyFeeRate{
			{EffectiveFrom: date(2020, time.January, 1), Rate: mustDecimal(t, "0.0025")},
			{EffectiveFrom: date(2022, time.January, 1), Rate: mustDecimal(t, "0.0020")},
		},
	}
}

// withoutCustody is the seeded tables without the custody fee, for cases about the taxes alone.
func withoutCustody(t *testing.T) bonds.Taxes {
	t.Helper()

	taxes := seededTaxes(t)
	taxes.CustodyFee = nil

	return taxes
}

// sellAt is a sell price of unitPrice, whose rate the valuation doesn't read.
func sellAt(t *testing.T, unitPrice string) *bonds.Price {
	t.Helper()

	return &bonds.Price{Rate: mustDecimal(t, "0.1100"), UnitPrice: mustDecimal(t, unitPrice)}
}

// ltnLot is ten LTN maturing on 2030-01-01 bought at R$ 800.00, so it costs R$ 8,000.00.
func ltnLot(t *testing.T, purchase time.Time) bonds.Lot {
	t.Helper()

	return bonds.Lot{
		Bond:         bonds.Bond{Type: bonds.LTN, Maturity: date(2030, time.January, 1)},
		PurchaseDate: purchase,
		Rate:         mustDecimal(t, "0.1100"),
		UnitPrice:    mustDecimal(t, "800.00"),
		Quantity:     mustDecimal(t, "10"),
	}
}

// marketValue values the lot on a date as a sale at sell, with no IPCA, which an LTN doesn't read.
func marketValue(t *testing.T, lot bonds.Lot, on time.Time, taxes bonds.Taxes, sell string) amountView {
	t.Helper()

	valuation, err := lot.Value(on, taxes, bonds.IPCA{}, sellAt(t, sell))
	require.NoError(t, err)

	return viewAmountOf(t, valuation.Market)
}

// Ten LTN bought at R$ 800.00 and sold at R$ 900.00 gain R$ 1,000.00 over the R$ 8,000.00 they
// cost. The income tax is the bracket's rate of that, and a day more or less on each side of 180,
// 360 and 720 days held changes the bracket.
func TestLotValueIncomeTaxBracketsChangeAfterTheirBoundaryDays(t *testing.T) {
	t.Parallel()

	purchase := date(2026, time.January, 1)

	tests := []struct {
		name string
		on   time.Time
		sell string
		want amountView
	}{
		{
			name: "180 days is the first bracket, 22.5%",
			on:   date(2026, time.June, 30),
			sell: "900.00",
			want: amountView{Gross: "9000.00", IOF: "0.00", IncomeTax: "225.00", CustodyFee: "0.00", Net: "8775.00"},
		},
		{
			name: "181 days is the second bracket, 20%",
			on:   date(2026, time.July, 1),
			sell: "900.00",
			want: amountView{Gross: "9000.00", IOF: "0.00", IncomeTax: "200.00", CustodyFee: "0.00", Net: "8800.00"},
		},
		{
			name: "360 days is still the second bracket",
			on:   date(2026, time.December, 27),
			sell: "900.00",
			want: amountView{Gross: "9000.00", IOF: "0.00", IncomeTax: "200.00", CustodyFee: "0.00", Net: "8800.00"},
		},
		{
			name: "361 days is the third bracket, 17.5%",
			on:   date(2026, time.December, 28),
			sell: "900.00",
			want: amountView{Gross: "9000.00", IOF: "0.00", IncomeTax: "175.00", CustodyFee: "0.00", Net: "8825.00"},
		},
		{
			name: "720 days is still the third bracket",
			on:   date(2027, time.December, 22),
			sell: "900.00",
			want: amountView{Gross: "9000.00", IOF: "0.00", IncomeTax: "175.00", CustodyFee: "0.00", Net: "8825.00"},
		},
		{
			name: "721 days is the last bracket, 15%",
			on:   date(2027, time.December, 23),
			sell: "900.00",
			want: amountView{Gross: "9000.00", IOF: "0.00", IncomeTax: "150.00", CustodyFee: "0.00", Net: "8850.00"},
		},
		{
			name: "a loss pays no income tax",
			on:   date(2027, time.February, 5),
			sell: "750.00",
			want: amountView{Gross: "7500.00", IOF: "0.00", IncomeTax: "0.00", CustodyFee: "0.00", Net: "7500.00"},
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			t.Parallel()

			got := marketValue(t, ltnLot(t, purchase), tt.on, withoutCustody(t), tt.sell)

			assert.Equal(t, tt.want, got)
		})
	}
}

// The same R$ 1,000.00 gain pays the IOF of the days held, and the income tax is of what the IOF
// leaves: at 1 day 96% of it, at 15 days 50%, at 29 days 3%, and at 30 days the table has no row.
func TestLotValueIOFFollowsTheRegressiveTable(t *testing.T) {
	t.Parallel()

	purchase := date(2026, time.October, 1)

	tests := []struct {
		name string
		on   time.Time
		want amountView
	}{
		{
			name: "1 day, 96%",
			on:   date(2026, time.October, 2),
			want: amountView{Gross: "9000.00", IOF: "960.00", IncomeTax: "9.00", CustodyFee: "0.00", Net: "8031.00"},
		},
		{
			name: "15 days, 50%",
			on:   date(2026, time.October, 16),
			want: amountView{Gross: "9000.00", IOF: "500.00", IncomeTax: "112.50", CustodyFee: "0.00", Net: "8387.50"},
		},
		{
			name: "29 days, 3%",
			on:   date(2026, time.October, 30),
			want: amountView{Gross: "9000.00", IOF: "30.00", IncomeTax: "218.25", CustodyFee: "0.00", Net: "8751.75"},
		},
		{
			name: "30 days, no IOF",
			on:   date(2026, time.October, 31),
			want: amountView{Gross: "9000.00", IOF: "0.00", IncomeTax: "225.00", CustodyFee: "0.00", Net: "8775.00"},
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			t.Parallel()

			got := marketValue(t, ltnLot(t, purchase), tt.on, withoutCustody(t), "900.00")

			assert.Equal(t, tt.want, got)
		})
	}
}

// Three and a quarter LTN maturing on 2029-01-01, bought on 2025-03-03 at the contracted 11.90% a
// year for R$ 710.50 each (R$ 2,309.13 in all, from 2,309.125 half up), valued on 2026-10-26 after
// 602 days held, with the seeded tables. The figures are worked out with Python's decimal module
// and a separate implementation of Tesouro's methodology, which gives its published examples:
//
//   - Accrual: the PU at 11.90% for that settlement is 784.142962, so R$ 2,548.46 gross; the gain
//     of 239.33 pays 8.41 of custody fee (2,548.46 × 0.20% × 602/365) and 17.5% of what is left,
//     230.92, is 40.41.
//   - Market: sold at 12.88%, which gives the PU 769.494103 (Tesouro Direto showed 769.49 for that
//     rate on 2026-10-26), so R$ 2,500.86 gross, 8.25 of custody fee and 32.11 of income tax.
//   - Maturity: R$ 3,250.00 after 1,400 days held, 24.93 of custody fee and 15% of 915.94, the gain
//     of 940.87 less the fee.
func TestLotValueOfAnLTNMatchesIndependentFigures(t *testing.T) {
	t.Parallel()

	lot := bonds.Lot{
		Bond:         bonds.Bond{Type: bonds.LTN, Maturity: date(2029, time.January, 1)},
		PurchaseDate: date(2025, time.March, 3),
		Rate:         mustDecimal(t, "0.1190"),
		UnitPrice:    mustDecimal(t, "710.50"),
		Quantity:     mustDecimal(t, "3.25"),
	}
	sell := &bonds.Price{Rate: mustDecimal(t, "0.1288"), UnitPrice: mustDecimal(t, "769.494103")}

	valuation, err := lot.Value(date(2026, time.October, 26), seededTaxes(t), bonds.IPCA{}, sell)
	require.NoError(t, err)

	assert.Equal(t, date(2026, time.October, 26), valuation.On)
	assert.Equal(t,
		amountView{Gross: "2548.46", IOF: "0.00", IncomeTax: "40.41", CustodyFee: "8.41", Net: "2499.64"},
		viewAmountOf(t, valuation.Accrual))
	assert.Equal(t,
		amountView{Gross: "2500.86", IOF: "0.00", IncomeTax: "32.11", CustodyFee: "8.25", Net: "2460.50"},
		viewAmountOf(t, valuation.Market))
	assert.Equal(t,
		amountView{Gross: "3250.00", IOF: "0.00", IncomeTax: "137.39", CustodyFee: "24.93", Net: "3087.68"},
		viewAmount(valuation.Maturity))
	assert.Empty(t, valuation.Coupons)
}

// An LTN has no Accrual or Market Value on its maturity date or after, only the Maturity Value.
func TestLotValueHasNoAccrualOrMarketValueFromMaturityOn(t *testing.T) {
	t.Parallel()

	lot := ltnLot(t, date(2026, time.January, 1))

	tests := []struct {
		name       string
		on         time.Time
		sell       *bonds.Price
		wantMarket bool
	}{
		{name: "the day before maturity", on: date(2029, time.December, 31), sell: sellAt(t, "990.00"), wantMarket: true},
		{name: "on maturity", on: date(2030, time.January, 1), sell: sellAt(t, "990.00")},
		{name: "after maturity", on: date(2030, time.February, 1), sell: sellAt(t, "990.00")},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			t.Parallel()

			valuation, err := lot.Value(tt.on, seededTaxes(t), bonds.IPCA{}, tt.sell)
			require.NoError(t, err)

			assert.Equal(t, tt.wantMarket, valuation.Market != nil)
			assert.Equal(t, tt.wantMarket, valuation.Accrual != nil)
			assert.Equal(t, "10000.00", valuation.Maturity.Gross.String())
		})
	}
}

func TestLotValueHasNoMarketValueWithoutASellPrice(t *testing.T) {
	t.Parallel()

	valuation, err := ltnLot(t, date(2026, time.January, 1)).Value(date(2026, time.October, 26), seededTaxes(t), bonds.IPCA{}, nil)
	require.NoError(t, err)

	assert.Nil(t, valuation.Market)
	assert.NotNil(t, valuation.Accrual)
}

// The custody fee accrues each day at the rate in effect that day: ten LTN bought on 2021-09-01
// and sold on 2022-03-01 for R$ 9,000.00 pay 121 days at 0.25% and 60 days at 0.20%, which started
// on 2022-01-01: 9,000.00 × (121 × 0.25% + 60 × 0.20%)/365 = 10.42. The income tax, 20% after 181
// days, is of the gain of 1,000.00 less that.
func TestLotValueCustodyFeeAccruesAtEachDaysRate(t *testing.T) {
	t.Parallel()

	got := marketValue(t, ltnLot(t, date(2021, time.September, 1)), date(2022, time.March, 1), seededTaxes(t), "900.00")

	assert.Equal(t, amountView{Gross: "9000.00", IOF: "0.00", IncomeTax: "197.92", CustodyFee: "10.42", Net: "8791.66"}, got)
}

// Changing a rate adds a row with a date, and only the events and fee days from that date on use
// it. Ten LTN sold for R$ 9,000.00 gain R$ 1,000.00, once on a date before the new row's, which
// the row leaves as it was, and once after, which it changes.
func TestLotValueNewRowsChangeOnlyEventsFromTheirDateOn(t *testing.T) {
	t.Parallel()

	type sale struct {
		purchase time.Time
		on       time.Time
	}

	tests := []struct {
		name         string
		taxes        func(*testing.T) bonds.Taxes
		add          func(*testing.T, *bonds.Taxes)
		before       sale
		after        sale
		wantBefore   amountView
		wantAfter    amountView
		wantAfterNew amountView
	}{
		{
			name:  "income tax of 25% from 2026-10-01 for under 181 days",
			taxes: withoutCustody,
			add: func(t *testing.T, taxes *bonds.Taxes) {
				taxes.IncomeTax = append(taxes.IncomeTax,
					bonds.IncomeTaxRate{EffectiveFrom: date(2026, time.October, 1), MinDays: 0, Rate: mustDecimal(t, "0.25")})
			},
			before:       sale{purchase: date(2026, time.August, 3), on: date(2026, time.September, 30)},
			after:        sale{purchase: date(2026, time.August, 3), on: date(2026, time.October, 26)},
			wantBefore:   amountView{Gross: "9000.00", IOF: "0.00", IncomeTax: "225.00", CustodyFee: "0.00", Net: "8775.00"},
			wantAfter:    amountView{Gross: "9000.00", IOF: "0.00", IncomeTax: "225.00", CustodyFee: "0.00", Net: "8775.00"},
			wantAfterNew: amountView{Gross: "9000.00", IOF: "0.00", IncomeTax: "250.00", CustodyFee: "0.00", Net: "8750.00"},
		},
		{
			name:  "IOF of 2% at 30 days from 2026-10-01",
			taxes: withoutCustody,
			add: func(t *testing.T, taxes *bonds.Taxes) {
				taxes.IOF = append(taxes.IOF,
					bonds.IOFRate{EffectiveFrom: date(2026, time.October, 1), Days: 30, Rate: mustDecimal(t, "0.02")})
			},
			before:       sale{purchase: date(2026, time.August, 31), on: date(2026, time.September, 30)},
			after:        sale{purchase: date(2026, time.September, 15), on: date(2026, time.October, 15)},
			wantBefore:   amountView{Gross: "9000.00", IOF: "0.00", IncomeTax: "225.00", CustodyFee: "0.00", Net: "8775.00"},
			wantAfter:    amountView{Gross: "9000.00", IOF: "0.00", IncomeTax: "225.00", CustodyFee: "0.00", Net: "8775.00"},
			wantAfterNew: amountView{Gross: "9000.00", IOF: "20.00", IncomeTax: "220.50", CustodyFee: "0.00", Net: "8759.50"},
		},
		{
			name:  "custody fee of 0.50% from 2026-06-01",
			taxes: seededTaxes,
			add: func(t *testing.T, taxes *bonds.Taxes) {
				taxes.CustodyFee = append(taxes.CustodyFee,
					bonds.CustodyFeeRate{EffectiveFrom: date(2026, time.June, 1), Rate: mustDecimal(t, "0.0050")})
			},
			before:       sale{purchase: date(2026, time.March, 2), on: date(2026, time.May, 29)},
			after:        sale{purchase: date(2026, time.March, 2), on: date(2026, time.October, 26)},
			wantBefore:   amountView{Gross: "9000.00", IOF: "0.00", IncomeTax: "224.02", CustodyFee: "4.34", Net: "8771.64"},
			wantAfter:    amountView{Gross: "9000.00", IOF: "0.00", IncomeTax: "197.65", CustodyFee: "11.74", Net: "8790.61"},
			wantAfterNew: amountView{Gross: "9000.00", IOF: "0.00", IncomeTax: "195.46", CustodyFee: "22.68", Net: "8781.86"},
		},
		{
			name:  "income tax of 25% from 2026-10-01, on that day",
			taxes: withoutCustody,
			add: func(t *testing.T, taxes *bonds.Taxes) {
				taxes.IncomeTax = append(taxes.IncomeTax,
					bonds.IncomeTaxRate{EffectiveFrom: date(2026, time.October, 1), MinDays: 0, Rate: mustDecimal(t, "0.25")})
			},
			before:       sale{purchase: date(2026, time.August, 3), on: date(2026, time.September, 30)},
			after:        sale{purchase: date(2026, time.August, 3), on: date(2026, time.October, 1)},
			wantBefore:   amountView{Gross: "9000.00", IOF: "0.00", IncomeTax: "225.00", CustodyFee: "0.00", Net: "8775.00"},
			wantAfter:    amountView{Gross: "9000.00", IOF: "0.00", IncomeTax: "225.00", CustodyFee: "0.00", Net: "8775.00"},
			wantAfterNew: amountView{Gross: "9000.00", IOF: "0.00", IncomeTax: "250.00", CustodyFee: "0.00", Net: "8750.00"},
		},
		{
			name:  "custody fee of 0.50% from 2026-06-01, on that day, which accrues one day at it",
			taxes: seededTaxes,
			add: func(t *testing.T, taxes *bonds.Taxes) {
				taxes.CustodyFee = append(taxes.CustodyFee,
					bonds.CustodyFeeRate{EffectiveFrom: date(2026, time.June, 1), Rate: mustDecimal(t, "0.0050")})
			},
			before:       sale{purchase: date(2026, time.March, 2), on: date(2026, time.May, 29)},
			after:        sale{purchase: date(2026, time.March, 2), on: date(2026, time.June, 1)},
			wantBefore:   amountView{Gross: "9000.00", IOF: "0.00", IncomeTax: "224.02", CustodyFee: "4.34", Net: "8771.64"},
			wantAfter:    amountView{Gross: "9000.00", IOF: "0.00", IncomeTax: "223.99", CustodyFee: "4.49", Net: "8771.52"},
			wantAfterNew: amountView{Gross: "9000.00", IOF: "0.00", IncomeTax: "223.97", CustodyFee: "4.56", Net: "8771.47"},
		},
		{
			name:  "income tax of 25% from 2026-10-01 leaves the bracket from 181 days as it was",
			taxes: withoutCustody,
			add: func(t *testing.T, taxes *bonds.Taxes) {
				taxes.IncomeTax = append(taxes.IncomeTax,
					bonds.IncomeTaxRate{EffectiveFrom: date(2026, time.October, 1), MinDays: 0, Rate: mustDecimal(t, "0.25")})
			},
			before:       sale{purchase: date(2026, time.March, 2), on: date(2026, time.September, 30)},
			after:        sale{purchase: date(2026, time.March, 2), on: date(2026, time.October, 26)},
			wantBefore:   amountView{Gross: "9000.00", IOF: "0.00", IncomeTax: "200.00", CustodyFee: "0.00", Net: "8800.00"},
			wantAfter:    amountView{Gross: "9000.00", IOF: "0.00", IncomeTax: "200.00", CustodyFee: "0.00", Net: "8800.00"},
			wantAfterNew: amountView{Gross: "9000.00", IOF: "0.00", IncomeTax: "200.00", CustodyFee: "0.00", Net: "8800.00"},
		},
		{
			name:  "IOF of 40% at 15 days from 2026-10-01, replacing the decree's 50%",
			taxes: withoutCustody,
			add: func(t *testing.T, taxes *bonds.Taxes) {
				taxes.IOF = append(taxes.IOF,
					bonds.IOFRate{EffectiveFrom: date(2026, time.October, 1), Days: 15, Rate: mustDecimal(t, "0.40")})
			},
			before:       sale{purchase: date(2026, time.September, 1), on: date(2026, time.September, 16)},
			after:        sale{purchase: date(2026, time.September, 20), on: date(2026, time.October, 5)},
			wantBefore:   amountView{Gross: "9000.00", IOF: "500.00", IncomeTax: "112.50", CustodyFee: "0.00", Net: "8387.50"},
			wantAfter:    amountView{Gross: "9000.00", IOF: "500.00", IncomeTax: "112.50", CustodyFee: "0.00", Net: "8387.50"},
			wantAfterNew: amountView{Gross: "9000.00", IOF: "400.00", IncomeTax: "135.00", CustodyFee: "0.00", Net: "8465.00"},
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			t.Parallel()

			current := tt.taxes(t)

			changed := tt.taxes(t)
			tt.add(t, &changed)

			for name, taxes := range map[string]bonds.Taxes{"current": current, "changed": changed} {
				before := marketValue(t, ltnLot(t, tt.before.purchase), tt.before.on, taxes, "900.00")
				assert.Equal(t, tt.wantBefore, before, "%s tables, sale before the new row", name)
			}

			lot := ltnLot(t, tt.after.purchase)
			assert.Equal(t, tt.wantAfter, marketValue(t, lot, tt.after.on, current, "900.00"), "current tables, sale after the new row")
			assert.Equal(t, tt.wantAfterNew, marketValue(t, lot, tt.after.on, changed, "900.00"), "changed tables, sale after the new row")
		})
	}
}

// couponView is a coupon payment with its date as text.
type couponView struct {
	Date   string
	Amount amountView
}

func viewCoupons(coupons []bonds.CouponPayment) []couponView {
	views := make([]couponView, 0, len(coupons))
	for _, c := range coupons {
		views = append(views, couponView{Date: c.Date.Format(time.DateOnly), Amount: viewAmount(c.Amount)})
	}

	return views
}

// Three and a quarter NTN-F maturing on 2028-01-01, bought on 2025-03-03 at the contracted 12.00%
// a year for R$ 985.321456 each (R$ 3,202.29 in all), valued on 2026-10-26 with the seeded tables.
// Its figures are worked out with Python's decimal module and a separate implementation of
// Tesouro's methodology, which gives its published examples:
//
//   - Each coupon is 48.80885 × 3.25 = 158.6287625, R$ 158.63, and is all gain. Its custody fee
//     is accrued at 0.20% over 365 on the lot's accrual value that day, the PU at 12.00% for
//     settlement on the coupon date (which no longer holds the coupon) plus the coupon, for the
//     days since the previous coupon, or since the purchase for the first. The 1st coupon, 2025-07-01,
//     120 days after the purchase: base 3,119.24 + 158.63 = 3,277.87 for 120 days is 2.16 of fee,
//     and the 22.5% of the 156.47 left is 35.21.
//   - Accrual and Market: the PU is 1,010.722279 at 12.00% and 1,000.812273 at the sell rate, 13.00%,
//     and the fee accrues from the last coupon, 2026-07-01, 117 days before.
//   - Maturity: (1,000 + 48.80885) × 3.25 is R$ 3,408.63, its fee accrues from the last coupon
//     before it, 2027-07-01, and it comes 1,034 days after the purchase, a bracket of 15%.
func TestLotValueOfAnNTNFListsItsPastAndFutureCouponsNetOfIncomeTaxAndCustodyFee(t *testing.T) {
	t.Parallel()

	lot := bonds.Lot{
		Bond:         bonds.Bond{Type: bonds.NTNF, Maturity: date(2028, time.January, 1)},
		PurchaseDate: date(2025, time.March, 3),
		Rate:         mustDecimal(t, "0.1200"),
		UnitPrice:    mustDecimal(t, "985.321456"),
		Quantity:     mustDecimal(t, "3.25"),
	}
	sell := &bonds.Price{Rate: mustDecimal(t, "0.1300"), UnitPrice: mustDecimal(t, "1000.812273")}

	valuation, err := lot.Value(date(2026, time.October, 26), seededTaxes(t), bonds.IPCA{}, sell)
	require.NoError(t, err)

	assert.Equal(t,
		amountView{Gross: "3284.85", IOF: "0.00", IncomeTax: "14.08", CustodyFee: "2.11", Net: "3268.66"},
		viewAmountOf(t, valuation.Accrual))
	assert.Equal(t,
		amountView{Gross: "3252.64", IOF: "0.00", IncomeTax: "8.45", CustodyFee: "2.09", Net: "3242.10"},
		viewAmountOf(t, valuation.Market))
	assert.Equal(t,
		amountView{Gross: "3408.63", IOF: "0.00", IncomeTax: "30.44", CustodyFee: "3.44", Net: "3374.75"},
		viewAmount(valuation.Maturity))
	assert.Equal(t, []couponView{
		{Date: "2025-07-01", Amount: amountView{Gross: "158.63", IOF: "0.00", IncomeTax: "35.21", CustodyFee: "2.16", Net: "121.26"}},
		{Date: "2026-01-01", Amount: amountView{Gross: "158.63", IOF: "0.00", IncomeTax: "31.06", CustodyFee: "3.33", Net: "124.24"}},
		{Date: "2026-07-01", Amount: amountView{Gross: "158.63", IOF: "0.00", IncomeTax: "27.18", CustodyFee: "3.30", Net: "128.15"}},
		{Date: "2027-01-01", Amount: amountView{Gross: "158.63", IOF: "0.00", IncomeTax: "27.17", CustodyFee: "3.38", Net: "128.08"}},
		{Date: "2027-07-01", Amount: amountView{Gross: "158.63", IOF: "0.00", IncomeTax: "23.29", CustodyFee: "3.35", Net: "131.99"}},
	}, viewCoupons(valuation.Coupons))
}

// On a coupon date the Accrual Value no longer holds that coupon and the custody fee has been
// deducted with it, so no day of fee accrues. The lot above is at a loss that day, 3,167.34 over the
// 3,202.29 it cost, so it pays no income tax.
func TestLotValueOfAnNTNFOnACouponDateAccruesNoCustodyFee(t *testing.T) {
	t.Parallel()

	lot := bonds.Lot{
		Bond:         bonds.Bond{Type: bonds.NTNF, Maturity: date(2028, time.January, 1)},
		PurchaseDate: date(2025, time.March, 3),
		Rate:         mustDecimal(t, "0.1200"),
		UnitPrice:    mustDecimal(t, "985.321456"),
		Quantity:     mustDecimal(t, "3.25"),
	}

	valuation, err := lot.Value(date(2026, time.July, 1), seededTaxes(t), bonds.IPCA{}, nil)
	require.NoError(t, err)

	assert.Equal(t,
		amountView{Gross: "3167.34", IOF: "0.00", IncomeTax: "0.00", CustodyFee: "0.00", Net: "3167.34"},
		viewAmountOf(t, valuation.Accrual))
	assert.Len(t, valuation.Coupons, 5)
}

// A lot is paid the coupons after its purchase and before its bond's maturity: the one paid on the
// purchase date was the seller's, and the one on the maturity date is part of the Maturity Value.
func TestLotValueListsTheCouponsAfterThePurchaseAndBeforeMaturity(t *testing.T) {
	t.Parallel()

	tests := []struct {
		name     string
		purchase time.Time
		want     []string
	}{
		{
			name:     "the day before a coupon",
			purchase: date(2026, time.June, 30),
			want:     []string{"2026-07-01", "2027-01-01", "2027-07-01"},
		},
		{
			name:     "on a coupon date",
			purchase: date(2026, time.July, 1),
			want:     []string{"2027-01-01", "2027-07-01"},
		},
		{
			name:     "the day after the last coupon",
			purchase: date(2027, time.July, 2),
			want:     []string{},
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			t.Parallel()

			lot := bonds.Lot{
				Bond:         bonds.Bond{Type: bonds.NTNF, Maturity: date(2028, time.January, 1)},
				PurchaseDate: tt.purchase,
				Rate:         mustDecimal(t, "0.1200"),
				UnitPrice:    mustDecimal(t, "985.321456"),
				Quantity:     mustDecimal(t, "1"),
			}

			valuation, err := lot.Value(date(2027, time.July, 2), seededTaxes(t), bonds.IPCA{}, nil)
			require.NoError(t, err)

			got := make([]string, 0, len(valuation.Coupons))
			for _, coupon := range valuation.Coupons {
				got = append(got, coupon.Date.Format(time.DateOnly))
			}

			assert.Equal(t, tt.want, got)
		})
	}
}

func TestLotValueOfABondOfAnUnknownTypeFails(t *testing.T) {
	t.Parallel()

	lot := ltnLot(t, date(2026, time.January, 1))
	lot.Bond.Type = "selic"

	assert.NotPanics(t, func() {
		_, err := lot.Value(date(2026, time.October, 26), seededTaxes(t), bonds.IPCA{}, nil)
		assert.Error(t, err)
	})
}
