import json
from pathlib import Path
import tempfile
import unittest

from training.selfplay.duel_dashboard_data import snapshot


class DuelDashboardData(unittest.TestCase):
    now = 1704067200  # 2024-01-01T00:00:00Z
    arms = ["baseline", "odds", "interactions"]

    def setUp(self):
        tmp = tempfile.TemporaryDirectory()
        self.addCleanup(tmp.cleanup)
        self.root = Path(tmp.name)

    def write(self, rel, value):
        path = self.root / rel
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(json.dumps(value))
        return path

    def plan(self, three=True):
        plan = {"schema": "duel-card-odds-comparison-v" + ("2" if three else "1"),
                "secondsPerArm": 60, "pairs": 24}
        if three:
            plan["arms"] = self.arms
        self.write("plan.json", plan)
        return plan

    def progress(self, arm, elapsed, status):
        self.write(arm + "/duel/a/progress.json",
                   {"ts": "2024-01-01T00:00:00Z", "status": status, "trainingSeconds": elapsed,
                    "games": 80, "hands": 200, "learnerUpdates": 50, "opponent": "rare-bluff"})

    def test_live_stale_queued_and_evaluation(self):
        self.assertEqual(snapshot(self.root, self.now)["phase"], "waiting")
        self.plan()
        data = snapshot(self.root, self.now)
        self.assertEqual((data["phase"], data["totalSeconds"], data["remainingSeconds"]), ("queued", 180, 180))
        self.progress("baseline", 60.04, "complete")
        self.progress("odds", 18, "running")
        data = snapshot(self.root, self.now + 5)
        self.assertEqual((data["phase"], data["active"], data["games"]), ("training", "odds", 160))
        self.assertEqual((data["elapsedSeconds"], data["remainingSeconds"]), (78, 102))
        self.assertEqual([r["state"] for r in data["arms"]], ["complete", "training", "queued"])
        self.assertEqual(data["arms"][1]["fraction"], 0.3)
        data = snapshot(self.root, self.now + 30)
        self.assertEqual(data["phase"], "stale")
        self.assertEqual(data["remainingSeconds"], 102)
        for arm in self.arms:
            self.progress(arm, 60, "complete")
        data = snapshot(self.root, self.now + 6000)
        self.assertEqual((data["phase"], data["active"], data["remainingSeconds"], data["results"]),
                         ("evaluation", None, 0, []))

    def test_two_and_three_arm_reports_and_invalid_replacement(self):
        interval = dict(mean=0.5, lower=0.4, upper=0.6)
        for three in (False, True):
            with self.subTest(three=three):
                plan = self.plan(three)
                arms = self.arms if three else self.arms[:2]
                report = {**plan, "arms": {k: {"games": 300} for k in arms}, "headToHead": interval,
                          "againstChampion": {k: interval for k in arms}}
                if three:
                    report["matchups"] = dict(oddsVsBaseline=interval, interactionsVsBaseline=interval,
                                               interactionsVsOdds=dict(mean=0.8, lower=0.7, upper=0.9))
                path = self.write("comparison.json", report)
                data = snapshot(self.root, self.now)
                self.assertEqual((data["phase"], data["games"], data["remainingSeconds"]),
                                 ("complete", 300*len(arms), 0))
                self.assertEqual(len(data["results"]), 6 if three else 3)
                if three:
                    self.assertEqual(next(r["mean"] for r in data["results"] if r["right"] == "odds"), 0.8)
                self.assertTrue(all(r["state"] == "complete" for r in data["arms"]))
                self.write("replacement.json", {**report, "pairs": 2}).replace(path)
                self.assertEqual(snapshot(self.root, self.now)["phase"], "unavailable")

    def test_bounded_recent_moves_and_partial_event(self):
        self.plan()
        events = self.root / "baseline/events/duel-a.jsonl"
        events.parent.mkdir(parents=True)
        with events.open("w") as file:
            for i in range(200):
                record = {"ts": f"2024-01-01T00:{i//60:02}:{i%60:02}Z", "message": "Playing",
                          "action": f"Seat 1 · hand {i}", "ignored": "a" * 100}
                file.write(json.dumps(record) + "\n")
            file.write('{"ts":')
        data = snapshot(self.root, self.now)
        self.assertEqual(len(data["events"]), 10)
        self.assertEqual(data["events"][0]["message"], "Playing · Seat 1 · hand 199")
        self.assertIn("hand 190", data["events"][-1]["message"])

    def test_invalid_inputs_are_distinct_from_an_unstarted_run(self):
        plan = self.plan()
        self.write("plan.json", {**plan, "arms": ["../../", "odds", "interactions"]})
        self.assertEqual(snapshot(self.root, self.now)["phase"], "unavailable")
        self.plan()
        self.progress("odds", 12, "running")
        (self.root / "odds/duel/a/progress.json").write_text("bad data")
        data = snapshot(self.root, self.now)
        self.assertEqual((data["phase"], data["remainingSeconds"], data["arms"][1]["state"]),
                         ("unavailable", None, "unavailable"))
