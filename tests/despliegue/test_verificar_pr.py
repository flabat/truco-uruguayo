import importlib.util
from pathlib import Path
import subprocess
import unittest
from unittest.mock import patch


ARCHIVO = Path(__file__).resolve().parents[2] / "infra/ci/verificar_pr.py"
spec = importlib.util.spec_from_file_location("verificar_pr", ARCHIVO)
ci = importlib.util.module_from_spec(spec)
spec.loader.exec_module(ci)


class EvidenciaPRTest(unittest.TestCase):
    repo = "equipo/truco"
    base = "a" * 40
    cabeza = "b" * 40
    merge = "c" * 40
    arbol = "d" * 40

    def setUp(self):
        origen = {"full_name": self.repo}
        self.pr = {"number": 12, "state": "open", "mergeable": True, "merge_commit_sha": self.merge,
                   "head": {"ref": "codex/issue-60", "sha": self.cabeza, "repo": origen},
                   "base": {"ref": "main", "sha": self.base, "repo": origen}}
        self.main = self.base
        self.commit = {"sha": self.merge, "parents": [{"sha": self.base}, {"sha": self.cabeza}],
                       "tree": {"sha": self.arbol}}
        self.run = {"id": 38, "run_number": 39, "run_attempt": 2, "repository": origen, "head_repository": origen,
                    "path": ci.WORKFLOW, "event": "pull_request", "pull_requests": [{"number": 12}],
                    "head_branch": self.pr["head"]["ref"], "head_sha": self.cabeza,
                    "status": "completed", "conclusion": "success", "html_url": "https://github.com/equipo/truco/actions/runs/38"}
        self.runs = [self.run]
        self.job = {"name": "check", "run_id": 38, "run_attempt": 2, "head_sha": self.cabeza,
                    "status": "completed", "conclusion": "success",
                    "steps": [{"name": nombre, "status": "completed", "conclusion": "success"}
                              for nombre in (*ci.ETAPAS, f"Revisión comprobada {self.merge}")]}

    def api(self, ruta):
        ruta = ruta.removeprefix(f"repos/{self.repo}/")
        if ruta == "pulls/12":
            return self.pr
        if ruta == "git/ref/heads/main":
            return {"object": {"sha": self.main}}
        if ruta == f"git/commits/{self.pr['merge_commit_sha']}":
            return self.commit
        if ruta.startswith("actions/workflows/check.yml/runs?"):
            return {"workflow_runs": self.runs, "total_count": len(self.runs)}
        if ruta == f"actions/runs/38/attempts/{self.run['run_attempt']}/jobs?per_page=100":
            return {"jobs": [self.job], "total_count": 1}
        raise AssertionError(ruta)

    def verificar(self):
        return ci.verificar(self.repo, 12, self.api)

    def test_devuelve_los_sha_y_el_enlace_del_mismo_intento_para_revision_e_integracion(self):
        recibo = self.verificar()
        self.assertEqual(recibo, self.verificar())
        for dato in (self.cabeza, self.base, self.merge, self.arbol, self.run["html_url"] + "/attempts/2"):
            self.assertIn(dato, recibo)

    def test_un_segundo_pr_no_descarta_ni_aporta_evidencia_del_primero(self):
        otro = dict(self.run, id=80, run_number=81, pull_requests=[{"number": 13}], status="in_progress", conclusion=None)
        self.runs.append(otro)
        self.assertIn(self.cabeza, self.verificar())
        self.runs = [dict(otro, status="completed", conclusion="success")]
        with self.assertRaises(ci.SinEvidencia):
            self.verificar()

    def test_commit_nuevo_no_hereda_el_verde_anterior_aunque_github_actualice_la_asociacion_con_el_pr(self):
        nueva = "e" * 40
        self.pr["head"]["sha"] = nueva
        self.commit["parents"][1]["sha"] = nueva
        self.run["pull_requests"][0]["head"] = {"sha": nueva}
        with self.assertRaises(ci.SinEvidencia):
            self.verificar()

    def test_el_movimiento_de_main_invalida_el_verde_incluso_con_el_mismo_head(self):
        self.main = "e" * 40
        with self.assertRaises(ci.SinEvidencia):
            self.verificar()
        self.pr["base"]["sha"] = self.main
        with self.assertRaises(ci.SinEvidencia):
            self.verificar()
        self.commit["parents"][0]["sha"] = self.main
        self.pr["merge_commit_sha"] = self.commit["sha"] = "f" * 40
        self.commit["tree"]["sha"] = "0" * 40
        with self.assertRaises(ci.SinEvidencia):
            self.verificar()

    def test_resultados_anteriores_no_cubren_un_intento_nuevo(self):
        for estado, conclusion in (("in_progress", None), ("queued", None), ("completed", "failure"),
                                    ("completed", "cancelled"), ("completed", "skipped")):
            with self.subTest(estado=estado, conclusion=conclusion):
                self.runs = [self.run, dict(self.run, id=44, run_number=45, status=estado, conclusion=conclusion)]
                with self.assertRaises(ci.SinEvidencia):
                    self.verificar()
        self.runs = [self.run]
        self.job["run_attempt"] -= 1
        with self.assertRaises(ci.SinEvidencia):
            self.verificar()

    def test_otro_workflow_un_fork_o_un_evento_de_push_no_acreditan_el_pr(self):
        for campo, valor in (("path", ".github/workflows/piloto.yml"), ("event", "push"),
                             ("head_repository", {"full_name": "externo/truco"})):
            with self.subTest(campo=campo):
                self.runs = [dict(self.run, **{campo: valor})]
                with self.assertRaises(ci.SinEvidencia):
                    self.verificar()
        self.pr["head"]["repo"] = {"full_name": "externo/truco"}
        with self.assertRaises(ci.SinEvidencia):
            self.verificar()

    def test_job_verde_parcial_o_de_otro_commit_no_alcanza(self):
        for step in self.job["steps"]:
            with self.subTest(etapa=step["name"]):
                step["conclusion"] = "skipped"
                with self.assertRaises(ci.SinEvidencia):
                    self.verificar()
                step["conclusion"] = "success"
        self.job["head_sha"] = self.base
        with self.assertRaises(ci.SinEvidencia):
            self.verificar()

    def test_relee_la_base_y_ultima_corrida_despues_de_comprobar_los_pasos(self):
        for caso in ("main", "corrida"):
            self.setUp()
            def cambio_tardio(ruta):
                datos = self.api(ruta)
                if "/jobs?" in ruta:
                    if caso == "main":
                        self.main = "f" * 40
                    else:
                        self.run["run_attempt"] += 1
                return datos
            with self.subTest(caso=caso), self.assertRaises(ci.SinEvidencia):
                ci.verificar(self.repo, 12, cambio_tardio)

    def test_caida_del_proveedor_se_informa_sin_aceptar_una_corrida(self):
        with patch.object(subprocess, "run", side_effect=subprocess.TimeoutExpired("gh", 25)):
            with self.assertRaisesRegex(ci.SinEvidencia, "consultar GitHub"):
                ci.verificar(self.repo, 12)
