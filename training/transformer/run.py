#!/usr/bin/env python3
"""Run or inspect a Ceibo history experiment from a terminal."""

import fcntl
import json
import os
from pathlib import Path
import shutil
import subprocess
import sys


def status(run):
    for name in ("plan", "model", "progress", "evaluation", "result"):
        path = run / f"{name}.json"
        if not path.exists():
            continue
        data = json.loads(path.read_text())
        if name == "evaluation":
            data = {"completedPairs": len(data["results"]), "checkpoint": data["checkpoint"]}
        print(f"{name}: {json.dumps(data, ensure_ascii=False)}")


def main():
    if len(sys.argv) < 2 or sys.argv[1] == "--help":
        print("Usage: python3 training/transformer/run.py RUN [--ceibo FILE] [--format FORMAT]"
              " [--seed N] [--warmup N] [--rounds N] [--batch N] [--pairs N] [--stopAfter N]\n"
              "Resume: give the same RUN directory alone. Inspect: give RUN --status.\n"
              "Set NODE or TRUCO_PYTHON to override the executable paths.")
        return 0
    run = Path(sys.argv[1]).resolve()
    if sys.argv[2:] == ["--status"]:
        status(run)
        return 0
    node = os.environ.get("NODE") or shutil.which("node")
    if not node:
        print("Node 24 is required. Install it or set NODE to its path.", file=sys.stderr)
        return 2
    default_python = Path(__file__).resolve().parent.parent / "partners/python/.venv/bin/python"
    python = os.environ.get("TRUCO_PYTHON", str(default_python))
    if not shutil.which(python):
        print("Run uv sync --frozen --project training/partners/python or set TRUCO_PYTHON.", file=sys.stderr)
        return 2
    run.mkdir(parents=True, exist_ok=True)
    with (run / "writer.lock").open("a") as lock:
        try:
            fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
        except BlockingIOError:
            print(f"An experiment is already writing to {run}.", file=sys.stderr)
            return 2
        command = Path(__file__).resolve().with_name("experiment.ts")
        return subprocess.run([node, str(command), str(run), python, *sys.argv[2:]],
                              pass_fds=(lock.fileno(),), check=False).returncode


if __name__ == "__main__":
    try:
        sys.exit(main())
    except KeyboardInterrupt:
        sys.exit(130)
