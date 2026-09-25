---
name: domino-datalab
description: >
  Trabajar en Domino Data Lab manteniendo el código en GitHub: proyectos Git-based vs DFS,
  rutas de montaje (/mnt/code, /mnt/artifacts, /mnt/data), Jobs por API REST, Workspaces,
  Compute Environments, hardware tiers con GPU, Datasets, Flows y Apps. Despliegue de
  modelos como Domino Endpoints (síncronos y asíncronos) y batch scoring. Autenticación con
  Personal Access Tokens y Service Accounts. Usar al ejecutar análisis (Meridian MMM, GeoX,
  CausalImpact) en Domino desde local, al conectar un asistente de código por MCP o SSH,
  al lanzar o depurar Jobs, al publicar un modelo como API, al montar el entorno de
  cómputo, o al decidir dónde viven código, datos y resultados. Incluye el control de
  coste: verificar que no queden Workspaces ni Jobs encendidos al terminar.
license: MIT
metadata:
  version: 1.1.0
  author: MichelRojo86WPP
  category: mlops
  domain: compute-platform
  tier: POWERFUL
  updated: 2026-09-25
  frameworks: domino-data-lab, python-domino, flyte, mlflow
---

# Domino Data Lab

Ejecuta proyectos de Data Science en **Domino Data Lab** (la plataforma de cómputo
gobernado de la empresa) manteniendo el código versionado en **GitHub** y el desarrollo
en local con Copilot.

**Keywords:** Domino, Domino Data Lab, Git-based Project, DFS Project, Job, Workspace,
Compute Environment, hardware tier, GPU, Dataset, snapshot, artifact, `/mnt/code`,
`/mnt/artifacts`, Personal Access Token, PAT, Service Account, python-domino, Flows,
Flyte, Launcher, Domino Endpoint, Model API, inferencia síncrona y asíncrona,
batch scoring, `.modelignore`, MCP server, `domino_server`, vibe modeling,
coding assistant, `dom connect`, Remote-SSH, extensión de VS Code,
`domino_job.py`, `domino_mcp_setup.py`, apagar máquinas, coste, `centsPerMinute`.

> **Versión de referencia:** Domino Public API **6.4.0**, Domino Cloud / 6.3.
> Todo el API de esta skill está verificado contra el OpenAPI oficial
> (`https://docs.domino.ai/api-specs/cloud/public-api.json`). No inventes endpoints.

## ⛔ Regla innegociable: no dejar máquinas encendidas

**Al terminar cualquier trabajo en Domino hay que verificar que no queda nada
consumiendo cómputo.** No es opcional ni se delega al usuario: forma parte de dar
el trabajo por terminado.

```bash
python scripts/domino_job.py apagado      # recorre todos tus proyectos
```

Devuelve código de salida **1** si encuentra algo vivo, así que encadena en
cualquier script. Comprueba Jobs sin terminar y Workspaces abiertos.

| Recurso | ¿Se apaga solo? | Riesgo |
|---|---|---|
| **Job** | **Sí**, al acabar el comando | Bajo. Solo queda colgado si el script no termina |
| **Workspace** | **No** | **Alto.** Factura hasta que alguien pulsa *Stop* |
| **App publicada** | **No** | **Alto.** Factura de forma continua |
| **Endpoint / Model API** | **No** | **Alto.** Réplicas siempre levantadas |

> ⚠️ Cerrar la pestaña del navegador **no apaga un Workspace**. Hay que pulsar
> *Stop* explícitamente. Es la causa número uno de gasto inesperado.

Un Job que se queda en `Running` para siempre (bucle infinito, un `input()`, un
servidor que no termina) sigue facturando igual que un Workspace. Si `apagado`
detecta uno, hay que pararlo desde la interfaz.

Para saber qué se ha gastado:

```bash
python scripts/domino_job.py gasto --project-id <id>
```

Cruza la duración real de cada Job con el precio por minuto de su tier. Ojo: el
listado de Jobs **no trae el hardware tier**; hay que sacarlo de
`/v1/projects/{owner}/{project}/runs/{runId}`.

Buenas prácticas de coste, por orden de impacto:

