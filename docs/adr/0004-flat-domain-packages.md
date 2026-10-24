# Flat domain packages in a backend module

The Go code is one module rooted at `backend/`, next to `frontend/`, with a root `go.work` that uses
it. Inside the module, each domain gets its own top-level package named for what it does: `decimal`,
`calendar`, `db`, `indexes`, `bonds`, `mortgage`, `comparison`, `marketdata`, `api` and `config`.
`cmd/server` only wires them together. Imports point one way, and nothing imports `cmd`. Keeping the
module out of the repo root stops Go tooling from walking `frontend/node_modules`, and keeps the
server's build context small.

## Considered Options

- **Clean Architecture or DDD layers** (`service/`, `repository/`, `domain/`): rejected. In Go they
  produce import cycles and interfaces nobody needs, and a layer name doesn't say what the code does.
- **A store per domain:** rejected. `db` owns the schema, the embedded migrations and every sqlc
  query. `indexes`, `bonds` and `mortgage` import it to persist their own data. `decimal`,
  `calendar` and `comparison` never touch it.
- **No sub-packages at all:** the one exception is `marketdata`. Its sources, `marketdata/sgs`,
  `marketdata/focus` and `marketdata/radar`, are variants of one concept, an external market-data
  source. They know nothing of DebtWise or of `marketdata`, which owns the refresh job that calls
  them.
- **`internal/`, and `utils`, `helpers` or `common` packages:** not used.
