#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
tmp=$(mktemp -d)
project="truco-dr-$(date +%s)-$$"
network="$project-copias"
export SITE_HOST=mesa.internal HTTP_BIND=127.0.0.1: HTTPS_BIND=127.0.0.1:
# Este proyecto verifica los valores de la versión y nunca contacta un Discord real.
unset SALON_HABILITADO VOZ_ESPECTADORA_HABILITADA EXHIBICIONES_HABILITADAS EXHIBICIONES_OBJETIVO EXHIBICIONES_PAUSADAS
unset DISCORD_GUILD_ID DISCORD_CATEGORY_ID DISCORD_BOT_TOKEN DISCORD_BOT_TOKEN_FILE
export RESTIC_REPOSITORY=rest:http://almacen:8000/mesa
export POSTGRES_PASSWORD GAME_DB_PASSWORD ID_DB_PASSWORD KC_ADMIN_PASSWORD RESTIC_PASSWORD TEST_PLAYER_PASSWORD
for variable in POSTGRES_PASSWORD GAME_DB_PASSWORD ID_DB_PASSWORD KC_ADMIN_PASSWORD RESTIC_PASSWORD TEST_PLAYER_PASSWORD; do
  printf -v "$variable" '%s' "$(openssl rand -hex 24)"
done
# El almacén simula un segundo servidor y sobrevive a la pérdida de todo el proyecto.
cat > "$tmp/ensayo.yaml" <<YAML
services:
  web:
    volumes: [confianza:/confianza]
  api:
    environment:
      NODE_EXTRA_CA_CERTS: /confianza/root.crt
    volumes: [confianza:/confianza:ro]
  backup:
    networks: [default, almacen]
volumes:
  confianza:
networks:
  almacen:
    external: true
    name: $network
YAML
dc=(docker compose --project-name "$project" --env-file /dev/null -f compose.production.yaml -f "$tmp/ensayo.yaml")
verificar_config_salon() {
  "${dc[@]}" config --format json | node -e '
    const { deepStrictEqual } = require("node:assert");
    const { services } = JSON.parse(require("node:fs").readFileSync(0, "utf8"));
    const claves = ["SALON_HABILITADO", "VOZ_ESPECTADORA_HABILITADA", "EXHIBICIONES_HABILITADAS",
      "EXHIBICIONES_OBJETIVO", "EXHIBICIONES_PAUSADAS"];
    deepStrictEqual(claves.map(k => services.api.environment[k]), process.argv.slice(1));' "$@"
}
verificar_config_salon 1 1 1 6 0
SALON_HABILITADO=0 VOZ_ESPECTADORA_HABILITADA=0 EXHIBICIONES_HABILITADAS=0 \
  EXHIBICIONES_OBJETIVO=0 EXHIBICIONES_PAUSADAS=1 verificar_config_salon 0 0 0 0 1
EXHIBICIONES_OBJETIVO=10 verificar_config_salon 1 1 1 10 0

cleanup() {
  local status=$?
  if ((status)); then "${dc[@]}" logs --tail=15 api identidad backup >&2 || true; fi
  "${dc[@]}" down -v --remove-orphans --rmi local >/dev/null
  docker rm -fv "$project-almacen" >/dev/null
  docker network rm "$network" >/dev/null
  rm -rf "$tmp"
  exit "$status"
}
docker network create --internal "$network" >/dev/null
trap cleanup EXIT
docker run -d --name "$project-almacen" --network "$network" --network-alias almacen \
  -e DISABLE_AUTHENTICATION=1 restic/rest-server:0.14.0 >/dev/null
"${dc[@]}" build
arrancar_base() {
  "${dc[@]}" up -d --wait db web
  "${dc[@]}" exec -T web sh -ec 'for i in $(seq 1 30); do
    if test -s /data/caddy/pki/authorities/local/root.crt; then
      cp /data/caddy/pki/authorities/local/root.crt /confianza/root.crt
      chmod 644 /confianza/root.crt; exit 0
    fi; sleep 1; done; exit 1'
}
jugar() {
  "${dc[@]}" exec -T -e TEST_PLAYER_PASSWORD -e TEST_SAVED api node --input-type=module - < scripts/produccion/jugador.mjs
}
copia() { "${dc[@]}" run --rm --no-deps -T backup "$@"; }

arrancar_base
copia iniciar
"${dc[@]}" up -d --wait api identidad
"${dc[@]}" exec -T api node --input-type=module - < scripts/produccion/cache-estatica.mjs
"${dc[@]}" exec -T -e TEST_PLAYER_PASSWORD identidad bash -e <<'ADMIN'
kcadm=/opt/keycloak/bin/kcadm.sh
config=$(mktemp)
trap 'rm -f "$config"' EXIT
$kcadm config credentials --config "$config" --server http://localhost:8080 --realm master \
  --user operador --password "$KC_BOOTSTRAP_ADMIN_PASSWORD"
$kcadm create users --config "$config" -r mesa -s username=ensayo -s enabled=true \
  -s firstName=Jugador -s lastName=Ensayo -s email=ensayo@example.test -s emailVerified=true
$kcadm set-password --config "$config" -r mesa --username ensayo --new-password "$TEST_PLAYER_PASSWORD"
ADMIN
export TEST_SAVED=''
TEST_SAVED=$(jugar)
"${dc[@]}" up -d backup
for i in {1..120}; do
  if "${dc[@]}" exec -T backup test -s /tmp/ultimo-respaldo; then break; fi
  sleep 1
done
"${dc[@]}" exec -T backup test -s /tmp/ultimo-respaldo
copia listar
if copia restaurar latest; then echo 'Se aceptó una base ocupada' >&2; exit 1; fi
"${dc[@]}" down --volumes
arrancar_base
copia restaurar latest
"${dc[@]}" up -d --wait api identidad
jugar
echo 'HTTPS, sesión nueva, WSS, copia programada y continuación en volúmenes nuevos: OK'
