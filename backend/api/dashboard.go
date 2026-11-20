package api

import (
	"context"
	"fmt"
	"net/http"

	"github.com/danielgtaylor/huma/v2"

	"github.com/gringolito/debtwise/backend/mortgage"
)

const defaultComparisonPath = "/dashboard/default-comparison"

type defaultComparisonInput struct {
	Amount string `json:"amount" pattern:"^(0|[1-9][0-9]{0,14})(\\.[0-9]{1,2})?$" doc:"The amount the dashboard compares prepaying today with investing, in reais, as a decimal string."`
	Effect string `json:"effect" enum:"shorten_term,lower_installment" doc:"What prepaying the amount changes: shorten_term keeps the installment and ends the mortgage earlier; lower_installment keeps the end date and lowers the installments."`
}

type defaultComparison struct {
	Amount string `json:"amount" doc:"The amount the dashboard compares prepaying today with investing, in reais, as a decimal string."`
	Effect string `json:"effect" enum:"shorten_term,lower_installment" doc:"What prepaying the amount changes: shorten_term keeps the installment and ends the mortgage earlier; lower_installment keeps the end date and lowers the installments."`
}

func registerDashboard(humaAPI huma.API, mortgages Mortgages) {
	register(humaAPI, huma.Operation{
		OperationID: "default-comparison",
		Method:      http.MethodGet,
		Path:        defaultComparisonPath,
		Summary:     "Read the dashboard's default comparison",
		Description: "Returns the amount and the effect the dashboard compares prepaying with investing by default.",
		Tags:        []string{decisionsTag},
	}, func(ctx context.Context, _ *struct{}) (*struct{ Body defaultComparison }, error) {
		c, err := mortgages.DefaultComparison(ctx)
		if err != nil {
			return nil, err
		}

		return &struct{ Body defaultComparison }{Body: newDefaultComparison(c)}, nil
	})

	register(humaAPI, huma.Operation{
		OperationID: "save-default-comparison",
		Method:      http.MethodPut,
		Path:        defaultComparisonPath,
		Summary:     "Change the dashboard's default comparison",
		Description: "Sets the amount and the effect the dashboard compares prepaying with investing by default.",
		Tags:        []string{decisionsTag},
	}, func(ctx context.Context, in *struct{ Body defaultComparisonInput }) (*struct{ Body defaultComparison }, error) {
		var p parser

		c := mortgage.DefaultComparison{Amount: p.decimal(in.Body.Amount), Effect: mortgage.PrepaymentEffect(in.Body.Effect)}
		if p.err != nil {
			return nil, fmt.Errorf("read default comparison: %w", p.err)
		}

		if err := violationsFailure(c.Validate()); err != nil {
			return nil, err
		}

		if err := mortgages.SaveDefaultComparison(ctx, c); err != nil {
			return nil, err
		}

		return &struct{ Body defaultComparison }{Body: newDefaultComparison(c)}, nil
	})
}

func newDefaultComparison(c mortgage.DefaultComparison) defaultComparison {
	return defaultComparison{Amount: c.Amount.String(), Effect: string(c.Effect)}
}
