package marketdata_test

import (
	"context"
	"errors"
	"testing"
	"time"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"github.com/gringolito/debtwise/backend/bonds"
	"github.com/gringolito/debtwise/backend/decimal"
	"github.com/gringolito/debtwise/backend/marketdata"
	"github.com/gringolito/debtwise/backend/marketdata/tesouroindireto"
)

// fakeTesouroIndireto lists bonds, or fails with err.
type fakeTesouroIndireto struct {
	bonds []tesouroindireto.Bond
	err   error
}

func (f fakeTesouroIndireto) Bonds(context.Context) ([]tesouroindireto.Bond, error) {
	return f.bonds, f.err
}

func tesouroIndiretoSources(client fakeTesouroIndireto) marketdata.Sources {
	return marketdata.Sources{
		SGS: &fakeSource{}, SIDRA: &fakeSource{}, Quotes: marketdata.TesouroIndiretoQuotes{Client: client}, Focus: &fakeFocus{},
	}
}

var pricedAt = time.Date(2026, time.November, 2, 12, 31, 12, 0, time.UTC)

// offeredLTN is a Tesouro Indireto bond on offer.
func offeredLTN() tesouroindireto.Bond {
	return tesouroindireto.Bond{
		Name:      "Tesouro Prefixado 2029",
		Maturity:  time.Date(2029, time.January, 1, 0, 0, 0, 0, time.UTC),
		BuyRate:   new(decimal.MustParse("0.1340")),
		BuyPrice:  decimal.MustParse("762.73"),
		SellRate:  decimal.MustParse("0.1352"),
		SellPrice: decimal.MustParse("760.15"),
		PricedAt:  pricedAt,
	}
}

func TestRefreshStoresTheTesouroIndiretoQuotesOfTheComparedBonds(t *testing.T) {
	t.Parallel()

	client := fakeTesouroIndireto{bonds: []tesouroindireto.Bond{
		{
			Name:      "Tesouro Selic 2031",
			Maturity:  time.Date(2031, time.March, 1, 0, 0, 0, 0, time.UTC),
			BuyRate:   new(decimal.MustParse("0.001012")),
			BuyPrice:  decimal.MustParse("17602.44"),
			SellRate:  decimal.MustParse("0.001112"),
			SellPrice: decimal.MustParse("17580.05"),
			PricedAt:  pricedAt,
		},
		offeredLTN(),
		{
			Name:      "Tesouro IPCA+ 2035",
			Maturity:  time.Date(2035, time.May, 15, 0, 0, 0, 0, time.UTC),
			BuyPrice:  decimal.MustParse("0"),
			SellRate:  decimal.MustParse("0.0784"),
			SellPrice: decimal.MustParse("2513.61"),
			PricedAt:  pricedAt,
		},
	}}
	quoteStore := &fakeQuoteStore{}
	now := time.Date(2026, time.November, 2, 13, 0, 0, 0, time.UTC)

	require.NoError(t, marketdata.New(tesouroIndiretoSources(client), &fakeStore{}, quoteStore).Refresh(t.Context(), now))

	assert.Equal(t, []bonds.Quote{
		{
			Bond:      bonds.Bond{Type: bonds.LTN, Maturity: time.Date(2029, time.January, 1, 0, 0, 0, 0, time.UTC)},
			Buy:       &bonds.Price{Rate: decimal.MustParse("0.1340"), UnitPrice: decimal.MustParse("762.73")},
			Sell:      bonds.Price{Rate: decimal.MustParse("0.1352"), UnitPrice: decimal.MustParse("760.15")},
			FetchedAt: pricedAt,
		},
		{
			Bond:      bonds.Bond{Type: bonds.NTNBPrincipal, Maturity: time.Date(2035, time.May, 15, 0, 0, 0, 0, time.UTC)},
			Sell:      bonds.Price{Rate: decimal.MustParse("0.0784"), UnitPrice: decimal.MustParse("2513.61")},
			FetchedAt: pricedAt,
		},
	}, quoteStore.savedQuotes(), "the Selic bond is left out, the IPCA+ one has no buy side, both are timed by pricedAt")
	assert.Zero(t, quoteStore.savedFailures())
}

func TestRefreshTimesRadarQuotesByTheRefresh(t *testing.T) {
	t.Parallel()

	quoteStore := &fakeQuoteStore{}
	now := time.Date(2026, time.November, 2, 13, 0, 0, 0, time.UTC)

	require.NoError(t, marketdata.New(sources(&fakeSource{}, &fakeQuoteSource{}), &fakeStore{}, quoteStore).Refresh(t.Context(), now))

	quotes := quoteStore.savedQuotes()
	require.Len(t, quotes, 1)
	assert.Equal(t, now, quotes[0].FetchedAt)
}

func TestRefreshRecordsAFailedTesouroIndiretoRefresh(t *testing.T) {
	t.Parallel()

	priceWithoutRate := offeredLTN()
	priceWithoutRate.BuyRate = nil

	selic := offeredLTN()
	selic.Name = "Tesouro Selic 2031"

	tests := []struct {
		name   string
		client fakeTesouroIndireto
		want   string
	}{
		{
			name:   "the list fails",
			client: fakeTesouroIndireto{err: errors.New("tesouroindireto: bond list: status 401: the API key is not valid")},
			want:   "status 401",
		},
		{
			name:   "a buy price without a buy rate",
			client: fakeTesouroIndireto{bonds: []tesouroindireto.Bond{priceWithoutRate}},
			want:   "buy rate",
		},
		{
			name:   "no compared bond",
			client: fakeTesouroIndireto{bonds: []tesouroindireto.Bond{selic}},
			want:   "no bond DebtWise compares",
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			t.Parallel()

			quoteStore := &fakeQuoteStore{}

			err := marketdata.New(tesouroIndiretoSources(tt.client), &fakeStore{}, quoteStore).Refresh(t.Context(), time.Now())

			require.Error(t, err)
			assert.Contains(t, err.Error(), tt.want)
			assert.Nil(t, quoteStore.savedQuotes(), "no quote replaces the stored ones")
			assert.Equal(t, 1, quoteStore.savedFailures())
		})
	}
}
