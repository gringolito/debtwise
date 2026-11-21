package comparison_test

import (
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"github.com/gringolito/debtwise/backend/bonds"
	"github.com/gringolito/debtwise/backend/comparison"
	"github.com/gringolito/debtwise/backend/indexes"
	"github.com/gringolito/debtwise/backend/mortgage"
)

// On 2025-01-10, with 12,000.00 still owed interest-free at 1,000.00 a month, the owner holds 5.00
// LTN maturing on 2027-01-01, bought on 2024-01-02 for 800.00 each, which Tesouro Direto buys back
// at 900.00. Sold 374 days after the purchase, the 500.00 gain pays 17.5% of income tax after the
// 9.22 custody fee: 4,404.89 net, prepaid that day. That shortens the term to the 8 months that
// 7,595.11 needs at most 1,000.00 a month, and SAC spreads it evenly over them: 949.39 each, which
// is 7,595.11 over 8 rounded to the centavo, until the last 949.38 is paid on 2025-09-10. The
// installment's slack is not prepaid, so the 50.61 each leaves below 1,000.00, 50.62 the last, is
// held at zero return, and so is the whole 1,000.00 of the 4 installments the status quo still pays
// after 2025-09-10, from 2025-10-10 to 2026-01-10: the sale is worth 12,000.00 - 7,595.11 =
// 4,404.89 on the horizon, as much as the sale paid off the mortgage. Held to
// maturity, 1,095 days after the purchase, the 1,000.00 gain pays 15% after the 30.00 custody fee:
// 4,824.50 net, holding being better by 4,824.50 - 4,404.89 = 419.61.
func TestAnEarlySaleCheckComparesSellingTodayWithHoldingToMaturity(t *testing.T) {
	t.Parallel()

	today := date(t, "2025-01-10")
	ltn := bonds.Bond{Type: bonds.LTN, Maturity: date(t, "2027-01-01")}
	lot := bonds.Lot{ID: 7, Bond: ltn, PurchaseDate: date(t, "2024-01-02"), Rate: dec(t, "0.11"), UnitPrice: dec(t, "800.00"), Quantity: dec(t, "5.00")}
	sell := bonds.Price{Rate: dec(t, "0.0845"), UnitPrice: dec(t, "900.00")}

	checks, err := comparison.CheckEarlySales(
		comparison.Mortgage{Terms: interestFreeTerms(t)},
		comparison.Market{Quotes: []bonds.Quote{{Bond: ltn, Sell: sell}}, Taxes: lotTaxes(t)},
		[]bonds.Lot{lot}, mortgage.ShortenTerm, today,
	)
	require.NoError(t, err)
	require.Len(t, checks, 1)

	c := checks[0]
	assert.Equal(t, lot, c.Lot)
	assert.Equal(t, &sell, c.SellPrice)
	assert.Empty(t, c.Unavailable)

	sale := amountView{Gross: "4500.00", IOF: "0.00", IncomeTax: "85.89", CustodyFee: "9.22", Net: "4404.89"}
	assert.Equal(t, sale, amountOf(&c.MarketValue))
	assert.Equal(t, []flow{
		{"2025-01-10", "", "0.00", "4404.89", "0.00", "", "7595.11"},
		{"2025-02-10", "949.39", "0.00", "0.00", "50.61", "", "6645.72"},
		{"2025-03-10", "949.39", "0.00", "0.00", "50.61", "", "5696.33"},
		{"2025-04-10", "949.39", "0.00", "0.00", "50.61", "", "4746.94"},
		{"2025-05-10", "949.39", "0.00", "0.00", "50.61", "", "3797.55"},
		{"2025-06-10", "949.39", "0.00", "0.00", "50.61", "", "2848.16"},
		{"2025-07-10", "949.39", "0.00", "0.00", "50.61", "", "1898.77"},
		{"2025-08-10", "949.39", "0.00", "0.00", "50.61", "", "949.38"},
		{"2025-09-10", "949.38", "0.00", "0.00", "50.62", "", "0.00"},
		{"2025-10-10", "", "0.00", "0.00", "1000.00", "", "0.00"},
		{"2025-11-10", "", "0.00", "0.00", "1000.00", "", "0.00"},
		{"2025-12-10", "", "0.00", "0.00", "1000.00", "", "0.00"},
		{"2026-01-10", "", "0.00", "0.00", "1000.00", "", "0.00"},
		{"2027-01-01", "", "0.00", "0.00", "0.00", "", "0.00"},
	}, flows(c.Sell))
	assert.Equal(t, sale, amountOf(c.Sell.CashFlows[0].Sold))
	assert.Nil(t, c.Sell.Bond)
	assert.Equal(t, "4404.89", c.Sell.NetWorth.String())

	assert.Equal(t, []flow{
		{"2025-01-10", "", "0.00", "0.00", "0.00", "", "12000.00"},
		{"2025-02-10", "1000.00", "0.00", "0.00", "0.00", "", "11000.00"},
		{"2025-03-10", "1000.00", "0.00", "0.00", "0.00", "", "10000.00"},
		{"2025-04-10", "1000.00", "0.00", "0.00", "0.00", "", "9000.00"},
		{"2025-05-10", "1000.00", "0.00", "0.00", "0.00", "", "8000.00"},
		{"2025-06-10", "1000.00", "0.00", "0.00", "0.00", "", "7000.00"},
		{"2025-07-10", "1000.00", "0.00", "0.00", "0.00", "", "6000.00"},
		{"2025-08-10", "1000.00", "0.00", "0.00", "0.00", "", "5000.00"},
		{"2025-09-10", "1000.00", "0.00", "0.00", "0.00", "", "4000.00"},
		{"2025-10-10", "1000.00", "0.00", "0.00", "0.00", "", "3000.00"},
		{"2025-11-10", "1000.00", "0.00", "0.00", "0.00", "", "2000.00"},
		{"2025-12-10", "1000.00", "0.00", "0.00", "0.00", "", "1000.00"},
		{"2026-01-10", "1000.00", "0.00", "0.00", "0.00", "", "0.00"},
		{"2027-01-01", "", "0.00", "0.00", "0.00", "4824.50", "0.00"},
	}, flows(c.Hold))
	assert.Nil(t, c.Hold.CashFlows[0].Sold)
	assert.Equal(t, amountView{Gross: "5000.00", IOF: "0.00", IncomeTax: "145.50", CustodyFee: "30.00", Net: "4824.50"}, amountOf(c.Hold.Bond))
	assert.Equal(t, "4824.50", c.Hold.NetWorth.String())

	assert.Equal(t, "419.61", c.Advantage.String())
	assert.False(t, c.Sells())
	assert.Empty(t, c.ProjectedBy)
	assert.Empty(t, c.Indexes)
}

