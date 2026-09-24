// Extension: domino-expert
// Agente experto en Domino Data Lab para el flujo GitHub + Domino + Copilot.
// Inyecta el modelo mental de la plataforma y aporta herramientas de referencia
// rapida: workflow, API real verificada, despliegue de endpoints y trampas.

import { joinSession } from "@github/copilot-sdk/extension";

// --- Contexto base que se inyecta cuando la consulta trata de Domino ---
const DOMINO_SYSTEM_CONTEXT = `
## Experto en Domino Data Lab — contexto de plataforma

Domino Data Lab es la plataforma donde la empresa exige ejecutar los proyectos de
Data Science. El codigo sigue viviendo en **GitHub**; Domino aporta GPU, entorno
reproducible y gobernanza.

### Modelo mental
En un proyecto Git-based, **Domino no es el repositorio: es la maquina**. El codigo
entra por \`git pull\`, no por \`domino sync\`. GitHub es la fuente de verdad.

### Los cuatro modos de trabajo
- **A. MCP server** (por defecto): el asistente lanza Jobs y lee resultados desde el
  chat, via el MCP oficial \`dominodatalab/domino_mcp_server\`. Es el vibecoding real.
- **B. CLI + Job**: \`scripts/domino_job.py run --branch X --follow\`. Necesario cuando
  hace falta GPU concreta, commit fijo o logs en vivo.
- **C. SSH al Workspace**: \`dom connect\` + VS Code Remote-SSH. Tu IDE local contra el
  contenedor de Domino. Tambien hay extension oficial de VS Code.
- **D. Workspace en Domino**: navegador. Desde 6.3 trae Copilot, Claude Code y Codex
  preinstalados con Domino Skills.

Modos A y B se complementan: explora con el MCP, lanza el run final con el CLI.

### MCP server oficial — 10 herramientas
get_domino_environment_info (llamarla al empezar), run_domino_job,
check_domino_job_run_status, check_domino_job_run_results, open_web_browser,
list_domino_project_files, upload_file_to_domino_project,
download_file_from_domino_project, sync_local_file_to_domino, smart_sync_file.
Las cinco de ficheros **solo funcionan en proyectos DFS**.

Limites del MCP: **no elige hardware tier ni entorno**, **no fija rama ni commit**, y
parte el comando con .split() (los argumentos con espacios se rompen). Para GPU o
entregables reproducibles, usa el CLI.

El MCP direcciona por user_name + project_name (de la URL del proyecto), no por
projectId, y habla la API **legacy v1/v4**, no la Public API 6.4.0.

### Rutas de montaje (Git-based vs DFS)
| Contenido | Git-based | DFS |
|---|---|---|
| Directorio de trabajo | /mnt/code | /mnt |
| Artefactos | /mnt/artifacts | junto al codigo |
| Datasets del proyecto | /mnt/data/<nombre> | /domino/datasets/local/<nombre> |
| Repos importados | /mnt/imported/code/<repo> | /repos/<repo> |

Un **Domino Endpoint** monta en \`/mnt/<username>/<project_name>\`, distinto de todo
lo anterior. Nunca hardcodees /mnt: usa \$DOMINO_WORKING_DIR.

### Reglas criticas
1. En proyectos Git-based, Domino sincroniza **solo los artefactos** al terminar un Job.
   **El codigo nunca se auto-commitea**: hay que hacer push.
2. Los entregables se escriben en \$DOMINO_ARTIFACTS_DIR (/mnt/artifacts) o se pierden.
3. Los datos pesados van a un **Dataset**, no al repositorio (limite por defecto:
   10.000 ficheros por proyecto y 8 GB por fichero).
4. Para runs reproducibles se fija \`mainRepoGitRef\` con refType=commitId.
5. Domino **no soporta Git LFS**.

### Autenticacion
- Personal Access Token o Service Account: \`Authorization: Bearer <token>\`
- API key legacy (\`X-Domino-Api-Key\`): **deprecada** desde 6.3, pero es la que usa
  el MCP server oficial cuando corre en tu portatil
- Dentro de un run: API proxy via \$DOMINO_API_PROXY (preferido, sin secretos)
- Dentro de un Workspace, el MCP pide un token efimero a http://localhost:8899/access-token

**Colision critica**: en el portatil usa \`DOMINO_HOST\`, nunca \`DOMINO_API_HOST\`.
El MCP server interpreta la presencia de DOMINO_API_HOST como "estoy dentro de un
Workspace" y redirige a http://localhost:8899, que en local no existe.

### API real (OpenAPI "Domino Public API" 6.4.0) — no inventes endpoints
- Lanzar Job:   POST /api/jobs/v1/jobs
- Detalle Job:  GET  /api/jobs/beta/jobs/{jobId}
- Logs:         GET  /api/jobs/beta/jobs/{jobId}/logs?logType=&limit=&latestTimeNano=
- Listar Jobs:  GET  /api/jobs/beta/jobs?projectId=
- Proyectos:    GET  /api/projects/beta/projects
- Resolver ref: POST /api/projects/beta/projects/{projectId}/commits/resolveGitRef
- Tiers:        GET  /api/hardwaretiers/v1/hardwaretiers
- Entornos:     GET  /api/environments/beta/environments
- Usuario:      GET  /api/users/v1/self
- Endpoints:    POST /api/modelServing/v1/modelApis
Ojo: se lanza en jobs/v1 pero se consulta en jobs/beta. No es una errata.

### Herramientas locales del repositorio
\`scripts/domino_job.py\` (solo libreria estandar): whoami, projects, tiers, envs,
jobs, status, logs, run, resolve. Con --follow hace streaming de logs y devuelve
codigo de salida 0 solo si el Job acaba en Succeeded.
\`scripts/domino_mcp_setup.py\`: install, config, check, rules, tools. Instala y
configura el MCP server oficial y genera los ficheros de contexto del proyecto.

### Documentacion
docs.domino.ai · indice para agentes: https://docs.domino.ai/llms.txt
OpenAPI: https://docs.domino.ai/api-specs/cloud/public-api.json
Cada despliegue publica su propia doc en https://<tu-dominio>/docs
`;

