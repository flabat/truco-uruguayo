"""Display a read-only snapshot of a local self-play league."""

import fcntl
import json
from pathlib import Path
from shlex import quote

from monitor import LANES, TERMINAL, dur


def snapshot(path):
    try:
        data = json.loads(path.read_text(encoding="utf-8"))
    except FileNotFoundError:
        return {}
    except ValueError as err:
        raise ValueError(f"Invalid status file {path}") from err
    if not isinstance(data, dict):
        raise ValueError(f"Invalid status file {path}")
    return data


def service_running(lockfile):
    # The supervisor and monitor hold exclusive locks for their lifetimes.
    try:
        with lockfile.open("rb") as handle:
            try:
                fcntl.flock(handle, fcntl.LOCK_SH | fcntl.LOCK_NB)
            except BlockingIOError:
                return True
    except FileNotFoundError:
        pass
    return False


def print_status(run: Path):
    run = run.resolve()
    ops = run / "ops"
    protocol = snapshot(run / "protocol.json")
    schedule = snapshot(ops / "schedule.json")
    summary = snapshot(ops / "summary.json")
    if not (protocol or schedule or summary):
        raise ValueError(f"No training run found at {run}")

    clock = snapshot(ops / "clock.json")
    supervisor = service_running(ops / "supervisor.lock")
    monitor = service_running(ops / "monitor.lock")
    state = summary.get("state")
    finished = state in TERMINAL
    if not finished:
        if schedule.get("status") == "attention":
            state = "attention"
        elif not supervisor and clock:
            state = "interrupted (last saved progress)"
        elif supervisor and clock:
            state = "running"
        elif protocol:
            state = "prepared"
        else:
            state = "preparing"
    print(f"Run         {run}")
    print(f"State       {state}")
    if schedule.get("phase") and not finished:
        print(f"Last phase  {schedule['phase']}")
    epochs = protocol.get("epochs", clock.get("epochs"))
    epoch = summary.get("completedEpochs", schedule.get("epoch", 0))
    epoch_text = "final evaluation" if epoch == "final" else f"{epoch} / {epochs or '—'}"
    print(f"Epoch       {epoch_text}")
    print(f"Supervisor  {'running' if supervisor else 'not running'}")
    print(f"Monitor     {'running' if monitor else 'not running'}")
    deadline = summary.get("hardDeadline") or clock.get("deadlineUTC")
    print(f"Deadline    {deadline or 'set when training starts'}")

    per_epoch = protocol.get("trainSecondsPerEpoch") or clock.get("epochSeconds")
    goal = epochs * per_epoch if epochs and per_epoch else None
    for lane in LANES:
        resource = summary.get("resources", {}).get(lane) or snapshot(ops / "resources" / f"{lane}.json")
        progress = dur(resource.get("trainingSeconds", 0))
        games = resource.get("games", 0)
        print(f"  {lane:<20}  {progress} / {dur(goal)} training   {games:,} games")

    address = ops / "monitor-url.txt"
    if monitor and address.exists() and (url := address.read_text(encoding="utf-8").strip()):
        print(f"Dashboard   {url}")
    elif (run / "monitor.html").is_file():
        print(f"Dashboard   {run / 'monitor.html'} (saved page)")
    else:
        print("Dashboard   awaiting the first update")
    message = summary.get("message") or schedule.get("message")
    if message:
        print(message)
    if finished and summary.get("state") in ("complete", "completed"):
        return
    for path in sorted((ops / "tasks").glob("*.json")):
        task = snapshot(path)
        if task.get("state") in ("attention", "timeout", "retry"):
            print(f"{path.stem}  {task['state']}  {task.get('reason', '')}")
            print(f"  Log  {path.with_suffix('.log')}")
            if not finished and task["state"] == "attention":
                print(f"  After fixing the cause, run  touch {quote(str(ops / ('retry-' + path.stem)))}")
