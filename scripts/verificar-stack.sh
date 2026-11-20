#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."

# Un proyecto exclusivo mantiene las pruebas y sus volúmenes fuera de la mesa local.
project="truco-check-$(date +%s)-$$"
compose=(docker compose --project-name "$project")
export TRUCO_BIND=127.0.0.1 TRUCO_HOST=${TEST_TRUCO_HOST:-localhost} WEB_PORT=${TEST_WEB_PORT:-18081} API_PORT=0
export TERCETOS_HABILITADOS=1 EXHIBICIONES_HABILITADAS=0
export OIDC_PORT="${TEST_OIDC_PORT:-18080}"
export KC_BOOTSTRAP_ADMIN_USERNAME=operador-prueba KC_BOOTSTRAP_ADMIN_PASSWORD=clave-descartable
unset KEYCLOAK_ADMIN_TOKEN
export DISCORD_GUILD_ID= DISCORD_CATEGORY_ID= DISCORD_BOT_TOKEN= DISCORD_BOT_TOKEN_FILE=

cleanup() {
  local status=$?
  if [[ $status != 0 ]]; then "${compose[@]}" logs --tail=60 >&2; fi
  "${compose[@]}" down --volumes --rmi local
  exit "$status"
}
trap cleanup EXIT

sql() { "${compose[@]}" exec -T db psql -X -v ON_ERROR_STOP=1 -U truco -d truco -Atc "$1"; }
up() { "${compose[@]}" up --build --wait --wait-timeout 240; }
url() { echo "http://$("${compose[@]}" port "$1" "$2")"; }

up
web=$(url web 80)
issuer="http://$TRUCO_HOST:$OIDC_PORT/realms/truco-local"
curl -fsS "$web/" | grep -F 'Truco uruguayo' >/dev/null
curl -fsS "$(url api 3001)/health" | node -e 'const s = JSON.parse(require("node:fs").readFileSync(0)); if (s.api !== "ok" || s.postgres !== "ok") process.exit(1)'
curl -fsS "$issuer/.well-known/openid-configuration" | node -e '
  const d = JSON.parse(require("node:fs").readFileSync(0));
  if (d.issuer !== process.argv[1] || !d.authorization_endpoint || !d.token_endpoint || !d.jwks_uri) process.exit(1)
' "$issuer"
node scripts/verificar-identidad.mjs "$issuer"
export GOOGLE_CLIENT_ID=google-prueba GOOGLE_CLIENT_SECRET=secreto-google-prueba
export FACEBOOK_APP_ID=123456789 FACEBOOK_APP_SECRET=secreto-facebook-prueba
node scripts/verificar-ingreso-social.mjs "$web"
COMPOSE_PROJECT_NAME="$project" npm run auth:google
node scripts/verificar-ingreso-social.mjs "$web" google
COMPOSE_PROJECT_NAME="$project" npm run auth:facebook
node scripts/verificar-ingreso-social.mjs "$web" google facebook
node scripts/verificar-jugadores.mjs "http://$TRUCO_HOST:$WEB_PORT"
"${compose[@]}" exec -T api node --input-type=module < scripts/verificar-credenciales.mjs
"${compose[@]}" exec -T api node --input-type=module < scripts/verificar-exhibiciones.mjs
"${compose[@]}" exec -T api node --input-type=module < scripts/verificar-migracion-salon.mjs
"${compose[@]}" exec -T api node --input-type=module < scripts/verificar-mesas.mjs
"${compose[@]}" exec -T api node --input-type=module < scripts/verificar-salon.mjs
"${compose[@]}" exec -T api node --input-type=module < scripts/verificar-voz.mjs
"${compose[@]}" exec -T api node --input-type=module < scripts/verificar-partidas.mjs
"${compose[@]}" exec -T api node --input-type=module < scripts/verificar-ensayos.mjs
"${compose[@]}" exec -T api node --input-type=module < scripts/verificar-cierres-tercetos.mjs
"${compose[@]}" exec -T api node --input-type=module < scripts/verificar-persistencia-tercetos.mjs
for formato in duel pairs pairs-private-senas; do
  pin=$(node scripts/actor-ensayo.ts "$formato" | "${compose[@]}" exec -T api node policyctl.ts register "$formato")
  "${compose[@]}" exec -T api node policyctl.ts activate "$formato" "$pin"
done
"${compose[@]}" exec -T api node --input-type=module - aprendidos < scripts/verificar-ensayos.mjs
for formato in duel pairs pairs-private-senas; do "${compose[@]}" exec -T api node policyctl.ts rollback "$formato"; done
"${compose[@]}" stop api
"${compose[@]}" run --no-deps --rm -T api node --input-type=module < scripts/verificar-inferencia.mjs
"${compose[@]}" run --no-deps --rm -T api node --input-type=module - preparar-bot < scripts/verificar-cierres-tercetos.mjs
"${compose[@]}" up --wait api
"${compose[@]}" exec -T api node --input-type=module - auditar-bot < scripts/verificar-cierres-tercetos.mjs
"${compose[@]}" exec -T api node --input-type=module - recuperado < scripts/verificar-ensayos.mjs
"${compose[@]}" exec -T api node --input-type=module - iniciar < scripts/verificar-vivo.mjs
node scripts/verificar-juego-navegador.mjs "http://$TRUCO_HOST:$WEB_PORT" "$project"
consulta_jugadores="SELECT string_agg(id::text, ',' ORDER BY id) FROM juego.jugadores"
jugadores=$(sql "$consulta_jugadores")

# El dato y la fecha original permiten detectar tanto pérdida de volumen como reaplicación.
sql "CREATE TABLE juego.prueba_persistencia (valor text); INSERT INTO juego.prueba_persistencia VALUES ('conservado')"
migration=$(sql "SELECT applied_at FROM schema_migrations WHERE name = '001-juego.sql'")
[[ -n "$migration" ]]
"${compose[@]}" stop db
[[ $(curl -sS -o /dev/null -w '%{http_code}' "$(url api 3001)/health") == 503 ]]
"${compose[@]}" down
export TERCETOS_HABILITADOS=0
up
"${compose[@]}" exec -T api node --input-type=module - cerrar-altas < scripts/verificar-cierres-tercetos.mjs
"${compose[@]}" exec -T api node --input-type=module - reconectar < scripts/verificar-persistencia-tercetos.mjs
[[ $(sql "SELECT valor FROM juego.prueba_persistencia") == conservado ]]
"${compose[@]}" exec -T api node --input-type=module - reinicio < scripts/verificar-mesas.mjs
"${compose[@]}" exec -T api node --input-type=module - reconectar < scripts/verificar-vivo.mjs
node scripts/verificar-jugadores.mjs "http://$TRUCO_HOST:$WEB_PORT"
[[ $(sql "$consulta_jugadores") == "$jugadores" ]]
[[ $(sql "SELECT applied_at FROM schema_migrations WHERE name = '001-juego.sql'") == "$migration" ]]
curl -fsS "$(url api 3001)/health"
node scripts/verificar-correo-social.mjs "http://$TRUCO_HOST:$WEB_PORT" "http://$TRUCO_HOST:$OIDC_PORT" "$project"
echo ' · Arranque, identidad, migraciones y persistencia verificados.'
