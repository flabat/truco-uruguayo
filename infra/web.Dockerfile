FROM node:24-bookworm-slim AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY astro.config.mjs ./
COPY src ./src
COPY training/contracts/index.ts ./training/contracts/index.ts
COPY public ./public
COPY arte ./arte
COPY scripts/tatu ./scripts/tatu
RUN npm run build

FROM nginx:stable-alpine
COPY infra/web.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/dist/ /usr/share/nginx/html/
