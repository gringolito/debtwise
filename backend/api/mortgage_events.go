package api

import (
	"context"
	"errors"
	"fmt"
	"net/http"
	"time"

	"github.com/danielgtaylor/huma/v2"

	"github.com/gringolito/debtwise/backend/indexes"
	"github.com/gringolito/debtwise/backend/mortgage"
)

type prepaymentInput struct {
	Date   string `json:"date" format:"date" doc:"Date the prepayment was made."`
	Amount string `json:"amount" pattern:"^(0|[1-9][0-9]{0,14})(\\.[0-9]{1,2})?$" doc:"Amount prepaid, in reais, as a decimal string."`
	Effect string `json:"effect" enum:"shorten_term,lower_installment" doc:"What the prepayment changes: shorten_term keeps the installment and ends the mortgage earlier; lower_installment keeps the end date and lowers the installments."`
}

type prepayment struct {
	ID     int64  `json:"id" doc:"The prepayment's ID."`
	Date   string `json:"date" format:"date" doc:"Date the prepayment was made."`
	Amount string `json:"amount" doc:"Amount prepaid, in reais, as a decimal string."`
	Effect string `json:"effect" enum:"shorten_term,lower_installment" doc:"What the prepayment changes: shorten_term keeps the installment and ends the mortgage earlier; lower_installment keeps the end date and lowers the installments."`
}

type prepaymentList struct {
	Prepayments []prepayment `json:"prepayments" nullable:"false" doc:"Every prepayment recorded on the mortgage, in date order."`
}

type statementInput struct {
	Date               string `json:"date" format:"date" doc:"Date of the outstanding balance the bank reported. One statement per date."`
	OutstandingBalance string `json:"outstanding_balance" pattern:"^(0|[1-9][0-9]{0,14})(\\.[0-9]{1,2})?$" doc:"Outstanding balance the bank reported, in reais, as a decimal string."`
}

type statement struct {
	ID                 int64  `json:"id" doc:"The statement's ID."`
	Date               string `json:"date" format:"date" doc:"Date of the outstanding balance the bank reported."`
	OutstandingBalance string `json:"outstanding_balance" doc:"Outstanding balance the bank reported, in reais, as a decimal string."`
}

type statementDrift struct {
	ID                 int64  `json:"id" doc:"The statement's ID."`
	Date               string `json:"date" format:"date" doc:"Date of the outstanding balance the bank reported."`
	OutstandingBalance string `json:"outstanding_balance" doc:"Outstanding balance the bank reported, in reais, as a decimal string."`
	ComputedBalance    string `json:"computed_balance" doc:"Outstanding balance the schedule shows on the same date, after the installments due by then, in reais, as a decimal string."`
	Drift              string `json:"drift" doc:"The reported balance minus the computed one, in reais, as a decimal string. Positive when the bank says more is owed."`
}

type statementList struct {
	Statements []statementDrift `json:"statements" nullable:"false" doc:"Every statement recorded on the mortgage, in date order, each with its drift from the schedule. Only this list carries the drift."`
}

const (
	prepaymentsPath = mortgagePath + "/prepayments"
	statementsPath  = mortgagePath + "/statements"
)

func registerMortgageEvents(humaAPI huma.API, mortgages Mortgages, store IndexStore, now func() time.Time) {
	registerPrepayments(humaAPI, mortgages)
	registerStatements(humaAPI, mortgages, store, now)
}

