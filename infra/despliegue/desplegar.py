#!/usr/bin/env python3
"""Publicación desde main. systemd serializa ejecuciones y conserva su registro."""
import json
import os
from pathlib import Path
import re
import shutil
import subprocess
import tempfile
import urllib.request

REPO = "flabat/truco-uruguayo"
REMOTE = f"https://github.com/{REPO}.git"
ROOT = Path("/opt/truco-oriental")
RELEASES = ROOT / "automaticas"
STATE = Path("/var/lib/truco-deploy")
CONFIG = Path("/etc/truco-oriental/production.env")
PROJECT = "truco-produccion"
SHA = re.compile(r"[0-9a-f]{40}")


def run(*args, **kwargs):
    return subprocess.run(args, check=True, text=True, **kwargs)


def main_head():
    value = run("git", "ls-remote", "--exit-code", REMOTE, "refs/heads/main",
                capture_output=True).stdout.split()
    if len(value) != 2 or value[1] != "refs/heads/main" or not SHA.fullmatch(value[0]):
        raise ValueError("Respuesta inesperada para main")
    return value[0]


def verified(sha):
    url = (f"https://api.github.com/repos/{REPO}/actions/workflows/check.yml/runs"
           f"?branch=main&event=push&head_sha={sha}&per_page=1")
    req = urllib.request.Request(url, headers={"User-Agent": "truco-deploy"})
    with urllib.request.urlopen(req, timeout=20) as response:
        runs = json.load(response)["workflow_runs"]
    if not runs:
        return False
    last = runs[0]
    return (last["head_sha"] == sha and last["event"] == "push" and last["head_branch"] == "main"
            and last["status"] == "completed" and last["conclusion"] == "success")


def compose(sha, *command, build_only=False, **kwargs):
    directory = RELEASES / sha
    env = dict(os.environ, TRUCO_RELEASE=sha)
    if build_only:
        env.update(SITE_HOST="staging.invalid", RESTIC_REPOSITORY="rest:https://backup.invalid/")
    return run("docker", "compose", "-p", PROJECT, "--env-file", CONFIG,
               "-f", directory / "compose.production.yaml",
               "-f", directory / "infra/despliegue/imagenes.yaml", *command, env=env, **kwargs)


def point(name, directory):
    tmp = ROOT / (name + ".next")
    tmp.unlink(missing_ok=True)
    tmp.symlink_to(directory)
    tmp.replace(ROOT / name)


def stage(sha):
    directory = RELEASES / sha
    if not directory.exists():
        cache = STATE / "repo.git"
        run("git", "init", "--bare", "-q", cache)
        git = ["git", "--git-dir", cache]
        run(*git, "fetch", "--quiet", "--no-tags", "--depth=1", REMOTE, "refs/heads/main")
        if run(*git, "rev-parse", "FETCH_HEAD", capture_output=True).stdout.strip() != sha:
            return False
        with tempfile.TemporaryDirectory(dir=RELEASES) as tmp:
            archive = Path(tmp) / "main.tar"
            run(*git, "archive", "--output", archive, sha)
            tree = Path(tmp) / "src"
            tree.mkdir()
            run("tar", "-xf", archive, "-C", tree)
            tree.rename(directory)
    if (ROOT / "staged").resolve() != directory:
        compose(sha, "build", build_only=True)
        compose(sha, "pull", "db", "identidad", build_only=True)
        point("staged", directory)
    return True


def configured(sha):
    # Compose interpreta su propio dotenv. Sólo se registran nombres de campos.
    try:
        compose(sha, "config", "--quiet", capture_output=True)
    except subprocess.CalledProcessError as error:
        if any(f"required variable {field} " in error.stderr for field in ("SITE_HOST", "RESTIC_REPOSITORY")):
            return False
        raise RuntimeError("Configuración de producción inválida; revisar con compose config --quiet") from None
    return True


def prepare_data(sha):
    # El primer arranque exige un repositorio ya inicializado. Una base previa,
    # incluso de un despliegue manual, requiere una copia antes de migrar.
    compose(sha, "run", "--rm", "--no-deps", "-T", "backup", "listar")
    volumes = run("docker", "volume", "ls", "-q", "--filter", f"label=com.docker.compose.project={PROJECT}",
                  "--filter", "label=com.docker.compose.volume=postgres", capture_output=True).stdout.strip()
    if not volumes:
        return
    # Incluso "run --no-deps backup iniciar" puede crear el volumen vacío.
    # Una base existente o parcialmente inicializada siempre requiere la copia.
    volume, = volumes.splitlines()
    contents = run("docker", "run", "--rm", "--network", "none", "--mount",
                   f"type=volume,source={volume},target=/datos,readonly,volume-nocopy",
                   "--entrypoint", "find", f"truco-oriental/backup:{sha}",
                   "/datos", "-mindepth", "1", "-maxdepth", "1", "-print", "-quit", capture_output=True)
    if contents.stdout.strip():
        compose(sha, "run", "--rm", "--no-deps", "-T", "backup", "guardar")


def cleanup():
    keep = {(ROOT / name).resolve() for name in ("current", "previous", "staged")}
    for directory in RELEASES.iterdir():
        if directory in keep or not SHA.fullmatch(directory.name):
            continue
        for svc in ("web", "api", "backup"):
            image = f"truco-oriental/{svc}:{directory.name}"
            if subprocess.run(["docker", "image", "inspect", image], stdout=subprocess.DEVNULL,
                              stderr=subprocess.DEVNULL).returncode == 0:
                run("docker", "image", "rm", image)
        shutil.rmtree(directory)


def deploy():
    RELEASES.mkdir(parents=True, exist_ok=True)
    sha = main_head()
    directory = RELEASES / sha
    current = (ROOT / "current").resolve()
    pending = STATE / "pendiente"
    if current == directory and not pending.exists():
        return
    if not verified(sha):
        print(f"Esperando CI verde de main {sha}", flush=True)
        return
    if not stage(sha):
        return
    if not configured(sha):
        print(f"Preparado {sha}; falta el dominio o el destino de copias.", flush=True)
        if not pending.exists():
            cleanup()
        return
    if main_head() != sha:
        return
    if not pending.is_file() or pending.read_text().strip() != sha:
        prepare_data(sha)
        if main_head() != sha:
            return
        # No sustituir la copia previa si up falla tras aplicar una migración.
        tmp = STATE / "pendiente.next"
        tmp.write_text(sha + "\n")
        tmp.replace(pending)
    compose(sha, "up", "-d", "--no-build", "--wait", "--wait-timeout", "600")
    # Caddy no tiene healthcheck en Compose: verificar el ingreso público con TLS.
    compose(sha, "exec", "-T", "api", "node", "--input-type=module", "-e",
            "for (const path of ['/', '/realms/mesa/.well-known/openid-configuration']) {"
            "const r=await fetch(process.env.WEB_ORIGIN+path,{signal:AbortSignal.timeout(15000)});"
            "if(!r.ok) throw Error(path+' HTTP '+r.status);"
            "if(path!=='/' && (await r.json()).issuer!==process.env.OIDC_ISSUER) throw Error('Emisor');}")
    if current.is_dir() and current != directory:
        point("previous", current)
    point("current", directory)
    pending.unlink(missing_ok=True)
    cleanup()
    print(f"Publicado main {sha}", flush=True)


if __name__ == "__main__":
    deploy()