// The sale's prepayment has the effect the owner chose. Lowering the installment spreads the
// 7,595.11 left by the LTN lot's sale above over the 12 months left, and SAC amortizes the balance
// over the months left rounded half up to the centavo: 7,595.11 over 12 is 632.9258, 632.93; the
// 6,962.18 left over 11, 632.9254, 632.93; 6,329.25 over 10, 632.925, 632.93; and so on, 632.92 where
// the quotient falls below the half centavo, down to the 632.92 that is left for the last. Each is
// lower than the status quo's 1,000.00, and that slack is not prepaid but held: 367.07, or 367.08
// beside the 632.92, which comes to 12,000.00 - 7,595.11 = 4,404.89 on the horizon, with the balance
// falling by the installment alone, to nothing on 2026-01-10. The sale is worth that and holding,
// 4,824.50 net, is better by 4,824.50 - 4,404.89 = 419.61.
func TestAnEarlySaleCheckPrepaysTheSaleWithTheEffectTheOwnerChose(t *testing.T) {
	t.Parallel()

	ltn := bonds.Bond{Type: bonds.LTN, Maturity: date(t, "2027-01-01")}

	checks, err := comparison.CheckEarlySales(
		comparison.Mortgage{Terms: interestFreeTerms(t)},
		comparison.Market{Quotes: []bonds.Quote{{Bond: ltn, Sell: bonds.Price{Rate: dec(t, "0.0845"), UnitPrice: dec(t, "900.00")}}}, Taxes: lotTaxes(t)},
		[]bonds.Lot{{Bond: ltn, PurchaseDate: date(t, "2024-01-02"), Rate: dec(t, "0.11"), UnitPrice: dec(t, "800.00"), Quantity: dec(t, "5.00")}},
		mortgage.LowerInstallment, date(t, "2025-01-10"),
	)
	require.NoError(t, err)
	require.Len(t, checks, 1)

	assert.Equal(t, []flow{
		{"2025-01-10", "", "0.00", "4404.89", "0.00", "", "7595.11"},
		{"2025-02-10", "632.93", "0.00", "0.00", "367.07", "", "6962.18"},
		{"2025-03-10", "632.93", "0.00", "0.00", "367.07", "", "6329.25"},
		{"2025-04-10", "632.93", "0.00", "0.00", "367.07", "", "5696.32"},
		{"2025-05-10", "632.92", "0.00", "0.00", "367.08", "", "5063.40"},
		{"2025-06-10", "632.93", "0.00", "0.00", "367.07", "", "4430.47"},
		{"2025-07-10", "632.92", "0.00", "0.00", "367.08", "", "3797.55"},
		{"2025-08-10", "632.93", "0.00", "0.00", "367.07", "", "3164.62"},
		{"2025-09-10", "632.92", "0.00", "0.00", "367.08", "", "2531.70"},
		{"2025-10-10", "632.93", "0.00", "0.00", "367.07", "", "1898.77"},
		{"2025-11-10", "632.92", "0.00", "0.00", "367.08", "", "1265.85"},
		{"2025-12-10", "632.93", "0.00", "0.00", "367.07", "", "632.92"},
		{"2026-01-10", "632.92", "0.00", "0.00", "367.08", "", "0.00"},
		{"2027-01-01", "", "0.00", "0.00", "0.00", "", "0.00"},
	}, flows(checks[0].Sell))
	assert.Equal(t, "4404.89", checks[0].Sell.NetWorth.String())
	assert.Equal(t, "419.61", checks[0].Advantage.String())
}

