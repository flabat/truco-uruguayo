import os
from pathlib import Path
import subprocess
import tempfile
import unittest


RAIZ = Path(__file__).resolve().parents[2]


class LimpiezaVerificacionTest(unittest.TestCase):
    def ensayar(self, script, fallas):
        with tempfile.TemporaryDirectory() as directorio:
            base = Path(directorio)
            temporales = base / "temporales"
            temporales.mkdir()
            llamadas = base / "llamadas"
            docker = base / "docker"
            docker.write_text('#!/bin/sh\necho "$*" >> "$LLAMADAS"\n' + fallas)
            docker.chmod(0o755)
            node = base / "node"
            node.write_text('#!/bin/sh\nif [ "$1" = -e ]; then cat >/dev/null; fi\n')
            node.chmod(0o755)
            entorno = {**os.environ, "PATH": str(base) + os.pathsep + os.environ["PATH"],
                       "LLAMADAS": str(llamadas), "TMPDIR": str(temporales)}
            resultado = subprocess.run(["bash", str(RAIZ / "scripts" / script)], env=entorno,
                                       capture_output=True, text=True, timeout=20)
            self.assertEqual(list(temporales.iterdir()), [])
            return resultado.returncode, llamadas.read_text().splitlines()

    def test_pila_se_desarma_si_fallan_el_arranque_y_sus_logs(self):
        codigo, llamadas = self.ensayar("verificar-stack.sh", """
case " $* " in
    *" up "*) exit 33;;
    *" logs "*) exit 34;;
    *" down "*) exit 35;;
esac
""")
        self.assertEqual(codigo, 33)
        self.assertTrue(any(" down --volumes --rmi local" in linea for linea in llamadas))

    def test_ensayo_elimina_su_red_si_se_interrumpe_la_creacion_del_almacen(self):
        codigo, llamadas = self.ensayar("verificar-produccion.sh", """
case "$1 $2" in
    "network create") echo id-de-la-red-del-ensayo;;
    "run -d") kill -TERM "$PPID"; exit 143;;
    "rm -fv") exit 1;;
esac
""")
        self.assertNotEqual(codigo, 0)
        self.assertTrue(any(" down -v --remove-orphans --rmi local" in linea for linea in llamadas))
        self.assertIn("network rm id-de-la-red-del-ensayo", llamadas)
