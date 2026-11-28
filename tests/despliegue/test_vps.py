import importlib.util
from pathlib import Path
import subprocess
import tempfile
import unittest
from unittest.mock import patch

FILE = Path(__file__).resolve().parents[2] / "scripts/vps.py"
spec = importlib.util.spec_from_file_location("vps", FILE)
v = importlib.util.module_from_spec(spec)
spec.loader.exec_module(v)


def git(repo, *args):
    return subprocess.run(["git", "-C", repo, "-c", "user.name=Prueba", "-c", "user.email=prueba@example.test", *args],
                          check=True, text=True, capture_output=True).stdout.strip()


class ArgumentsTest(unittest.TestCase):
    def test_targets(self):
        for argv, web, ref in [([], False, None), (["."], False, None), (["codex/issue-9"], False, "codex/issue-9"),
                               (["web"], True, None), (["web", "."], True, None), (["web", "rama"], True, "rama")]:
            with self.subTest(argv=argv):
                args = v.parse(argv)
                self.assertEqual((args.web, args.ref), (web, ref))

    def test_two_branches_fail(self):
        with patch("sys.stderr"), self.assertRaises(SystemExit):
            v.parse(["una", "otra"])

    def test_reset_runs_alone(self):
        self.assertTrue(v.parse(["--reiniciar-datos"]).reiniciar)
        self.assertFalse(v.parse([]).reiniciar)
        for argv in (["--reiniciar-datos", "."], ["--reiniciar-datos", "web"], ["rama", "--reiniciar-datos"]):
            with self.subTest(argv=argv), patch("sys.stderr"), self.assertRaises(SystemExit):
                v.parse(argv)

    def test_release_tag(self):
        self.assertEqual(v.release_tag("a" * 40, False), "a" * 40)
        self.assertEqual(v.release_tag("a" * 40, True), "a" * 40 + "-sucio")


class HostTest(unittest.TestCase):
    def test_variable_wins(self):
        with patch.object(v, "out") as out:
            self.assertEqual(v.host({"TRUCO_VPS": "root@vps.example"}), "root@vps.example")
            out.assert_not_called()

    def test_ssh_config_alias(self):
        with patch.object(v, "out", return_value="user root\nhostname 203.0.113.5\nport 22"):
            self.assertEqual(v.host({}), v.ALIAS)

    def test_missing_host_stops(self):
        with patch.object(v, "out", return_value=f"hostname {v.ALIAS}\nport 22"), self.assertRaises(SystemExit):
            v.host({})

    def test_sudo_wraps_each_remote_command(self):
        self.assertEqual(v.ssh_command("vps", "rm -rf a && tar -x -C a", {"TRUCO_VPS_SUDO": "1"}),
                         ["ssh", "-o", "BatchMode=yes", "vps", "sudo -n sh -c 'rm -rf a && tar -x -C a'"])
        self.assertEqual(v.ssh_command("vps", "sh -s", {})[-1], "sh -s")

    def test_platform(self):
        with patch.object(v, "out", return_value="x86_64"):
            self.assertEqual(v.platform("vps", {}), "linux/amd64")
        self.assertEqual(v.platform("vps", {"TRUCO_VPS_PLATAFORMA": "linux/arm64"}), "linux/arm64")
        with patch.object(v, "out", return_value="riscv64"), self.assertRaises(SystemExit):
            v.platform("vps", {})