1. **Usa Jobs, no Workspaces**, para todo lo que no requiera iterar en vivo.
2. **Ajusta `requirements.txt`**: el tiempo de instalación también se paga, y
   ocurre en cada ejecución.
3. **No pidas GPU si no la usas.** Un tier con T4 cuesta ~10 veces más que
   `n1-standard-4`.
4. **Sonda barata antes de trabajo caro**: un Job de un minuto que solo hace `ls`
   y comprueba versiones ahorra decenas de minutos de espera y gasto.

## El modelo mental en una frase

En un proyecto Git-based, **Domino no es tu repositorio: es tu máquina**. GitHub sigue
siendo la fuente de verdad del código; Domino aporta la GPU, el entorno reproducible y
la gobernanza. El código entra por `git pull`, no por `domino sync`.

```
┌────────────┐   git push    ┌────────────┐   Job apunta a    ┌─────────────┐
│  Local     │ ────────────> │  GitHub    │ <──── rama/commit │   Domino    │
│  Copilot   │               │  (verdad)  │                   │  (GPU/gob.) │
└────────────┘               └────────────┘                   └─────────────┘
       ▲                                                             │
       └───────────  logs en streaming / artefactos  ────────────────┘
```

## Los cuatro modos de trabajo

| Modo | Dónde editas | Dónde ejecutas | Cuándo usarlo |
|---|---|---|---|
| **A. MCP server** | Local, con tu asistente | Domino Job, lanzado por el asistente | **Por defecto.** Vibecoding real: describes, él escribe, ejecuta y te explica |
| **B. CLI + Job** | Local, con Copilot | Domino Job vía API | Cuando necesitas GPU concreta, commit fijo o logs en vivo |
| **C. SSH al Workspace** | Local (VS Code Remote-SSH) | Dentro del Workspace | Iterar en vivo con GPU, o datos que no salen |
| **D. Workspace en Domino** | Navegador, en Domino | Ahí mismo | Política que prohíbe sacar código o datos |

Los modos A y B se complementan y son los principales: **explora y depura con el MCP**,
y **lanza el run definitivo con el CLI** fijando commit y hardware tier.

### Modo A — el MCP server (lo que hace posible el vibecoding)

Domino publica un **MCP server oficial** (`dominodatalab/domino_mcp_server`) que da a tu
asistente 10 herramientas para lanzar Jobs, leer resultados y sincronizar ficheros sin
salir del chat.

```bash
python scripts/domino_mcp_setup.py install   # clona, instala e imprime la config
python scripts/domino_mcp_setup.py check     # valida credenciales y lista proyectos
python scripts/domino_mcp_setup.py rules --out .   # contexto en el proyecto de datos
```

Herramientas clave: `get_domino_environment_info` (llamarla al empezar),
`run_domino_job`, `check_domino_job_run_status`, `check_domino_job_run_results`.
Las de ficheros (`smart_sync_file` y compañía) **solo funcionan en proyectos DFS**.

> ⚠️ El MCP **no elige hardware tier ni fija commit**, y parte el comando por espacios.
> Para GPU o entregables reproducibles, usa el CLI. Detalle en `references/mcp-server.md`.

> ⚠️ No definas `DOMINO_API_HOST` en tu portátil: el MCP la lee como "estoy dentro de un
> Workspace" y llama a `http://localhost:8899`. Usa `DOMINO_HOST`.

Ver `references/mcp-server.md` y `references/remote-development.md`.

## Tipos de proyecto: elige Git-based

| | **Git-based** (recomendado) | **DFS** |
|---|---|---|
| Código vive en | GitHub | Domino File System |
| Directorio de trabajo | `/mnt/code` | `/mnt` |
| Artefactos | `/mnt/artifacts` (en DFS) | Junto al código |
| Datasets del proyecto | `/mnt/data/<nombre>` | `/domino/datasets/local/<nombre>` |
| Repos importados | `/mnt/imported/code/<repo>` | `/repos/<repo>` |
| Pull requests, ramas, CI | Sí, nativo de GitHub | No |

> ⚠️ **Regla crítica:** en un proyecto Git-based, cuando un Job termina Domino sincroniza
> **solo los artefactos** al DFS. **El código nunca se auto-commitea.** Si editas en un
> Workspace, tienes que hacer push tú. Esto es intencional.

