#!/usr/bin/env python3
"""Build the file dashboard and serve its allowlisted files on loopback."""

from __future__ import annotations

import argparse
import collections
import datetime as dt
import fcntl
import heapq
import html
import http.server
import json
import math
import os
import re
import threading
import time
from pathlib import Path
from urllib.parse import urlsplit
from zoneinfo import ZoneInfo

ROOT: Path
OPS: Path
ET = None
FORMATS = {
    "duel": "Duel",
    "pairs": "2v2 · no señas",
    "pairs-private-senas": "2v2 · teammate-only señas",
}
LANES = {
    "duel-a": ("duel", "a"),
    "duel-b": ("duel", "b"),
    "pairs": ("pairs", None),
    "pairs-private-senas": ("pairs-private-senas", None),
}
STREAMS = ("coordinator", *LANES, *("eval-" + f for f in FORMATS))
TERMINAL = {"failed", "complete", "completed", "cancelled", "stopped", "incomplete"}
GESTURES = re.compile(
    r"(?<![\w-])(?:cejas|beso|nariz|ojo-derecho|ojo-izquierdo|labios-derecha|labios-izquierda|labio-inferior|boca|lengua|ojos-cerrados|labio-superior|cachetes)(?![\w-])",
    re.I,
)
MOVE = re.compile(
    r"(?<![\w-])(?:(?:oros|copas|espadas|bastos)-(?:0[1-7]|1[0-2])|vale-cuatro|falta-envido|real-envido|contraflor-al-resto|con-flor-envido|paso-flor|no-quiero|truco|retruco|flor|envido|quiero|irse-al-mazo|mazo)(?![\w-])",
    re.I,
)
PORT: int


def utc(t=None):
    return (
        dt.datetime.fromtimestamp(time.time() if t is None else t, dt.timezone.utc)
        .isoformat(timespec="seconds")
        .replace("+00:00", "Z")
    )


def moment(s):
    try:
        return (
            float(s)
            if isinstance(s, (float, int))
            else dt.datetime.fromisoformat(str(s).replace("Z", "+00:00")).timestamp()
        )
    except (ValueError, OverflowError, OSError, TypeError):
        return None


def eastern(t):
    t = moment(t)
    return (
        dt.datetime.fromtimestamp(t, ET).strftime("%a %b %d, %I:%M:%S %p %Z")
        if t is not None
        else "Awaiting release"
    )


def dur(s):
    if not isinstance(s, (int, float)) or not math.isfinite(s):
        return "—"
    s = max(0, int(s))
    return (
        f"{s // 3600}h {(s // 60) % 60:02d}m {s % 60:02d}s"
        if s >= 3600
        else f"{s // 60}m {s % 60:02d}s"
    )


def load(path):
    try:
        obj = json.loads(path.read_text(encoding="utf-8"))
        return obj if isinstance(obj, dict) else {}
    except (OSError, ValueError):
        return {}


def text(v):
    if v is None:
        return ""
    if isinstance(v, dict):
        return ", ".join(f"{k}={text(n)}" for k, n in v.items())
    if isinstance(v, (list, tuple)):
        return ", ".join(text(i) for i in v)
    return " ".join(str(v).splitlines())


def esc(v):
    return html.escape(text(v), quote=True)


def num(x):
    return f"{x:,}" if isinstance(x, (int, float)) else "—" if x is None else text(x)


def percent(x):
    if isinstance(x, dict):
        x = x.get("estimate")
    return f"{100 * x:.1f}%" if isinstance(x, (float, int)) else "—"


def safe_event(name, ev):
    if "private-senas" not in name:
        return ev
    ev = dict(ev)
    if ev.get("action"):
        m = MOVE.search(str(ev["action"]))
        ev["action"] = m.group(0) if m else "Public move"
    for k in ("message", "opponent", "partner", "teammate"):
        if k in ev:
            ev[k] = GESTURES.sub("private", text(ev[k]))
    if isinstance(ev.get("metrics"), dict):
        ev["metrics"] = {
            k: GESTURES.sub("private", v) if isinstance(v, str) else v
            for k, v in ev["metrics"].items()
            if not GESTURES.search(k)
        }
    return ev


