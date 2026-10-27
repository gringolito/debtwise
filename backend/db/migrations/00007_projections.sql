-- The projection method the owner chose for each projected index, and the latest BCB Focus median
-- expectations with the outcome of refreshing them. Dates are YYYY-MM-DD, times RFC 3339 in UTC, and
-- medians decimal strings, so they round-trip exactly.

-- +goose Up
CREATE TABLE projection_methods (
    series TEXT PRIMARY KEY CHECK (series IN ('tr', 'selic_target', 'ipca')),
    method TEXT NOT NULL CHECK (method IN ('trailing_12', 'trailing_60', 'focus'))
) STRICT;

CREATE TABLE focus_selic (
    year       INTEGER NOT NULL,
    meeting    INTEGER NOT NULL,
    median     TEXT NOT NULL,
    fetched_at TEXT NOT NULL,
    PRIMARY KEY (year, meeting)
) STRICT;

CREATE TABLE focus_ipca_monthly (
    month      TEXT PRIMARY KEY,
    median     TEXT NOT NULL,
    fetched_at TEXT NOT NULL
) STRICT;

CREATE TABLE focus_ipca_annual (
    year       INTEGER PRIMARY KEY,
    median     TEXT NOT NULL,
    fetched_at TEXT NOT NULL
) STRICT;

CREATE TABLE focus_refreshes (
    id           INTEGER PRIMARY KEY CHECK (id = 1),
    refreshed_at TEXT,
    failed_at    TEXT
) STRICT;

-- +goose Down
DROP TABLE focus_refreshes;
DROP TABLE focus_ipca_annual;
DROP TABLE focus_ipca_monthly;
DROP TABLE focus_selic;
DROP TABLE projection_methods;
