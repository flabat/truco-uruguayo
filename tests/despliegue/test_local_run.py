import json
import os
import shutil
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

from training.selfplay import local_run


class LocalRunTest(unittest.TestCase):
    def setUp(self):
        tmp = tempfile.TemporaryDirectory()
        self.addCleanup(tmp.cleanup)
        root = Path(tmp.name).resolve()
        self.run = root / "nueva liga"
        self.parent = root / "liga anterior"
        self.parent.mkdir()
        self.node = root / "node's $(exit 1)"
        self.node.write_text(f"#!{sys.executable}\n" + """
import hashlib, json, sys
from pathlib import Path
if sys.argv[1:] == ["--version"]:
    print("v24.1.1")
    sys.exit()
script, flag, destination, source, profile = sys.argv[1:]
assert flag == "--completed-parent" and Path(source).is_dir()
assert Path(script) == Path.cwd() / "training/selfplay/prepare.ts"
assert Path(script).read_text() == "committed trainer"
run = Path(destination)
files = {}
for name in ("input/duel/archive/champion.json", "evaluation-input/duel/opponent.json"):
    model = run / name
    model.parent.mkdir(parents=True)
    model.write_bytes(b"frozen model")
    files[name] = hashlib.sha256(model.read_bytes()).hexdigest()
if (Path(source) / "incomplete").exists():
    sys.exit(1)
(run / "protocol.json").write_text(json.dumps({"files": files, "profile": profile,
    "epochs": 3 if profile == "local-pilot" else 18, "maxWallHours": 8, "parent": source}))
""")
        self.node.chmod(0o700)
        repo = root / "checkout"
        repo.mkdir()
        self.git = ["git", "-C", str(repo)]
        subprocess.run([*self.git, "init", "--quiet"], check=True)
        paths = ("training/selfplay/prepare.ts", "package.json", "training/selfplay/local.py")
        script = repo / paths[0]
        script.parent.mkdir(parents=True)
        script.write_text("committed trainer")
        (repo / paths[1]).write_text("{}")
        (repo / paths[2]).write_text("""
import json, os, shutil, sys
print(json.dumps([*sys.argv[1:], shutil.which(os.environ.get("TRUCO_NODE", "node")),
                  sys.dont_write_bytecode]))
""")
        subprocess.run([*self.git, "add", "."], check=True)
        subprocess.run([*self.git, "-c", "user.name=Test", "-c", "user.email=test@example.invalid",
                        "-c", "commit.gpgsign=false", "commit", "--quiet", "-m", "fixture"], check=True)
        script.write_text("uncommitted trainer")
        for name, value in (("CHECKOUT", repo), ("RUNTIME_PATHS", paths)):
            setting = patch.object(local_run, name, value)
            setting.start()
            self.addCleanup(setting.stop)

    def prepare(self):
        return local_run.prepare_run(self.run, self.parent, "local-pilot", str(self.node))

    def verify(self):
        return local_run.verify_run(self.run, str(self.node))

    def test_prepare_uses_commit_and_resume_is_independent(self):
        protocol = self.prepare()
        receipt = json.loads((self.run / local_run.MANIFEST).read_text())
        self.assertEqual(receipt["source"], subprocess.check_output(
            [*self.git, "rev-parse", "HEAD"], text=True).strip())
        shutil.rmtree(local_run.CHECKOUT)
        shutil.rmtree(self.parent)
        self.assertEqual(self.verify(), protocol)
        with self.assertRaises(FileExistsError):
            self.prepare()
        self.assertEqual(self.verify(), protocol)

    def test_partial_preparation_leaves_destination_free_for_retry(self):
        (self.parent / "incomplete").touch()
        with self.assertRaises(subprocess.CalledProcessError):
            self.prepare()
        self.assertFalse(self.run.exists())
        (self.parent / "incomplete").unlink()
        self.assertEqual(self.prepare()["profile"], "local-pilot")

    def test_launcher_moves_with_run_and_uses_available_node(self):
        self.prepare()
        moved = self.parent.parent / "movida 'con $espacios'"
        self.run.rename(moved)
        launcher = moved / "league"
        bin_dir = moved.parent / "bin"
        bin_dir.mkdir()
        (bin_dir / "python3").symlink_to(sys.executable)
        fallback = bin_dir / "node"
        fallback.symlink_to(sys.executable)
        env = {"PATH": str(bin_dir)}

        def invoke(*args, environment=env):
            return json.loads(subprocess.check_output([str(launcher), *args], env=environment))

        self.assertTrue(os.access(launcher, os.X_OK))
        self.assertEqual(invoke(), ["status", str(moved), str(self.node), True])
        self.assertEqual(invoke("resume", environment={**env, "TRUCO_NODE": str(fallback)}),
                         ["resume", str(moved), str(fallback), True])
        self.node.unlink()
        self.assertEqual(invoke("results"), ["results", str(moved), str(fallback), True])
        for args in (["start"], ["status", "extra"]):
            process = subprocess.run([str(launcher), *args], env=env, capture_output=True)
            self.assertNotEqual(process.returncode, 0)
            self.assertIn(b"Usage:", process.stderr)

    def test_cannot_prepare_a_child_inside_parent(self):
        alias = self.parent.parent / "alias"
        alias.symlink_to(self.parent, target_is_directory=True)
        with self.assertRaisesRegex(ValueError, "fuera"):
            local_run.prepare_run(alias / "input" / "new", self.parent, "local-pilot", str(self.node))
        self.assertFalse((self.parent / "input").exists())

    def test_shortcut_prepares_the_next_run_offline_from_verified_frozen_files(self):
        checkout_dir = local_run.CHECKOUT / "training/selfplay"
        source_dir = Path(local_run.__file__).resolve().parent
        modules = ("local.py", "local_run.py", "local_status.py", "monitor.py")
        for filename in modules:
            shutil.copyfile(source_dir / filename, checkout_dir / filename)
        subprocess.run([*self.git, "add", *(str(checkout_dir / name) for name in modules)], check=True)
        subprocess.run([*self.git, "-c", "user.name=Test", "-c", "user.email=test@example.invalid",
                        "-c", "commit.gpgsign=false", "commit", "--quiet", "-m", "commands"], check=True)
        with patch.object(local_run, "RUNTIME_PATHS", ("training/selfplay", "package.json")):
            self.prepare()
        inherited = json.loads((self.run / local_run.MANIFEST).read_bytes())
        shutil.rmtree(local_run.CHECKOUT)
        root = self.run.parent
        bin_dir = root / "bin"
        bin_dir.mkdir()
        (bin_dir / "python3").symlink_to(sys.executable)
        # No git, npm or node on PATH. Only the executable recorded at preparation works.
        def next_run(*args):
            return subprocess.run([str(self.run / "league"), "next", *args],
                                  cwd=root, env={"PATH": str(bin_dir)}, capture_output=True, text=True)

        new_run = root / "otra 'liga'"
        completed = next_run(new_run.name, "--profile", "extended", "--prepare-only")
        self.assertEqual(completed.returncode, 0, completed.stderr)
        child = json.loads((new_run / local_run.MANIFEST).read_bytes())
        self.assertEqual(child["source"], inherited["source"])
        self.assertEqual(child["files"], inherited["files"])
        protocol = local_run.verify_run(new_run, str(self.node))
        self.assertEqual(protocol["profile"], "extended")
        self.assertEqual(protocol["parent"], str(self.run))
        refused = next_run(new_run.name, "--profile", "pilot", "--prepare-only")
        self.assertNotEqual(refused.returncode, 0)
        self.assertEqual(local_run.verify_run(new_run, str(self.node)), protocol)

        other = root / "not created"
        refused = next_run(str(other), "--from", str(self.parent), "--prepare-only")
        self.assertNotEqual(refused.returncode, 0)
        self.assertFalse(other.exists())
        (self.run / "runtime/package.json").write_text("changed")
        refused = next_run(str(other), "--prepare-only")
        self.assertNotEqual(refused.returncode, 0)
        self.assertIn("package.json", refused.stderr)
        self.assertFalse(other.exists())

    def test_resume_rejects_drift_in_frozen_artifacts(self):
        self.prepare()
        for name in ("runtime/training/selfplay/prepare.ts", "protocol.json",
                     "ops/runtime-manifest.json", "league", "READY", "evaluation-input/duel/opponent.json"):
            with self.subTest(name=name):
                path = self.run / name
                original = path.read_bytes()
                path.write_bytes(original + b"x")
                with self.assertRaises(ValueError):
                    self.verify()
                path.write_bytes(original)
        for name in ("runtime/training/selfplay/extra.py", "input/duel/archive/extra.json"):
            with self.subTest(name=name):
                path = self.run / name
                path.touch()
                with self.assertRaisesRegex(ValueError, "extra"):
                    self.verify()
                path.unlink()
        node = self.node.read_text()
        self.node.write_text(node.replace("v24.1.1", "v24.2.0"))
        with self.assertRaisesRegex(ValueError, "v24.1.1"):
            self.verify()

    def test_different_node_major_or_unknown_profile_never_creates_a_run(self):
        with self.assertRaisesRegex(ValueError, "Perfil"):
            local_run.prepare_run(self.run, self.parent, "legacy", str(self.node))
        self.node.write_text(self.node.read_text().replace("v24.1.1", "v22.22.0"))
        with self.assertRaisesRegex(ValueError, "Node 24"):
            self.prepare()
        self.assertFalse(self.run.exists())

    def test_frozen_runtime_links_the_rules_package(self):
        package = local_run.CHECKOUT / "paquetes/motor"
        (package / "src").mkdir(parents=True)
        (package / "package.json").write_text('{"name": "@eltruco/motor"}')
        (package / "src/cartas.ts").write_text("export const mazo = [];")
        subprocess.run([*self.git, "add", "paquetes"], check=True)
        subprocess.run([*self.git, "-c", "user.name=Test", "-c", "user.email=test@example.invalid",
                        "-c", "commit.gpgsign=false", "commit", "--quiet", "-m", "package"], check=True)
        with patch.object(local_run, "RUNTIME_PATHS", (*local_run.RUNTIME_PATHS, "paquetes/motor")):
            protocol = self.prepare()
        link = self.run / "runtime/node_modules/@eltruco/motor"
        self.assertEqual(os.readlink(link), "../../paquetes/motor")
        self.assertEqual((link / "src/cartas.ts").read_text(), "export const mazo = [];")
        files = json.loads((self.run / local_run.MANIFEST).read_bytes())["files"]
        self.assertEqual(files["node_modules/@eltruco/motor"], "symlink:../../paquetes/motor")
        self.assertIn("paquetes/motor/src/cartas.ts", files)
        self.assertFalse(any(name.startswith("node_modules/@eltruco/motor/") for name in files))
        self.assertEqual(self.verify(), protocol)
        link.unlink()
        link.symlink_to("../../training")
        with self.assertRaisesRegex(ValueError, "node_modules/@eltruco/motor"):
            self.verify()
        link.unlink()
        link.symlink_to("../../paquetes/motor")
        stray = self.run / "runtime/paquetes/otro"
        stray.symlink_to("motor")
        with self.assertRaisesRegex(ValueError, "Enlace inesperado"):
            self.verify()


class RuntimePathsTest(unittest.TestCase):
    def test_runtime_freezes_the_package_instead_of_the_old_path(self):
        self.assertIn("paquetes/motor", local_run.RUNTIME_PATHS)
        self.assertNotIn("src/motor", local_run.RUNTIME_PATHS)