> ⚠️ Domino **no soporta Git LFS**. Para repos privados hay que registrar credenciales
> Git (PAT de GitHub) en *Account settings* antes de crear el proyecto.

## Rutas y variables de entorno

Nunca hardcodees `/mnt`: usa `$DOMINO_WORKING_DIR`. Variables que Domino inyecta en
toda ejecución (las más útiles):

| Variable | Contenido |
|---|---|
| `DOMINO_WORKING_DIR` | Directorio de trabajo del proyecto |
| `DOMINO_ARTIFACTS_DIR` | Dónde escribir resultados (`/mnt/artifacts`) |
| `DOMINO_DATASETS_DIR` | Dónde se montan los Datasets |
| `DOMINO_IMPORTED_CODE_DIR` | Repos Git importados |
| `DOMINO_IS_GIT_BASED` | `true` si el proyecto es Git-based |
| `DOMINO_PROJECT_ID` / `DOMINO_PROJECT_NAME` / `DOMINO_PROJECT_OWNER` | Identidad del proyecto |
| `DOMINO_RUN_ID` / `DOMINO_RUN_NUMBER` | Identidad de la ejecución |
| `DOMINO_API_HOST` | URL de la API, para llamar a Domino desde dentro |
| `DOMINO_API_PROXY` | Proxy que inyecta el token solo: **forma preferida de autenticar dentro de un run** |
| `DOMINO_HARDWARE_TIER_ID` | Tier en el que corre |

Patrón portable en cualquier script de análisis:

```python
import os
from pathlib import Path

BASE = Path(os.environ.get("DOMINO_WORKING_DIR", "."))
SALIDA = Path(os.environ.get("DOMINO_ARTIFACTS_DIR", BASE / "outputs"))
SALIDA.mkdir(parents=True, exist_ok=True)   # todo lo entregable se escribe aquí
EN_DOMINO = "DOMINO_RUN_ID" in os.environ   # permite ejecutar igual en local
```

## Autenticación

| Método | Cuándo | Cabecera |
|---|---|---|
| **Personal Access Token (PAT)** | Tú, desde tu máquina | `Authorization: Bearer <token>` |
| **Service Account** | CI/CD, automatismos | `Authorization: Bearer <token>` |
| **API Proxy** | Desde dentro de un run de Domino | Ninguna: `$DOMINO_API_PROXY` la pone |
| ~~API key~~ | Legacy, **deprecada** desde 6.3. La sigue usando el MCP server oficial | `X-Domino-Api-Key: <key>` |

Crear un PAT: **Account > Account settings > Personal Access Token > Generate new Token**.
El valor se muestra **una sola vez**. Si un admin cambia tus roles, tus PAT se revocan
automáticamente y hay que regenerarlos.

```powershell
[Environment]::SetEnvironmentVariable("DOMINO_HOST", "https://tuempresa.domino.tech", "User")
[Environment]::SetEnvironmentVariable("DOMINO_TOKEN", "<tu-pat>", "User")
[Environment]::SetEnvironmentVariable("DOMINO_API_KEY", "<tu-api-key>", "User")  # la pide el MCP
```

> ⚠️ `DOMINO_HOST` en el portátil, **nunca `DOMINO_API_HOST`**: el MCP server la
> interpreta como "estoy dentro de un Workspace". El MCP además usa la **API key**
> (`X-Domino-Api-Key`), no el PAT, así que en local conviven las dos credenciales.

> Cada despliegue publica su propia documentación de API en `https://<tu-dominio>/docs`.

## Lanzar un Job desde local

El repositorio incluye `scripts/domino_job.py` (solo librería estándar):

```bash
python scripts/domino_job.py whoami                       # verificar conexión
python scripts/domino_job.py projects                     # obtener el projectId
python scripts/domino_job.py tiers --project-id 665f...   # ver tiers y precio/min

python scripts/domino_job.py run \
  --project-id 665f... \
  --command "python projects/media-mix/melia-2026/run_analysis.py" \
  --branch feature/mmm-2026 \
  --tier "GPU T4" \
  --follow                                                # logs en streaming

python scripts/domino_job.py apagado                      # OBLIGATORIO al terminar
python scripts/domino_job.py gasto --project-id 665f...   # qué ha costado
```

