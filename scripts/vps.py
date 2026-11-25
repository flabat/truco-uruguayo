#!/usr/bin/env python3
"""Publicar una rama, el árbol actual o sólo la web en el VPS de desarrollo.

    npm run vps                 # el árbol actual, con cambios sin commit incluidos
    npm run vps -- <rama>       # una rama (origin/<rama> si existe, si no la local)
    npm run vps -- web [rama]   # reconstruye y reemplaza sólo la imagen web

Construye las imágenes en esta máquina con la etiqueta del commit (`<commit>-sucio`
si hay cambios sin commit), las envía con `docker save | ssh <vps> docker load` y
hace `docker compose up` en el VPS con TRUCO_RELEASE. El host sale de TRUCO_VPS o
del alias `truco-vps` de ~/.ssh/config; nunca del repositorio. scripts/vps-ensayo.sh
lo prueba contra un contenedor local con sshd. docs/produccion.md
explica la preparación y cómo vuelve main.

Para sumar una opción: agregala en `parser()`, guardala en `Plan` dentro de
`plan()` y usala en `remote_script()` (en el VPS) o en `deploy()` (local).
"""
import argparse
from dataclasses import dataclass, field
import os
from pathlib import Path
import shlex
import subprocess
import sys
import tempfile

ALIAS = "truco-vps"
SERVICES = ("web", "api", "identidad", "backup")
# Lo que Compose monta desde el checkout en el VPS. Las imágenes llevan el resto.
REMOTE_FILES = ("compose.production.yaml", "infra/despliegue/imagenes.yaml", "infra/produccion")
PLATFORMS = {"x86_64": "linux/amd64", "amd64": "linux/amd64", "aarch64": "linux/arm64", "arm64": "linux/arm64"}


@dataclass
class Remote:
    """Rutas del VPS. Coinciden con infra/despliegue/desplegar.py; las variables sirven para ensayos."""
    root: str = "/opt/truco-oriental"
    state: str = "/var/lib/truco-deploy"
    config: str = "/etc/truco-oriental/production.env"
    project: str = "truco-produccion"

    @classmethod
    def from_env(cls, env=os.environ):
        return cls(root=env.get("TRUCO_VPS_RAIZ", cls.root), state=env.get("TRUCO_VPS_ESTADO", cls.state),
                   config=env.get("TRUCO_VPS_ENV", cls.config), project=env.get("TRUCO_VPS_PROYECTO", cls.project))


@dataclass
class Plan:
    ref: str | None  # None: el árbol actual.
    sha: str
    release: str  # Etiqueta de las imágenes y valor de TRUCO_RELEASE.
    services: tuple = SERVICES
    main: str = ""  # main de origin al publicar: el temporizador espera a que cambie.
    remote: Remote = field(default_factory=Remote)


def run(*args, **kwargs):
    return subprocess.run(args, check=True, text=True, **kwargs)


def out(*args, **kwargs):
    return run(*args, capture_output=True, **kwargs).stdout.strip()


def parser():
    p = argparse.ArgumentParser(prog="npm run vps --", description=__doc__.split("\n\n")[0])
    p.add_argument("destino", nargs="*", metavar="[web] [rama|.]",
                   help="«web» reemplaza sólo la imagen web; «.» o nada usa el árbol actual")
    return p


def parse(argv):
    args = parser().parse_args(argv)
    words = list(args.destino)
    args.web = "web" in words[:1]
    if args.web:
        words.pop(0)
    if len(words) > 1:
        parser().error("indicá una sola rama")
    args.ref = None if not words or words[0] == "." else words[0]
    return args


def release_tag(sha, dirty):
    return f"{sha}-sucio" if dirty else sha


def resolve(repo, ref):
    """Commit de la rama: prefiere origin/<rama> recién traída; si no, la referencia local."""
    if subprocess.run(["git", "-C", repo, "fetch", "--quiet", "origin", ref],
                      stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL).returncode == 0:
        return out("git", "-C", repo, "rev-parse", "--verify", "FETCH_HEAD^{commit}")
    return out("git", "-C", repo, "rev-parse", "--verify", f"{ref}^{{commit}}")


