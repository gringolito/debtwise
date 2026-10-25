# syntax=docker/dockerfile:1
# Built from backend/: docker build -f build/server.Dockerfile backend
FROM --platform=${BUILDPLATFORM} golang:1.27-alpine AS build
WORKDIR /src

# Injected by buildx per target platform.
ARG TARGETOS
ARG TARGETARCH

COPY go.mod go.sum ./
RUN --mount=type=cache,target=/go/pkg/mod \
    go mod download

COPY . .

ENV CGO_ENABLED=0
ENV GOOS=${TARGETOS}
ENV GOARCH=${TARGETARCH}

RUN --mount=type=cache,target=/go/pkg/mod \
    --mount=type=cache,target=/root/.cache/go-build \
    go build -trimpath -ldflags='-s -w' -o /out/server ./cmd/server

# The SQLite file's directory, owned by the nonroot user so a fresh volume mounted on it is
# writable.
RUN mkdir /out/data

FROM gcr.io/distroless/static:nonroot AS final
COPY --from=build /out/server /usr/local/bin/server
COPY --from=build --chown=nonroot:nonroot /out/data /data

ENV DB_PATH=/data/debtwise.db

EXPOSE 8080

CMD ["/usr/local/bin/server"]
