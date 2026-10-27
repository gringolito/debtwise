-- The prepayments the owner made on the mortgage and the statements the bank issued for it. Dates
-- are ISO 8601 (YYYY-MM-DD) and decimals are text, so both round-trip exactly.

-- +goose Up
CREATE TABLE mortgage_prepayments (
    id          INTEGER PRIMARY KEY,
    mortgage_id INTEGER NOT NULL REFERENCES mortgages (id) ON DELETE CASCADE,
    date        TEXT    NOT NULL,
    amount      TEXT    NOT NULL,
    effect      TEXT    NOT NULL CHECK (effect IN ('shorten_term', 'lower_installment'))
) STRICT;

CREATE INDEX mortgage_prepayments_by_date ON mortgage_prepayments (mortgage_id, date);

CREATE TABLE mortgage_statements (
    id                  INTEGER PRIMARY KEY,
    mortgage_id         INTEGER NOT NULL REFERENCES mortgages (id) ON DELETE CASCADE,
    date                TEXT    NOT NULL,
    outstanding_balance TEXT    NOT NULL,
    UNIQUE (mortgage_id, date)
) STRICT;

-- +goose Down
DROP TABLE mortgage_statements;
DROP INDEX mortgage_prepayments_by_date;
DROP TABLE mortgage_prepayments;
