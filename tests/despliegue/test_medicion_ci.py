import importlib.util
import json
import os
from pathlib import Path
import signal
import subprocess
import sys
import tempfile
import time
from types import SimpleNamespace
import unittest
from unittest.mock import patch


RAIZ = Path(__file__).resolve().parents[2]
MEDIDOR = RAIZ / "infra/ci/medir.py"
spec = importlib.util.spec_from_file_location("medir", MEDIDOR)
medir = importlib.util.module_from_spec(spec)
spec.loader.exec_module(medir)


class MedicionCITest(unittest.TestCase):
    def setUp(self):
        temp = tempfile.TemporaryDirectory()
        self.addCleanup(temp.cleanup)
        self.carpeta = Path(temp.name)
        self.salida = self.carpeta / "mediciones"
        self.env = {**os.environ, "TRUCO_MEDICIONES": str(self.salida), "TRUCO_DISCO_DOCKER": str(self.carpeta)}

    def ejecutar(self, *args):
        return subprocess.run([sys.executable, str(MEDIDOR), *args], cwd=self.carpeta, env=self.env,
                              capture_output=True, text=True, timeout=15)

    def resultados(self):
        return [json.loads(r.read_text()) for r in sorted(self.salida.glob("etapa-*.json"))]

    def test_linux_y_mac_miden_memoria_con_unidades_explicitas(self):
        self.assertEqual(medir.memoria_linux("MemTotal:  8000 kB\nMemAvailable:  3000 kB\n"),
                         (8000 * 1024, 5000 * 1024))
        texto = ("Mach Virtual Memory Statistics: (page size of 16384 bytes)\nPages active: 100.\n"
                 "Pages wired down: 20.\nPages occupied by compressor: 30.\nPages free: 5.\n")
        self.assertEqual(medir.memoria_mac(texto), 150 * 16384)

    def test_conserva_el_pico_aunque_el_uso_baje_antes_de_terminar(self):
        datos = {"memoria": {}}
        disco = {}
        fs = [SimpleNamespace(f_blocks=15, f_bavail=n, f_frsize=1024) for n in (10, 5, 8)]
        with patch.object(medir, "leer_memoria", side_effect=[(10, 4), (10, 8), (10, 6)]), \
                patch.object(medir.os, "statvfs", side_effect=fs):
            for _ in fs:
                medir.muestrear(datos, [(".", disco)])
        self.assertEqual([datos["memoria"][k + "_bytes"] for k in ("inicio", "maximo", "fin")], [4, 8, 6])
        self.assertEqual([disco[f"libre_{k}_bytes"] for k in ("inicio", "minimo", "fin")], [10240, 5120, 8192])

    def test_guarda_etapas_repetidas_conserva_cwd_y_estado_y_resume(self):
        etapa = "Preparación | API"
        for codigo in (0, 7):
            r = self.ejecutar(etapa, sys.executable, "-c", f"from pathlib import Path; print(Path.cwd()); exit({codigo})")
            self.assertEqual(r.returncode, codigo, r.stderr)
            self.assertEqual(Path(r.stdout.strip()).resolve(), self.carpeta.resolve())
        primero, segundo = self.resultados()
        self.assertEqual((primero["estado"], segundo["estado"], segundo["codigo"]), ("correcta", "fallida", 7))
        self.assertGreaterEqual(primero["duracion_s"], 0)
        self.assertEqual(primero["discos"][0]["ubicaciones"], ["checkout", "Docker"])
        self.assertEqual(len(primero["discos"]), 1)
        self.assertGreater(primero["discos"][0]["libre_inicio_bytes"], 0)
        resumen = self.ejecutar("--resumen")
        self.assertEqual(resumen.returncode, 0)
        self.assertIn("Preparación &#124; API", resumen.stdout)
        self.assertIn("fallida (7)", resumen.stdout)

    def test_cancelar_reenvia_la_senal_y_cierra_la_medicion(self):
        programa = """from pathlib import Path
import signal
import time
def cancelar(*_):
    Path("recibido").touch()
    raise SystemExit(0)
signal.signal(signal.SIGTERM, cancelar)
Path("listo").touch()
while True:
    time.sleep(1)
"""
        p = subprocess.Popen([sys.executable, str(MEDIDOR), "cancelar", sys.executable, "-c", programa],
                             cwd=self.carpeta, env=self.env)
        try:
            limite = time.monotonic() + 10
            while not (self.carpeta / "listo").exists():
                if p.poll() is not None or time.monotonic() >= limite:
                    self.fail("La etapa no llegó al punto de cancelación")
                time.sleep(0.02)
            self.assertEqual(self.resultados()[0]["estado"], "en curso")
            p.terminate()
            self.assertEqual(p.wait(timeout=10), 128 + signal.SIGTERM)
            self.assertTrue((self.carpeta / "recibido").exists())
            self.assertEqual(self.resultados()[0]["estado"], "interrumpida")
        finally:
            if p.poll() is None:
                p.kill()
                p.wait()
