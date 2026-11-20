#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
: "${DISCORD_BOT_TOKEN_FILE:?Indicá la ruta absoluta del archivo con el token del bot}"
[[ "$DISCORD_BOT_TOKEN_FILE" = /* && -r "$DISCORD_BOT_TOKEN_FILE" ]]
export DISCORD_GUILD_ID=${DISCORD_GUILD_ID:-1573148175718555679}
export DISCORD_CATEGORY_ID=${DISCORD_CATEGORY_ID:-1573157722885718046}
archivo=$DISCORD_BOT_TOKEN_FILE
export DISCORD_BOT_TOKEN=
export DISCORD_BOT_TOKEN_FILE=/run/secrets/discord
project="truco-voz-$(date +%s)-$$"
compose=(docker compose --project-name "$project")
finalizar() {
  local estado=$?
  if [[ $estado == 0 ]]; then
    "${compose[@]}" down --volumes --rmi local
  else
    echo "Se conservó el proyecto descartable $project para revisar sus vínculos de voz." >&2
  fi
}
trap finalizar EXIT
"${compose[@]}" up --detach --wait db
"${compose[@]}" build api
# El proceso del bot y el verificador comparten el archivo de solo lectura y la red privada.
# El contenedor de prueba carece de puertos publicados. La identidad se siembra en la base nueva.
"${compose[@]}" run --rm --no-deps -T --user "$(id -u):$(id -g)" \
  --volume "$archivo:/run/secrets/discord:ro" api sh -ec '
    node server.ts &
    api_pid=$!
    trap "kill $api_pid 2>/dev/null || true" EXIT
    PORT=3001 node --input-type=module - real
  ' < scripts/verificar-voz.mjs
