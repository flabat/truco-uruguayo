"""Read published duel comparison snapshots without accessing training checkpoints."""

from datetime import datetime
import json
import math
from pathlib import Path


LABELS = {"baseline": "Baseline", "odds": "Card odds", "interactions": "Card odds + interactions"}
SCHEMAS = {"duel-card-odds-comparison-v1": ("baseline", "odds"),
           "duel-card-odds-comparison-v2": tuple(LABELS)}


def _json(path):
    try:
        with path.open(encoding="utf-8") as file:
            value = json.load(file)
    except FileNotFoundError:
        return None
    if not isinstance(value, dict):
        raise ValueError("Expected a JSON object")
    return value


def _number(value):
    if type(value) not in (int, float) or not math.isfinite(value) or value < 0:
        raise ValueError("Expected a finite nonnegative number")
    return value


def _count(value):
    if type(value) is not int or value < 0:
        raise ValueError("Expected a nonnegative count")
    return value


def _timestamp(value):
    date = datetime.fromisoformat(value.replace("Z", "+00:00"))
    if date.tzinfo is None:
        raise ValueError("Expected a timezone")
    return date.timestamp()


def _arm(run, arm, budget, now):
    row = dict(id=arm, label=LABELS[arm], state="queued", elapsedSeconds=0, remainingSeconds=budget,
               fraction=0, games=0, hands=0, decisions=0, updates=0, opponent=None, action=None,
               updatedAt=None, ageSeconds=None)
    try:
        p = _json(run / arm / "duel/a/progress.json")
        if p is None:
            return row
        if p.get("status") not in ("running", "complete") or p.get("targetSeconds", budget) != budget:
            raise ValueError("Unexpected progress snapshot")
        elapsed = min(budget, _number(p["trainingSeconds"]))
        age = max(0, now - _timestamp(p["ts"]))
        state = "complete" if p["status"] == "complete" else "stale" if age >= 30 else "training"
        if state == "complete":
            elapsed = budget
        row.update(state=state, elapsedSeconds=elapsed, remainingSeconds=budget-elapsed,
                   fraction=elapsed/budget, games=_count(p.get("games", 0)), hands=_count(p.get("hands", 0)),
                   decisions=_count(p.get("decisions", 0)), updates=_count(p.get("learnerUpdates", 0)),
                   opponent=p.get("opponent"), action=p.get("action"), updatedAt=p["ts"], ageSeconds=age)
    except (OSError, ValueError, KeyError, TypeError, AttributeError, OverflowError):
        row.update(state="unavailable", elapsedSeconds=None, remainingSeconds=None, fraction=None)
    return row


def _recent(run, arm):
    # The event stream grows throughout a run. The last 16 KiB comfortably fit
    # the ten displayed records, even when each includes a complete progress summary.
    try:
        with (run / arm / "events/duel-a.jsonl").open("rb") as file:
            size = file.seek(0, 2)
            file.seek(max(0, size - 16384))
            lines = file.read(16384).splitlines()
    except OSError:
        return []
    if size > 16384:
        lines = lines[1:]
    recent = []
    for line in reversed(lines):
        try:
            event = json.loads(line)
            instant = _timestamp(event["ts"])
            message = " · ".join(str(event[k]) for k in ("message", "action") if event.get(k))
            if message:
                recent.append((instant, dict(ts=event["ts"], arm=arm, label=LABELS[arm], message=message)))
                if len(recent) == 10:
                    break
        except (ValueError, TypeError, KeyError, AttributeError, OverflowError):
            continue  # An in-progress append can end with a partial line.
    return recent


def _published_results(report, arms, plan):
    pairs, budget = plan["pairs"], plan["secondsPerArm"]
    if (report.get("schema") != plan["schema"] or report.get("pairs") != pairs
            or report.get("secondsPerArm") != budget or set(report["arms"]) != set(arms)
            or any(report.get(k) != plan[k] for k in ("trainingSeed", "evaluationSeed", "sourceChampionPin") if k in plan)):
        raise ValueError("Unexpected comparison report")
    matchups = [("odds", "baseline", report["matchups"]["oddsVsBaseline"] if len(arms) == 3 else report["headToHead"])]
    if len(arms) == 3:
        for other, key in (("baseline", "interactionsVsBaseline"), ("odds", "interactionsVsOdds")):
            matchups.append(("interactions", other, report["matchups"][key]))
    matchups.extend((arm, "champion", report["againstChampion"][arm]) for arm in arms)
    results = []
    for left, right, interval in matchups:
        lower, upper, mean = (_number(interval[k]) for k in ("lower", "upper", "mean"))
        if upper > 1 or mean > 1 or lower > upper:
            raise ValueError("Unexpected win-rate interval")
        results.append(dict(left=left, right=right, mean=mean, lower=lower, upper=upper, pairs=pairs))
    games = {arm: _count(report["arms"][arm]["games"]) for arm in arms}
    return results, games


def snapshot(run: Path, now: float) -> dict:
    """Show the latest recorded active training budget and final, held-out win rates."""
    data = dict(run=run.name, phase="waiting", active=None, secondsPerArm=None, totalSeconds=None,
                elapsedSeconds=None, remainingSeconds=None, games=0, pairs=None, arms=[], events=[],
                results=[], notice=None)
    try:
        plan = _json(run / "plan.json")
        if plan is None:
            return data
        arms = SCHEMAS[plan["schema"]]
        expected = list(arms)
        if plan.get("arms", expected if len(arms) == 2 else None) != expected:
            raise ValueError("Unexpected comparison arms")
        budget, pairs = _number(plan["secondsPerArm"]), _count(plan["pairs"])
        if budget <= 0 or pairs < 2:
            raise ValueError("Unexpected comparison budget")
    except (OSError, ValueError, TypeError, KeyError, OverflowError):
        data.update(phase="unavailable", notice="The comparison plan could not be read.")
        return data

    rows = [_arm(run, arm, budget, now) for arm in arms]
    recent = [event for arm in arms for event in _recent(run, arm)]
    recent.sort(key=lambda item: item[0], reverse=True)
    data.update(arms=rows, events=[event for _, event in recent[:10]], pairs=pairs, secondsPerArm=budget,
                totalSeconds=len(arms)*budget, games=sum(r["games"] for r in rows))
    try:
        report = _json(run / "comparison.json")
        if report is not None:
            results, games = _published_results(report, arms, plan)
            for row in rows:
                row.update(state="complete", elapsedSeconds=budget, remainingSeconds=0, fraction=1, games=games[row["id"]])
            data.update(phase="complete", results=results, elapsedSeconds=data["totalSeconds"],
                        remainingSeconds=0, games=sum(games.values()))
            return data
    except (OSError, ValueError, TypeError, KeyError, AttributeError, OverflowError):
        data.update(phase="unavailable", notice="The evaluation report could not be read.")
        return data
    if any(row["state"] == "unavailable" for row in rows):
        data.update(phase="unavailable", notice="A model's progress could not be read.")
        return data
    unfinished = next((r for r in rows if r["state"] != "complete"), None)
    data.update(phase=unfinished["state"] if unfinished else "evaluation",
                active=unfinished["id"] if unfinished and unfinished["state"] in ("stale", "training") else None,
                elapsedSeconds=sum(r["elapsedSeconds"] for r in rows),
                remainingSeconds=sum(r["remainingSeconds"] for r in rows))
    return data
