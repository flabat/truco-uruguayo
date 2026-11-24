import contextlib
import io
import json
import os
from pathlib import Path
import plistlib
import shutil
import subprocess
import sys
import tempfile
import unittest
from unittest.mock import patch

from training.selfplay.continuous import __main__ as service


class ContinuousServiceTest(unittest.TestCase):
    def setUp(self):
        directory = tempfile.TemporaryDirectory()
        self.addCleanup(directory.cleanup)
        self.home = Path(directory.name).resolve()
        self.root = self.home / "test pilots" / "pilot 01"
        (self.root / "ops").mkdir(parents=True)
        (self.root / "league").write_text("#!/bin/sh\necho pilot-status\n")
        (self.root / "league").chmod(0o755)
        (self.root / "ops/runtime-manifest.json").write_text(json.dumps({"schema": "standalone-selfplay-v1"}))
        protocol = {"computerOnly": True, "signals": "senas-equipo-v1",
                    "formats": ["duel", "pairs", "pairs-private-senas"]}
        (self.root / "protocol.json").write_text(json.dumps(protocol))
        self.ops = self.root / "ops/continuous"
        self.source = Path(service.__file__).parent
        self.loaded_path = None
        self.bootstrap_error = False
        self.actions = []

    def launchctl(self, args, **kwargs):
        action = args[1]
        self.actions.append(action)
        if action == "print":
            if self.loaded_path is None:
                return subprocess.CompletedProcess(args, 113, "", "Could not find service")
            return subprocess.CompletedProcess(args, 0, f"job = {{\n\tpath = {self.loaded_path}\n}}", "")
        if action == "bootstrap":
            if self.bootstrap_error:
                raise subprocess.CalledProcessError(5, args)
            self.loaded_path = Path(args[3])
        elif action == "bootout":
            self.loaded_path = None
        else:
            self.fail(f"Unexpected service command: {args}")
        return subprocess.CompletedProcess(args, 0)

    @contextlib.contextmanager
    def mac(self):
        with (patch.object(service.sys, "platform", "darwin"),
              patch.object(service.Path, "home", return_value=self.home),
              patch.object(service.subprocess, "run", side_effect=self.launchctl),
              contextlib.redirect_stdout(io.StringIO())):
            yield

    def test_install_is_portable_idempotent_and_preserves_collisions(self):
        install = [sys.executable, "-B", str(self.source), "install", str(self.root)]
        for _ in range(2):
            subprocess.run(install, check=True, capture_output=True)
        moved = self.root.rename(self.root.with_name("moved pilot"))
        result = subprocess.run([str(moved / "continuous"), "status"], check=True, text=True, capture_output=True)
        self.assertIn("Automatic pilots: disabled", result.stdout)
        self.assertIn("pilot-status", result.stdout)
        self.assertFalse((moved / "ops/continuous/enabled").exists())
        (moved / "continuous").write_text("keep me")
        refused = subprocess.run([*install[:-1], str(moved)], capture_output=True)
        self.assertNotEqual(refused.returncode, 0)
        self.assertEqual((moved / "continuous").read_text(), "keep me")

    def test_start_and_stop_keep_one_owned_agent_and_persist_node(self):
        with self.mac():
            with patch.dict(os.environ, {"TRUCO_NODE": "/path to/node"}):
                service.operate(self.root, True)
            plist = self.loaded_path
            saved = plistlib.loads(plist.read_bytes())
            self.assertEqual(saved["ProgramArguments"][-2:], [str(self.root / "continuous"), "_tick"])
            self.assertEqual(saved["EnvironmentVariables"]["TRUCO_NODE"], "/path to/node")
            self.assertTrue(saved["RunAtLoad"])
            self.assertEqual(saved["StartInterval"], 60)
            self.assertEqual(json.loads((self.ops / "state.json").read_text())["current"], str(self.root))
            service.operate(self.root, True)
            self.assertEqual(self.actions.count("bootstrap"), 1)
            # Simulate launchd reloading this registration at next login.
            self.loaded_path = None
            service.operate(self.root, True)
            self.assertEqual(self.actions.count("bootstrap"), 2)
            service.operate(self.root, False)
            service.operate(self.root, False)
            self.assertEqual(self.actions.count("bootout"), 1)
            self.assertFalse(plist.exists())
            self.assertFalse((self.ops / "enabled").exists())
            self.assertTrue((self.root / "league").is_file())

    def test_failed_bootstrap_is_retryable_and_foreign_jobs_are_preserved(self):
        with self.mac():
            self.bootstrap_error = True
            with self.assertRaises(subprocess.CalledProcessError):
                service.operate(self.root, True)
            self.assertFalse((self.ops / "enabled").exists())
            self.bootstrap_error = False
            service.operate(self.root, True)
            own_plist = self.loaded_path
            self.loaded_path = self.home / "another.plist"
            with self.assertRaisesRegex(ValueError, "differs"):
                service.operate(self.root, False)
            self.assertNotIn("bootout", self.actions)
            self.assertTrue(own_plist.exists())
            self.loaded_path = own_plist
            own_plist.write_bytes(b"unrelated")
            with self.assertRaisesRegex(ValueError, "different configuration"):
                service.operate(self.root, False)
            self.assertEqual(own_plist.read_bytes(), b"unrelated")
            self.assertNotIn("bootout", self.actions)

    def test_copy_cannot_stop_original_registration(self):
        with self.mac():
            service.operate(self.root, True)
            clone = self.root.with_name("copy")
            shutil.copytree(self.root, clone)
            with self.assertRaisesRegex(ValueError, "registered run still exists"):
                service.operate(clone, False)
            self.assertTrue((self.ops / "enabled").exists())
            self.assertTrue(self.loaded_path.is_file())
            self.assertNotIn("bootout", self.actions)
