-- name: FindMortgage :one
SELECT * FROM mortgages ORDER BY id LIMIT 1;

-- name: InsertMortgage :one
INSERT INTO mortgages (
    contract_date, original_amount, term_months, first_installment_date, amortization_system,
    indexer, appraisal_value
) VALUES (?, ?, ?, ?, ?, ?, ?)
RETURNING id;

-- name: UpdateMortgage :exec
UPDATE mortgages
SET contract_date = ?, original_amount = ?, term_months = ?, first_installment_date = ?,
    amortization_system = ?, indexer = ?, appraisal_value = ?
WHERE id = ?;

-- name: DeleteMortgages :execrows
DELETE FROM mortgages;

-- name: ListMortgageContractRates :many
SELECT effective_from, rate, basis, poupanca_additional FROM mortgage_contract_rates
WHERE mortgage_id = ? ORDER BY effective_from;

-- name: InsertMortgageContractRate :exec
INSERT INTO mortgage_contract_rates (mortgage_id, effective_from, rate, basis, poupanca_additional)
VALUES (?, ?, ?, ?, ?);

-- name: DeleteMortgageContractRates :exec
DELETE FROM mortgage_contract_rates WHERE mortgage_id = ?;

-- name: ListMortgageMIPRates :many
SELECT effective_from, rate FROM mortgage_mip_rates WHERE mortgage_id = ? ORDER BY effective_from;

-- name: InsertMortgageMIPRate :exec
INSERT INTO mortgage_mip_rates (mortgage_id, effective_from, rate) VALUES (?, ?, ?);

-- name: DeleteMortgageMIPRates :exec
DELETE FROM mortgage_mip_rates WHERE mortgage_id = ?;

-- name: ListMortgageDFIRates :many
SELECT effective_from, rate FROM mortgage_dfi_rates WHERE mortgage_id = ? ORDER BY effective_from;

-- name: InsertMortgageDFIRate :exec
INSERT INTO mortgage_dfi_rates (mortgage_id, effective_from, rate) VALUES (?, ?, ?);

-- name: DeleteMortgageDFIRates :exec
DELETE FROM mortgage_dfi_rates WHERE mortgage_id = ?;

-- name: ListMortgageFees :many
SELECT effective_from, amount FROM mortgage_fees WHERE mortgage_id = ? ORDER BY effective_from;

-- name: InsertMortgageFee :exec
INSERT INTO mortgage_fees (mortgage_id, effective_from, amount) VALUES (?, ?, ?);

-- name: DeleteMortgageFees :exec
DELETE FROM mortgage_fees WHERE mortgage_id = ?;

-- name: ListMortgagePrepayments :many
SELECT id, date, amount, effect FROM mortgage_prepayments WHERE mortgage_id = ? ORDER BY date, id;

-- name: InsertMortgagePrepayment :one
INSERT INTO mortgage_prepayments (mortgage_id, date, amount, effect) VALUES (?, ?, ?, ?) RETURNING id;

-- name: UpdateMortgagePrepayment :execrows
UPDATE mortgage_prepayments SET date = ?, amount = ?, effect = ? WHERE id = ? AND mortgage_id = ?;

-- name: DeleteMortgagePrepayment :execrows
DELETE FROM mortgage_prepayments WHERE id = ? AND mortgage_id = ?;

-- name: ListMortgageStatements :many
SELECT id, date, outstanding_balance FROM mortgage_statements WHERE mortgage_id = ? ORDER BY date;

-- name: FindMortgageStatementOn :one
SELECT id FROM mortgage_statements WHERE mortgage_id = ? AND date = ?;

-- name: InsertMortgageStatement :one
INSERT INTO mortgage_statements (mortgage_id, date, outstanding_balance) VALUES (?, ?, ?) RETURNING id;

-- name: UpdateMortgageStatement :execrows
UPDATE mortgage_statements SET date = ?, outstanding_balance = ? WHERE id = ? AND mortgage_id = ?;

-- name: DeleteMortgageStatement :execrows
DELETE FROM mortgage_statements WHERE id = ? AND mortgage_id = ?;
