#!/usr/bin/env python3
"""
Domino Data Lab - Lanzador de Jobs desde local
===============================================
Permite hacer "vibecoding" en local (Copilot + GitHub) y ejecutar en Domino:
editas el codigo, haces push a GitHub, y lanzas el Job en Domino apuntando a
esa rama o commit. Los logs se ven en streaming en tu terminal.

Uso tipico:
  python domino_job.py whoami
  python domino_job.py projects
  python domino_job.py tiers
  python domino_job.py run --project-id 665f... --command "python run_analysis.py" --branch main --follow
  python domino_job.py logs 6712abc... --follow
  python domino_job.py status 6712abc...

Configuracion (por orden de prioridad):
  1. Flags:      --host / --token
  2. Entorno:    DOMINO_HOST y DOMINO_TOKEN (PAT o Service Account)
                 o DOMINO_API_KEY (API key legacy, en desuso)
  3. Fichero:    ~/.domino/config.json  ->  {"host": "...", "token": "..."}

  Se usan DOMINO_HOST y DOMINO_API_KEY por compatibilidad con el MCP server
  oficial de Domino, que lee esos mismos nombres. Asi basta configurarlo una vez.

  AVISO: no definas DOMINO_API_HOST en tu portatil. El MCP server de Domino
  interpreta la presencia de esa variable como "estoy dentro de un Workspace" y
  redirige sus llamadas a http://localhost:8899, que en local no existe.
  Este CLI la sigue aceptando como ultimo recurso, pero no es la recomendada.

Como obtener el token (PAT):
  Domino UI > Account > Account settings > Personal Access Token > Generate new Token
  El valor solo se muestra UNA vez. Guardalo en DOMINO_TOKEN.

API verificado contra el OpenAPI oficial "Domino Public API" v6.4.0
(https://docs.domino.ai/api-specs/cloud/public-api.json).

Requisitos: solo libreria estandar Python. Sin dependencias externas.
"""

import argparse
import json
import os
import sys
import time
import urllib.error
import urllib.parse
import urllib.request
from pathlib import Path

CONFIG_PATH = Path.home() / ".domino" / "config.json"

# Endpoints reales del Domino Public API (no inventar otros).
EP_SELF = "/api/users/v1/self"
EP_PROJECTS = "/api/projects/beta/projects"
EP_HARDWARE_TIERS = "/api/hardwaretiers/v1/hardwaretiers"
EP_ENVIRONMENTS = "/api/environments/beta/environments"
EP_JOB_START = "/api/jobs/v1/jobs"
EP_JOBS = "/api/jobs/beta/jobs"
EP_JOB_DETAIL = "/api/jobs/beta/jobs/{job_id}"
EP_JOB_LOGS = "/api/jobs/beta/jobs/{job_id}/logs"
EP_RESOLVE_GIT_REF = "/api/projects/beta/projects/{project_id}/commits/resolveGitRef"

# Estados terminales de un Job (campo status.executionStatus).
ESTADOS_FINALES = {"Succeeded", "Failed", "Stopped", "Error"}


# ---------------------------------------------------------------------------
# Configuracion y autenticacion
# ---------------------------------------------------------------------------

