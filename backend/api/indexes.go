package api

import (
	"context"
	"net/http"
	"time"

	"github.com/danielgtaylor/huma/v2"

	"github.com/gringolito/debtwise/backend/indexes"
	"github.com/gringolito/debtwise/backend/marketdata"
)

// IndexHistory is the subset of *indexes.Store the API reads.
type IndexHistory interface {
	History(ctx context.Context, index indexes.Index) ([]indexes.Value, error)
}

// MarketData is the subset of *marketdata.Job the API uses.
type MarketData interface {
	Status(ctx context.Context, now time.Time) (marketdata.Status, error)
	Trigger()
}

// indexCode is an index in a path, documented with every index the API knows.
type indexCode string

func (indexCode) Schema(huma.Registry) *huma.Schema {
	all := indexes.All()
	enum := make([]any, 0, len(all))

	for _, index := range all {
		enum = append(enum, string(index))
	}

	return &huma.Schema{Type: huma.TypeString, Enum: enum}
}

type indexValue struct {
	PeriodStart string    `json:"period_start" format:"date" doc:"The first day of the period the value covers."`
	PeriodEnd   string    `json:"period_end" format:"date" doc:"The last day of the period the value covers. Equals period_start when the source dates the value by one day or month."`
	Value       string    `json:"value" doc:"The published value, as a decimal string in the index's unit."`
	FetchedAt   time.Time `json:"fetched_at" doc:"When the value was last fetched from its source."`
}

type indexHistory struct {
	Index  indexCode    `json:"index"`
	Values []indexValue `json:"values" nullable:"false" doc:"Every stored value of the index, oldest period first."`
}

type indexHistoryOutput struct {
	Body indexHistory
}

type indexStatus struct {
	Index       indexCode  `json:"index"`
	Status      string     `json:"status" enum:"fresh,stale,failed,missing" doc:"fresh: refreshed recently; stale: not refreshed recently; failed: the latest refresh failed; missing: never refreshed."`
	RefreshedAt *time.Time `json:"refreshed_at,omitempty" doc:"When the index was last refreshed successfully. Absent when it never was."`
	FailedAt    *time.Time `json:"failed_at,omitempty" doc:"When the latest refresh of the index failed. Absent unless status is failed."`
}

type marketDataStatus struct {
	Refreshing bool          `json:"refreshing" doc:"Whether a refresh is pending or running."`
	Indexes    []indexStatus `json:"indexes" nullable:"false" doc:"How fresh each index is."`
}

type marketDataStatusOutput struct {
	Body marketDataStatus
}

func registerIndexes(humaAPI huma.API, history IndexHistory, marketData MarketData) {
	register(humaAPI, huma.Operation{
		OperationID: "index-history",
		Method:      http.MethodGet,
		Path:        "/indexes/{index}/history",
		Summary:     "List the history of an index",
		Description: "Lists every published value of an index that has been fetched from its source.",
		Tags:        []string{"Indexes"},
	}, func(ctx context.Context, input *struct {
		Index indexCode `path:"index" doc:"The index."`
	},
	) (*indexHistoryOutput, error) {
		values, err := history.History(ctx, indexes.Index(input.Index))
		if err != nil {
			return nil, err
		}

		out := &indexHistoryOutput{}
		out.Body.Index = input.Index
		out.Body.Values = make([]indexValue, 0, len(values))

		for _, v := range values {
			out.Body.Values = append(out.Body.Values, indexValue{
				PeriodStart: v.PeriodStart.Format(time.DateOnly),
				PeriodEnd:   v.PeriodEnd.Format(time.DateOnly),
				Value:       v.Value.String(),
				FetchedAt:   v.FetchedAt,
			})
		}

		return out, nil
	})

	register(humaAPI, huma.Operation{
		OperationID: "market-data-status",
		Method:      http.MethodGet,
		Path:        "/market-data/status",
		Summary:     "Report how fresh the market data is",
		Description: "Reports, for each index, when it was last refreshed from its source and whether that data is stale or its latest refresh failed.",
		Tags:        []string{"Market data"},
	}, func(ctx context.Context, _ *struct{}) (*marketDataStatusOutput, error) {
		return statusOutput(ctx, marketData)
	})

	register(humaAPI, huma.Operation{
		OperationID:   "refresh-market-data",
		Method:        http.MethodPost,
		Path:          "/market-data/refresh",
		Summary:       "Refresh the market data",
		Description:   "Starts refreshing every index from its source and answers at once with the market-data status. Poll the status until refreshing is false to see the outcome.",
		Tags:          []string{"Market data"},
		DefaultStatus: http.StatusAccepted,
	}, func(ctx context.Context, _ *struct{}) (*marketDataStatusOutput, error) {
		marketData.Trigger()

		return statusOutput(ctx, marketData)
	})
}

func statusOutput(ctx context.Context, marketData MarketData) (*marketDataStatusOutput, error) {
	status, err := marketData.Status(ctx, time.Now())
	if err != nil {
		return nil, err
	}

	out := &marketDataStatusOutput{}
	out.Body.Refreshing = status.Refreshing
	out.Body.Indexes = make([]indexStatus, 0, len(status.Indexes))

	for _, s := range status.Indexes {
		out.Body.Indexes = append(out.Body.Indexes, indexStatus{
			Index:       indexCode(s.Index),
			Status:      string(s.State),
			RefreshedAt: timeOrNil(s.RefreshedAt),
			FailedAt:    timeOrNil(s.FailedAt),
		})
	}

	return out, nil
}

func timeOrNil(t time.Time) *time.Time {
	if t.IsZero() {
		return nil
	}

	return &t
}
