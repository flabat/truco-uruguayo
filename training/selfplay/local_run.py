"""Freeze and verify the inputs and executable code for a local self-play league."""

from __future__ import annotations

import hashlib
import io
import json
import os
import re
import shutil
import subprocess
import tarfile
import tempfile
from pathlib import Path


CHECKOUT = Path(__file__).resolve().parents[2]
RUNTIME_PATHS = (
    "package.json", "api/package.json", "api/actor-registry.ts", "paquetes/motor",
    "training/anchored", "training/arena", "training/baselines", "training/contracts",
    "training/duel/actor.ts", "training/duel/math.ts", "training/eval/statistics.ts",
    "training/partners/policy.ts", "training/seat", "training/selfplay", "training/signals",
)
MANIFEST = Path("ops/runtime-manifest.json")
# Node resuelve @eltruco/motor por este enlace. Apunta fuera de node_modules para que
# Node pueda quitar los tipos de los .ts del paquete.
MOTOR_LINK = "node_modules/@eltruco/motor"
MOTOR_TARGET = "../../paquetes/motor"


def digest(path: Path) -> str:
    if path.is_symlink() or not path.is_file():
        raise ValueError(f"Falta el archivo regular {path}.")
    result = hashlib.sha256()
    with path.open("rb") as stream:
        for chunk in iter(lambda: stream.read(1024 * 1024), b""):
            result.update(chunk)
    return result.hexdigest()


def tree_hashes(directory: Path, relative_to: Path) -> dict:
    if directory.is_symlink() or not directory.is_dir():
        raise ValueError(f"Falta el directorio congelado {directory}.")
    files = {}
    for path in directory.rglob("*"):
        if path.is_symlink():
            name = path.relative_to(relative_to).as_posix()
            if name != MOTOR_LINK:
                raise ValueError(f"Enlace inesperado en los archivos congelados: {path}")
            target = os.readlink(path)
            if target != MOTOR_TARGET:
                raise ValueError(f"Cambió el enlace {name}: apunta a {target}")
            files[name] = f"symlink:{target}"
            continue
        # Finder can create this file when the operator opens a run directory.
        if path.is_dir() or path.name == ".DS_Store":
            continue
        files[path.relative_to(relative_to).as_posix()] = digest(path)
    return files


def check_files(expected: dict, actual: dict, label: str):
    for path in sorted(expected.keys() | actual.keys()):
        if expected.get(path) != actual.get(path):
            raise ValueError(f"Cambió {label}: {path}")


def node_version(node: str) -> str:
    version = subprocess.check_output([node, "--version"], text=True).strip()
    if not re.fullmatch(r"v24\.\d+\.\d+", version):
        raise ValueError(f"La liga requiere Node 24. La versión encontrada es {version}.")
    return version


def freeze_runtime(runtime: Path) -> str:
    git = ["git", "-C", str(CHECKOUT)]
    revision = subprocess.check_output([*git, "rev-parse", "--verify", "HEAD"], text=True).strip()
    archive = subprocess.check_output([*git, "archive", "--format=tar", revision, "--", *RUNTIME_PATHS])
    with tarfile.open(fileobj=io.BytesIO(archive)) as members:
        for member in members:
            name = Path(member.name)
            if name.is_absolute() or ".." in name.parts or not (member.isdir() or member.isreg()):
                raise ValueError(f"Entrada inesperada en el checkout: {member.name}")
            target = runtime / name
            if member.isdir():
                target.mkdir(parents=True, exist_ok=True)
            else:
                target.parent.mkdir(parents=True, exist_ok=True)
                with members.extractfile(member) as source, target.open("xb") as output:
                    shutil.copyfileobj(source, output)
    if (runtime / "paquetes/motor").is_dir():
        link = runtime / MOTOR_LINK
        link.parent.mkdir(parents=True)
        link.symlink_to(MOTOR_TARGET, target_is_directory=True)
    return revision


