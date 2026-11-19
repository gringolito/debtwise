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
// 4,000.00 instead on its purchase date leaves 8,000.00, paid off by 2025-09-10 at the same
// 1,000.00 a month. A lot comparison ignores the installment's slack, so nothing is held after that
// payoff: the prepaying scenario is worth 0.00 on the horizon. Held to maturity, 721 days after the
// purchase, the 1,000.00 gain pays 15% of income tax after the 19.75 custody fee: 4,833.21 net, with
// the 12 installments paid in full and nothing owed at the end. Investing is then better by its whole
// net value, 4,833.21 - 0.00.
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
	assert.Equal(t, "4833.21", c.Advantage.String())
	assert.Empty(t, c.ProjectedBy)
}

// The spreadsheet's first lot spent 30,034.32 on 2025-01-08 on 69 LTN maturing on 2031-01-01 at
// 435.28 each. A lot comparison ignores the installment's slack, so prepaying it instead leaves the
// mortgage 33,381.13 lower on the horizon (see
// TestAvoidedCostOfTheSpreadsheetsFirstLotIncludesTheCorrectionOfThePrepaidAmount for the layout of
// the schedule): holding the lot leaves 215,334.11 owed after the 72 installments of 2025-02-01 to
// 2031-01-01, and prepaying leaves 181,952.98, after shortening the 300 months left to the 265 that
// 224,534.46 needs at most the 848.56 amortized before. That is the amount plus 3,346.81, with
// nothing held for the lower installments, so investing is better by what
// the lot pays net at maturity beyond both, 62,453.28 - 33,381.13 = 29,072.15. The installments after
// the purchase are corrected by the projected TR.
func TestALotIsBetterThanPrepayingByItsNetMaturityValueBeyondTheAvoidedCost(t *testing.T) {
	t.Parallel()

	ltn := bonds.Bond{Type: bonds.LTN, Maturity: date(t, "2031-01-01")}
	lot := bonds.Lot{Bond: ltn, PurchaseDate: date(t, "2025-01-08"), Rate: dec(t, "0.1504"), UnitPrice: dec(t, "435.28"), Quantity: dec(t, "69")}

	c, err := comparison.CompareLot(trMortgage(t), comparison.Market{Taxes: lotTaxes(t)}, lot, mortgage.ShortenTerm, date(t, "2025-01-08"))
	require.NoError(t, err)

	assert.Empty(t, c.Unavailable)
	assert.Equal(t, "69000.00", c.Maturity.Gross.String())
	assertNear(t, "29072.15", c.Advantage, "0.01")
	assert.Equal(t, []indexes.ProjectionMethod{{Index: indexes.TR, Method: indexes.Trailing12}}, c.ProjectedBy)
}

// The NTN-B of TestAnNTNBVerdictPrepaysItsProjectedCoupons, recorded as 2.20 bought on 2025-11-03
// for 4,536.718091 each: 9,980.78, with nothing left over as cash. Its Maturity Value and its
// coupon are grown by the projected IPCA, so the comparison names its projection, and the coupon is
// still prepaid on its date, 229.43 on 2026-02-15, with the installment's slack ignored. Investing
// keeps the status quo's installments, so on the horizon of 2026-08-15 it owes 10,694.39: the 23,476.74
// owed after the installment of 2026-02-03 less the coupon, 23,247.31, over the 11 months left, whose
// 6 installments to 2026-08-03 leave that balance. Its Maturity Value of 10,341.96 net leaves it worth
// -352.43. Prepaying the 9,980.78 shortens the 14 months left to the 10 that the 19,720.15 owed needs
// at most 2,121.50 of amortization a month, and its 9 installments to 2026-08-03 leave 2,007.80 owed,
// which nothing held for the lower installments offsets: worth -2,007.80. Investing is better by
// 2,007.80 - 352.43 = 1,655.37.
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
	assert.Equal(t, "1655.37", c.Advantage.String())
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