def cargar_config(host_flag=None, token_flag=None):
    """Resuelve host y token segun la prioridad documentada arriba."""
    fichero = {}
    if CONFIG_PATH.exists():
        try:
            fichero = json.loads(CONFIG_PATH.read_text(encoding="utf-8"))
        except (OSError, ValueError) as exc:
            print(f"[aviso] No se pudo leer {CONFIG_PATH}: {exc}", file=sys.stderr)

    # DOMINO_HOST y DOMINO_API_KEY son los nombres que usa el MCP server oficial;
    # los preferimos para no obligar a mantener dos configuraciones distintas.
    host = (host_flag
            or os.environ.get("DOMINO_HOST")
            or os.environ.get("DOMINO_API_HOST")
            or fichero.get("host"))
    token = token_flag or os.environ.get("DOMINO_TOKEN") or fichero.get("token")
    # API key legacy: sigue funcionando pero Domino la ha marcado como deprecada.
    api_key = (os.environ.get("DOMINO_API_KEY")
               or os.environ.get("DOMINO_USER_API_KEY")
               or fichero.get("api_key"))

    if not host:
        error(
            "Falta el host de Domino.\n"
            "  Exporta DOMINO_HOST=https://tuempresa.domino.tech\n"
            "  o pasa --host https://tuempresa.domino.tech"
        )
    if not token and not api_key:
        error(
            "Falta el token de Domino.\n"
            "  Crea un PAT en: Account > Account settings > Personal Access Token\n"
            "  Exporta DOMINO_TOKEN=<tu-token>  (o DOMINO_API_KEY para la key legacy)"
        )

    host = host.rstrip("/")
    if not host.startswith(("http://", "https://")):
        host = "https://" + host
    return host, token, api_key


def cabeceras(token, api_key):
    """Cabeceras de autenticacion. PAT/Service Account usan Bearer; la key legacy no."""
    cab = {"Content-Type": "application/json", "Accept": "application/json"}
    if token:
        valor = token if token.lower().startswith("bearer ") else f"Bearer {token}"
        cab["Authorization"] = valor
    else:
        cab["X-Domino-Api-Key"] = api_key
    return cab


def peticion(host, ruta, token, api_key, metodo="GET", cuerpo=None, params=None):
    """Llamada HTTP a la API de Domino. Devuelve el JSON decodificado."""
    url = host + ruta
    if params:
        limpios = {k: v for k, v in params.items() if v is not None}
        if limpios:
            url += "?" + urllib.parse.urlencode(limpios)

    datos = json.dumps(cuerpo).encode("utf-8") if cuerpo is not None else None
    req = urllib.request.Request(url, data=datos, method=metodo,
                                 headers=cabeceras(token, api_key))
    try:
        with urllib.request.urlopen(req, timeout=120) as resp:
            crudo = resp.read().decode("utf-8")
            return json.loads(crudo) if crudo else {}
    except urllib.error.HTTPError as exc:
        detalle = exc.read().decode("utf-8", errors="replace")[:1000]
        if exc.code in (401, 403):
            detalle += ("\n  -> Revisa que el token sea valido y no haya expirado. "
                        "Los PAT se revocan solos si un admin cambia tus roles.")
        error(f"HTTP {exc.code} en {metodo} {ruta}\n  {detalle}")
    except urllib.error.URLError as exc:
        error(f"No se pudo conectar con {host}: {exc.reason}")


def error(mensaje):
    print(f"[ERROR] {mensaje}", file=sys.stderr)
    sys.exit(1)


# ---------------------------------------------------------------------------
# Comandos de consulta
# ---------------------------------------------------------------------------

def cmd_whoami(args, host, token, api_key):
    datos = peticion(host, EP_SELF, token, api_key)
    print(f"Usuario : {datos.get('userName')}")
    print(f"Nombre  : {datos.get('firstName', '')} {datos.get('lastName', '')}".rstrip())
    print(f"Email   : {datos.get('email')}")
    print(f"ID      : {datos.get('id')}")
    print(f"Host    : {host}")


def cmd_projects(args, host, token, api_key):
    datos = peticion(host, EP_PROJECTS, token, api_key,
                     params={"limit": args.limit, "nameFilter": args.search})
    proyectos = datos.get("projects", datos if isinstance(datos, list) else [])
    if not proyectos:
        print("No se han encontrado proyectos.")
        return
    print(f"{'ID':26}  {'OWNER/NOMBRE':45}  GIT")
    print("-" * 90)
    for p in proyectos:
        owner = (p.get("ownerUsername") or p.get("owner", {}).get("userName") or "?")
        nombre = f"{owner}/{p.get('name')}"
        tipo = "git" if p.get("mainRepository") or p.get("isGitBased") else "dfs"
        print(f"{str(p.get('id')):26}  {nombre:45}  {tipo}")


