#!/usr/bin/env python3
"""Corre un comando solo cuando hay un puesto libre en la cola de pilas de la máquina.

Uso: python3 scripts/cola-pila.py <comando> [argumentos...]

Varias sesiones (Claude Code, Codex, el runner de Actions) comparten la misma
computadora. Cada pila completa levanta PostgreSQL, Keycloak, la API y la web en
Docker; con más de dos a la vez la máquina se satura y las pruebas fallan por
tiempo. Esta cola limita las pilas simultáneas y atiende en orden de llegada.

- Puestos: archivos `puesto-<n>.lock` con `flock` exclusivo. El candado lo tiene
  este proceso, no el comando, así que se libera aunque el comando deje hijos.
- Espera: cada proceso en espera deja un turno `espera/<llegada>-<pid>` con su
  propio candado. Un turno sin candado es de un proceso que murió y se descarta.
- El comando recibe `TRUCO_COLA_PUESTO` (0, 1, ...) para elegir puertos propios.

Variables: `TRUCO_COLA_DIR` (por defecto `~/.cache/truco/cola-pila`),
`TRUCO_COLA_PILAS` (por defecto 2) y `TRUCO_COLA_INTERVALO` (segundos entre
consultas, por defecto 2).
"""

import fcntl
import os
import signal
import subprocess
import sys
import time
from pathlib import Path

DIRECTORIO = Path(os.environ.get("TRUCO_COLA_DIR") or Path.home() / ".cache/truco/cola-pila")
PILAS = max(1, int(os.environ.get("TRUCO_COLA_PILAS") or 2))
INTERVALO = float(os.environ.get("TRUCO_COLA_INTERVALO") or 2)


def avisar(texto):
    print(f"[cola de pilas] {texto}", file=sys.stderr, flush=True)


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
        huerfano = tomar(ruta)
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
                avisar(f"posición {posicion + 1} en la fila; {len(aviso[1])} de {PILAS} pilas corriendo: {corriendo}")
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
    hijo = subprocess.Popen(sys.argv[1:], env={**os.environ, "TRUCO_COLA_PUESTO": str(n)})
    for senal in (signal.SIGINT, signal.SIGTERM, signal.SIGHUP):
        signal.signal(senal, lambda s, _: hijo.send_signal(s))
    codigo = hijo.wait()
    puesto.close()
    return codigo if codigo >= 0 else 128 - codigo


if __name__ == "__main__":
    sys.exit(main())
