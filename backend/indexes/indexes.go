// Package indexes keeps the published history of the indexes DebtWise depends on, and when each
// was last refreshed from its source.
package indexes

import (
	"context"
	"database/sql"
	"errors"
	"fmt"
	"time"

	"github.com/gringolito/debtwise/backend/db"
	"github.com/gringolito/debtwise/backend/decimal"
)

// Index names a published series.
type Index string

const (
	TR          Index = "tr"
	Poupanca    Index = "poupanca"
	SelicTarget Index = "selic_target"
	Selic       Index = "selic"
	IPCA        Index = "ipca"
)

// All returns every index DebtWise keeps, in the order the API lists them.
func All() []Index {
	return []Index{TR, Poupanca, SelicTarget, Selic, IPCA}
}

// Value is one published value of an index, for the period from PeriodStart to PeriodEnd. A
// value its source dates by a single date has the same start and end.
type Value struct {
	PeriodStart time.Time
	PeriodEnd   time.Time
	Value       decimal.Decimal
	// FetchedAt is when the value was last fetched from its source.
	FetchedAt time.Time
}

// Refresh is when an index was last refreshed successfully, zero when it never was, and when its
// latest refresh failed, zero when that refresh succeeded.
type Refresh struct {
	Index       Index
	RefreshedAt time.Time
	FailedAt    time.Time
}

const dateLayout = time.DateOnly

// Store persists index values and refreshes in the database.
type Store struct {
	conn *sql.DB
}

func NewStore(conn *sql.DB) *Store {
	return &Store{conn: conn}
}

// SaveRefresh stores the values a refresh of index fetched at at, replacing the stored value of
// any period it fetched again, and records the refresh.
func (s *Store) SaveRefresh(ctx context.Context, index Index, values []Value, at time.Time) error {
	tx, err := s.conn.BeginTx(ctx, nil)
	if err != nil {
		return fmt.Errorf("indexes: save refresh of %s: %w", index, err)
	}

	defer func() { _ = tx.Rollback() }()

	queries := db.New(tx)
	for _, v := range values {
		err := queries.UpsertIndexValue(ctx, db.UpsertIndexValueParams{
			Series:      string(index),
			PeriodStart: v.PeriodStart.Format(dateLayout),
			PeriodEnd:   v.PeriodEnd.Format(dateLayout),
			Value:       v.Value.String(),
			FetchedAt:   formatTime(v.FetchedAt),
		})
		if err != nil {
			return fmt.Errorf("indexes: save %s value of %s: %w", index, v.PeriodStart.Format(dateLayout), err)
		}
	}

	err = queries.RecordIndexRefreshed(ctx, db.RecordIndexRefreshedParams{
		Series:      string(index),
		RefreshedAt: sql.NullString{String: formatTime(at), Valid: true},
	})
	if err != nil {
		return fmt.Errorf("indexes: record refresh of %s: %w", index, err)
	}

	if err := tx.Commit(); err != nil {
		return fmt.Errorf("indexes: save refresh of %s: %w", index, err)
	}

	return nil
}

// SaveFailure records that a refresh of index failed at at.
func (s *Store) SaveFailure(ctx context.Context, index Index, at time.Time) error {
	err := db.New(s.conn).RecordIndexFailed(ctx, db.RecordIndexFailedParams{
		Series:   string(index),
		FailedAt: sql.NullString{String: formatTime(at), Valid: true},
	})
	if err != nil {
		return fmt.Errorf("indexes: record failed refresh of %s: %w", index, err)
	}

	return nil
}

// History returns the stored values of index, by period start and then period end.
func (s *Store) History(ctx context.Context, index Index) ([]Value, error) {
	rows, err := db.New(s.conn).ListIndexValues(ctx, string(index))
	if err != nil {
		return nil, fmt.Errorf("indexes: history of %s: %w", index, err)
	}

	values := make([]Value, 0, len(rows))
	for _, row := range rows {
		v, err := valueFromRow(row)
		if err != nil {
			return nil, fmt.Errorf("indexes: history of %s: %w", index, err)
		}

		values = append(values, v)
	}

	return values, nil
}

// LatestPeriodStart returns the latest period start stored for index, or zero when it has no
// values.
func (s *Store) LatestPeriodStart(ctx context.Context, index Index) (time.Time, error) {
	latest, err := db.New(s.conn).LatestIndexPeriodStart(ctx, string(index))
	if err != nil {
		return time.Time{}, fmt.Errorf("indexes: latest period start of %s: %w", index, err)
	}

	if latest == "" {
		return time.Time{}, nil
	}

	start, err := time.Parse(dateLayout, latest)
	if err != nil {
		return time.Time{}, fmt.Errorf("indexes: latest period start of %s: %w", index, err)
	}

	return start, nil
}

// Refreshes returns the recorded refreshes, one per index that was ever refreshed or failed to.
func (s *Store) Refreshes(ctx context.Context) ([]Refresh, error) {
	rows, err := db.New(s.conn).ListIndexRefreshes(ctx)
	if err != nil {
		return nil, fmt.Errorf("indexes: refreshes: %w", err)
	}

	refreshes := make([]Refresh, 0, len(rows))
	for _, row := range rows {
		refreshedAt, refreshedErr := parseNullTime(row.RefreshedAt)
		failedAt, failedErr := parseNullTime(row.FailedAt)

		if err := errors.Join(refreshedErr, failedErr); err != nil {
			return nil, fmt.Errorf("indexes: refreshes of %s: %w", row.Series, err)
		}

		refreshes = append(refreshes, Refresh{Index: Index(row.Series), RefreshedAt: refreshedAt, FailedAt: failedAt})
	}

	return refreshes, nil
}

func valueFromRow(row db.ListIndexValuesRow) (Value, error) {
	start, startErr := time.Parse(dateLayout, row.PeriodStart)
	end, endErr := time.Parse(dateLayout, row.PeriodEnd)
	value, valueErr := decimal.Parse(row.Value)
	fetchedAt, fetchedErr := time.Parse(time.RFC3339, row.FetchedAt)

	if err := errors.Join(startErr, endErr, valueErr, fetchedErr); err != nil {
		return Value{}, err
	}

	return Value{PeriodStart: start, PeriodEnd: end, Value: value, FetchedAt: fetchedAt}, nil
}

func formatTime(t time.Time) string {
	return t.UTC().Format(time.RFC3339)
}

func parseNullTime(s sql.NullString) (time.Time, error) {
	if !s.Valid {
		return time.Time{}, nil
	}

	return time.Parse(time.RFC3339, s.String)
}
