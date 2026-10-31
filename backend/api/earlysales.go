package api

import (
	"context"
	"net/http"
	"slices"
	"time"

	"github.com/danielgtaylor/huma/v2"

	"github.com/gringolito/debtwise/backend/bonds"
	"github.com/gringolito/debtwise/backend/comparison"
	"github.com/gringolito/debtwise/backend/marketdata"
	"github.com/gringolito/debtwise/backend/mortgage"
)

type earlySaleInput struct {
	Effect string `query:"effect" required:"true" enum:"shorten_term,lower_installment" doc:"What prepaying changes: shorten_term keeps the installment and ends the mortgage earlier; lower_installment keeps the end date and lowers the installments. Every prepayment of both scenarios has it."`
}

type earlySaleCheck struct {
	Lot         lot               `json:"lot" doc:"The lot checked."`
	Unavailable string            `json:"unavailable,omitempty" enum:"missing_ipca,no_market_value,matured" doc:"Why the check has no scenarios. missing_ipca: the IPCA the lot's values follow is not available yet; no_market_value: Tesouro Direto quotes no sell price for the lot's bond; matured: the lot's bond has matured. Absent when it has them."`
	Verdict     string            `json:"verdict,omitempty" enum:"sell,hold" doc:"Which option the check favours. sell: selling the lot today and prepaying beats holding it; hold: holding it to maturity does at least as well. Absent when the check is unavailable."`
	SellPrice   *bondPrice        `json:"sell_price,omitempty" doc:"The rate and price Tesouro Direto buys the lot's bond back at. Absent when it quotes none."`
	MarketValue *lotAmount        `json:"market_value,omitempty" doc:"The lot's Market Value today, gross and net of IOF, income tax and the custody fee: what selling it pays. Absent when the check is unavailable."`
	Advantage   string            `json:"advantage,omitempty" doc:"The hold scenario's net worth on the horizon, the bond's maturity, less the sell scenario's, in reais, as a decimal string. Positive favours holding, negative selling. Absent when the check is unavailable."`
	Hold        *scenario         `json:"hold,omitempty" doc:"Holding the lot to maturity. Absent when the check is unavailable."`
	Sell        *scenario         `json:"sell,omitempty" doc:"Selling the lot today and prepaying its Market Value. Absent when the check is unavailable."`
	ProjectedBy []projectedBy     `json:"projected_by" nullable:"false" doc:"The projection method of each index a projected value of the check comes from. Empty when it reads published values only."`
	MarketData  verdictMarketData `json:"market_data" doc:"How fresh the market data the check reads is."`
}

type earlySaleCheckList struct {
	Date   string           `json:"date" format:"date" doc:"The date each lot is sold on: today."`
	Effect string           `json:"effect" enum:"shorten_term,lower_installment" doc:"What each prepayment changes."`
	Checks []earlySaleCheck `json:"checks" nullable:"false" doc:"An early sale check for every lot recorded, ranked by advantage, lowest first, so the lots selling favours most come first. The unavailable ones follow, by purchase date."`
}

type earlySale struct {
	Date   string         `json:"date" format:"date" doc:"The date the lot is sold on: today."`
	Effect string         `json:"effect" enum:"shorten_term,lower_installment" doc:"What each prepayment changes."`
	Check  earlySaleCheck `json:"check" doc:"The lot's early sale check."`
}

const earlySaleChecksTag = "Early Sale Checks"

