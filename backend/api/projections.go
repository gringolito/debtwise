package api

import (
	"context"
	"errors"
	"net/http"
	"time"

	"github.com/danielgtaylor/huma/v2"

	"github.com/gringolito/debtwise/backend/indexes"
)

// projectionMonths is how many months ahead an index's projection reaches.
const projectionMonths = 60

// methodCode is a projection method, documented with every method the API knows.
type methodCode string

func (methodCode) Schema(huma.Registry) *huma.Schema {
	return enumSchema(indexes.AllMethods())
}

type projectionMethod struct {
	Index   indexCode    `json:"index"`
	Method  methodCode   `json:"method" doc:"The method the index is projected by."`
	Offered []methodCode `json:"offered" nullable:"false" doc:"The methods the index can be projected by, its default first."`
}

type projectionMethods struct {
	Methods []projectionMethod `json:"methods" nullable:"false" doc:"The projection method of every index that is projected."`
}

type projectionMethodsOutput struct {
	Body projectionMethods
}

type projectionMethodInput struct {
	Index indexCode `path:"index" doc:"The index."`
	Body  struct {
		Method methodCode `json:"method" doc:"The method to project the index by. It must be one the index offers."`
	}
}

type projectionMethodOutput struct {
	Body projectionMethod
}

type projectedBy struct {
	Index  indexCode  `json:"index"`
	Method methodCode `json:"method" doc:"The method the index was projected by."`
}

type projectedValue struct {
	PeriodStart string        `json:"period_start" format:"date" doc:"The first day of the period the value covers."`
	PeriodEnd   string        `json:"period_end" format:"date" doc:"The last day of the period the value covers. Equals period_start when the value is of one day or month."`
	Value       string        `json:"value" doc:"The projected value, as a decimal string in the index's unit."`
	Methods     []projectedBy `json:"methods" nullable:"false" doc:"The methods of the projected indexes the value comes from."`
}

type indexProjection struct {
	Index  indexCode        `json:"index"`
	Values []projectedValue `json:"values" nullable:"false" doc:"The projected values of the index, earliest period first. Empty when the index is not projected or has no published values."`
}

type indexProjectionOutput struct {
	Body indexProjection
}

func registerProjections(humaAPI huma.API, store IndexStore) {
	register(humaAPI, huma.Operation{
		OperationID: "projection-methods",
		Method:      http.MethodGet,
		Path:        "/indexes/projection-methods",
		Summary:     "List the projection methods",
		Description: "Lists, for every index that is projected, the method it is projected by and the methods it offers.",
		Tags:        []string{indexesTag},
	}, func(ctx context.Context, _ *struct{}) (*projectionMethodsOutput, error) {
		methods, err := store.ProjectionMethods(ctx)
		if err != nil {
			return nil, err
		}

		out := &projectionMethodsOutput{}
		out.Body.Methods = make([]projectionMethod, 0, len(methods))

		for _, m := range methods {
			out.Body.Methods = append(out.Body.Methods, projectionMethodOf(m))
		}

		return out, nil
	})

	register(humaAPI, huma.Operation{
		OperationID: "save-projection-method",
		Method:      http.MethodPut,
		Path:        "/indexes/{index}/projection-method",
		Summary:     "Choose how an index is projected",
		Description: "Sets the method the index is projected by. Fails when the index doesn't offer the method, as an index that is not projected offers none.",
		Tags:        []string{indexesTag},
	}, func(ctx context.Context, input *projectionMethodInput) (*projectionMethodOutput, error) {
		chosen := indexes.ProjectionMethod{
			Index:  indexes.Index(input.Index),
			Method: indexes.Method(input.Body.Method),
		}

		if err := store.SaveProjectionMethod(ctx, chosen); err != nil {
			if errors.Is(err, indexes.ErrMethodNotOffered) {
				return nil, huma.Error422UnprocessableEntity("validation failed", &huma.ErrorDetail{
					Location: "body.method",
					Message:  "is not offered for this index",
					Value:    input.Body.Method,
				})
			}

			return nil, err
		}

		return &projectionMethodOutput{Body: projectionMethodOf(chosen)}, nil
	})

	register(humaAPI, huma.Operation{
		OperationID: "index-projection",
		Method:      http.MethodGet,
		Path:        "/indexes/{index}/projection",
		Summary:     "Project an index",
		Description: "Lists the values the index's projection method gives for the months after its published values, with the methods each value comes from.",
		Tags:        []string{indexesTag},
	}, func(ctx context.Context, input *struct {
		Index indexCode `path:"index" doc:"The index."`
	},
	) (*indexProjectionOutput, error) {
		outlook, err := outlookOf(ctx, store, indexes.TR, indexes.PoupancaYield, indexes.SelicTarget, indexes.IPCA)
		if err != nil {
			return nil, err
		}

		path := outlook.Path(indexes.Index(input.Index), projectionMonths)

		out := &indexProjectionOutput{}
		out.Body.Index = input.Index
		out.Body.Values = make([]projectedValue, 0, len(path))

		for _, p := range path {
			out.Body.Values = append(out.Body.Values, projectedValue{
				PeriodStart: p.PeriodStart.Format(time.DateOnly),
				PeriodEnd:   p.PeriodEnd.Format(time.DateOnly),
				Value:       p.Value.String(),
				Methods:     projectedByOf(p.Methods),
			})
		}

		return out, nil
	})
}

func projectionMethodOf(m indexes.ProjectionMethod) projectionMethod {
	offered := indexes.Methods(m.Index)
	codes := make([]methodCode, 0, len(offered))

	for _, o := range offered {
		codes = append(codes, methodCode(o))
	}

	return projectionMethod{Index: indexCode(m.Index), Method: methodCode(m.Method), Offered: codes}
}

func projectedByOf(methods []indexes.ProjectionMethod) []projectedBy {
	out := make([]projectedBy, 0, len(methods))

	for _, m := range methods {
		out = append(out, projectedBy{Index: indexCode(m.Index), Method: methodCode(m.Method)})
	}

	return out
}

// outlookOf reads the published history of the given indexes, the Focus expectations and the
// projection methods, and returns their Outlook.
func outlookOf(ctx context.Context, store IndexStore, published ...indexes.Index) (indexes.Outlook, error) {
	history := make(map[indexes.Index][]indexes.Value, len(published))

	for _, index := range published {
		values, err := store.History(ctx, index)
		if err != nil {
			return indexes.Outlook{}, err
		}

		history[index] = values
	}

	expectations, err := store.Expectations(ctx)
	if err != nil {
		return indexes.Outlook{}, err
	}

	methods, err := store.ProjectionMethods(ctx)
	if err != nil {
		return indexes.Outlook{}, err
	}

	return indexes.NewOutlook(history, expectations, methods), nil
}
