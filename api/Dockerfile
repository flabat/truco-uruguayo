FROM node:24-bookworm-slim
WORKDIR /app/api
COPY api/package.json api/package-lock.json ./
RUN npm ci --omit=dev
COPY api/*.ts ./
COPY api/migrations ./migrations
COPY src/motor /app/src/motor
COPY training/contracts /app/training/contracts
COPY training/seat /app/training/seat
COPY training/anchored/actor.ts training/anchored/duel.ts training/anchored/partners.ts /app/training/anchored/
COPY training/signals /app/training/signals
COPY training/selfplay/learner.ts training/selfplay/team-mixture.ts training/selfplay/team-transfer.ts /app/training/selfplay/
COPY training/duel/actor.ts training/duel/math.ts /app/training/duel/
COPY training/partners/policy.ts /app/training/partners/
COPY training/arena/index.ts /app/training/arena/
COPY training/search/belief.ts training/search/continuation.ts /app/training/search/
COPY training/alphazero/model.ts training/alphazero/rank-signals.ts training/alphazero/search.ts /app/training/alphazero/
USER node
EXPOSE 3001
CMD ["node", "server.ts"]
