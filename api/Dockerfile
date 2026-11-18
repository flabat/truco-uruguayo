FROM node:24-bookworm-slim
WORKDIR /app/api
COPY api/package.json api/package-lock.json ./
RUN npm ci --omit=dev
COPY api/*.ts ./
COPY api/migrations ./migrations
COPY src/motor /app/src/motor
USER node
EXPOSE 3001
CMD ["node", "server.ts"]