// A sale prepays the mortgage today, 2025-02-15, so its next installment, on 2025-03-10, is updated
// from today by the TR of the month from its due date, which only a projection gives, while
// holding the lot leaves that installment updated by the published month to it. The mortgage has
// TR published for each month from the 1st and from the 10th through 2025-03-01 and 2025-03-10,
// and the LTN matures on 2025-03-15, so the check names the projection the sale's balance read.
func TestAnEarlySaleCheckNamesTheProjectionsTheSaleRead(t *testing.T) {
	t.Parallel()

	terms := interestFreeTerms(t)
	terms.Indexer = mortgage.TR

	var tr []indexes.Value

	for month := date(t, "2024-01-01"); month.Before(date(t, "2025-03-01")); month = month.AddDate(0, 1, 0) {
		tr = append(tr, indexes.Value{PeriodStart: month, PeriodEnd: month.AddDate(0, 1, 0), Value: dec(t, "0.1000")})
	}

	for due := date(t, "2024-01-10"); due.Before(date(t, "2025-03-10")); due = due.AddDate(0, 1, 0) {
		tr = append(tr, indexes.Value{PeriodStart: due, PeriodEnd: due.AddDate(0, 1, 0), Value: dec(t, "0.1000")})
	}

	ltn := bonds.Bond{Type: bonds.LTN, Maturity: date(t, "2025-03-15")}

	checks, err := comparison.CheckEarlySales(
		comparison.Mortgage{
			Terms:   terms,
			Outlook: indexes.NewOutlook(map[indexes.Index][]indexes.Value{indexes.TR: tr}, indexes.Expectations{}, nil),
		},
		comparison.Market{Quotes: []bonds.Quote{{Bond: ltn, Sell: bonds.Price{Rate: dec(t, "0.12"), UnitPrice: dec(t, "990.00")}}}, Taxes: lotTaxes(t)},
		[]bonds.Lot{{Bond: ltn, PurchaseDate: date(t, "2024-01-02"), Rate: dec(t, "0.11"), UnitPrice: dec(t, "800.00"), Quantity: dec(t, "5.00")}},
		mortgage.ShortenTerm, date(t, "2025-02-15"),
	)
	require.NoError(t, err)
	require.Len(t, checks, 1)

	assert.Equal(t, []indexes.ProjectionMethod{{Index: indexes.TR, Method: indexes.Trailing12}}, checks[0].ProjectedBy)
}

