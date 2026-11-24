FROM node:24-bookworm-slim
WORKDIR /app/api
COPY api/package.json api/package-lock.json ./
RUN npm ci --omit=dev
COPY api/*.ts ./
COPY api/migrations ./migrations
COPY paquetes/motor /app/paquetes/motor
COPY src/lib/cartas.ts src/lib/cantos.ts /app/src/lib/
COPY training/contracts /app/training/contracts
COPY training/seat /app/training/seat
COPY training/anchored/actor.ts training/anchored/duel.ts training/anchored/partners.ts /app/training/anchored/
COPY training/signals /app/training/signals
COPY training/selfplay/duel-card-odds.ts training/selfplay/learner.ts training/selfplay/team-mixture.ts training/selfplay/team-transfer.ts /app/training/selfplay/
COPY training/duel/actor.ts training/duel/math.ts /app/training/duel/
COPY training/partners/policy.ts /app/training/partners/
# Node resuelve @eltruco/motor por este enlace; la ruta real queda fuera de node_modules
# para que Node quite los tipos de los .ts del paquete.
RUN mkdir -p /app/node_modules/@eltruco && ln -s ../../paquetes/motor /app/node_modules/@eltruco/motor
USER node
EXPOSE 3001
CMD ["node", "server.ts"]