`--follow` devuelve código de salida 0 si el Job acaba en `Succeeded`, 1 en otro caso,
por lo que encadena bien en CI. Para ejecuciones **reproducibles** usa `--commit <sha>`
en vez de `--branch`.

### Las dos APIs de Jobs no usan los mismos nombres

Conviven dos rutas y **cada una tiene su esquema**. Mezclarlas es un clásico:

| | Public API `/api/jobs/v1/jobs` | Legacy `/v4/jobs/start` |
|---|---|---|
| Comando | `runCommand` | `commandToRun` |
| Tier | `hardwareTier` (nombre) | `hardwareTierId` (id) |
| Rama | `mainRepoGitRef.refType` | `mainRepoGitRef.type` |

Ambas responden en 6.2.2 (verificado). El CLI usa la Public API. Los valores del tipo
de referencia son `head`, `branches`, `tags` y `commitId`: **`branches` en plural**. Con
`branch` en singular el Job muere con `Unknown reference type`.

> ⚠️ En la legacy, si mandas `hardwareTier` en vez de `hardwareTierId` la API **acepta
> la petición sin protestar e ignora el valor**, y el Job corre en el tier por defecto.
> Se detecta comparando con el `hardwareTierId` que devuelve
> `GET /v1/projects/{owner}/{project}/runs/{runId}`.

**Truco para sondear esquemas sin gastar máquina:** manda el cuerpo incompleto a
propósito, omitiendo el comando. La validación de Play se queja de todos los campos a
la vez, te dice si el resto del payload es válido, y no arranca nada.

Equivalente en `curl`:

```bash
curl -X POST "$DOMINO_API_HOST/api/jobs/v1/jobs" \
  -H "Authorization: Bearer $DOMINO_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
        "projectId": "665f...",
        "runCommand": "python run_analysis.py",
        "hardwareTier": "GPU T4",
        "mainRepoGitRef": {"refType": "branches", "value": "main"}
      }'
```

El detalle completo de endpoints, esquemas y enums está en `references/api-reference.md`.

## Entornos de cómputo

Un **Compute Environment** es una imagen Docker gestionada por Domino. Para Meridian MMM
necesitas GPU y versiones muy concretas (TFP nightly), así que conviene un entorno propio
en vez del Domino Standard Environment.

- El `Dockerfile` del entorno debe versionarse en GitHub aunque Domino guarde su copia.
- Fija versiones exactas: un entorno que cambia rompe la reproducibilidad del MMM.
- Cada cambio crea una **revisión**; en el Job elige `ActiveRevision` (estable),
  `LatestRevision` o `SomeRevision(<id>)` para clavar una concreta.

## Dónde va cada cosa

| Contenido | Sitio correcto | Por qué |
|---|---|---|
| Código, `run_analysis.py`, configs | **GitHub** → `/mnt/code` | Versionado, PRs, revisable |
| Datos de entrada grandes | **Dataset** de Domino | Sin límite de tamaño, no se copia en cada run |
| Informes HTML/PDF, gráficos, `.binpb` | **Artifacts** → `/mnt/artifacts` | Se sincronizan solos al acabar el Job |
| Secretos y tokens | Variables de entorno del proyecto | Nunca en el repositorio |

Los Project files se copian a **cada** ejecución: máximo 10.000 ficheros y 8 GB por
fichero por defecto. Cualquier cosa voluminosa va a un Dataset, no al repo.

## Publicar un modelo como API

Un **Domino Endpoint** envuelve tu código de inferencia en una API HTTP. Domino empaqueta
el proyecto como aplicación Flask (o Plumber en R) y añade autenticación y balanceo.

El script se ejecuta **una sola vez al publicar**: lo que quede en memoria (un modelo
`.binpb` cargado, por ejemplo) se reutiliza en cada petición, así que la inicialización
cara ocurre una vez.

