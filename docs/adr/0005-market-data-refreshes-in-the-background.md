# Market data refreshes in the background

The server refreshes market data itself, in a job that runs inside the server process: once at
startup, then on a fixed interval, and whenever the UI asks for it. Asking for a refresh only
queues one; the API answers at once, and the UI polls the refresh status until the refresh ends.
A first backfill reads years of daily rows from BCB's SGS, whose gateway can take half a minute per
request, so a refresh can outlast any reasonable HTTP write timeout. Each index records when it was
last refreshed and whether its latest refresh failed, so the UI can warn about stale or failed data
after a restart too.

Values are stored as fetched, keyed by index, period start and period end. A value its source dates
by a single day or month gets the same start and end, so the key never holds a NULL and refreshing a
period again replaces its value instead of adding a row.

## Considered Options

- **A refresh answered when it ends:** rejected. A cold backfill exceeds the server's write timeout,
  and a client that gives up would leave the refresh running unseen.
- **A separate scheduler process or a cron container:** rejected. One owner and one SQLite file
  (ADR-0002) need no second process, and the job shares the server's database connection.
- **Refresh status kept only in memory:** rejected. A restart would forget that the latest refresh
  failed.
