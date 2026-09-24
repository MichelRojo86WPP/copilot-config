# Domino — trampas, límites y API inexistente

Consulta esta lista **antes** de escribir código contra Domino.

---

## 1. Código y versionado

**Domino no commitea tu código en proyectos Git-based.**
Al terminar un Job, Domino sincroniza **solo los artefactos** al DFS. El código nunca se
auto-commitea: es intencional y sostiene el modelo código / datos / artefactos. Si
editas en un Workspace, haz `git push` tú.

**No hay soporte de Git LFS.** Si tu repo usa LFS, esos ficheros no llegarán bien.
Mueve esos activos a un Dataset.

**Git no versiona directorios vacíos.** Una carpeta sin ficheros desaparece del repo;
usa `.gitkeep` si el script espera que exista.

**`commitId` no sirve en proyectos Git-based.** Ese campo de `POST /api/jobs/v1/jobs`
aplica al DFS. Para fijar un commit de GitHub usa
`mainRepoGitRef: {"refType": "commitId", "value": "<sha>"}`.

**Las ramas borradas en GitHub siguen apareciendo** en el menú del Workspace hasta que
sincronizas o haces pull.

---

## 2. Ficheros, datos y resultados

**Los Project files se copian a cada ejecución.** Límites por defecto: **10.000
ficheros** por proyecto y **8 GB** por fichero. Además el tiempo de transferencia alarga
el arranque y la parada de Workspaces, Jobs, Apps y Launchers.
→ Cualquier cosa voluminosa va a un **Dataset**, que se monta como sistema de ficheros
en red y no transfiere nada al arrancar.

**Los Project files no existen en un cluster on-demand** (Spark, Ray, Dask, MPI).
Copia lo necesario al Dataset por defecto del proyecto.

**Leer artefactos durante una ejecución degrada el rendimiento**: muchos eventos
disparan una sincronización de ficheros del proyecto y la ejecución espera a que
termine. Usa Datasets.

**Escribir fuera de `/mnt/artifacts` pierde el resultado.** En proyectos Git-based los
entregables tienen que acabar ahí (`$DOMINO_ARTIFACTS_DIR`).

**Rutas relativas desde un proyecto importado fallan.** Las rutas se resuelven contra el
directorio de trabajo actual, no contra la ubicación del script, y saltan con
`FileNotFoundError`. Construye la ruta desde el propio fichero:

```python
import os
ruta = os.path.join(os.path.dirname(__file__), 'fichero.dat')
```

**`dominostats.json` se borra al inicio de cada run.** Solo persiste si el run escribe
uno nuevo.

**`sync` con miles de ficheros falla con "too many open files".** Crea un `.noLock`
vacío en la raíz del proyecto.

---

## 3. Rutas: Git-based y DFS no coinciden

| Contenido | Git-based | DFS |
|---|---|---|
| Directorio de trabajo | `/mnt/code` | `/mnt` |
| Artefactos | `/mnt/artifacts` | junto al código |
| Datasets del proyecto | `/mnt/data/<nombre>` | `/domino/datasets/local/<nombre>` |
| Repos importados | `/mnt/imported/code/<repo>` | `/repos/<repo>` |

Nunca hardcodees `/mnt`: en un proyecto DFS importado la ruta pasa a ser
`/mnt/<owner>/<proyecto>`. Usa `$DOMINO_WORKING_DIR`.

---

## 4. Autenticación

**Las API keys de usuario están deprecadas** desde 6.3, sustituidas por Personal Access
Tokens. Siguen funcionando, pero no construyas nada nuevo sobre ellas.

**`DOMINO_TOKEN_FILE` ya no existe como variable de entorno.** Si ves código que la usa,
está desactualizado.

**`DOMINO_USER_API_KEY` está en retirada** dentro de los runs: usa el API proxy
(`$DOMINO_API_PROXY`), que inyecta el token automáticamente.

**Los PAT se revocan solos si un admin cambia tus roles.** Un 401 repentino que antes
funcionaba suele ser esto: regenera el token.

**El valor del PAT se muestra una sola vez.** No se puede recuperar después.

**El API proxy no funciona contra endpoints HTTPS externos**: está pensado para usarse
desde dentro de las ejecuciones de Domino.

