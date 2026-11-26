"""Muestrea el disco del runner hasta recibir el archivo fin en la carpeta de salida."""

import argparse
import json
import os
from pathlib import Path
import shutil
import subprocess
import time


def dispositivos():
    docker = os.environ.get("TRUCO_DISCO_DOCKER") or subprocess.check_output(
        ["docker", "info", "--format", "{{.DockerRootDir}}"], text=True, timeout=15
    ).strip()
    if not Path(docker).is_absolute():
        raise ValueError("Docker debe informar una ruta absoluta en el host")
    rutas = [("raíz", Path("/")), ("checkout", Path.cwd()), ("Docker", Path(docker))]
    discos = {}
    for nombre, ruta in rutas:
        dispositivo = ruta.stat().st_dev
        if dispositivo not in discos:
            discos[dispositivo] = (ruta, {"ubicaciones": []})
        discos[dispositivo][1]["ubicaciones"].append(nombre)
    return list(discos.values())


def medir(carpeta):
    carpeta.mkdir(parents=True, exist_ok=True)
    discos = dispositivos()
    datos = {"intervalo_s": 1, "muestras": 0, "discos": [info for _, info in discos]}
    temporal = carpeta / "disco.tmp"
    while True:
        terminar = (carpeta / "fin").exists()
        for ruta, info in discos:
            uso = shutil.disk_usage(ruta)
            info.setdefault("libre_inicio_bytes", uso.free)
            info["total_bytes"] = uso.total
            info["libre_minimo_bytes"] = min(info.get("libre_minimo_bytes", uso.free), uso.free)
            info["libre_fin_bytes"] = uso.free
        datos["muestras"] += 1
        temporal.write_text(json.dumps(datos, ensure_ascii=False) + "\n", encoding="utf-8")
        temporal.replace(carpeta / "disco.json")
        if terminar:
            (carpeta / "listo").touch()
            return
        time.sleep(datos["intervalo_s"])


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("carpeta", type=Path)
    medir(parser.parse_args().carpeta)
