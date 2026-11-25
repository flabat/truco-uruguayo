FROM node:24-bookworm-slim AS dependencias
WORKDIR /app
COPY package.json package-lock.json ./
# npm ci enlaza los workspaces @eltruco/motor, @eltruco/cliente y @eltruco/app a partir de sus package.json.
COPY paquetes/motor/package.json ./paquetes/motor/package.json
COPY app/package.json ./app/package.json
COPY paquetes/cliente/package.json ./paquetes/cliente/package.json
RUN npm ci

# Exportación web de la app Expo, servida en la dirección de prueba /app/.
FROM dependencias AS app
ENV EXPO_NO_TELEMETRY=1
COPY paquetes/motor/src ./paquetes/motor/src
COPY paquetes/cliente/src ./paquetes/cliente/src
COPY app/app.json app/tsconfig.json ./app/
# Las cartas Tatú se empaquetan como recursos de la app.
COPY public/img/cartas/tatu ./public/img/cartas/tatu
COPY app/src ./app/src
RUN npm run app:exportar

FROM dependencias AS build
COPY paquetes/motor/src ./paquetes/motor/src
COPY paquetes/cliente/src ./paquetes/cliente/src
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
COPY --from=app /app/app/dist/ /srv/app/

FROM nginx:stable-alpine
COPY infra/web.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/dist/ /usr/share/nginx/html/
COPY --from=app /app/app/dist/ /usr/share/nginx/html/app/
