-- The bonds on Tesouro Direto's catalogue with their latest quotes, and the outcome of refreshing
-- them. Dates are YYYY-MM-DD, times RFC 3339 in UTC, and rates and prices decimal strings, so they
-- round-trip exactly.

-- +goose Up
CREATE TABLE bond_quotes (
    type            TEXT NOT NULL CHECK (type IN ('ltn', 'ntn_f')),
    maturity        TEXT NOT NULL,
    buy_rate        TEXT,
    buy_unit_price  TEXT,
    sell_rate       TEXT NOT NULL,
    sell_unit_price TEXT NOT NULL,
    fetched_at      TEXT NOT NULL,
    PRIMARY KEY (type, maturity),
    CHECK ((buy_rate IS NULL) = (buy_unit_price IS NULL))
) STRICT;

CREATE TABLE bond_quote_refreshes (
    id           INTEGER PRIMARY KEY CHECK (id = 1),
    refreshed_at TEXT,
    failed_at    TEXT
) STRICT;

-- +goose Down
DROP TABLE bond_quote_refreshes;
DROP TABLE bond_quotes;
