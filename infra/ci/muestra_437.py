"""Reconciliar la muestra de #437 con los metadatos de GitHub Actions."""

import argparse
from datetime import datetime
from decimal import Decimal
import json
import math
import os
from pathlib import Path
import re
import subprocess
from urllib.parse import urlencode


CORTE = 453
CANTIDAD = 10
TARIFA = Decimal("0.006")
MARCA = "<!-- muestra-ci-437-v1 -->"
MEMORIA = "<!-- intentos-437-v1\n"
BOT = "github-actions[bot]"
CHECK = "actions/workflows/check.yml/runs"
SHA = r"[0-9a-f]{40}"


class Github:
    def __init__(self, repo):
        self.repo = repo

    def api(self, ruta, metodo="GET", datos=None, permitir_404=False):
        args = ["gh", "api", "--method", metodo, f"repos/{self.repo}/{ruta}"]
        entrada = None
        if datos is not None:
            args.extend(["--input", "-"])
            entrada = json.dumps(datos)
        respuesta = subprocess.run(args, input=entrada, text=True, capture_output=True)
        if permitir_404 and respuesta.returncode and "HTTP 404" in respuesta.stderr:
            return None
        if respuesta.returncode:
            raise RuntimeError(respuesta.stderr.strip())
        return json.loads(respuesta.stdout)

    def paginas(self, ruta, clave=None, **filtros):
        pagina = 1
        while True:
            params = urlencode({**filtros, "per_page": 100, "page": pagina})
            datos = self.api(f"{ruta}?{params}")
            if clave == "workflow_runs" and datos["total_count"] > 1000:
                raise ValueError("La ventana de consulta supera el límite de 1000 corridas de GitHub")
            filas = datos[clave] if clave else datos
            yield filas
            if len(filas) < 100:
                break
            pagina += 1

    def lista(self, ruta, clave=None, **filtros):
        return [fila for pagina in self.paginas(ruta, clave, **filtros) for fila in pagina]


def seleccionar(gh):
    nuevas = []
    for pagina in gh.paginas("pulls", state="all", base="main", sort="created", direction="desc"):
        nuevas.extend(p for p in pagina if p["number"] > CORTE)
        if any(p["number"] <= CORTE for p in pagina):
            break
    return sorted(nuevas, key=lambda p: (p["created_at"], p["number"]))[:CANTIDAD]


def segundos(inicio, fin):
    def utc(valor):
        return datetime.fromisoformat(valor.replace("Z", "+00:00"))
    return max(0, int((utc(fin) - utc(inicio)).total_seconds()))


def asociar(gh, pr):
    """Usar la asociación de GitHub. La rama sola puede reutilizarse en otro PR."""
    intervalo = (pr["created_at"] + ".." + pr["closed_at"] if pr.get("closed_at")
                 else ">=" + pr["created_at"])
    candidatos = gh.lista(CHECK, "workflow_runs", event="pull_request", branch=pr["head"]["ref"],
                          created=intervalo)
    corridas, dudosas = {}, []
    for run in candidatos:
        numeros = {p["number"] for p in run["pull_requests"]}
        if pr["number"] in numeros:
            corridas[run["id"]] = run
        elif not numeros and (run.get("head_repository") or {}).get("full_name") == (
                pr["head"].get("repo") or {}).get("full_name"):
            # Algunos eventos de forks no traen pull_requests. Comprobar el commit en GitHub.
            relacionadas = gh.lista(f"commits/{run['head_sha']}/pulls")
            if any(p["number"] == pr["number"] for p in relacionadas):
                corridas[run["id"]] = run
            else:
                dudosas.append(run["id"])
    if pr.get("merged_at"):
        sha = pr["merge_commit_sha"]
        for run in gh.lista(CHECK, "workflow_runs", event="push", branch="main", head_sha=sha):
            if run["head_sha"] == sha and run["head_branch"] == "main" and run["event"] == "push":
                corridas[run["id"]] = run
    return sorted(corridas.values(), key=lambda x: (x["created_at"], x["id"])), sorted(set(dudosas))


def medir_job(job, inicio):
    if job.get("runner_name") and job.get("started_at") and job.get("completed_at"):
        duracion = segundos(job["started_at"], job["completed_at"])
        estandar = any(e in ("ubuntu-latest", "ubuntu-24.04", "ubuntu-22.04") for e in job["labels"])
        minutos = math.ceil(duracion / 60) if estandar else None
        return [job["id"], segundos(inicio, job["started_at"]), duracion, minutos]
    if not job.get("runner_name") and job.get("conclusion") in ("cancelled", "skipped"):
        return [job["id"], None, 0, 0]
    return [job["id"], None, None, None]