func registerPrepayments(humaAPI huma.API, mortgages Mortgages) {
	register(humaAPI, huma.Operation{
		OperationID: "list-prepayments",
		Method:      http.MethodGet,
		Path:        prepaymentsPath,
		Summary:     "List the prepayments",
		Description: "Returns the prepayments recorded on the mortgage.",
		Tags:        []string{mortgageTag},
	}, func(ctx context.Context, _ *struct{}) (*struct{ Body prepaymentList }, error) {
		events, err := mortgages.Events(ctx)
		if err != nil {
			return nil, mortgageFailure(err)
		}

		out := &struct{ Body prepaymentList }{Body: prepaymentList{Prepayments: make([]prepayment, 0, len(events.Prepayments))}}
		for _, p := range events.Prepayments {
			out.Body.Prepayments = append(out.Body.Prepayments, newPrepayment(p))
		}

		return out, nil
	})

	register(humaAPI, huma.Operation{
		OperationID:   "add-prepayment",
		Method:        http.MethodPost,
		Path:          prepaymentsPath,
		DefaultStatus: http.StatusCreated,
		Summary:       "Record a prepayment",
		Description:   "Records a prepayment made on the mortgage, which the schedule then replays.",
		Tags:          []string{mortgageTag},
	}, func(ctx context.Context, in *struct{ Body prepaymentInput }) (*struct{ Body prepayment }, error) {
		p, err := readPrepayment(ctx, mortgages, in.Body)
		if err != nil {
			return nil, err
		}

		added, err := mortgages.AddPrepayment(ctx, p)
		if err != nil {
			return nil, mortgageFailure(err)
		}

		return &struct{ Body prepayment }{Body: newPrepayment(added)}, nil
	})

	register(humaAPI, huma.Operation{
		OperationID: "edit-prepayment",
		Method:      http.MethodPut,
		Path:        prepaymentsPath + "/{id}",
		Summary:     "Edit a prepayment",
		Description: "Replaces a recorded prepayment.",
		Tags:        []string{mortgageTag},
	}, func(ctx context.Context, in *struct {
		ID   int64 `path:"id" doc:"The ID the prepayment was recorded with."`
		Body prepaymentInput
	},
	) (*struct{ Body prepayment }, error) {
		p, err := readPrepayment(ctx, mortgages, in.Body)
		if err != nil {
			return nil, err
		}

		p.ID = in.ID

		if err := mortgages.UpdatePrepayment(ctx, p); err != nil {
			return nil, mortgageFailure(err)
		}

		return &struct{ Body prepayment }{Body: newPrepayment(p)}, nil
	})

	register(humaAPI, huma.Operation{
		OperationID:   "delete-prepayment",
		Method:        http.MethodDelete,
		Path:          prepaymentsPath + "/{id}",
		DefaultStatus: http.StatusNoContent,
		Summary:       "Delete a prepayment",
		Description:   "Deletes a recorded prepayment, so the schedule no longer replays it.",
		Tags:          []string{mortgageTag},
	}, func(ctx context.Context, in *struct {
		ID int64 `path:"id" doc:"The ID the prepayment was recorded with."`
	},
	) (*struct{}, error) {
		if err := mortgages.DeletePrepayment(ctx, in.ID); err != nil {
			return nil, mortgageFailure(err)
		}

		return &struct{}{}, nil
	})
}

func registerStatements(humaAPI huma.API, mortgages Mortgages, store IndexStore, now func() time.Time) {
	register(humaAPI, huma.Operation{
		OperationID: "list-statements",
		Method:      http.MethodGet,
		Path:        statementsPath,
		Summary:     "List the statements",
		Description: "Returns the statements recorded on the mortgage, each compared with the outstanding balance the schedule computed for its date.",
		Tags:        []string{mortgageTag},
	}, func(ctx context.Context, _ *struct{}) (*struct{ Body statementList }, error) {
		terms, outlook, events, err := replayInputs(ctx, mortgages, store)
		if err != nil {
			return nil, err
		}

		out := &struct{ Body statementList }{Body: statementList{Statements: make([]statementDrift, 0, len(events.Statements))}}
		for _, d := range terms.Drifts(outlook, events, now()) {
			out.Body.Statements = append(out.Body.Statements, statementDrift{
				ID:                 d.Statement.ID,
				Date:               d.Statement.Date.Format(time.DateOnly),
				OutstandingBalance: d.Statement.OutstandingBalance.String(),
				ComputedBalance:    d.ComputedBalance.String(),
				Drift:              d.Amount.String(),
			})
		}

		return out, nil
	})

	register(humaAPI, huma.Operation{
		OperationID:   "add-statement",
		Method:        http.MethodPost,
		Path:          statementsPath,
		DefaultStatus: http.StatusCreated,
		Summary:       "Record a statement",
		Description:   "Records the outstanding balance the bank reported on a date, which the schedule then continues from.",
		Tags:          []string{mortgageTag},
	}, func(ctx context.Context, in *struct{ Body statementInput }) (*struct{ Body statement }, error) {
		st, err := readStatement(ctx, mortgages, in.Body)
		if err != nil {
			return nil, err
		}

		added, err := mortgages.AddStatement(ctx, st)
		if err != nil {
			return nil, statementFailure(err)
		}

		return &struct{ Body statement }{Body: newStatement(added)}, nil
	})

	register(humaAPI, huma.Operation{
		OperationID: "edit-statement",
		Method:      http.MethodPut,
		Path:        statementsPath + "/{id}",
		Summary:     "Edit a statement",
		Description: "Replaces a recorded statement.",
		Tags:        []string{mortgageTag},
	}, func(ctx context.Context, in *struct {
		ID   int64 `path:"id" doc:"The ID the statement was recorded with."`
		Body statementInput
	},
	) (*struct{ Body statement }, error) {
		st, err := readStatement(ctx, mortgages, in.Body)
		if err != nil {
			return nil, err
		}

		st.ID = in.ID

		if err := mortgages.UpdateStatement(ctx, st); err != nil {
			return nil, statementFailure(err)
		}

		return &struct{ Body statement }{Body: newStatement(st)}, nil
	})

	register(humaAPI, huma.Operation{
		OperationID:   "delete-statement",
		Method:        http.MethodDelete,
		Path:          statementsPath + "/{id}",
		DefaultStatus: http.StatusNoContent,
		Summary:       "Delete a statement",
		Description:   "Deletes a recorded statement, so the schedule no longer continues from it.",
		Tags:          []string{mortgageTag},
	}, func(ctx context.Context, in *struct {
		ID int64 `path:"id" doc:"The ID the statement was recorded with."`
	},
	) (*struct{}, error) {
		if err := mortgages.DeleteStatement(ctx, in.ID); err != nil {
			return nil, statementFailure(err)
		}

		return &struct{}{}, nil
	})
}

