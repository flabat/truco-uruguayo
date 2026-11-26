#!/usr/bin/env python3
"""Encola verificaciones pesadas de todos los worktrees de la máquina.

Uso: python3 scripts/cola-pila.py <comando> [argumentos...]

El turno cubre desde la primera prueba hasta el cierre de la pila. Cada
proceso en espera publica un archivo bloqueado en orden de llegada. La
verificación recibe TRUCO_COLA_PUESTO para elegir sus puertos. Los comandos
de desarrollo y las comprobaciones dirigidas se pueden usar mientras tanto.

TRUCO_COLA_DIR cambia el directorio compartido (~/.cache/truco/cola-verificacion).
TRUCO_COLA_PILAS cambia la cantidad de puestos (1 por defecto).
TRUCO_COLA_INTERVALO cambia los segundos entre consultas (2 por defecto).
"""

import fcntl
import os
import signal
import subprocess
import sys
import time
from pathlib import Path

DIRECTORIO = Path(os.environ.get("TRUCO_COLA_DIR") or Path.home() / ".cache/truco/cola-verificacion")
PILAS = max(1, int(os.environ.get("TRUCO_COLA_PILAS") or 1))
INTERVALO = float(os.environ.get("TRUCO_COLA_INTERVALO") or 2)


def avisar(texto):
    print(f"[cola de verificación] {texto}", file=sys.stderr, flush=True)


def tomar(ruta, modo="a+"):
    """Abre `ruta` y toma su candado sin esperar. Devuelve el archivo o None."""
    archivo = open(ruta, modo)
    try:
        fcntl.flock(archivo, fcntl.LOCK_EX | fcntl.LOCK_NB)
        return archivo
    except BlockingIOError:
        archivo.close()
        return None


def sacar_turno(espera):
    # El turno se bloquea con un nombre temporal y recién después aparece en la
    # fila: nadie puede confundirlo con el de un proceso muerto.
    llegada = f"{time.time_ns():020d}-{os.getpid()}"
    temporal = espera / f".{llegada}"
    turno = tomar(temporal, "w")
    turno.write(descripcion())
    turno.flush()
    temporal.rename(espera / llegada)
    return llegada, turno


def turnos_vivos(espera):
    vivos = []
    for ruta in sorted(espera.iterdir()):
        if ruta.name.startswith("."):
            continue
        try:
            huerfano = tomar(ruta, "r")
        except FileNotFoundError:
            continue  # Otro proceso ya retiró ese turno.
        if huerfano:
            ruta.unlink(missing_ok=True)
            huerfano.close()
        else:
            vivos.append(ruta.name)
    return vivos


def descripcion():
    return f"{Path.cwd().name} (pid {os.getpid()}, desde {time.strftime('%H:%M:%S')})\n"


def ocupantes():
    textos = []
    for n in range(PILAS):
        ruta = DIRECTORIO / f"puesto-{n}.lock"
        try:
            texto = ruta.read_text().strip()
        except FileNotFoundError:
            continue
        libre = tomar(ruta)
        if libre:
            libre.close()
        elif texto:
            textos.append(texto)
    return textos


def puestos_libres():
    libres = 0
    for n in range(PILAS):
        puesto = tomar(DIRECTORIO / f"puesto-{n}.lock")
        if puesto:
            libres += 1
            puesto.close()
    return libres


def esperar_puesto():
    espera = DIRECTORIO / "espera"
    espera.mkdir(parents=True, exist_ok=True)
    llegada, turno = sacar_turno(espera)
    ultimo_aviso = None
    try:
        while True:
            vivos = turnos_vivos(espera)
            posicion = vivos.index(llegada) if llegada in vivos else 0
            # Solo prueban los primeros de la fila, tantos como puestos libres:
            # así nadie se adelanta a quien llegó antes.
            if posicion < puestos_libres():
                for n in range(PILAS):
                    puesto = tomar(DIRECTORIO / f"puesto-{n}.lock")
                    if puesto:
                        puesto.seek(0)
                        puesto.truncate()
                        puesto.write(descripcion())
                        puesto.flush()
                        return n, puesto
            aviso = (posicion, tuple(ocupantes()))
            if aviso != ultimo_aviso:
                corriendo = "; ".join(aviso[1]) or "ninguna"
                avisar(f"posición {posicion + 1} en la fila; {len(aviso[1])} de {PILAS} verificaciones corriendo: {corriendo}")
                ultimo_aviso = aviso
            time.sleep(INTERVALO)
    finally:
        (espera / llegada).unlink(missing_ok=True)
        turno.close()


def main():
    if len(sys.argv) < 2:
        print(__doc__, file=sys.stderr)
        return 2
    # Una interrupción mientras espera sale limpia; el `finally` borra el turno.
    signal.signal(signal.SIGTERM, lambda *_: sys.exit(143))
    signal.signal(signal.SIGHUP, lambda *_: sys.exit(129))
    inicio = time.monotonic()
    try:
        n, puesto = esperar_puesto()
    except KeyboardInterrupt:
        return 130
    espera = round(time.monotonic() - inicio)
    avisar(f"puesto {n} de {PILAS} tomado" + (f" tras {espera} s de espera" if espera >= 1 else ""))
    with puesto:
        return ejecutar(sys.argv[1:], n, puesto)


def ejecutar(comando, n, puesto):
    # npm, el navegador y los scripts de Docker deben recibir la cancelación.
    # El hijo hereda el candado para que, si muere el coordinador, no se
    # adelante el siguiente checkout mientras siga corriendo el comando.
    cancelacion = None
    hijo = None

    def reenviar(senal, _):
        nonlocal cancelacion
        if cancelacion is None:
            cancelacion = (senal, time.monotonic())
        if hijo is not None:
            try:
                os.killpg(hijo.pid, senal)
            except ProcessLookupError:
                pass

    for senal in (signal.SIGINT, signal.SIGTERM, signal.SIGHUP):
        signal.signal(senal, reenviar)
    try:
        hijo = subprocess.Popen(
            comando, env={**os.environ, "TRUCO_COLA_PUESTO": str(n)},
            start_new_session=True, pass_fds=(puesto.fileno(),),
        )
    except FileNotFoundError as error:
        avisar(str(error))
        return 127
    if cancelacion:
        reenviar(cancelacion[0], None)
    while True:
        try:
            codigo = hijo.wait(timeout=0.5)
            if not cancelacion:
                return codigo if codigo >= 0 else 128 - codigo
            # El proceso principal puede terminar antes que sus workers.
            try:
                os.killpg(hijo.pid, 0)
            except ProcessLookupError:
                break
            time.sleep(0.1)
        except subprocess.TimeoutExpired:
            pass
        if cancelacion and time.monotonic() - cancelacion[1] >= 30:
            reenviar(signal.SIGKILL, None)
            hijo.wait()
            break
    return 128 + cancelacion[0]


if __name__ == "__main__":
    sys.exit(main())