def intento(gh, run, numero, cache):
    rid = run["id"]
    llave = f"{rid}/{numero}"
    if llave in cache:
        return cache[llave]
    ruta = f"actions/runs/{rid}/attempts/{numero}"
    datos = run if numero == run["run_attempt"] else gh.api(ruta)
    inicio = datos["created_at"] if numero == 1 else datos["run_started_at"]
    jobs = gh.lista(ruta + "/jobs", "jobs")
    tiempos = [medir_job(j, inicio) for j in jobs]
    # pull_requests[].base/head cambian con el PR. El marcador del job conserva
    # el checkout de ese intento; el primer padre identifica la base original.
    pasos = [s["name"] for j in jobs for s in j.get("steps", []) if s.get("conclusion") == "success"]
    revisiones = set()
    for marcador in ("Revisión comprobada", "Revisión recibida"):
        revisiones = {m[1] for paso in pasos if (m := re.fullmatch(rf"{marcador} ({SHA})", paso))}
        if revisiones:
            break
    probado = run["head_sha"] if run["event"] == "push" else None
    base = None
    if run["event"] == "pull_request" and len(revisiones) == 1:
        sha = next(iter(revisiones))
        commit = gh.api(f"git/commits/{sha}", permitir_404=True)
        padres = commit["parents"] if commit else []
        if len(padres) == 2 and padres[1]["sha"] == run["head_sha"]:
            probado, base = sha, padres[0]["sha"]
    estado = datos.get("conclusion") or datos["status"]
    info = dict(estado=estado, probado=probado, base=base, jobs=tiempos)
    if datos["status"] == "completed" and tiempos and all(j[2] is not None for j in tiempos):
        cache[llave] = info
    return info


def tiempo(n):
    return "s/d" if n is None else f"{n // 60}m{n % 60:02d}s"


def usd(minutos):
    return f"USD {minutos * TARIFA:.3f}"


def respaldo_del_mantenedor(gh, sha):
    # GitHub entrega primero los estados más recientes. El contexto previo
    # queda reemplazado aunque haya sido exitoso.
    for pagina in gh.paginas(f"commits/{sha}/statuses"):
        for estado in pagina:
            if estado["context"] == "verificado-local":
                return estado["state"] == "success" and estado["creator"]["login"] == gh.repo.split("/")[0]
    return False