def cmd_tiers(args, host, token, api_key):
    datos = peticion(host, EP_HARDWARE_TIERS, token, api_key)
    tiers = datos.get("hardwareTiers", datos if isinstance(datos, list) else [])
    print(f"{'ID':30}  {'NOMBRE':32}  {'GPU':5}  CORES/MEM")
    print("-" * 92)
    for t in tiers:
        ht = t.get("hardwareTier", t)
        cores = ht.get("cores", "?")
        mem = ht.get("memory", "?")
        gpus = ht.get("numberOfGpus", ht.get("gpus", 0)) or 0
        print(f"{str(ht.get('id')):30}  {str(ht.get('name')):32}  {str(gpus):5}  {cores}c / {mem}GB")


def cmd_envs(args, host, token, api_key):
    datos = peticion(host, EP_ENVIRONMENTS, token, api_key, params={"limit": args.limit})
    entornos = datos.get("environments", datos if isinstance(datos, list) else [])
    print(f"{'ID':26}  NOMBRE")
    print("-" * 80)
    for e in entornos:
        print(f"{str(e.get('id')):26}  {e.get('name')}")


def cmd_jobs(args, host, token, api_key):
    datos = peticion(host, EP_JOBS, token, api_key,
                     params={"projectId": args.project_id, "limit": args.limit})
    for j in datos.get("jobs", []):
        estado = (j.get("status") or {}).get("executionStatus", "?")
        print(f"#{j.get('number'):<5} {str(j.get('id')):26} {estado:12} {j.get('title') or j.get('runCommand', '')}")


def cmd_status(args, host, token, api_key):
    datos = peticion(host, EP_JOB_DETAIL.format(job_id=args.job_id), token, api_key)
    job = datos.get("job", datos)
    estado = job.get("status") or {}
    print(f"Job     : #{job.get('number')}  ({job.get('id')})")
    print(f"Titulo  : {job.get('title') or '-'}")
    print(f"Comando : {job.get('runCommand')}")
    print(f"Estado  : {estado.get('executionStatus')}  (completado={estado.get('isCompleted')})")
    commit = (job.get("commitDetails") or {}).get("inputCommitId")
    if commit:
        print(f"Commit  : {commit}")
    for repo in job.get("gitRepos") or []:
        print(f"Repo    : {repo.get('name')} @ {repo.get('startingCommitId', '')[:12]}")


# ---------------------------------------------------------------------------
# Logs en streaming
# ---------------------------------------------------------------------------

def volcar_logs(host, job_id, token, api_key, log_type=None, desde_nano=None, limit=10000):
    """Descarga un bloque de logs. Devuelve (lineas, siguiente_nano, completo)."""
    datos = peticion(host, EP_JOB_LOGS.format(job_id=job_id), token, api_key,
                     params={"logType": log_type, "limit": limit,
                             "latestTimeNano": desde_nano})
    bloque = datos.get("logs") or {}
    lineas = bloque.get("logContent") or []
    paginacion = (datos.get("metadata") or {}).get("pagination") or {}
    return lineas, paginacion.get("latestTimeNano"), bloque.get("isComplete", False)


def seguir_logs(host, job_id, token, api_key, log_type=None, intervalo=4.0):
    """Imprime logs segun se generan hasta que el Job termina. Devuelve el estado final."""
    siguiente = None
    estado_final = "Unknown"
    fallos = 0

    while True:
        try:
            lineas, siguiente_nuevo, _ = volcar_logs(
                host, job_id, token, api_key, log_type, siguiente)
            fallos = 0
        except SystemExit:
            # No abortamos el seguimiento por un fallo puntual de red.
            fallos += 1
            if fallos >= 3:
                raise
            time.sleep(intervalo)
            continue

        for linea in lineas:
            texto = (linea.get("log") or "").rstrip("\n")
            if texto:
                print(texto, flush=True)
        if siguiente_nuevo:
            siguiente = siguiente_nuevo

        detalle = peticion(host, EP_JOB_DETAIL.format(job_id=job_id), token, api_key)
        estado = ((detalle.get("job") or detalle).get("status") or {})
        estado_final = estado.get("executionStatus", "Unknown")
        if estado.get("isCompleted") or estado_final in ESTADOS_FINALES:
            # Última pasada: recoge lo que se haya escrito justo antes de terminar.
            lineas, _, _ = volcar_logs(host, job_id, token, api_key, log_type, siguiente)
            for linea in lineas:
                texto = (linea.get("log") or "").rstrip("\n")
                if texto:
                    print(texto, flush=True)
            return estado_final

        time.sleep(intervalo)


