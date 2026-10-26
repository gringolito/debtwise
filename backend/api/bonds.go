package api

import (
	"context"
	"net/http"
	"time"

	"github.com/danielgtaylor/huma/v2"

	"github.com/gringolito/debtwise/backend/bonds"
)

// Quotes is the subset of *bonds.Store the API reads.
type Quotes interface {
	Quotes(ctx context.Context) ([]bonds.Quote, error)
}

// bondType is a type of bond, documented with every type the API knows.
type bondType string

func (bondType) Schema(huma.Registry) *huma.Schema {
	return enumSchema(bonds.Types())
}

type bondPrice struct {
	Rate      string `json:"rate" doc:"The yearly rate, as a decimal fraction: 0.1276 is 12.76% a year."`
	UnitPrice string `json:"unit_price" doc:"The price of one bond in reais, as a decimal string."`
}

type bondQuote struct {
	Type      bondType   `json:"type" doc:"ltn: Tesouro Prefixado; ntn_f: Tesouro Prefixado com Juros Semestrais."`
	Maturity  string     `json:"maturity" format:"date" doc:"The date the bond matures."`
	Buy       *bondPrice `json:"buy,omitempty" doc:"The rate and price the bond is bought at. Absent when Tesouro Direto does not sell it."`
	Sell      bondPrice  `json:"sell" doc:"The rate and price the bond is sold back at."`
	FetchedAt time.Time  `json:"fetched_at" doc:"When the quote was fetched from its source."`
}

type bondCatalogue struct {
	Bonds []bondQuote `json:"bonds" nullable:"false" doc:"The bonds on Tesouro Direto, LTN before NTN-F and each by maturity."`
}

type bondCatalogueOutput struct {
	Body bondCatalogue
}

func registerBonds(humaAPI huma.API, quotes Quotes) {
	register(humaAPI, huma.Operation{
		OperationID: "list-bonds",
		Method:      http.MethodGet,
		Path:        "/bonds",
		Summary:     "List the bonds with their prices",
		Description: "Lists the LTN and NTN-F bonds on Tesouro Direto with their buy and sell rates and prices, as of the latest refresh of the market data.",
		Tags:        []string{"Bonds"},
	}, func(ctx context.Context, _ *struct{}) (*bondCatalogueOutput, error) {
		stored, err := quotes.Quotes(ctx)
		if err != nil {
			return nil, err
		}

		out := &bondCatalogueOutput{}
		out.Body.Bonds = make([]bondQuote, 0, len(stored))

		for _, q := range stored {
			quote := bondQuote{
				Type:      bondType(q.Bond.Type),
				Maturity:  q.Bond.Maturity.Format(time.DateOnly),
				Sell:      priceOutput(q.Sell),
				FetchedAt: q.FetchedAt,
			}

			if q.Buy != nil {
				quote.Buy = new(priceOutput(*q.Buy))
			}

			out.Body.Bonds = append(out.Body.Bonds, quote)
		}

		return out, nil
	})
}

func priceOutput(p bonds.Price) bondPrice {
	return bondPrice{Rate: p.Rate.String(), UnitPrice: p.UnitPrice.String()}
}
