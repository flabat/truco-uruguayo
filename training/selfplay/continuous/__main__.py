"""Continue a local Truco league across consecutive verified pilots."""

import argparse
import fcntl
import hashlib
import io
import json
import os
import plistlib
import shlex
import subprocess
import sys
import tempfile
import zipfile
from contextlib import contextmanager
from pathlib import Path


@contextmanager
def locked(path):
    with path.open("a+") as file:
        fcntl.flock(file, fcntl.LOCK_EX)
        yield


def publish(path, data, mode):
    """Publish a complete file atomically, including on simultaneous installs."""
    with tempfile.NamedTemporaryFile(dir=path.parent) as tmp:
        tmp.write(data)
        tmp.flush()
        os.fchmod(tmp.fileno(), mode)
        try:
            os.link(tmp.name, path)
        except FileExistsError:
            if path.is_symlink() or not path.is_file() or path.read_bytes() != data:
                raise ValueError(f"Another file already exists at {path}")


def install(root, source):
    protocol = json.loads((root / "protocol.json").read_bytes())
    manifest = json.loads((root / "ops/runtime-manifest.json").read_bytes())
    if (manifest.get("schema") != "standalone-selfplay-v1" or
            protocol.get("computerOnly") is not True or protocol.get("signals") != "senas-equipo-v1" or
            protocol.get("formats") != ["duel", "pairs", "pairs-private-senas"] or
            not os.access(root / "league", os.X_OK)):
        raise ValueError("Select a standalone computer-only league with private teammate signals.")
    stream = io.BytesIO()
    stream.write(b"#!/usr/bin/env python3\n")
    with zipfile.ZipFile(stream, "w") as archive:
        for name in ("__main__.py", "worker.py"):
            archive.writestr(zipfile.ZipInfo(name), (source / name).read_bytes())
    command = root / "continuous"
    publish(command, stream.getvalue(), 0o755)
    if not os.access(command, os.X_OK):
        raise ValueError(f"The existing file is not executable: {command}")
    print(f"Installed {command}\nStart with: {shlex.quote(str(command))} start")


def service(root):
    key = hashlib.sha256(os.fsencode(root)).hexdigest()[:14]
    label = f"local.truco.{key}.continuous"
    return label, Path.home() / "Library/LaunchAgents" / (label + ".plist")


def definition(root):
    label, _ = service(root)
    ops = root / "ops/continuous"
    env = {"PATH": os.pathsep.join([str(Path(sys.executable).parent), os.environ.get("PATH", os.defpath)])}
    if os.environ.get("TRUCO_NODE"):
        env["TRUCO_NODE"] = os.environ["TRUCO_NODE"]
    return {"Label": label, "ProgramArguments": [sys.executable, "-B", str(root / "continuous"), "_tick"],
            "EnvironmentVariables": env, "RunAtLoad": True, "StartInterval": 60,
            "WorkingDirectory": str(root), "StandardOutPath": str(ops / "service.log"),
            "StandardErrorPath": str(ops / "service-errors.log")}


def registration(root):
    binding = root / "ops/continuous/registration.plist"
    saved = binding.read_bytes() if binding.is_file() else None
    origin = Path(plistlib.loads(saved)["WorkingDirectory"]) if saved else root
    if not origin.is_absolute():
        raise ValueError(f"Invalid service registration record: {binding}")
    return binding, saved, origin


def inspect_service(root, expected):
    """Check the plist on disk and the origin of the job in the login domain."""
    label, plist = service(root)
    if plist.is_symlink():
        raise ValueError(f"Refusing to manage a symlink: {plist}")
    if plist.exists() and plist.read_bytes() != expected:
        raise ValueError(f"LaunchAgent file belongs to a different configuration: {plist}")
    domain = f"gui/{os.getuid()}"
    job = f"{domain}/{label}"
    info = subprocess.run(["launchctl", "print", job], capture_output=True, text=True)
    if info.returncode:
        if "could not find service" not in info.stderr.lower():
            raise ValueError(f"Cannot inspect {job}: {info.stderr.strip()}")
        return False
    paths = [line.strip()[7:] for line in info.stdout.splitlines() if line.strip().startswith("path = ")]
    if not paths or Path(paths[0]) != plist or not plist.is_file():
        raise ValueError(f"Loaded job {label} differs from {plist}.")
    return True


