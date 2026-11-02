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

Current bond prices come from one of two APIs. The server picks the one whose credential is set:

- [Radar Opções](https://radaropcoes.com): generate a token on your Radar Opções profile and set
  `RADAR_TOKEN` to it.
- Tesouro Indireto: set `TESOURO_INDIRETO_URL` to the API's base URL and `TESOURO_INDIRETO_API_KEY`
  to your API key. The URL has no default.

Set exactly one of `RADAR_TOKEN` and `TESOURO_INDIRETO_API_KEY`. The server refuses to start with
both or neither, or with only one of the two Tesouro Indireto settings.

The compose file runs the `ghcr.io/gringolito/debtwise/server:edge` and
`ghcr.io/gringolito/debtwise/web:edge` images. `mise run build:image:all` builds both from source
under those names.

### Backing up

SQLite keeps recent writes in `debtwise.db-wal` next to `debtwise.db`, so a copy of `debtwise.db`
alone can miss them. A clean stop folds them into `debtwise.db`, but Docker kills a server that
takes longer than its stop timeout, and the writes then stay in `debtwise.db-wal`. So stop the
server and copy the whole data directory: SQLite replays a leftover write-ahead file the next time it
opens the database.

```sh
docker compose -f deploy/compose.yaml stop server
docker compose -f deploy/compose.yaml cp server:/data ./debtwise-backup
docker compose -f deploy/compose.yaml start server
```

To restore, stop the server and replace the data files with the backup's. The server image has no
shell, so a helper container does it. It removes the old database's files, so none of them can be
replayed onto the restored one, and gives the new ones to the server's `nonroot` user (UID 65532),
which must be able to write them:

```sh
docker compose -f deploy/compose.yaml stop server
docker run --rm -v "$PWD/debtwise-backup":/backup \
  --volumes-from "$(docker compose -f deploy/compose.yaml ps -aq server)" alpine \
  sh -c 'rm -f /data/debtwise.db /data/debtwise.db-wal /data/debtwise.db-shm &&
    cp /backup/debtwise.db* /data/ && rm -f /data/debtwise.db-shm &&
    chown 65532:65532 /data/debtwise.db*'
docker compose -f deploy/compose.yaml start server
```

### Container images and chart

Every push to `main` that touches the backend, the frontend, `build/` or the chart publishes both
images to GitHub Container Registry for `linux/amd64` and `linux/arm64`, tagged `edge` and
`sha-<commit>`. A `vX.Y.Z` tag publishes `X.Y.Z`, `X.Y` and `latest`.

The same runs publish the Helm chart to `oci://ghcr.io/gringolito/debtwise/charts/debtwise`. A
`vX.Y.Z` tag publishes chart `X.Y.Z` for the `X.Y.Z` images. Runs on `main` publish a
`0.0.0-edge.<run>` prerelease pinned to that commit's `sha-<commit>` images, so upgrading to the
newest one rolls out the new build. Helm skips prereleases unless you pass `--devel` or a version.

### Kubernetes

Install the latest release of the chart:

```sh
helm install debtwise oci://ghcr.io/gringolito/debtwise/charts/debtwise \
  --namespace debtwise --create-namespace
```

Add `--devel` to track `main` instead. `helm install debtwise deploy/helm/debtwise` installs the
chart from a checkout, running the `edge` images.

The server and web containers run in one pod. The server keeps its SQLite file on a 1Gi
`ReadWriteOnce` claim, so the pod always runs as one replica. `helm uninstall` leaves that claim in
place, so reinstalling picks up the same data; set `persistence.keepOnUninstall=false` to delete it
with the release. Set `ingress.enabled=true` and `ingress.hosts` to expose the service, or follow
the port-forward printed after the install.

Pass the bond price credentials from a Secret through `server.extraEnv`. For Radar Opções:

```yaml
server:
  extraEnv:
    - name: RADAR_TOKEN
      valueFrom:
        secretKeyRef:
          name: debtwise-radar
          key: token
```

For Tesouro Indireto:

```yaml
server:
  extraEnv:
    - name: TESOURO_INDIRETO_URL
      value: https://tesouro-indireto.example.com
    - name: TESOURO_INDIRETO_API_KEY
      valueFrom:
        secretKeyRef:
          name: debtwise-tesouro-indireto
          key: api-key
```

`values.yaml` lists the rest of the settings.

## Development

`mise install` provisions the toolchain and `mise tasks` lists the tasks. `mise run local:up` runs
the API and the frontend host-native, and `mise run check` runs the pull request checks. mise loads
`.env`, so set the bond price settings there; the server doesn't start without them.