const DOMINO_KEYWORDS = [
    "domino", "dominodatalab", "domino.ai", "hardware tier", "compute environment",
    "workspace", "git-based", "dfs project", "dominoignore", "dominoresults",
    "modelignore", "mnt/code", "mnt/artifacts", "run_command", "runcommand",
    "flyte", "flows", "launcher", "model api", "domino endpoint", "batch scoring",
    "service account", "personal access token", "pat", "dataset snapshot",
    "domino_server", "domino mcp", "mcp server", "vibe modeling", "dom connect",
    "remote-ssh", "coding assistant", "domino_project_settings",
];

// --- Contenido de las herramientas -----------------------------------------

const WORKFLOW_STEPS = {
    setup: `## Paso 1: Puesta en marcha (una vez por proyecto)

1. **Credencial de GitHub en Domino** — crea un PAT en GitHub (permiso de lectura del
   repo) y registralo en Domino: *Account > Account settings > Git credentials*.
   Los repos publicos no la necesitan.
2. **Crear el proyecto como Git-based** apuntando al repo de GitHub, y fijar la rama
   por defecto en *Project settings*.
3. **Token de Domino en tu maquina** — *Account > Account settings > Personal Access
   Token > Generate new Token*. El valor se muestra UNA sola vez.

\`\`\`powershell
[Environment]::SetEnvironmentVariable("DOMINO_API_HOST", "https://tuempresa.domino.tech", "User")
[Environment]::SetEnvironmentVariable("DOMINO_TOKEN", "<tu-pat>", "User")
\`\`\`

4. **Verificar y anotar el projectId**:
\`\`\`bash
python scripts/domino_job.py whoami
python scripts/domino_job.py projects
python scripts/domino_job.py tiers     # nombre exacto del tier con GPU
\`\`\``,

    mcp: `## Modo A: el MCP server oficial (vibecoding real)

Domino publica \`dominodatalab/domino_mcp_server\`: 10 herramientas que permiten a tu
asistente lanzar Jobs, leer resultados y sincronizar ficheros desde el chat.

\`\`\`bash
python scripts/domino_mcp_setup.py install         # clona, instala, imprime config
python scripts/domino_mcp_setup.py check           # valida y lista tus proyectos
python scripts/domino_mcp_setup.py rules --out .   # contexto en el proyecto de datos
\`\`\`

Credenciales (nombres exactos que lee el servidor):

\`\`\`powershell
[Environment]::SetEnvironmentVariable("DOMINO_MCP_DIR", "$env:USERPROFILE\\.domino\\domino_mcp_server", "User")
[Environment]::SetEnvironmentVariable("DOMINO_HOST", "https://tuempresa.domino.tech", "User")
[Environment]::SetEnvironmentVariable("DOMINO_API_KEY", "<tu-api-key>", "User")
\`\`\`

DOMINO_HOST **sin barra final**. Y **no definas DOMINO_API_HOST**.

El proyecto de datos necesita dos ficheros de contexto:
- \`.github/instructions/domino.instructions.md\` — las reglas (applyTo: '**')
- \`domino_project_settings.md\` — project_name, user_name y dfs

user_name es el **propietario** del proyecto en la URL
\`https://<host>/u/<user_name>/<project_name>/overview\`, que puede no ser tu usuario.

Despues, **reinicia el cliente**: los MCP se cargan al arrancar.

Limites: no elige tier ni entorno, no fija commit, y parte el comando por espacios.`,

    ssh: `## Modo C: SSH, tu IDE local contra el computo de Domino

Una vez conectado, la terminal de tu IDE corre **dentro del contenedor del Workspace**,
con su GPU y sus datasets montados.

Requisitos:
1. Entorno con \`openssh-server\` instalado en el Dockerfile.
2. Marcar **"Enable SSH access"** al lanzar el Workspace. Si no aparece la casilla, un
   admin debe activar \`com.cerebro.domino.workbench.workspace.ssh.enabled=true\`.
3. **Dom CLI** (distinto del Domino CLI). El enlace de descarga solo aparece dentro del
   panel Settings de un Workspace **ya en ejecucion**.
4. Extension **Remote - SSH** en VS Code.

\`\`\`bash
dom connect <workspace_id> --domino-api-host=https://<tu-dominio> -l ubuntu
\`\`\`

Añade \`Include ~/.domino/ssh/config\` a tu \`~/.ssh/config\` y abre
Remote Explorer > SSH. Usuario \`ubuntu\`, o \`domino\` en imagenes RHEL/UBI8.

Alternativa con UI: la **extension oficial de VS Code**
(\`DominoDataLab.domino-data-lab-vscode-extension\`) monta el tunel sola y ademas
permite lanzar Jobs **eligiendo hardware tier y entorno**, que es justo lo que el MCP
no puede hacer.

Coste: el Workspace consume cuota mientras esta encendido, no solo mientras entrena.`,

    ciclo: `## Modo B: el ciclo diario con el CLI

\`\`\`
1. Editas en local con Copilot
2. git commit + git push               -> GitHub es la fuente de verdad
3. domino_job.py run --branch X -f     -> se ejecuta en GPU, logs en tu terminal
4. Lees el log, corriges, vuelves a 1
5. Cuando sale bien: --commit <sha>    -> ejecucion reproducible
\`\`\`

\`\`\`bash
git add -A && git commit -m "feat: priors calibrados" && git push

python scripts/domino_job.py run \\
  --project-id 665f... \\
  --command "python projects/media-mix/melia-2026/run_analysis.py" \\
  --branch feature/mmm-2026 \\
  --tier "GPU T4" \\
  --title "MMM Melia 2026" \\
  --follow
\`\`\`

\`--follow\` devuelve 0 solo si el Job acaba en Succeeded, asi que encadena bien en CI
y permite a Copilot leer el fallo sin abrir la UI.`,

    script: `## Paso 3: Escribir el script para que corra en local y en Domino

\`\`\`python
import os
from pathlib import Path

EN_DOMINO = "DOMINO_RUN_ID" in os.environ

BASE   = Path(os.environ.get("DOMINO_WORKING_DIR", Path(__file__).parent))
DATOS  = Path(os.environ.get("DOMINO_DATASETS_DIR", BASE / "data"))
SALIDA = Path(os.environ.get("DOMINO_ARTIFACTS_DIR", BASE / "outputs"))
SALIDA.mkdir(parents=True, exist_ok=True)
\`\`\`

Reglas:
- Todo entregable se escribe en SALIDA (/mnt/artifacts) o se pierde al acabar el Job.
- Los datos pesados se leen de un Dataset, nunca del repositorio.
- Nada de rutas absolutas tipo C:\\Users\\...`,

    reproducible: `## Paso 4: Ejecucion reproducible (la que va al cliente)

\`\`\`bash
python scripts/domino_job.py resolve --project-id 665f... feature/mmm-2026
python scripts/domino_job.py run --project-id 665f... \\
  --command "python run_analysis.py" --commit <sha-devuelto> --tier "GPU T4" --follow
\`\`\`

Fija tambien la revision del entorno con \`--environment-revision ActiveRevision\` o
\`SomeRevision(<id>)\`. Asi el informe queda atado a un SHA de GitHub y a una imagen
concretas.`,

    resultados: `## Paso 5: Recuperar resultados

| Via | Cuando |
|---|---|
| Pestana **Artifacts** del proyecto | Consulta puntual desde el navegador |
| \`domino download-results\` (CLI) | Bajar los resultados de un run concreto |
| Pestana **Runs > Results** | Ver que genero cada ejecucion |

Controla que aparece con \`.dominoresults\` (patrones a incluir) y que se excluye del
versionado con \`.dominoignore\`. Si los runs generan mucho, activa
*Settings > Results > isolated results branches*.`,

    workspace: `## Modo D: trabajar dentro de un Workspace de Domino

Util cuando los datos no pueden salir de Domino. Desde 6.3 el Domino Standard
Environment trae agentes preinstalados:

| Agente | Extension VS Code | CLI |
|---|---|---|
| GitHub Copilot | preinstalada | - |
| Claude Code | preinstalada | disponible |
| Codex | preinstalada | disponible |

Cargan las **Domino Skills** (repo dominodatalab/domino-claude-plugin): jobs, datasets,
environments, workspaces, projects, flows, model-endpoints, experiment-tracking,
python-sdk... Optimizadas para Claude Code.

Activa la **persistencia del home** para conservar autenticacion e historial entre
reinicios.

Aviso: el codigo que escribas ahi **no se commitea solo**. Haz git push.`,

    flows: `## Flows (pipelines multi-etapa)

Domino Flows orquesta Jobs como tareas Flyte tipadas, con cache, subflows y pasos de
aprobacion humana.

Merece la pena cuando:
- el entrenamiento es caro y quieres cachear las etapas previas,
- necesitas reejecutar solo un tramo con otros parametros,
- el cliente exige trazabilidad etapa a etapa.

No merece la pena para un run_analysis.py de un solo golpe: ahi basta un Job.

Desde 6.3 se puede relanzar un Flow cambiando inputs, entorno, tier o referencia Git
sin editar su definicion (UI, API o CLI).`,

    endpoints: `## Publicar el modelo como API (Domino Endpoint)

Domino empaqueta el proyecto como app Flask y expone tu funcion por HTTP. El script se
ejecuta **una sola vez al publicar**: lo que quede en memoria se reutiliza.

\`\`\`bash
curl -X POST "$DOMINO_API_HOST/api/modelServing/v1/modelApis" \\
  -H "Authorization: Bearer $DOMINO_TOKEN" -H "Content-Type: application/json" \\
  -d '{"name": "mmm-escenarios", "description": "Escenarios de presupuesto",
       "environmentId": "665e...", "environmentVariables": [], "isAsync": false,
       "strictNodeAntiAffinity": false,
       "version": {"projectId": "665f...", "monitoringEnabled": true,
                   "logHttpRequestResponse": false, "shouldDeploy": true,
                   "source": {"type": "project", "file": "endpoints/predict.py",
                              "function": "evaluar_escenario"}}}'
\`\`\`

Sincrono para prediccion interactiva; asincrono para cargas pesadas (10 KB por payload,
por referencia, peticion viva 30 min).

Ojo: el entorno del endpoint monta en \`/mnt/<username>/<project_name>\`, no hereda las
variables del proyecto y no lee requirements.txt.`,
};

