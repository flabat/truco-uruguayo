#!/usr/bin/env bash
set -euo pipefail

if (( $# < 2 )) || [[ ! $1 =~ (^|@)sha256:[a-f0-9]{64}$ ]]; then
  echo 'Uso: ejecutar-en-imagen.sh <imagen por digest o ID sha256> <comando> [argumentos...]' >&2
  exit 2
fi
imagen=$1
shift
: "${RUNNER_TEMP:?Falta el directorio temporal del runner}"
: "${TRUCO_MEDICIONES:?Falta el directorio con las mediciones de este intento}"
checkout=$(pwd -P)
mediciones=$(realpath -e "$TRUCO_MEDICIONES")
temporal=$(mktemp -d "$RUNNER_TEMP/truco-contenedor.XXXXXXXX")
trap 'rm -rf -- "$temporal"' EXIT
mkdir -p "$temporal/home" "$temporal/tmp"

# El daemon de la VM monta archivos por su ruta absoluta y publica la pila en
# loopback. El cliente de Docker y sus dos plugins usan ese mismo daemon.
socket=/var/run/docker.sock
cliente=$(realpath -e "$(command -v docker)")
plugins=$(docker info --format '{{range .ClientInfo.Plugins}}{{println .Name .Path}}{{end}}')
montajes=(
  --mount "type=bind,src=$checkout,dst=$checkout"
  --mount "type=bind,src=$mediciones,dst=$mediciones"
  --mount "type=bind,src=$temporal,dst=$temporal"
  --mount "type=bind,src=$socket,dst=$socket"
  --mount "type=bind,src=$cliente,dst=/usr/local/bin/docker,readonly"
)
for nombre in compose buildx; do
  ruta=$(awk -v nombre="$nombre" '$1 == nombre {sub(/^[^ ]+ +/, ""); print; exit}' <<< "$plugins")
  if [[ ! -x $ruta ]]; then
    echo "No se encontró el plugin de Docker $nombre en el runner." >&2
    exit 1
  fi
  archivo=$(realpath -e "$ruta")
  montajes+=(--mount "type=bind,src=$archivo,dst=/usr/local/lib/docker/cli-plugins/docker-$nombre,readonly")
done

docker run --rm --init --interactive --pull=never --network=host --shm-size=512m \
  --user "$(id -u):$(id -g)" --group-add "$(stat -c %g "$socket")" \
  "${montajes[@]}" --workdir "$checkout" \
  --env "HOME=$temporal/home" --env "TMPDIR=$temporal/tmp" \
  --env "RUNNER_TEMP=$temporal" --env "TRUCO_MEDICIONES=$mediciones" \
  --env CI --env GITHUB_ACTIONS --env CHECK_STACK --env TEST_CONCURRENCY --env PLAYWRIGHT_WORKERS \
  "$imagen" "$@"