---

## 5. API: errores de forma

**El header de PAT y Service Account es `Authorization: Bearer <token>`**, no
`X-Domino-Api-Key`. Esa última es solo para la API key legacy.

**`latestTimeNano` va en nanosegundos**, no en milisegundos ni en segundos. Si lo
conviertes mal, o repites líneas de log o no recibes ninguna.

**El endpoint de logs devuelve como máximo 10.000 líneas por llamada.** Para un
entrenamiento MCMC largo hay que paginar con `latestTimeNano`.

**Los endpoints de jobs están repartidos entre versiones**: se lanza en
`/api/jobs/v1/jobs` (POST) pero se consulta en `/api/jobs/beta/jobs/...` (GET). No es
un error de la documentación.

**`refType` admite `head`, `commitId`, `tags`, `branches`** — en singular `commitId`,
pero en plural `tags` y `branches`. Es fácil equivocarse.

---

## 6. Entornos de cómputo

**Un entorno que cambia rompe la reproducibilidad.** Si el Job usa `LatestRevision`, dos
ejecuciones del mismo commit pueden dar resultados distintos. Para entregables usa
`ActiveRevision` o `SomeRevision(<id>)`.

**Las versiones importan en Meridian.** TFP nightly frente a la estable provoca errores
en tiempo de ejecución; fija versiones exactas en el `Dockerfile` del entorno.

**Sin GPU, el MCMC de Meridian puede tardar horas.** Verifica con
`domino_job.py tiers` que el tier elegido tiene GPU antes de lanzar.

---

## 7. Domino Endpoints (modelos como API)

**El entorno de un endpoint no es el de un Job.** Esta es la fuente número uno de
sorpresas al publicar un modelo:

- Los ficheros del proyecto se montan en **`/mnt/<username>/<project_name>`**, no en
  `/mnt`. Si hardcodeaste `/mnt/code`, el endpoint falla. Usa `$DOMINO_WORKING_DIR`.
- **No hereda las variables de entorno del proyecto.** Hay que redefinirlas en la página
  de ajustes del endpoint. Es deliberado: desacopla proyecto y modelo desplegado.
- **No lee `requirements.txt`** ni ejecuta los scripts pre/post-setup ni pre/post-run del
  entorno. Todo lo que haya que instalar va en el `Dockerfile`.

**Faltan paquetes y el build falla.** Python necesita `uWSGI`, `Flask`, `Six` y
`prometheus-client`; los asíncronos además `seldon-core`. Vienen preinstalados en los
entornos de Domino **salvo en la imagen mínima**.

**El endpoint corre con `uid`/`gid` 12574** (usuario `domino`). Ese usuario debe existir
en la imagen del entorno o el despliegue falla.

**El build usa el último `USER` del `Dockerfile`.** Si necesitas root durante el build,
declara `USER root`.

**Arrancar y parar el endpoint no actualiza el código.** Los ficheros del proyecto y los
repos Git se copian en el momento del build. Para recoger cambios hay que **crear una
versión nueva**.

**Límite de 10 KB en endpoints asíncronos**, tanto en petición como en respuesta. Los
payloads se pasan **por referencia**, no por valor. La petición se mantiene viva 30
minutos y los resultados se escriben en un almacén externo que defines tú.

**El formato del JSON depende de la firma de tu función.** Si tu función recibe un
diccionario (`mi_funcion(dict)`), **solo** funciona `{"parameters": [{...}]}`; el formato
`{"data": {...}}` no vale en ese caso.

**`.modelignore`** (no `.dominoignore`) es lo que excluye ficheros de la imagen del
endpoint.

**Data plane remoto: sin asíncrono ni monitorización.** Los endpoints desplegados en un
data plane remoto no soportan peticiones asíncronas ni monitorización integrada.

**R no soporta endpoints asíncronos** ni registro en el Model Registry.

Cuando un endpoint no arranca, mira en este orden: `buildLogs` → `instanceLogs`
(`/api/modelServing/v1/modelApis/{id}/versions/{vid}/...`).

---

## 8. MCP server y asistentes de código

