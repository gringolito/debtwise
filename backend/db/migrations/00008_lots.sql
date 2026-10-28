-- The lots the owner bought, and the income tax, IOF and custody fee tables their valuation reads,
-- each row of which is in effect from its date on: a change of rate adds a dated row. Dates are
-- YYYY-MM-DD, and rates, prices and quantities decimal strings, so they round-trip exactly.

-- +goose Up
CREATE TABLE lots (
    id            INTEGER PRIMARY KEY,
    bond_type     TEXT NOT NULL CHECK (bond_type IN ('ltn', 'ntn_f', 'ntn_b_principal', 'ntn_b')),
    maturity      TEXT NOT NULL,
    purchase_date TEXT NOT NULL,
    rate          TEXT NOT NULL,
    unit_price    TEXT NOT NULL,
    quantity      TEXT NOT NULL
) STRICT;

CREATE INDEX lots_by_purchase_date ON lots (purchase_date, id);

-- The income tax rate on the gain of an event at least min_days calendar days after the purchase
-- settled. Seeded with Lei 11.033/2004's regressive table, in effect from 2005-01-01.
CREATE TABLE income_tax_rates (
    effective_from TEXT    NOT NULL,
    min_days       INTEGER NOT NULL CHECK (min_days >= 0),
    rate           TEXT    NOT NULL,
    PRIMARY KEY (effective_from, min_days)
) STRICT;

INSERT INTO income_tax_rates (effective_from, min_days, rate) VALUES
    ('2005-01-01', 0, '0.225'),
    ('2005-01-01', 181, '0.20'),
    ('2005-01-01', 361, '0.175'),
    ('2005-01-01', 721, '0.15');

-- The IOF rate on the gain of an event exactly days calendar days after the purchase settled.
-- Seeded with Decreto 6.306/2007's regressive table, in effect from 2008-01-01.
CREATE TABLE iof_rates (
    effective_from TEXT    NOT NULL,
    days           INTEGER NOT NULL CHECK (days >= 1),
    rate           TEXT    NOT NULL,
    PRIMARY KEY (effective_from, days)
) STRICT;

INSERT INTO iof_rates (effective_from, days, rate) VALUES
    ('2008-01-01', 1, '0.96'),
    ('2008-01-01', 2, '0.93'),
    ('2008-01-01', 3, '0.90'),
    ('2008-01-01', 4, '0.86'),
    ('2008-01-01', 5, '0.83'),
    ('2008-01-01', 6, '0.80'),
    ('2008-01-01', 7, '0.76'),
    ('2008-01-01', 8, '0.73'),
    ('2008-01-01', 9, '0.70'),
    ('2008-01-01', 10, '0.66'),
    ('2008-01-01', 11, '0.63'),
    ('2008-01-01', 12, '0.60'),
    ('2008-01-01', 13, '0.56'),
    ('2008-01-01', 14, '0.53'),
    ('2008-01-01', 15, '0.50'),
    ('2008-01-01', 16, '0.46'),
    ('2008-01-01', 17, '0.43'),
    ('2008-01-01', 18, '0.40'),
    ('2008-01-01', 19, '0.36'),
    ('2008-01-01', 20, '0.33'),
    ('2008-01-01', 21, '0.30'),
    ('2008-01-01', 22, '0.26'),
    ('2008-01-01', 23, '0.23'),
    ('2008-01-01', 24, '0.20'),
    ('2008-01-01', 25, '0.16'),
    ('2008-01-01', 26, '0.13'),
    ('2008-01-01', 27, '0.10'),
    ('2008-01-01', 28, '0.06'),
    ('2008-01-01', 29, '0.03');

-- The yearly custody fee B3 charges on the bonds held, accrued daily.
CREATE TABLE custody_fee_rates (
    effective_from TEXT PRIMARY KEY,
    rate           TEXT NOT NULL
) STRICT;

INSERT INTO custody_fee_rates (effective_from, rate) VALUES
    ('2020-01-01', '0.0025'),
    ('2022-01-01', '0.0020');

-- +goose Down
DROP TABLE custody_fee_rates;
DROP TABLE iof_rates;
DROP TABLE income_tax_rates;
DROP INDEX lots_by_purchase_date;
DROP TABLE lots;
