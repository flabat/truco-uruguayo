from contextlib import redirect_stdout
from io import StringIO
import unittest
from unittest.mock import Mock, patch

from infra.ci import muestra_437 as m


FECHA = "2026-11-26T07:00:00Z"
FIN = "2026-11-26T07:01:02Z"
BASE, CABEZA, MERGE, SQUASH = (c * 40 for c in "abcd")


def pr(n=456):
    return dict(number=n, created_at=FECHA, closed_at=FIN, state="closed", merged_at=FIN,
                merge_commit_sha=SQUASH, head={"ref": "rama", "repo": {"full_name": "a/b"}})


def corrida(rid, evento, intento=1):
    return dict(id=rid, event=evento, head_sha=CABEZA if evento == "pull_request" else SQUASH,
                head_branch="rama" if evento == "pull_request" else "main", head_repository={"full_name": "a/b"},
                pull_requests=[{"number": 456, "base": {"sha": "0" * 40}}],
                created_at=FECHA, run_started_at=FECHA, status="completed", conclusion="success",
                run_attempt=intento)


def job(jid, estado="success", pasos=()):
    return dict(id=jid, runner_name="runner", started_at="2026-11-26T07:00:01Z", completed_at=FIN,
                labels=["ubuntu-24.04"], conclusion=estado, steps=list(pasos))


