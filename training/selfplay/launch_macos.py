"""Start the monitor and scheduler in the current macOS user's launchd domain."""

import argparse
import hashlib
import os
import plistlib
import shutil
import subprocess
import sys
from pathlib import Path


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("run", type=Path)
    parser.add_argument(
        "--runtime",
        type=Path,
        help="Pinned checkout containing training/selfplay (default: RUN/runtime)",
    )
    parser.add_argument(
        "--node",
        default=os.environ.get("TRUCO_NODE", "node"),
        help="Node 24 executable",
    )
    parser.add_argument("--port", type=int, default=8776)
    parser.add_argument("--until-finished", action="store_true",
                        help="Close the dashboard service after writing the final HTML")
    parser.add_argument("--timezone", help="Dashboard time zone (default: local time)")
    args = parser.parse_args()
    if sys.platform != "darwin":
        parser.error("Run monitor.py and supervise.py directly on other POSIX hosts.")
    executable = shutil.which(args.node)
    if not executable:
        parser.error("Node 24 must be on PATH or supplied with --node")
    if not 0 <= args.port <= 65535:
        parser.error("Port must be in 0..65535")
    run = args.run.resolve()
    ops = run / "ops"
    ops.mkdir(parents=True, exist_ok=True)
    scripts = Path(__file__).resolve().parent
    runtime = (args.runtime or run / "runtime").resolve()
    domain = f"gui/{os.getuid()}"
    run_key = hashlib.sha256(os.fsencode(run)).hexdigest()[:14]
    monitor = [str(scripts / "monitor.py"), str(run), "--port", str(args.port)]
    if args.until_finished:
        monitor.append("--until-finished")
    if args.timezone:
        monitor.extend(["--timezone", args.timezone])
    supervisor = [
        str(scripts / "supervise.py"),
        str(run),
        "--node",
        str(Path(executable).resolve()),
        "--runtime",
        str(runtime),
    ]
    for role, arguments in [("monitor", monitor), ("supervisor", supervisor)]:
        label = f"local.truco.{run_key}.{role}"
        plist = ops / f"{role}.plist"
        definition = {
            "Label": label,
            "ProgramArguments": [sys.executable, "-u", *arguments],
            "WorkingDirectory": str(run),
            "RunAtLoad": True,
            "KeepAlive": {"SuccessfulExit": False},
            "ThrottleInterval": 8,
            "StandardOutPath": str(ops / f"{role}-launch.log"),
            "StandardErrorPath": str(ops / f"{role}-errors.log"),
        }
        installed = (
            subprocess.run(
                ["launchctl", "print", domain + "/" + label],
                stdout=subprocess.DEVNULL,
                stderr=subprocess.DEVNULL,
                check=False,
            ).returncode
            == 0
        )
        if installed:
            if not plist.is_file() or plistlib.loads(plist.read_bytes()) != definition:
                parser.error(
                    f"{label} is already loaded with different launch arguments. Its existing job is running."
                )
            print(f"Already active: {label}")
            continue
        temp = plist.with_suffix(f".{os.getpid()}.tmp")
        temp.write_bytes(plistlib.dumps(definition))
        temp.replace(plist)
        subprocess.run(["launchctl", "bootstrap", domain, str(plist)], check=True)
        print(f"Started {label}")
    print(f"Dashboard address: {ops / 'monitor-url.txt'}")
    print(f"Scheduler release marker: {run / 'READY'}")


if __name__ == "__main__":
    main()