def brief(e):
    out = [str(e[k]) for k in ("message",) if e.get(k)]
    if "completed" in e:
        out.append(f"{num(e['completed'])}/{num(e.get('total'))} {e.get('unit', '')}")
    for k in (
        "lineage",
        "epoch",
        "opponent",
        "teammate",
        "partner",
        "games",
        "decisions",
        "learnerUpdates",
        "action",
        "metrics",
    ):
        if e.get(k) is not None:
            out.append(f"{k} {text(e[k])}")
    return " · ".join(out)


def addlog(s):
    with (ROOT / "progress.log").open("a", encoding="utf-8") as f:
        f.write(s + "\n")


_match_cache = {}


def observed_training_record(checkpoint, target, now):
    """Read the learner's opponent counts at most twice a minute."""
    prior = _match_cache.get(checkpoint)
    if prior and now - prior[0] < 30:
        record = prior[1]
    else:
        record = load(checkpoint).get("record", {})
        _match_cache[checkpoint] = (now, record)
    row = record.get(target, {})
    if row.get("games", 0) > 0:
        return f"{row['wins'] / row['games'] * 100:.1f}% ({row['wins']:,}/{row['games']:,})"
    return None


def metric_list(items):
    return (
        "<dl>"
        + "".join(f"<dt>{esc(k)}</dt><dd>{esc(v)}</dd>" for k, v in items)
        + "</dl>"
    )


class Handler(http.server.BaseHTTPRequestHandler):
    server_version = "TrucoMonitor/1"

    def log_message(self, *args):
        pass

    def do_HEAD(self):
        self.reply(False)

    def do_GET(self):
        self.reply(True)

    def reply(self, send):
        path = urlsplit(self.path).path
        if path in ("/", "/monitor.html"):
            p = ROOT / "monitor.html"
            typ = "text/html"
        elif path == "/progress.log":
            p = ROOT / "progress.log"
            typ = "text/plain"
        elif re.fullmatch(
            r"/(?:duel|pairs|pairs-private-senas)/eval-(?:final|[1-9][0-9]*)\.json",
            path,
        ):
            p = ROOT / path[1:]
            typ = "application/json"
        elif path == "/ops/summary.json":
            p = OPS / "summary.json"
            typ = "application/json"
        else:
            self.send_error(404)
            return
        try:
            f = p.open("rb")
        except FileNotFoundError:
            self.send_error(404)
            return
        try:
            self.send_response(200)
            self.send_header("Content-Type", typ + "; charset=utf-8")
            self.send_header("Content-Length", str(os.fstat(f.fileno()).st_size))
            self.send_header("Cache-Control", "no-store")
            self.send_header("X-Content-Type-Options", "nosniff")
            self.end_headers()
            if send:
                while chunk := f.read(65536):
                    self.wfile.write(chunk)
        except (BrokenPipeError, ConnectionResetError):
            pass
        finally:
            f.close()


