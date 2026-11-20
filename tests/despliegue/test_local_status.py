import fcntl
import io
import json
from contextlib import redirect_stdout
from pathlib import Path
from shlex import quote
import sys
from tempfile import TemporaryDirectory
import unittest

sys.path.insert(0, str(Path(__file__).resolve().parents[2] / "training/selfplay"))
from local_status import print_status


class LocalStatusTest(unittest.TestCase):
    def setUp(self):
        temp = TemporaryDirectory(prefix="truco status ")
        self.addCleanup(temp.cleanup)
        self.run_dir = Path(temp.name).resolve()
        self.ops = self.run_dir / "ops"
        self.ops.mkdir()
        self.save("protocol.json", {"epochs": 3, "trainSecondsPerEpoch": 60})

    def save(self, name, data):
        path = self.run_dir / name
        path.parent.mkdir(exist_ok=True, parents=True)
        path.write_text(json.dumps(data), encoding="utf-8")

    def lock(self, name):
        handle = (self.ops / name).open("wb")
        self.addCleanup(handle.close)
        fcntl.flock(handle, fcntl.LOCK_EX)

    def output(self):
        buffer = io.StringIO()
        with redirect_stdout(buffer):
            print_status(self.run_dir)
        return buffer.getvalue()

    def test_prepared_and_unknown_are_read_only(self):
        (self.run_dir / "READY").touch()
        self.assertIn("State       prepared", self.output())
        self.assertEqual(list(self.ops.iterdir()), [])
        unknown = self.run_dir / "missing"
        with self.assertRaisesRegex(ValueError, "No training run"):
            print_status(unknown)
        self.assertFalse(unknown.exists())

    def test_running_progress_and_loopback_dashboard(self):
        self.lock("supervisor.lock")
        self.lock("monitor.lock")
        self.save("ops/clock.json", {"deadlineUTC": "2026-11-20T23:00:00Z"})
        self.save("ops/schedule.json", {"phase": "training", "epoch": 2, "status": "running"})
        self.save("ops/resources/duel-b.json", {"trainingSeconds": 70, "games": 1250})
        (self.ops / "monitor-url.txt").write_text("http://127.0.0.1:8765/\n")
        out = self.output()
        self.assertIn("State       running", out)
        self.assertIn("Epoch       2 / 3", out)
        self.assertIn("2026-11-20T23:00:00Z", out)
        self.assertIn("http://127.0.0.1:8765/", out)
        self.assertRegex(out, r"duel-b\s+1m 10s / 3m 00s training   1,250 games")
        for lane in ("duel-a", "pairs ", "pairs-private-senas"):
            self.assertIn(lane, out)

    def test_stale_files_show_interruption_and_saved_dashboard(self):
        self.save("ops/clock.json", {"startedAt": "2026-11-20T22:00:00Z"})
        self.save("ops/schedule.json", {"status": "running", "phase": "final evaluation", "epoch": "final"})
        for name in ("monitor.lock", "supervisor.lock"):
            (self.ops / name).write_text("1\n")
        (self.ops / "monitor-url.txt").write_text("http://127.0.0.1:8123/")
        (self.run_dir / "monitor.html").touch()
        out = self.output()
        self.assertIn("interrupted", out)
        self.assertIn("final evaluation", out)
        self.assertIn("Monitor     not running", out)
        self.assertIn("monitor.html (saved page)", out)
        self.assertNotIn("8123", out)

    def test_attention_and_terminal_summary(self):
        self.save("ops/schedule.json", {"status": "attention", "phase": "training", "epoch": 1})
        self.save("ops/tasks/e01-train-duel-a.json", {"state": "attention", "reason": "disk full"})
        out = self.output()
        self.assertIn("State       attention", out)
        self.assertIn("disk full", out)
        self.assertIn("ops/tasks/e01-train-duel-a.log", out)
        self.assertIn("touch " + quote(str(self.ops / "retry-e01-train-duel-a")), out)
        for state in ("incomplete", "complete"):
            self.save("ops/summary.json", {"state": state, "completedEpochs": 1})
            out = self.output()
            self.assertIn(f"State       {state}", out)
            self.assertNotIn("touch ", out)
