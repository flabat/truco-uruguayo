import importlib.util
import io
import json
from pathlib import Path
import subprocess
import tempfile
import unittest
from unittest.mock import patch

FILE = Path(__file__).resolve().parents[2] / "infra/despliegue/desplegar.py"
spec = importlib.util.spec_from_file_location("desplegar", FILE)
d = importlib.util.module_from_spec(spec)
spec.loader.exec_module(d)


class DeployTest(unittest.TestCase):
    sha = "a" * 40
    old = "b" * 40

    def setUp(self):
        tmp = tempfile.TemporaryDirectory()
        self.addCleanup(tmp.cleanup)
        root = Path(tmp.name).resolve()
        for name, path in {"ROOT": root, "STATE": root / "state", "RELEASES": root / "automaticas"}.items():
            self.mock(d, name, new=path)
            path.mkdir(exist_ok=True)
        self.mock(d, "CONFIG", new=root / "production.env")
        (d.RELEASES / self.old).mkdir()
        (d.RELEASES / self.sha).mkdir()
        self.head = self.mock(d, "main_head", return_value=self.sha)
        self.ci = self.mock(d, "verified", return_value=True)
        self.stage = self.mock(d, "stage", return_value=True)
        self.config = self.mock(d, "configured", return_value=True)
        self.backup = self.mock(d, "prepare_data")
        self.compose = self.mock(d, "compose")
        self.mock(d, "cleanup")

    def mock(self, target, name, **kwargs):
        patcher = patch.object(target, name, **kwargs)
        self.addCleanup(patcher.stop)
        return patcher.start()

    def test_failed_checks_never_stage(self):
        self.ci.return_value = False
        d.deploy()
        self.stage.assert_not_called()
        self.compose.assert_not_called()

    def test_missing_launch_configuration_stages_only(self):
        self.config.return_value = False
        d.deploy()
        self.stage.assert_called_once_with(self.sha)
        self.backup.assert_not_called()
        self.compose.assert_not_called()
        self.assertFalse((d.ROOT / "current").exists())

    def test_superseded_build_never_switches(self):
        self.head.side_effect = [self.sha, "c" * 40]
        d.deploy()
        self.backup.assert_not_called()
        self.compose.assert_not_called()

    def test_failed_backup_never_changes_running_release(self):
        d.point("current", d.RELEASES / self.old)
        self.backup.side_effect = RuntimeError("copia")
        with self.assertRaises(RuntimeError):
            d.deploy()
        self.compose.assert_not_called()
        self.assertEqual((d.ROOT / "current").resolve(), d.RELEASES / self.old)

    def test_pause_and_resume_on_same_commit(self):
        pause = d.CONFIG.with_name("copias-pausadas")
        pause.touch()
        for sha in (self.old, self.sha):
            self.head.return_value = sha
            d.deploy()
            self.backup.assert_not_called()
            self.compose.assert_any_call(sha, "rm", "--stop", "--force", "backup", without_backup=True)
            self.compose.assert_any_call(sha, "up", "-d", "--no-build", "--wait", "--wait-timeout",
                                         "600", "db", "identidad", "api", "web", without_backup=True)
            self.assertEqual((d.ROOT / "current").resolve(), d.RELEASES / sha)
        self.compose.reset_mock()
        d.deploy()
        self.compose.assert_not_called()
        pause.unlink()
        self.config.return_value = False
        d.deploy()
        self.compose.assert_not_called()
        self.config.return_value = True
        d.deploy()
        self.backup.assert_called_once_with(self.sha)
        self.compose.assert_any_call(self.sha, "up", "-d", "--no-build", "--wait", "--wait-timeout",
                                     "600", without_backup=False)
        self.assertFalse((d.STATE / "copias-pausadas").exists())

    def test_retry_after_health_failure_preserves_pre_migration_backup(self):
        d.point("current", d.RELEASES / self.old)
        self.compose.side_effect = [None, RuntimeError("TLS")]
        with self.assertRaises(RuntimeError):
            d.deploy()
        self.assertEqual((d.STATE / "pendiente").read_text().strip(), self.sha)
        self.assertEqual((d.ROOT / "current").resolve(), d.RELEASES / self.old)
        self.compose.side_effect = None
        d.deploy()
        self.backup.assert_called_once_with(self.sha)
        self.assertEqual((d.ROOT / "current").resolve(), d.RELEASES / self.sha)
        self.assertEqual((d.ROOT / "previous").resolve(), d.RELEASES / self.old)
        self.compose.reset_mock()
        d.deploy()
        self.compose.assert_not_called()


class ChecksTest(unittest.TestCase):
    def test_exact_successful_push_only(self):
        sha = "a" * 40
        run = dict(head_sha=sha, event="push", head_branch="main", status="completed", conclusion="success")
        for change, expected in [({}, True), ({"head_sha": "b"*40}, False), ({"event":"pull_request"}, False),
                                 ({"head_branch":"test"}, False), ({"status":"in_progress"}, False),
                                 ({"conclusion":"failure"}, False)]:
            data = json.dumps({"workflow_runs":[dict(run, **change)]}).encode()
            with self.subTest(change=change), patch.object(d.urllib.request, "urlopen", return_value=io.BytesIO(data)):
                self.assertEqual(d.verified(sha), expected)

    def test_data_checks_for_new_and_existing_volumes(self):
        for volume, contents in [("", ""), ("truco-produccion_postgres", ""), ("truco-produccion_postgres", "/datos/PG_VERSION")]:
            with self.subTest(volume=volume, contents=contents), patch.object(d, "compose") as compose, patch.object(d, "run") as run:
                run.side_effect = [subprocess.CompletedProcess([], 0, value) for value in (volume, contents)]
                d.prepare_data("a" * 40)
                self.assertEqual([call.args[-1] for call in compose.call_args_list],
                                 ["listar", "guardar"] if contents else ["listar"])

    def test_build_exports_exact_commit_and_uses_separate_image_tags(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp).resolve()
            remote = root / "remote"
            subprocess.run(["git","init","-q","-b","main",remote], check=True)
            (remote/"version").write_text("prueba")
            subprocess.run(["git","-C",remote,"add","version"],check=True)
            subprocess.run(["git","-C",remote,"-c","user.name=CI","-c","user.email=ci@example.test",
                            "commit","-qm","prueba"],check=True)
            state = root / "state"
            releases = root / "releases"
            state.mkdir()
            releases.mkdir()
            with patch.multiple(d, ROOT=root, STATE=state, RELEASES=releases, REMOTE=remote.as_uri()), patch.object(d,"compose") as compose:
                sha = d.main_head()
                self.assertTrue(d.stage(sha))
                self.assertEqual((root/"staged"/"version").read_text(), "prueba")
                self.assertEqual((root/"staged").resolve(), releases/sha)
                self.assertEqual(compose.call_args_list[0].args, (sha,"build"))
                compose.reset_mock()
                self.assertTrue(d.stage(sha))
                compose.assert_not_called()
