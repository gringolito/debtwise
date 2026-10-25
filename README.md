# DebtWise

DebtWise helps you make smarter mortgage decisions by comparing the benefits of paying off your loan
early versus investing your extra cash and paying it off later.

## Running it

Start DebtWise with the distributed compose file, then open http://localhost:8000:

```sh
docker compose -f deploy/compose.yaml up -d
```

All data lives in one SQLite file on the `debtwise-data` volume. The server applies pending
database migrations when it starts. Set `DEBTWISE_PORT` to serve on another port.

The compose file runs the `docker.io/gringolito/debtwise-server:edge` and
`docker.io/gringolito/debtwise-web:edge` images. `mise run build:image:all` builds both from
source under those names.

## Development

`mise install` provisions the toolchain and `mise tasks` lists the tasks. `mise run local:up` runs
the API and the frontend host-native, and `mise run check` runs the pull request checks.
