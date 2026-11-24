FROM node:24-bookworm-slim AS build
WORKDIR /app
COPY package.json package-lock.json ./
# npm ci enlaza el workspace @eltruco/motor a partir de su package.json.
COPY paquetes/motor/package.json ./paquetes/motor/package.json
RUN npm ci
COPY paquetes/motor/src ./paquetes/motor/src
COPY astro.config.mjs ./
COPY src ./src
COPY training/contracts/index.ts ./training/contracts/index.ts
COPY public ./public
COPY arte ./arte
COPY scripts/tatu ./scripts/tatu
ARG TRUCO_RELEASE
RUN npm run build

FROM caddy:2-alpine AS produccion
COPY --from=build /app/dist/ /srv/

FROM nginx:stable-alpine
COPY infra/web.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/dist/ /usr/share/nginx/html/