// IOF falls on the gain of a sale within 30 days of the purchase. 5.00 LTN maturing on 2027-01-01,
// bought for 800.00 each and sold on 2025-01-10 at 810.00, gain 50.00. Bought on 2024-12-12, 29
// days before, the sale pays 3% of IOF, 1.50, and income tax at 22.5% on what is left of the gain
// after it and the custody fee. Bought a day earlier, 30 days before, it pays none. Held to maturity
// either lot pays 15% of income tax. Either sale, 4,037.09 or 4,038.23, leaves 7,962.91 or 7,961.77
// of the 12,000.00 owed, which shortens the term to the 8 months it needs at most 1,000.00 a month;
// what each installment leaves below 1,000.00 is held, and the whole of the status quo's installments
// after it is paid off, so interest-free, selling is worth 12,000.00 less what is still owed,
// the sale's net, and holding is better by its Maturity Value, net, beyond that: 4,832.53 -
// 4,037.09 = 795.44 or 4,832.51 - 4,038.23 = 794.28.
func TestAnEarlySaleWithinThirtyDaysOfThePurchasePaysIOF(t *testing.T) {
	t.Parallel()

	tests := []struct {
		name, purchased string
		sale, maturity  amountView
		advantage       string
	}{
		{
			name:      "held 29 days",
			purchased: "2024-12-12",
			sale:      amountView{Gross: "4050.00", IOF: "1.50", IncomeTax: "10.77", CustodyFee: "0.64", Net: "4037.09"},
			maturity:  amountView{Gross: "5000.00", IOF: "0.00", IncomeTax: "146.92", CustodyFee: "20.55", Net: "4832.53"},
			advantage: "795.44",
		},
		{
			name:      "held 30 days",
			purchased: "2024-12-11",
			sale:      amountView{Gross: "4050.00", IOF: "0.00", IncomeTax: "11.10", CustodyFee: "0.67", Net: "4038.23"},
			maturity:  amountView{Gross: "5000.00", IOF: "0.00", IncomeTax: "146.91", CustodyFee: "20.58", Net: "4832.51"},
			advantage: "794.28",
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			t.Parallel()

			ltn := bonds.Bond{Type: bonds.LTN, Maturity: date(t, "2027-01-01")}
			taxes := lotTaxes(t)
			taxes.IOF = []bonds.IOFRate{{EffectiveFrom: date(t, "2005-01-01"), Days: 29, Rate: dec(t, "0.03")}}

			checks, err := comparison.CheckEarlySales(
				comparison.Mortgage{Terms: interestFreeTerms(t)},
				comparison.Market{Quotes: []bonds.Quote{{Bond: ltn, Sell: bonds.Price{Rate: dec(t, "0.11"), UnitPrice: dec(t, "810.00")}}}, Taxes: taxes},
				[]bonds.Lot{{Bond: ltn, PurchaseDate: date(t, tt.purchased), Rate: dec(t, "0.11"), UnitPrice: dec(t, "800.00"), Quantity: dec(t, "5.00")}},
				mortgage.ShortenTerm, date(t, "2025-01-10"),
			)
			require.NoError(t, err)
			require.Len(t, checks, 1)

			assert.Equal(t, tt.sale, amountOf(&checks[0].MarketValue))
			assert.Equal(t, tt.maturity, amountOf(checks[0].Hold.Bond))
			assert.Equal(t, tt.sale.Net, checks[0].Sell.NetWorth.String())
			assert.Equal(t, tt.advantage, checks[0].Advantage.String())
		})
	}
}

