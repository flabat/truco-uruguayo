FROM node:24.22.3-bookworm-slim@sha256:873f586f3794f52281bd039bf02c048a0be08fde619338f9941bad1eb6b34530 AS node

FROM ubuntu:24.04@sha256:562111b88caa79c71391c0c4d3c2114a7d5c35915c20561fd893cb1e07929e6b

COPY --from=node /usr/local/bin/node /usr/local/bin/node
COPY --from=node /usr/local/lib/node_modules/npm /usr/local/lib/node_modules/npm

RUN apt-get update \
    && DEBIAN_FRONTEND=noninteractive apt-get install -y --no-install-recommends \
        ca-certificates curl git libatomic1 libstdc++6 openssl procps python3 \
    && rm -rf /var/lib/apt/lists/* \
    && ln -s ../lib/node_modules/npm/bin/npm-cli.js /usr/local/bin/npm \
    && ln -s ../lib/node_modules/npm/bin/npx-cli.js /usr/local/bin/npx \
    && test "$(node --version)" = v24.22.3 \
    && test "$(npm --version)" = 11.19.1

# El lockfile de la revisión fija la versión del instalador y la del navegador.
ARG PLAYWRIGHT_VERSION
ENV PLAYWRIGHT_BROWSERS_PATH=/ms-playwright
RUN test -n "$PLAYWRIGHT_VERSION" \
    && npm install --prefix /tmp/instalador --cache /tmp/cache-npm --no-save --no-package-lock \
        --no-audit --no-fund --ignore-scripts "playwright-core@${PLAYWRIGHT_VERSION}" \
    && DEBIAN_FRONTEND=noninteractive node /tmp/instalador/node_modules/playwright-core/cli.js \
        install --with-deps --only-shell chromium \
    && node /tmp/instalador/node_modules/playwright-core/cli.js \
        screenshot --browser chromium about:blank /tmp/instalador/prueba.png \
    && rm -rf /tmp/instalador /tmp/cache-npm /var/lib/apt/lists/*
