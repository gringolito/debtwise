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
// 7,595.11 needs at most 1,000.00 a month, and SAC spreads it evenly over them, so equal outflow
// prepays the rest of each 1,000.00 until the last 595.11 is paid on 2025-09-10. Held to maturity,
// 1,095 days after the purchase, the 1,000.00 gain pays 15% after the 30.00 custody fee: 4,824.50
// net. With no interest prepaying avoids nothing, so holding is better by the difference.
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
		{"2025-02-10", "949.39", "0.00", "50.61", "0.00", "", "6595.11"},
		{"2025-03-10", "942.16", "0.00", "57.84", "0.00", "", "5595.11"},
		{"2025-04-10", "932.52", "0.00", "67.48", "0.00", "", "4595.11"},
		{"2025-05-10", "919.02", "0.00", "80.98", "0.00", "", "3595.11"},
		{"2025-06-10", "898.78", "0.00", "101.22", "0.00", "", "2595.11"},
		{"2025-07-10", "865.04", "0.00", "134.96", "0.00", "", "1595.11"},
		{"2025-08-10", "797.56", "0.00", "202.44", "0.00", "", "595.11"},
		{"2025-09-10", "595.11", "0.00", "0.00", "404.89", "", "0.00"},
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
// 7,595.11 left by the LTN lot's sale above over the 12 months left, and equal outflow prepays the
// rest of each 1,000.00, so the balance falls as it does when the term is shortened.
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
		{"2025-02-10", "632.93", "0.00", "367.07", "0.00", "", "6595.11"},
		{"2025-03-10", "599.56", "0.00", "400.44", "0.00", "", "5595.11"},
		{"2025-04-10", "559.51", "0.00", "440.49", "0.00", "", "4595.11"},
		{"2025-05-10", "510.57", "0.00", "489.43", "0.00", "", "3595.11"},
		{"2025-06-10", "449.39", "0.00", "550.61", "0.00", "", "2595.11"},
		{"2025-07-10", "370.73", "0.00", "629.27", "0.00", "", "1595.11"},
		{"2025-08-10", "265.85", "0.00", "734.15", "0.00", "", "595.11"},
		{"2025-09-10", "119.02", "0.00", "476.09", "404.89", "", "0.00"},
		{"2025-10-10", "", "0.00", "0.00", "1000.00", "", "0.00"},
		{"2025-11-10", "", "0.00", "0.00", "1000.00", "", "0.00"},
		{"2025-12-10", "", "0.00", "0.00", "1000.00", "", "0.00"},
		{"2026-01-10", "", "0.00", "0.00", "1000.00", "", "0.00"},
		{"2027-01-01", "", "0.00", "0.00", "0.00", "", "0.00"},
	}, flows(checks[0].Sell))
	assert.Equal(t, "419.61", checks[0].Advantage.String())
}

// IOF falls on the gain of a sale within 30 days of the purchase. 5.00 LTN maturing on 2027-01-01,
// bought for 800.00 each and sold on 2025-01-10 at 810.00, gain 50.00. Bought on 2024-12-12, 29
// days before, the sale pays 3% of IOF, 1.50, and income tax at 22.5% on what is left of the gain
// after it and the custody fee. Bought a day earlier, 30 days before, it pays none. Held to maturity
// either lot pays 15% of income tax, and with no interest the advantage is the difference.
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
			assert.Equal(t, tt.advantage, checks[0].Advantage.String())
		})
	}
}

// The owner holds the 5.14 NTN-F maturing on 2027-01-01 bought on 2025-01-10 at 12% a year for
// 970.884128 each, whose coupons are worked out in the NTN-F decision test above. The coupon of
// 2025-07-01 is paid by a check on that day or after it, so only those of 2026-01-01 and 2026-07-01
// are part of holding, each prepaid on its date. Sold at 1,000.00 each, the gain over the 4,990.34
// the lot cost, which the first coupon's yield left whole, pays income tax after the custody fee
// accrued since that coupon. On 2025-07-10, 181 days after the purchase, that is 20% after 9 days'
// fee: 5,109.87 net, which leaves 890.13 of the 6,000.00 owed, paid off the next month. On
// 2025-07-01, 172 days after it, 22.5% and no fee: 5,106.33 net, which leaves 1,893.67 of the
// 7,000.00 owed, spread over the 2 months it needs.
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
				{"2025-07-10", "946.84", "0.00", "53.16", "0.00", "", "893.67"},
				{"2025-08-10", "893.67", "0.00", "0.00", "106.33", "", "0.00"},
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
// owed interest-free and holds the rest. Only the Maturity Value reads a projection, so the check
// names the IPCA's.
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
	assert.Equal(t, "571.44", c.Advantage.String())

	trailing := []indexes.ProjectionMethod{{Index: indexes.IPCA, Method: indexes.Trailing12}}
	assert.Equal(t, trailing, c.Hold.Bond.ProjectedBy)
	assert.Equal(t, trailing, c.ProjectedBy)
	assert.Equal(t, []indexes.Index{indexes.IPCA, indexes.IPCANumber}, c.Indexes)
}

// Against a mortgage at 10.06% a year plus TR, two lots of 69 LTN are checked on 2025-07-01. The
// one maturing on 2030-01-01 sells at 700.00 each, about 8% a year until maturity, below what the
// mortgage charges, so selling and prepaying wins. The one maturing on 2031-01-01 sells at 340.00,
// about 20% a year, so holding does. Checks are ranked by advantage, lowest first, and those
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
				{Bond: selling.Bond, Sell: bonds.Price{Rate: dec(t, "0.08"), UnitPrice: dec(t, "700.00")}},
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
