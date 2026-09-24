# Domino Public API — referencia verificada

Todo lo de este documento está extraído del OpenAPI oficial
**Domino Public API v6.4.0** (`https://docs.domino.ai/api-specs/cloud/public-api.json`).
Si un endpoint no aparece aquí, **compruébalo antes de usarlo**: no lo inventes.

Cada despliegue publica además su propia documentación navegable en
`https://<tu-dominio-domino>/docs`.

---

## Autenticación

| Esquema | Cabecera | Uso |
|---|---|---|
| Personal Access Token | `Authorization: Bearer <token>` | Tú, desde tu máquina |
| Service Account token | `Authorization: Bearer <token>` | CI/CD y automatismos |
| API key (legacy, deprecada) | `X-Domino-Api-Key: <key>` | Compatibilidad |
| API Proxy | ninguna | Solo dentro de un run: `$DOMINO_API_PROXY` |

Crear un PAT por API (`expiresIn` en segundos):

```bash
curl -X POST "$DOMINO_API_HOST/api/pat/v1/tokens" \
  -H "Authorization: Bearer $DOMINO_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"name": "copilot-local", "description": "Lanzar jobs desde local", "expiresIn": 2592000}'
```

Endpoints relacionados: `GET /api/pat/v1/tokens`, `DELETE /api/pat/v1/tokens/{patId}`,
`POST /api/pat/v1/tokens/{patId}/invalidate`,
`GET /api/pat/v1/tokens/grantable-scopes`,
`GET /api/pat/v1/tokens/expiration-policy`.

---

## Jobs

### Lanzar un Job — `POST /api/jobs/v1/jobs`

Campos del cuerpo (`*` = obligatorio):

| Campo | Tipo | Descripción |
|---|---|---|
| `projectId` * | string | ID del proyecto |
| `runCommand` * | string | Comando a ejecutar, p. ej. `python run_analysis.py` |
| `title` | string | Nombre del Job |
| `hardwareTier` | string | Tier de hardware; por defecto el del proyecto |
| `environmentId` | string | Compute environment; por defecto el del proyecto |
| `environmentRevisionSpec` | string | `ActiveRevision` \| `LatestRevision` \| `SomeRevision(<id>)` |
| `commitId` | string | Commit del DFS. **Solo proyectos DFS** |
| `mainRepoGitRef` | objeto | Rama/tag/commit del repo principal. **Proyectos Git-based** |
| `externalVolumeMountIds` | array | Volúmenes externos a montar |
| `netAppVolumeIds` | array | Volúmenes NetApp a montar |
| `computeCluster` | objeto | Cluster on-demand (ver abajo) |
| `snapshotDatasetsOnCompletion` | bool | Snapshot de los Datasets al acabar |
| `capacityType` | string | Tipo de capacidad dentro del tier (p. ej. spot) |

**`mainRepoGitRef`** (esquema `GitRefV1`) — la pieza que une GitHub con Domino:

```jsonc
{ "refType": "head" | "commitId" | "tags" | "branches",
  "value": "nombre-de-rama-o-sha" }   // value no hace falta con refType=head
```

Ejemplo completo con GPU y commit fijado:

```bash
curl -X POST "$DOMINO_API_HOST/api/jobs/v1/jobs" \
  -H "Authorization: Bearer $DOMINO_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
        "projectId": "665f0a1b2c3d4e5f6a7b8c9d",
        "runCommand": "python projects/media-mix/melia-2026/run_analysis.py",
        "title": "MMM Melia 2026 - run reproducible",
        "hardwareTier": "GPU T4",
        "environmentRevisionSpec": "ActiveRevision",
        "mainRepoGitRef": {"refType": "commitId", "value": "abc123def456..."},
        "snapshotDatasetsOnCompletion": true
      }'
```

Respuesta: `{ "job": JobDetailsV1, "metadata": {...} }`. Guarda `job.id`.

### Cluster on-demand (opcional)

`computeCluster` (`ComputeClusterConfigV1`):

| Campo | Notas |
|---|---|
| `clusterType` * | `dask` \| `mpi` \| `ray` \| `slurm` \| `spark` |
| `computeEnvironmentId` * | Entorno de los nodos |
| `workerCount` * | Nº de workers (mínimo si hay autoescalado) |
| `workerHardwareTier` * | Tier de los workers |
| `maxWorkerCount` | Activa autoescalado |
| `masterHardwareTierId`, `workerStorageMB`, `computeEnvironmentRevisionSpec` | Opcionales |

> Los Project files **no** son accesibles desde un cluster on-demand. Copia lo necesario
> a un Dataset.

### Consultar Jobs

