package api_test

import (
	"database/sql"
	"encoding/json"
	"fmt"
	"log/slog"
	"net/http"
	"testing"
	"time"

	"github.com/gringolito/debtwise/backend/decimal"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"github.com/gringolito/debtwise/backend/api"
	"github.com/gringolito/debtwise/backend/bonds"
	"github.com/gringolito/debtwise/backend/db"
	"github.com/gringolito/debtwise/backend/indexes"
)

// lotsOn serves the API over a fresh, migrated database with today as the day the API reads. It
// returns the database, for a test to seed the quotes and the index history the lots are valued
// from.
func lotsOn(t *testing.T, today string) (http.Handler, *sql.DB) {
	t.Helper()

	conn := migratedDatabase(t)
	store := bonds.NewStore(conn)
	now := mustDate(today)

	handler := api.NewHandler(api.Services{
		Database: db.New(conn),
		Indexes:  indexes.NewStore(conn),
		Lots:     store,
		Quotes:   store,
	}, api.WithLogger(slog.New(slog.DiscardHandler)), api.WithClock(func() time.Time { return now }))

	return handler, conn
}

func lotBody(bondType, maturity, purchaseDate, rate, unitPrice, quantity string) string {
	return fmt.Sprintf(
		`{"type": %q, "maturity": %q, "purchase_date": %q, "rate": %q, "unit_price": %q, "quantity": %q}`,
		bondType, maturity, purchaseDate, rate, unitPrice, quantity)
}

func addLots(t *testing.T, handler http.Handler, bodies ...string) {
	t.Helper()

	for _, body := range bodies {
		do(t, handler, http.MethodPost, "/lots", body, http.StatusCreated)
	}
}

// saveQuote stores the sell side of a bond's quote.
func saveQuote(t *testing.T, conn *sql.DB, bond bonds.Bond, sellRate, sellUnitPrice string) {
	t.Helper()

	err := bonds.NewStore(conn).SaveQuotes(t.Context(), []bonds.Quote{{
		Bond:      bond,
		Sell:      bonds.Price{Rate: decimal.MustParse(sellRate), UnitPrice: decimal.MustParse(sellUnitPrice)},
		FetchedAt: time.Now(),
	}}, time.Now())
	require.NoError(t, err)
}

// lotRow is what a lot answers whether or not it is valued.
type lotRow struct {
	ID           int64  `json:"id"`
	Type         string `json:"type"`
	Maturity     string `json:"maturity"`
	PurchaseDate string `json:"purchase_date"`
	Rate         string `json:"rate"`
	UnitPrice    string `json:"unit_price"`
	Quantity     string `json:"quantity"`
}

// lotRows lists the lots and keeps what identifies them.
func lotRows(t *testing.T, handler http.Handler) []lotRow {
	t.Helper()

	var got struct {
		Lots []lotRow `json:"lots"`
	}
	require.NoError(t, json.Unmarshal([]byte(do(t, handler, http.MethodGet, "/lots", "", http.StatusOK)), &got))

	return got.Lots
}

