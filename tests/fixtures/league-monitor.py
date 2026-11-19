"""Exercise process loss in the scheduler without launching or terminating a real trainer."""
import sys
import tempfile
import unittest
from pathlib import Path
from unittest.mock import Mock, patch

sys.path.insert(0, str(Path(__file__).resolve().parents[2] / "training/league"))
import monitor


class SchedulerRecovery(unittest.TestCase):
    def test_missing_reattached_pid_restarts_inside_same_budget(self):
        with tempfile.TemporaryDirectory() as tmp:
            run = Path(tmp)
            stage = run / "snapshots/pilot"
            stage.mkdir(parents=True)
            monitor.write(stage / "index.json", [])
            plan = {"seeds": [1], "budgets": {"pilot": 120}}
            cmd = "node training/league/cli.ts pilot --run " + str(run)
            tree = {17: (1, 12, cmd, 0.1)}
            child = Mock(pid=99, returncode=0)
            with patch.object(monitor, "processes", side_effect=[tree, {}]), \
                 patch.object(monitor, "watch", side_effect=[False, True]) as observe, \
                 patch.object(monitor.subprocess, "Popen", return_value=child) as start:
                result = monitor.timed_stage(run, "pilot", run, plan, ["duel"])
            self.assertEqual([call.args[2] for call in observe.call_args_list], [17, 99])
            self.assertEqual(observe.call_args_list[0].args[3], observe.call_args_list[1].args[3])
            self.assertEqual(start.call_count, 1)
            self.assertEqual(result["status"], "budget-finished")

    def test_new_scheduler_cannot_report_early_success(self):
        with tempfile.TemporaryDirectory() as tmp:
            run = Path(tmp)
            plan = {"seeds": [1], "budgets": {"pilot": 120}}
            with patch.object(monitor, "processes", return_value={}), \
                 patch.object(monitor, "watch", return_value=False), \
                 patch.object(monitor.subprocess, "Popen", return_value=Mock(pid=99, returncode=0)):
                with self.assertRaisesRegex(RuntimeError, "antes del plazo"):
                    monitor.timed_stage(run, "pilot", run, plan, ["duel"])
            self.assertIn('"status": "running"', (run / "pilot-clock.json").read_text())


if __name__ == "__main__":
    unittest.main()
