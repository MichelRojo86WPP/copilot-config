#!/usr/bin/env python3
"""
Domino MCP Server - instalador y configurador
==============================================
Prepara el MCP server oficial de Domino (dominodatalab/domino_mcp_server) para
que tu asistente de codigo (Copilot, Cursor, VS Code) pueda lanzar Jobs en
Domino, leer sus resultados y sincronizar ficheros sin salir del chat.

Que hace:
  1. Comprueba que tienes git y uv (o venv como alternativa).
  2. Clona o actualiza el repositorio del MCP server.
  3. Instala sus dependencias.
  4. Imprime el bloque de configuracion listo para pegar en tu cliente.
  5. Opcionalmente valida tus credenciales contra Domino.

Uso:
  python domino_mcp_setup.py install
  python domino_mcp_setup.py install --dir "C:\\Users\\tu\\.domino\\mcp"
  python domino_mcp_setup.py config --client copilot
  python domino_mcp_setup.py config --client vscode
  python domino_mcp_setup.py check
  python domino_mcp_setup.py rules --out .

Credenciales (el MCP server las lee con estos nombres exactos):
  DOMINO_HOST      https://tuempresa.domino.tech      (sin barra final)
  DOMINO_API_KEY   tu API key de Domino

  Se obtienen en: Domino UI > Account > Account settings.

AVISO IMPORTANTE: no definas DOMINO_API_HOST en tu portatil. El MCP server
interpreta esa variable como "estoy dentro de un Workspace de Domino" y manda
sus llamadas a http://localhost:8899, que en local no existe.

Requisitos: solo libreria estandar Python. Sin dependencias externas.
"""

import argparse
import json
import os
import shutil
import subprocess
import sys
import urllib.error
import urllib.request
from pathlib import Path

REPO_URL = "https://github.com/dominodatalab/domino_mcp_server.git"
DIR_POR_DEFECTO = Path.home() / ".domino" / "domino_mcp_server"
ENTRADA = "domino_mcp_server.py"

# Las 10 herramientas que el servidor expone (verificadas en el codigo fuente).
HERRAMIENTAS = [
    ("get_domino_environment_info", "Detecta entorno, proyecto y modo de auth. Llamarla al empezar."),
    ("run_domino_job", "Lanza un comando como Job en Domino."),
    ("check_domino_job_run_status", "Estado del Job: en curso, terminado o con error."),
    ("check_domino_job_run_results", "Devuelve el stdout del Job."),
    ("open_web_browser", "Abre una URL (util para enlaces de MLflow)."),
    ("list_domino_project_files", "Lista ficheros del proyecto. Solo DFS."),
    ("upload_file_to_domino_project", "Sube un fichero al proyecto. Solo DFS."),
    ("download_file_from_domino_project", "Descarga el contenido de un fichero. Solo DFS."),
    ("sync_local_file_to_domino", "Lee un fichero local y lo sube. Solo DFS."),
    ("smart_sync_file", "Sube detectando conflictos de version. Solo DFS."),
]


def error(msg, codigo=1):
    print(f"\nERROR: {msg}", file=sys.stderr)
    sys.exit(codigo)


def aviso(msg):
    print(f"  [aviso] {msg}")


def ejecutar(cmd, cwd=None, silencioso=False):
    """Ejecuta un comando y devuelve (codigo, salida)."""
    try:
        res = subprocess.run(cmd, cwd=cwd, capture_output=True, text=True, timeout=600)
    except FileNotFoundError:
        return 127, f"No se encontro el ejecutable: {cmd[0]}"
    except subprocess.TimeoutExpired:
        return 124, "El comando tardo demasiado y se ha cancelado."
    salida = (res.stdout or "") + (res.stderr or "")
    if not silencioso and salida.strip():
        for linea in salida.strip().splitlines():
            print(f"    | {linea}")
    return res.returncode, salida


def buscar(binario):
    return shutil.which(binario)


# ---------------------------------------------------------------------------
# install
# ---------------------------------------------------------------------------

