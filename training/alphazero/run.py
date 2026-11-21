#!/usr/bin/env python3
"""Start or resume a terminal-owned duel search experiment."""

import fcntl
import json
import os
from pathlib import Path
import shutil
import subprocess
import sys


def main():
    if len(sys.argv) < 2 or sys.argv[1] == "--help":
        print("python3 training/alphazero/run.py RUN [--ceibo FILE --seed N --epochs N "
              "--train-pairs N --simulations N --eval-pairs N]")
        print("Resume with only RUN; inspect with RUN --status. NODE may override the Node 24 path.")
        return 0
    directory = Path(sys.argv[1]).resolve()
    if sys.argv[2:] == ["--status"]:
        for name in ("progress", "result"):
            path = directory / f"{name}.json"
            if path.exists():
                print(f"{name}: {json.dumps(json.loads(path.read_text()))}")
        return 0
    node = os.environ.get("NODE") or shutil.which("node")
    if not node:
        print("Node 24 is required. Set NODE or install it.", file=sys.stderr)
        return 2
    directory.mkdir(parents=True, exist_ok=True)
    with (directory / "writer.lock").open("a") as lock:
        try:
            fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
        except BlockingIOError:
            print(f"Experiment already running in {directory}", file=sys.stderr)
            return 2
        script = Path(__file__).resolve().with_name("experiment.ts")
        return subprocess.run([node, str(script), str(directory), *sys.argv[2:]],
                              pass_fds=(lock.fileno(),), check=False).returncode


if __name__ == "__main__":
    try:
        sys.exit(main())
    except KeyboardInterrupt:
        sys.exit(130)