const API_TOPICS = {
    auth: `## Autenticacion

| Esquema | Cabecera | Uso |
|---|---|---|
| Personal Access Token | \`Authorization: Bearer <token>\` | Tu, desde tu maquina |
| Service Account | \`Authorization: Bearer <token>\` | CI/CD y automatismos |
| API key (legacy, deprecada) | \`X-Domino-Api-Key: <key>\` | Compatibilidad |
| API Proxy | ninguna | Dentro de un run: \$DOMINO_API_PROXY |

Crear un PAT por API (\`expiresIn\` en segundos):
\`\`\`bash
curl -X POST "$DOMINO_API_HOST/api/pat/v1/tokens" \\
  -H "Authorization: Bearer $DOMINO_TOKEN" -H "Content-Type: application/json" \\
  -d '{"name": "copilot-local", "expiresIn": 2592000}'
\`\`\`

Los PAT se revocan automaticamente si un admin cambia tus roles: un 401 repentino
suele ser eso.`,

    jobs: `## Lanzar un Job — POST /api/jobs/v1/jobs

| Campo | Notas |
|---|---|
| \`projectId\` * | ID del proyecto |
| \`runCommand\` * | p. ej. \`python run_analysis.py\` |
| \`title\` | Nombre del Job |
| \`hardwareTier\` | Por defecto el del proyecto |
| \`environmentId\` | Por defecto el del proyecto |
| \`environmentRevisionSpec\` | ActiveRevision \\| LatestRevision \\| SomeRevision(<id>) |
| \`commitId\` | **Solo DFS** |
| \`mainRepoGitRef\` | **Git-based**: {refType, value} |
| \`externalVolumeMountIds\`, \`netAppVolumeIds\` | Volumenes a montar |
| \`computeCluster\` | dask \\| mpi \\| ray \\| slurm \\| spark |
| \`snapshotDatasetsOnCompletion\` | Snapshot al acabar |

\`mainRepoGitRef.refType\`: \`head\` | \`commitId\` | \`tags\` | \`branches\`
(singular commitId, plurales tags y branches).

\`\`\`bash
curl -X POST "$DOMINO_API_HOST/api/jobs/v1/jobs" \\
  -H "Authorization: Bearer $DOMINO_TOKEN" -H "Content-Type: application/json" \\
  -d '{"projectId": "665f...", "runCommand": "python run_analysis.py",
       "hardwareTier": "GPU T4",
       "mainRepoGitRef": {"refType": "commitId", "value": "abc123..."}}'
\`\`\``,

    logs: `## Logs — GET /api/jobs/beta/jobs/{jobId}/logs

| Parametro | Notas |
|---|---|
| \`logType\` | stdOut \\| stdErr \\| prepareOutput \\| complete |
| \`limit\` | Maximo 10.000 lineas por llamada |
| \`latestTimeNano\` | Epoca en **nanosegundos** desde la que traer logs |

**Patron de streaming**: llama sin \`latestTimeNano\`, imprime
\`logs.logContent[].log\`, guarda \`metadata.pagination.latestTimeNano\` y reenvialo en
la siguiente llamada. Repite hasta que \`status.isCompleted\` sea true.
Implementado en scripts/domino_job.py (funcion seguir_logs).`,

    proyectos: `## Proyectos y Git

\`\`\`bash
GET    /api/projects/beta/projects                 # visibles
POST   /api/projects/beta/projects                 # crear
GET    /api/projects/v1/projects/{projectId}       # detalle

# Resolver rama/tag a SHA exacto (runs reproducibles)
POST   /api/projects/beta/projects/{projectId}/commits/resolveGitRef
       {"refType": "branches", "value": "main"}

GET    /api/projects/v1/projects/{projectId}/repositories      # repos importados
POST   /api/projects/v1/projects/{projectId}/shared-datasets   # enlazar Dataset
\`\`\``,

    recursos: `## Entornos, hardware y usuario

\`\`\`bash
GET  /api/environments/beta/environments                            # listar
POST /api/environments/beta/environments/{id}/revisions             # nueva revision
GET  /api/hardwaretiers/v1/hardwaretiers                            # incluye GPU
GET  /api/users/v1/self                                             # verificar token
\`\`\`

Un entorno que cambia rompe la reproducibilidad: para entregables usa
\`ActiveRevision\` o \`SomeRevision(<id>)\`, nunca \`LatestRevision\`.`,

    endpoints: `## Model APIs (Domino Endpoints)

\`\`\`bash
GET/POST       /api/modelServing/v1/modelApis                 # listar / crear
GET/PUT/DELETE /api/modelServing/v1/modelApis/{id}
GET/POST       /api/modelServing/v1/modelApis/{id}/versions
GET            /api/modelServing/v1/modelApis/{id}/versions/{vid}/buildLogs
GET            /api/modelServing/v1/modelApis/{id}/versions/{vid}/instanceLogs
GET/PUT        /api/modelServing/beta/modelApis/{id}/visibility
GET/POST       /api/modelServing/v1/modelDeployments
POST           /api/modelServing/v1/modelDeployments/{id}/start | /stop
\`\`\`

Obligatorios al crear: name, description, environmentId, environmentVariables,
isAsync, strictNodeAntiAffinity, version.
En version: projectId, monitoringEnabled, logHttpRequestResponse, source.
En source: type (project con file+function, o modelo registrado con
registeredModelName+registeredModelVersion).

Cuando no arranca: mira buildLogs y despues instanceLogs.`,

    cli: `## Domino CLI

\`\`\`bash
domino run [--direct][--wait][--no-sync][--tier T][--local][--title X] <fichero> [args]
domino create / init / get [user]/proyecto
domino restore          # reconecta una carpeta ya clonada con git a su proyecto Domino
domino sync / upload -m "msg" / download / download-results
domino upload-dataset [--fileUploadSetting Ignore|Overwrite|Rename] \\
       [--targetRelativePath P] <owner>/<proyecto>/<dataset> <carpeta>
domino create-snapshot <owner>/<proyecto>/<dataset>
\`\`\`

\`domino restore\` es la pieza pensada para "Git y Domino sobre la misma carpeta".
Si sync falla con "too many open files", crea un fichero vacio \`.noLock\` en la raiz.`,
};