def cmd_install(args):
    destino = Path(args.dir).expanduser().resolve()

    print("Paso 1/4 - Comprobando herramientas")
    if not buscar("git"):
        error("Falta git. Instalalo desde https://git-scm.com/downloads y reintenta.")
    print("  git: OK")

    gestor = "uv" if buscar("uv") else None
    if gestor:
        print("  uv:  OK")
    else:
        aviso("uv no esta instalado. Se usara venv, mas lento pero equivalente.")
        aviso("Para instalar uv: pip install uv")

    print(f"\nPaso 2/4 - Repositorio en {destino}")
    if (destino / ".git").exists():
        print("  Ya existe. Actualizando...")
        codigo, _ = ejecutar(["git", "pull", "--ff-only"], cwd=destino)
        if codigo != 0:
            aviso("No se pudo actualizar (quiza tienes cambios locales). Se sigue con la copia actual.")
    else:
        destino.parent.mkdir(parents=True, exist_ok=True)
        if destino.exists() and any(destino.iterdir()):
            error(f"{destino} existe y no esta vacio. Usa --dir con otra ruta.")
        print("  Clonando...")
        codigo, _ = ejecutar(["git", "clone", "--depth", "1", REPO_URL, str(destino)])
        if codigo != 0:
            error("Fallo el clonado. Revisa tu conexion o tu proxy corporativo.")

    if not (destino / ENTRADA).exists():
        error(f"No se encontro {ENTRADA} en {destino}. El repositorio no es el esperado.")
    print("  Repositorio listo.")

    print("\nPaso 3/4 - Instalando dependencias")
    if gestor == "uv":
        ejecutar(["uv", "venv"], cwd=destino, silencioso=True)
        codigo, _ = ejecutar(["uv", "pip", "install", "-e", "."], cwd=destino)
    else:
        venv = destino / ".venv"
        if not venv.exists():
            ejecutar([sys.executable, "-m", "venv", str(venv)], cwd=destino, silencioso=True)
        pip = venv / ("Scripts" if os.name == "nt" else "bin") / "pip"
        codigo, _ = ejecutar([str(pip), "install", "-e", "."], cwd=destino)
    if codigo != 0:
        error("Fallo la instalacion de dependencias. Revisa el log de arriba.")
    print("  Dependencias instaladas.")

    print("\nPaso 4/4 - Configuracion")
    _avisar_colision()
    print(_bloque_config(destino, args.client if hasattr(args, "client") else "copilot", gestor))
    print(_siguientes_pasos(destino))
    return 0


# ---------------------------------------------------------------------------
# config
# ---------------------------------------------------------------------------

def _bloque_config(destino, cliente, gestor="uv"):
    if gestor == "uv" or buscar("uv"):
        comando = "uv"
        argumentos = ["--directory", str(destino), "run", ENTRADA]
    else:
        venv = destino / ".venv" / ("Scripts" if os.name == "nt" else "bin") / "python"
        comando = str(venv)
        argumentos = [str(destino / ENTRADA)]

    servidor = {
        "type": "stdio",
        "command": comando,
        "args": argumentos,
        "env": {"DOMINO_HOST": "${DOMINO_HOST}", "DOMINO_API_KEY": "${DOMINO_API_KEY}"},
    }

    if cliente == "cursor":
        # Cursor no admite interpolacion ${VAR}: hay que usar el .env del repo.
        servidor.pop("env")
        servidor.pop("type")
        cfg = {"mcpServers": {"domino_server": servidor}}
        ruta = ".cursor/mcp.json"
        nota = ("Cursor no interpola ${VAR}. Crea un fichero .env dentro de\n"
                f"  {destino}\n  con DOMINO_HOST y DOMINO_API_KEY.")
    elif cliente == "vscode":
        cfg = {"servers": {"domino_server": servidor}}
        ruta = ".vscode/mcp.json"
        nota = "VS Code usa la clave 'servers', no 'mcpServers'."
    else:
        cfg = {"mcpServers": {"domino_server": servidor}}
        ruta = "~/.copilot/mcp.json  (o mcp/mcp.json de copilot-config)"
        nota = ("Ya esta incluido en mcp/mcp.json de este repositorio.\n"
                "  Solo necesitas definir DOMINO_MCP_DIR, DOMINO_HOST y DOMINO_API_KEY.")

    return (f"\n--- Configuracion para {cliente} -> {ruta} ---\n"
            f"{json.dumps(cfg, indent=2)}\n\n  Nota: {nota}\n")


def _avisar_colision():
    if os.environ.get("DOMINO_API_HOST"):
        print("\n  !!! Tienes DOMINO_API_HOST definida en este equipo.")
        print("      El MCP server creera que esta dentro de un Workspace de Domino")
        print("      y llamara a http://localhost:8899, que fallara.")
        print("      Borrala y usa DOMINO_HOST en su lugar:")
        print('      [Environment]::SetEnvironmentVariable("DOMINO_API_HOST", $null, "User")\n')