def operate(root, start):
    if sys.platform != "darwin":
        raise ValueError("Background continuation requires a logged-in macOS user.")
    ops = root / "ops/continuous"
    ops.mkdir(parents=True, exist_ok=True)
    enabled = ops / "enabled"
    with locked(ops / "service.lock"):
        binding, saved, origin = registration(root)
        if origin != root and origin.exists():
            raise ValueError(f"The registered run still exists at {origin}. Manage it from that directory.")
        if start and origin != root:
            raise ValueError(f"This run was registered at {origin}. Stop the old registration first.")
        label, plist = service(origin)
        domain = f"gui/{os.getuid()}"
        if not start:
            enabled.unlink(missing_ok=True)
        # The enabled marker is cleared before waiting for an in-flight preparation.
        # A stopped controller cannot launch another run after this fence.
        with locked(ops / "tick.lock"):
            loaded = inspect_service(origin, saved)
            if start:
                state = ops / "state.json"
                if not state.exists():
                    publish(state, json.dumps({"current": str(root)}).encode(), 0o600)
                plist.parent.mkdir(parents=True, exist_ok=True)
                if saved is None:
                    saved = plistlib.dumps(definition(root))
                    publish(binding, saved, 0o600)
                publish(plist, saved, 0o644)
                if (ops / "error.txt").is_file():
                    from worker import clear_error
                    clear_error(root)
                enabled.touch()
                if not loaded:
                    try:
                        subprocess.run(["launchctl", "bootstrap", domain, str(plist)], check=True)
                    except subprocess.CalledProcessError:
                        if not inspect_service(origin, saved):
                            enabled.unlink(missing_ok=True)
                            raise
                print(f"Automatic pilots enabled. Check progress with {shlex.quote(str(root / 'continuous'))} status")
            else:
                if loaded:
                    subprocess.run(["launchctl", "bootout", f"{domain}/{label}"], check=True)
                plist.unlink(missing_ok=True)
                binding.unlink(missing_ok=True)
                print("Automatic pilots stopped. A running pilot can finish.")


def status(root):
    ops = root / "ops/continuous"
    enabled = (ops / "enabled").is_file()
    _, saved, origin = registration(root)
    print(f"Automatic pilots: {'enabled' if enabled else 'disabled'}")
    if origin != root:
        print(f"Registered directory: {origin} (this run has moved)")
    if sys.platform == "darwin":
        try:
            loaded = inspect_service(origin, saved)
            print(f"LaunchAgent: {'loaded' if loaded else 'not loaded'}")
        except (OSError, ValueError, plistlib.InvalidFileException) as exc:
            print(f"LaunchAgent status unavailable: {exc}")
    else:
        print("LaunchAgent status is available on macOS.")
    error = ops / "error.txt"
    if error.exists():
        print(f"Continuation needs attention: {error.read_text().strip()}")
    state = ops / "state.json"
    current = Path(json.loads(state.read_bytes())["current"]) if state.is_file() else root
    if not current.is_absolute() or current.resolve().parent != root.parent:
        raise ValueError(f"Current pilot is outside this run directory's parent: {current}")
    print(f"Current pilot: {current}", flush=True)
    subprocess.run([str(current / "league"), "status"], check=True)


def main():
    invoked = Path(sys.argv[0]).resolve()
    parser = argparse.ArgumentParser(description=__doc__)
    if invoked.is_dir() or invoked.suffix == ".py":
        parser.add_argument("command", choices=["install"])
        parser.add_argument("run", type=Path)
        args = parser.parse_args()
        install(args.run.resolve(), invoked if invoked.is_dir() else invoked.parent)
        return
    parser.add_argument("command", choices=["start", "stop", "status", "_tick"])
    args = parser.parse_args()
    root = invoked.parent
    if args.command == "_tick":
        from worker import step
        step(root)
    elif args.command == "status":
        status(root)
    else:
        operate(root, args.command == "start")


if __name__ == "__main__":
    try:
        main()
    except (OSError, ValueError, KeyError, plistlib.InvalidFileException, subprocess.CalledProcessError) as exc:
        sys.exit(f"continuous: {exc}")
