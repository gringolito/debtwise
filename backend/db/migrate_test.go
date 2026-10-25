package db_test

import (
	"path/filepath"
	"testing"

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
	assert.Equal(t, []int64{1, 2}, applied)
	require.NoError(t, conn.Close())

	reopened, err := db.Open(t.Context(), path)
	require.NoError(t, err)

	t.Cleanup(func() { _ = reopened.Close() })

	applied, err = db.Migrate(t.Context(), reopened)
	require.NoError(t, err)
	assert.Empty(t, applied)
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