func TestLotsAreListedByPurchaseDateEditedAndDeleted(t *testing.T) {
	t.Parallel()

	handler, _ := lotsOn(t, "2026-10-26")

	assert.JSONEq(t, `{"lots": []}`, do(t, handler, http.MethodGet, "/lots", "", http.StatusOK))

	assert.JSONEq(t, `{
		"id": 1, "type": "ltn", "maturity": "2027-01-01", "purchase_date": "2026-03-10", "rate": "0.1276",
		"unit_price": "771.26", "quantity": "10"
	}`, do(t, handler, http.MethodPost, "/lots",
		lotBody("ltn", "2027-01-01", "2026-03-10", "0.1276", "771.26", "10"), http.StatusCreated))
	addLots(t, handler,
		lotBody("ntn_f", "2029-01-01", "2026-01-05", "0.1288", "880.05", "1.5"),
		lotBody("ntn_b_principal", "2035-05-15", "2026-03-10", "0.0745", "1500.123456", "0.25"),
	)

	assert.Equal(t, []lotRow{
		{
			ID: 2, Type: "ntn_f", Maturity: "2029-01-01", PurchaseDate: "2026-01-05", Rate: "0.1288",
			UnitPrice: "880.05", Quantity: "1.5",
		},
		{
			ID: 1, Type: "ltn", Maturity: "2027-01-01", PurchaseDate: "2026-03-10", Rate: "0.1276",
			UnitPrice: "771.26", Quantity: "10",
		},
		{
			ID: 3, Type: "ntn_b_principal", Maturity: "2035-05-15", PurchaseDate: "2026-03-10", Rate: "0.0745",
			UnitPrice: "1500.123456", Quantity: "0.25",
		},
	}, lotRows(t, handler))

	assert.JSONEq(t, `{
		"id": 1, "type": "ltn", "maturity": "2028-01-01", "purchase_date": "2026-02-02", "rate": "0.13",
		"unit_price": "700", "quantity": "12.5"
	}`, do(t, handler, http.MethodPut, "/lots/1",
		lotBody("ltn", "2028-01-01", "2026-02-02", "0.13", "700", "12.5"), http.StatusOK))

	assert.Equal(t, []lotRow{
		{
			ID: 2, Type: "ntn_f", Maturity: "2029-01-01", PurchaseDate: "2026-01-05", Rate: "0.1288",
			UnitPrice: "880.05", Quantity: "1.5",
		},
		{
			ID: 1, Type: "ltn", Maturity: "2028-01-01", PurchaseDate: "2026-02-02", Rate: "0.13",
			UnitPrice: "700", Quantity: "12.5",
		},
		{
			ID: 3, Type: "ntn_b_principal", Maturity: "2035-05-15", PurchaseDate: "2026-03-10", Rate: "0.0745",
			UnitPrice: "1500.123456", Quantity: "0.25",
		},
	}, lotRows(t, handler))

	do(t, handler, http.MethodDelete, "/lots/2", "", http.StatusNoContent)

	assert.Equal(t, []lotRow{
		{
			ID: 1, Type: "ltn", Maturity: "2028-01-01", PurchaseDate: "2026-02-02", Rate: "0.13",
			UnitPrice: "700", Quantity: "12.5",
		},
		{
			ID: 3, Type: "ntn_b_principal", Maturity: "2035-05-15", PurchaseDate: "2026-03-10", Rate: "0.0745",
			UnitPrice: "1500.123456", Quantity: "0.25",
		},
	}, lotRows(t, handler))
}

// Both LTN lots are valued on 2008-05-21, the day of Tesouro's worked example for an LTN maturing
// 2010-07-01 at 14.36% a year, a unit price of 753.315323: ten bonds are 7,533.15 in gross Accrual
// Value, whatever was paid for them. The IOF and the custody fee are nil because the IOF table has
// no row for 0 days and B3's fee, seeded from 2020, was not charged yet.
//
// The first lot paid 700.00 a bond, so the Accrual Value gains 533.15 and 22.5% of it is 119.96
// (119.95875). The Market Value of ten bonds at the sell price of 760.00 is 7,600.00 and gains
// 600.00, taxed 135.00. The Maturity Value of 10,000.00 gains 3,000.00 after 771 days, taxed at 15%
// (450.00). The second lot matured on 2008-01-01, so it has a Maturity Value only: 1,500.00 for
// 1.5 bonds bought for 900.00 each gains 150.00 after 364 days, taxed at 17.5% (26.25).
func TestLotsAreValuedOnTodayWithTesouroPrices(t *testing.T) {
	t.Parallel()

	handler, conn := lotsOn(t, "2008-05-21")
	saveQuote(t, conn, bonds.Bond{Type: bonds.LTN, Maturity: date(2010, time.July, 1)}, "0.1400", "760.00")
	addLots(t, handler,
		lotBody("ltn", "2010-07-01", "2008-05-21", "0.1436", "700.00", "10"),
		lotBody("ltn", "2008-01-01", "2007-01-02", "0.1", "900.00", "1.5"),
	)

	assert.JSONEq(t, `{"lots": [
		{
			"id": 2, "type": "ltn", "maturity": "2008-01-01", "purchase_date": "2007-01-02", "rate": "0.1",
			"unit_price": "900.00", "quantity": "1.5",
			"values": {
				"on": "2008-05-21",
				"maturity": {"gross": "1500.00", "iof": "0.00", "income_tax": "26.25", "custody_fee": "0.00",
					"net": "1473.75", "projected_by": []},
				"coupons": []
			}
		},
		{
			"id": 1, "type": "ltn", "maturity": "2010-07-01", "purchase_date": "2008-05-21", "rate": "0.1436",
			"unit_price": "700.00", "quantity": "10",
			"values": {
				"on": "2008-05-21",
				"accrual": {"gross": "7533.15", "iof": "0.00", "income_tax": "119.96", "custody_fee": "0.00",
					"net": "7413.19", "projected_by": []},
				"market": {"gross": "7600.00", "iof": "0.00", "income_tax": "135.00", "custody_fee": "0.00",
					"net": "7465.00", "projected_by": []},
				"maturity": {"gross": "10000.00", "iof": "0.00", "income_tax": "450.00", "custody_fee": "0.00",
					"net": "9550.00", "projected_by": []},
				"coupons": []
			}
		}
	], "market_value": {"gross": "7600.00", "net": "7465.00"}}`, do(t, handler, http.MethodGet, "/lots", "", http.StatusOK))
}

