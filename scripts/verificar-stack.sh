#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."

# Un proyecto exclusivo mantiene las pruebas y sus volúmenes fuera de la mesa local.
project="truco-check-$(date +%s)-$$"
compose=(docker compose --project-name "$project")
export TRUCO_BIND=127.0.0.1 TRUCO_HOST=${TEST_TRUCO_HOST:-localhost} WEB_PORT=${TEST_WEB_PORT:-18081} API_PORT=0
export SALON_HABILITADO=1 EXHIBICIONES_HABILITADAS=0 SENAS_PIE_PAREJAS=1 SENAS_PIE_TERCETOS=1
export GESTION_SUJETO=2e98a700-1205-4e9b-8161-000000000001 # Ana, en el realm descartable.
export OIDC_PORT="${TEST_OIDC_PORT:-18080}"
export KC_BOOTSTRAP_ADMIN_USERNAME=operador-prueba KC_BOOTSTRAP_ADMIN_PASSWORD=clave-descartable
export KEYCLOAK_API_CLIENT_SECRET=secreto-descartable-del-cliente-de-servicio-api APPLE_TOKENS_KEY="$(openssl rand -base64 32)"
unset KEYCLOAK_ADMIN_TOKEN
# Datos de cuenta inventados: la imagen genera la asociación con la app (/.well-known/).
export APPLE_TEAM_ID=EQUIPO1234 ANDROID_CERT_SHA256=$(printf 'AB:%.0s' {1..31})CD
export DISCORD_GUILD_ID= DISCORD_CATEGORY_ID= DISCORD_BOT_TOKEN= DISCORD_BOT_TOKEN_FILE=

