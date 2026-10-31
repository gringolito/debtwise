-- The index a mortgage corrects its outstanding balance by. Mortgages registered before it are
-- fixed-rate.

-- +goose Up
ALTER TABLE mortgages ADD COLUMN indexer TEXT NOT NULL DEFAULT 'none'
    CHECK (indexer IN ('none', 'tr', 'ipca'));

-- +goose Down
ALTER TABLE mortgages DROP COLUMN indexer;
