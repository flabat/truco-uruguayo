#!/usr/bin/env python3
"""Bounded, checkpoint-aware local dispatcher for this overnight league."""

from __future__ import annotations

import argparse
import datetime as dt
import fcntl
import hashlib
import json
import math
import os
import re
import shutil
import signal
import subprocess
import sys
import time
from pathlib import Path

ROOT: Path
OPS: Path
TASKS: Path
RES: Path
RUNTIME: Path
EVENTS: Path
NODE: Path
FORMATS = ("duel", "pairs", "pairs-private-senas")
LANES = ("duel-a", "duel-b", "pairs", "pairs-private-senas")
EPOCHS: int
SECONDS: float
HOURS_CAP: float
FINAL_RESERVE: float
MAX_FINAL_RESERVE: float
POLL = 2.0
MAX_ATTEMPTS = 3


def utc(t=None):
    return (
        dt.datetime.fromtimestamp(time.time() if t is None else t, dt.timezone.utc)
        .isoformat(timespec="seconds")
        .replace("+00:00", "Z")
    )


def obj(path):
    try:
        v = json.loads(path.read_text(encoding="utf-8"))
        return v if isinstance(v, dict) else {}
    except (OSError, ValueError):
        return {}


def save(path, data):
    temp = path.with_name(f".{path.name}.{os.getpid()}.tmp")
    with temp.open("w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, allow_nan=False, separators=(",", ":"))
        f.write("\n")
        f.flush()
        os.fsync(f.fileno())
    temp.replace(path)


def sha(path):
    digest = hashlib.sha256()
    with path.open("rb") as stream:
        for block in iter(lambda: stream.read(1024 * 1024), b""):
            digest.update(block)
    return digest.hexdigest()


def event(stage, status, message, **extra):
    with (EVENTS / "coordinator.jsonl").open("a", encoding="utf-8") as f:
        f.write(
            json.dumps(
                {
                    "ts": utc(),
                    "stage": stage,
                    "status": status,
                    "message": message,
                    **extra,
                },
                ensure_ascii=False,
                separators=(",", ":"),
            )
            + "\n"
        )


def lock(path, write=False):
    f = path.open("a+")
    try:
        fcntl.flock(f, fcntl.LOCK_EX | fcntl.LOCK_NB)
    except BlockingIOError:
        f.close()
        return None
    if write:
        f.seek(0)
        f.truncate()
        f.write(str(os.getpid()) + "\n")
        f.flush()
    return f


def busy(path):
    f = lock(path)
    if not f:
        return True
    f.close()
    return False


def note(phase, message, epoch, status="running", **extra):
    row = {
        "phase": phase,
        "message": message,
        "epoch": epoch,
        "status": status,
        "ts": utc(),
        **extra,
    }
    save(OPS / "schedule.json", row)
    event(phase, status, message, epoch=epoch, **extra)


def worker_info(lane, epoch):
    fmt = "duel" if lane.startswith("duel-") else lane
    lineage = lane[-1] if lane.startswith("duel-") else ("a" if int(epoch) % 2 else "b")
    return fmt, lineage


def key(phase, epoch, lane):
    return f"{('final' if epoch == 'final' else f'e{int(epoch):02}')}-{phase}-{lane}"


def statefile(phase, epoch, lane):
    return TASKS / (key(phase, epoch, lane) + ".json")


def oknum(x):
    return isinstance(x, (int, float)) and not isinstance(x, bool) and math.isfinite(x)


def get_receipt(phase, epoch, lane):
    if phase == "train":
        fmt, lin = worker_info(lane, epoch)
        file = ROOT / fmt / lin / "checkpoint.json"
        x = obj(file)
        if (
            x.get("epoch") != int(epoch)
            or not oknum(x.get("trainingSeconds"))
            or x["trainingSeconds"] + 0.001 < SECONDS
        ):
            return None
        if any(
            not oknum(x.get(k)) or x[k] < 0
            for k in ("games", "decisions", "learnerUpdates", "counterGames")
        ):
            return None
        if x.get("format") != fmt or x.get("lineage") != lin:
            return None
        archive = ROOT / fmt / lin / "archive"
        exports = [
            ROOT / fmt / lin / "candidate.json",
            ROOT / fmt / lin / "counter.json",
            archive / f"{epoch}-candidate.json",
            archive / f"{epoch}-counter.json",
        ]
        if not all(p.is_file() for p in exports):
            return None
        return {
            "file": str(file.relative_to(ROOT)),
            "checkpointSHA256": sha(file),
            **{
                k: x[k]
                for k in (
                    "epoch",
                    "trainingSeconds",
                    "games",
                    "decisions",
                    "learnerUpdates",
                    "counterGames",
                )
            },
            "format": fmt,
            "lineage": lin,
            "candidateSHA256": sha(exports[0]),
            "counterSHA256": sha(exports[1]),
        }
    file = ROOT / lane / f"eval-{epoch}.json"
    x = obj(file)
    if (
        x.get("format") != lane
        or x.get("epoch") != epoch
        or not isinstance(x.get("games"), int)
        or isinstance(x["games"], bool)
        or x["games"] <= 0
    ):
        return None

    def valid_ci(value, low, high):
        return (
            isinstance(value, dict)
            and all(oknum(value.get(k)) for k in ("estimate", "lower", "upper"))
            and low <= value["lower"] <= value["estimate"] <= value["upper"] <= high
        )

    ev = x.get("evaluation", {})
    families = ev.get("families", [])
    n = ev.get("pairs")
    if (
        not valid_ci(ev.get("direct"), 0, 1)
        or not isinstance(n, int)
        or n < 2
        or not families
        or x["games"] != 4 * n * len(families)
        or not isinstance(x.get("improved"), bool)
        or not all(
            re.fullmatch(r"[0-9a-f]{64}", str(x.get(k, "")))
            for k in ("pin", "counter", "reference")
        )
        or not all(
            isinstance(f, dict)
            and valid_ci(f.get("delta"), -1, 1)
            and oknum(f.get("winRate"))
            for f in families
        )
    ):
        return None
    ids = [f.get("id") for f in families]
    if (
        len(set(ids)) != len(ids)
        or not {"champion", "V1", "independent", "trained-counter"}.issubset(ids)
        or x.get("worst") not in ids
    ):
        return None
    if lane != "duel" and (
        "unfamiliar-teammate" not in ids or not oknum(x.get("unfamiliarPartner"))
    ):
        return None
    if lane == "pairs-private-senas" and not {
        "signaling-teammate",
        "signaling-teammate/masked",
    }.issubset(ids):
        return None
    if epoch == "final":
        expected = obj(ROOT / "input" / lane / "champion-at-start.json")
        reference = obj(ROOT / lane / "assessments" / "final" / "reference.json")
        if not expected or reference != expected:
            return None
    return {
        "file": str(file.relative_to(ROOT)),
        "sha256": sha(file),
        "format": lane,
        "epoch": epoch,
        "games": x["games"],
        "pin": x["pin"],
        "improved": x["improved"],
    }


def run_cpu(pid):
    try:
        p = subprocess.run(
            ["ps", "-p", str(pid), "-o", "time="],
            capture_output=True,
            text=True,
            timeout=3,
        )
        t = p.stdout.strip()
        if not t:
            return None
        days = 0
        if "-" in t:
            d, t = t.split("-", 1)
            days = int(d) * 86400
        hms = [float(i) for i in t.split(":")]
        return days + sum(v * 60**i for i, v in enumerate(reversed(hms)))
    except (OSError, ValueError, subprocess.TimeoutExpired):
        return None


def stop(pid):
    try:
        os.killpg(pid, signal.SIGTERM)
    except ProcessLookupError:
        pass


def proof_or_error(phase, epoch, lane):
    receipt = get_receipt(phase, epoch, lane)
    if not receipt:
        raise ValueError(
            "Worker exited successfully without a valid, complete "
            + (
                "training checkpoint"
                if phase == "train"
                else "held-out evaluation receipt"
            )
            + "."
        )
    return receipt


def run_one(phase, epoch, lane):
    if (
        phase not in ("train", "eval")
        or (epoch != "final" and (type(epoch) is not int or not 1 <= epoch <= EPOCHS))
        or (epoch == "final" and phase == "train")
    ):
        raise SystemExit("Invalid job")
    if lane not in (LANES if phase == "train" else FORMATS):
        raise SystemExit("Invalid lane")
    job = key(phase, epoch, lane)
    path = statefile(phase, epoch, lane)
    mutex = lock(TASKS / (job + ".lock"), True)
    if not mutex:
        return
    clock = obj(OPS / "clock.json")
    plan = obj(OPS / "active.json")
    if (
        not (ROOT / "READY").is_file()
        or not clock
        or plan.get("phase") != phase
        or plan.get("epoch") != epoch
        or lane not in plan.get("lanes", [])
    ):
        raise SystemExit("Job has not been released")
    cap = (
        clock["deadline"]
        if epoch == "final"
        else clock["deadline"] - clock.get("finalReserveSeconds", FINAL_RESERVE)
    )
    prior = obj(path)
    attempts = prior.get("attempts", [])
    if prior.get("state") == "done":
        return
    # If the scheduler or wrapper died after the worker persisted its completion, use the same receipt.
    recovered = get_receipt(phase, epoch, lane) if attempts else None
    if recovered:
        save(
            path,
            {
                "state": "done",
                "receipt": recovered,
                "attempts": attempts,
                "finishedAt": utc(),
                "recovered": True,
            },
        )
        return
    ticket = OPS / ("retry-" + job)
    ticket_ns = ticket.stat().st_mtime_ns if ticket.exists() else 0
    available = (
        MAX_ATTEMPTS if not attempts else prior.get("allowAttempts", MAX_ATTEMPTS)
    )
    old_ticket = prior.get("ticket", 0)
    if ticket_ns > old_ticket:
        available = len(attempts) + MAX_ATTEMPTS
    if len(attempts) >= available:
        save(
            path,
            {**prior, "state": "attention", "reason": "Automatic retry limit reached."},
        )
        return
    record = {
        "startedAt": utc(),
        "startWall": time.time(),
        "wallSeconds": 0.0,
        "cpuSeconds": 0.0,
    }
    attempts = [*attempts, record]
    base = {
        "format": worker_info(lane, epoch)[0] if phase == "train" else lane,
        "epoch": epoch,
        "lane": lane,
        "phase": phase,
        "attempts": attempts,
        "allowAttempts": available,
        "ticket": max(old_ticket, ticket_ns),
    }

    def update(state, **rest):
        save(path, {**base, "state": state, **rest})

    update("starting")
    if phase == "train":
        fmt, lin = worker_info(lane, epoch)
        cmd = [
            str(NODE),
            str(RUNTIME / "training/selfplay/train.ts"),
            str(ROOT),
            fmt,
            lin,
            "--seconds",
            str(SECONDS),
        ]
    else:
        cmd = [
            str(NODE),
            str(RUNTIME / "training/selfplay/evaluate.ts"),
            str(ROOT),
            lane,
            str(epoch),
        ]
    env = {
        **os.environ,
        "PATH": str(NODE.parent) + ":" + os.environ.get("PATH", ""),
        "TRUCO_EPOCH": str(epoch),
        "TRUCO_LANE": lane if phase == "train" else "eval-" + lane,
    }
    exception = None
    code = None
    child = None
    deadline_fired = None
    try:
        if time.time() >= cap:
            raise TimeoutError("Stage budget expires before dispatch.")
        with (TASKS / (job + ".log")).open("ab") as out:
            out.write(
                f"\n[{utc()}] attempt {len(attempts)}: {' '.join(cmd)}\n".encode()
            )
            out.flush()
            child = subprocess.Popen(
                cmd,
                cwd=RUNTIME,
                env=env,
                stdin=subprocess.DEVNULL,
                stdout=out,
                stderr=subprocess.STDOUT,
                start_new_session=True,
                pass_fds=(mutex.fileno(),),
            )
            record["pid"] = child.pid
            update("running")
            last_sample = 0
            while True:
                now = time.time()
                ended, status, usage = os.wait4(child.pid, os.WNOHANG)
                if ended:
                    code = os.waitstatus_to_exitcode(status)
                    child.returncode = code
                    record["cpuSeconds"] = usage.ru_utime + usage.ru_stime
                    record["wallSeconds"] = max(0, now - record["startWall"])
                    break
                if now >= cap and deadline_fired is None:
                    deadline_fired = now
                    stop(child.pid)
                if deadline_fired and now - deadline_fired > 6:
                    try:
                        os.killpg(child.pid, signal.SIGKILL)
                    except ProcessLookupError:
                        pass
                if now - last_sample >= 12:
                    cpu = run_cpu(child.pid)
                    if cpu is not None:
                        record["cpuSeconds"] = cpu
                    record["wallSeconds"] = max(0, now - record["startWall"])
                    update("running")
                    last_sample = now
                time.sleep(POLL)
        if deadline_fired:
            raise TimeoutError("Stage stopped at its wall-clock deadline.")
        if code != 0:
            raise RuntimeError(f"Worker exit {code}. Inspect ops/tasks/{job}.log.")
        receipt = proof_or_error(phase, epoch, lane)
    except Exception as exc:
        exception = f"{type(exc).__name__}: {exc}"
        if child and child.returncode is None:
            stop(child.pid)
            try:
                child.wait(timeout=8)
            except subprocess.TimeoutExpired:
                try:
                    os.killpg(child.pid, signal.SIGKILL)
                except ProcessLookupError:
                    pass
                child.wait()
    record["finishedAt"] = utc()
    record["exitCode"] = code
    if exception:
        update(
            "timeout"
            if time.time() >= cap
            else ("attention" if len(attempts) >= available else "retry"),
            reason=exception,
            retryAt=time.time() + min(60, 10 * len(attempts)),
        )
        event("recovery", "warning", f"{job}: {exception}", epoch=epoch)
    else:
        update("done", receipt=receipt, finishedAt=utc())


def resources():
    tasks = []
    for p in TASKS.glob("e*-train-*.json"):
        x = obj(p)
        if x:
            tasks.append(x)
    for lane in LANES:
        rows = [x for x in tasks if x.get("lane") == lane]
        cpu = sum(
            float(attempt.get("cpuSeconds", 0))
            for row in rows
            for attempt in row.get("attempts", [])
        )
        wall = sum(
            float(attempt.get("wallSeconds", 0))
            for row in rows
            for attempt in row.get("attempts", [])
        )
        training = 0.0
        games = decisions = updates = counters = 0
        total_by_lineage = {}
        for rec in rows:
            ep = rec["epoch"]
            fmt, lin = worker_info(lane, ep)
            progress = (
                rec.get("receipt", {})
                if rec.get("state") == "done"
                else obj(ROOT / fmt / lin / "progress.json")
            )
            if progress.get("epoch") != ep:
                continue
            sec = progress.get("trainingSeconds", 0)
            if oknum(sec):
                training += max(0, min(SECONDS, sec))
            if ep >= total_by_lineage.get(lin, (-1, {}))[0]:
                total_by_lineage[lin] = ep, progress
        for _, v in total_by_lineage.values():
            games += v.get("games", 0)
            decisions += v.get("decisions", 0)
            updates += v.get("learnerUpdates", 0)
            counters += v.get("counterGames", 0)
        save(
            RES / (lane + ".json"),
            {
                "ts": utc(),
                "lane": lane,
                "trainingSeconds": training,
                "cpuSeconds": cpu,
                "workerWallSeconds": wall,
                "games": games,
                "decisions": decisions,
                "learnerUpdates": updates,
                "counterGames": counters,
            },
        )


def launch(phase, epoch, lane):
    with (OPS / "worker-wrappers.log").open("ab") as out:
        return subprocess.Popen(
            [
                sys.executable,
                "-u",
                str(Path(__file__).resolve()),
                str(ROOT),
                "--runtime",
                str(RUNTIME),
                "--node",
                str(NODE),
                "--job",
                phase,
                str(epoch),
                lane,
            ],
            cwd=ROOT,
            stdin=subprocess.DEVNULL,
            stdout=out,
            stderr=subprocess.STDOUT,
            start_new_session=True,
        )


def group(phase, epoch, clock):
    lanes = LANES if phase == "train" else FORMATS
    cap = (
        clock["deadline"]
        if epoch == "final"
        else clock["deadline"] - clock.get("finalReserveSeconds", FINAL_RESERVE)
    )
    files = {lane: statefile(phase, epoch, lane) for lane in lanes}
    save(
        OPS / "active.json",
        {"phase": phase, "epoch": epoch, "lanes": lanes, "ts": utc()},
    )
    info = (
        "Four computer workers are training on complete chicos."
        if phase == "train"
        else "Three independent assessments are running on held-out deals."
        if epoch != "final"
        else "Final frozen policies are playing the independent holdout."
    )
    stage = (
        "training"
        if phase == "train"
        else ("final evaluation" if epoch == "final" else "checkpoint evaluation")
    )
    note(stage, info, epoch)
    children = {}
    next_launch = {}
    last_event = last_resource = 0
    last_attention = ()
    while True:
        now = time.time()
        states = {}
        missing = []
        for lane, path in files.items():
            child = children.get(lane)
            if child is not None and child.poll() is not None:
                del children[lane]
            x = obj(path)
            state = x.get("state", "waiting")
            states[lane] = state
            if state == "done":
                continue
            if now >= cap:
                continue
            if lane in children or busy(path.with_suffix(".lock")):
                continue
            if state == "attention":
                ticket = OPS / ("retry-" + key(phase, epoch, lane))
                if not ticket.exists() or ticket.stat().st_mtime_ns <= x.get(
                    "ticket", 0
                ):
                    missing.append(lane)
                    continue
            if now >= max(x.get("retryAt", 0), next_launch.get(lane, 0)):
                children[lane] = launch(phase, epoch, lane)
                next_launch[lane] = now + 7
        if now - last_resource >= 10:
            resources()
            last_resource = now
        if all(v == "done" for v in states.values()):
            resources()
            return True
        if now >= cap + 9:
            event(
                stage,
                "warning",
                "Wall-clock reserve reached. Closing incomplete stage and preserving completed checkpoints.",
                epoch=epoch,
                metrics={"workerStates": states},
            )
            resources()
            return False
        if tuple(missing) != last_attention and missing:
            why = "; ".join(
                f"{lane}: {obj(files[lane]).get('reason', '')}" for lane in missing
            )
            note(
                stage,
                "Repair needed for "
                + why
                + ". Retry by refreshing ops/retry-<job> after correcting the cause.",
                epoch,
                "attention",
            )
            last_attention = tuple(missing)
        elif last_attention and not missing:
            note(stage, info, epoch)
            last_attention = ()
        if now - last_event >= 60:
            event(
                stage,
                "attention" if missing else "running",
                info + " " + ", ".join(f"{k} {v}" for k, v in states.items()) + ".",
                epoch=epoch,
                metrics={
                    "completed": sum(v == "done" for v in states.values()),
                    "expected": len(lanes),
                },
            )
            last_event = now
        time.sleep(POLL)


def supervise():
    mutex = lock(OPS / "supervisor.lock", True)
    if not mutex:
        raise SystemExit("Supervisor is already running.")
    if obj(OPS / "summary.json").get("state") in (
        "complete",
        "failed",
        "stopped",
        "incomplete",
    ):
        return
    last_note = 0
    while not (ROOT / "READY").is_file():
        if time.time() - last_note >= 90:
            note(
                "setup",
                "Monitor live. Waiting for the coordinator to verify and release the frozen runtime.",
                0,
                "waiting",
            )
            last_note = time.time()
        time.sleep(POLL)
    # Preparation may still be writing the protocol while the release marker is absent.
    configure_protocol()
    for f in (
        NODE,
        RUNTIME / "training/selfplay/train.ts",
        RUNTIME / "training/selfplay/evaluate.ts",
    ):
        if not f.is_file():
            note(
                "setup",
                f"Release marker is present, but {f.name} is missing. Waiting for repair.",
                0,
                "attention",
            )
            raise RuntimeError(f"Missing {f}")
    clock = obj(OPS / "clock.json")
    if not clock:
        t = time.time()
        clock = {
            "startedAt": utc(t),
            "startWall": t,
            "deadline": t + HOURS_CAP * 3600,
            "deadlineUTC": utc(t + HOURS_CAP * 3600),
            "epochSeconds": SECONDS,
            "epochs": EPOCHS,
            "hoursPerLane": EPOCHS * SECONDS / 3600,
            "finalReserveSeconds": FINAL_RESERVE,
        }
        save(OPS / "clock.json", clock)
    assertion = None
    if (
        sys.platform == "darwin"
        and clock["deadline"] > time.time()
        and Path("/usr/bin/caffeinate").is_file()
    ):
        with (OPS / "power.log").open("ab") as output:
            assertion = subprocess.Popen(
                [
                    "/usr/bin/caffeinate",
                    "-i",
                    "-t",
                    str(max(1, int(clock["deadline"] - time.time()))),
                    "-w",
                    str(os.getpid()),
                ],
                stdin=subprocess.DEVNULL,
                stdout=output,
                stderr=subprocess.STDOUT,
            )
        save(
            OPS / "power.json",
            {
                "pid": assertion.pid,
                "supervisor": os.getpid(),
                "expires": clock["deadlineUTC"],
            },
        )
    done_epochs = 0
    for epoch in range(1, EPOCHS + 1):
        if all(
            obj(statefile("train", epoch, k)).get("state") == "done" for k in LANES
        ) and all(
            obj(statefile("eval", epoch, k)).get("state") == "done" for k in FORMATS
        ):
            done_epochs = epoch
            continue
        if time.time() >= clock["deadline"] - clock.get(
            "finalReserveSeconds", FINAL_RESERVE
        ):
            break
        if not group("train", epoch, clock):
            break
        if not group("eval", epoch, clock):
            break
        done_epochs = epoch
        protocol = obj(ROOT / "protocol.json")
        observed = max(
            sum(
                a.get("wallSeconds", 0)
                for a in obj(statefile("eval", epoch, f)).get("attempts", [])
            )
            for f in FORMATS
        )
        projected = int(
            observed
            * protocol.get("finalPairs", 1024)
            / max(1, protocol.get("epochPairs", 128))
            * 1.35
            + 120
        )
        reserve = min(MAX_FINAL_RESERVE, max(FINAL_RESERVE, projected))
        if reserve != clock.get("finalReserveSeconds"):
            clock["finalReserveSeconds"] = reserve
            save(OPS / "clock.json", clock)
            event(
                "budget",
                "running",
                "Updated final-assessment reserve from measured evaluation throughput.",
                epoch=epoch,
                metrics={
                    "reserveSeconds": reserve,
                    "epochAssessmentWallSeconds": round(observed, 1),
                },
            )
    successful = (
        group("eval", "final", clock) if time.time() < clock["deadline"] else False
    )
    finals = {f: get_receipt("eval", "final", f) for f in FORMATS}
    resources()
    training = {lane: obj(RES / (lane + ".json")) for lane in LANES}
    all_training = all(
        training[k].get("trainingSeconds", 0) >= EPOCHS * SECONDS - 0.01 for k in LANES
    )
    if successful and all(finals.values()) and all_training and done_epochs == EPOCHS:
        status = "complete"
        msg = f"All four workers completed {EPOCHS * SECONDS:g} training seconds each. All {EPOCHS} checkpoint rounds and three final assessments verified."
    else:
        status = "incomplete"
        msg = f"Time budget exhausted or work unfinished. Verified {done_epochs}/{EPOCHS} full epochs and {sum(bool(x) for x in finals.values())}/3 final receipts."
    save(
        OPS / "summary.json",
        {
            "state": status,
            "message": msg,
            "startedAt": clock["startedAt"],
            "finishedAt": utc(),
            "hardDeadline": clock["deadlineUTC"],
            "completedEpochs": done_epochs,
            "resources": training,
            "evaluations": finals,
        },
    )
    note(status, msg, done_epochs, status)
    if assertion and assertion.poll() is None:
        assertion.terminate()


def configure_protocol():
    global EPOCHS, SECONDS, HOURS_CAP, FINAL_RESERVE, MAX_FINAL_RESERVE
    protocol = obj(ROOT / "protocol.json")
    if not (
        protocol.get("computerOnly") is True
        and protocol.get("signals") == "senas-equipo-v1"
        and tuple(protocol.get("formats", [])) == FORMATS
    ):
        raise ValueError(
            "Expected the three computer-only formats and teammate-only signal rules in protocol.json"
        )
    EPOCHS = protocol.get("epochs")
    SECONDS = protocol.get("trainSecondsPerEpoch")
    HOURS_CAP = protocol.get("maxWallHours")
    if (
        not isinstance(EPOCHS, int)
        or isinstance(EPOCHS, bool)
        or EPOCHS < 1
        or not oknum(SECONDS)
        or SECONDS <= 0
        or not oknum(HOURS_CAP)
        or HOURS_CAP <= 0
    ):
        raise ValueError("Invalid epoch count, learning duration, or wall-clock budget")
    margin = HOURS_CAP * 3600 - EPOCHS * SECONDS
    if margin <= 0:
        raise ValueError(
            "Wall-clock budget must allow time for evaluation in addition to training"
        )
    FINAL_RESERVE = min(1200, margin / 6)
    MAX_FINAL_RESERVE = min(2400, margin / 3)


def main():
    global ROOT, OPS, TASKS, RES, EVENTS, RUNTIME, NODE
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "run", type=Path, help="Prepared run directory containing protocol.json"
    )
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
    parser.add_argument(
        "--job", nargs=3, metavar=("PHASE", "EPOCH", "LANE"), help=argparse.SUPPRESS
    )
    args = parser.parse_args()
    ROOT = args.run.resolve()
    OPS = ROOT / "ops"
    TASKS = OPS / "tasks"
    RES = OPS / "resources"
    EVENTS = ROOT / "events"
    RUNTIME = (args.runtime or ROOT / "runtime").resolve()
    found = shutil.which(args.node)
    if not found:
        parser.error("Node 24 must be on PATH or specified with --node")
    NODE = Path(found).resolve()
    for folder in (ROOT, OPS, TASKS, RES, EVENTS):
        folder.mkdir(exist_ok=True, parents=True)
    if args.job:
        configure_protocol()
        phase, token, lane = args.job
        run_one(phase, token if token == "final" else int(token), lane)
    else:
        supervise()


if __name__ == "__main__":
    main()