cleanup() {
  local status=$?
  if [[ $status != 0 ]]; then "${compose[@]}" logs --tail=60 >&2; fi
  if [[ -n ${caddy:-} ]]; then docker rm -f "$caddy" >/dev/null 2>&1 || true; fi
  docker image rm "$project-caddy" >/dev/null 2>&1 || true
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
curl -fsS "$web/" | grep -F '<title>El Truco</title>' >/dev/null
bash scripts/verificar-app-web.sh "$web"
node scripts/verificar-enlaces-app.mjs "$web"
# La misma imagen web con el Caddyfile de producción sirve la app en /app/.
docker build -q --target produccion -f infra/web.Dockerfile --build-arg APPLE_TEAM_ID --build-arg ANDROID_CERT_SHA256 \
  -t "$project-caddy" . >/dev/null
caddy=$(docker run -d -e SITE_HOST=:80 -v "$PWD/infra/produccion/Caddyfile:/etc/caddy/Caddyfile:ro" -p 127.0.0.1::80 "$project-caddy")
caddy_web="http://$(docker port "$caddy" 80/tcp | head -1)"
for _ in $(seq 40); do curl -fsS -o /dev/null "$caddy_web/" && break; sleep 0.25; done
bash scripts/verificar-app-web.sh "$caddy_web"
node scripts/verificar-enlaces-app.mjs "$caddy_web"
docker rm -f "$caddy" >/dev/null && caddy=
curl -fsS "$(url api 3001)/health" | node -e 'const s = JSON.parse(require("node:fs").readFileSync(0)); if (s.api !== "ok" || s.postgres !== "ok") process.exit(1)'
curl -fsS "$issuer/.well-known/openid-configuration" | node -e '
  const d = JSON.parse(require("node:fs").readFileSync(0));
  if (d.issuer !== process.argv[1] || !d.authorization_endpoint || !d.token_endpoint || !d.jwks_uri) process.exit(1)
' "$issuer"
node scripts/verificar-identidad.mjs "$issuer"
export GOOGLE_CLIENT_ID=google-prueba GOOGLE_CLIENT_SECRET=secreto-google-prueba
export DISCORD_CLIENT_ID=discord-prueba DISCORD_CLIENT_SECRET=secreto-discord-prueba
export FACEBOOK_APP_ID=123456789 FACEBOOK_APP_SECRET=secreto-facebook-prueba
node scripts/verificar-ingreso-social.mjs "$web"
COMPOSE_PROJECT_NAME="$project" npm run auth:google
node scripts/verificar-ingreso-social.mjs "$web" google
COMPOSE_PROJECT_NAME="$project" npm run auth:facebook
node scripts/verificar-ingreso-social.mjs "$web" google facebook
COMPOSE_PROJECT_NAME="$project" npm run auth:discord
node scripts/verificar-ingreso-social.mjs "$web" google facebook discord
# Clave EC P-256 descartable en el formato .p8 que entrega Apple.
APPLE_PRIVATE_KEY=$(openssl genpkey -algorithm EC -pkeyopt ec_paramgen_curve:P-256 2>/dev/null)
export APPLE_CLIENT_ID=co.eltru.prueba APPLE_TEAM_ID=EQUIPO1234 APPLE_KEY_ID=CLAVE12345 APPLE_PRIVATE_KEY
COMPOSE_PROJECT_NAME="$project" npm run auth:apple
node scripts/verificar-ingreso-social.mjs "$web" google facebook discord apple
node scripts/verificar-gestion.mjs "http://$TRUCO_HOST:$WEB_PORT" "$project"
node scripts/verificar-jugadores.mjs "http://$TRUCO_HOST:$WEB_PORT"
node scripts/verificar-ingreso-app.mjs "http://$TRUCO_HOST:$WEB_PORT"
node scripts/verificar-app-navegador.mjs "http://$TRUCO_HOST:$WEB_PORT"
node scripts/verificar-app-salon.mjs "http://$TRUCO_HOST:$WEB_PORT"
node scripts/verificar-app-mesa.mjs "http://$TRUCO_HOST:$WEB_PORT"
node scripts/verificar-baja-ingreso.mjs "http://$TRUCO_HOST:$WEB_PORT" "$project"
"${compose[@]}" exec -T api node --input-type=module < scripts/verificar-credenciales.mjs
"${compose[@]}" exec -T api node --input-type=module < scripts/verificar-exhibiciones.mjs
"${compose[@]}" exec -T api node --input-type=module < scripts/verificar-migracion-salon.mjs
"${compose[@]}" exec -T api node --input-type=module < scripts/verificar-mesas.mjs
"${compose[@]}" exec -T api node --input-type=module < scripts/verificar-sesion-app.mjs
"${compose[@]}" exec -T api node --input-type=module < scripts/verificar-bajas.mjs
COMPOSE_PROJECT_NAME="$project" npm run auth:api
"${compose[@]}" exec -T api node --input-type=module < scripts/verificar-bajas-vencidas.mjs
"${compose[@]}" exec -T api node --input-type=module < scripts/verificar-salon.mjs
"${compose[@]}" exec -T api node --input-type=module < scripts/verificar-voz.mjs
"${compose[@]}" exec -T api node --input-type=module < scripts/verificar-partidas.mjs
"${compose[@]}" exec -T api node --input-type=module < scripts/verificar-senas-pie.mjs
"${compose[@]}" exec -T api node --input-type=module < scripts/verificar-ensayos.mjs
"${compose[@]}" exec -T api node --input-type=module - al-pie < scripts/verificar-ensayos.mjs
"${compose[@]}" exec -T api node --input-type=module < scripts/verificar-cierres-tercetos.mjs
"${compose[@]}" exec -T api node --input-type=module < scripts/verificar-persistencia-tercetos.mjs
for formato in duel pairs pairs-private-senas; do
  pin=$(node scripts/actor-ensayo.ts "$formato" | "${compose[@]}" exec -T api node policyctl.ts register "$formato")
  "${compose[@]}" exec -T api node policyctl.ts activate "$formato" "$pin"
done
"${compose[@]}" exec -T api node --input-type=module - aprendidos < scripts/verificar-ensayos.mjs
"${compose[@]}" exec -T api node --input-type=module < scripts/verificar-retiro.mjs
for formato in duel pairs pairs-private-senas; do "${compose[@]}" exec -T api node policyctl.ts rollback "$formato"; done
"${compose[@]}" stop api
"${compose[@]}" run --no-deps --rm -T api node --input-type=module < scripts/verificar-inferencia.mjs
"${compose[@]}" run --no-deps --rm -T api node --input-type=module - preparar-bot < scripts/verificar-cierres-tercetos.mjs
"${compose[@]}" up --wait api
"${compose[@]}" exec -T api node --input-type=module - auditar-bot < scripts/verificar-cierres-tercetos.mjs
"${compose[@]}" exec -T api node --input-type=module - recuperado < scripts/verificar-ensayos.mjs
"${compose[@]}" exec -T api node --input-type=module - iniciar < scripts/verificar-vivo.mjs
node scripts/verificar-app-reconexion.mjs "http://$TRUCO_HOST:$WEB_PORT" "$project"
node scripts/verificar-juego-navegador.mjs "http://$TRUCO_HOST:$WEB_PORT" "$project"
consulta_jugadores="SELECT string_agg(id::text, ',' ORDER BY id) FROM juego.jugadores"
jugadores=$(sql "$consulta_jugadores")

# El dato y la fecha original permiten detectar tanto pérdida de volumen como reaplicación.
sql "CREATE TABLE juego.prueba_persistencia (valor text); INSERT INTO juego.prueba_persistencia VALUES ('conservado')"
migration=$(sql "SELECT applied_at FROM schema_migrations WHERE name = '001-juego.sql'")
[[ -n "$migration" ]]
# Cerrar las altas en la base descartable antes de comprobar la persistencia del cierre.
sql "UPDATE juego.funciones SET audiencia='desactivado' WHERE clave='tercetos'"
"${compose[@]}" stop db
[[ $(curl -sS -o /dev/null -w '%{http_code}' "$(url api 3001)/health") == 503 ]]
"${compose[@]}" down
export SALON_HABILITADO=0 SENAS_PIE_PAREJAS=0 SENAS_PIE_TERCETOS=0
up
"${compose[@]}" exec -T api node --input-type=module - cerrar-altas < scripts/verificar-cierres-tercetos.mjs
"${compose[@]}" exec -T api node --input-type=module - reconectar < scripts/verificar-persistencia-tercetos.mjs
"${compose[@]}" exec -T api node --input-type=module - reconectar < scripts/verificar-senas-pie.mjs
[[ $(sql "SELECT valor FROM juego.prueba_persistencia") == conservado ]]
"${compose[@]}" exec -T api node --input-type=module - reinicio < scripts/verificar-mesas.mjs
"${compose[@]}" exec -T api node --input-type=module - reconectar < scripts/verificar-vivo.mjs
node scripts/verificar-jugadores.mjs "http://$TRUCO_HOST:$WEB_PORT"
[[ $(sql "$consulta_jugadores") == "$jugadores" ]]
[[ $(sql "SELECT applied_at FROM schema_migrations WHERE name = '001-juego.sql'") == "$migration" ]]
curl -fsS "$(url api 3001)/health"
node scripts/verificar-correo-social.mjs "http://$TRUCO_HOST:$WEB_PORT" "http://$TRUCO_HOST:$OIDC_PORT" "$project"
echo ' · Arranque, identidad, migraciones y persistencia verificados.'