func registerEarlySales(humaAPI huma.API, services Services, now func() time.Time) {
	register(humaAPI, huma.Operation{
		OperationID: "check-early-sales",
		Method:      http.MethodGet,
		Path:        "/early-sale-checks",
		Summary:     "Check every lot for an early sale",
		Description: "Compares, for every lot recorded, selling it today at its Market Value and prepaying the proceeds with holding it to maturity, under equal outflow, valued on the bond's maturity. It is computed on request and not stored.",
		Tags:        []string{earlySaleChecksTag},
	}, func(ctx context.Context, in *earlySaleInput) (*struct{ Body earlySaleCheckList }, error) {
		today := dateOf(now())

		lots, err := services.Lots.Lots(ctx)
		if err != nil {
			return nil, err
		}

		checks, status, err := checkEarlySales(ctx, services, lots, mortgage.PrepaymentEffect(in.Effect), today, now())
		if err != nil {
			return nil, err
		}

		out := &struct{ Body earlySaleCheckList }{Body: earlySaleCheckList{
			Date:   today.Format(time.DateOnly),
			Effect: in.Effect,
			Checks: make([]earlySaleCheck, 0, len(checks)),
		}}

		for _, c := range checks {
			out.Body.Checks = append(out.Body.Checks, newEarlySaleCheck(c, status))
		}

		return out, nil
	})

	register(humaAPI, huma.Operation{
		OperationID: "check-early-sale",
		Method:      http.MethodGet,
		Path:        "/early-sale-checks/{id}",
		Summary:     "Check a lot for an early sale",
		Description: "Compares selling the lot today at its Market Value and prepaying the proceeds with holding it to maturity, under equal outflow, valued on the bond's maturity. It is computed on request and not stored.",
		Tags:        []string{earlySaleChecksTag},
	}, func(ctx context.Context, in *struct {
		ID     int64  `path:"id" doc:"The ID the lot was recorded with."`
		Effect string `query:"effect" required:"true" enum:"shorten_term,lower_installment" doc:"What prepaying changes: shorten_term keeps the installment and ends the mortgage earlier; lower_installment keeps the end date and lowers the installments. Every prepayment of both scenarios has it."`
	},
	) (*struct{ Body earlySale }, error) {
		today := dateOf(now())

		lots, err := services.Lots.Lots(ctx)
		if err != nil {
			return nil, err
		}

		i := slices.IndexFunc(lots, func(l bonds.Lot) bool { return l.ID == in.ID })
		if i < 0 {
			return nil, lotFailure(bonds.ErrLotNotFound)
		}

		checks, status, err := checkEarlySales(ctx, services, lots[i:i+1], mortgage.PrepaymentEffect(in.Effect), today, now())
		if err != nil {
			return nil, err
		}

		return &struct{ Body earlySale }{Body: earlySale{
			Date:   today.Format(time.DateOnly),
			Effect: in.Effect,
			Check:  newEarlySaleCheck(checks[0], status),
		}}, nil
	})
}

// checkEarlySales reads what the comparison needs and checks each of lots for an early sale on
// today, and how fresh the market data is at now.
func checkEarlySales(ctx context.Context, services Services, lots []bonds.Lot, effect mortgage.PrepaymentEffect, today, now time.Time) ([]comparison.EarlySaleCheck, marketdata.Status, error) {
	terms, err := services.Mortgages.Find(ctx)
	if err != nil {
		return nil, marketdata.Status{}, mortgageFailure(err)
	}

	withIPCA := terms.Indexer == mortgage.IPCA || slices.ContainsFunc(lots, func(l bonds.Lot) bool { return readsIPCA(l.Bond.Type) })

	m, market, err := comparisonOf(ctx, services, terms, withIPCA)
	if err != nil {
		return nil, marketdata.Status{}, err
	}

	checks, err := comparison.CheckEarlySales(m, market, lots, effect, today)
	if err != nil {
		return nil, marketdata.Status{}, err
	}

	status, err := services.MarketData.Status(ctx, now)
	if err != nil {
		return nil, marketdata.Status{}, err
	}

	return checks, status, nil
}

func newEarlySaleCheck(c comparison.EarlySaleCheck, status marketdata.Status) earlySaleCheck {
	out := earlySaleCheck{
		Lot:         newLot(c.Lot),
		Unavailable: string(c.Unavailable),
		ProjectedBy: projectedByOf(c.ProjectedBy),
		MarketData:  newVerdictMarketData(c.Indexes, status),
	}

	if c.SellPrice != nil {
		out.SellPrice = new(priceOutput(*c.SellPrice))
	}

	if c.Unavailable != "" {
		return out
	}

	out.Verdict = "hold"
	if c.Sells() {
		out.Verdict = "sell"
	}

	out.MarketValue = new(newLotAmount(c.MarketValue))
	out.Advantage = c.Advantage.String()
	out.Hold, out.Sell = new(newScenario(c.Hold)), new(newScenario(c.Sell))

	return out
}