```bash
# Listar los Jobs de un proyecto
GET /api/jobs/beta/jobs?projectId=<id>&limit=20&statusFilter=all&sortBy=number&ascending=false

# Detalle de un Job
GET /api/jobs/beta/jobs/{jobId}
```

`JobStatusV1` devuelve `executionStatus` (p. ej. `Running`, `Succeeded`, `Failed`,
`Stopped`), `isCompleted`, `isArchived`, `isScheduled`.

`CommitDetailsV1` devuelve `inputCommitId` (commit al arrancar) y `outputCommitId`
(commit al terminar, vacío si el run no generó commits).

### Logs — `GET /api/jobs/beta/jobs/{jobId}/logs`

| Parámetro | Notas |
|---|---|
| `logType` | `stdOut` \| `stdErr` \| `prepareOutput` \| `complete` (insensible a mayúsculas) |
| `limit` | Máximo 10.000 líneas por llamada |
| `latestTimeNano` | Época en **nanosegundos** desde la que traer logs |

**Patrón de streaming:** llama sin `latestTimeNano`, imprime `logs.logContent[].log`,
guarda `metadata.pagination.latestTimeNano` y reenvíalo en la siguiente llamada. Así no
repites líneas. Repite hasta que `status.isCompleted` sea `true`.
Implementado en `scripts/domino_job.py` (función `seguir_logs`).

### Etiquetas y objetivos

`POST /api/jobs/v1/jobs/{jobId}/tags`, `DELETE /api/jobs/v1/jobs/{jobId}/tags/{tagId}`,
`POST /api/jobs/v1/goals`, `GET /api/jobs/v1/goals`.

---

## Proyectos

```bash
GET    /api/projects/beta/projects              # proyectos visibles
POST   /api/projects/beta/projects              # crear
POST   /api/projects/v2/projects                # crear (v2)
GET    /api/projects/v1/projects/{projectId}    # detalle
DELETE /api/projects/beta/projects/{projectId}  # archivar
```

Git y commits:

```bash
# Resolver una rama o tag a su SHA exacto (para runs reproducibles)
POST /api/projects/beta/projects/{projectId}/commits/resolveGitRef
     {"refType": "branches", "value": "main"}

# Igual, para un repositorio importado
POST /api/projects/beta/projects/{projectId}/repositories/{repositoryId}/commits/resolveGitRef

# Head del DFS (solo proyectos DFS)
GET  /api/projects/beta/projects/{projectId}/commits/latest
```

Repositorios importados y datos:

```bash
GET    /api/projects/v1/projects/{projectId}/repositories        # repos importados
POST   /api/projects/v1/projects/{projectId}/repositories        # importar uno
DELETE /api/projects/v1/projects/{projectId}/repositories/{repositoryId}
GET    /api/projects/v1/projects/{projectId}/shared-datasets
POST   /api/projects/v1/projects/{projectId}/shared-datasets     # enlazar Dataset
GET    /api/projects/v1/projects/{projectId}/files/{commitId}/{path}/content
GET    /api/projects/beta/projects/{projectId}/results-settings
```

---

## Entornos y hardware

```bash
GET  /api/environments/beta/environments                                  # listar
POST /api/environments/beta/environments                                  # crear
POST /api/environments/beta/environments/{environmentId}/revisions        # nueva revisión
POST /api/environments/v2/environments                                    # crear (v2)
GET  /api/environments/v1/environments/{environmentId}

GET  /api/hardwaretiers/v1/hardwaretiers                                  # incluye los de GPU
GET  /api/hardwaretiers/v1/hardwaretiers/{hardwareTierId}
```

---

## Usuarios

```bash
GET /api/users/v1/self        # verificar credenciales
GET /api/users/v1/users
GET /api/users/beta/credentials/{userId}   # credenciales Git asociadas
```

---

## Service Accounts (automatización)

```bash
GET  /api/serviceAccounts/v1/serviceAccounts
POST /api/serviceAccounts/v1/serviceAccounts
POST /api/serviceAccounts/v1/serviceAccounts/{id}/tokens
POST /api/serviceAccounts/v1/serviceAccounts/{id}/tokengitcredentials   # credencial Git (PAT GitHub)
POST /api/serviceAccounts/v1/serviceAccounts/{id}/sshgitcredentials
```

Los crea un administrador de Domino. Son la vía correcta para que un pipeline de CI
lance Jobs sin depender de la cuenta de una persona.

---

## Model APIs (Domino Endpoints)

Resumen aquí; detalle completo en `endpoints-deployment.md`.

