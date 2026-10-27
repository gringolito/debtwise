package indexes

import (
	"context"
	"database/sql"
	"errors"
	"fmt"
	"slices"
	"time"

	"github.com/gringolito/debtwise/backend/db"
	"github.com/gringolito/debtwise/backend/decimal"
)

// ProjectionMethods returns the projection method of every projected index, in the order of
// Projected: the one the owner saved, or the index's default.
func (s *Store) ProjectionMethods(ctx context.Context) ([]ProjectionMethod, error) {
	rows, err := db.New(s.conn).ListProjectionMethods(ctx)
	if err != nil {
		return nil, fmt.Errorf("indexes: projection methods: %w", err)
	}

	saved := make(map[Index]Method, len(rows))

	for _, row := range rows {
		index, method := Index(row.Series), Method(row.Method)
		if !slices.Contains(Methods(index), method) {
			return nil, fmt.Errorf("indexes: projection methods: stored %s for %s: %w", method, index, ErrMethodNotOffered)
		}

		saved[index] = method
	}

	methods := make([]ProjectionMethod, 0, len(Projected()))

	for _, index := range Projected() {
		method, ok := saved[index]
		if !ok {
			method = DefaultMethod(index)
		}

		methods = append(methods, ProjectionMethod{Index: index, Method: method})
	}

	return methods, nil
}

// SaveProjectionMethod stores the method an index is projected by. It fails with
// ErrMethodNotOffered, storing nothing, when the index can't be projected by the method.
func (s *Store) SaveProjectionMethod(ctx context.Context, m ProjectionMethod) error {
	if !slices.Contains(Methods(m.Index), m.Method) {
		return fmt.Errorf("indexes: save projection method %s of %s: %w", m.Method, m.Index, ErrMethodNotOffered)
	}

	err := db.New(s.conn).UpsertProjectionMethod(ctx, db.UpsertProjectionMethodParams{
		Series: string(m.Index),
		Method: string(m.Method),
	})
	if err != nil {
		return fmt.Errorf("indexes: save projection method of %s: %w", m.Index, err)
	}

	return nil
}

// SaveExpectations replaces every stored expectation with e and records the refresh that fetched
// them at at, in one transaction.
func (s *Store) SaveExpectations(ctx context.Context, e Expectations, at time.Time) error {
	tx, err := s.conn.BeginTx(ctx, nil)
	if err != nil {
		return fmt.Errorf("indexes: save expectations: begin: %w", err)
	}

	defer func() { _ = tx.Rollback() }()

	if err := replaceExpectations(ctx, db.New(tx), e, formatTime(at)); err != nil {
		return fmt.Errorf("indexes: save expectations: %w", err)
	}

	err = db.New(tx).RecordFocusRefreshed(ctx, sql.NullString{String: formatTime(at), Valid: true})
	if err != nil {
		return fmt.Errorf("indexes: save expectations: record refresh: %w", err)
	}

	if err := tx.Commit(); err != nil {
		return fmt.Errorf("indexes: save expectations: commit: %w", err)
	}

	return nil
}

func replaceExpectations(ctx context.Context, queries *db.Queries, e Expectations, fetchedAt string) error {
	err := errors.Join(
		queries.DeleteFocusSelic(ctx),
		queries.DeleteFocusIPCAMonthly(ctx),
		queries.DeleteFocusIPCAAnnual(ctx),
	)
	if err != nil {
		return fmt.Errorf("delete stored: %w", err)
	}

	for _, m := range e.Selic {
		err := queries.InsertFocusSelic(ctx, db.InsertFocusSelicParams{
			Year:      int64(m.Year),
			Meeting:   int64(m.Number),
			Median:    m.Median.String(),
			FetchedAt: fetchedAt,
		})
		if err != nil {
			return fmt.Errorf("selic R%d/%d: %w", m.Number, m.Year, err)
		}
	}

	for _, m := range e.MonthlyIPCA {
		err := queries.InsertFocusIPCAMonthly(ctx, db.InsertFocusIPCAMonthlyParams{
			Month:     m.Month.Format(dateLayout),
			Median:    m.Median.String(),
			FetchedAt: fetchedAt,
		})
		if err != nil {
			return fmt.Errorf("monthly ipca %s: %w", m.Month.Format(dateLayout), err)
		}
	}

	for _, y := range e.AnnualIPCA {
		err := queries.InsertFocusIPCAAnnual(ctx, db.InsertFocusIPCAAnnualParams{
			Year:      int64(y.Year),
			Median:    y.Median.String(),
			FetchedAt: fetchedAt,
		})
		if err != nil {
			return fmt.Errorf("annual ipca %d: %w", y.Year, err)
		}
	}

	return nil
}

