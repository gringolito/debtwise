-- name: ListLots :many
SELECT id, bond_type, maturity, purchase_date, rate, unit_price, quantity
FROM lots
ORDER BY purchase_date, id;

-- name: InsertLot :one
INSERT INTO lots (bond_type, maturity, purchase_date, rate, unit_price, quantity)
VALUES (?, ?, ?, ?, ?, ?)
RETURNING id;

-- name: UpdateLot :execrows
UPDATE lots
SET bond_type = ?, maturity = ?, purchase_date = ?, rate = ?, unit_price = ?, quantity = ?
WHERE id = ?;

-- name: DeleteLot :execrows
DELETE FROM lots WHERE id = ?;

-- name: ListIncomeTaxRates :many
SELECT effective_from, min_days, rate FROM income_tax_rates ORDER BY effective_from, min_days;

-- name: ListIOFRates :many
SELECT effective_from, days, rate FROM iof_rates ORDER BY effective_from, days;

-- name: ListCustodyFeeRates :many
SELECT effective_from, rate FROM custody_fee_rates ORDER BY effective_from;
