#!/usr/bin/env bash
# Ensayo de `npm run vps` sin el VPS: un contenedor con sshd usa el Docker local
# como si fuera el del servidor. Publica el árbol actual completo, después sólo la
# web, y comprueba las etiquetas, la marca para el temporizador y la web servida.
set -euo pipefail
cd "$(dirname "$0")/.."
# Compose resuelve los montajes en el daemon: la raíz remota tiene que existir con la
# misma ruta en esta máquina y en el contenedor. Docker Desktop y Colima comparten $HOME.
mkdir -p "$HOME/.cache"
tmp=$(mktemp -d "$HOME/.cache/truco-vps-ensayo.XXXXXX")
tmp=$(cd "$tmp" && pwd -P)
name="truco-vps-ensayo-$$"
project="$name"
remote=(docker exec "$name")
cleanup() {
  local status=$?
  rm -f .vps-ensayo-sin-commit
  if ((status)); then docker compose -p "$project" logs --tail=20 >&2 || true; fi
  docker compose -p "$project" down -v --remove-orphans >/dev/null 2>&1 || true
  docker rm -f "$name" >/dev/null 2>&1 || true
  docker image ls --format '{{.Repository}}:{{.Tag}}' | grep -F -f "$tmp/etiquetas" 2>/dev/null | xargs -r docker image rm >/dev/null 2>&1 || true
  docker image rm "$name" >/dev/null 2>&1 || true
  rm -rf "$tmp"
  exit "$status"
}
trap cleanup EXIT
: > "$tmp/etiquetas"

mkdir -p "$tmp/imagen" "$tmp/etc" "$tmp/raiz" "$tmp/estado"
ssh-keygen -q -t ed25519 -N '' -f "$tmp/clave"
cp "$tmp/clave.pub" "$tmp/imagen/authorized_keys"
cat > "$tmp/imagen/Dockerfile" <<'DOCKER'
FROM docker:29-cli
RUN apk add --no-cache openssh-server flock && ssh-keygen -A \
  && sed -i 's/^#\?PermitRootLogin.*/PermitRootLogin prohibit-password/' /etc/ssh/sshd_config \
  && sed -i "s/^root:[^:]*:/root:*:/" /etc/shadow
COPY --chmod=600 authorized_keys /root/.ssh/authorized_keys
CMD ["/usr/sbin/sshd", "-D", "-e"]
DOCKER
docker build -q -t "$name" "$tmp/imagen" >/dev/null
docker run -d --name "$name" -p 127.0.0.1::22 -v /var/run/docker.sock:/var/run/docker.sock \
  -v "$tmp:$tmp" "$name" >/dev/null
port=$(docker port "$name" 22/tcp | head -1 | sed 's/.*://')

# Configuración del «servidor»: puertos aleatorios en loopback y copias pausadas.
secret() { openssl rand -hex 24; }
cat > "$tmp/etc/production.env" <<ENV
SITE_HOST=mesa.internal
HTTP_BIND=127.0.0.1:
HTTPS_BIND=127.0.0.1:
POSTGRES_PASSWORD=$(secret)
GAME_DB_PASSWORD=$(secret)
ID_DB_PASSWORD=$(secret)
KC_ADMIN_PASSWORD=$(secret)
KEYCLOAK_API_CLIENT_SECRET=$(secret)
EXHIBICIONES_HABILITADAS=0
ENV
touch "$tmp/etc/copias-pausadas"

export TRUCO_VPS="root@127.0.0.1"
export TRUCO_VPS_SSH="-p $port -i $tmp/clave -o StrictHostKeyChecking=no -o UserKnownHostsFile=/dev/null -o LogLevel=ERROR"
export TRUCO_VPS_RAIZ="$tmp/raiz" TRUCO_VPS_ESTADO="$tmp/estado" TRUCO_VPS_ENV="$tmp/etc/production.env"
export TRUCO_VPS_PROYECTO="$project"

sha=$(git rev-parse HEAD)
release=$sha
[[ -z $(git status --porcelain) ]] || release="$sha-sucio"
echo "$release" >> "$tmp/etiquetas"
main=$(git ls-remote origin refs/heads/main | cut -f1)

python3 -B scripts/vps.py .
dc() { docker compose -p "$project" "$@"; }
for service in web api identidad; do
  image=$(docker inspect --format '{{.Config.Image}}' "$(dc ps -q "$service")")
  [[ $image == "truco-oriental/$service:$release" ]] || { echo "$service corre $image" >&2; exit 1; }
done
[[ $(cat "$tmp/estado/manual") == "$main $release" ]] || { echo "Marca inesperada: $(cat "$tmp/estado/manual")" >&2; exit 1; }
[[ -f "$tmp/raiz/manuales/$release/infra/produccion/Caddyfile" ]]
# Caddy no tiene healthcheck y cada contenedor nuevo recibe otro puerto aleatorio.
portada() {
  local https
  https=$(dc port web 443 | sed 's/.*://')
  for _ in $(seq 1 30); do
    curl -fsk --resolve "mesa.internal:$https:127.0.0.1" "https://mesa.internal:$https/" -o /dev/null && return 0
    sleep 1
  done
  echo "La web no responde por HTTPS" >&2
  return 1
}
portada
api_id=$(dc ps -q api)

# Sólo la web: un cambio sin commit cambia la etiqueta y no reinicia la API.
web_release="$release"
if [[ $release != *-sucio ]]; then
  # Fuerza un árbol con cambios para probar la etiqueta -sucio sin tocar archivos versionados.
  touch .vps-ensayo-sin-commit
  web_release="$sha-sucio"
  echo "$web_release" >> "$tmp/etiquetas"
fi
python3 -B scripts/vps.py web
rm -f .vps-ensayo-sin-commit
[[ $(docker inspect --format '{{.Config.Image}}' "$(dc ps -q web)") == "truco-oriental/web:$web_release" ]]
[[ $(dc ps -q api) == "$api_id" ]] || { echo "La API se reinició al publicar sólo la web" >&2; exit 1; }
# backup no corre con las copias pausadas; el resto conserva su imagen con la etiqueta nueva.
for service in api identidad; do
  docker image inspect "truco-oriental/$service:$web_release" >/dev/null
done
[[ $(cat "$tmp/estado/manual") == "$main $web_release" ]]
portada
echo "Ensayo de npm run vps: correcto ($release, web $web_release)"