```bash
GET/POST   /api/modelServing/v1/modelApis                 # listar / crear (createModelApi)
GET/PUT/DELETE /api/modelServing/v1/modelApis/{id}
GET/POST   /api/modelServing/v1/modelApis/{id}/versions   # versiones
GET        /api/modelServing/v1/modelApis/{id}/versions/{vid}/buildLogs
GET        /api/modelServing/v1/modelApis/{id}/versions/{vid}/instanceLogs
GET/PUT    /api/modelServing/beta/modelApis/{id}/visibility
GET/POST   /api/modelServing/beta/modelApis/{id}/collaborators
GET/POST   /api/modelServing/v1/modelDeployments          # ciclo de vida del despliegue
POST       /api/modelServing/v1/modelDeployments/{id}/start | /stop
```

Obligatorios en `POST /api/modelServing/v1/modelApis`: `name`, `description`,
`environmentId`, `environmentVariables`, `isAsync`, `strictNodeAntiAffinity`, `version`.
En `version`: `projectId`, `monitoringEnabled`, `logHttpRequestResponse`, `source`.
En `source`: `type` (código del proyecto con `file` + `function`, o modelo registrado con
`registeredModelName` + `registeredModelVersion`).

---

## Otras áreas del API

Existen, con muchos endpoints cada una: `api/governance/v1` (bundles y políticas),
`model-monitor/v2/api`, `api/model-services/v1` (trazas y evaluaciones de sistemas de IA),
`api/apps/v1` y `api/apps/beta` (Apps), `api/registeredmodels/v1|v2`,
`api/datasetrw/v1` y `remotefs/v1/*` (Datasets, snapshots y volúmenes),
`api/datasource/v1`, `api/cost/v1|v2`, `api/audittrail/v1`, `api/extensions/beta`.

Specs OpenAPI adicionales publicados: `flyte-native-api` y `flyte-extensions-api`
(para Flows), y `workspace-file-audit-trail-api`.

---

## python-domino

Librería oficial (`pip install dominodatalab`). Viene preinstalada en el Domino
Standard Environment. **Versión actual: 2.2.0.**

| Versión de Domino | python-domino mínima |
|---|---|
| 6.3.0 o superior | 2.1.0 |
| 6.2.0 o superior | 2.0.0 |
| 6.0.0 o superior | 1.4.8 |
| 5.11.0 o superior | 1.4.1 |

```python
from domino import Domino

d = Domino(
    project="mrojo/advanced_analytics_melia",  # ownerusername/projectname
    api_key=None,          # o DOMINO_USER_API_KEY
    host=None,             # o DOMINO_API_HOST
    domino_token_file=None,
    auth_token=None,
)
```

Orden en que resuelve la autenticación: `api_proxy` → `auth_token` →
`domino_token_file` → `api_key` → `DOMINO_API_PROXY` → `DOMINO_TOKEN_FILE` →
`DOMINO_USER_API_KEY`. **Dentro de un run de Domino, el API proxy es el método
preferido** (y el único que no requiere manejar secretos).

Variables que ajustan su comportamiento: `DOMINO_LOG_LEVEL`,
`DOMINO_VERIFY_CERTIFICATE`, `DOMINO_MAX_RETRIES` (4 por defecto),
`MLFLOW_TRACKING_URI` (necesaria para `domino.agents`).

> El proxy **no** funciona contra endpoints HTTPS externos: está pensado para usarse
> desde dentro de las ejecuciones de Domino.

Para lanzar Jobs desde tu máquina, `scripts/domino_job.py` evita la dependencia y habla
directamente con el API REST.

---

## Domino CLI

Complementa al API; es la vía cómoda para mover ficheros y Datasets.

```bash
domino run [--direct] [--wait] [--no-sync] [--tier T] [--local] [--title X] <fichero> [args…]
domino create [nombre] / domino init [nombre] / domino get [user]/proyecto
domino restore          # reconecta una carpeta ya clonada con git a su proyecto Domino
domino sync / upload -m "msg" / download
domino upload-dataset [--fileUploadSetting Ignore|Overwrite|Rename] [--targetRelativePath P] \
       <owner>/<proyecto>/<dataset> <carpeta>
domino create-snapshot <owner>/<proyecto>/<dataset>
domino create-dataset-from-snapshot <owner>/<proyecto>/<dataset> <n> <nuevo-nombre>
domino download-results
```

`domino restore` es la pieza pensada exactamente para "Git y Domino sobre la misma
carpeta": `git clone` y después `domino restore` para reconectar.

Ajuste de subidas grandes: `DOMINO_UPLOAD_CHUNK_BYTES` (3 MB por defecto) y
`DOMINO_UPLOAD_THREADS` (8).

> Si `sync` falla con *"too many open files"*, crea un fichero vacío `.noLock` en la
> raíz del proyecto.