// On the day of the example above, the lots that have a Market Value add up to the total: ten
// bonds at 760.00 are 7,600.00, netting 7,465.00, and two more bought at 700.00 are 1,520.00,
// whose 120.00 gain is taxed 27.00 at 22.5%, netting 1,493.00. The matured lot has no Market
// Value, so it adds nothing.
func TestLotsTotalTheirMarketValue(t *testing.T) {
	t.Parallel()

	handler, conn := lotsOn(t, "2008-05-21")
	saveQuote(t, conn, bonds.Bond{Type: bonds.LTN, Maturity: date(2010, time.July, 1)}, "0.1400", "760.00")
	addLots(t, handler,
		lotBody("ltn", "2010-07-01", "2008-05-21", "0.1436", "700.00", "10"),
		lotBody("ltn", "2008-01-01", "2007-01-02", "0.1", "900.00", "1.5"),
		lotBody("ltn", "2010-07-01", "2008-05-21", "0.1436", "700.00", "2"),
	)

	var got struct {
		Lots        []lotRow        `json:"lots"`
		MarketValue json.RawMessage `json:"market_value"`
	}
	require.NoError(t, json.Unmarshal([]byte(do(t, handler, http.MethodGet, "/lots", "", http.StatusOK)), &got))

	assert.Equal(t, []lotRow{
		{
			ID: 2, Type: "ltn", Maturity: "2008-01-01", PurchaseDate: "2007-01-02", Rate: "0.1",
			UnitPrice: "900.00", Quantity: "1.5",
		},
		{
			ID: 1, Type: "ltn", Maturity: "2010-07-01", PurchaseDate: "2008-05-21", Rate: "0.1436",
			UnitPrice: "700.00", Quantity: "10",
		},
		{
			ID: 3, Type: "ltn", Maturity: "2010-07-01", PurchaseDate: "2008-05-21", Rate: "0.1436",
			UnitPrice: "700.00", Quantity: "2",
		},
	}, got.Lots)
	assert.JSONEq(t, `{"gross": "9120.00", "net": "8958.00"}`, string(got.MarketValue))
}

// An LTN lot of two bonds bought on 2026-10-16 at 990.00 and valued ten days later, at a contracted
// rate of 0 so its Accrual Value is the face value, 2,000.00. The IOF is 66% of the gain, 20.00,
// which is 13.20; the custody fee is 2,000.00 for 10 days at 0.20% a year, 0.11 (0.1096); income
// tax at 22.5% of the 6.69 left is 1.51 (1.50525); the net is 1,985.18.
//
// Sold at the quote's 995.00, the Market Value is 1,990.00: gain 10.00, IOF 6.60, fee 0.11, tax
// 0.74 (0.74025), net 1,982.55. At maturity, 77 days after the purchase and out of the IOF's
// range, the 20.00 gain pays a fee of 0.84 (2,000.00 for 77 days at 0.20% a year) and 4.31 of tax
// (22.5% of 19.16), and nets 1,994.85.
func TestLotsAreNetOfIOFAndCustodyFee(t *testing.T) {
	t.Parallel()

	handler, conn := lotsOn(t, "2026-10-26")
	saveQuote(t, conn, bonds.Bond{Type: bonds.LTN, Maturity: date(2027, time.January, 1)}, "0.13", "995.00")
	addLots(t, handler, lotBody("ltn", "2027-01-01", "2026-10-16", "0", "990.00", "2"))

	assert.JSONEq(t, `{"lots": [
		{
			"id": 1, "type": "ltn", "maturity": "2027-01-01", "purchase_date": "2026-10-16", "rate": "0",
			"unit_price": "990.00", "quantity": "2",
			"values": {
				"on": "2026-10-26",
				"accrual": {"gross": "2000.00", "iof": "13.20", "income_tax": "1.51", "custody_fee": "0.11",
					"net": "1985.18", "projected_by": []},
				"market": {"gross": "1990.00", "iof": "6.60", "income_tax": "0.74", "custody_fee": "0.11",
					"net": "1982.55", "projected_by": []},
				"maturity": {"gross": "2000.00", "iof": "0.00", "income_tax": "4.31", "custody_fee": "0.84",
					"net": "1994.85", "projected_by": []},
				"coupons": []
			}
		}
	], "market_value": {"gross": "1990.00", "net": "1982.55"}}`, do(t, handler, http.MethodGet, "/lots", "", http.StatusOK))
}

