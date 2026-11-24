import fcntl
import json
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch

from training.selfplay.continuous import worker


class PilotChainTest(unittest.TestCase):
    def setUp(self):
        temp = tempfile.TemporaryDirectory()
        self.addCleanup(temp.cleanup)
        self.run = Path(temp.name).resolve() / "pilot-09"
        self.child = self.run.with_name("pilot-10")
        self.ops = self.run / "ops/continuous"
        self.create(self.run)
        self.ops.mkdir()
        self.record(self.ops / "state.json", {"current": str(self.run)})
        (self.ops / "enabled").touch()
        self.commands = []
        call = patch.object(worker, "command", side_effect=self.command)
        self.command_mock = call.start()
        self.addCleanup(call.stop)

    def record(self, path, data):
        path.write_text(json.dumps(data))

    def create(self, run, parent=None):
        (run / "ops").mkdir(parents=True)
        (run / "league").write_text("fixture")
        protocol = {"computerOnly": True, "signals": "senas-equipo-v1",
                    "formats": ["duel", "pairs", "pairs-private-senas"],
                    "seed": run.name, "profile": "local-pilot"}
        if parent:
            protocol["parent"] = {"protocolSha256": worker.digest(parent / "protocol.json")}
        self.record(run / "protocol.json", protocol)
        manifest = run / "ops/runtime-manifest.json"
        self.record(manifest, {"schema": "standalone-selfplay-v1",
                               "protocolSha256": worker.digest(run / "protocol.json"),
                               "launcherSha256": worker.digest(run / "league"),
                               "files": {}, "source": "test-commit", "node": "v24.1.0"})
        (run / "READY").write_text(worker.digest(manifest))

    def command(self, run, action, *args):
        self.commands.append((run, action, *args))
        if action == "next":
            self.assertEqual(args[-1], "--prepare-only")
            self.create(args[0], parent=run)

    def locked(self, path):
        handle = path.open("a")
        self.addCleanup(handle.close)
        fcntl.flock(handle, fcntl.LOCK_EX)
        return handle

    def complete(self):
        self.record(self.run / "ops/summary.json", {"state": "complete"})

    def tick(self):
        worker.step(self.run)

    def test_wait_for_active_then_publish_and_resume_once(self):
        lock = self.locked(self.run / "ops/supervisor.lock")
        self.tick()
        self.assertFalse(self.commands)
        self.complete()
        fcntl.flock(lock, fcntl.LOCK_UN)
        self.tick()
        self.tick()
        self.assertEqual(self.commands, [
            (self.run, "next", self.child, "--prepare-only"), (self.child, "resume")])
        self.assertEqual(worker.read(self.ops / "state.json")["current"], str(self.child))
        self.assertFalse((self.ops / "error.txt").exists())
        self.locked(self.child / "ops/supervisor.lock")
        self.tick()
        self.assertNotIn("resumeAttempts", worker.read(self.ops / "state.json"))

    def test_crash_after_publication_recovers_the_existing_child(self):
        def interrupted(*args):
            self.command(*args)
            raise SystemExit("simulated process exit")
        self.complete()
        self.command_mock.side_effect = interrupted
        with self.assertRaises(SystemExit):
            self.tick()
        self.assertEqual(worker.read(self.ops / "state.json")["pending"], str(self.child))
        self.command_mock.side_effect = self.command
        self.tick()
        self.assertEqual([row[1] for row in self.commands], ["next", "resume"])

    def test_successive_completions_advance_from_the_latest_pilot(self):
        self.complete()
        self.tick()
        self.record(self.child / "ops/summary.json", {"state": "complete"})
        self.tick()
        grandchild = self.run.with_name("pilot-11")
        self.assertEqual(self.commands, [
            (self.run, "next", self.child, "--prepare-only"), (self.child, "resume"),
            (self.child, "next", grandchild, "--prepare-only"), (grandchild, "resume"),
        ])
        self.assertEqual(worker.read(self.ops / "state.json")["current"], str(grandchild))

    def test_stopping_during_preparation_keeps_child_prepared(self):
        def disable(*args):
            self.command(*args)
            (self.ops / "enabled").unlink()
        self.complete()
        self.command_mock.side_effect = disable
        self.tick()
        self.tick()
        self.assertEqual([row[1] for row in self.commands], ["next"])
        self.assertEqual(worker.read(self.ops / "state.json")["current"], str(self.child))

    def test_refuse_collision_and_terminal_failure_without_touching_files(self):
        self.complete()
        self.create(self.child)
        self.tick()
        self.assertIn("already exists", (self.ops / "error.txt").read_text())
        self.assertNotIn("pending", worker.read(self.ops / "state.json"))
        self.assertFalse(self.commands)
        (self.ops / "error.txt").unlink()
        self.record(self.run / "ops/summary.json", {"state": "incomplete"})
        self.tick()
        self.assertIn("incomplete", (self.ops / "error.txt").read_text())
        self.assertFalse(self.commands)

    def test_recovery_rejects_unrelated_or_changed_child(self):
        self.complete()
        state = {"current": str(self.run), "pending": str(self.child),
                 "parentProtocolSha256": worker.digest(self.run / "protocol.json")}
        self.record(self.ops / "state.json", state)
        self.create(self.child)
        self.tick()
        self.assertIn("does not match", (self.ops / "error.txt").read_text())
        (self.ops / "error.txt").unlink()
        (self.child / "protocol.json").write_text("{}")
        self.tick()
        self.assertIn("receipt does not match", (self.ops / "error.txt").read_text())
        self.assertFalse(self.commands)

    def test_attention_and_simultaneous_ticks_do_not_start_a_job(self):
        self.record(self.run / "ops/schedule.json", {"status": "attention", "message": "worker failed"})
        lock = self.locked(self.ops / "tick.lock")
        self.tick()
        self.assertFalse((self.ops / "error.txt").exists())
        fcntl.flock(lock, fcntl.LOCK_UN)
        self.tick()
        self.assertIn("worker failed", (self.ops / "error.txt").read_text())
        self.assertFalse(self.commands)

    def test_lost_supervisor_gets_bounded_restarts(self):
        with patch.object(worker.time, "time", side_effect=[1000, 1050, 1200, 1400, 1600]):
            for _ in range(5):
                self.tick()
        self.assertEqual([row[1] for row in self.commands], ["resume"] * 3)
        self.assertIn("did not start", (self.ops / "error.txt").read_text())
        self.tick()
        self.assertEqual(len(self.commands), 3)
        worker.clear_error(self.run)
        self.tick()
        self.assertEqual(len(self.commands), 4)
        self.assertFalse((self.ops / "error.txt").exists())

    def test_replaced_current_pilot_suspends_the_series(self):
        self.complete()
        self.tick()
        (self.child / "protocol.json").write_text("{}")
        self.tick()
        self.assertIn("protocol changed", (self.ops / "error.txt").read_text())
        self.assertEqual(len(self.commands), 2)
