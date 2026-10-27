package mortgage

import (
	"context"
	"database/sql"
	"errors"
	"fmt"

	"github.com/gringolito/debtwise/backend/db"
)

var (
	// ErrPrepaymentNotFound is returned when the mortgage has no prepayment with the ID asked for.
	ErrPrepaymentNotFound = errors.New("mortgage: no such prepayment")
	// ErrStatementNotFound is returned when the mortgage has no statement with the ID asked for.
	ErrStatementNotFound = errors.New("mortgage: no such statement")
	// ErrStatementDateTaken is returned when the mortgage already has a statement on a date.
	ErrStatementDateTaken = errors.New("mortgage: a statement is already recorded on that date")
)

// Events returns the registered mortgage's prepayments and statements, each in date order, or
// ErrNotFound.
func (s *Store) Events(ctx context.Context) (Events, error) {
	var events Events

	err := s.inMortgage(ctx, func(q *db.Queries, mortgage int64) error {
		var err error

		events, err = readEvents(ctx, q, mortgage)

		return err
	})

	return events, err
}

// AddPrepayment records p on the registered mortgage, or returns ErrNotFound, and returns it with
// its ID.
func (s *Store) AddPrepayment(ctx context.Context, p Prepayment) (Prepayment, error) {
	err := s.inMortgage(ctx, func(q *db.Queries, mortgage int64) error {
		var err error

		p.ID, err = q.InsertMortgagePrepayment(ctx, db.InsertMortgagePrepaymentParams{
			MortgageID: mortgage, Date: formatDate(p.Date), Amount: p.Amount.String(), Effect: string(p.Effect),
		})
		if err != nil {
			return fmt.Errorf("mortgage: add prepayment on %s: %w", formatDate(p.Date), err)
		}

		return nil
	})

	return p, err
}

// UpdatePrepayment replaces the prepayment with p's ID by p, or returns ErrNotFound or
// ErrPrepaymentNotFound.
func (s *Store) UpdatePrepayment(ctx context.Context, p Prepayment) error {
	return s.inMortgage(ctx, func(q *db.Queries, mortgage int64) error {
		updated, err := q.UpdateMortgagePrepayment(ctx, db.UpdateMortgagePrepaymentParams{
			ID: p.ID, MortgageID: mortgage, Date: formatDate(p.Date), Amount: p.Amount.String(), Effect: string(p.Effect),
		})

		return affected("update prepayment", p.ID, updated, err, ErrPrepaymentNotFound)
	})
}

// DeletePrepayment removes the prepayment with id, or returns ErrNotFound or ErrPrepaymentNotFound.
func (s *Store) DeletePrepayment(ctx context.Context, id int64) error {
	return s.inMortgage(ctx, func(q *db.Queries, mortgage int64) error {
		deleted, err := q.DeleteMortgagePrepayment(ctx, db.DeleteMortgagePrepaymentParams{ID: id, MortgageID: mortgage})

		return affected("delete prepayment", id, deleted, err, ErrPrepaymentNotFound)
	})
}

// AddStatement records st on the registered mortgage and returns it with its ID. It returns
// ErrNotFound, or ErrStatementDateTaken when another statement has st's date.
func (s *Store) AddStatement(ctx context.Context, st Statement) (Statement, error) {
	err := s.inMortgage(ctx, func(q *db.Queries, mortgage int64) error {
		if err := checkStatementDate(ctx, q, mortgage, st); err != nil {
			return err
		}

		var err error

		st.ID, err = q.InsertMortgageStatement(ctx, db.InsertMortgageStatementParams{
			MortgageID: mortgage, Date: formatDate(st.Date), OutstandingBalance: st.OutstandingBalance.String(),
		})
		if err != nil {
			return fmt.Errorf("mortgage: add statement on %s: %w", formatDate(st.Date), err)
		}

		return nil
	})

	return st, err
}

