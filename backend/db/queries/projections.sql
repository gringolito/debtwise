-- name: UpsertProjectionMethod :exec
INSERT INTO projection_methods (series, method)
VALUES (?, ?)
ON CONFLICT (series) DO UPDATE SET method = excluded.method;

-- name: ListProjectionMethods :many
SELECT series, method
FROM projection_methods;

-- name: DeleteFocusSelic :exec
DELETE FROM focus_selic;

-- name: InsertFocusSelic :exec
INSERT INTO focus_selic (year, meeting, median, fetched_at)
VALUES (?, ?, ?, ?);

-- name: ListFocusSelic :many
SELECT year, meeting, median
FROM focus_selic
ORDER BY year, meeting;

-- name: DeleteFocusIPCAMonthly :exec
DELETE FROM focus_ipca_monthly;

-- name: InsertFocusIPCAMonthly :exec
INSERT INTO focus_ipca_monthly (month, median, fetched_at)
VALUES (?, ?, ?);

-- name: ListFocusIPCAMonthly :many
SELECT month, median
FROM focus_ipca_monthly
ORDER BY month;

-- name: DeleteFocusIPCAAnnual :exec
DELETE FROM focus_ipca_annual;

-- name: InsertFocusIPCAAnnual :exec
INSERT INTO focus_ipca_annual (year, median, fetched_at)
VALUES (?, ?, ?);

-- name: ListFocusIPCAAnnual :many
SELECT year, median
FROM focus_ipca_annual
ORDER BY year;

-- name: RecordFocusRefreshed :exec
INSERT INTO focus_refreshes (id, refreshed_at)
VALUES (1, ?)
ON CONFLICT (id) DO UPDATE SET refreshed_at = excluded.refreshed_at, failed_at = NULL;

-- name: RecordFocusFailed :exec
INSERT INTO focus_refreshes (id, failed_at)
VALUES (1, ?)
ON CONFLICT (id) DO UPDATE SET failed_at = excluded.failed_at;

-- name: ListFocusRefreshes :many
SELECT refreshed_at, failed_at
FROM focus_refreshes;
