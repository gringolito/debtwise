package marketdata

import (
	"context"

	"github.com/gringolito/debtwise/backend/marketdata/radar"
	"github.com/gringolito/debtwise/backend/marketdata/tesouroindireto"
)

// RadarClient is the subset of *radar.Client RadarQuotes reads.
type RadarClient interface {
	Names(ctx context.Context) ([]string, error)
	Bond(ctx context.Context, name string) (radar.Bond, error)
}

// RadarQuotes is the QuoteSource of the Radar Opções API. It lists the bonds, then asks for each
// wanted one on its own, so no token is spent on the others.
type RadarQuotes struct {
	Client RadarClient
}

// Fetch returns the quotes of the bonds Radar lists whose name wanted accepts. Radar's investment
// side is the buy side and its redemption side the sell side. Radar does not say when a bond was
// priced.
func (r RadarQuotes) Fetch(ctx context.Context, wanted func(name string) bool) ([]SourceQuote, error) {
	names, err := r.Client.Names(ctx)
	if err != nil {
		return nil, err
	}

	var quotes []SourceQuote

	for _, name := range names {
		if !wanted(name) {
			continue
		}

		b, err := r.Client.Bond(ctx, name)
		if err != nil {
			return nil, err
		}

		quotes = append(quotes, SourceQuote{
			Name:      name,
			Maturity:  b.Maturity,
			BuyRate:   b.InvestmentRate,
			BuyPrice:  b.InvestmentPrice,
			SellRate:  b.RedemptionRate,
			SellPrice: b.RedemptionPrice,
		})
	}

	return quotes, nil
}

// TesouroIndiretoClient is the subset of *tesouroindireto.Client TesouroIndiretoQuotes reads.
type TesouroIndiretoClient interface {
	Bonds(ctx context.Context) ([]tesouroindireto.Bond, error)
}

// TesouroIndiretoQuotes is the QuoteSource of the Tesouro Indireto API, which lists every bond with
// its quote in one request.
type TesouroIndiretoQuotes struct {
	Client TesouroIndiretoClient
}

// Fetch returns the quotes of the bonds Tesouro Indireto lists whose name wanted accepts.
func (t TesouroIndiretoQuotes) Fetch(ctx context.Context, wanted func(name string) bool) ([]SourceQuote, error) {
	listed, err := t.Client.Bonds(ctx)
	if err != nil {
		return nil, err
	}

	var quotes []SourceQuote

	for _, b := range listed {
		if !wanted(b.Name) {
			continue
		}

		quotes = append(quotes, SourceQuote{
			Name:      b.Name,
			Maturity:  b.Maturity,
			BuyRate:   b.BuyRate,
			BuyPrice:  b.BuyPrice,
			SellRate:  new(b.SellRate),
			SellPrice: b.SellPrice,
			PricedAt:  b.PricedAt,
		})
	}

	return quotes, nil
}