def _siguientes_pasos(destino):
    return f"""
--- Siguientes pasos ---

1. Define tus credenciales (PowerShell, se guardan permanentemente):

   [Environment]::SetEnvironmentVariable("DOMINO_MCP_DIR", "{destino}", "User")
   [Environment]::SetEnvironmentVariable("DOMINO_HOST", "https://tuempresa.domino.tech", "User")
   [Environment]::SetEnvironmentVariable("DOMINO_API_KEY", "<tu-api-key>", "User")

   La API key esta en: Domino UI > Account > Account settings.

2. Abre una terminal NUEVA (las variables no llegan a las ya abiertas) y valida:

   python scripts/domino_mcp_setup.py check

3. En el repositorio de tu proyecto de datos, genera los ficheros de contexto:

   python scripts/domino_mcp_setup.py rules --out .

4. Reinicia tu cliente para que cargue el MCP server.

--- Herramientas que tendras disponibles ---
""" + "\n".join(f"  - {n:<34} {d}" for n, d in HERRAMIENTAS)


def cmd_config(args):
    destino = Path(args.dir).expanduser().resolve()
    if not (destino / ENTRADA).exists():
        aviso(f"No hay un MCP server en {destino}. Ejecuta primero: install")
    _avisar_colision()
    print(_bloque_config(destino, args.client))
    return 0


# ---------------------------------------------------------------------------
# check
# ---------------------------------------------------------------------------

def cmd_check(args):
    print("Comprobando configuracion del MCP server de Domino\n")
    fallos = 0

    destino = Path(args.dir).expanduser().resolve()
    if (destino / ENTRADA).exists():
        print(f"  [ok]    MCP server presente en {destino}")
    else:
        print(f"  [FALLO] No hay MCP server en {destino}. Ejecuta: install")
        fallos += 1

    if os.environ.get("DOMINO_MCP_DIR"):
        print("  [ok]    DOMINO_MCP_DIR definida")
    else:
        print("  [aviso] DOMINO_MCP_DIR sin definir (la necesita mcp/mcp.json)")

    host = os.environ.get("DOMINO_HOST")
    if host:
        print(f"  [ok]    DOMINO_HOST = {host}")
        if host.endswith("/"):
            print("  [FALLO] DOMINO_HOST no debe acabar en barra '/'")
            fallos += 1
    else:
        print("  [FALLO] DOMINO_HOST sin definir")
        fallos += 1

    clave = os.environ.get("DOMINO_API_KEY")
    if clave:
        print(f"  [ok]    DOMINO_API_KEY definida ({len(clave)} caracteres)")
    else:
        print("  [FALLO] DOMINO_API_KEY sin definir")
        fallos += 1

    if os.environ.get("DOMINO_API_HOST"):
        print("  [FALLO] DOMINO_API_HOST esta definida: rompe el MCP server. Borrala.")
        fallos += 1
    else:
        print("  [ok]    DOMINO_API_HOST no definida (correcto en local)")

    if buscar("uv"):
        print("  [ok]    uv disponible")
    else:
        print("  [aviso] uv no disponible; se usara el venv local")

    if host and clave and not fallos:
        print(f"\n  Probando conexion contra {host} ...")
        # Mismo endpoint que usa el MCP server para resolver proyectos.
        url = host.rstrip("/") + "/v4/gateway/projects?relationship=All"
        req = urllib.request.Request(
            url, headers={"X-Domino-Api-Key": clave, "Accept": "application/json"})
        try:
            with urllib.request.urlopen(req, timeout=30) as resp:
                datos = json.loads(resp.read().decode("utf-8"))
            proyectos = datos if isinstance(datos, list) else datos.get("data", [])
            print(f"  [ok]    Conexion correcta. {len(proyectos)} proyecto(s) accesibles.\n")
            if proyectos:
                print("  Usa estos valores en domino_project_settings.md:\n")
                print(f"    {'PROPIETARIO':<24} {'PROYECTO':<34} TIPO")
                for p in proyectos[:25]:
                    if not isinstance(p, dict):
                        continue
                    duenyo = (p.get("ownerUsername") or p.get("owner")
                              or (p.get("ownerInfo") or {}).get("ownerUsername") or "?")
                    nombre = p.get("name", "?")
                    tipo = "DFS" if not p.get("mainRepository") else "Git"
                    print(f"    {duenyo:<24} {nombre:<34} {tipo}")
                if len(proyectos) > 25:
                    print(f"    ... y {len(proyectos) - 25} mas")
        except urllib.error.HTTPError as exc:
            fallos += 1
            if exc.code in (401, 403):
                print(f"  [FALLO] {exc.code}: la API key no es valida o esta revocada.")
                print("          Genera una nueva en Account > Account settings.")
                print("          Si tu Domino es 6.3+, puede que las API keys esten")
                print("          desactivadas y tu instancia exija Personal Access Tokens;")
                print("          en ese caso el MCP server oficial necesita un parche para")
                print("          usar 'Authorization: Bearer' en vez de 'X-Domino-Api-Key'.")
            else:
                print(f"  [FALLO] HTTP {exc.code} al contactar con Domino.")
        except urllib.error.URLError as exc:
            fallos += 1
            print(f"  [FALLO] No se pudo conectar: {exc.reason}")
            print("          Revisa la URL, la VPN corporativa o el proxy.")
        except ValueError:
            fallos += 1
            print("  [FALLO] Domino respondio algo que no es JSON.")
            print("          Suele indicar que la URL apunta a una pagina de login.")

    print(f"\n  Resultado: {'todo correcto' if not fallos else str(fallos) + ' problema(s)'}")
    return 1 if fallos else 0


