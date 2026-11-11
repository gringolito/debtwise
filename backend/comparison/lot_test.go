package comparison_test

import (
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"github.com/gringolito/debtwise/backend/bonds"
	"github.com/gringolito/debtwise/backend/comparison"
	"github.com/gringolito/debtwise/backend/decimal"
	"github.com/gringolito/debtwise/backend/indexes"
	"github.com/gringolito/debtwise/backend/mortgage"
)

// On 2025-01-10, with 12,000.00 still owed interest-free at 1,000.00 a month, the owner bought 5.00
// LTN maturing on 2027-01-01 for 800.00 each, and records the lot on 2025-06-02. Prepaying the
// 4,000.00 instead on its purchase date leaves 8,000.00, paid off by 2025-09-10, and the 1,000.00 of
// each month after it is held: 4,000.00 on the horizon. Held to maturity, 721 days after the
// purchase, the 1,000.00 gain pays 15% of income tax after the 19.75 custody fee: 4,833.21 net. With
// no interest, prepaying avoids nothing, so investing is better by the whole gain.
func TestALotComparesWithPrepayingItsAmountInvestedOnItsPurchaseDate(t *testing.T) {
	t.Parallel()

	ltn := bonds.Bond{Type: bonds.LTN, Maturity: date(t, "2027-01-01")}
	lot := bonds.Lot{ID: 3, Bond: ltn, PurchaseDate: date(t, "2025-01-10"), Rate: dec(t, "0.12"), UnitPrice: dec(t, "800.00"), Quantity: dec(t, "5.00")}

	c, err := comparison.CompareLot(
		comparison.Mortgage{Terms: interestFreeTerms(t)},
		comparison.Market{Taxes: lotTaxes(t)},
		lot, mortgage.ShortenTerm, date(t, "2025-06-02"),
	)
	require.NoError(t, err)

	assert.Equal(t, lot, c.Lot)
	assert.Empty(t, c.Unavailable)
	assert.Equal(t, amountView{Gross: "5000.00", IOF: "0.00", IncomeTax: "147.04", CustodyFee: "19.75", Net: "4833.21"}, amountOf(&c.Maturity))
	assert.Equal(t, "833.21", c.Gain().String())
	assert.Equal(t, "833.21", c.Advantage.String())
	assert.Empty(t, c.ProjectedBy)
}

// The spreadsheet's first lot spent 30,034.32 on 2025-01-08 on 69 LTN maturing on 2031-01-01 at
// 435.28 each. Prepaying it instead would have avoided 29,511.73 by then (see
// TestAvoidedCostOfTheSpreadsheetsFirstLotIncludesTheCorrectionOfThePrepaidAmount), so investing is
// better by what the lot pays net at maturity beyond both the amount and that avoided cost. The
// installments after the purchase are corrected by the projected TR.
func TestALotIsBetterThanPrepayingByItsNetMaturityValueBeyondTheAvoidedCost(t *testing.T) {
	t.Parallel()

	ltn := bonds.Bond{Type: bonds.LTN, Maturity: date(t, "2031-01-01")}
	lot := bonds.Lot{Bond: ltn, PurchaseDate: date(t, "2025-01-08"), Rate: dec(t, "0.1504"), UnitPrice: dec(t, "435.28"), Quantity: dec(t, "69")}

	c, err := comparison.CompareLot(trMortgage(t), comparison.Market{Taxes: lotTaxes(t)}, lot, mortgage.ShortenTerm, date(t, "2025-01-08"))
	require.NoError(t, err)

	assert.Empty(t, c.Unavailable)
	assert.Equal(t, "69000.00", c.Maturity.Gross.String())
	assertNear(t, c.Maturity.Net.Sub(dec(t, "59546.05")).String(), c.Advantage, "0.01")
	assert.Equal(t, []indexes.ProjectionMethod{{Index: indexes.TR, Method: indexes.Trailing12}}, c.ProjectedBy)
}