def dashboard(states, recent, now):
    clock = load(OPS / "clock.json")
    run = load(OPS / "schedule.json")
    summary = load(OPS / "summary.json")
    protocol = load(ROOT / "protocol.json")
    epochs = protocol.get("epochs", 0)
    goal = epochs * protocol.get("trainSecondsPerEpoch", 0)
    coordinator = states.get("coordinator", {})
    phase = (
        summary.get("state") or run.get("phase") or coordinator.get("stage", "setup")
    )
    epoch = run.get("epoch", 0)
    finished = bool(summary.get("state") in TERMINAL)
    blocks = []
    lane_work = []
    total_cpu = total_wall = 0
    duel_cpu = partnership_cpu = 0
    for lane, (fmt, fixed_lineage) in LANES.items():
        event = states.get(lane, {})
        lineage = fixed_lineage or (
            "a" if not epoch or (isinstance(epoch, int) and epoch % 2) else "b"
        )
        row = load(ROOT / fmt / lineage / "progress.json")
        row = {**event, **row} if row else event
        data = safe_event(lane, row)
        telemetry = load(OPS / "resources" / (lane + ".json"))
        status = summary.get("state") if finished else row.get("status", "waiting")
        last = moment(row.get("ts"))
        if (
            last
            and now - last > 185
            and phase == "training"
            and status in ("running", "training")
        ):
            status = "no recent training update"
        work = telemetry.get("trainingSeconds")
        cpu = telemetry.get("cpuSeconds")
        wall = telemetry.get("workerWallSeconds", 0)
        if isinstance(work, (int, float)) and work >= 30 and wall >= 30:
            lane_work.append((work, wall))
        total_cpu += cpu or 0
        total_wall += wall or 0
        if fmt == "duel":
            duel_cpu += cpu or 0
        else:
            partnership_cpu += cpu or 0
        target = goal or 1
        frac = (
            100 * min(1, max(0, work / target)) if isinstance(work, (int, float)) else 0
        )
        name = FORMATS[fmt] + (f" · lineage {lineage.upper()}" if fixed_lineage else "")
        detail = [
            ("Training time", dur(work) + (" / " + dur(goal) if goal else "")),
            ("Measured CPU time", dur(cpu)),
            ("Training games", num(telemetry.get("games", data.get("games")))),
            (
                "Decisions / updates",
                f"{num(telemetry.get('decisions', data.get('decisions')))} / {num(telemetry.get('learnerUpdates', data.get('learnerUpdates', data.get('updates'))))}",
            ),
        ]
        for k, val in (
            ("Current lineage", lineage.upper()),
            ("Opponent", data.get("opponent")),
            ("Teammate", data.get("teammate", data.get("partner"))),
            ("Public move", data.get("action")),
        ):
            if val:
                detail.append((k, val))
        training_record = observed_training_record(
            ROOT / fmt / lineage / "checkpoint.json", data.get("counterTarget"), now
        )
        if training_record:
            detail.append(("Training wins vs champion", training_record))
        if data.get("counterGames") is not None:
            detail.append(("Counter training games", num(data["counterGames"])))
        if last:
            detail.append(("Last worker update", eastern(last)))
        blocks.append(
            f'<section><header><h2>{esc(name)}</h2><label>{esc(status)}</label></header><progress value="{frac}" max="100"></progress>{metric_list(detail)}</section>'
        )
    assessments = []
    for fmt, title in FORMATS.items():
        history = [
            (i, load(ROOT / fmt / f"eval-{i}.json")) for i in range(1, epochs + 1)
        ]
        history = [
            (i, x)
            for i, x in history
            if x.get("format") == fmt and x.get("games", 0) > 0
        ]
        final = load(ROOT / fmt / "eval-final.json")
        if final.get("format") == fmt and final.get("games", 0) > 0:
            history.append(("final", final))
        ev = states.get("eval-" + fmt, {})
        actual = load(ROOT / fmt / "champion.json")
        if actual.get("bands"):
            bands = actual["bands"]
            champ = f"{actual.get('kind', 'model')} · " + (
                " / ".join(bands) if len(set(bands)) > 1 else bands[0]
            )
        else:
            champ = actual.get("kind") or actual.get("id")
        prior = [x for i, x in history if i != "final"]
        if prior:
            champ = f"{(prior[-1]['pin'] if prior[-1].get('improved') else prior[-1]['reference'])[:12]} · {actual.get('kind', 'model')}"
        frozen = list((ROOT / "input" / fmt / "archive").glob("*.json"))
        learned = [
            path
            for lineage_name in ("a", "b")
            for path in (ROOT / fmt / lineage_name / "archive").glob("*.json")
        ]
        facts = [
            ("Research champion", champ or "Awaiting initialization"),
            (
                "Archive",
                f"{len(frozen)} seed policies · {len(learned)} saved learners/counters",
            ),
        ]
        if frozen:
            facts.append(("Seed opponents", ", ".join(p.stem for p in sorted(frozen))))
        if learned:
            facts.append(
                (
                    "Most recent snapshot",
                    max(learned, key=lambda path: path.stat().st_mtime).name,
                )
            )
        latest = history[-1][1] if history else {}
        if history:
            facts.extend(
                [
                    (
                        "Last assessment",
                        "Final confirmatory holdout"
                        if history[-1][0] == "final"
                        else f"Development checkpoint {history[-1][0]}",
                    ),
                    ("Games in assessment", num(latest["games"])),
                ]
            )
            if history[-1][0] == "final":
                direct = latest["evaluation"]["direct"]
                facts.extend(
                    [
                        (
                            "Final vs starting champion",
                            "Confirmed improvement"
                            if latest["improved"]
                            else "Starting champion retained",
                        ),
                        (
                            "Final candidate / reference",
                            latest["pin"][:12] + " / " + latest["reference"][:12],
                        ),
                        (
                            "Final wins vs starting champion",
                            f"{percent(direct['estimate'])} ({percent(direct['lower'])} to {percent(direct['upper'])}, simultaneous 95%)",
                        ),
                    ]
                )
        else:
            facts.append(
                (
                    "Last assessment",
                    ev.get("message", "Awaiting first checkpoint assessment"),
                )
            )
        confirmed = [
            (i, x)
            for i, x in history
            if x.get("improved") is True or x.get("metrics", {}).get("improved") is True
        ]
        if confirmed:
            i, x = confirmed[-1]
            path = ROOT / fmt / f"eval-{i}.json"
            timestamp = moment(x.get("finishedAt")) or path.stat().st_mtime
            facts.append(("Time since verified improvement", dur(now - timestamp)))
        else:
            facts.append(
                (
                    "Time since verified improvement",
                    "None yet"
                    + (
                        " · " + dur(now - clock["startWall"]) + " elapsed"
                        if clock.get("startWall")
                        else ""
                    ),
                )
            )
        curve = []
        points = []
        for i, x in history:
            direct = x.get("evaluation", {}).get("direct", {})
            worst = next(
                (
                    f
                    for f in x.get("evaluation", {}).get("families", [])
                    if f["id"] == x.get("worst")
                ),
                {},
            )
            delta = worst.get("delta", {}).get("estimate")
            vals = [
                percent(direct.get("estimate")),
                (f"{100 * delta:+.1f} pp" if isinstance(delta, (int, float)) else "—"),
                percent(x.get("unfamiliarPartner")),
            ]
            cells = "".join(f"<td>{esc(v)}</td>" for v in vals)
            curve.append(
                f'<tr><td><a href="{fmt}/eval-{i}.json">{esc(i)}</a></td>{cells}</tr>'
            )
            if isinstance(i, int) and isinstance(direct.get("estimate"), (int, float)):
                points.append((i, direct["estimate"]))
        plot = ""
        if points:
            xy = [
                (8 + (e - 1) * 224 / max(epochs - 1, 1), 64 - max(0, min(1, y)) * 56)
                for e, y in points
            ]
            line = " ".join(f"{x:.1f},{y:.1f}" for x, y in xy)
            dots = "".join(
                f'<circle cx="{x:.1f}" cy="{y:.1f}" r="2.6" fill="#126c58"/>'
                for x, y in xy
            )
            plot = f'<figure style="margin:8px 0"><figcaption>Development checkpoint wins vs current champion · dotted line 50%</figcaption><svg viewBox="0 0 240 72" role="img" aria-label="Win rate by epoch; exact values in table" style="display:block;width:100%;height:65px"><path d="M8 36 H232" stroke="#84968d" stroke-dasharray="4 3"/><polyline fill="none" stroke="#126c58" stroke-width="2" points="{line}"/>{dots}</svg></figure>'
        if latest:
            facts.append(("Weakest matchup", latest.get("worst", "—")))
            d = latest.get("evaluation", {}).get("direct", {})
            if "lower" in d:
                facts.append(
                    (
                        "Direct 95% interval",
                        percent(d["lower"]) + " to " + percent(d["upper"]),
                    )
                )
            if fmt == "pairs-private-senas":
                facts.append(("Team gestures sent", num(latest.get("teamSignalsSent"))))
                se = latest.get("signalEffect")
                if se:
                    facts.append(
                        (
                            "Gesture effect",
                            f"{100 * se['estimate']:+.1f} pp (exploratory)",
                        )
                    )
        assessments.append(
            f"<section><h2>{title}</h2>{metric_list(facts)}"
            + plot
            + (
                "<table><thead><tr><th>Epoch</th><th>vs reference</th><th>Worst Δ</th><th>Unfamiliar partner</th></tr></thead><tbody>"
                + "".join(curve)
                + "</tbody></table>"
                if curve
                else ""
            )
            + "</section>"
        )
    rows = (
        "".join(
            f"<tr><td>{dt.datetime.fromtimestamp(stamp, ET).strftime('%H:%M:%S')}</td><td>{esc(n)}</td><td>{esc(st)}</td><td>{esc(msg)}</td></tr>"
            for stamp, n, st, msg in reversed(recent)
        )
        or "<tr><td colspan='4'>Waiting for the first event.</td></tr>"
    )
    start, deadline = clock.get("startedAt"), clock.get("deadline")
    estimate = ""
    if len(lane_work) == 4 and not finished:
        remaining = max(max(0, goal - work) * wall / work for work, wall in lane_work)
        estimate = f"<span>Remaining learning time ≈ {esc(dur(remaining))} plus assessments</span>"
    if total_wall > 0:
        estimate += f"<span>CPU used by trainers {esc(dur(total_cpu))} · {100 * total_cpu / total_wall:.0f}% of active worker time</span>"
    if total_cpu > 0:
        estimate += f"<span>Duel CPU {dur(duel_cpu)} · Partnership CPU {dur(partnership_cpu)} ({100 * duel_cpu / total_cpu:.0f}% / {100 * partnership_cpu / total_cpu:.0f}%)</span>"
    activity = summary.get(
        "message",
        run.get(
            "message", coordinator.get("message", "Waiting for coordinator release.")
        ),
    )
    style = """*{box-sizing:border-box}body{margin:0;background:#f3f5f0;color:#1f322c;font:15px/1.48 'DM Sans',system-ui,sans-serif}main{max-width:1350px;padding:clamp(15px,3.5vw,46px);margin:auto}h1{font-size:clamp(2.2rem,5vw,3.8rem);line-height:1.05;margin:0 0 .25em;letter-spacing:-.035em}.sub,.muted,dt{color:#486456}h2{font-size:1.1rem;margin:0}h3{font-size:1.3rem;margin:1.4em 0 .5em}a{color:#076346}.grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(min(100%,265px),1fr));gap:12px}section,.overview{background:white;border:1px solid #cdd9cf;border-radius:7px;padding:16px;min-width:0;overflow-wrap:anywhere}.overview{margin-top:16px;background:#e5eee5}.overview strong{display:block;font-size:1.15em}.overview p{margin:.35em 0}.grid header{display:flex;justify-content:space-between;align-items:baseline;gap:8px}label{border-radius:3px;padding:2px 7px;background:#eaf0e8;font-size:.8rem}.meta{display:flex;flex-wrap:wrap;gap:6px 22px}.meta span{white-space:normal}progress{width:100%;height:8px;accent-color:#25734e;margin:.8em 0 .3em}dl{display:grid;grid-template-columns:minmax(82px,.85fr) 1.1fr;gap:5px 8px;font-size:.9rem}dd{margin:0;font-variant-numeric:tabular-nums}table{width:100%;border-collapse:collapse}th,td{text-align:left;vertical-align:top;padding:5px 7px;border-bottom:1px solid #d5dfd4;font-size:.86rem}th{color:#365c45}td{overflow-wrap:anywhere}.activity td:first-child{white-space:nowrap;font-variant-numeric:tabular-nums}.alarm{background:#ffdf9e;padding:.6em;display:none}@media(max-width:550px){main{padding:12px}th,td{padding:4px 2px;font-size:.76rem}}"""
    refresh = "" if finished else '<meta http-equiv="refresh" content="8">'
    stale = (
        ""
        if finished
        else f"""<script>if(Date.now()-{int(now * 1000)}>70000)document.querySelector('.alarm').style.display='block'</script>"""
    )
    doc = f"""<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">{refresh}<title>Truco · overnight league</title><style>{style}</style></head><body><main><h1>Overnight training</h1><div class="sub">Computer-only Truco league · full games to 40</div><div class="overview"><strong>{esc(phase.title())} {f"· Epoch {epoch} of {epochs}" if epoch else ""}</strong><p>{esc(activity)}</p><div class="meta"><span>Started {eastern(start)}</span><span>Hard deadline {eastern(deadline)}</span><span>Updated {eastern(now)}</span>{estimate}<a href="progress.log">Open full progress log</a></div></div><p class="alarm">Live monitor updates have stopped. Check the log and supervisor.</p><h3>Training workers</h3><div class="grid">{"".join(blocks)}</div><h3>Champions and evaluation results</h3><p class="muted">Development checkpoints face the current research champion. The final holdout compares the frozen candidate with the starting champion.</p><div class="grid">{"".join(assessments)}</div><h3>Recent decisions and progress</h3><table class="activity"><thead><tr><th>Local time</th><th>Stream</th><th>Stage</th><th>Event</th></tr></thead><tbody>{rows}</tbody></table>{stale}</main></body></html>"""
    tmp = ROOT / "monitor.html.tmp"
    tmp.write_text(doc, encoding="utf-8")
    tmp.replace(ROOT / "monitor.html")


