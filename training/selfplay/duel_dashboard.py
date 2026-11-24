#!/usr/bin/env python3
"""Render the local status page for an existing duel comparison."""

import argparse
import fcntl
import json
import os
from pathlib import Path
import subprocess
import sys
import tempfile
import time

from duel_dashboard_data import snapshot
from duel_dashboard_view import render


def write_page(run):
    data = snapshot(run, time.time())
    page = render(data)
    out = tempfile.NamedTemporaryFile("w", encoding="utf-8", dir=run, delete=False)
    temporary = Path(out.name)
    try:
        with out:
            out.write(page)
        temporary.replace(run / "monitor.html")
    finally:
        temporary.unlink(missing_ok=True)
    return data["phase"] == "complete"


def watch(run, once):
    # This lock belongs only to the page writer. Training has its own writer.
    with (run / ".duel-dashboard.lock").open("a") as lock:
        try:
            fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
        except BlockingIOError:
            return
        while True:
            if write_page(run) or once:
                return
            time.sleep(5)


def open_page(run):
    page = run / "monitor.html"
    log = run / "duel-dashboard.log"
    with log.open("a") as errors:
        writer = subprocess.Popen(
            [sys.executable, "-B", str(Path(__file__).resolve()), str(run)],
            stdin=subprocess.DEVNULL, stdout=subprocess.DEVNULL, stderr=errors,
            start_new_session=True,
        )
    # An existing writer may be finishing its first render when we open it again.
    deadline = time.monotonic() + 10
    while not page.is_file():
        if writer.poll() not in (None, 0) or time.monotonic() >= deadline:
            raise RuntimeError(f"Could not prepare the dashboard. See {log}")
        time.sleep(0.05)
    subprocess.run(["open", str(page)], check=True)


def main():
    cli = argparse.ArgumentParser(description=__doc__)
    cli.add_argument("run", type=Path, help="Comparison directory containing plan.json")
    mode = cli.add_mutually_exclusive_group()
    mode.add_argument("--open", action="store_true", help="Open the live page in the default Mac browser")
    mode.add_argument("--once", action="store_true", help="Write one snapshot and exit")
    args = cli.parse_args()
    run = args.run.resolve()
    try:
        plan = json.loads((run / "plan.json").read_text(encoding="utf-8"))
    except (OSError, ValueError) as error:
        cli.error(f"Could not read the comparison plan in {run}: {error}")
    if not isinstance(plan, dict) or plan.get("schema") not in {
        "duel-card-odds-comparison-v1", "duel-card-odds-comparison-v2"
    }:
        cli.error("Choose a duel comparison directory")
    if args.open:
        open_page(run)
    else:
        watch(run, args.once)


if __name__ == "__main__":
    try:
        main()
    except KeyboardInterrupt:
        pass
