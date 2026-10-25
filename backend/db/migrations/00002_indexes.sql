-- Published index history and the outcome of refreshing it. Dates are YYYY-MM-DD, times RFC 3339
-- in UTC, and values decimal strings, so they round-trip exactly.

-- +goose Up
CREATE TABLE index_values (
    series       TEXT NOT NULL,
    period_start TEXT NOT NULL,
    period_end   TEXT NOT NULL,
    value        TEXT NOT NULL,
    fetched_at   TEXT NOT NULL,
    PRIMARY KEY (series, period_start, period_end)
) WITHOUT ROWID;

CREATE TABLE index_refreshes (
    series       TEXT PRIMARY KEY,
    refreshed_at TEXT,
    failed_at    TEXT
) WITHOUT ROWID;

-- +goose Down
DROP TABLE index_refreshes;
DROP TABLE index_values;