# ---------------------------------------------------------------------------
# rules
# ---------------------------------------------------------------------------

REGLAS = """---
applyTo: '**'
---

# Trabajar con Domino Data Lab en este proyecto

Eres un asistente de codigo conectado a la plataforma Domino Data Lab a traves del
MCP server `domino_server`. Ademas de escribir codigo, ejecutas tareas en Domino en
nombre del usuario. **Siempre que sea posible, ejecuta en Domino, no en la terminal
local.**

## Al empezar cada sesion

Llama a `get_domino_environment_info` para detectar el entorno. Te dira si estas
dentro de un Workspace de Domino o en un portatil, el propietario y nombre del
proyecto, si el proyecto es DFS o Git, y el modo de autenticacion.

- **Dentro de un Workspace**: propietario, proyecto y modo DFS/Git se detectan solos.
- **Fuera (portatil)**: lee `domino_project_settings.md` para obtener `project_name`,
  `user_name` y `dfs`.

## Antes de lanzar cualquier Job

**Comprueba siempre si hay cambios sin guardar.**

- **Proyecto Git**: haz `commit` y `push` antes de lanzar el Job. Domino ejecuta lo
  que hay en el repositorio remoto; los cambios locales sin subir son invisibles.
  Este es el fallo mas comun: si lanzas sin push, ejecutas codigo viejo.
- **Proyecto DFS**: usa las funciones de sincronizacion del MCP
  (`upload_file_to_domino_project`, `smart_sync_file`), no git.

## Al ejecutar un Job

1. Lanza con `run_domino_job`.
2. Consulta `check_domino_job_run_status` hasta que termine. Un Job puede tardar
   varios minutos, asi que puede hacer falta consultar varias veces.
3. Lee `check_domino_job_run_results` y **explica brevemente las conclusiones**.
4. Si el resultado incluye una URL de MLflow o de un experimento, compartela con el
   usuario usando `open_web_browser`.

## Datos

Asume que los datos ya estan en el proyecto y son accesibles desde los Jobs:

- Proyecto **Git**: `/mnt/data/` o `/mnt/imported/data/`
- Proyecto **DFS**: `/domino/datasets/`

Antes de usar un fichero, lanza un Job que liste el contenido de las carpetas de
forma recursiva para conocer la ruta exacta. Para entender o transformar datos,
**crea un script y ejecutalo como Job**; no improvises en local.

Las salidas analiticas van en **texto tabular plano a stdout**: asi se leen
directamente desde el resultado del Job.

## Buenas practicas

- **No borres** los scripts de analisis o transformacion: son la trazabilidad.
- Genera graficos de resumen en formato imagen y guardalos en el proyecto.
- Al entrenar modelos, instrumenta con **MLflow** dando por hecho que el servidor ya
  esta corriendo: no hace falta configurar ninguna URL.
- Los entregables se escriben en `/mnt/artifacts` o se pierden al acabar el Job.

## Limitaciones que debes conocer

- `run_domino_job` **no permite elegir hardware tier ni entorno**: usa los del
  proyecto. Si el analisis necesita GPU, configurala como valor por defecto del
  proyecto, o lanza el Job con el CLI `domino_job.py`, que si admite `--tier`.
- `run_domino_job` **tampoco fija rama ni commit**: ejecuta la referencia por
  defecto del proyecto. Para un run reproducible que va al cliente, usa
  `domino_job.py run --commit <sha>`.
- El comando se parte por espacios, asi que **los argumentos con espacios entre
  comillas no sobreviven**. Evitalos o pasalos por fichero de configuracion.
"""

