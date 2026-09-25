# Verificado contra una instancia real (Domino 6.2.2)

Todo lo de este fichero está **comprobado ejecutándolo** contra
`https://datascience.choreograph.com` (WPP / Choreograph), Domino **6.2.2**, el
2026-09-24, autenticando con API key.

Importa porque el resto de la documentación de esta skill se escribió contra el OpenAPI
de la **6.4.0**, y **hay diferencias que rompen llamadas**.

---

## Lo que se confirmó

| Cosa | Resultado |
|---|---|
| API key con `X-Domino-Api-Key` | ✅ Activa. 6.2 es anterior a la deprecación de 6.3 |
| API key como `Authorization: Bearer` | ❌ 403 `No current user in request` |
| `GET /api/users/v1/self` | ✅ 200 — **envuelve en `{"user": {...}}`** |
| `GET /v4/users/self` | ✅ 200 — campos en la raíz, sin envolver |
| `POST /api/jobs/v1/jobs` | ✅ Existe. Pide `projectId` + `runCommand` |
| `POST /v4/jobs/start` | ✅ Existe. Pide `projectId` + `commandToRun` |
| `GET /api/jobs/beta/jobs?projectId=` | ✅ Listado |
| Lanzar Job + logs + estado `Succeeded` | ✅ **Probado de extremo a extremo** |
| Endpoints legacy del MCP (`/v1/.../runs`) | ✅ Responden |

Un Job lanzado con `domino_job.py run ... --follow` completó correctamente, con logs en
streaming y `Succeeded`. El flujo local → Domino funciona.

---

## Diferencias 6.2 vs 6.4 que rompen cosas

### 1. `relationship=All` no existe en 6.2

```
GET /v4/gateway/projects?relationship=Owned          -> 200
GET /v4/gateway/projects?relationship=Collaborating  -> 200
GET /v4/gateway/projects?relationship=All            -> 500 "No value found for 'All'"
```

También fallan `Shared`, `Public`, `AllOwned` y `Everything`. **Solo hay dos valores
válidos**: `Owned` y `Collaborating`.

**Afecta al MCP server oficial.** Su `_get_project_id()` prueba `Owned` y, si no
encuentra el proyecto, reintenta con `All`; en 6.2 ese reintento da 500, que queda
atrapado por su `except requests.exceptions.RequestException` y la función devuelve
`None`.

Consecuencia práctica: **las herramientas de ficheros del MCP no encuentran proyectos de
los que no seas propietario.** No rompe `run_domino_job`, que direcciona por
`user_name`/`project_name` y no necesita el `projectId`.

### 2. `/api/hardwaretiers/v1/hardwaretiers` da 403

Es un endpoint de administración. Un usuario normal recibe 403 con **cuerpo binario**
(no JSON), lo que confunde al depurar.

Usa el scope de proyecto, que además solo lista los tiers que tienes permitidos:

```
GET /v4/projects/{projectId}/hardwareTiers    -> 200
```

Devuelve una **lista pelada**, no un objeto con clave. Cada elemento envuelve en
`hardwareTier`, y los recursos van anidados:

```
hardwareTier.hwtResources.cores          -> 1.8
hardwareTier.hwtResources.memory.value   -> 18
hardwareTier.hwtResources.memory.unit    -> "GiB"
hardwareTier.gpuConfiguration.numberOfGpus -> 1
hardwareTier.centsPerMinute              -> 1.06
```

`centsPerMinute` es oro: permite estimar el coste antes de lanzar.

### 3. `resolveGitRef` no existe en 6.2

```
POST /api/projects/beta/projects/{id}/commits/resolveGitRef -> 404
```

Es una ruta de 6.4. En 6.2 **no puedes resolver una rama a SHA por API**; saca el SHA
con `git rev-parse origin/<rama>` en local y pásalo a `--commit`.

### 4. Datasets: la ruta buena es la del Public API