class Muestra437(unittest.TestCase):
    def test_muestra_selecciona_primeros_diez_despues_del_corte_incluso_borradores(self):
        g = Mock()
        g.paginas.return_value = [[{**pr(n), "draft": n == 454} for n in range(467, 452, -1)]]
        vecinos = m.seleccionar(g)
        self.assertEqual([p["number"] for p in vecinos], list(range(454, 464)))
        self.assertTrue(vecinos[0]["draft"])

    def test_corridas_se_asocian_por_pr_o_commit_nunca_solo_por_rama(self):
        g = Mock()
        uno = corrida(11, "pull_request")
        otro = {**uno, "id": 10, "pull_requests": [{"number": 455}]}
        sin_pr = {**uno, "id": 12, "pull_requests": []}
        candidato = {**sin_pr, "id": 14, "head_sha": BASE}
        principal = corrida(13, "push")
        g.lista.side_effect = [[uno, otro, sin_pr, candidato, uno], [{"number": 456}], [],
                               [principal, {**principal, "id": 14, "head_sha": BASE}]]
        corridas, inciertas = m.asociar(g, pr())
        self.assertEqual([r["id"] for r in corridas], [11, 12, 13])
        self.assertEqual(inciertas, [14])

    def test_falla_previa_reintento_y_squash_suman_tres_redondeos(self):
        g = Mock(repo="a/b")
        r, principal = corrida(113, "pull_request", 2), corrida(115, "push")
        g.api.side_effect = [{**r, "conclusion": "failure", "run_attempt": 1},
                             {"parents": [{"sha": BASE}, {"sha": CABEZA}]}]
        g.lista.side_effect = [
            [job(940, "failure")],
            [job(941, pasos=[{"name": "Revisión comprobada " + MERGE, "conclusion": "success"}])],
            [job(942)],
        ]
        cache = {}
        with patch.object(m, "asociar", return_value=([r, principal], [])):
            body, completa = m.render(g, [pr()], cache)
            self.assertEqual((body, completa), m.render(g, [pr()], cache))
        self.assertIn("6 minutos redondeados, USD 0.036", body)
        self.assertIn("113.1", body)
        self.assertIn("failure", body)
        self.assertIn("PR 113.2", body)
        self.assertIn("main 115.1", body)
        self.assertIn(BASE[:12], body)
        self.assertIn(MERGE, body)
        self.assertEqual(g.lista.call_count, 3)

    def test_cancelado_sin_runner_cuesta_cero_y_activo_o_dato_ausente_queda_parcial(self):
        self.assertEqual(m.medir_job({"id": 33, "conclusion": "cancelled"}, FECHA), [33, None, 0, 0])
        self.assertIsNone(m.medir_job({"id": 34, "conclusion": None}, FECHA)[-1])
        self.assertIsNone(m.medir_job({**job(35), "labels": ["macos-latest"]}, FECHA)[-1])
        g = Mock(repo="a/b")
        g.paginas.return_value = [[]]
        with patch.object(m, "asociar", return_value=([], [])):
            body, _ = m.render(g, [pr()], {})
        self.assertIn("sin corrida del squash", body)
        self.assertIn("(parcial)", body)

    def test_marcador_temprano_necesita_los_padres_exactos(self):
        g = Mock()
        r = corrida(31, "pull_request")
        g.lista.return_value = [job(972, pasos=[{"name": "Revisión recibida " + MERGE, "conclusion": "success"}])]
        g.api.return_value = {"parents": [{"sha": BASE}, {"sha": SQUASH}]}
        info = m.intento(g, r, 1, {})
        self.assertIsNone(info["probado"])
        self.assertIsNone(info["base"])
        g.api.return_value = {"parents": [{"sha": BASE}, {"sha": CABEZA}]}
        self.assertEqual(m.intento(g, r, 1, {})["base"], BASE)

    def test_muchos_intentos_conservan_todos_los_costos_y_links(self):
        g = Mock(repo="a/b")
        g.paginas.return_value = [[]]
        datos = {"estado": "success", "probado": MERGE, "base": BASE, "jobs": [[1, 1, 61, 2]]}
        r = corrida(100, "pull_request", 100)
        cache = {f"100/{n}": datos for n in range(1, 101)}
        with patch.object(m, "asociar", return_value=([r], [])):
            body, _ = m.render(g, [pr()], cache, limite=3000)
        self.assertLessEqual(len(body), 3000)
        self.assertIn("200 minutos redondeados", body)
        self.assertIn("supera la capacidad", body)
        self.assertIn("pull/456/checks", body)

    def test_recolector_se_detiene_solo_con_diez_pr_cerrados_y_reconciliados(self):
        g = Mock(repo="a/b")
        g.paginas.return_value = [[]]
        prs = [{**pr(n), "merged_at": None} for n in range(454, 464)]
        with patch.object(m, "asociar", return_value=([], [])):
            self.assertFalse(m.render(g, prs[:9], {})[1])
            self.assertTrue(m.render(g, prs, {})[1])
            prs[-1]["state"] = "open"
            self.assertFalse(m.render(g, prs, {})[1])
            prs[-1] = pr(463)
            self.assertFalse(m.render(g, prs, {})[1])

    def test_squash_fallido_espera_reintento_o_ultimo_respaldo_exacto(self):
        g = Mock(repo="a/b")
        prs = [{**pr(n), "merged_at": None} for n in range(454, 463)] + [pr(463)]
        principal = {**corrida(135, "push"), "conclusion": "cancelled"}
        cache = {"135/1": {"estado": "cancelled", "probado": SQUASH, "base": None, "jobs": [[33, 2, 1, 1]]}}
        def asociar(_, p):
            return ([principal] if p["merged_at"] else [], [])
        with patch.object(m, "asociar", side_effect=asociar):
            ok = {"context": "verificado-local", "state": "success", "creator": {"login": "a"}}
            g.paginas.return_value = [[{**ok, "state": "failure"}, ok]]
            self.assertFalse(m.render(g, prs, cache)[1])
            g.paginas.return_value = [[{**ok, "creator": {"login": "tercero"}}, ok]]
            self.assertFalse(m.render(g, prs, cache)[1])
            g.paginas.return_value = [[ok]]
            body, completa = m.render(g, prs, cache)
            self.assertTrue(completa)
            self.assertIn("cancelled · verificado-local (mantenedor)", body)
            self.assertIn("USD 0.006 (parcial)", body)
            g.paginas.assert_called_with(f"commits/{SQUASH}/statuses")

    def test_no_reemplaza_comentario_humano_y_repetir_es_idempotente(self):
        g = Mock(repo="a/b")
        h = {"id": 12, "user": {"login": "persona"}, "body": m.MARCA + "\ntexto"}
        g.paginas.return_value = [[]]
        g.lista.return_value = [h]
        g.api.return_value = {"html_url": "url"}
        with patch.dict("os.environ", {"GITHUB_ACTIONS": "true"}), redirect_stdout(StringIO()):
            m.actualizar(g, True)
            args = g.api.call_args.args
            self.assertEqual(args[:2], ("issues/437/comments", "POST"))
            g.lista.return_value = [h, {"id": 100, "user": {"login": m.BOT}, "body": args[2]["body"]}]
            m.actualizar(g, True)
        self.assertEqual(g.api.call_count, 1)


if __name__ == "__main__":
    unittest.main()
