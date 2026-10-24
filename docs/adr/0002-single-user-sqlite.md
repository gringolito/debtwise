# Single-user, self-hosted, on SQLite

DebtWise starts as a self-hosted tool for one owner, with no accounts or authentication, and stores
its data in SQLite through the pure-Go `modernc.org/sqlite` driver with goose migrations and sqlc.
One owner needs no database server. A pure-Go driver keeps cgo out of the build, so multi-arch images
stay simple. The schema keeps a single implicit owner, so multi-user support can be added later
without reshaping the data.
