"""Render the live comparison of duel policies in a standalone browser page."""

from datetime import datetime
from html import escape
from math import ceil
from time import time


CSS = """
* { box-sizing: border-box }
:root { color-scheme: light; font: 15px/1.5 'DM Sans', system-ui, sans-serif; color: #20362c; background: #f3f5f0 }
body { margin: 0 }
main { max-width: 1240px; margin: auto; padding: clamp(16px, 4vw, 48px) }
h1,h2,h3,p,dl { margin: 0 }
h1 { font-size: clamp(2.3rem, 5vw, 3.65rem); line-height: 1.08; letter-spacing: -.045em }
h2 { font-size: 1.35rem; letter-spacing: -.02em }
h3 { font-size: 1.08rem; line-height: 1.3 }
.subtitle, .muted, dt, th { color: #4b6355 }
.subtitle { margin: .35rem 0 1.35rem }
.overview, article, .panel { border: 1px solid #cdd9ce; border-radius: 8px; min-width: 0 }
.overview { background: #e5eee5; padding: clamp(16px, 2.6vw, 30px) }
.topline, .card-head, .section-head, .budget { display: flex; align-items: baseline; justify-content: space-between; gap: .5rem 1rem; flex-wrap: wrap }
.overview h2 { font-size: clamp(1.4rem, 3vw, 2rem); line-height: 1.2 }
.overview dl { display: flex; flex-wrap: wrap; gap: .6rem clamp(1.5rem, 5vw, 4.5rem); margin: 1rem 0 }
.overview dd { font-size: clamp(1.45rem, 3vw, 2rem); font-weight: 650; letter-spacing: -.045em }
dd, time, .numeric, .budget { font-variant-numeric: tabular-nums }
dd { margin: 0 }
.budget, .meta { font-size: .86rem; color: #415e4c }
.budget { margin-top: .15rem }
progress { appearance: none; display: block; width: 100%; height: 7px; border: none; border-radius: 4px; overflow: hidden; background: #d3ded3; accent-color: #25734e }
progress::-webkit-progress-bar { background: #d3ded3 }
progress::-webkit-progress-value { background: #267752; border-radius: 4px }
progress::-moz-progress-bar { background: #267752; border-radius: 4px }
.grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(min(100%, 245px), 1fr)); gap: 12px }
article, .panel { background: #fff; padding: 16px }
article.active { border-color: #55906d; box-shadow: inset 0 3px #367e55 }
.badge { display: inline-block; background: #eaf0e8; color: #3f5948; font-size: .79rem; padding: 2px 7px; border-radius: 4px }
.active .badge { background: #dceede; color: #205432 }
.warning { color: #744c13; background: #fff1cf; padding: .45rem .7rem; margin-top: .65rem; border-radius: 4px }
.section-head { margin: 1.65rem 0 .55rem }
.card-head { align-items: start; gap: 6px; margin-bottom: 1rem }
.card-head h3 { flex: 1 1 135px }
.card-metrics { font-size: .88rem; margin-top: .8rem }
.card-metrics div { display: grid; grid-template-columns: minmax(6.4rem, .9fr) 1.3fr; gap: 8px; padding: 2px 0 }
dd, td, h3 { overflow-wrap: anywhere }
.panel > p + table { margin-top: .6rem }
.section-head a { color: #116444; text-underline-offset: 2px }
table { width: 100%; border-collapse: collapse }
td, th { text-align: left; vertical-align: top; padding: .48rem .55rem; border-bottom: 1px solid #dbe3da; font-size: .9rem }
th { font-size: .83rem; font-weight: 600 }
tbody tr:last-child td { border-bottom: 0 }
tr.key { background: #edf5ec; font-weight: 650 }
.times { white-space: nowrap }
@media(max-width: 550px) {
  main { padding: 16px 12px }
  .panel { padding: 10px }
  th, td { font-size: .79rem; padding: .38rem .25rem }
  .results td:nth-child(1), .activity td:nth-child(3) { overflow-wrap: anywhere }
  .overview dl { gap: .65rem 1.2rem }
}
"""

STATES = {"queued": "Queued", "training": "Training", "stale": "No recent update",
          "complete": "Complete", "unavailable": "Unavailable"}


def esc(value):
    return escape(str(value), quote=True)


def duration(value):
    if value is None:
        return "—"
    hours, rest = divmod(ceil(max(0, value)), 3600)
    mins, secs = divmod(rest, 60)
    return f"{hours}h {mins:02d}m {secs:02d}s" if hours else f"{mins}m {secs:02d}s"


def number(value):
    return "—" if value is None else f"{value:,.0f}"


def local_time(stamp, full=False):
    if not stamp:
        return "—"
    try:
        instant = datetime.fromisoformat(stamp.replace("Z", "+00:00")).astimezone()
    except (ValueError, OverflowError):
        return "—"
    label = instant.strftime("%b %d, %H:%M:%S %Z" if full else "%H:%M:%S")
    return f'<time datetime="{esc(stamp)}">{esc(label)}</time>'


def metrics(rows, css=""):
    # Values are escaped by the caller when they contain text from the run.
    fields = "".join(f"<div><dt>{key}</dt><dd>{value}</dd></div>" for key, value in rows)
    return f'<dl class="{css}">{fields}</dl>'


def bar(label, fraction):
    value = max(0, min(fraction or 0, 1)) * 100
    return f'<progress aria-label="{esc(label)}" max="100" value="{value:.2f}">{value:.0f}%</progress>'