// The IPCA index numbers of June 2000 and November 2011 are IBGE's (SIDRA table 1737); October 2011
// is made up. Twelve months of IPCA from December 2010 to November 2011 at 0.53% make 0.53% the
// trailing average every later month is projected at, as Tesouro's example projects December.
//
// On 2012-01-03 the VNA is R$ 2.104,390122 (Tesouro Direto's example): the NTN-B Principal lot at
// 5.17% a year has a unit price of 1,776.772354, so one bond paid at 1,776.77 gains nothing in
// Accrual Value, which depends on the projected December. Its Maturity Value is the VNA of
// 2015-05-15, 2,605.206830, the number of November 2011 grown 41 months by 0.53% (3,386.80 ×
// 1.0053^41, 4,206.419052). Held 1,228 days it pays 15% of the 828.44 gain, 124.27.
//
// The NTN-B lot at a 0% real rate is worth its remaining flows: on 2012-01-03 the 2.956301 coupon
// of 2012-05-15 and 102.956301 of maturity, a 105.9126 quotation of the VNA, so a unit price of
// 2,228.814292 and 4,457.63 for two bonds, 457.63 over the 4,000.00 paid, taxed at 20% (91.53).
// Its coupon of 2011-11-15 was paid out of the VNA of that day, 2,086.732481 from the published
// number of October 2011, 123.38 for two bonds; the one of 2012-05-15 is paid out of the VNA
// projected from November 2011 on, 2,153.761632, 127.34. They are taxed at 22.5% after 153 days
// (27.76) and at 20% after 335 days (25.47). The Maturity Value, 2,223.165178 × 1.02956301 × 2, is
// 4,577.78, and 17.5% of its 577.78 gain after 519 days is 101.11.
func TestNTNBLotsAreValuedFromTheIPCAAndMarkedProjected(t *testing.T) {
	t.Parallel()

	handler, conn := lotsOn(t, "2012-01-03")
	store := indexes.NewStore(conn)

	require.NoError(t, store.SaveRefresh(t.Context(), indexes.IPCANumber, []indexes.Value{
		publishedValue("2000-06-01", "2000-06-01", "1614.62"),
		publishedValue("2011-10-01", "2011-10-01", "3369.28"),
		publishedValue("2011-11-01", "2011-11-01", "3386.80"),
	}, time.Now()))

	ipca := make([]indexes.Value, 0, 12)

	for month := range 12 {
		start := time.Date(2010, time.December, 1, 0, 0, 0, 0, time.UTC).AddDate(0, month, 0).Format(time.DateOnly)
		ipca = append(ipca, publishedValue(start, start, "0.53"))
	}

	require.NoError(t, store.SaveRefresh(t.Context(), indexes.IPCA, ipca, time.Now()))
	require.NoError(t, store.SaveProjectionMethod(t.Context(),
		indexes.ProjectionMethod{Index: indexes.IPCA, Method: indexes.Trailing12}))

	addLots(t, handler,
		lotBody("ntn_b_principal", "2015-05-15", "2012-01-03", "0.0517", "1776.77", "1"),
		lotBody("ntn_b", "2012-11-15", "2011-06-15", "0", "2000.00", "2"),
	)

	assert.JSONEq(t, `{"lots": [
		{
			"id": 2, "type": "ntn_b", "maturity": "2012-11-15", "purchase_date": "2011-06-15", "rate": "0",
			"unit_price": "2000.00", "quantity": "2",
			"values": {
				"on": "2012-01-03",
				"accrual": {"gross": "4457.63", "iof": "0.00", "income_tax": "91.53", "custody_fee": "0.00",
					"net": "4366.10", "projected_by": [{"index": "ipca", "method": "trailing_12"}]},
				"maturity": {"gross": "4577.78", "iof": "0.00", "income_tax": "101.11", "custody_fee": "0.00",
					"net": "4476.67", "projected_by": [{"index": "ipca", "method": "trailing_12"}]},
				"coupons": [
					{"date": "2011-11-15", "paid": true, "gross": "123.38", "iof": "0.00", "income_tax": "27.76",
					 "custody_fee": "0.00", "net": "95.62", "projected_by": []},
					{"date": "2012-05-15", "paid": false, "gross": "127.34", "iof": "0.00", "income_tax": "25.47",
					 "custody_fee": "0.00", "net": "101.87", "projected_by": [{"index": "ipca", "method": "trailing_12"}]}
				]
			}
		},
		{
			"id": 1, "type": "ntn_b_principal", "maturity": "2015-05-15", "purchase_date": "2012-01-03",
			"rate": "0.0517", "unit_price": "1776.77", "quantity": "1",
			"values": {
				"on": "2012-01-03",
				"accrual": {"gross": "1776.77", "iof": "0.00", "income_tax": "0.00", "custody_fee": "0.00",
					"net": "1776.77", "projected_by": [{"index": "ipca", "method": "trailing_12"}]},
				"maturity": {"gross": "2605.21", "iof": "0.00", "income_tax": "124.27", "custody_fee": "0.00",
					"net": "2480.94", "projected_by": [{"index": "ipca", "method": "trailing_12"}]},
				"coupons": []
			}
		}
	]}`, do(t, handler, http.MethodGet, "/lots", "", http.StatusOK))
}