// The owner holds the 5.14 NTN-F maturing on 2027-01-01 bought on 2025-01-10 at 12% a year for
// 970.884128 each, whose coupons are worked out in the NTN-F decision test above. The coupon of
// 2025-07-01 is paid by a check on that day or after it, so only those of 2026-01-01 and 2026-07-01
// are part of holding, each prepaid on its date even with the installment's slack not prepaid: the
// first takes 196.42 off the 1,000.00 still owed, leaving the 803.58 of the last installment, and
// the 196.42 it frees of it is held; the second finds nothing owed and is held too, 202.60. Holding
// is worth the 5,326.17 Maturity Value and those two, 5,725.19. Sold at 1,000.00 each, the
// gain over the 4,990.34 the lot cost, which the first coupon's yield left whole, pays income tax
// after the custody fee accrued since that coupon. On 2025-07-10, 181 days after the purchase, that
// is 20% after 9 days' fee: 5,109.87 net, which leaves 890.13 of the 6,000.00 owed, paid off by the
// installment of the next month, which holds the 109.87 it leaves of the 1,000.00 and then the whole
// 1,000.00 of the 5 after it: 5,109.87, as much as the sale paid off the mortgage. On 2025-07-01, 172
// days after it, 22.5% and no fee: 5,106.33 net, which leaves 1,893.67 of the 7,000.00 owed, spread
// over the 2 months it needs, 946.84 and 946.83, holding 53.16 and 53.17 of the 1,000.00, and then
// the 5 installments after it: 5,106.33 again. Holding is better by its 5,725.19 beyond that:
// 615.32 or 618.86.
func TestAnEarlySaleCheckHoldsTheCouponsTheLotStillPays(t *testing.T) {
	t.Parallel()

	none := amountView{}
	firstCoupon := amountView{"250.88", "0.00", "49.11", "5.35", "196.42"}
	secondCoupon := amountView{"250.88", "0.00", "42.98", "5.30", "202.60"}
	tests := []struct {
		today, holdWorth, sellWorth, advantage string
		sale                                   amountView
		hold                                   []couponFlow
		sell                                   []flow
	}{
		{
			today: "2025-07-10", holdWorth: "5725.19", sellWorth: "5109.87", advantage: "615.32",
			sale: amountView{"5140.00", "0.00", "29.88", "0.25", "5109.87"},
			hold: []couponFlow{
				{flow{"2025-07-10", "", "0.00", "0.00", "0.00", "", "6000.00"}, none},
				{flow{"2025-08-10", "1000.00", "0.00", "0.00", "0.00", "", "5000.00"}, none},
				{flow{"2025-09-10", "1000.00", "0.00", "0.00", "0.00", "", "4000.00"}, none},
				{flow{"2025-10-10", "1000.00", "0.00", "0.00", "0.00", "", "3000.00"}, none},
				{flow{"2025-11-10", "1000.00", "0.00", "0.00", "0.00", "", "2000.00"}, none},
				{flow{"2025-12-10", "1000.00", "0.00", "0.00", "0.00", "", "1000.00"}, none},
				{flow{"2026-01-01", "", "0.00", "196.42", "0.00", "", "803.58"}, firstCoupon},
				{flow{"2026-01-10", "803.58", "0.00", "0.00", "196.42", "", "0.00"}, none},
				{flow{"2026-07-01", "", "0.00", "0.00", "202.60", "", "0.00"}, secondCoupon},
				{flow{"2027-01-01", "", "0.00", "0.00", "0.00", "5326.17", "0.00"}, none},
			},
			sell: []flow{
				{"2025-07-10", "", "0.00", "5109.87", "0.00", "", "890.13"},
				{"2025-08-10", "890.13", "0.00", "0.00", "109.87", "", "0.00"},
				{"2025-09-10", "", "0.00", "0.00", "1000.00", "", "0.00"},
				{"2025-10-10", "", "0.00", "0.00", "1000.00", "", "0.00"},
				{"2025-11-10", "", "0.00", "0.00", "1000.00", "", "0.00"},
				{"2025-12-10", "", "0.00", "0.00", "1000.00", "", "0.00"},
				{"2026-01-10", "", "0.00", "0.00", "1000.00", "", "0.00"},
				{"2027-01-01", "", "0.00", "0.00", "0.00", "", "0.00"},
			},
		},
		{
			today: "2025-07-01", holdWorth: "5725.19", sellWorth: "5106.33", advantage: "618.86",
			sale: amountView{"5140.00", "0.00", "33.67", "0.00", "5106.33"},
			hold: []couponFlow{
				{flow{"2025-07-01", "", "0.00", "0.00", "0.00", "", "7000.00"}, none},
				{flow{"2025-07-10", "1000.00", "0.00", "0.00", "0.00", "", "6000.00"}, none},
				{flow{"2025-08-10", "1000.00", "0.00", "0.00", "0.00", "", "5000.00"}, none},
				{flow{"2025-09-10", "1000.00", "0.00", "0.00", "0.00", "", "4000.00"}, none},
				{flow{"2025-10-10", "1000.00", "0.00", "0.00", "0.00", "", "3000.00"}, none},
				{flow{"2025-11-10", "1000.00", "0.00", "0.00", "0.00", "", "2000.00"}, none},
				{flow{"2025-12-10", "1000.00", "0.00", "0.00", "0.00", "", "1000.00"}, none},
				{flow{"2026-01-01", "", "0.00", "196.42", "0.00", "", "803.58"}, firstCoupon},
				{flow{"2026-01-10", "803.58", "0.00", "0.00", "196.42", "", "0.00"}, none},
				{flow{"2026-07-01", "", "0.00", "0.00", "202.60", "", "0.00"}, secondCoupon},
				{flow{"2027-01-01", "", "0.00", "0.00", "0.00", "5326.17", "0.00"}, none},
			},
			sell: []flow{
				{"2025-07-01", "", "0.00", "5106.33", "0.00", "", "1893.67"},
				{"2025-07-10", "946.84", "0.00", "0.00", "53.16", "", "946.83"},
				{"2025-08-10", "946.83", "0.00", "0.00", "53.17", "", "0.00"},
				{"2025-09-10", "", "0.00", "0.00", "1000.00", "", "0.00"},
				{"2025-10-10", "", "0.00", "0.00", "1000.00", "", "0.00"},
				{"2025-11-10", "", "0.00", "0.00", "1000.00", "", "0.00"},
				{"2025-12-10", "", "0.00", "0.00", "1000.00", "", "0.00"},
				{"2026-01-10", "", "0.00", "0.00", "1000.00", "", "0.00"},
				{"2027-01-01", "", "0.00", "0.00", "0.00", "", "0.00"},
			},
		},
	}

	for _, tt := range tests {
		t.Run(tt.today, func(t *testing.T) {
			t.Parallel()

			ntnf := bonds.Bond{Type: bonds.NTNF, Maturity: date(t, "2027-01-01")}
			lot := bonds.Lot{Bond: ntnf, PurchaseDate: date(t, "2025-01-10"), Rate: dec(t, "0.12"), UnitPrice: dec(t, "970.884128"), Quantity: dec(t, "5.14")}

			checks, err := comparison.CheckEarlySales(
				comparison.Mortgage{Terms: interestFreeTerms(t)},
				comparison.Market{Quotes: []bonds.Quote{{Bond: ntnf, Sell: bonds.Price{Rate: dec(t, "0.10"), UnitPrice: dec(t, "1000.00")}}}, Taxes: lotTaxes(t)},
				[]bonds.Lot{lot}, mortgage.ShortenTerm, date(t, tt.today),
			)
			require.NoError(t, err)
			require.Len(t, checks, 1)

			c := checks[0]
			assert.Equal(t, tt.hold, couponFlows(c.Hold))
			assert.Equal(t, tt.holdWorth, c.Hold.NetWorth.String())
			assert.Equal(t, tt.sale, amountOf(&c.MarketValue))
			assert.Equal(t, tt.sell, flows(c.Sell))
			assert.Equal(t, tt.sellWorth, c.Sell.NetWorth.String())
			assert.Equal(t, tt.advantage, c.Advantage.String())
		})
	}
}