class PlanTest(unittest.TestCase):
    def setUp(self):
        tmp = tempfile.TemporaryDirectory()
        self.addCleanup(tmp.cleanup)
        root = Path(tmp.name)
        self.origin, self.repo = root / "origin", root / "repo"
        subprocess.run(["git", "init", "-q", "-b", "main", self.origin], check=True)
        (self.origin / "archivo").write_text("main")
        git(self.origin, "add", "archivo")
        git(self.origin, "commit", "-qm", "main")
        git(self.origin, "checkout", "-qb", "rama")
        (self.origin / "archivo").write_text("rama")
        git(self.origin, "commit", "-qam", "rama")
        git(self.origin, "checkout", "-q", "main")
        subprocess.run(["git", "clone", "-q", self.origin, self.repo], check=True)
        self.main = git(self.origin, "rev-parse", "main")

    def test_clean_and_dirty_tree(self):
        plan = v.plan(v.parse([]), self.repo, {})
        self.assertEqual((plan.sha, plan.release, plan.main), (self.main, self.main, self.main))
        self.assertEqual(plan.services, v.SERVICES)
        (self.repo / "nuevo").write_text("sin commit")
        self.assertEqual(v.plan(v.parse(["."]), self.repo, {}).release, self.main + "-sucio")

    def test_remote_branch_ignores_local_changes(self):
        (self.repo / "archivo").write_text("cambio local")
        plan = v.plan(v.parse(["web", "rama"]), self.repo, {"TRUCO_VPS_PROYECTO": "ensayo"})
        self.assertEqual(plan.sha, git(self.origin, "rev-parse", "rama"))
        self.assertEqual(plan.release, plan.sha)
        self.assertEqual(plan.main, self.main)
        self.assertEqual(plan.services, ("web",))
        self.assertEqual(plan.remote.project, "ensayo")

    def test_local_only_branch(self):
        git(self.repo, "checkout", "-qb", "solo-local")
        git(self.repo, "commit", "-q", "--allow-empty", "-m", "local")
        git(self.repo, "checkout", "-q", "main")
        self.assertEqual(v.plan(v.parse(["solo-local"]), self.repo, {}).sha, git(self.repo, "rev-parse", "solo-local"))

    def test_unknown_branch_fails(self):
        with self.assertRaises(subprocess.CalledProcessError):
            v.plan(v.parse(["no-existe"]), self.repo, {})


class RemoteTest(unittest.TestCase):
    sha = "a" * 40
    main = "b" * 40

    def script(self, services):
        plan = v.Plan(ref=None, sha=self.sha, release=self.sha + "-sucio", services=services, main=self.main)
        text = v.remote_script(plan)
        subprocess.run(["sh", "-n"], input=text, text=True, check=True)
        return text

    def test_full_release_marks_main_and_starts_everything(self):
        text = self.script(v.SERVICES)
        self.assertIn(f"TRUCO_RELEASE=\"$release\"", text)
        self.assertIn(f"release={self.sha}-sucio", text)
        self.assertIn("exec 9>/var/lib/truco-deploy/lock\nflock -w 900 9", text)
        self.assertIn(f"printf '%s %s\\n' {self.main} \"$release\" > /var/lib/truco-deploy/manual.next", text)
        self.assertIn("for service in ; do", text)
        self.assertIn("dc run --rm --no-deps -T backup guardar", text)
        self.assertIn("dc up -d --no-build db identidad api web\n  esperar db identidad api web", text)
        self.assertIn("dc up -d --no-build\n  esperar $(dc config --services)", text)

    def test_web_only_retags_other_services(self):
        text = self.script(("web",))
        self.assertIn("for service in api identidad backup; do", text)
        self.assertIn("dc up -d --no-build --no-deps web\n  esperar web", text)
        # Con las copias pausadas, Compose necesita los valores de backup antes del primer dc.
        self.assertLess(text.index("export RESTIC_REPOSITORY=/dev/null"), text.index("dc ps -a -q"))

    def test_deploy_sends_images_files_and_script(self):
        plan = v.Plan(ref="rama", sha=self.sha, release=self.sha, main=self.main)
        with tempfile.TemporaryDirectory() as repo, patch.object(v, "platform", return_value="linux/amd64"), \
                patch.object(v, "compose_build") as build, patch.object(v, "pipe") as pipe, \
                patch.object(v, "run") as run, patch("builtins.print"):
            v.deploy(plan, repo, "vps")
        self.assertEqual(build.call_args.args[1:], (plan, "linux/amd64"))
        archive, save, files = [call.args for call in pipe.call_args_list]
        self.assertEqual(archive[0], ["git", "-C", repo, "archive", self.sha])
        self.assertEqual(save, (["docker", "save", *v.images(self.sha, v.SERVICES)],
                                ["ssh", "-o", "BatchMode=yes", "vps", "docker load"]))
        self.assertEqual(files[0][-3:], list(v.REMOTE_FILES))
        self.assertIn(f"/opt/truco-oriental/manuales/{self.sha}", files[1][-1])
        self.assertEqual(run.call_args.args, ("ssh", "-o", "BatchMode=yes", "vps", "sh -s"))
        self.assertEqual(run.call_args.kwargs["input"], v.remote_script(plan))

    def test_build_uses_release_and_platform(self):
        plan = v.Plan(ref=None, sha=self.sha, release=self.sha + "-sucio", services=("web",))
        with patch.object(v, "run") as run:
            v.compose_build("/arbol", plan, "linux/amd64")
        args, env = run.call_args.args, run.call_args.kwargs["env"]
        self.assertEqual(args[-2:], ("build", "web"))
        self.assertEqual((env["TRUCO_RELEASE"], env["DOCKER_DEFAULT_PLATFORM"]), (self.sha + "-sucio", "linux/amd64"))

    def test_build_passes_version_for_the_footer(self):
        plan = v.Plan(ref="rama", sha=self.sha, release=self.sha, rama="rama", fecha="2026-11-26T12:00:00Z", etiqueta="")
        with patch.object(v, "run") as run:
            v.compose_build("/arbol", plan, "linux/amd64")
        env = run.call_args.kwargs["env"]
        self.assertEqual((env["TRUCO_RAMA"], env["TRUCO_FECHA"], env["TRUCO_ETIQUETA"]), ("rama", "2026-11-26T12:00:00Z", ""))

    def test_build_date_matches_the_api_format(self):
        from datetime import datetime, timezone
        self.assertEqual(v.build_date(datetime(2026, 11, 26, 9, 5, 3, 123, tzinfo=timezone.utc)), "2026-11-26T09:05:03Z")

    def test_pipe_reports_failures(self):
        v.pipe(["printf", "hola"], ["sh", "-c", "cat >/dev/null"])
        with self.assertRaises(subprocess.CalledProcessError):
            v.pipe(["false"], ["cat"])
        with self.assertRaises(subprocess.CalledProcessError):
            v.pipe(["printf", "hola"], ["false"])


