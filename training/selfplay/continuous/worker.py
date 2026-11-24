"""Advance an opted-in local pilot series by at most one generation per tick."""

import fcntl
import hashlib
import json
import os
from pathlib import Path
import re
import subprocess
import sys
import time
from tempfile import NamedTemporaryFile


def save(path, contents):
    with NamedTemporaryFile("w", dir=path.parent, delete=False, encoding="utf-8") as temp:
        temp.write(contents)
        temp.flush()
        os.fsync(temp.fileno())
    os.replace(temp.name, path)


def read(path):
    data = json.loads(path.read_bytes())
    if not isinstance(data, dict):
        raise ValueError(f"Invalid record: {path}")
    return data


def digest(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def next_path(run):
    match = re.search(r"[0-9]+$", run.name)
    if not match:
        return run.with_name(run.name + "-02")
    digits = match.group()
    return run.with_name(run.name[:match.start()] + str(int(digits) + 1).zfill(len(digits)))


def frozen(run):
    manifest_file = run / "ops/runtime-manifest.json"
    manifest = read(manifest_file)
    if (manifest.get("schema") != "standalone-selfplay-v1"
            or (run / "READY").read_text().strip() != digest(manifest_file)
            or manifest.get("launcherSha256") != digest(run / "league")
            or manifest.get("protocolSha256") != digest(run / "protocol.json")):
        raise ValueError(f"Frozen run receipt does not match: {run}")
    return manifest


def active(run):
    try:
        with (run / "ops/supervisor.lock").open("rb") as lock:
            fcntl.flock(lock, fcntl.LOCK_SH | fcntl.LOCK_NB)
    except BlockingIOError:
        return True
    except FileNotFoundError:
        pass
    return False


def command(run, *args):
    result = subprocess.run([str(run / "league"), *map(str, args)], stdout=subprocess.PIPE,
                            stderr=subprocess.STDOUT, text=True)
    if result.returncode:
        raise ValueError(f"{run}/league {args[0]} failed ({result.returncode}): {result.stdout.strip()}")


def successor(run, state, store):
    target = next_path(run)
    parent = frozen(run)
    if "pending" not in state:
        if os.path.lexists(target):
            raise ValueError(f"Next pilot directory already exists: {target}")
        # Claim only an absent destination. This survives an exit after next
        # publishes the child, but before we can record it as current.
        state.update(pending=str(target), parentProtocolSha256=parent["protocolSha256"])
        store()
    if state["pending"] != str(target) or state["parentProtocolSha256"] != parent["protocolSha256"]:
        raise ValueError(f"Pending handoff disagrees with {run}")
    if not os.path.lexists(target):
        command(run, "next", target, "--prepare-only")
    if target.is_symlink():
        raise ValueError(f"Unexpected link at {target}")
    child = frozen(target)
    protocol = read(target / "protocol.json")
    if (any(parent[k] != child[k] for k in ("source", "files", "node"))
            or protocol.get("parent", {}).get("protocolSha256") != parent["protocolSha256"]
            or protocol.get("profile") != "local-pilot"
            or not protocol.get("seed") or protocol["seed"] == read(run / "protocol.json").get("seed")
            or protocol.get("computerOnly") is not True or protocol.get("signals") != "senas-equipo-v1"
            or protocol.get("formats") != ["duel", "pairs", "pairs-private-senas"]):
        raise ValueError(f"Prepared pilot does not match its parent: {target}")
    state.clear()
    state.update(current=str(target), currentProtocolSha256=child["protocolSha256"])
    store()
    return target


def advance(root, ops):
    record = ops / "state.json"
    state = read(record)

    def store():
        save(record, json.dumps(state) + "\n")

    run = Path(state["current"])
    if run.parent != root.parent or run.is_symlink():
        raise ValueError(f"Unexpected current pilot: {run}")
    identity = digest(run / "protocol.json")
    if "currentProtocolSha256" not in state:
        state["currentProtocolSha256"] = identity
        store()
    elif identity != state["currentProtocolSha256"]:
        raise ValueError(f"The current pilot's protocol changed: {run}")
    summary = run / "ops/summary.json"
    if summary.exists():
        outcome = read(summary)
        if outcome.get("state") != "complete":
            raise ValueError(f"{run} ended {outcome.get('state')}: {outcome.get('message', '')}")
        run = successor(run, state, store)
    else:
        schedule = run / "ops/schedule.json"
        if schedule.exists():
            stage = read(schedule)
            if stage.get("status") == "attention":
                raise ValueError(f"{run} needs attention: {stage.get('message', '')}")
    if active(run):
        if "resumeRequestedAt" in state:
            state.pop("resumeRequestedAt")
            state.pop("resumeAttempts", None)
            store()
        return
    if not (ops / "enabled").is_file():
        return
    now = time.time()
    if "resumeRequestedAt" in state and 0 <= now - state["resumeRequestedAt"] < 120:
        return
    if state.get("resumeAttempts", 0) >= 3:
        raise ValueError(f"Supervisor did not start for {run}. Inspect its ops/supervisor-errors.log.")
    frozen(run)
    state.update(resumeRequestedAt=now, resumeAttempts=state.get("resumeAttempts", 0) + 1)
    store()
    command(run, "resume")


def step(root: Path):
    root = root.resolve()
    ops = root / "ops/continuous"
    enabled = ops / "enabled"
    error = ops / "error.txt"
    if not enabled.is_file():
        return
    with (ops / "tick.lock").open("a") as lock:
        try:
            fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
        except BlockingIOError:
            return
        if enabled.is_file() and not error.exists():
            try:
                advance(root, ops)
            except (OSError, ValueError, KeyError, TypeError) as exc:
                save(error, str(exc) + "\n")


def clear_error(root: Path):
    """Explicitly retry a suspended series. The caller holds tick.lock."""
    ops = root / "ops/continuous"
    error = ops / "error.txt"
    if error.exists():
        record = ops / "state.json"
        state = read(record)
        state.pop("resumeRequestedAt", None)
        state.pop("resumeAttempts", None)
        save(record, json.dumps(state) + "\n")
        error.unlink()


if __name__ == "__main__":
    step(Path(sys.argv[1]))