def write_launcher(run: Path, node: str):
    launcher = run / "league"
    launcher.write_text(f"""#!/usr/bin/env python3
import argparse
import os
import sys
from pathlib import Path

commands = sys.argv[1:] or ["status"]
run = Path(__file__).resolve().parent
if commands[0] == "next":
    parser = argparse.ArgumentParser(prog="league next", allow_abbrev=False)
    parser.add_argument("new_run", type=Path)
    parser.add_argument("--profile", choices=("pilot", "extended"), default="pilot")
    parser.add_argument("--prepare-only", action="store_true")
    args = parser.parse_args(commands[1:])
    arguments = ["start", str(args.new_run.resolve()), "--from", str(run), "--profile", args.profile]
    if args.prepare_only:
        arguments.append("--prepare-only")
elif len(commands) == 1 and commands[0] in ("resume", "status", "results"):
    arguments = [commands[0], str(run)]
else:
    sys.exit("Usage: league [resume|status|results] or league next NEW_RUN [--profile pilot|extended] [--prepare-only]")
saved_node = {str(Path(shutil.which(node) or node).resolve())!r}
if not os.environ.get("TRUCO_NODE"):
    os.environ.pop("TRUCO_NODE", None)
    if os.path.isfile(saved_node) and os.access(saved_node, os.X_OK):
        os.environ["TRUCO_NODE"] = saved_node
os.execv(sys.executable, [sys.executable, "-B", str(run / "runtime/training/selfplay/local.py"),
                          *arguments])
""")
    launcher.chmod(0o755)


def verify_run(run: Path, node: str) -> dict:
    """Validate a standalone run before launch, without consulting Git or its parent."""
    manifest_file = run / MANIFEST
    if (run / "READY").read_text().strip() != digest(manifest_file):
        raise ValueError("El recibo READY no corresponde al manifiesto de la corrida.")
    manifest = json.loads(manifest_file.read_bytes())
    if manifest.get("schema") != "standalone-selfplay-v1":
        raise ValueError("Se requiere una corrida preparada con el comando local.")
    if node_version(node) != manifest["node"]:
        raise ValueError(f"Para reanudar esta corrida usá Node {manifest['node']}.")
    if digest(run / "league") != manifest["launcherSha256"]:
        raise ValueError("Cambió el comando local de la corrida.")
    protocol_file = run / "protocol.json"
    if digest(protocol_file) != manifest["protocolSha256"]:
        raise ValueError("Cambió protocol.json desde la preparación.")
    protocol = json.loads(protocol_file.read_bytes())
    runtime = run / "runtime"
    check_files(manifest["files"], tree_hashes(runtime, runtime), "el código congelado")
    inputs = tree_hashes(run / "input", run)
    inputs.update(tree_hashes(run / "evaluation-input", run))
    check_files(protocol["files"], inputs, "un insumo congelado")
    return protocol


def prepare_run(run: Path, parent: Path, profile: str, node: str) -> dict:
    """Prepare privately and publish a complete run with its release marker."""
    if profile not in ("local-pilot", "extended"):
        raise ValueError(f"Perfil local desconocido: {profile}")
    if os.path.lexists(run):
        raise FileExistsError(f"El directorio de destino ya existe: {run}")
    parent = parent.resolve()
    if parent in run.resolve().parents:
        raise ValueError("El destino debe quedar fuera de la liga anterior.")
    version = node_version(node)
    run.parent.mkdir(parents=True, exist_ok=True)
    with tempfile.TemporaryDirectory(prefix=".preparando-liga-", dir=run.parent) as scratch:
        staging = Path(scratch).resolve() / "league"
        runtime = staging / "runtime"
        if CHECKOUT == parent / "runtime":
            # Running the previous league's shortcut must also work on a Mac
            # with only the run directory and no Git checkout.
            verify_run(parent, node)
            inherited = json.loads((parent / MANIFEST).read_bytes())
            shutil.copytree(CHECKOUT, runtime, symlinks=True, ignore=shutil.ignore_patterns(".DS_Store"))
            check_files(inherited["files"], tree_hashes(runtime, runtime), "el código copiado")
            revision = inherited["source"]
        else:
            revision = freeze_runtime(runtime)
        # The frozen preparer validates the parent's completion receipts, models and
        # paired outcomes, then creates a new protocol with a fresh random seed.
        subprocess.run([
            node, str(runtime / "training/selfplay/prepare.ts"), "--completed-parent",
            str(staging), str(parent), profile,
        ], cwd=runtime, check=True)
        write_launcher(staging, node)
        manifest = {
            "schema": "standalone-selfplay-v1", "source": revision, "node": version,
            "protocolSha256": digest(staging / "protocol.json"),
            "launcherSha256": digest(staging / "league"),
            "files": tree_hashes(runtime, runtime),
        }
        receipt = staging / MANIFEST
        receipt.parent.mkdir(parents=True, exist_ok=True)
        receipt.write_text(json.dumps(manifest, sort_keys=True, indent=2) + "\n")
        (staging / "READY").write_text(digest(receipt) + "\n")
        protocol = verify_run(staging, node)
        if os.path.lexists(run):
            raise FileExistsError(f"El directorio de destino ya existe: {run}")
        staging.rename(run)
        return protocol
