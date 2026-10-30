package db_test

import (
	"os"
	"path/filepath"
	"testing"

	"github.com/pressly/goose/v3"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"github.com/gringolito/debtwise/backend/db"
)

func TestMigrateAppliesPendingMigrationsOnce(t *testing.T) {
	t.Parallel()

	path := filepath.Join(t.TempDir(), "debtwise.db")

	conn, err := db.Open(t.Context(), path)
	require.NoError(t, err)

	applied, err := db.Migrate(t.Context(), conn)
	require.NoError(t, err)
	assert.Equal(t, []int64{1, 2, 3, 4, 5, 6, 7, 8, 9}, applied)
	require.NoError(t, conn.Close())

	reopened, err := db.Open(t.Context(), path)
	require.NoError(t, err)

	t.Cleanup(func() { _ = reopened.Close() })

	applied, err = db.Migrate(t.Context(), reopened)
	require.NoError(t, err)
	assert.Empty(t, applied)
}

// A mortgage registered before mortgages had an indexer is a fixed-rate one.
func TestMigrationMakesExistingMortgagesFixedRate(t *testing.T) {
	t.Parallel()

	conn, err := db.Open(t.Context(), filepath.Join(t.TempDir(), "debtwise.db"))
	require.NoError(t, err)

	t.Cleanup(func() { _ = conn.Close() })

	provider, err := goose.NewProvider(goose.DialectSQLite3, conn, os.DirFS("migrations"))
	require.NoError(t, err)

	_, err = provider.UpTo(t.Context(), 3)
	require.NoError(t, err)

	_, err = conn.ExecContext(t.Context(), `INSERT INTO mortgages (
		contract_date, original_amount, term_months, first_installment_date, amortization_system, appraisal_value
	) VALUES ('2023-12-10', '60000.00', 6, '2024-01-10', 'sac', '100000.00')`)
	require.NoError(t, err)

	applied, err := db.Migrate(t.Context(), conn)
	require.NoError(t, err)
	assert.Equal(t, []int64{4, 5, 6, 7, 8, 9}, applied)

	var indexer string
	require.NoError(t, conn.QueryRowContext(t.Context(), "SELECT indexer FROM mortgages").Scan(&indexer))
	assert.Equal(t, "none", indexer)
}

// The poupança yield no longer corrects a mortgage: one it corrected is corrected by TR, and its
// contract rates add the poupança yield's additional part, which is what the yield added to TR. No
// mortgage can be stored with it as its indexer any more.
func TestMigrationMovesThePoupancaYieldFromTheIndexerToTheContractRates(t *testing.T) {
	t.Parallel()

	conn, err := db.Open(t.Context(), filepath.Join(t.TempDir(), "debtwise.db"))
	require.NoError(t, err)

	t.Cleanup(func() { _ = conn.Close() })

	provider, err := goose.NewProvider(goose.DialectSQLite3, conn, os.DirFS("migrations"))
	require.NoError(t, err)

	_, err = provider.UpTo(t.Context(), 8)
	require.NoError(t, err)

	_, err = conn.ExecContext(t.Context(), `INSERT INTO mortgages (
		id, contract_date, original_amount, term_months, first_installment_date, amortization_system, indexer, appraisal_value
	) VALUES
		(1, '2023-12-10', '60000.00', 6, '2024-01-10', 'sac', 'poupanca_yield', '100000.00'),
		(2, '2023-12-10', '60000.00', 6, '2024-01-10', 'sac', 'ipca', '100000.00');
	INSERT INTO mortgage_contract_rates (mortgage_id, effective_from, rate, basis) VALUES
		(1, '2023-12-10', '0.0389', 'effective'),
		(1, '2025-12-10', '0.0289', 'effective'),
		(2, '2023-12-10', '0.06', 'effective');`)
	require.NoError(t, err)

	applied, err := db.Migrate(t.Context(), conn)
	require.NoError(t, err)
	assert.Equal(t, []int64{9}, applied)

	var indexers []string

	rows, err := conn.QueryContext(t.Context(), "SELECT indexer FROM mortgages ORDER BY id")
	require.NoError(t, err)

	for rows.Next() {
		var indexer string
		require.NoError(t, rows.Scan(&indexer))
		indexers = append(indexers, indexer)
	}

	require.NoError(t, rows.Err())
	assert.Equal(t, []string{"tr", "ipca"}, indexers)

	var flagged []string

	rows, err = conn.QueryContext(t.Context(), `SELECT mortgage_id || ' ' || effective_from || ' ' || poupanca_additional
		FROM mortgage_contract_rates ORDER BY mortgage_id, effective_from`)
	require.NoError(t, err)

	for rows.Next() {
		var row string
		require.NoError(t, rows.Scan(&row))
		flagged = append(flagged, row)
	}

	require.NoError(t, rows.Err())
	assert.Equal(t, []string{"1 2023-12-10 1", "1 2025-12-10 1", "2 2023-12-10 0"}, flagged)

	_, err = conn.ExecContext(t.Context(), "UPDATE mortgages SET indexer = 'poupanca_yield' WHERE id = 2")
	require.ErrorContains(t, err, "CHECK constraint failed")
}

func TestMigratedFileIsADebtWiseDatabase(t *testing.T) {
	t.Parallel()

	conn, err := db.Open(t.Context(), filepath.Join(t.TempDir(), "debtwise.db"))
	require.NoError(t, err)

	t.Cleanup(func() { _ = conn.Close() })

	_, err = db.Migrate(t.Context(), conn)
	require.NoError(t, err)

	var applicationID int64
	require.NoError(t, conn.QueryRowContext(t.Context(), "PRAGMA application_id").Scan(&applicationID))
	assert.Equal(t, int64(0x44425753), applicationID)
}

func TestPingAnswersOnAnOpenDatabase(t *testing.T) {
	t.Parallel()

	conn, err := db.Open(t.Context(), filepath.Join(t.TempDir(), "debtwise.db"))
	require.NoError(t, err)

	t.Cleanup(func() { _ = conn.Close() })

	got, err := db.New(conn).Ping(t.Context())
	require.NoError(t, err)
	assert.Equal(t, int64(1), got)
}

func TestOpenSetsThePragmasOnEveryConnection(t *testing.T) {
	t.Parallel()

	pool, err := db.Open(t.Context(), filepath.Join(t.TempDir(), "debtwise.db"))
	require.NoError(t, err)

	t.Cleanup(func() { _ = pool.Close() })

	want := map[string]string{
		"journal_mode": "wal",
		"foreign_keys": "1",
		"busy_timeout": "5000",
		"cache_size":   "-40000",
		"mmap_size":    "268435456",
		"temp_store":   "2",
	}

	// Held together, so the pool has to open a second connection.
	for range 2 {
		conn, err := pool.Conn(t.Context())
		require.NoError(t, err)

		t.Cleanup(func() { _ = conn.Close() })

		got := make(map[string]string, len(want))
		for pragma := range want {
			var value string
			require.NoError(t, conn.QueryRowContext(t.Context(), "PRAGMA "+pragma).Scan(&value))
			got[pragma] = value
		}

		assert.Equal(t, want, got)
	}
}

func TestOpenFailsWhenTheFileCannotBeCreated(t *testing.T) {
	t.Parallel()

	_, err := db.Open(t.Context(), filepath.Join(t.TempDir(), "missing", "debtwise.db"))
	require.Error(t, err)
}