// SaveExpectationsFailure records that a refresh of the expectations failed at at, and keeps the
// stored expectations.
func (s *Store) SaveExpectationsFailure(ctx context.Context, at time.Time) error {
	err := db.New(s.conn).RecordFocusFailed(ctx, sql.NullString{String: formatTime(at), Valid: true})
	if err != nil {
		return fmt.Errorf("indexes: record expectations failure: %w", err)
	}

	return nil
}

// Expectations returns the stored expectations: the Selic by year and meeting, the monthly IPCA by
// month and the annual IPCA by year.
func (s *Store) Expectations(ctx context.Context) (Expectations, error) {
	queries := db.New(s.conn)

	selicRows, err := queries.ListFocusSelic(ctx)
	if err != nil {
		return Expectations{}, fmt.Errorf("indexes: expectations: selic: %w", err)
	}

	monthlyRows, err := queries.ListFocusIPCAMonthly(ctx)
	if err != nil {
		return Expectations{}, fmt.Errorf("indexes: expectations: monthly ipca: %w", err)
	}

	annualRows, err := queries.ListFocusIPCAAnnual(ctx)
	if err != nil {
		return Expectations{}, fmt.Errorf("indexes: expectations: annual ipca: %w", err)
	}

	var e Expectations

	for _, row := range selicRows {
		median, err := decimal.Parse(row.Median)
		if err != nil {
			return Expectations{}, fmt.Errorf("indexes: expectations: selic R%d/%d: %w", row.Meeting, row.Year, err)
		}

		e.Selic = append(e.Selic, MeetingMedian{Year: int(row.Year), Number: int(row.Meeting), Median: median})
	}

	for _, row := range monthlyRows {
		month, monthErr := time.Parse(dateLayout, row.Month)
		median, medianErr := decimal.Parse(row.Median)

		if err := errors.Join(monthErr, medianErr); err != nil {
			return Expectations{}, fmt.Errorf("indexes: expectations: monthly ipca %s: %w", row.Month, err)
		}

		e.MonthlyIPCA = append(e.MonthlyIPCA, MonthMedian{Month: month, Median: median})
	}

	for _, row := range annualRows {
		median, err := decimal.Parse(row.Median)
		if err != nil {
			return Expectations{}, fmt.Errorf("indexes: expectations: annual ipca %d: %w", row.Year, err)
		}

		e.AnnualIPCA = append(e.AnnualIPCA, YearMedian{Year: int(row.Year), Median: median})
	}

	return e, nil
}

// ExpectationsRefreshTimes returns when the expectations were last refreshed and when that last
// failed, each zero when it never happened.
func (s *Store) ExpectationsRefreshTimes(ctx context.Context) (ExpectationsRefreshTimes, error) {
	rows, err := db.New(s.conn).ListFocusRefreshes(ctx)
	if err != nil {
		return ExpectationsRefreshTimes{}, fmt.Errorf("indexes: expectations refresh times: %w", err)
	}

	if len(rows) == 0 {
		return ExpectationsRefreshTimes{}, nil
	}

	refreshedAt, refreshedErr := parseNullTime(rows[0].RefreshedAt)
	failedAt, failedErr := parseNullTime(rows[0].FailedAt)

	if err := errors.Join(refreshedErr, failedErr); err != nil {
		return ExpectationsRefreshTimes{}, fmt.Errorf("indexes: expectations refresh times: %w", err)
	}

	return ExpectationsRefreshTimes{RefreshedAt: refreshedAt, FailedAt: failedAt}, nil
}
