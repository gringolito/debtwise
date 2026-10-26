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

Current bond prices come from the [Radar Opções](https://radaropcoes.com) API. Generate a token
on your Radar Opções profile and set `RADAR_TOKEN` to it before starting; without one, every
refresh of the bond prices fails.

The compose file runs the `ghcr.io/gringolito/debtwise/server:edge` and
`ghcr.io/gringolito/debtwise/web:edge` images. `mise run build:image:all` builds both from source
under those names.

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

The server keeps its SQLite file on a 1Gi `ReadWriteOnce` claim and always runs as one replica.
`helm uninstall` leaves that claim in place, so reinstalling picks up the same data; set
`persistence.keepOnUninstall=false` to delete it with the release. Set `ingress.enabled=true` and
`ingress.hosts` to expose the web service, or follow the port-forward printed after the install.

Pass the Radar Opções token from a Secret through `server.extraEnv`:

```yaml
server:
  extraEnv:
    - name: RADAR_TOKEN
      valueFrom:
        secretKeyRef:
          name: debtwise-radar
          key: token
```

`values.yaml` lists the rest of the settings.

## Development

`mise install` provisions the toolchain and `mise tasks` lists the tasks. `mise run local:up` runs
the API and the frontend host-native, and `mise run check` runs the pull request checks.