```bash
curl -X POST "$DOMINO_API_HOST/api/modelServing/v1/modelApis" \
  -H "Authorization: Bearer $DOMINO_TOKEN" -H "Content-Type: application/json" \
  -d '{"name": "mmm-escenarios", "description": "Escenarios de presupuesto",
       "environmentId": "665e...", "environmentVariables": [], "isAsync": false,
       "strictNodeAntiAffinity": false,
       "version": {"projectId": "665f...", "monitoringEnabled": true,
                   "logHttpRequestResponse": false, "shouldDeploy": true,
                   "source": {"type": "project", "file": "endpoints/predict.py",
                              "function": "evaluar_escenario"}}}'
```

Elige **síncrono** para predicción interactiva y **asíncrono** para cargas pesadas (límite
de 10 KB por payload, resultados por referencia, petición viva 30 minutos).

> ⚠️ El entorno de un endpoint **no** es el de un Job: los ficheros se montan en
> `/mnt/<username>/<project_name>`, no hereda las variables de entorno del proyecto y no
> lee `requirements.txt`. Detalle completo en `references/endpoints-deployment.md`.

Para un MMM, el entregable normal es un informe, no un endpoint. Publica una API solo si
el cliente necesita consultar escenarios de forma interactiva. Si hay que puntuar lotes
grandes, usa un **batch scoring Job**.

## Errores frecuentes

Ver `references/pitfalls.md` para la lista completa. Estos ocho están **verificados
ejecutándolos**, no deducidos de la documentación:

1. **Dejar una máquina encendida.** Ver la regla innegociable del principio.
2. **Esperar que Domino commitee tu código.** No lo hace en proyectos Git-based, ni
   devuelve los resultados a GitHub. Haz push tú.
3. **Escribir resultados en el directorio de trabajo.** `/mnt/code` es **efímero**: lo
   que quede ahí se pierde al apagarse la máquina. Solo sobrevive `/mnt/artifacts`.
   Si el script escribe en `outputs/`, cópialo al final:
   `cp -r outputs/. "${DOMINO_ARTIFACTS_DIR:-/mnt/artifacts}"/`
4. **Subir un `pip freeze` de Windows como `requirements.txt`.** Domino lo instala
   **solo, antes de ejecutar nada**. Un freeze arrastra `pywinpty` y tumba el Job en la
   fase de preparación, sin llegar al script.
5. **Confiar en que tu Python local es el de Domino.** Las f-strings anidadas con
   comillas del mismo tipo (`f"{d["k"]}"`) son legales desde 3.12 y `SyntaxError` en
   3.11. `ast.parse(feature_version=(3,11))` **no las detecta**. La única validación
   fiable es compilar con el intérprete real: `uv python install 3.11` y `py_compile`.
6. **Crear un `.sh` en Windows.** Nace con CRLF y no arranca en Linux. Hacen falta
   `.gitattributes` con `*.sh text eol=lf` **y** normalizar los bytes. Verifica con
   `git ls-files --eol`; `git cat-file blob | Out-String` miente porque PowerShell
   normaliza los finales de línea.
7. **Creer que fijar el commit basta para reproducir.** Cualquier análisis con muestreo
   (CausalImpact, MMM bayesiano) da cifras distintas en cada ejecución si no se fija la
   semilla de `numpy` y `tensorflow`. Comprobado: dos Jobs del mismo commit dieron
   +717 y +730, con p = 0,0011 y p = 0,0055.
8. **Meter los datos en el repo.** Rompe el límite de ficheros y ralentiza cada
   arranque. Usa Datasets.

## Referencias

| Fichero | Contenido |
|---|---|
| `references/mcp-server.md` | **El MCP server oficial**: 10 herramientas, instalación, límites |
| `references/verificado-6.2.md` | **Qué funciona de verdad en una 6.2.2**: diferencias con 6.4, tiers, entornos |
| `references/remote-development.md` | SSH, extensión de VS Code y asistentes en el Workspace |
| `references/api-reference.md` | Endpoints reales, esquemas, enums y ejemplos `curl` |
| `references/workflow-github.md` | El ciclo GitHub + Domino + Copilot, paso a paso |
| `references/endpoints-deployment.md` | Publicar modelos como API: sync/async, formatos, despliegue |
| `references/pitfalls.md` | Trampas, API inexistente y límites de la plataforma |

Documentación oficial: [docs.domino.ai](https://docs.domino.ai) ·
índice para agentes: [`llms.txt`](https://docs.domino.ai/llms.txt)