def render(gh, prs, cache, limite=65000):
    filas, detalles = [], []
    completados = total_min = faltantes = 0
    raiz = "https://github.com/" + gh.repo
    for pr in prs:
        numero = pr["number"]
        runs, dudosas = asociar(gh, pr)
        ultimos = {}
        minutos_pr = 0
        incompleto = bool(dudosas)
        en_curso = False
        for r in runs:
            tipo = "PR" if r["event"] == "pull_request" else "main"
            for n in range(1, r["run_attempt"] + 1):
                info = intento(gh, r, n, cache)
                estado = info["estado"]
                jobs = info["jobs"]
                minutos_pr += sum(j[3] for j in jobs if j[3] is not None)
                incompleto |= any(j[3] is None for j in jobs) or (not jobs and estado != "cancelled")
                url = f"{raiz}/actions/runs/{r['id']}/attempts/{n}"
                probado = info["probado"]
                base = info["base"] or "s/d"
                revision = f"`{probado}`" if probado else "s/d"
                minutos = ", ".join(
                    f"[{j[0]}]({raiz}/actions/runs/{r['id']}/job/{j[0]}) "
                    f"{tiempo(j[1])}/{tiempo(j[2])}/{j[3] if j[3] is not None else 's/d'}"
                    for j in jobs) or "sin job registrado"
                detalles.append(f"| #{numero} | [{tipo} {r['id']}.{n}]({url}) | {estado} | "
                                f"`{r['head_sha'][:12]}` | {revision} | {base[:12]} | {minutos} |")
            ultimos[tipo] = info["estado"]
            en_curso |= r["status"] != "completed"
            incompleto |= en_curso
        for rid in dudosas:
            detalles.append(f"| #{numero} | [Corrida {rid}]({raiz}/actions/runs/{rid}) | "
                            "asociación pendiente, fuera del costo | — | — | — | — |")
        cerrado = pr["state"] == "closed"
        integrado = bool(pr.get("merged_at"))
        estado_pr = ultimos.get("PR", "sin corrida" if cerrado else "pendiente de corrida")
        estado_main = ultimos.get("main", "sin corrida del squash" if integrado else
                                  ("cerrado sin integrar" if cerrado else "pendiente de integración"))
        local = False
        if integrado:
            sha = pr["merge_commit_sha"]
            if estado_main != "success":
                local = respaldo_del_mantenedor(gh, sha)
                estado_main += " · verificado-local (mantenedor)" if local else " · falta un resultado aprobatorio"
            estado_main += f" · `{sha[:12]}`"
            if "PR" not in ultimos or "main" not in ultimos:
                incompleto = True
        conciliado = not integrado or ultimos.get("main") == "success" or local
        if cerrado and conciliado and not en_curso and not dudosas and (not incompleto or local):
            completados += 1
        total_min += minutos_pr
        faltantes += int(incompleto)
        fila_pr = f"[#{numero}]({raiz}/pull/{numero}/checks)"
        cantidad_intentos = sum(r["run_attempt"] for r in runs)
        filas.append(f"| {fila_pr} | {cantidad_intentos} | {estado_pr} | {estado_main} | {minutos_pr} | "
                     f"{usd(minutos_pr)}{' (parcial)' if incompleto else ''} |")

    h = [MARCA, "### Muestra de los próximos diez PR", "",
         f"**{len(prs)}/{CANTIDAD} PR abiertos en la ventana · {completados}/{CANTIDAD} con seguimiento terminado.** "
         f"Acumulado observado de `check.yml` de {total_min} minutos redondeados, {usd(total_min)} a tarifa de lista.",
         "", "Se cuentan una vez los primeros diez PR a main abiertos después de #453, incluidos borradores y cierres sin integrar. "
         "Cada fila suma los intentos de PR y el push del squash exacto. Crédito y cargo neto pendientes de conciliación. "
         "Los jobs del recolector tienen su propio consumo y se contabilizan aparte en el [historial de la muestra]"
         f"({raiz}/actions/workflows/muestra-437.yml).",
         "", "| PR | Intentos PR y main | Último check PR | Push a main | Minutos | Costo de cómputo estimado |",
         "|---|---:|---|---|---:|---:|", *filas]
    detalle = []
    if detalles:
        detalle = ["", "<details><summary>Corridas e intentos por job</summary>", "",
              "| PR | Evento e intento | Resultado | Cabeza | Commit probado | Base | Job · cola/duración/minutos |",
              "|---|---|---|---|---|---|---|", *detalles, "", "</details>"]
    if faltantes:
        h += ["", f"Hay {faltantes} PR con datos parciales. Los totales incluyen los minutos confirmados."]
    h += ["", "Para refrescar los cierres y resultados, se puede ejecutar este workflow manualmente desde main."]
    if completados == CANTIDAD:
        h += ["", "**Muestra completa.** El workflow desactiva su propio recolector. Registrar la decisión en #435. "
              "Para repetir la conciliación, habilitar `muestra-437.yml` en Actions, mantener la variable "
              "`PILOTO_437_ACTIVO=1` y ejecutarlo manualmente desde main."]
    cuerpo = "\n".join(h + detalle)
    if len(cuerpo) > limite:
        cuerpo = "\n".join(h + ["", "El detalle por job supera la capacidad de un comentario. "
                                "Los totales incluyen todos los intentos. Cada PR enlaza sus checks."])
    # El informe sigue siendo completo aunque su caché de lecturas no entre.
    # Un intento expulsado se vuelve a consultar en la próxima actualización.
    disponible = limite - len(cuerpo) - len(MEMORIA) - 10
    registros = []
    for k, v in sorted(cache.items(), key=lambda kv: tuple(map(int, kv[0].split("/"))), reverse=True):
        registro = json.dumps(k) + ":" + json.dumps(v, separators=(",", ":"), sort_keys=True)
        if len(registro) + 1 > disponible:
            break
        registros.append(registro)
        disponible -= len(registro) + 1
    return cuerpo + "\n\n" + MEMORIA + "{" + ",".join(registros) + "}\n-->", completados == CANTIDAD


def actualizar(gh, publicar):
    comentarios = [c for c in gh.lista("issues/437/comments") if c["user"]["login"] == BOT and
                   c["body"].startswith(MARCA + "\n")]
    if len(comentarios) > 1:
        raise ValueError("Hay más de un comentario del bot para la muestra de #437")
    anterior = comentarios[0]["body"] if comentarios else ""
    memoria = re.search(re.escape(MEMORIA) + r"(\{[^\n]*\})\n-->\Z", anterior)
    cache = json.loads(memoria[1]) if memoria else {}
    body, completa = render(gh, seleccionar(gh), cache)
    if len(body) > 65536:
        raise ValueError("El comentario supera el tamaño admitido. Se conserva el último informe publicado.")
    if not publicar:
        print(body.split(MEMORIA)[0].rstrip())
    elif body == anterior:
        print("La muestra de #437 ya está actualizada.")
    elif comentarios:
        print(gh.api(f"issues/comments/{comentarios[0]['id']}", "PATCH", {"body": body})["html_url"])
    elif os.getenv("GITHUB_ACTIONS") == "true":
        print(gh.api("issues/437/comments", "POST", {"body": body})["html_url"])
    else:
        raise ValueError("Para crear el comentario de github-actions[bot], ejecutar el workflow en main.")
    return completa


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--repo", required=True)
    parser.add_argument("--publicar", action="store_true")
    args = parser.parse_args()
    completa = actualizar(Github(args.repo), args.publicar)
    if args.publicar and os.getenv("GITHUB_OUTPUT"):
        with Path(os.environ["GITHUB_OUTPUT"]).open("a") as salida:
            salida.write(f"completa={str(completa).lower()}\n")
