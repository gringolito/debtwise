package api

import (
	"context"
	"fmt"
	"net/http"

	"github.com/danielgtaylor/huma/v2"

	"github.com/gringolito/debtwise/backend/mortgage"
)

const dashboardQuestionPath = "/dashboard/question"

type dashboardQuestionInput struct {
	Amount string `json:"amount" pattern:"^(0|[1-9][0-9]{0,14})(\\.[0-9]{1,2})?$" doc:"The amount the dashboard compares prepaying today with investing, in reais, as a decimal string. It must be greater than zero."`
	Effect string `json:"effect" enum:"shorten_term,lower_installment" doc:"What prepaying the amount changes: shorten_term keeps the installment and ends the mortgage earlier; lower_installment keeps the end date and lowers the installments."`
}

type dashboardQuestion struct {
	Amount string `json:"amount" doc:"The amount the dashboard compares prepaying today with investing, in reais, as a decimal string."`
	Effect string `json:"effect" enum:"shorten_term,lower_installment" doc:"What prepaying the amount changes: shorten_term keeps the installment and ends the mortgage earlier; lower_installment keeps the end date and lowers the installments."`
}

func registerDashboard(humaAPI huma.API, mortgages Mortgages) {
	register(humaAPI, huma.Operation{
		OperationID: "dashboard-question",
		Method:      http.MethodGet,
		Path:        dashboardQuestionPath,
		Summary:     "Read the dashboard's question",
		Description: "Returns the amount and the effect of the decision the dashboard answers: the ones last saved, or 10000.00 to shorten the term until any are.",
		Tags:        []string{decisionsTag},
	}, func(ctx context.Context, _ *struct{}) (*struct{ Body dashboardQuestion }, error) {
		q, err := mortgages.Question(ctx)
		if err != nil {
			return nil, err
		}

		return &struct{ Body dashboardQuestion }{Body: newDashboardQuestion(q)}, nil
	})

	register(humaAPI, huma.Operation{
		OperationID: "save-dashboard-question",
		Method:      http.MethodPut,
		Path:        dashboardQuestionPath,
		Summary:     "Change the dashboard's question",
		Description: "Sets the amount and the effect of the decision the dashboard answers, for every client.",
		Tags:        []string{decisionsTag},
	}, func(ctx context.Context, in *struct{ Body dashboardQuestionInput }) (*struct{ Body dashboardQuestion }, error) {
		var p parser

		q := mortgage.Question{Amount: p.decimal(in.Body.Amount), Effect: mortgage.PrepaymentEffect(in.Body.Effect)}
		if p.err != nil {
			return nil, fmt.Errorf("read dashboard question: %w", p.err)
		}

		if err := violationsFailure(q.Validate()); err != nil {
			return nil, err
		}

		if err := mortgages.SaveQuestion(ctx, q); err != nil {
			return nil, err
		}

		return &struct{ Body dashboardQuestion }{Body: newDashboardQuestion(q)}, nil
	})
}

func newDashboardQuestion(q mortgage.Question) dashboardQuestion {
	return dashboardQuestion{Amount: q.Amount.String(), Effect: string(q.Effect)}
}