// A lot whose VNA needs an IPCA index number that is neither published nor projected has no values,
// and the lots that don't read the IPCA keep theirs. The LTN lot matured on 2011-01-01 after 362
// days: 1,000.00 for a bond bought at 800.00, 17.5% of the 200.00 gain being 35.00.
func TestLotsWithoutTheIPCAHaveNoValues(t *testing.T) {
	t.Parallel()

	tests := []struct {
		name   string
		series []indexes.Value
	}{
		{name: "no index numbers"},
		{
			name: "no IPCA to project the months not published",
			series: []indexes.Value{
				publishedValue("2000-06-01", "2000-06-01", "1614.62"),
				publishedValue("2011-11-01", "2011-11-01", "3386.80"),
			},
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			t.Parallel()

			handler, conn := lotsOn(t, "2012-01-03")

			if tt.series != nil {
				require.NoError(t, indexes.NewStore(conn).SaveRefresh(t.Context(), indexes.IPCANumber, tt.series, time.Now()))
			}

			addLots(t, handler,
				lotBody("ntn_b_principal", "2015-05-15", "2012-01-03", "0.0517", "1776.77", "1"),
				lotBody("ltn", "2011-01-01", "2010-01-04", "0.1", "800.00", "1"),
			)

			assert.JSONEq(t, `{"lots": [
				{
					"id": 2, "type": "ltn", "maturity": "2011-01-01", "purchase_date": "2010-01-04", "rate": "0.1",
					"unit_price": "800.00", "quantity": "1",
					"values": {
						"on": "2012-01-03",
						"maturity": {"gross": "1000.00", "iof": "0.00", "income_tax": "35.00", "custody_fee": "0.00",
							"net": "965.00", "projected_by": []},
						"coupons": []
					}
				},
				{
					"id": 1, "type": "ntn_b_principal", "maturity": "2015-05-15", "purchase_date": "2012-01-03",
					"rate": "0.0517", "unit_price": "1776.77", "quantity": "1",
					"values_unavailable": "missing_ipca"
				}
			]}`, do(t, handler, http.MethodGet, "/lots", "", http.StatusOK))
		})
	}
}