def plan(args, repo, env=os.environ):
    if args.ref is None:
        sha = out("git", "-C", repo, "rev-parse", "HEAD")
        dirty = bool(out("git", "-C", repo, "status", "--porcelain", "--untracked-files=normal"))
    else:
        sha, dirty = resolve(repo, args.ref), False
    try:
        main = out("git", "-C", repo, "ls-remote", "--exit-code", "origin", "refs/heads/main").split()[0]
    except subprocess.CalledProcessError:
        sys.exit("No se pudo leer main en origin: el temporizador necesita saber qué commit desplaza esta versión.")
    return Plan(ref=args.ref, sha=sha, release=release_tag(sha, dirty), main=main,
                services=("web",) if args.web else SERVICES, remote=Remote.from_env(env))


def host(env=os.environ):
    if env.get("TRUCO_VPS"):
        return env["TRUCO_VPS"]
    # ssh -G siempre responde; sin entrada en ~/.ssh/config el hostname queda igual al alias.
    config = dict(line.split(" ", 1) for line in out("ssh", "-G", ALIAS).splitlines() if " " in line)
    if config.get("hostname") == ALIAS:
        sys.exit(f"Definí TRUCO_VPS=usuario@host o un Host {ALIAS} en ~/.ssh/config.")
    return ALIAS


def ssh_command(target, command, env=os.environ):
    # TRUCO_VPS_SSH agrega opciones de ssh (por ejemplo "-i ~/.ssh/vps -p 2222").
    return ["ssh", "-o", "BatchMode=yes", *shlex.split(env.get("TRUCO_VPS_SSH", "")), target, command]


def platform(target, env=os.environ):
    if env.get("TRUCO_VPS_PLATAFORMA"):
        return env["TRUCO_VPS_PLATAFORMA"]
    machine = out(*ssh_command(target, "uname -m"))
    if machine not in PLATFORMS:
        sys.exit(f"Arquitectura del VPS desconocida: {machine}. Indicala con TRUCO_VPS_PLATAFORMA.")
    return PLATFORMS[machine]


def images(release, services):
    return [f"truco-oriental/{service}:{release}" for service in services]


def compose_build(tree, plan_, target_platform):
    env = dict(os.environ, TRUCO_RELEASE=plan_.release, DOCKER_DEFAULT_PLATFORM=target_platform,
               # Compose interpola todo el archivo; estos valores no llegan a las imágenes.
               SITE_HOST="staging.invalid", RESTIC_REPOSITORY="rest:https://backup.invalid/", RESTIC_PASSWORD="unused",
               POSTGRES_PASSWORD="unused", GAME_DB_PASSWORD="unused", ID_DB_PASSWORD="unused",
               KC_ADMIN_PASSWORD="unused", KEYCLOAK_API_CLIENT_SECRET="unused")
    run("docker", "compose", "-p", "truco-vps-construccion", "-f", Path(tree) / "compose.production.yaml",
        "-f", Path(tree) / "infra/despliegue/imagenes.yaml", "build", *plan_.services, env=env)


def pipe(producer, consumer):
    """producer | consumer, con error si falla cualquiera de los dos."""
    first = subprocess.Popen(producer, stdout=subprocess.PIPE)
    second = subprocess.Popen(consumer, stdin=first.stdout)
    first.stdout.close()
    codes = second.wait(), first.wait()
    if any(codes):
        raise subprocess.CalledProcessError(next(code for code in codes if code), producer)


