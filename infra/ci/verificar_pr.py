"""Comprueba en GitHub la verificación vigente de un PR a main; solo hace lecturas."""

import argparse
import json
import re
import subprocess
import sys
from typing import NamedTuple
from urllib.parse import urlencode


WORKFLOW = ".github/workflows/check.yml"
ETAPAS = (
    "Registrar la revisión y el entorno",
    "Instalar dependencias",
    "Instalar Chromium",
    "Verificar sitio, app y pila",
    "Ensayar arranque, copias y restauración",
)


class SinEvidencia(Exception):
    pass


def exigir(condicion, motivo):
    if not condicion:
        raise SinEvidencia(motivo)


def gh(*argumentos):
    try:
        return subprocess.run(["gh", *argumentos], check=True, capture_output=True,
                              text=True, timeout=25).stdout
    except subprocess.CalledProcessError as error:
        raise SinEvidencia(f"GitHub no pudo responder: {error.stderr.strip()}") from error
    except (OSError, subprocess.TimeoutExpired) as error:
        raise SinEvidencia(f"No se pudo consultar GitHub: {error}") from error


def api(ruta):
    return json.loads(gh("api", ruta))


class Revision(NamedTuple):
    rama: str
    cabeza: str
    base: str
    integracion: str


def revision_actual(leer, repo, numero):
    pr = leer(f"pulls/{numero}")
    exigir(pr["number"] == numero and pr["state"] == "open", "El PR debe estar abierto.")
    exigir(pr["base"]["ref"] == "main" and pr["base"]["repo"]["full_name"].lower() == repo,
           "El PR debe apuntar a main en este repositorio.")
    origen = pr["head"].get("repo")
    exigir(origen and origen["full_name"].lower() == repo, "La rama del PR debe pertenecer al repositorio.")
    base = leer("git/ref/heads/main")["object"]["sha"]
    exigir(pr["base"]["sha"] == base, "GitHub todavía no refleja la punta actual de main en el PR.")
    integracion = pr.get("merge_commit_sha")
    exigir(pr.get("mergeable") is not False and integracion, "No hay una integración comprobable para este PR.")
    return Revision(pr["head"]["ref"], pr["head"]["sha"], base, integracion)


class Corrida(NamedTuple):
    id: int
    intento: int
    enlace: str


def ultima_corrida(leer, repo, numero, rev):
    # pull_requests[].head/base puede reflejar la rama de hoy incluso en una
    # corrida antigua. Solo usamos el número de PR de esa lista.
    pagina = 1
    while True:
        parametros = urlencode(dict(event="pull_request", branch=rev.rama, head_sha=rev.cabeza,
                                    per_page=100, page=pagina))
        datos = leer(f"actions/workflows/check.yml/runs?{parametros}")
        for run in sorted(datos["workflow_runs"], key=lambda r: r["run_number"], reverse=True):
            asociados = [pr["number"] for pr in run["pull_requests"]]
            exigir(asociados, "Hay una corrida para esta rama y SHA cuya asociación con el PR aún no se conoce.")
            if numero not in asociados:
                continue
            exigir(run["path"] == WORKFLOW and run["event"] == "pull_request"
                   and run["repository"]["full_name"].lower() == repo
                   and run["head_repository"]["full_name"].lower() == repo
                   and run["head_branch"] == rev.rama and run["head_sha"] == rev.cabeza,
                   "La corrida no corresponde al workflow, repositorio y revisión esperados.")
            exigir(run["status"] == "completed" and run["conclusion"] == "success",
                   f"La corrida vigente está {run['status']} ({run.get('conclusion') or 'sin resultado'}): {run['html_url']}")
            return Corrida(run["id"], run["run_attempt"], run["html_url"])
        if pagina * 100 >= min(datos["total_count"], 1000):
            raise SinEvidencia("No se encontró una corrida de check.yml para la última revisión de este PR.")
        pagina += 1


def verificar(repo, numero, consultar=api):
    repo = repo.lower()

    def leer(ruta):
        return consultar(f"repos/{repo}/{ruta}")

    rev = revision_actual(leer, repo, numero)
    commit = leer(f"git/commits/{rev.integracion}")
    exigir(commit["sha"] == rev.integracion and [p["sha"] for p in commit["parents"]] == [rev.base, rev.cabeza],
           "La integración del PR no tiene como padres la punta de main y la última revisión.")
    corrida = ultima_corrida(leer, repo, numero, rev)
    ruta = f"actions/runs/{corrida.id}/attempts/{corrida.intento}/jobs?per_page=100"
    trabajos = leer(ruta)
    checks = [job for job in trabajos["jobs"] if job["name"] == "check"]
    exigir(trabajos["total_count"] == len(trabajos["jobs"]) and len(checks) == 1,
           "El intento debe tener un único job check identificable.")
    job = checks[0]
    exigir(job["run_id"] == corrida.id and job["run_attempt"] == corrida.intento and job["head_sha"] == rev.cabeza
           and job["status"] == "completed" and job["conclusion"] == "success",
           "El job check del último intento no terminó con éxito sobre la revisión vigente.")
    etapas = {step["name"] for step in job["steps"]
              if step["status"] == "completed" and step["conclusion"] == "success"}
    for etapa in (*ETAPAS, f"Revisión comprobada {rev.integracion}"):
        exigir(etapa in etapas, f"Falta la etapa completa «{etapa}» para acreditar esta integración.")

    # Mientras leíamos los pasos pudo llegar otra revisión, avanzar main o
    # iniciarse un reintento. No publicar la evidencia de la lectura anterior.
    exigir(corrida == ultima_corrida(leer, repo, numero, rev), "Cambió la corrida durante la consulta.")
    exigir(rev == revision_actual(leer, repo, numero), "Cambió el PR o su base durante la consulta.")
    return (f"PR #{numero} · {corrida.enlace}/attempts/{corrida.intento}\n"
            f"Cabeza: {rev.cabeza}\nBase main: {rev.base}\n"
            f"Commit probado: {rev.integracion}\nÁrbol probado: {commit['tree']['sha']}")


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("pr", type=int, help="número de PR")
    parser.add_argument("--repo", help="dueño/repositorio (por defecto, el del checkout)")
    args = parser.parse_args()
    if args.pr < 1:
        parser.error("El número de PR debe ser positivo.")
    try:
        repo = args.repo or gh("repo", "view", "--json", "nameWithOwner", "--jq", ".nameWithOwner").strip()
        exigir(re.fullmatch(r"[\w.-]+/[\w.-]+", repo) and all(p not in (".", "..") for p in repo.split("/")),
               "Indicá un repositorio con el formato dueño/repositorio.")
        print(verificar(repo, args.pr))
    except (SinEvidencia, KeyError, TypeError, ValueError) as error:
        print(f"Sin evidencia vigente: {error}", file=sys.stderr)
        return 1
    return 0


if __name__ == "__main__":
    sys.exit(main())
