"""Mide una etapa de verificación o resume los JSON de TRUCO_MEDICIONES."""

from datetime import datetime, timezone
from html import escape
import json
import os
from pathlib import Path
import re
import signal
import subprocess
import sys
import time
from uuid import uuid4


INTERVALO = 3
PLAZO_CANCELACION = 8
RAIZ = Path(__file__).resolve().parents[2]


def memoria_linux(texto):
    kib = dict(re.findall(r"^(MemTotal|MemAvailable):\s+(\d+) kB$", texto, re.M))
    total = int(kib["MemTotal"]) * 1024
    return total, total - int(kib["MemAvailable"]) * 1024


def memoria_mac(texto):
    pagina = int(re.search(r"page size of (\d+) bytes", texto)[1])
    paginas = dict(re.findall(r"^(Pages active|Pages wired down|Pages occupied by compressor):\s+(\d+)\.", texto, re.M))
    return pagina * sum(int(paginas[clave]) for clave in ("Pages active", "Pages wired down", "Pages occupied by compressor"))


def leer_memoria():
    if sys.platform.startswith("linux"):
        return memoria_linux(Path("/proc/meminfo").read_text())
    if sys.platform == "darwin":
        texto = subprocess.check_output(["vm_stat"], text=True, stderr=subprocess.DEVNULL, timeout=2)
        return None, memoria_mac(texto)
    return None, None


def discos_locales():
    candidatos = [("checkout", Path.cwd())]
    docker = os.environ.get("TRUCO_DISCO_DOCKER", "/var/lib/docker")
    if docker:
        candidatos.append(("Docker", Path(docker)))
    discos = {}
    for nombre, ruta in candidatos:
        try:
            dispositivo = ruta.stat().st_dev
            os.statvfs(ruta)
        except OSError:
            continue
        if dispositivo not in discos:
            discos[dispositivo] = (ruta, {"ubicaciones": []})
        discos[dispositivo][1]["ubicaciones"].append(nombre)
    return list(discos.values())


def muestrear(datos, discos):
    ram = datos["memoria"]
    try:
        total, usada = leer_memoria()
    except (OSError, subprocess.SubprocessError, KeyError, TypeError, ValueError):
        total, usada = None, None
    if usada is not None:
        ram.setdefault("inicio_bytes", usada)
        ram.update(total_bytes=total, fin_bytes=usada, maximo_bytes=max(usada, ram.get("maximo_bytes", 0)))
    for ruta, disco in discos:
        try:
            fs = os.statvfs(ruta)
        except OSError:
            continue
        libre = fs.f_bavail * fs.f_frsize
        disco.setdefault("libre_inicio_bytes", libre)
        disco.update(total_bytes=fs.f_blocks * fs.f_frsize, libre_fin_bytes=libre,
                     libre_minimo_bytes=min(libre, disco.get("libre_minimo_bytes", libre)))


def guardar(ruta, datos):
    temporal = ruta.with_suffix(".tmp")
    temporal.write_text(json.dumps(datos, ensure_ascii=False) + "\n", encoding="utf-8")
    temporal.replace(ruta)


def enviar(hijo, senal):
    try:
        os.killpg(hijo.pid, senal)
    except ProcessLookupError:
        pass