func TestInvalidLotIsRejectedAndKeepsWhatIsRecorded(t *testing.T) {
	t.Parallel()

	tests := []struct {
		name   string
		method string
		path   string
		body   string
		want   []errorDetail
	}{
		{
			name:   "maturity not after the purchase",
			method: http.MethodPost,
			path:   "/lots",
			body:   lotBody("ltn", "2026-03-01", "2026-03-10", "0.12", "800", "1"),
			want:   []errorDetail{{"body.maturity", "must be after the purchase date"}},
		},
		{
			name:   "LTN not maturing on the 1st",
			method: http.MethodPost,
			path:   "/lots",
			body:   lotBody("ltn", "2027-01-02", "2026-03-10", "0.12", "800", "1"),
			want:   []errorDetail{{"body.maturity", "must be the 1st of a month"}},
		},
		{
			name:   "NTN-F not maturing in January or July",
			method: http.MethodPost,
			path:   "/lots",
			body:   lotBody("ntn_f", "2027-03-01", "2026-03-10", "0.12", "800", "1"),
			want:   []errorDetail{{"body.maturity", "must be the 1st of January or July"}},
		},
		{
			name:   "NTN-B Principal not maturing on the 15th",
			method: http.MethodPut,
			path:   "/lots/1",
			body:   lotBody("ntn_b_principal", "2035-05-01", "2026-03-10", "0.06", "1500", "1"),
			want:   []errorDetail{{"body.maturity", "must be the 15th of a month"}},
		},
		{
			name:   "NTN-B not maturing on the 15th",
			method: http.MethodPost,
			path:   "/lots",
			body:   lotBody("ntn_b", "2035-05-01", "2026-03-10", "0.06", "4000", "1"),
			want:   []errorDetail{{"body.maturity", "must be the 15th of a month"}},
		},
		{
			name:   "purchase after today",
			method: http.MethodPost,
			path:   "/lots",
			body:   lotBody("ltn", "2027-01-01", "2026-10-27", "0.12", "800", "1"),
			want:   []errorDetail{{"body.purchase_date", "must not be after today"}},
		},
		{
			name:   "zero unit price",
			method: http.MethodPut,
			path:   "/lots/1",
			body:   lotBody("ltn", "2027-01-01", "2026-03-10", "0.12", "0", "1"),
			want:   []errorDetail{{"body.unit_price", "must be greater than zero"}},
		},
		{
			name:   "zero quantity",
			method: http.MethodPost,
			path:   "/lots",
			body:   lotBody("ltn", "2027-01-01", "2026-03-10", "0.12", "800", "0.00"),
			want:   []errorDetail{{"body.quantity", "must be greater than zero"}},
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			t.Parallel()

			handler, _ := lotsOn(t, "2026-10-26")
			addLots(t, handler, lotBody("ltn", "2027-01-01", "2026-03-10", "0.1276", "771.26", "10"))

			rec := serve(t, handler, tt.method, tt.path, tt.body)

			require.Equal(t, http.StatusUnprocessableEntity, rec.Code, rec.Body.String())

			var problem struct {
				Errors []errorDetail `json:"errors"`
			}
			require.NoError(t, json.Unmarshal(rec.Body.Bytes(), &problem))
			assert.Equal(t, tt.want, problem.Errors)

			assert.Equal(t, []lotRow{{
				ID: 1, Type: "ltn", Maturity: "2027-01-01", PurchaseDate: "2026-03-10", Rate: "0.1276",
				UnitPrice: "771.26", Quantity: "10",
			}}, lotRows(t, handler))
		})
	}
}

func TestMalformedLotIsRejectedBySchema(t *testing.T) {
	t.Parallel()

	const (
		ratePattern     = `expected string to match pattern ^0(\.[0-9]{1,12})?$`
		pricePattern    = `expected string to match pattern ^(0|[1-9][0-9]{0,8})(\.[0-9]{1,6})?$`
		quantityPattern = `expected string to match pattern ^(0|[1-9][0-9]{0,8})(\.[0-9]{1,2})?$`
	)

	tests := []struct {
		name string
		body string
		want []errorDetail
	}{
		{
			name: "unknown type",
			body: lotBody("selic", "2027-01-01", "2026-03-10", "0.12", "800", "1"),
			want: []errorDetail{{"body.type", `expected value to be one of "ltn, ntn_f, ntn_b_principal, ntn_b"`}},
		},
		{
			name: "rate of 100% or more",
			body: lotBody("ltn", "2027-01-01", "2026-03-10", "1.2", "800", "1"),
			want: []errorDetail{{"body.rate", ratePattern}},
		},
		{
			name: "negative rate",
			body: lotBody("ltn", "2027-01-01", "2026-03-10", "-0.1", "800", "1"),
			want: []errorDetail{{"body.rate", ratePattern}},
		},
		{
			name: "unit price below a millionth of a real",
			body: lotBody("ltn", "2027-01-01", "2026-03-10", "0.12", "800.1234567", "1"),
			want: []errorDetail{{"body.unit_price", pricePattern}},
		},
		{
			name: "quantity below a hundredth of a bond",
			body: lotBody("ltn", "2027-01-01", "2026-03-10", "0.12", "800", "1.001"),
			want: []errorDetail{{"body.quantity", quantityPattern}},
		},
		{
			name: "negative quantity",
			body: lotBody("ltn", "2027-01-01", "2026-03-10", "0.12", "800", "-1"),
			want: []errorDetail{{"body.quantity", quantityPattern}},
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			t.Parallel()

			handler, _ := lotsOn(t, "2026-10-26")

			for _, request := range []struct{ method, path string }{
				{http.MethodPost, "/lots"},
				{http.MethodPut, "/lots/1"},
			} {
				rec := serve(t, handler, request.method, request.path, tt.body)

				require.Equal(t, http.StatusUnprocessableEntity, rec.Code, rec.Body.String())

				var problem struct {
					Errors []errorDetail `json:"errors"`
				}
				require.NoError(t, json.Unmarshal(rec.Body.Bytes(), &problem))
				assert.Equal(t, tt.want, problem.Errors)
			}

			assert.Empty(t, lotRows(t, handler))
		})
	}
}