```
GET /api/datasetrw/v1/datasets?projectId={id}   -> 200  {"datasets": [...]}
```

Todas estas dan 404: `/v4/datasetrw/datasets`, `/v4/datasets`,
`/v4/projects/{id}/datasets`, `/api/datasets/v1/datasets`.

### 5. La instancia no publica su OpenAPI

`/public-api.json` y `/swagger.json` dan 403; `/api/openapi.json` y `/v4/api-docs` dan
404. No puedes descargar el spec exacto de la instancia: hay que sondear.

---

## El MCP oficial no arranca si lo instalas con pip

**Este fallo no depende de la versión de Domino, y explica por qué "a ellos les
funciona" y a ti no.**

El `pyproject.toml` del repositorio oficial declara:

```toml
dependencies = ["mcp[cli]>=1.6.0", ...]
```

Ese rango no tiene techo. Lo que ocurre depende del instalador:

| Instalador | Resuelve | Resultado |
|---|---|---|
| `uv pip install -e .` / `uv run` | **mcp 1.6.0** (del `uv.lock` del repo) | funciona |
| `pip install -e .` | **mcp 2.x** (ignora el `uv.lock`) | **revienta** |

El repositorio incluye un `uv.lock`, y `uv` lo respeta. `pip` no lo mira siquiera, así
que resuelve al máximo disponible. En la serie 2 la clase `FastMCP` pasó a llamarse
`MCPServer` y cambió de módulo, de modo que el servidor muere nada más importarse:

```
ModuleNotFoundError: No module named 'mcp.server.fastmcp'.
This is mcp 2.x, where FastMCP was renamed to MCPServer
```

Por eso la documentación oficial, que da por hecho `uv`, nunca menciona el problema:
solo aparece si tiras de `pip`, que es justo el camino al que caes si no tienes `uv`.

Lo peor es **cómo se manifiesta**: el cliente MCP lanza el proceso, el proceso muere
al instante y lo único que ves es un servidor marcado como caído, sin explicación.
Es muy fácil culpar a las credenciales o a la red.

Solución en la vía `pip`, ya aplicada por `scripts/domino_mcp_setup.py install`:

```bash
pip install "mcp[cli]<2"
```

El instalador además **comprueba el arranque** (importa `FastMCP`) y avisa en el acto
si el SDK no es compatible, en vez de dejar que lo descubras en tu cliente.

---

## El MCP, probado en vivo

Contra la instancia real, por las dos vías (`uv run` y el python del venv), el
servidor:

- Completa el `initialize` y se identifica como `domino_server`.
- Expone **10 herramientas**, no las 2 que anuncia su README:
  `run_domino_job`, `check_domino_job_run_status`, `check_domino_job_run_results`,
  `get_domino_environment_info`, `list_domino_project_files`,
  `upload_file_to_domino_project`, `download_file_from_domino_project`,
  `sync_local_file_to_domino`, `smart_sync_file`, `open_web_browser`.
- `get_domino_environment_info` devuelve `auth_mode: api_key` e
  `inside_domino_workspace: false` (correcto, se ejecuta en el portátil).
- `list_domino_project_files` lista de verdad los ficheros del proyecto.

### Aviso para quien sondee el servidor a mano

Si lanzas el servidor con `subprocess.run(..., input=...)`, stdin se cierra en cuanto
termina de escribirse. El servidor interpreta el EOF como cierre de sesión y **cancela
las tareas `async` en vuelo**: las herramientas rápidas responden y las que hacen una
llamada HTTP parecen colgarse. No es un fallo del servidor. Usa `Popen`, mantén stdin
abierto y lee stdout en un hilo aparte.

---

## Regla general que se deduce

**No asumas que una ruta del Public API existe porque está en el OpenAPI de 6.4.**
Antes de escribir código contra un endpoint nuevo, sondéalo:

```bash
python scripts/domino_job.py whoami     # ¿autentica?
```

