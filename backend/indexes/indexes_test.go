package indexes_test

import (
	"context"
	"database/sql"
	"path/filepath"
	"testing"
	"time"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"github.com/gringolito/debtwise/backend/db"
	"github.com/gringolito/debtwise/backend/decimal"
	"github.com/gringolito/debtwise/backend/indexes"
)

func openDatabase(t *testing.T, migrate bool) *sql.DB {
	t.Helper()

	conn, err := db.Open(t.Context(), filepath.Join(t.TempDir(), "debtwise.db"))
	require.NoError(t, err)

	t.Cleanup(func() { _ = conn.Close() })

	if migrate {
		_, err = db.Migrate(t.Context(), conn)
		require.NoError(t, err)
	}

	return conn
}

func oneValue() []indexes.Value {
	day := time.Date(2026, time.October, 1, 0, 0, 0, 0, time.UTC)

	return []indexes.Value{{PeriodStart: day, PeriodEnd: day, Value: decimal.MustParse("1"), FetchedAt: day}}
}

// operations calls every Store operation and returns its error.
func operations() map[string]func(context.Context, *indexes.Store) error {
	return map[string]func(context.Context, *indexes.Store) error{
		"save refresh": func(ctx context.Context, s *indexes.Store) error {
			return s.SaveRefresh(ctx, indexes.TR, oneValue(), time.Now())
		},
		"save refresh without values": func(ctx context.Context, s *indexes.Store) error {
			return s.SaveRefresh(ctx, indexes.TR, nil, time.Now())
		},
		"save failure": func(ctx context.Context, s *indexes.Store) error {
			return s.SaveFailure(ctx, indexes.TR, oneValue(), time.Now())
		},
		"history": func(ctx context.Context, s *indexes.Store) error {
			_, err := s.History(ctx, indexes.TR)

			return err
		},
		"latest period start": func(ctx context.Context, s *indexes.Store) error {
			_, err := s.LatestPeriodStart(ctx, indexes.TR)

			return err
		},
		"refresh times": func(ctx context.Context, s *indexes.Store) error {
			_, err := s.RefreshTimes(ctx)

			return err
		},
		"projection methods": func(ctx context.Context, s *indexes.Store) error {
			_, err := s.ProjectionMethods(ctx)

			return err
		},
		"save projection method": func(ctx context.Context, s *indexes.Store) error {
			return s.SaveProjectionMethod(ctx, indexes.ProjectionMethod{Index: indexes.TR, Method: indexes.Trailing60})
		},
		"save expectations": func(ctx context.Context, s *indexes.Store) error {
			return s.SaveExpectations(ctx, indexes.Expectations{}, time.Now())
		},
		"save expectations failure": func(ctx context.Context, s *indexes.Store) error {
			return s.SaveExpectationsFailure(ctx, time.Now())
		},
		"expectations": func(ctx context.Context, s *indexes.Store) error {
			_, err := s.Expectations(ctx)

			return err
		},
		"expectations refresh times": func(ctx context.Context, s *indexes.Store) error {
			_, err := s.ExpectationsRefreshTimes(ctx)

			return err
		},
	}
}

func TestStoreFailsWhenTheDatabaseDoesNotAnswer(t *testing.T) {
	t.Parallel()

	closed := openDatabase(t, true)
	require.NoError(t, closed.Close())

	for name, operation := range operations() {
		t.Run(name, func(t *testing.T) {
			t.Parallel()

			err := operation(t.Context(), indexes.NewStore(closed))
			require.ErrorContains(t, err, "database is closed")
			assert.ErrorContains(t, err, "indexes: ")
		})
	}
}

func TestStoreFailsWithoutItsTables(t *testing.T) {
	t.Parallel()

	unmigrated := openDatabase(t, false)

	for name, operation := range operations() {
		t.Run(name, func(t *testing.T) {
			t.Parallel()

			err := operation(t.Context(), indexes.NewStore(unmigrated))
			require.ErrorContains(t, err, "no such table")
			assert.ErrorContains(t, err, "indexes: ")
		})
	}
}

func TestStoreFailsOnStoredDataItCannotRead(t *testing.T) {
	t.Parallel()

	tests := []struct {
		name      string
		insert    string
		operation string
	}{
		{
			name:      "a value that is not a decimal",
			insert:    `INSERT INTO index_values VALUES ('tr', '2026-10-01', '2026-10-01', 'one', '2026-10-01T00:00:00Z')`,
			operation: "history",
		},
		{
			name:      "a period start that is not a date",
			insert:    `INSERT INTO index_values VALUES ('tr', '01/10/2026', '2026-10-01', '1', '2026-10-01T00:00:00Z')`,
			operation: "latest period start",
		},
		{
			name:      "a refresh time that is not a time",
			insert:    `INSERT INTO index_refreshes VALUES ('tr', 'yesterday', NULL)`,
			operation: "refresh times",
		},
		{
			name:      "a projection method the index is not offered",
			insert:    `INSERT INTO projection_methods VALUES ('tr', 'focus')`,
			operation: "projection methods",
		},
		{
			name:      "a Selic expectation that is not a decimal",
			insert:    `INSERT INTO focus_selic VALUES (2027, 1, 'high', '2026-10-01T00:00:00Z')`,
			operation: "expectations",
		},
		{
			name:      "a monthly IPCA expectation that is not a decimal",
			insert:    `INSERT INTO focus_ipca_monthly VALUES ('2027-01-01', 'high', '2026-10-01T00:00:00Z')`,
			operation: "expectations",
		},
		{
			name:      "a monthly IPCA expectation month that is not a date",
			insert:    `INSERT INTO focus_ipca_monthly VALUES ('01/2027', '0.4', '2026-10-01T00:00:00Z')`,
			operation: "expectations",
		},
		{
			name:      "an annual IPCA expectation that is not a decimal",
			insert:    `INSERT INTO focus_ipca_annual VALUES (2027, 'high', '2026-10-01T00:00:00Z')`,
			operation: "expectations",
		},
		{
			name:      "an expectations refresh time that is not a time",
			insert:    `INSERT INTO focus_refreshes VALUES (1, 'yesterday', NULL)`,
			operation: "expectations refresh times",
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			t.Parallel()

			conn := openDatabase(t, true)
			_, err := conn.ExecContext(t.Context(), tt.insert)
			require.NoError(t, err)

			err = operations()[tt.operation](t.Context(), indexes.NewStore(conn))
			assert.ErrorContains(t, err, "indexes: ")
		})
	}
}
