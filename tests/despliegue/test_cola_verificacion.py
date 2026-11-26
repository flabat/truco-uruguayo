import json
import os
from pathlib import Path
import shutil
import signal
import subprocess
import sys
import tempfile
import time
import unittest


RAIZ = Path(__file__).resolve().parents[2]
COLA = RAIZ / "scripts/cola-pila.py"
TIEMPO = 20


class ColaVerificacionTest(unittest.TestCase):
    def setUp(self):
        temporal = tempfile.TemporaryDirectory()
        self.addCleanup(temporal.cleanup)
        self.raiz = Path(temporal.name)
        self.cola = self.raiz / "cola"
        self.entorno = {k: v for k, v in os.environ.items() if not k.startswith("TRUCO_COLA_")}
        self.entorno.update(TRUCO_COLA_DIR=str(self.cola), TRUCO_COLA_INTERVALO="0.02")
        self.procesos = []
        self.addCleanup(self.terminar)

    def terminar(self):
        # También permite que los señuelos salgan si falla una aserción.
        (self.raiz / "continuar").touch()
        for proceso in self.procesos:
            if proceso.poll() is None:
                proceso.terminate()
            try:
                proceso.wait(timeout=3)
            except subprocess.TimeoutExpired:
                proceso.kill()
                proceso.wait()

    def lanzar(self, directorio, comando, entorno=None):
        directorio.mkdir(exist_ok=True)
        proceso = subprocess.Popen(comando, cwd=directorio, env=entorno or self.entorno,
                                   stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
        self.procesos.append(proceso)
        return proceso

    def encolar(self, nombre, programa):
        return self.lanzar(self.raiz / nombre, [sys.executable, str(COLA), sys.executable, "-c", programa])

    def esperar(self, condicion, descripcion):
        limite = time.monotonic() + TIEMPO
        while not condicion():
            if time.monotonic() >= limite:
                self.fail(f"No ocurrió: {descripcion}")
            time.sleep(0.02)

    def esperar_turnos(self, cantidad):
        def contar_turnos():
            return len([p for p in (self.cola / "espera").glob("*") if not p.name.startswith(".")])
        self.esperar(lambda: contar_turnos() == cantidad, f"{cantidad} turnos publicados")

    def ocupar(self):
        proceso = self.encolar("en curso", """
from pathlib import Path
import time
Path("empezo").touch()
while not Path("../continuar").exists():
    time.sleep(0.02)
""")
        self.esperar((self.raiz / "en curso/empezo").exists, "el primer proceso empezó")
        return proceso

    def test_fifo_entre_worktrees_cancelacion_en_espera_y_salida(self):
        primero = self.ocupar()
        programa = """
from pathlib import Path
with open("../orden", "a") as orden:
    print(Path.cwd().name, file=orden)
"""
        segundo = self.encolar("segundo", programa + "\nraise SystemExit(37)")
        self.esperar_turnos(1)
        cancelado = self.encolar("cancelado", programa)
        self.esperar_turnos(2)
        ultimo = self.encolar("ultimo", programa)
        self.esperar_turnos(3)
        cancelado.terminate()
        self.assertEqual(cancelado.wait(TIEMPO), 128 + signal.SIGTERM)
        self.assertFalse((self.raiz / "orden").exists())
        (self.raiz / "continuar").touch()
        self.assertEqual(primero.wait(TIEMPO), 0)
        self.assertEqual(segundo.wait(TIEMPO), 37)
        self.assertEqual(ultimo.wait(TIEMPO), 0)
        self.assertEqual((self.raiz / "orden").read_text().splitlines(), ["segundo", "ultimo"])

    def test_cancelar_al_ejecutor_avisa_al_nieto_y_libera_el_puesto(self):
        nieto = self.raiz / "nieto.py"
        nieto.write_text("""
from pathlib import Path
import signal
import sys
import time
def terminar(*_):
    Path("nieto-terminado").touch()
    sys.exit(0)
signal.signal(signal.SIGTERM, terminar)
Path("nieto-listo").touch()
while not Path("../continuar").exists():
    time.sleep(0.02)
""")
        en_curso = self.encolar("activo", "import subprocess, sys; subprocess.run([sys.executable, '../nieto.py'])")
        self.esperar((self.raiz / "activo/nieto-listo").exists, "el nieto instaló su manejador")
        siguiente = self.encolar("siguiente", "pass")
        self.esperar_turnos(1)
        en_curso.terminate()
        self.assertEqual(en_curso.wait(TIEMPO), 128 + signal.SIGTERM)
        self.esperar((self.raiz / "activo/nieto-terminado").exists, "el nieto recibió SIGTERM")
        self.assertEqual(siguiente.wait(TIEMPO), 0)

    def test_comandos_publicos_comparten_cola_y_el_rapido_sigue_libre(self):
        # Ejecutamos las entradas declaradas en package.json. Cada etapa pesada deja una marca.
        proyecto = self.raiz / "proyecto"
        for ruta in ["scripts", ".github/scripts", "bin"]:
            (proyecto / ruta).mkdir(parents=True)
        for ruta in ["scripts/cola-pila.py", "scripts/trabajo-entorno.sh", ".github/scripts/check_site.sh"]:
            shutil.copy(RAIZ / ruta, proyecto / ruta)
        for nombre in ["stack", "produccion"]:
            (proyecto / f"scripts/verificar-{nombre}.sh").write_text(f"echo {nombre} >> etapas\n")
        binarios = proyecto / "bin"
        (binarios / "npm").write_text(
            '#!/bin/sh\necho "npm $*" >> etapas\n'
            'if [ "$*" = "run check:stack" ]; then exit 77; fi\n'
        )
        (binarios / "node").write_text('#!/bin/sh\necho "node $*" >> etapas\n')
        (binarios / "python3").write_text(
            '#!/bin/sh\ncase "$1" in *cola-pila.py) exec "$PYTHON_TEST" "$@";; esac\n'
            'echo "python3 $*" >> etapas\n'
        )
        for binario in binarios.iterdir():
            binario.chmod(0o755)
        entorno = {**self.entorno, "PATH": str(binarios) + os.pathsep + self.entorno["PATH"],
                   "PYTHON_TEST": sys.executable, "CHECK_STACK": "1"}
        comandos = json.loads((RAIZ / "package.json").read_text())["scripts"]
        def lanzar_script(nombre):
            return self.lanzar(proyecto, ["/bin/sh", "-c", "exec " + comandos[nombre]], entorno)

        en_curso = self.ocupar()
        pendientes = []
        for nombre in ["check", "check:stack", "check:production"]:
            pendientes.append(lanzar_script(nombre))
            self.esperar_turnos(len(pendientes))
        self.assertEqual(lanzar_script("check:rapido").wait(TIEMPO), 0)
        etapas = proyecto / "etapas"
        self.assertEqual(etapas.read_text().splitlines(), ["node scripts/check-rapido.mjs"])
        (self.raiz / "continuar").touch()
        for proceso in [en_curso, *pendientes]:
            self.assertEqual(proceso.wait(TIEMPO), 0)
        registro = etapas.read_text().splitlines()
        self.assertIn("npm run test:unit", registro)
        self.assertIn("npm exec -- playwright test", registro)
        self.assertEqual(registro[-3:], ["stack", "stack", "produccion"])
