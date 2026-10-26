-- name: DeleteBondQuotes :exec
DELETE FROM bond_quotes;

-- name: InsertBondQuote :exec
INSERT INTO bond_quotes (type, maturity, buy_rate, buy_unit_price, sell_rate, sell_unit_price, fetched_at)
VALUES (?, ?, ?, ?, ?, ?, ?);

-- name: ListBondQuotes :many
SELECT type, maturity, buy_rate, buy_unit_price, sell_rate, sell_unit_price, fetched_at
FROM bond_quotes
ORDER BY CASE type WHEN 'ltn' THEN 0 WHEN 'ntn_f' THEN 1 WHEN 'ntn_b_principal' THEN 2 ELSE 3 END, maturity;

-- name: RecordBondQuotesRefreshed :exec
INSERT INTO bond_quote_refreshes (id, refreshed_at)
VALUES (1, ?)
ON CONFLICT (id) DO UPDATE SET refreshed_at = excluded.refreshed_at, failed_at = NULL;

-- name: RecordBondQuotesFailed :exec
INSERT INTO bond_quote_refreshes (id, failed_at)
VALUES (1, ?)
ON CONFLICT (id) DO UPDATE SET failed_at = excluded.failed_at;

-- name: ListBondQuoteRefreshes :many
SELECT refreshed_at, failed_at
FROM bond_quote_refreshes;