// UpdateStatement replaces the statement with st's ID by st. It returns ErrNotFound,
// ErrStatementNotFound, or ErrStatementDateTaken when another statement has st's date.
func (s *Store) UpdateStatement(ctx context.Context, st Statement) error {
	return s.inMortgage(ctx, func(q *db.Queries, mortgage int64) error {
		if err := checkStatementDate(ctx, q, mortgage, st); err != nil {
			return err
		}

		updated, err := q.UpdateMortgageStatement(ctx, db.UpdateMortgageStatementParams{
			ID: st.ID, MortgageID: mortgage, Date: formatDate(st.Date), OutstandingBalance: st.OutstandingBalance.String(),
		})

		return affected("update statement", st.ID, updated, err, ErrStatementNotFound)
	})
}

// DeleteStatement removes the statement with id, or returns ErrNotFound or ErrStatementNotFound.
func (s *Store) DeleteStatement(ctx context.Context, id int64) error {
	return s.inMortgage(ctx, func(q *db.Queries, mortgage int64) error {
		deleted, err := q.DeleteMortgageStatement(ctx, db.DeleteMortgageStatementParams{ID: id, MortgageID: mortgage})

		return affected("delete statement", id, deleted, err, ErrStatementNotFound)
	})
}

// inMortgage runs fn in a transaction with the registered mortgage's ID, or returns ErrNotFound.
func (s *Store) inMortgage(ctx context.Context, fn func(q *db.Queries, mortgage int64) error) error {
	return s.inTx(ctx, func(q *db.Queries) error {
		row, err := q.FindMortgage(ctx)
		if errors.Is(err, sql.ErrNoRows) {
			return ErrNotFound
		}

		if err != nil {
			return fmt.Errorf("mortgage: find: %w", err)
		}

		return fn(q, row.ID)
	})
}

// checkStatementDate returns ErrStatementDateTaken when a statement other than st has its date.
func checkStatementDate(ctx context.Context, q *db.Queries, mortgage int64, st Statement) error {
	id, err := q.FindMortgageStatementOn(ctx, db.FindMortgageStatementOnParams{MortgageID: mortgage, Date: formatDate(st.Date)})
	if errors.Is(err, sql.ErrNoRows) {
		return nil
	}

	if err != nil {
		return fmt.Errorf("mortgage: find statement on %s: %w", formatDate(st.Date), err)
	}

	if id != st.ID {
		return ErrStatementDateTaken
	}

	return nil
}

// affected turns the outcome of a write to the row with id into an error: notFound when it changed
// no row.
func affected(op string, id, rows int64, err, notFound error) error {
	if err != nil {
		return fmt.Errorf("mortgage: %s %d: %w", op, id, err)
	}

	if rows == 0 {
		return notFound
	}

	return nil
}

func readEvents(ctx context.Context, q *db.Queries, mortgage int64) (Events, error) {
	var p parser

	events := Events{Prepayments: []Prepayment{}, Statements: []Statement{}}

	prepayments, err := q.ListMortgagePrepayments(ctx, mortgage)
	if err != nil {
		return Events{}, fmt.Errorf("mortgage: list prepayments of %d: %w", mortgage, err)
	}

	for _, row := range prepayments {
		events.Prepayments = append(events.Prepayments, Prepayment{
			ID: row.ID, Date: p.date(row.Date), Amount: p.decimal(row.Amount), Effect: PrepaymentEffect(row.Effect),
		})
	}

	statements, err := q.ListMortgageStatements(ctx, mortgage)
	if err != nil {
		return Events{}, fmt.Errorf("mortgage: list statements of %d: %w", mortgage, err)
	}

	for _, row := range statements {
		events.Statements = append(events.Statements, Statement{
			ID: row.ID, Date: p.date(row.Date), OutstandingBalance: p.decimal(row.OutstandingBalance),
		})
	}

	if p.err != nil {
		return Events{}, fmt.Errorf("mortgage: read events of %d: %w", mortgage, p.err)
	}

	return events, nil
}