// Lots are checked whatever the mortgage's indexer (ADR-0007). On 2025-12-03 the owner holds the
// 2.33 NTN-B Principal maturing on 2026-08-15 bought on 2025-11-03 at 7.5% a year over IPCA for
// 4,279.129184 each, whose Maturity Value the NTN-B Principal decision test above works out from the
// VNA grown by projected IPCA. Sold at 4,300.00 each, 30 days after the purchase, the 48.63 gain
// pays 22.5% of income tax after the custody fee: 10,006.78 net, which pays off the 2,000.00 still
// owed interest-free and holds the rest, 8,006.78. The 1,000.00 installments of 2025-12-10 and
// 2026-01-10 that the status quo still pays are held whole, 2,000.00 more, so the sale is worth
// 10,006.78, while holding is worth the Maturity Value, 10,578.22, with nothing owed: better by
// 10,578.22 - 10,006.78 = 571.44. Only the Maturity Value reads a projection, so the
// check names the IPCA's.
func TestAnNTNBPrincipalEarlySaleCheckHoldsToAMaturityValueGrownByProjectedIPCA(t *testing.T) {
	t.Parallel()

	_, outlook := ipcaMortgage(t, "0.20")
	ntnb := bonds.Bond{Type: bonds.NTNBPrincipal, Maturity: date(t, "2026-08-15")}
	lot := bonds.Lot{Bond: ntnb, PurchaseDate: date(t, "2025-11-03"), Rate: dec(t, "0.075"), UnitPrice: dec(t, "4279.129184"), Quantity: dec(t, "2.33")}

	checks, err := comparison.CheckEarlySales(
		comparison.Mortgage{Terms: interestFreeTerms(t)},
		comparison.Market{
			Quotes: []bonds.Quote{{Bond: ntnb, Sell: bonds.Price{Rate: dec(t, "0.07"), UnitPrice: dec(t, "4300.00")}}},
			Taxes:  lotTaxes(t),
			IPCA: bonds.IPCA{
				Numbers: bonds.IPCANumbers{date(t, "2000-06-01"): dec(t, "1614.62"), date(t, "2025-09-01"): dec(t, "7300.00")},
				Outlook: outlook,
			},
		},
		[]bonds.Lot{lot}, mortgage.ShortenTerm, date(t, "2025-12-03"),
	)
	require.NoError(t, err)
	require.Len(t, checks, 1)

	c := checks[0]
	assert.Equal(t, amountView{"10019.00", "0.00", "10.57", "1.65", "10006.78"}, amountOf(&c.MarketValue))
	assert.Equal(t, []flow{
		{"2025-12-03", "", "0.00", "2000.00", "8006.78", "", "0.00"},
		{"2025-12-10", "", "0.00", "0.00", "1000.00", "", "0.00"},
		{"2026-01-10", "", "0.00", "0.00", "1000.00", "", "0.00"},
		{"2026-08-15", "", "0.00", "0.00", "0.00", "", "0.00"},
	}, flows(c.Sell))
	assert.Equal(t, []flow{
		{"2025-12-03", "", "0.00", "0.00", "0.00", "", "2000.00"},
		{"2025-12-10", "1000.00", "0.00", "0.00", "0.00", "", "1000.00"},
		{"2026-01-10", "1000.00", "0.00", "0.00", "0.00", "", "0.00"},
		{"2026-08-15", "", "0.00", "0.00", "0.00", "10578.22", "0.00"},
	}, flows(c.Hold))
	assert.Equal(t, amountView{"10746.96", "0.00", "151.96", "16.78", "10578.22"}, amountOf(c.Hold.Bond))
	assert.Equal(t, "10006.78", c.Sell.NetWorth.String())
	assert.Equal(t, "571.44", c.Advantage.String())

	trailing := []indexes.ProjectionMethod{{Index: indexes.IPCA, Method: indexes.Trailing12}}
	assert.Equal(t, trailing, c.Hold.Bond.ProjectedBy)
	assert.Equal(t, trailing, c.ProjectedBy)
	assert.Equal(t, []indexes.Index{indexes.IPCA, indexes.IPCANumber}, c.Indexes)
}