// replayInputs reads what replaying the registered mortgage's schedule needs: its terms, the
// outlook over the history of the indexes its indexer reads, the Focus expectations and the
// projection methods, and its events.
func replayInputs(ctx context.Context, mortgages Mortgages, store IndexStore) (mortgage.Terms, indexes.Outlook, mortgage.Events, error) {
	terms, err := mortgages.Find(ctx)
	if err != nil {
		return mortgage.Terms{}, indexes.Outlook{}, mortgage.Events{}, mortgageFailure(err)
	}

	history := map[indexes.Index][]indexes.Value{}
	for _, index := range terms.Indexer.Indexes() {
		if history[index], err = store.History(ctx, index); err != nil {
			return mortgage.Terms{}, indexes.Outlook{}, mortgage.Events{}, err
		}
	}

	expectations, err := store.Expectations(ctx)
	if err != nil {
		return mortgage.Terms{}, indexes.Outlook{}, mortgage.Events{}, err
	}

	methods, err := store.ProjectionMethods(ctx)
	if err != nil {
		return mortgage.Terms{}, indexes.Outlook{}, mortgage.Events{}, err
	}

	events, err := mortgages.Events(ctx)
	if err != nil {
		return mortgage.Terms{}, indexes.Outlook{}, mortgage.Events{}, mortgageFailure(err)
	}

	return terms, indexes.NewOutlook(history, expectations, methods), events, nil
}

// readPrepayment reads a prepayment from a body whose date and amount the schema has already
// checked, and checks it against the registered mortgage's terms.
func readPrepayment(ctx context.Context, mortgages Mortgages, body prepaymentInput) (mortgage.Prepayment, error) {
	terms, err := mortgages.Find(ctx)
	if err != nil {
		return mortgage.Prepayment{}, mortgageFailure(err)
	}

	var p parser

	prepayment := mortgage.Prepayment{
		Date: p.date(body.Date), Amount: p.decimal(body.Amount), Effect: mortgage.PrepaymentEffect(body.Effect),
	}
	if p.err != nil {
		return mortgage.Prepayment{}, fmt.Errorf("read prepayment: %w", p.err)
	}

	return prepayment, violationsFailure(prepayment.Validate(terms))
}

// readStatement reads a statement from a body whose date and balance the schema has already
// checked, and checks it against the registered mortgage's terms.
func readStatement(ctx context.Context, mortgages Mortgages, body statementInput) (mortgage.Statement, error) {
	terms, err := mortgages.Find(ctx)
	if err != nil {
		return mortgage.Statement{}, mortgageFailure(err)
	}

	var p parser

	st := mortgage.Statement{Date: p.date(body.Date), OutstandingBalance: p.decimal(body.OutstandingBalance)}
	if p.err != nil {
		return mortgage.Statement{}, fmt.Errorf("read statement: %w", p.err)
	}

	return st, violationsFailure(st.Validate(terms))
}

// violationsFailure returns a 422 listing violations, or nil when there are none.
func violationsFailure(violations []mortgage.Violation) error {
	if len(violations) == 0 {
		return nil
	}

	details := make([]error, 0, len(violations))
	for _, v := range violations {
		details = append(details, &huma.ErrorDetail{Location: "body." + v.Field, Message: v.Reason})
	}

	return huma.Error422UnprocessableEntity("validation failed", details...)
}

func statementFailure(err error) error {
	if errors.Is(err, mortgage.ErrStatementDateTaken) {
		return huma.Error409Conflict("a statement is already recorded on this date")
	}

	return mortgageFailure(err)
}

func newPrepayment(p mortgage.Prepayment) prepayment {
	return prepayment{ID: p.ID, Date: p.Date.Format(time.DateOnly), Amount: p.Amount.String(), Effect: string(p.Effect)}
}

func newStatement(s mortgage.Statement) statement {
	return statement{ID: s.ID, Date: s.Date.Format(time.DateOnly), OutstandingBalance: s.OutstandingBalance.String()}
}