// The NTN-B of TestAnNTNBVerdictPrepaysItsProjectedCoupons, recorded as 2.20 bought on 2025-11-03
// for 4,536.718091 each: 9,980.78, with nothing left over as cash. Its Maturity Value and its
// coupon are grown by the projected IPCA, so the comparison names its projection, and the coupon is
// prepaid on its date as in that verdict. Investing is then worth that verdict's -199.69 without
// its 19.22 of cash, -218.91, while prepaying 19.22 less than it did leaves the prepay scenario
// 20.43 worse off, at -184.12.
func TestALotPaysItsCouponsAndNamesTheProjectedIPCA(t *testing.T) {
	t.Parallel()

	m, outlook := ipcaMortgage(t, "0.20")
	market := comparison.Market{
		Taxes: lotTaxes(t),
		IPCA: bonds.IPCA{
			Numbers: bonds.IPCANumbers{date(t, "2000-06-01"): dec(t, "1614.62"), date(t, "2025-09-01"): dec(t, "7300.00")},
			Outlook: outlook,
		},
	}
	lot := bonds.Lot{Bond: bonds.Bond{Type: bonds.NTNB, Maturity: date(t, "2026-08-15")}, PurchaseDate: date(t, "2025-11-03"), Rate: dec(t, "0.075"), UnitPrice: dec(t, "4536.718091"), Quantity: dec(t, "2.20")}

	c, err := comparison.CompareLot(m, market, lot, mortgage.ShortenTerm, date(t, "2025-11-03"))
	require.NoError(t, err)

	trailing := []indexes.ProjectionMethod{{Index: indexes.IPCA, Method: indexes.Trailing12}}

	assert.Empty(t, c.Unavailable)
	assert.Equal(t, amountView{"10447.33", "0.00", "95.01", "10.36", "10341.96"}, amountOf(&c.Maturity))
	assert.Equal(t, trailing, c.Maturity.ProjectedBy)
	assert.Equal(t, "361.18", c.Gain().String())
	assert.Equal(t, "-34.79", c.Advantage.String())
	assert.Equal(t, trailing, c.ProjectedBy)
}

// A lot bought before the mortgage's contract date, when there was nothing to prepay, has no
// advantage, though it still has its Maturity Value: bought on 2024-01-09 for 4,000.00, the LTN
// above pays 15% of income tax on its 1,000.00 gain after the 29.81 custody fee of its 1,088 days.
func TestALotBoughtBeforeTheContractHasNoAdvantage(t *testing.T) {
	t.Parallel()

	lot := bonds.Lot{Bond: bonds.Bond{Type: bonds.LTN, Maturity: date(t, "2027-01-01")}, PurchaseDate: date(t, "2024-01-09"), Rate: dec(t, "0.12"), UnitPrice: dec(t, "800.00"), Quantity: dec(t, "5.00")}

	c, err := comparison.CompareLot(comparison.Mortgage{Terms: interestFreeTerms(t)}, comparison.Market{Taxes: lotTaxes(t)}, lot, mortgage.ShortenTerm, date(t, "2025-06-02"))
	require.NoError(t, err)

	assert.Equal(t, comparison.BeforeContract, c.Unavailable)
	assert.Equal(t, amountView{Gross: "5000.00", IOF: "0.00", IncomeTax: "145.53", CustodyFee: "29.81", Net: "4824.66"}, amountOf(&c.Maturity))
	assert.Equal(t, decimal.Decimal{}, c.Advantage)
	assert.Empty(t, c.ProjectedBy)
}

// An NTN-B Principal whose VNA needs IPCA index numbers that aren't available has neither a
// Maturity Value nor an advantage.
func TestALotMissingTheIPCAHasNoValues(t *testing.T) {
	t.Parallel()

	lot := bonds.Lot{Bond: bonds.Bond{Type: bonds.NTNBPrincipal, Maturity: date(t, "2029-05-15")}, PurchaseDate: date(t, "2025-01-10"), Rate: dec(t, "0.07"), UnitPrice: dec(t, "3000.00"), Quantity: dec(t, "1.00")}

	c, err := comparison.CompareLot(comparison.Mortgage{Terms: interestFreeTerms(t)}, comparison.Market{Taxes: lotTaxes(t)}, lot, mortgage.ShortenTerm, date(t, "2025-06-02"))
	require.NoError(t, err)

	assert.Equal(t, comparison.LotComparison{Lot: lot, Unavailable: comparison.MissingIPCA}, c)
}