**`run_domino_job` del MCP no elige hardware tier ni entorno.** El Job hereda los del
proyecto. Si el análisis necesita GPU, ponla como defecto del proyecto o lanza con
`domino_job.py --tier`.

**Tampoco fija rama ni commit**: ejecuta la referencia por defecto. Un entregable
reproducible se lanza con el CLI y `--commit <sha>`.

**El comando se parte con `.split()`**: los argumentos entrecomillados con espacios se
rompen en trozos. Evítalos.

**No definas `DOMINO_API_HOST` en tu portátil.** El MCP server interpreta esa variable
como "estoy dentro de un Workspace" y redirige sus llamadas a `http://localhost:8899`.
En local usa `DOMINO_HOST`.

**El MCP usa `X-Domino-Api-Key`, deprecada desde 6.3.** Si tu instancia la tiene
desactivada, da 401 y hay que parchear `_get_auth_headers()` para mandar
`Authorization: Bearer <PAT>`.

**El MCP habla la API legacy v1/v4, no la Public API 6.4.0.** Los `runId` de uno no
sirven en los endpoints del otro: son espacios de identificadores distintos.

**Las funciones de ficheros del MCP solo valen en proyectos DFS.** En Git-based el
código entra por `git push`.

**El asistente se olvida de commitear antes de lanzar el Job.** Lo advierte el propio
README oficial. Resultado: ejecutas código viejo sin enterarte. Comprueba `git status`.

**El README del MCP está desactualizado**: dice que expone dos funciones y expone diez.
Fíate del código, no del README.

---

## 9. Cosas que no existen (no las inventes)

- No hay endpoint público para "ejecutar un comando suelto en un Workspace existente".
  Para ejecutar algo desde fuera, lanza un **Job** (o entra por SSH).
- `python-domino` no tiene una operación de `sync` de ficheros: eso es del CLI.
- No asumas nombres de métodos de `python-domino` por plausibilidad. Comprueba la
  referencia de tu versión (actual: **2.2.0**); la API ha cambiado entre 1.x y 2.x.
- El **Dom CLI** (SSH) y el **Domino CLI** son herramientas distintas con nombres
  parecidos. `dom connect` no existe en el Domino CLI, y `domino run` no existe en el
  Dom CLI.

> **Corrección**: sí existe desarrollo remoto por SSH contra un Workspace
> (`dom connect` + Remote-SSH) y sí hay una extensión oficial de Domino para VS Code.
> Ver `references/remote-development.md`.

---

## 10. La versión de la instancia manda

Esta skill documenta el Public API **6.4.0**, pero muchas instancias corporativas van por
detrás. Comprobado contra una **6.2.2** real:

| Ruta | 6.4 | 6.2.2 |
|---|---|---|
| `POST /api/projects/beta/.../commits/resolveGitRef` | ✅ | ❌ 404 |
| `GET /api/hardwaretiers/v1/hardwaretiers` | ✅ | ❌ 403 (solo admin) |
| `GET /v4/gateway/projects?relationship=All` | ✅ | ❌ 500 |

Dos reglas que se derivan:

1. **Un 404 en `GET` no prueba que la ruta no exista.** Puede aceptar solo `POST`.
   `GET /api/jobs/v1/jobs` da 404 y `POST /api/jobs/v1/jobs` funciona perfectamente.
   Sondea siempre con el método correcto antes de concluir que algo falta.
2. **Los errores de Domino no siempre son JSON.** Un 403 puede devolver un cuerpo
   binario; si lo decodificas a ciegas con `errors="replace"` obtienes basura ilegible
   que oculta el problema real. Detecta el caso y di "cuerpo no textual de N bytes".

Detalle completo en `references/verificado-6.2.md`.

---

## 11. Higiene de proyecto

- Los secretos van en variables de entorno del proyecto, **nunca en el repositorio**.
- `.dominoignore` funciona como `.gitignore` y excluye ficheros de las nuevas
  revisiones. `.git/` se ignora siempre.
- `.dominoresults` lista patrones a **incluir** en los resultados; sin él, aparece todo
  lo que el run haya modificado.
- El `README` del proyecto se muestra en la pestaña Overview; para enlazar ficheros del
  proyecto desde él, antepón `raw/latest/` a la ruta relativa.