def medir(carpeta, etapa, comando):
    carpeta.mkdir(parents=True, exist_ok=True)
    ahora = datetime.now(timezone.utc)
    ruta = carpeta / f"etapa-{ahora:%Y%m%dT%H%M%S%fZ}-{uuid4().hex}.json"
    discos = discos_locales()
    metodos = {"linux": "MemTotal - MemAvailable", "darwin": "páginas activas + cableadas + compresor"}
    datos = {"etapa": etapa, "inicio_utc": ahora.isoformat(), "estado": "en curso", "codigo": None,
             "duracion_s": 0, "memoria": {"metodo": metodos.get(sys.platform, "sin datos")},
             "discos": [disco for _, disco in discos]}
    muestrear(datos, discos)
    guardar(ruta, datos)
    hijo = None
    cancelacion = None

    def cancelar(senal, _marco):
        nonlocal cancelacion
        if cancelacion is None:
            cancelacion = (senal, time.monotonic())
        if hijo is not None:
            enviar(hijo, senal)

    anteriores = {s: signal.signal(s, cancelar) for s in (signal.SIGINT, signal.SIGTERM, signal.SIGHUP)}
    inicio = time.monotonic()
    try:
        try:
            hijo = subprocess.Popen(comando, start_new_session=True)
        except OSError as error:
            print(error, file=sys.stderr)
            codigo = 127 if isinstance(error, FileNotFoundError) else 126
        else:
            if cancelacion:
                enviar(hijo, cancelacion[0])
            while True:
                try:
                    codigo = hijo.wait(timeout=INTERVALO)
                    break
                except subprocess.TimeoutExpired:
                    if cancelacion and time.monotonic() - cancelacion[1] >= PLAZO_CANCELACION:
                        enviar(hijo, signal.SIGKILL)
                    muestrear(datos, discos)
                    datos["duracion_s"] = round(time.monotonic() - inicio, 3)
                    guardar(ruta, datos)
        if cancelacion:
            # Una shell puede salir mientras sus procesos hijos todavía limpian sus recursos.
            if hijo is not None:
                while time.monotonic() < cancelacion[1] + PLAZO_CANCELACION:
                    try:
                        os.killpg(hijo.pid, 0)
                    except ProcessLookupError:
                        break
                    time.sleep(0.05)
                else:
                    enviar(hijo, signal.SIGKILL)
            codigo = 128 + cancelacion[0]
        elif codigo < 0:
            codigo = 128 - codigo
        datos.update(estado="interrumpida" if cancelacion else ("correcta" if codigo == 0 else "fallida"),
                     codigo=codigo, duracion_s=round(time.monotonic() - inicio, 3))
        muestrear(datos, discos)
        guardar(ruta, datos)
        return codigo
    finally:
        if hijo is not None and hijo.poll() is None:
            enviar(hijo, signal.SIGKILL)
            hijo.wait()
        for s, anterior in anteriores.items():
            signal.signal(s, anterior)


def gib(valor):
    return "—" if valor is None else f"{valor / 2**30:.2f}"


def resumen(carpeta):
    print("| Etapa | Estado | Segundos | RAM máxima observada (GiB) | Disco libre inicio / mínimo / fin (GiB) |")
    print("|---|---|---:|---:|---|")
    metodos = set()
    for ruta in sorted(carpeta.glob("etapa-*.json")):
        datos = json.loads(ruta.read_text(encoding="utf-8"))
        ram = datos["memoria"]
        metodos.add(ram["metodo"])
        etapa = escape(" ".join(datos["etapa"].split())).replace("|", "&#124;")
        discos = []
        for d in datos["discos"]:
            cifras = " / ".join(gib(d.get(f"libre_{k}_bytes")) for k in ("inicio", "minimo", "fin"))
            discos.append(f"{'+'.join(d['ubicaciones'])} {cifras}")
        estado = datos["estado"] if datos["codigo"] is None else f"{datos['estado']} ({datos['codigo']})"
        print(f"| {etapa} | {estado} | {datos['duracion_s']:.1f} | {gib(ram.get('maximo_bytes'))} | {'<br>'.join(discos)} |")
    if metodos:
        print(f"\nRAM de la máquina medida como {', '.join(sorted(metodos))}. Muestreo cada {INTERVALO} s y en ambos extremos.")


def main(args):
    if args != ["--resumen"] and len(args) < 2:
        print("Uso: medir.py <etapa> <comando> [args...] | --resumen", file=sys.stderr)
        return 2
    destino = os.environ.get("TRUCO_MEDICIONES")
    if not destino:
        print("Definí TRUCO_MEDICIONES con una carpeta fuera del checkout.", file=sys.stderr)
        return 2
    carpeta = Path(destino).resolve()
    if carpeta == RAIZ or RAIZ in carpeta.parents:
        print("TRUCO_MEDICIONES debe quedar fuera del checkout.", file=sys.stderr)
        return 2
    if args == ["--resumen"]:
        resumen(carpeta)
        return 0
    return medir(carpeta, args[0], args[1:])


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
