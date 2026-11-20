"""Run a checkpointed, computer-only Truco league from the terminal."""

import argparse
import json
import os
import shlex
import shutil
import subprocess
import sys
from pathlib import Path

from local_run import prepare_run, verify_run
from local_status import print_status


def node_path():
    executable = shutil.which(os.environ.get("TRUCO_NODE", "node"))
    if not executable:
        raise ValueError("Install Node.js 24 or set TRUCO_NODE to its executable.")
    return str(Path(executable).resolve())


def start_services(run, node):
    # Resuming from another checkout still uses the scheduler frozen at preparation.
    launcher = run / "runtime/training/selfplay/launch_macos.py"
    subprocess.run([
        sys.executable, "-B", str(launcher), str(run), "--node", node,
        "--port", "0", "--until-finished",
    ], check=True)


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__)
    commands = parser.add_subparsers(dest="command", required=True)
    start = commands.add_parser("start", help="Prepare and start a new Mac training run")
    start.add_argument("run", type=Path, help="New output directory")
    start.add_argument("--from", dest="parent", required=True, type=Path,
                       help="Completed parent league with all three evaluated formats")
    start.add_argument("--profile", choices=("pilot", "extended"), default="pilot",
                       help="One or six training hours per worker (default: pilot)")
    start.add_argument("--prepare-only", action="store_true",
                       help="Freeze the run for inspection before starting it with resume")
    for command, help_text in [
        ("resume", "Start or reconnect the services for a prepared run"),
        ("status", "Show checkpoint progress, deadline and dashboard location"),
        ("results", "Audit final assessments and show each winning local model"),
    ]:
        commands.add_parser(command, help=help_text).add_argument("run", type=Path)

    args = parser.parse_args(argv)
    run = args.run.resolve()
    try:
        if args.command == "status":
            print_status(run)
            return 0
        node = node_path()
        if args.command == "results":
            # Historical leagues predate the frozen result reader.
            reader = Path(__file__).with_name("results.ts")
            manifest = run / "ops/runtime-manifest.json"
            managed = (run / "league").exists() or (
                manifest.is_file() and json.loads(manifest.read_bytes()).get("schema") == "standalone-selfplay-v1"
            )
            if managed:
                verify_run(run, node)
                reader = run / "runtime/training/selfplay/results.ts"
            subprocess.run([node, str(reader), str(run)], check=True)
            return 0

        prepare_only = args.command == "start" and args.prepare_only
        if sys.platform != "darwin" and not prepare_only:
            raise ValueError("Starting the background services requires macOS.")
        if args.command == "start":
            profile = "local-pilot" if args.profile == "pilot" else "extended"
            protocol = prepare_run(run, args.parent.resolve(), profile, node)
            print(f"Prepared {run} · {protocol['epochs']} epochs · "
                  f"{protocol['maxWallHours']}h wall-clock limit.", flush=True)
        else:
            verify_run(run, node)
            summary = run / "ops/summary.json"
            if summary.exists():
                state = json.loads(summary.read_text())["state"]
                if state == "complete":
                    print_status(run)
                    return 0
                raise ValueError(f"Run ended with state {state}. Inspect its status and logs.")
        shortcut = shlex.quote(str(run / "league"))
        if prepare_only:
            print(f"Start training with: {shortcut} resume")
        else:
            try:
                start_services(run, node)
            except (OSError, subprocess.CalledProcessError):
                print(f"Run saved. Retry the background launch with: {shortcut} resume", file=sys.stderr)
                raise
            print(f"Check progress with: {shortcut} status")
        return 0
    except (OSError, ValueError, KeyError, subprocess.CalledProcessError) as exc:
        parser.exit(1, f"league: {exc}\n")


if __name__ == "__main__":
    sys.exit(main())