def card(arm, budget):
    label = arm["label"]
    state = arm["state"]
    details = [("Time left", duration(arm["remainingSeconds"])), ("Chicos played", number(arm["games"]))]
    if arm["updatedAt"]:
        details.extend([("Hands played", number(arm["hands"])), ("Policy updates", number(arm["updates"]))])
        if arm["opponent"]:
            details.append(("Opponent", esc(arm["opponent"])))
        if arm["action"]:
            details.append(("Last public move", esc(arm["action"])))
        details.append(("Last update", local_time(arm["updatedAt"], full=True)))
    return (f'<article class="{"active" if state == "training" else ""}"><div class="card-head">'
            f'<h3>{esc(label)}</h3><span class="badge">{STATES[state]}</span></div>'
            f'{bar(label + " training progress", arm["fraction"])}<div class="budget">'
            f'<span>{duration(arm["elapsedSeconds"])} of {duration(budget)}</span></div>'
            f'{metrics(details, "card-metrics")}</article>')


def results_panel(data):
    labels = {arm["id"]: arm["label"] for arm in data["arms"]}
    labels["champion"] = "Frozen champion"
    matchups = data["results"]
    link = '<a href="comparison.json">Open comparison report</a>' if data["phase"] == "complete" else ""
    heading = f'<div class="section-head"><h2>Evaluation results</h2>{link}</div>'
    if not matchups:
        message = ("Results appear when training and evaluation finish." if data["phase"] != "complete"
                   else "The report contains no matchup estimates.")
        return f'<section>{heading}<div class="panel muted">{message}</div></section>'
    key = ("interactions", "odds")
    rows = []
    for row in sorted(matchups, key=lambda item: (item["left"], item["right"]) != key):
        left, right = row["left"], row["right"]
        cls = ' class="key"' if (left, right) == key else ""
        rows.append(f'<tr{cls}><td>{esc(labels[left])} vs {esc(labels[right])}</td>'
                    f'<td class="numeric">{row["mean"]:.1%}</td>'
                    f'<td class="numeric">{row["lower"]:.1%} – {row["upper"]:.1%}</td></tr>')
    return (f'<section>{heading}<div class="panel"><p class="muted">Win rates are for the first model '
            f'in each matchup, over {number(data["pairs"])} seat-swapped deal pairs.</p>'
            '<table class="results"><thead><tr><th scope="col">Matchup</th><th scope="col">Win rate</th>'
            f'<th scope="col">Paired 95% interval</th></tr></thead><tbody>{"".join(rows)}</tbody></table></div></section>')


def render(snapshot: dict) -> str:
    data = snapshot
    phase = data["phase"]
    arms = data["arms"]
    active = next((arm for arm in arms if arm["id"] == data["active"]), None)
    headline = {"complete": "Comparison complete", "evaluation": "Awaiting evaluation results",
                "queued": "Training queued", "waiting": "Waiting for the comparison to start",
                "stale": "Waiting for a training update", "unavailable": "Progress unavailable"}.get(phase, "Training")
    if phase == "training" and active:
        headline = f'Training · {active["label"]}'
    elif phase == "stale" and active:
        headline += f' · {active["label"]}'
    latest = max((arm["updatedAt"] for arm in arms if arm["updatedAt"]), default=None)
    updated = f'<span class="meta">Last checkpoint {local_time(latest, full=True)}</span>' if latest else ""
    if phase in ("complete", "evaluation"):
        top_metrics = [("Training time used", duration(data["elapsedSeconds"])), ("Chicos played", number(data["games"]))]
    else:
        top_metrics = [("Model time left", duration(active["remainingSeconds"]) if active else "—"),
                       ("Total training left", duration(data["remainingSeconds"]))]
    budget = data["totalSeconds"]
    elapsed = data["elapsedSeconds"]
    budget_bar = ""
    if budget and elapsed is not None and phase not in ("complete", "evaluation"):
        budget_bar = (bar("Total training progress", elapsed / budget) + '<div class="budget">'
                      f'<span>{duration(elapsed)} of {duration(budget)} training</span>'
                      '<span>Evaluation follows training</span></div>')
    notice = f'<p class="warning">{esc(data["notice"])}</p>' if data["notice"] else ""
    activity = "".join(f'<tr><td class="times">{local_time(e["ts"])}</td>'
                       f'<td>{esc(e["label"])}</td><td>{esc(e["message"])}</td></tr>' for e in data["events"])
    activity_panel = ('<table class="activity"><thead><tr><th scope="col">Local time</th><th scope="col">Model</th>'
                      f'<th scope="col">Event</th></tr></thead><tbody>{activity}</tbody></table>'
                      if activity else '<p class="muted">Waiting for the first training update.</p>')
    refresh = stale = ""
    if phase != "complete":
        refresh = '<meta http-equiv="refresh" content="5">'
        stale = f'''<p class="warning" id="saved-page" hidden>This page has stopped updating. Reopen the dashboard to reconnect.</p>
<script>if (Date.now() - {int(time() * 1000)} > 45000) document.getElementById("saved-page").hidden = false;</script>'''
    cards = "".join(card(arm, data["secondsPerArm"]) for arm in arms)
    return f"""<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">{refresh}
<title>Duel training · {esc(data['run'])}</title><style>{CSS}</style></head><body><main>
<h1>Duel training</h1><p class="subtitle">{esc(data['run'])} · Computer-only chicos to 40</p>
<section class="overview"><div class="topline"><h2>{esc(headline)}</h2>{updated}</div>
{metrics(top_metrics)}{budget_bar}{notice}{stale}</section>
<section><div class="section-head"><h2>Training models</h2></div><div class="grid">{cards}</div></section>
{results_panel(data)}
<section><div class="section-head"><h2>Recent activity</h2></div><div class="panel">{activity_panel}</div></section>
</main></body></html>"""