def remote_script(plan_):
    r = plan_.remote
    directory = f"{r.root}/manuales/{plan_.release}"
    q = shlex.quote
    keep = " ".join(q(service) for service in SERVICES if service not in plan_.services)
    return f"""set -eu
release={q(plan_.release)}
directory={q(directory)}
dc() {{ docker compose -p {q(r.project)} --env-file {q(r.config)} -f "$directory/compose.production.yaml" -f "$directory/infra/despliegue/imagenes.yaml" "$@"; }}
export TRUCO_RELEASE="$release"
# Mismo candado que truco-deploy.service: el temporizador no corre a la vez.
mkdir -p {q(r.state)}
exec 9>{q(r.state + "/lock")}
flock -w 900 9
# Sólo se reemplazan los servicios pedidos: el resto conserva su imagen con la etiqueta nueva.
for service in {keep}; do
  container=$(dc ps -a -q "$service" 2>/dev/null || true)
  if [ -n "$container" ]; then
    docker tag "$(docker inspect --format '{{{{.Config.Image}}}}' "$container")" "truco-oriental/$service:$release"
  else
    echo "Aviso: $service no tiene contenedor; un despliegue completo lo vuelve a construir." >&2
  fi
done
paused=
if [ -f {q(os.path.dirname(r.config) + "/copias-pausadas")} ]; then
  # Como desplegar.py: sin copias externas no se arranca backup.
  paused=1
  export RESTIC_REPOSITORY=/dev/null RESTIC_PASSWORD=unused
fi
# Como `up --wait`, pero tolera que un servicio lento (Keycloak en su primer arranque)
# pase por unhealthy antes de estar sano. Falla si un contenedor termina.
esperar() {{
  limite=$(($(date +%s) + 600))
  while :; do
    pendientes=
    for service in "$@"; do
      estado=$(docker inspect --format '{{{{.State.Status}}}} {{{{if .State.Health}}}}{{{{.State.Health.Status}}}}{{{{end}}}}' "$(dc ps -q "$service")")
      case "$estado" in
        "running healthy"|"running ") ;;
        running*) pendientes="$pendientes $service" ;;
        *) echo "$service quedó en estado $estado" >&2; dc logs --tail=40 "$service" >&2; return 1 ;;
      esac
    done
    [ -z "$pendientes" ] && return 0
    if [ "$(date +%s)" -ge "$limite" ]; then
      echo "Sin salud después de 10 minutos:$pendientes" >&2
      dc logs --tail=40 $pendientes >&2
      return 1
    fi
    sleep 5
  done
}}
if [ -n "{keep}" ]; then
  dc up -d --no-build --no-deps web
  esperar web
elif [ -n "$paused" ]; then
  dc rm --stop --force backup
  dc up -d --no-build db identidad api web
  esperar db identidad api web
else
  # Copia antes de una posible migración, si ya hay base.
  if docker volume ls -q --filter label=com.docker.compose.project={q(r.project)} --filter label=com.docker.compose.volume=postgres | grep -q .; then
    dc run --rm --no-deps -T backup guardar
  fi
  dc up -d --no-build
  esperar $(dc config --services)
fi
printf '%s %s\\n' {q(plan_.main)} "$release" > {q(r.state + "/manual.next")}
mv {q(r.state + "/manual.next")} {q(r.state + "/manual")}
# Conservar las dos versiones manuales más nuevas y sus imágenes.
ls -1t {q(r.root + "/manuales")} | tail -n +3 | while read -r old; do
  [ "$old" = "$release" ] && continue
  if [ ! -d {q(r.root + "/automaticas")}/"$old" ]; then
    for service in {" ".join(SERVICES)}; do docker image rm "truco-oriental/$service:$old" >/dev/null 2>&1 || true; done
  fi
  rm -rf {q(r.root + "/manuales")}/"$old"
done
echo "Publicado $release en el VPS"
"""


def deploy(plan_, repo, target, env=os.environ):
    target_platform = platform(target, env)
    with tempfile.TemporaryDirectory(prefix="truco-vps-") as tmp:
        if plan_.ref is None:
            tree = repo
        else:
            tree = Path(tmp) / "arbol"
            tree.mkdir()
            pipe(["git", "-C", repo, "archive", plan_.sha], ["tar", "-x", "-C", str(tree)])
        print(f"Construyendo {plan_.release} para {target_platform}: {', '.join(plan_.services)}", flush=True)
        compose_build(tree, plan_, target_platform)
        print(f"Enviando imágenes a {target}", flush=True)
        pipe(["docker", "save", *images(plan_.release, plan_.services)],
             ssh_command(target, "docker load"))
        directory = f"{plan_.remote.root}/manuales/{plan_.release}"
        pipe(["tar", "-c", "-C", str(tree), *REMOTE_FILES],
             ssh_command(target, f"rm -rf {shlex.quote(directory)} && mkdir -p {shlex.quote(directory)} && "
                                 f"tar -x -C {shlex.quote(directory)}"))
    run(*ssh_command(target, "sh -s"), input=remote_script(plan_))


def main(argv=None):
    args = parse(sys.argv[1:] if argv is None else argv)
    repo = out("git", "rev-parse", "--show-toplevel")
    target = host()
    plan_ = plan(args, repo)
    deploy(plan_, repo, target)


if __name__ == "__main__":
    try:
        main()
    except subprocess.CalledProcessError as error:
        sys.exit(f"Falló: {shlex.join(map(str, error.cmd))}")
