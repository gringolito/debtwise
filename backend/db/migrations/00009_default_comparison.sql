-- The amount and the effect of the prepayment Início's answer weighs against investing, once the
-- owner changes them. The amount is a decimal string, so it round-trips exactly.

-- +goose Up
CREATE TABLE default_comparison (
    id     INTEGER PRIMARY KEY CHECK (id = 1),
    amount TEXT NOT NULL,
    effect TEXT NOT NULL CHECK (effect IN ('shorten_term', 'lower_installment'))
) STRICT;

-- +goose Down
DROP TABLE default_comparison;