Y recuerda que **un 404 de `GET` no significa que la ruta no exista**: puede aceptar
solo `POST`. `GET /api/jobs/v1/jobs` da 404 y `POST /api/jobs/v1/jobs` funciona.
Sondea con el método correcto antes de concluir nada.

---

## Hardware tiers disponibles en esta instancia

| ID | GPU | Cores | Memoria | Cent/min |
|---|---|---|---|---|
| `n1-standard-4` | 0 | 1.9 | 8 GiB | 0.21 |
| `medium-k8s` (Medium) | 0 | 4 | 15 GiB | 0.868 |
| `large-k8s` (Large) | 0 | 6 | 27 GiB | 0.868 |
| `n1-standard-8` | 0 | 6 | 22 GiB | 0.697 |
| `odyssey-optimiser-v2` | 0 | 6 | 22 GiB | 0.697 |
| `n1-standard-16` | 0 | 14 | 46 GiB | 1.395 |
| `n1-highmem-16` | 0 | 14 | 90 GiB | 1.736 |
| `n1-standard-32` | 0 | 30 | 100 GiB | 2.789 |
| **`n1-highmem4-gpu-t4`** | **1 × T4** | 1.8 | 18 GiB | 1.06 |
| **`n1-highmem16-gpu-t4`** | **1 × T4** | 12 | 88 GiB | 2.40 |
| **`gpu-k8s` (GPU)** | **1** | 6 | 43 GiB | 3.535 |

Para **Meridian MMM**, que hace muestreo MCMC en TensorFlow Probability, el tier
razonable es **`n1-highmem16-gpu-t4`**: 1 GPU T4 con 88 GiB de RAM, al doble de precio
que el T4 pequeño pero con memoria suficiente para datasets de varios años y decenas de
geos. `n1-highmem4-gpu-t4` se queda corto de RAM en cuanto crecen las cadenas.

## Entornos disponibles

- `Custom Environment: py3.11 - r4.4 - Domino 6.0` — `6ab2a7f8e346e41005aed735`
- `Domino Standard Environment Py3.10 R4.5` — `6a22dee9b0286d34d0241665`
- `Domino Core Environment` — `6a22dee9b0286d34d0241673`
- `Domino vLLM Environment` — `6a22dee9b0286d34d0241676`
- Entornos de Spark 6.1 y 6.2

Meridian exige **Python ≥ 3.11**, así que el único entorno base válido de los
preinstalados es el `Custom Environment: py3.11`. El Standard va con 3.10. Si ese custom
no trae las dependencias de Meridian, hay que crear un entorno propio partiendo de él.

---

# Ejecutar un proyecto real de principio a fin

Todo lo de esta secci?n est? verificado ejecut?ndolo contra la instancia de
WPP, lanzando un an?lisis CausalImpact real del repositorio
`WPPOpen/advanced_analytics_melia` sobre un proyecto Git-based.

## Crear un proyecto Git-based por API

`POST /v4/projects`. El esquema no est? documentado; se dedujo iterando sobre los
errores de validaci?n de Play. Campos obligatorios:

```json
{
  "name": "advanced_analytics_melia",
  "description": "...",
  "visibility": "Private",
  "ownerId": "<userId>",
  "tags": {"tagNames": []},
  "collaborators": [],
  "billingTag": {"tag": "Non_client_c9h", "tagId": "67a0f8e32c9f015989e854b8"},
  "mainRepository": {
    "uri": "https://github.com/WPPOpen/advanced_analytics_melia.git",
    "credentialId": "<id de la credencial git>",
    "name": "origin",
    "serviceProvider": "github",
    "defaultRef": {"type": "head"}
  }
}
```

Dos trampas: `tags` y `billingTag` son **objetos**, no cadenas ni listas; y
`collaborators` es obligatorio aunque vaya vac?o. El error
`error.expected.jsobject` apuntando a `billingTag` fue la pista que lo resolvi?.

