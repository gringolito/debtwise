# syntax=docker/dockerfile:1
# Built from the repository root: docker build -f build/web.Dockerfile .
FROM --platform=${BUILDPLATFORM} node:24.22.1-slim AS build
WORKDIR /app

COPY frontend/package.json frontend/package-lock.json ./
RUN --mount=type=cache,target=/root/.npm \
    npm ci

COPY frontend/ ./
RUN npm run build

# Builds the version named by the tag with the image's Go toolchain, for the target platform.
FROM --platform=${BUILDPLATFORM} caddy:2.11.7-builder-alpine AS caddy

ARG TARGETOS
ARG TARGETARCH

RUN --mount=type=cache,target=/go/pkg/mod \
    --mount=type=cache,target=/root/.cache/go-build \
    CGO_ENABLED=0 GOOS=${TARGETOS} GOARCH=${TARGETARCH} \
    xcaddy build --output /out/caddy

FROM gcr.io/distroless/static:nonroot AS final
COPY --from=caddy /out/caddy /usr/bin/caddy
COPY build/Caddyfile /etc/caddy/Caddyfile
COPY --from=build /app/dist /srv

EXPOSE 80

CMD ["/usr/bin/caddy", "run", "--config", "/etc/caddy/Caddyfile", "--adapter", "caddyfile"]
