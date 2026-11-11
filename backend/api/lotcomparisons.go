package api

import (
	"context"
	"net/http"
	"time"

	"github.com/danielgtaylor/huma/v2"

	"github.com/gringolito/debtwise/backend/comparison"
	"github.com/gringolito/debtwise/backend/mortgage"
)

type lotComparison struct {
	AmountInvested string        `json:"amount_invested" doc:"What the lot cost: its unit price times its quantity, rounded to centavos, in reais, as a decimal string."`
	Maturity       *lotAmount    `json:"maturity,omitempty" doc:"The lot's Maturity Value, gross and net of IOF, income tax and the custody fee. Absent when unavailable is missing_ipca."`
	Gain           string        `json:"gain,omitempty" doc:"The lot's net Maturity Value less its amount invested, in reais, as a decimal string. Absent when unavailable is missing_ipca."`
	Horizon        string        `json:"horizon" format:"date" doc:"The date both options are valued on: the bond's maturity."`
	Effect         string        `json:"effect" enum:"shorten_term,lower_installment" doc:"What prepaying changes."`
	Unavailable    string        `json:"unavailable,omitempty" enum:"missing_ipca,before_contract" doc:"Why the comparison has no advantage. missing_ipca: the IPCA the lot's values follow is not available yet; before_contract: the lot was bought before the mortgage's contract date. Absent when it has one."`
	Advantage      string        `json:"advantage,omitempty" doc:"The net worth on the horizon of buying the lot less that of prepaying its amount invested on its purchase date instead, in reais, as a decimal string. Positive favours the lot. Absent when the comparison is unavailable."`
	ProjectedBy    []projectedBy `json:"projected_by" nullable:"false" doc:"The projection method of each index a projected value of the advantage comes from. Empty when it reads published values only, or when the comparison is unavailable."`
}

func registerLotComparisons(humaAPI huma.API, services Services, now func() time.Time) {
	register(humaAPI, huma.Operation{
		OperationID: "compare-lot",
		Method:      http.MethodPost,
		Path:        lotsPath + "/comparison",
		Summary:     "Compare a lot with prepaying",
		Description: "Compares buying the lot with prepaying its amount invested on its purchase date instead, under equal outflow, valued on the bond's maturity. The lot need not be recorded; it is computed on request and not stored.",
		Tags:        []string{lotsTag},
	}, func(ctx context.Context, in *struct {
		Effect string `query:"effect" required:"true" enum:"shorten_term,lower_installment" doc:"What prepaying changes: shorten_term keeps the installment and ends the mortgage earlier; lower_installment keeps the end date and lowers the installments."`
		Body   lotInput
	},
	) (*struct{ Body lotComparison }, error) {
		today := dateOf(now())

		l, err := readLot(in.Body, today)
		if err != nil {
			return nil, err
		}

		terms, err := services.Mortgages.Find(ctx)
		if err != nil {
			return nil, mortgageFailure(err)
		}

		m, market, err := comparisonOf(ctx, services, terms, terms.Indexer == mortgage.IPCA || readsIPCA(l.Bond.Type))
		if err != nil {
			return nil, err
		}

		c, err := comparison.CompareLot(m, market, l, mortgage.PrepaymentEffect(in.Effect), today)
		if err != nil {
			return nil, err
		}

		return &struct{ Body lotComparison }{Body: newLotComparison(c, in.Effect)}, nil
	})
}

func newLotComparison(c comparison.LotComparison, effect string) lotComparison {
	out := lotComparison{
		AmountInvested: c.Lot.Cost().String(),
		Horizon:        c.Lot.Bond.Maturity.Format(time.DateOnly),
		Effect:         effect,
		Unavailable:    string(c.Unavailable),
		ProjectedBy:    projectedByOf(c.ProjectedBy),
	}

	if c.Unavailable == comparison.MissingIPCA {
		return out
	}

	out.Maturity, out.Gain = new(newLotAmount(c.Maturity)), c.Gain().String()

	if c.Unavailable == "" {
		out.Advantage = c.Advantage.String()
	}

	return out
}