El tipo de proyecto (Git-based o DFS) es **inmutable**. Para el flujo de trabajo
con GitHub hay que elegir Git-based desde el principio.

## Lanzar un Job sobre una rama concreta

`POST /v4/jobs/start`:

```json
{
  "projectId": "...",
  "commandToRun": "bash scripts/run_domino.sh <script.py> <config.json>",
  "title": "...",
  "hardwareTier": "n1-standard-8",
  "environmentId": "6ab2a7f8e346e41005aed735",
  "mainRepoGitRef": {"type": "branches", "value": "domino-pilot"}
}
```

**El tipo de referencia es `"branches"`, en plural.** Con `"branch"` el Job muere
con `IllegalStateException: Unknown reference type` en `GitRepositoryDTO.scala`.
Los valores v?lidos son `head`, `branches`, `tags` y `commitId`. En las respuestas
de la API el mismo campo se llama `refType`, lo que despista.

Para sondear valores sin gastar m?quina: **omitir `commandToRun` a prop?sito**. La
validaci?n se queja de los dos campos a la vez, revela si el candidato es v?lido y
no arranca nada.

## Domino instala `requirements.txt` solo

Antes de ejecutar el comando, en la fase `### SETUP PROCESS ###`, Domino busca un
`requirements.txt` en la ra?z del repositorio y lo instala. Si la instalaci?n
falla, el Job muere sin llegar al script.

Consecuencia: **`requirements.txt` no puede ser un `pip freeze` de Windows**. Un
freeze arrastra `pywinpty`, que no existe en Linux, y revienta el arranque. La
convenci?n adoptada es dejar `requirements.txt` como lista portable y fijada, y
guardar el freeze local como `requirements-local-windows.txt`.

Corolario: el script de arranque no debe instalar nada.

## Los resultados se pierden si no se copian a `/mnt/artifacts`

Este es el punto menos evidente de todos.

- La ra?z del repositorio dentro del Job es **`/mnt/code`**, y es **ef?mera**.
- Al terminar el Job, Domino sincroniza **`/mnt/artifacts`**, no `/mnt/code`.
- Domino **no** hace push de los resultados a la rama de GitHub. Verificado: tras
  una ejecuci?n correcta la rama remota segu?a en el mismo commit.

Si el script escribe en `outputs/` relativo al repositorio, esos ficheros no
aparecen en ning?n sitio al acabar. En el log se distingue perfectamente:

| | Sin copiar | Copiando a artifacts |
|---|---|---|
| `Changes to upload` | `+ 0 added, x 2 modified` | `+ 17 added, x 2 modified` |
| Tama?o subido | 7,2 K | 5,7 M |

La soluci?n es copiar al final del script de arranque:

```bash
DIR_ARTEFACTOS="${DOMINO_ARTIFACTS_DIR:-/mnt/artifacts}"
if [[ -d "$DIR_ARTEFACTOS" && -d outputs ]]; then
    cp -r outputs/. "$DIR_ARTEFACTOS"/
fi
```

Las tres zonas que hay dentro de un Job:

| Ruta | Qu? es | ?Sobrevive? |
|---|---|---|
| `/mnt/code` | el repositorio clonado | No |
| `/mnt/artifacts` | resultados del Job | S?, descargables |
| `/mnt/data/<proyecto>` | dataset del proyecto | S?, entre ejecuciones |

## La trampa de "en mi port?til funciona": PEP 701

Un `SyntaxError` apareci? en Domino con c?digo que corr?a bien en local. La causa:
las f-strings anidadas con comillas del mismo tipo, `f"{datos["clave"]}"`, son
legales desde **Python 3.12** pero error de sintaxis en 3.11. El port?til ten?a
3.12.10 y el entorno de Domino 3.11.16.

