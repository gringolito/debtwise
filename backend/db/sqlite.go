package db

import (
	"context"
	"database/sql"
	"embed"
	"fmt"
	"io/fs"
	"net/url"

	"github.com/pressly/goose/v3"
	_ "modernc.org/sqlite" // Registers the pure-Go "sqlite" driver (ADR-0002).
)

//go:embed migrations/*.sql
var embeddedMigrations embed.FS

// pragmas run on every connection the pool opens: cache_size is 40 MB, mmap_size 256 MB.
const pragmas = "_pragma=foreign_keys(1)" +
	"&_pragma=busy_timeout(5000)" +
	"&_pragma=journal_mode(WAL)" +
	"&_pragma=cache_size(-40000)" +
	"&_pragma=mmap_size(268435456)" +
	"&_pragma=temp_store(MEMORY)"

// Open opens the SQLite file at path, creating it when it does not exist, and checks that it
// answers.
func Open(ctx context.Context, path string) (*sql.DB, error) {
	dsn := (&url.URL{Scheme: "file", Opaque: path, RawQuery: pragmas}).String()

	conn, err := sql.Open("sqlite", dsn)
	if err != nil {
		return nil, fmt.Errorf("db: open %s: %w", path, err)
	}

	if err := conn.PingContext(ctx); err != nil {
		_ = conn.Close()

		return nil, fmt.Errorf("db: open %s: %w", path, err)
	}

	return conn, nil
}

// Migrate applies every embedded migration the database has not run yet and returns the
// versions it applied, oldest first.
func Migrate(ctx context.Context, conn *sql.DB) ([]int64, error) {
	migrations, err := fs.Sub(embeddedMigrations, "migrations")
	if err != nil {
		return nil, fmt.Errorf("db: migrations: %w", err)
	}

	provider, err := goose.NewProvider(goose.DialectSQLite3, conn, migrations)
	if err != nil {
		return nil, fmt.Errorf("db: migrations: %w", err)
	}

	results, err := provider.Up(ctx)
	if err != nil {
		return nil, fmt.Errorf("db: migrate up: %w", err)
	}

	applied := make([]int64, 0, len(results))
	for _, result := range results {
		applied = append(applied, result.Source.Version)
	}

	return applied, nil
}