class ResetTest(unittest.TestCase):
    def test_script_backs_up_drops_game_data_and_waits_for_the_api(self):
        text = v.reset_script(v.Remote())
        subprocess.run(["sh", "-n"], input=text, text=True, check=True)
        self.assertIn("exec 9>/var/lib/truco-deploy/lock\nflock -w 900 9", text)
        self.assertIn("label=com.docker.compose.project=truco-produccion", text)
        order = [text.index(step) for step in ("dc run --rm --no-deps -T backup guardar", "dc stop api",
                                               "DROP SCHEMA IF EXISTS juego CASCADE", "dc start api", "esperar api\n")]
        self.assertEqual(order, sorted(order))
        self.assertNotIn("identidad", v.BORRAR_DATOS)
        # Con las copias pausadas, Compose necesita los valores de backup antes del primer dc.
        self.assertLess(text.index("export RESTIC_REPOSITORY=/dev/null"), text.index("dc stop api"))

    def test_confirmation_needs_the_exact_host(self):
        for answer in ("", "otro", "root@vps"):
            with self.subTest(answer=answer), patch("builtins.print"), patch.object(v, "run") as run, \
                    self.assertRaises(SystemExit):
                v.reset("root@vps.example", {}, ask=lambda _: answer)
            run.assert_not_called()

        def eof(_):
            raise EOFError
        with patch("builtins.print"), patch.object(v, "run") as run, self.assertRaises(SystemExit):
            v.reset("root@vps.example", {}, ask=eof)
        run.assert_not_called()

    def test_confirmed_reset_sends_the_script(self):
        with patch("builtins.print"), patch.object(v, "run") as run:
            v.reset("root@vps.example", {}, ask=lambda _: " root@vps.example\n")
        self.assertEqual(run.call_args.args, ("ssh", "-o", "BatchMode=yes", "root@vps.example", "sh -s"))
        self.assertEqual(run.call_args.kwargs["input"], v.reset_script(v.Remote()))


if __name__ == "__main__":
    unittest.main()