func TestUnknownLotIsNotFound(t *testing.T) {
	t.Parallel()

	tests := []struct {
		name   string
		method string
		body   string
	}{
		{name: "edit", method: http.MethodPut, body: lotBody("ltn", "2027-01-01", "2026-03-10", "0.12", "800", "1")},
		{name: "delete", method: http.MethodDelete},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			t.Parallel()

			handler, _ := lotsOn(t, "2026-10-26")
			addLots(t, handler, lotBody("ltn", "2027-01-01", "2026-03-10", "0.1276", "771.26", "10"))

			rec := serve(t, handler, tt.method, "/lots/9", tt.body)

			require.Equal(t, http.StatusNotFound, rec.Code, rec.Body.String())

			var problem struct {
				Detail string `json:"detail"`
			}
			require.NoError(t, json.Unmarshal(rec.Body.Bytes(), &problem))
			assert.Equal(t, "no such lot", problem.Detail)

			assert.Equal(t, []lotRow{{
				ID: 1, Type: "ltn", Maturity: "2027-01-01", PurchaseDate: "2026-03-10", Rate: "0.1276",
				UnitPrice: "771.26", Quantity: "10",
			}}, lotRows(t, handler))
		})
	}
}

// Without the tables they read or write, lots fail to list, to record, to edit and to delete with a
// 500. The list reads the tax tables and the bond quotes, and the index history of the NTN-B lot
// recorded first.
func TestLotsFailWithoutTheirTables(t *testing.T) {
	t.Parallel()

	tests := []struct {
		name   string
		table  string
		method string
		path   string
		body   string
	}{
		{name: "list lots", table: "lots", method: http.MethodGet, path: "/lots"},
		{
			name:   "add lot",
			table:  "lots",
			method: http.MethodPost,
			path:   "/lots",
			body:   lotBody("ltn", "2027-01-01", "2026-03-10", "0.12", "800", "1"),
		},
		{
			name:   "edit lot",
			table:  "lots",
			method: http.MethodPut,
			path:   "/lots/1",
			body:   lotBody("ltn", "2027-01-01", "2026-03-10", "0.12", "800", "1"),
		},
		{name: "delete lot", table: "lots", method: http.MethodDelete, path: "/lots/1"},
		{name: "list without income tax rates", table: "income_tax_rates", method: http.MethodGet, path: "/lots"},
		{name: "list without IOF rates", table: "iof_rates", method: http.MethodGet, path: "/lots"},
		{name: "list without custody fee rates", table: "custody_fee_rates", method: http.MethodGet, path: "/lots"},
		{name: "list without quotes", table: "bond_quotes", method: http.MethodGet, path: "/lots"},
		{name: "list without the index history", table: "index_values", method: http.MethodGet, path: "/lots"},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			t.Parallel()

			handler, conn := lotsOn(t, "2026-10-26")
			addLots(t, handler, lotBody("ntn_b_principal", "2035-05-15", "2026-03-10", "0.0745", "1500", "1"))

			_, err := conn.ExecContext(t.Context(), "DROP TABLE "+tt.table)
			require.NoError(t, err)

			rec := serve(t, handler, tt.method, tt.path, tt.body)

			assert.Equal(t, http.StatusInternalServerError, rec.Code, rec.Body.String())
		})
	}
}