// Against a mortgage at 10.06% a year plus TR, two lots of 69 LTN are checked on 2025-07-01. With the
// installment's slack not prepaid, prepaying keeps what the balance it takes off would have been
// corrected by the TR, about 1.8% a year, and the interest it saves, as installments that the
// shortened term charges less and that are held without return, so selling wins only a bond that
// yields less than that. The one maturing on 2030-01-01 sells at 950.00 each, about 1.1% a year
// until maturity: selling nets 59,172.97, 65,550.00 less 196.11 of custody fee and 17.5% of income
// tax on the gain after it, and prepaying it leaves the mortgage 63,958.28 lower on the horizon and
// holds 26,825.27 of the lower installments, 90,783.55 together, more than the 62,451.02 or so that
// holding to maturity nets. The one maturing on 2031-01-01 sells at 340.00, about 20% a year, and
// nets 23,389.81: 25,671.10 lower and 13,109.59 held, 38,780.69, against the 62,333.72 or so holding
// nets, so holding wins. Checks are ranked by advantage, lowest first, and those
// without one follow in the order given: a lot whose bond Tesouro Direto doesn't quote, and one
// whose bond has matured.
func TestEarlySaleChecksAreRankedByAdvantage(t *testing.T) {
	t.Parallel()

	lot := func(id int64, maturity string) bonds.Lot {
		return bonds.Lot{
			ID: id, Bond: bonds.Bond{Type: bonds.LTN, Maturity: date(t, maturity)},
			PurchaseDate: date(t, "2024-01-02"), Rate: dec(t, "0.11"), UnitPrice: dec(t, "435.28"), Quantity: dec(t, "69.00"),
		}
	}
	holding, selling, unquoted, matured := lot(1, "2031-01-01"), lot(2, "2030-01-01"), lot(3, "2029-01-01"), lot(4, "2025-01-01")

	checks, err := comparison.CheckEarlySales(trMortgage(t),
		comparison.Market{
			Quotes: []bonds.Quote{
				{Bond: holding.Bond, Sell: bonds.Price{Rate: dec(t, "0.20"), UnitPrice: dec(t, "340.00")}},
				{Bond: selling.Bond, Sell: bonds.Price{Rate: dec(t, "0.0115"), UnitPrice: dec(t, "950.00")}},
			},
			Taxes: lotTaxes(t),
		},
		[]bonds.Lot{unquoted, holding, matured, selling},
		mortgage.ShortenTerm, date(t, "2025-07-01"),
	)
	require.NoError(t, err)

	type ranked struct {
		ID          int64
		Unavailable comparison.Unavailable
		Sells       bool
	}

	got := make([]ranked, 0, len(checks))
	for _, c := range checks {
		got = append(got, ranked{c.Lot.ID, c.Unavailable, c.Sells()})
	}

	assert.Equal(t, []ranked{
		{2, "", true},
		{1, "", false},
		{3, comparison.NoMarketValue, false},
		{4, comparison.Matured, false},
	}, got)
}
