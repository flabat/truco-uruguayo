FROM node:24-bookworm-slim
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev
COPY *.ts ./
COPY migrations ./migrations
USER node
EXPOSE 3001
CMD ["node", "server.ts"]