const PITFALLS = {
    codigo: `### Codigo y versionado
- **Domino no commitea tu codigo** en proyectos Git-based: al acabar un Job solo
  sincroniza los **artefactos**. Haz git push tu.
- **No hay soporte de Git LFS.** Esos activos van a un Dataset.
- **Git no versiona directorios vacios**: usa .gitkeep si el script espera la carpeta.
- **\`commitId\` no sirve en Git-based** (es del DFS). Usa
  \`mainRepoGitRef: {"refType": "commitId", "value": "<sha>"}\`.
- Las ramas borradas en GitHub siguen apareciendo en el Workspace hasta que sincronizas.`,

    datos: `### Ficheros, datos y resultados
- Los Project files se copian a **cada** ejecucion: maximo **10.000 ficheros** y **8 GB**
  por fichero. Lo voluminoso va a un **Dataset**.
- Los Project files **no existen** en un cluster on-demand (Spark, Ray, Dask, MPI).
- Leer artefactos durante una ejecucion degrada el rendimiento: dispara sincronizaciones.
- **Escribir fuera de /mnt/artifacts pierde el resultado.**
- Rutas relativas desde un proyecto importado fallan: construye la ruta desde
  \`os.path.dirname(__file__)\`.
- \`dominostats.json\` se borra al inicio de cada run.`,

    rutas: `### Rutas
| Contenido | Git-based | DFS | Endpoint |
|---|---|---|---|
| Trabajo | /mnt/code | /mnt | /mnt/<username>/<project_name> |
| Artefactos | /mnt/artifacts | junto al codigo | - |
| Datasets | /mnt/data/<n> | /domino/datasets/local/<n> | - |
| Repos importados | /mnt/imported/code/<r> | /repos/<r> | - |

Nunca hardcodees /mnt: en un proyecto DFS importado pasa a ser
\`/mnt/<owner>/<proyecto>\`. Usa \$DOMINO_WORKING_DIR.`,

    auth: `### Autenticacion
- Las **API keys de usuario estan deprecadas** desde 6.3; usa PAT o Service Account.
- **\`DOMINO_TOKEN_FILE\` ya no existe** como variable de entorno.
- \`DOMINO_USER_API_KEY\` esta en retirada dentro de los runs: usa \$DOMINO_API_PROXY.
- **Los PAT se revocan solos si un admin cambia tus roles.**
- El valor del PAT se muestra **una sola vez**.
- El API proxy **no** funciona contra endpoints HTTPS externos.`,

    api: `### Errores de forma en el API
- PAT y Service Account usan \`Authorization: Bearer\`, **no** X-Domino-Api-Key.
- **\`latestTimeNano\` va en nanosegundos**: si lo conviertes mal, repites lineas o no
  recibes ninguna.
- Maximo **10.000 lineas de log** por llamada: hay que paginar.
- Se **lanza** en \`/api/jobs/v1/jobs\` pero se **consulta** en \`/api/jobs/beta/jobs\`.
  No es una errata de la documentacion.
- \`refType\`: \`commitId\` en singular, pero \`tags\` y \`branches\` en plural.`,

    entornos: `### Entornos de computo
- Un entorno que cambia **rompe la reproducibilidad**: para entregables usa
  \`ActiveRevision\` o \`SomeRevision(<id>)\`, no \`LatestRevision\`.
- En Meridian, TFP nightly frente a la estable provoca errores en tiempo de ejecucion:
  fija versiones exactas en el Dockerfile.
- **Sin GPU el MCMC puede tardar horas**: verifica el tier con \`domino_job.py tiers\`.`,

    endpoints: `### Domino Endpoints
- **El entorno de un endpoint no es el de un Job**: monta en
  \`/mnt/<username>/<project_name>\`, **no hereda** las variables del proyecto y **no lee
  requirements.txt** (todo va al Dockerfile).
- Paquetes obligatorios en Python: uWSGI, Flask, Six, prometheus-client (+ seldon-core
  si es asincrono). Faltan en la imagen minima.
- Corre con **uid/gid 12574**; ese usuario debe existir en la imagen.
- El build usa el **ultimo USER** del Dockerfile.
- **Arrancar/parar no actualiza el codigo**: hay que crear una version nueva.
- Asincrono: **10 KB** por payload, por referencia, peticion viva 30 min.
- Si la funcion recibe un diccionario, **solo** vale \`{"parameters": [{...}]}\`.
- El fichero de exclusion es **\`.modelignore\`**, no .dominoignore.
- En data plane remoto: sin asincrono ni monitorizacion integrada.
- Cuando no arranca: buildLogs y despues instanceLogs.`,

    mcp: `### MCP server y asistentes
- \`run_domino_job\` **no elige hardware tier ni entorno**: hereda los del proyecto.
  Para GPU, ponla como defecto del proyecto o usa \`domino_job.py --tier\`.
- **No fija rama ni commit**: ejecuta la referencia por defecto. El entregable
  reproducible se lanza con el CLI y \`--commit <sha>\`.
- El comando se parte con \`.split()\`: los argumentos entrecomillados con espacios se
  rompen en trozos.
- **No definas DOMINO_API_HOST en el portatil**: el MCP la lee como "estoy dentro de un
  Workspace" y llama a http://localhost:8899. Usa DOMINO_HOST.
- El MCP usa \`X-Domino-Api-Key\`, **deprecada desde 6.3**. Si tu instancia la tiene
  desactivada da 401 y hay que parchear \`_get_auth_headers()\` para usar Bearer.
- Habla la API **legacy v1/v4**, no la Public API 6.4.0: los runId de una no sirven en
  los endpoints de la otra.
- Las funciones de ficheros **solo valen en proyectos DFS**.
- **El asistente se olvida de commitear antes de lanzar el Job** y entonces ejecutas
  codigo viejo. Lo advierte el propio README oficial. Comprueba \`git status\`.
- El README del MCP dice que expone 2 funciones: expone **10**. Fiate del codigo.`,

    inexistente: `### Cosas que NO existen (no las inventes)
- No hay endpoint publico para "ejecutar un comando suelto en un Workspace existente".
  Para ejecutar algo desde fuera, lanza un **Job** (o entra por SSH).
- \`python-domino\` no tiene operacion de sync de ficheros: eso es del CLI.
- No asumas nombres de metodos de python-domino por plausibilidad: la API cambio entre
  1.x y 2.x (actual: 2.2.0).
- El **Dom CLI** (SSH) y el **Domino CLI** son herramientas distintas pese al nombre
  parecido: \`dom connect\` no existe en el Domino CLI, y \`domino run\` no existe en
  el Dom CLI.

Si existen, aunque parezca que no: desarrollo remoto por SSH contra un Workspace
(\`dom connect\` + Remote-SSH) y una extension oficial de Domino para VS Code.`,
};