def cmd_logs(args, host, token, api_key):
    if args.follow:
        estado = seguir_logs(host, args.job_id, token, api_key, args.log_type)
        print(f"\n--- Job finalizado con estado: {estado} ---")
        sys.exit(0 if estado == "Succeeded" else 1)
    lineas, _, _ = volcar_logs(host, args.job_id, token, api_key, args.log_type)
    for linea in lineas:
        print((linea.get("log") or "").rstrip("\n"))


# ---------------------------------------------------------------------------
# Lanzamiento de Jobs
# ---------------------------------------------------------------------------

def construir_git_ref(args):
    """Traduce --branch/--commit/--tag al objeto GitRefV1 que espera la API."""
    if args.commit:
        return {"refType": "commitId", "value": args.commit}
    if args.tag:
        return {"refType": "tags", "value": args.tag}
    if args.branch:
        return {"refType": "branches", "value": args.branch}
    return None


def cmd_run(args, host, token, api_key):
    cuerpo = {"projectId": args.project_id, "runCommand": args.command}

    if args.title:
        cuerpo["title"] = args.title
    if args.tier:
        cuerpo["hardwareTier"] = args.tier
    if args.environment_id:
        cuerpo["environmentId"] = args.environment_id
    if args.environment_revision:
        cuerpo["environmentRevisionSpec"] = args.environment_revision
    if args.snapshot_datasets:
        cuerpo["snapshotDatasetsOnCompletion"] = True

    git_ref = construir_git_ref(args)
    if git_ref:
        # mainRepoGitRef fija el repo principal del proyecto Git-based en esa
        # rama/tag/commit. Es la pieza que une GitHub con la ejecucion en Domino.
        cuerpo["mainRepoGitRef"] = git_ref

    if args.dry_run:
        print("POST " + host + EP_JOB_START)
        print(json.dumps(cuerpo, indent=2, ensure_ascii=False))
        return

    respuesta = peticion(host, EP_JOB_START, token, api_key, metodo="POST", cuerpo=cuerpo)
    job = respuesta.get("job") or {}
    job_id = job.get("id")
    if not job_id:
        error(f"Respuesta inesperada al lanzar el Job:\n{json.dumps(respuesta, indent=2)}")

    print(f"Job lanzado : #{job.get('number')}  ({job_id})")
    print(f"Comando     : {args.command}")
    if git_ref:
        print(f"Git ref     : {git_ref['refType']}={git_ref.get('value')}")
    print(f"UI          : {host}/jobs/{job_id}")

    if args.follow:
        print("\n--- logs ---", flush=True)
        estado = seguir_logs(host, job_id, token, api_key, args.log_type)
        print(f"\n--- Job finalizado con estado: {estado} ---")
        sys.exit(0 if estado == "Succeeded" else 1)


def cmd_resolve(args, host, token, api_key):
    """Resuelve una rama o tag de GitHub al SHA exacto, para ejecuciones reproducibles."""
    cuerpo = {"refType": "branches", "value": args.ref}
    if args.tag:
        cuerpo = {"refType": "tags", "value": args.ref}
    datos = peticion(host, EP_RESOLVE_GIT_REF.format(project_id=args.project_id),
                     token, api_key, metodo="POST", cuerpo=cuerpo)
    print(json.dumps(datos, indent=2, ensure_ascii=False))


