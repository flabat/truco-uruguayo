# La construcción produce archivos estáticos: corre en la plataforma de quien construye, también al publicar desde una Mac
# con Apple Silicon para un VPS x86_64. Las imágenes finales siguen siendo de la plataforma de destino.
FROM --platform=$BUILDPLATFORM node:24-bookworm-slim AS dependencias
WORKDIR /app
COPY package.json package-lock.json ./
# npm ci enlaza los workspaces @eltruco/motor, @eltruco/cliente, @eltruco/mesa-geometria y @eltruco/app a partir de sus package.json.
COPY paquetes/motor/package.json ./paquetes/motor/package.json
COPY app/package.json ./app/package.json
COPY paquetes/mesa-geometria/package.json ./paquetes/mesa-geometria/package.json
COPY paquetes/cliente/package.json ./paquetes/cliente/package.json
RUN npm ci

# Exportación web de la app Expo, servida en /jugar/.
FROM dependencias AS app
ENV EXPO_NO_TELEMETRY=1
COPY paquetes/motor/src ./paquetes/motor/src
COPY paquetes/cliente/src ./paquetes/cliente/src
COPY paquetes/mesa-geometria/src ./paquetes/mesa-geometria/src
# La mesa de la app lee los contratos de señas y la tabla de señas publicada.
COPY training/contracts/index.ts ./training/contracts/index.ts
COPY src/data/juego.json ./src/data/juego.json
COPY app/app.json app/tsconfig.json ./app/
# Las cartas Tatú se empaquetan como recursos de la app.
COPY public/img/cartas/tatu ./public/img/cartas/tatu
COPY app/src ./app/src
# Las voces y los efectos de la 4e, que la mesa importa.
COPY app/assets/sonido ./app/assets/sonido
COPY scripts/copiar-canvaskit.mjs ./scripts/copiar-canvaskit.mjs
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
# Asociación con la app (universal links y App Links). Sin datos, el archivo de esa plataforma no existe.
COPY scripts/enlaces-app.mjs ./scripts/enlaces-app.mjs
ARG APPLE_TEAM_ID
ARG ANDROID_CERT_SHA256
RUN node scripts/enlaces-app.mjs generar dist/.well-known

FROM caddy:2-alpine AS produccion
COPY --from=build /app/dist/ /srv/
COPY --from=app /app/app/dist/ /srv/jugar/

FROM nginx:stable-alpine
COPY infra/web.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/dist/ /usr/share/nginx/html/
COPY --from=app /app/app/dist/ /usr/share/nginx/html/jugar/