function detectarTema(texto) {
    const t = (texto || "").toLowerCase();
    if (t.match(/endpoint|model api|inferencia|deploy|publicar|flask|prediccion|scoring/))
        return "endpoints";
    if (t.match(/token|auth|pat|credencial|service account|401|permiso/)) return "auth";
    if (t.match(/log|stdout|stderr|streaming|seguir/)) return "logs";
    if (t.match(/job|lanzar|ejecutar|run |runcommand|tier/)) return "jobs";
    if (t.match(/cli|domino sync|domino run|restore|upload/)) return "cli";
    if (t.match(/proyecto|repositor|git|rama|branch|commit/)) return "proyectos";
    if (t.match(/entorno|environment|docker|imagen|gpu/)) return "recursos";
    return null;
}

const session = await joinSession({
    tools: [
        {
            name: "domino_workflow_reference",
            description:
                "Devuelve el workflow real de trabajo con Domino Data Lab manteniendo el codigo en GitHub: puesta en marcha, ciclo diario, script portable, ejecucion reproducible, recuperar resultados, Workspaces y Flows. Usar al planificar como ejecutar un analisis en Domino o al montar un proyecto nuevo.",
            parameters: {
                type: "object",
                properties: {
                    step: {
                        type: "string",
                        description:
                            "Paso concreto: 'setup', 'mcp', 'ssh', 'ciclo', 'script', 'reproducible', 'resultados', 'workspace', 'flows', 'endpoints'. Omitir para el workflow completo.",
                    },
                },
            },
            skipPermission: true,
            handler: async (args) => {
                if (args.step && WORKFLOW_STEPS[args.step]) return WORKFLOW_STEPS[args.step];
                return Object.values(WORKFLOW_STEPS).join("\n\n---\n\n");
            },
        },

        {
            name: "domino_api_reference",
            description:
                "Devuelve los endpoints REALES del Domino Public API 6.4.0, verificados contra el OpenAPI oficial: lanzar Jobs, logs en streaming, proyectos y refs de Git, entornos, hardware tiers, Model APIs y el CLI. Usar SIEMPRE antes de escribir codigo contra la API de Domino para no inventar rutas ni parametros.",
            parameters: {
                type: "object",
                properties: {
                    topic: {
                        type: "string",
                        description:
                            "Tema: 'auth', 'jobs', 'logs', 'proyectos', 'recursos', 'endpoints', 'cli'. Omitir para la referencia completa.",
                    },
                },
            },
            skipPermission: true,
            handler: async (args) => {
                const cabecera =
                    "> API verificado contra el OpenAPI oficial *Domino Public API v6.4.0*\n" +
                    "> (https://docs.domino.ai/api-specs/cloud/public-api.json).\n" +
                    "> Si un endpoint no aparece aqui, compruebalo antes de usarlo.\n\n";
                if (args.topic && API_TOPICS[args.topic]) return cabecera + API_TOPICS[args.topic];
                return cabecera + Object.values(API_TOPICS).join("\n\n---\n\n");
            },
        },

        {
            name: "domino_pitfalls",
            description:
                "Devuelve las trampas, limites y API inexistente de Domino Data Lab. Consultar ANTES de escribir codigo o de dar por bueno un analisis ejecutado en Domino, para evitar perder resultados, romper la reproducibilidad o inventar API.",
            parameters: {
                type: "object",
                properties: {
                    topic: {
                        type: "string",
                        description:
                            "Tema: 'codigo', 'datos', 'rutas', 'auth', 'api', 'entornos', 'endpoints', 'mcp', 'inexistente'. Omitir para todas.",
                    },
                },
            },
            skipPermission: true,
            handler: async (args) => {
                if (args.topic && PITFALLS[args.topic]) return PITFALLS[args.topic];
                return "# Domino — trampas y limites\n\n" + Object.values(PITFALLS).join("\n\n");
            },
        },

        {
            name: "domino_job_command",
            description:
                "Construye el comando exacto de scripts/domino_job.py y el cuerpo JSON equivalente para lanzar un Job en Domino. Usar cuando haya que ejecutar un analisis en Domino desde local.",
            parameters: {
                type: "object",
                properties: {
                    project_id: { type: "string", description: "ID del proyecto Domino" },
                    command: {
                        type: "string",
                        description: 'Comando a ejecutar, ej: "python run_analysis.py"',
                    },
                    git_ref: {
                        type: "string",
                        description:
                            "Rama, tag o SHA a ejecutar. Un SHA de 40 caracteres se trata como commit.",
                    },
                    ref_type: {
                        type: "string",
                        description: "'branch' (defecto), 'tag' o 'commit'. Para entregables usa 'commit'.",
                    },
                    tier: { type: "string", description: 'Nombre del hardware tier, ej: "GPU T4"' },
                    title: { type: "string", description: "Titulo del Job" },
                },
                required: ["project_id", "command"],
            },
            skipPermission: true,
            handler: async (args) => {
                const { project_id, command, git_ref, tier, title } = args;
                let tipo = args.ref_type;
                if (!tipo && git_ref) {
                    tipo = /^[0-9a-f]{40}$/i.test(git_ref) ? "commit" : "branch";
                }
                const mapa = { branch: "branches", tag: "tags", commit: "commitId" };
                const flag = { branch: "--branch", tag: "--tag", commit: "--commit" };

                const partes = [
                    "python scripts/domino_job.py run",
                    `  --project-id ${project_id}`,
                    `  --command ${JSON.stringify(command)}`,
                ];
                if (git_ref) partes.push(`  ${flag[tipo]} ${git_ref}`);
                if (tier) partes.push(`  --tier ${JSON.stringify(tier)}`);
                if (title) partes.push(`  --title ${JSON.stringify(title)}`);
                partes.push("  --follow");

                const cuerpo = { projectId: project_id, runCommand: command };
                if (title) cuerpo.title = title;
                if (tier) cuerpo.hardwareTier = tier;
                if (git_ref) cuerpo.mainRepoGitRef = { refType: mapa[tipo], value: git_ref };

                const aviso =
                    tipo === "commit"
                        ? "Ejecucion reproducible: el commit queda fijado."
                        : "Para el run definitivo que va al cliente, fija el commit con --commit <sha> (obtenlo con `domino_job.py resolve`).";

                return `## Comando

\`\`\`bash
${partes.join(" \\\n")}
\`\`\`

${aviso}

## Equivalente por API — POST /api/jobs/v1/jobs

\`\`\`json
${JSON.stringify(cuerpo, null, 2)}
\`\`\`

Antes de lanzarlo, asegurate de haber hecho **git push**: Domino ejecuta lo que hay en
GitHub, no lo que tienes sin commitear en local.`;
            },
        },
    ],
});

// Inyecta el contexto de plataforma solo cuando la conversacion trata de Domino,
// para no gastar tokens en sesiones que no lo necesitan.
session.on?.("userMessage", async (evento) => {
    const texto = evento?.text || evento?.content || "";
    const lower = texto.toLowerCase();
    if (!DOMINO_KEYWORDS.some((k) => lower.includes(k))) return;
    const tema = detectarTema(lower);
    const extra = tema && API_TOPICS[tema] ? `\n\n### Referencia relevante\n${API_TOPICS[tema]}` : "";
    return { context: DOMINO_SYSTEM_CONTEXT + extra };
});

await session.log("🔷 Domino Expert activado — GitHub + Domino + Copilot", { ephemeral: true });
