-- The owner's mortgage and its effective-dated rate and fee rows. Dates are ISO 8601 (YYYY-MM-DD)
-- and decimals are text, so both round-trip exactly.

-- +goose Up
CREATE TABLE mortgages (
    id                     INTEGER PRIMARY KEY,
    contract_date          TEXT    NOT NULL,
    original_amount        TEXT    NOT NULL,
    term_months            INTEGER NOT NULL,
    first_installment_date TEXT    NOT NULL,
    amortization_system    TEXT    NOT NULL CHECK (amortization_system IN ('sac', 'price')),
    appraisal_value        TEXT    NOT NULL
) STRICT;

CREATE TABLE mortgage_contract_rates (
    mortgage_id    INTEGER NOT NULL REFERENCES mortgages (id) ON DELETE CASCADE,
    effective_from TEXT    NOT NULL,
    rate           TEXT    NOT NULL,
    basis          TEXT    NOT NULL CHECK (basis IN ('nominal', 'effective')),
    PRIMARY KEY (mortgage_id, effective_from)
) STRICT;

CREATE TABLE mortgage_mip_rates (
    mortgage_id    INTEGER NOT NULL REFERENCES mortgages (id) ON DELETE CASCADE,
    effective_from TEXT    NOT NULL,
    rate           TEXT    NOT NULL,
    PRIMARY KEY (mortgage_id, effective_from)
) STRICT;

CREATE TABLE mortgage_dfi_rates (
    mortgage_id    INTEGER NOT NULL REFERENCES mortgages (id) ON DELETE CASCADE,
    effective_from TEXT    NOT NULL,
    rate           TEXT    NOT NULL,
    PRIMARY KEY (mortgage_id, effective_from)
) STRICT;

CREATE TABLE mortgage_fees (
    mortgage_id    INTEGER NOT NULL REFERENCES mortgages (id) ON DELETE CASCADE,
    effective_from TEXT    NOT NULL,
    amount         TEXT    NOT NULL,
    PRIMARY KEY (mortgage_id, effective_from)
) STRICT;

-- +goose Down
DROP TABLE mortgage_fees;
DROP TABLE mortgage_dfi_rates;
DROP TABLE mortgage_mip_rates;
DROP TABLE mortgage_contract_rates;
DROP TABLE mortgages;
