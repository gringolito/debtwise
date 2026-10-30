-- A contract rate can add the poupança yield's additional part to its fixed part, and the poupança
-- yield no longer corrects a mortgage. A mortgage it corrected is corrected by TR, and its rates add
-- the additional part, which is what the yield added to TR. SQLite can't change a CHECK constraint,
-- so the indexer column is replaced.

-- +goose Up
ALTER TABLE mortgage_contract_rates ADD COLUMN poupanca_additional INTEGER NOT NULL DEFAULT 0
    CHECK (poupanca_additional IN (0, 1));

UPDATE mortgage_contract_rates SET poupanca_additional = 1
WHERE mortgage_id IN (SELECT id FROM mortgages WHERE indexer = 'poupanca_yield');

ALTER TABLE mortgages RENAME COLUMN indexer TO replaced_indexer;
ALTER TABLE mortgages ADD COLUMN indexer TEXT NOT NULL DEFAULT 'none'
    CHECK (indexer IN ('none', 'tr', 'ipca'));
UPDATE mortgages
SET indexer = CASE replaced_indexer WHEN 'poupanca_yield' THEN 'tr' ELSE replaced_indexer END;
ALTER TABLE mortgages DROP COLUMN replaced_indexer;

-- +goose Down
ALTER TABLE mortgages RENAME COLUMN indexer TO replaced_indexer;
ALTER TABLE mortgages ADD COLUMN indexer TEXT NOT NULL DEFAULT 'none'
    CHECK (indexer IN ('none', 'tr', 'poupanca_yield', 'ipca'));
UPDATE mortgages SET indexer = replaced_indexer;
ALTER TABLE mortgages DROP COLUMN replaced_indexer;

ALTER TABLE mortgage_contract_rates DROP COLUMN poupanca_additional;