def watch(file_only=False):
    mutex = (OPS / "monitor.lock").open("a+")
    try:
        fcntl.flock(mutex, fcntl.LOCK_EX | fcntl.LOCK_NB)
    except BlockingIOError:
        raise SystemExit("Monitor already active")
    mutex.seek(0)
    mutex.truncate()
    mutex.write(str(os.getpid()))
    mutex.flush()
    state = {}
    recent = collections.deque(maxlen=42)
    offsets = {n: 0 for n in STREAMS}
    recorded = {n: set() for n in STREAMS}
    if (ROOT / "progress.log").exists():
        for line in (ROOT / "progress.log").open(encoding="utf-8"):
            parts = line.split(" ", 3)
            if (
                len(parts) >= 3
                and parts[1] in recorded
                and parts[2].startswith("@")
                and parts[2][1:].isdigit()
            ):
                recorded[parts[1]].add(int(parts[2][1:]))
    heartbeat = render_time = 0
    server = None
    while True:
        now = time.time()
        incoming = []
        for lane in STREAMS:
            path = ROOT / "events" / (lane + ".jsonl")
            if not path.exists():
                continue
            items = []
            with path.open("rb") as f:
                f.seek(offsets[lane])
                while True:
                    raw = f.readline()
                    if not raw.endswith(b"\n"):
                        break
                    o = f.tell()
                    offsets[lane] = o
                    try:
                        e = json.loads(raw)
                        assert isinstance(e, dict)
                    except (ValueError, AssertionError):
                        e = {
                            "message": "Malformed event record",
                            "stage": "telemetry",
                            "status": "warning",
                        }
                    e = safe_event(lane, e)
                    stamp = moment(e.get("ts")) or now
                    order = max(stamp, items[-1][0]) if items else stamp
                    items.append((order, lane, o, stamp, e))
            if items:
                incoming.append(items)
        any_new = False
        for _, lane, o, stamp, e in heapq.merge(*incoming, key=lambda x: x[:3]):
            any_new = True
            state[lane] = {**state.get(lane, {}), **e}
            msg = brief(e)
            recent.append((stamp, lane, e.get("stage", "training"), msg))
            if o not in recorded[lane]:
                addlog(
                    f"{utc(stamp)} {lane} @{o} {e.get('stage', 'training')} · {e.get('status', 'running')} | {msg}"
                )
                recorded[lane].add(o)
        if now - heartbeat >= 60 and not load(OPS / "summary.json"):
            addlog(
                f"{utc(now)} monitor | live · "
                + ", ".join(
                    f"{k} {v.get('status', 'pending')}" for k, v in state.items()
                )
            )
            heartbeat = now
        if any_new or now - render_time >= 6:
            dashboard(state, recent, now)
            render_time = now
        if server is None and not file_only:
            try:
                server = http.server.ThreadingHTTPServer(("127.0.0.1", PORT), Handler)
                threading.Thread(target=server.serve_forever, daemon=True).start()
                port = server.server_port
                (OPS / "monitor-url.txt").write_text(
                    f"http://127.0.0.1:{port}/\\n", encoding="utf-8"
                )
                print(f"Local dashboard http://127.0.0.1:{port}/", flush=True)
            except OSError as exc:
                (OPS / "http-error.txt").write_text(str(exc))
                server = False
        time.sleep(2 if not load(OPS / "summary.json") else 10)


def main():
    global ROOT, OPS, PORT, ET
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "run",
        type=Path,
        help="Directory containing the frozen protocol and training events",
    )
    parser.add_argument(
        "--port",
        type=int,
        default=8776,
        help="Loopback port (0 picks an available port)",
    )
    parser.add_argument(
        "--timezone", help="IANA time zone for timestamps (default: local time)"
    )
    parser.add_argument(
        "--file-only",
        action="store_true",
        help="Render monitor.html and progress.log without an HTTP listener",
    )
    args = parser.parse_args()
    if not 0 <= args.port <= 65535:
        parser.error("Port must be in 0..65535")
    ROOT = args.run.resolve()
    OPS = ROOT / "ops"
    PORT = args.port
    if args.timezone:
        ET = ZoneInfo(args.timezone)
    OPS.mkdir(exist_ok=True, parents=True)
    (ROOT / "events").mkdir(exist_ok=True)
    watch(args.file_only)


if __name__ == "__main__":
    main()