AJUSTES = """# Ajustes del proyecto Domino para el MCP server domino_server
#
# Estos valores se leen cuando trabajas FUERA de Domino (en tu portatil).
# Dentro de un Workspace, el MCP server los detecta automaticamente.
#
# Saca project_name y user_name de la URL del proyecto en Domino:
#   https://tuempresa.domino.tech/u/<user_name>/<project_name>/overview
#
# IMPORTANTE: user_name es el propietario del proyecto en la URL, que no tiene por
# que ser tu usuario si el proyecto es de otra persona.

project_name="nombre-de-tu-proyecto"
user_name="propietario_del_proyecto"
dfs=false
"""


def cmd_rules(args):
    base = Path(args.out).expanduser().resolve()
    escritos, omitidos = [], []

    objetivos = [
        (base / ".github" / "instructions" / "domino.instructions.md", REGLAS),
        (base / "domino_project_settings.md", AJUSTES),
    ]
    if args.cursor:
        # Cursor usa cabecera propia y extension .mdc
        reglas_cursor = REGLAS.replace("---\napplyTo: '**'\n---",
                                       "---\ndescription: Domino Data Lab\nglobs: \nalwaysApply: true\n---")
        objetivos.append((base / ".cursor" / "rules" / "domino-project-rule.mdc", reglas_cursor))

    for ruta, contenido in objetivos:
        if ruta.exists() and not args.force:
            omitidos.append(ruta)
            continue
        ruta.parent.mkdir(parents=True, exist_ok=True)
        ruta.write_text(contenido, encoding="utf-8")
        escritos.append(ruta)

    for r in escritos:
        print(f"  creado   {r}")
    for r in omitidos:
        print(f"  ya existe (usa --force para sobrescribir)  {r}")

    if escritos:
        print("\n  Edita domino_project_settings.md con el nombre real de tu proyecto")
        print("  y su propietario, sacados de la URL del proyecto en Domino.")
    return 0


# ---------------------------------------------------------------------------
# tools
# ---------------------------------------------------------------------------

def cmd_tools(args):
    print("Herramientas del MCP server oficial de Domino (domino_server)\n")
    for nombre, desc in HERRAMIENTAS:
        print(f"  {nombre}\n      {desc}\n")
    print("  Las herramientas de ficheros solo funcionan en proyectos DFS.")
    print("  En proyectos Git-based el codigo entra por git push, no por el MCP.")
    return 0


# ---------------------------------------------------------------------------
# CLI
# ---------------------------------------------------------------------------

def main():
    par = argparse.ArgumentParser(
        prog="domino_mcp_setup.py",
        description="Instala y configura el MCP server oficial de Domino Data Lab.",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog=__doc__,
    )
    sub = par.add_subparsers(dest="comando", required=True)

    def con_dir(p):
        p.add_argument("--dir", default=str(DIR_POR_DEFECTO),
                       help=f"Carpeta del MCP server (por defecto: {DIR_POR_DEFECTO})")
        return p

    p_i = con_dir(sub.add_parser("install", help="Clona el MCP server e instala dependencias."))
    p_i.add_argument("--client", default="copilot", choices=["copilot", "vscode", "cursor"],
                     help="Cliente para el que imprimir la configuracion.")
    p_i.set_defaults(func=cmd_install)

    p_c = con_dir(sub.add_parser("config", help="Imprime el bloque de configuracion."))
    p_c.add_argument("--client", default="copilot", choices=["copilot", "vscode", "cursor"])
    p_c.set_defaults(func=cmd_config)

    p_k = con_dir(sub.add_parser("check", help="Valida credenciales y conexion con Domino."))
    p_k.set_defaults(func=cmd_check)

    p_r = sub.add_parser("rules", help="Genera los ficheros de contexto en un proyecto.")
    p_r.add_argument("--out", default=".", help="Carpeta del proyecto (por defecto: la actual).")
    p_r.add_argument("--cursor", action="store_true", help="Generar tambien la regla de Cursor.")
    p_r.add_argument("--force", action="store_true", help="Sobrescribir si ya existen.")
    p_r.set_defaults(func=cmd_rules)

    p_t = sub.add_parser("tools", help="Lista las herramientas que expone el MCP server.")
    p_t.set_defaults(func=cmd_tools)

    args = par.parse_args()
    try:
        sys.exit(args.func(args))
    except KeyboardInterrupt:
        print("\nCancelado por el usuario.", file=sys.stderr)
        sys.exit(130)


if __name__ == "__main__":
    main()
