package api_test

import (
	"encoding/json"
	"errors"
	"net/http"
	"testing"
	"time"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"github.com/gringolito/debtwise/backend/decimal"
	"github.com/gringolito/debtwise/backend/marketdata/radar"
)

const (
	ltn2027  = "Tesouro Prefixado 2027"
	ltn2029  = "Tesouro Prefixado 2029"
	ntnf2027 = "Tesouro Prefixado com Juros Semestrais 2027"
	ntnf2037 = "Tesouro Prefixado com Juros Semestrais 2037"
)

// radarNames lists the LTN and NTN-F bonds, out of order, among others DebtWise does not compare,
// the way Radar lists every Tesouro Direto bond.
func radarNames() []string {
	return []string{
		"Tesouro Educa+ 2030",
		"Tesouro IPCA+ 2035",
		ntnf2037,
		"Tesouro IPCA+ com Juros Semestrais 2040",
		ltn2029,
		ntnf2027,
		"Tesouro Renda+ Aposentadoria Extra 2050",
		"Tesouro Selic 2031",
		ltn2027,
	}
}

// radarBonds are the bonds Radar answers for radarNames' LTN and NTN-F: two on offer and two that
// Tesouro Direto only buys back.
func radarBonds() []radar.Bond {
	return []radar.Bond{
		{
			Name:            ltn2027,
			Maturity:        date(2027, time.January, 1),
			RedemptionRate:  new(mustDecimal("0.1347")),
			RedemptionPrice: mustDecimal("977.19"),
		},
		{
			Name:            ltn2029,
			Maturity:        date(2029, time.January, 1),
			InvestmentRate:  new(mustDecimal("0.1276")),
			InvestmentPrice: mustDecimal("771.26"),
			RedemptionRate:  new(mustDecimal("0.1288")),
			RedemptionPrice: mustDecimal("769.49"),
		},
		{
			// A buy rate without a buy price is no offer either.
			Name:            ntnf2027,
			Maturity:        date(2027, time.January, 1),
			InvestmentRate:  new(mustDecimal("0.1320")),
			RedemptionRate:  new(mustDecimal("0.1333")),
			RedemptionPrice: mustDecimal("1025.12"),
		},
		{
			Name:            ntnf2037,
			Maturity:        date(2037, time.January, 1),
			InvestmentRate:  new(mustDecimal("0.1288")),
			InvestmentPrice: mustDecimal("880.05"),
			RedemptionRate:  new(mustDecimal("0.1300")),
			RedemptionPrice: mustDecimal("874.38"),
		},
	}
}

// quotingRadar lists radarNames and quotes radarBonds.
func quotingRadar() *fakeRadar {
	return radarWithBonds(radarNames(), radarBonds()...)
}

type bondPrice struct {
	Rate      string `json:"rate"`
	UnitPrice string `json:"unit_price"`
}

type bondQuote struct {
	Type      string     `json:"type"`
	Maturity  string     `json:"maturity"`
	Buy       *bondPrice `json:"buy"`
	Sell      bondPrice  `json:"sell"`
	FetchedAt time.Time  `json:"fetched_at"`
}

// wantQuotes are the quotes radarBonds are listed as, without their fetch time.
func wantQuotes() []bondQuote {
	return []bondQuote{
		{Type: "ltn", Maturity: "2027-01-01", Sell: bondPrice{Rate: "0.1347", UnitPrice: "977.19"}},
		{
			Type:     "ltn",
			Maturity: "2029-01-01",
			Buy:      &bondPrice{Rate: "0.1276", UnitPrice: "771.26"},
			Sell:     bondPrice{Rate: "0.1288", UnitPrice: "769.49"},
		},
		{Type: "ntn_f", Maturity: "2027-01-01", Sell: bondPrice{Rate: "0.1333", UnitPrice: "1025.12"}},
		{
			Type:     "ntn_f",
			Maturity: "2037-01-01",
			Buy:      &bondPrice{Rate: "0.1288", UnitPrice: "880.05"},
			Sell:     bondPrice{Rate: "0.1300", UnitPrice: "874.38"},
		},
	}
}

func (s server) bonds(t *testing.T) []bondQuote {
	t.Helper()

	rec := s.do(t, http.MethodGet, "/api/bonds")
	require.Equal(t, http.StatusOK, rec.Code, rec.Body.String())

	var catalogue struct {
		Bonds []bondQuote `json:"bonds"`
	}
	require.NoError(t, json.Unmarshal(rec.Body.Bytes(), &catalogue))
	require.NotNil(t, catalogue.Bonds, "bonds is a list, never null")

	return catalogue.Bonds
}

// withoutQuoteFetchTimes checks every quote was fetched within [from, to] and returns the quotes
// with their fetch time cleared, to compare them with literals.
func withoutQuoteFetchTimes(t *testing.T, quotes []bondQuote, from, to time.Time) []bondQuote {
	t.Helper()

	cleared := make([]bondQuote, 0, len(quotes))
	for _, q := range quotes {
		assert.WithinRange(t, q.FetchedAt, from.Truncate(time.Second), to, "fetched_at of %+v", q)
		q.FetchedAt = time.Time{}
		cleared = append(cleared, q)
	}

	return cleared
}