**`ast.parse(..., feature_version=(3,11))` no lo detecta.** Comprobado. La ?nica
forma fiable de validar antes de gastar ocho minutos de Job es compilar con el
int?rprete real de la versi?n de destino:

```bash
uv python install 3.11
```

y luego `py_compile.compile(fichero, cfile=tempfile.mktemp(), doraise=True)` con
ese int?rprete sobre todos los `.py` del repositorio. Tarda segundos.

## Finales de l?nea: un `.sh` con CRLF no arranca en Linux

Cualquier script de shell creado desde Windows nace con CRLF y falla de forma
incomprensible dentro del Job. Dos medidas, las dos necesarias:

1. `.gitattributes` con `*.sh text eol=lf`
2. normalizar los bytes al crear el fichero

Para verificar, **`git ls-files --eol`** es fiable (debe decir `w/lf`).
`git cat-file blob | Out-String` **miente**: PowerShell normaliza los finales de
l?nea y reporta CRLF que no existen. `bash -n script.sh` valida la sintaxis en
local, porque Git para Windows trae bash.

## Recuperar los resultados por API

Dos pasos: listar y descargar por blob.

**Listar** con `GET /v4/files/browseFiles`, parametros `ownerUsername`,
`projectName` y `filePath`. Con `projectId` y `path` devuelve 400. Acepta
`commitId` pero **lo ignora**.

Lo que se copio a `/mnt/artifacts` aparece colgando de la **raiz** del area de
ficheros del proyecto, no bajo `/outputs`. Si el script escribio en
`outputs/charts/` y el arranque hizo `cp -r outputs/. /mnt/artifacts/`, los
graficos se listan en `/charts`.

**Trampa importante**: `filePath=/` devuelve solo 2 ficheros y **no lista los
directorios**. Hay que pedir cada carpeta por su nombre. Quien se fie del
listado de la raiz concluira, erroneamente, que no se guardo nada.

**Descargar**: cada entrada trae un campo `key`, el hash del blob.

```
GET /v1/projects/{ownerUsername}/{projectName}/blobs/{key}
```

devuelve el contenido en bruto. Es el unico de los candidatos probados que
funciona: `/v4/blobs/{key}`, `/files/...` y `/raw/...` dan 404.

## El hardware tier se pide con `hardwareTierId`

En `POST /v4/jobs/start` el campo correcto es **`hardwareTierId`**. Con
`hardwareTier` la API acepta la peticion sin protestar pero **ignora el valor** y
usa el tier por defecto del proyecto. Se detecta comparando lo enviado con el
`hardwareTierId` que devuelve `GET /v1/projects/{owner}/{project}/runs/{runId}`.

## Un Job no es reproducible por defecto

Fijar el commit no basta. Con CausalImpact, que ajusta por muestreo bayesiano,
dos Jobs del **mismo commit y los mismos datos** dieron +717 y +730 sesiones de
efecto medio, con p = 0,0011 y p = 0,0055. La conclusion aguantaba, pero las
cifras de un entregable de cliente no pueden bailar entre ejecuciones.

Hay que fijar la semilla de `numpy` y de `tensorflow` al principio del script, y
dejarla configurable por variable de entorno para poder comprobar aparte que el
resultado es estable ante distintas semillas.

## Orden de trabajo que funciona

1. Escribir y probar en local con Copilot.
2. **Commit y push a GitHub.** Sin esto Domino no ve nada nuevo: clona del
   repositorio remoto, no del port?til.
3. Lanzar el Job apuntando a la rama.
4. Seguir los logs y recoger los resultados de los artefactos.

El paso 2 no es opcional y es el error m?s habitual al empezar.

## Coste

Domino cobra por **minuto de m?quina encendida**, seg?n el hardware tier. No cobra
por el asistente de IA. El tiempo de instalaci?n de dependencias tambi?n se paga,
as? que un `requirements.txt` ajustado ahorra dinero en cada ejecuci?n.
