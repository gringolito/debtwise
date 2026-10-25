-- name: UpsertIndexValue :exec
INSERT INTO index_values (series, period_start, period_end, value, fetched_at)
VALUES (?, ?, ?, ?, ?)
ON CONFLICT (series, period_start, period_end)
DO UPDATE SET value = excluded.value, fetched_at = excluded.fetched_at;

-- name: ListIndexValues :many
SELECT period_start, period_end, value, fetched_at
FROM index_values
WHERE series = ?
ORDER BY period_start, period_end;

-- name: LatestIndexPeriodStart :one
SELECT CAST(COALESCE(MAX(period_start), '') AS TEXT) AS period_start
FROM index_values
WHERE series = ?;

-- name: RecordIndexRefreshed :exec
INSERT INTO index_refreshes (series, refreshed_at)
VALUES (?, ?)
ON CONFLICT (series) DO UPDATE SET refreshed_at = excluded.refreshed_at, failed_at = NULL;

-- name: RecordIndexFailed :exec
INSERT INTO index_refreshes (series, failed_at)
VALUES (?, ?)
ON CONFLICT (series) DO UPDATE SET failed_at = excluded.failed_at;

-- name: ListIndexRefreshes :many
SELECT series, refreshed_at, failed_at
FROM index_refreshes;