func TestRefreshListsTheLTNAndNTNFBondsWithTheirPrices(t *testing.T) {
	t.Parallel()

	start := time.Now()
	s := newServer(t, sgsWithRows(nil), quotingRadar())
	refreshed := time.Now()

	assert.Equal(t, wantQuotes(), withoutQuoteFetchTimes(t, s.bonds(t), start, refreshed),
		"LTN before NTN-F, each by maturity, and no other bond")

	status := s.status(t).Bonds
	assert.Equal(t, "fresh", status.Status)
	assert.Nil(t, status.FailedAt)
	require.NotNil(t, status.RefreshedAt)
	assert.WithinRange(t, *status.RefreshedAt, start.Truncate(time.Second), refreshed)
}

func TestRefreshReplacesTheBondsOnOffer(t *testing.T) {
	t.Parallel()

	radarSource := quotingRadar()
	s := newServer(t, sgsWithRows(nil), radarSource)

	radarSource.list([]string{ltn2029, "Tesouro Selic 2031"})

	secondRefresh := time.Now()

	s.refresh(t)

	assert.Equal(t, wantQuotes()[1:2], withoutQuoteFetchTimes(t, s.bonds(t), secondRefresh, time.Now()),
		"a bond no longer listed leaves the catalogue")
}

// errRefused is how the radar client reports an answer with no bond code: a missing token or an
// exhausted quota.
var errRefused = errors.New(`radar: bond "Tesouro Prefixado 2029": Token ausente. Gere um em https://radaropcoes.com`)

func TestARefusedFirstRefreshStoresNoPrices(t *testing.T) {
	t.Parallel()

	radarSource := quotingRadar()
	radarSource.fail(ltn2029, errRefused)

	start := time.Now()
	s := newServer(t, sgsWithRows(nil), radarSource)

	assert.Empty(t, s.bonds(t))

	status := s.status(t).Bonds
	assert.Equal(t, "failed", status.Status)
	assert.Nil(t, status.RefreshedAt)
	require.NotNil(t, status.FailedAt)
	assert.WithinRange(t, *status.FailedAt, start.Truncate(time.Second), time.Now())
}

func TestARefreshAfterAFailedOneIsFreshAgain(t *testing.T) {
	t.Parallel()

	radarSource := quotingRadar()
	radarSource.fail(ntnf2037, errors.New(`radar: bond "Tesouro Prefixado com Juros Semestrais 2037": status 502`))

	s := newServer(t, sgsWithRows(nil), radarSource)
	require.Equal(t, "failed", s.status(t).Bonds.Status)

	radarSource.fail(ntnf2037, nil)

	secondRefresh := time.Now()

	s.refresh(t)

	assert.Equal(t, wantQuotes(), withoutQuoteFetchTimes(t, s.bonds(t), secondRefresh, time.Now()))

	status := s.status(t).Bonds
	assert.Equal(t, "fresh", status.Status)
	assert.Nil(t, status.FailedAt)
	require.NotNil(t, status.RefreshedAt)
	assert.WithinRange(t, *status.RefreshedAt, secondRefresh.Truncate(time.Second), time.Now())
}

func TestARefreshRadarCannotQuoteKeepsTheStoredPrices(t *testing.T) {
	t.Parallel()

	tests := []struct {
		name   string
		damage func(*fakeRadar)
	}{
		{
			name:   "a bond refused for a missing token or an exhausted quota",
			damage: func(f *fakeRadar) { f.fail(ltn2029, errRefused) },
		},
		{
			name:   "a bond list that fails",
			damage: func(f *fakeRadar) { f.failList(errors.New("radar: bond list: status 502")) },
		},
		{
			name:   "a list without LTN or NTN-F",
			damage: func(f *fakeRadar) { f.list([]string{"Tesouro Selic 2031", "Tesouro IPCA+ 2035"}) },
		},
		{
			name:   "a bond listed twice, which the catalogue cannot hold",
			damage: func(f *fakeRadar) { f.list(append(radarNames(), ltn2029)) },
		},
		{
			name: "a bond with a buy price but no buy rate",
			damage: func(f *fakeRadar) {
				b := radarBonds()[1]
				b.InvestmentRate = nil
				f.answer(b)
			},
		},
		{
			name: "a bond without a sell price",
			damage: func(f *fakeRadar) {
				b := radarBonds()[2]
				b.RedemptionPrice = decimal.Decimal{}
				f.answer(b)
			},
		},
		{
			name: "a bond without a sell rate",
			damage: func(f *fakeRadar) {
				b := radarBonds()[3]
				b.RedemptionRate = nil
				f.answer(b)
			},
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			t.Parallel()

			radarSource := quotingRadar()

			start := time.Now()
			s := newServer(t, sgsWithRows(nil), radarSource)
			firstRefreshDone := time.Now()

			tt.damage(radarSource)

			secondRefresh := time.Now()

			s.refresh(t)

			assert.Equal(t, wantQuotes(), withoutQuoteFetchTimes(t, s.bonds(t), start, firstRefreshDone))

			status := s.status(t).Bonds
			assert.Equal(t, "failed", status.Status)
			require.NotNil(t, status.RefreshedAt)
			assert.WithinRange(t, *status.RefreshedAt, start.Truncate(time.Second), firstRefreshDone)
			require.NotNil(t, status.FailedAt)
			assert.WithinRange(t, *status.FailedAt, secondRefresh.Truncate(time.Second), time.Now())
		})
	}
}