# ---------------------------------------------------------------------------
# CLI
# ---------------------------------------------------------------------------

def construir_parser():
    parser = argparse.ArgumentParser(
        prog="domino_job.py",
        description="Lanza y monitoriza Jobs de Domino Data Lab desde tu terminal local.",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog=__doc__.split("Uso tipico:")[1].split("Configuracion")[0] if "Uso tipico:" in __doc__ else None,
    )
    parser.add_argument("--host", help="URL de Domino (o DOMINO_API_HOST)")
    parser.add_argument("--token", help="PAT o token de Service Account (o DOMINO_TOKEN)")
    sub = parser.add_subparsers(dest="comando", required=True)

    sub.add_parser("whoami", help="Verifica la conexion y muestra tu usuario")

    p = sub.add_parser("projects", help="Lista los proyectos visibles")
    p.add_argument("--search", help="Filtra por nombre")
    p.add_argument("--limit", type=int, default=50)

    p = sub.add_parser("tiers", help="Lista los hardware tiers (incluye los de GPU)")

    p = sub.add_parser("envs", help="Lista los compute environments")
    p.add_argument("--limit", type=int, default=50)

    p = sub.add_parser("jobs", help="Lista los Jobs de un proyecto")
    p.add_argument("--project-id", required=True)
    p.add_argument("--limit", type=int, default=20)

    p = sub.add_parser("status", help="Estado de un Job")
    p.add_argument("job_id")

    p = sub.add_parser("logs", help="Logs de un Job")
    p.add_argument("job_id")
    p.add_argument("--follow", "-f", action="store_true", help="Sigue los logs en vivo")
    p.add_argument("--log-type", choices=["stdOut", "stdErr", "prepareOutput", "complete"])

    p = sub.add_parser("run", help="Lanza un Job en Domino")
    p.add_argument("--project-id", required=True, help="ID del proyecto Domino")
    p.add_argument("--command", required=True, help='Comando, ej: "python run_analysis.py"')
    p.add_argument("--title", help="Titulo del Job")
    p.add_argument("--tier", help="Nombre del hardware tier (ver: tiers)")
    p.add_argument("--environment-id", help="ID del compute environment")
    p.add_argument("--environment-revision",
                   help='ActiveRevision | LatestRevision | SomeRevision(<id>)')
    p.add_argument("--branch", help="Rama de GitHub a ejecutar")
    p.add_argument("--commit", help="Commit SHA exacto a ejecutar (reproducible)")
    p.add_argument("--tag", help="Tag de Git a ejecutar")
    p.add_argument("--snapshot-datasets", action="store_true",
                   help="Snapshot de los Datasets al terminar")
    p.add_argument("--follow", "-f", action="store_true",
                   help="Sigue los logs hasta que el Job termina")
    p.add_argument("--log-type", choices=["stdOut", "stdErr", "prepareOutput", "complete"])
    p.add_argument("--dry-run", action="store_true",
                   help="Muestra el cuerpo de la peticion sin lanzarla")

    p = sub.add_parser("resolve", help="Resuelve una rama/tag al commit SHA exacto")
    p.add_argument("--project-id", required=True)
    p.add_argument("ref", help="Nombre de la rama o del tag")
    p.add_argument("--tag", action="store_true", help="Trata ref como tag en vez de rama")

    return parser


COMANDOS = {
    "whoami": cmd_whoami,
    "projects": cmd_projects,
    "tiers": cmd_tiers,
    "envs": cmd_envs,
    "jobs": cmd_jobs,
    "status": cmd_status,
    "logs": cmd_logs,
    "run": cmd_run,
    "resolve": cmd_resolve,
}


def main():
    args = construir_parser().parse_args()
    host, token, api_key = cargar_config(args.host, args.token)
    try:
        COMANDOS[args.comando](args, host, token, api_key)
    except KeyboardInterrupt:
        print("\nInterrumpido. El Job sigue ejecutandose en Domino.", file=sys.stderr)
        sys.exit(130)


if __name__ == "__main__":
    main()
