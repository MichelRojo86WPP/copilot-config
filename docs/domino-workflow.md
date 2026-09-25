# Trabajar en Domino Data Lab sin dejar de usar GitHub ni Copilot

Guía práctica para desarrollar tus proyectos de Data Science (Meridian MMM, GeoX,
CausalImpact) con Copilot, mantenerlos versionados en GitHub y **ejecutarlos en la
infraestructura de Domino**, que es lo que exige la empresa.

---

## La idea en una frase

**Domino no es tu repositorio: es tu máquina.** GitHub sigue siendo la fuente de verdad
del código. Domino aporta la GPU, el entorno reproducible y la gobernanza.

```
┌────────────┐   git push    ┌────────────┐   el Job apunta   ┌─────────────┐
│  Tu PC     │ ────────────> │  GitHub    │ <── a rama/commit │   Domino    │
│  Copilot   │               │  (verdad)  │                   │  GPU + gob. │
└────────────┘               └────────────┘                   └─────────────┘
       ▲                                                             │
       └──────────  logs en streaming / artefactos  ──────────────────┘
```

Esto solo aplica a proyectos **Git-based**, que es el tipo que debes elegir. En
proyectos **DFS** el código vive dentro de Domino y no hay GitHub de por medio.

---

## Tu instancia (verificado el 2026-09-24)

| Dato | Valor |
|---|---|
| Host | `https://datascience.choreograph.com` |
| Versión | **Domino 6.2.2** |
| Tu usuario | `miguel_rojo` |
| API key | ✅ Activa (6.2 es anterior a la deprecación de 6.3) |
| Proyectos | 1: `quick-start` (DFS, de ejemplo) |
| GPU disponible | ✅ T4 |

**Probado de extremo a extremo**: `domino_job.py` lanzó un Job real, hizo streaming de
los logs y terminó en `Succeeded`. El flujo local → Domino funciona.

### Hardware tiers con GPU

| ID | GPU | Cores | Memoria | Cent/min |
|---|---|---|---|---|
| `n1-highmem4-gpu-t4` | 1 × T4 | 1.8 | 18 GiB | 1.06 |
| **`n1-highmem16-gpu-t4`** | **1 × T4** | **12** | **88 GiB** | **2.40** |
| `gpu-k8s` (GPU) | 1 | 6 | 43 GiB | 3.53 |

Para **Meridian MMM** usa `n1-highmem16-gpu-t4`: el MCMC de TensorFlow Probability
necesita RAM, y el T4 pequeño (18 GiB) se queda corto en cuanto crecen las cadenas.

Sin GPU, el más rentable es `n1-standard-8` (6 cores, 22 GiB, 0.70 cent/min): cuesta lo
mismo que `Large` pero rinde más.

### Aviso sobre entornos

Meridian exige **Python ≥ 3.11**. De los entornos preinstalados, el único que cumple es
`Custom Environment: py3.11 - r4.4 - Domino 6.0`. El `Domino Standard Environment` va
con Python 3.10 y **no sirve**. Si ese custom no trae las dependencias de Meridian,
habrá que crear un entorno propio partiendo de él.

### Diferencias de la 6.2 que te van a afectar

- `domino_job.py resolve` **no funciona** (el endpoint es de 6.4). Saca el SHA en local
  con `git rev-parse origin/<rama>` y pásalo a `--commit`.
- `domino_job.py tiers` necesita `--project-id`; sin él, el endpoint global exige rol de
  administrador.
- Las herramientas de ficheros del MCP solo encontrarán proyectos **de los que seas
  propietario**.

---

## Las cuatro formas de trabajar

| Modo | Editas en | Ejecuta en | Cuándo |
|---|---|---|---|
| **A. MCP server** | Tu PC | Domino, lo lanza el asistente | **Por defecto.** Vibecoding real |
| **B. CLI + Job** | Tu PC | Domino, lo lanzas tú | GPU concreta, commit fijo, logs en vivo |
| **C. SSH** | Tu PC (VS Code) | Dentro del Workspace | Iterar en vivo con GPU |
| **D. Workspace** | Navegador | Ahí mismo | Datos que no pueden salir |

A y B son los que vas a usar a diario, y se complementan: **exploras con el MCP**, y
cuando el análisis sale bien, **lanzas el run definitivo con el CLI** fijando el commit
y el hardware tier.

---

## Puesta en marcha (una vez)

### 1. Saca tus credenciales de Domino

Necesitas dos cosas distintas, porque el MCP y el CLI usan mecanismos diferentes:

| Credencial | Dónde | Para qué |
|---|---|---|
| **API key** | Account > Account settings | El MCP server |
| **Personal Access Token** | Account > Account settings > Personal Access Token | El CLI |

El PAT **se muestra una sola vez**: cópialo en cuanto lo generes. Y ojo: si un
administrador cambia tus roles, tus PAT se revocan solos. Un 401 repentino suele ser eso.

### 2. Configura las variables de entorno

En PowerShell, permanentes para tu usuario:

```powershell
[Environment]::SetEnvironmentVariable("DOMINO_HOST", "https://tuempresa.domino.tech", "User")
[Environment]::SetEnvironmentVariable("DOMINO_API_KEY", "<tu-api-key>", "User")
[Environment]::SetEnvironmentVariable("DOMINO_TOKEN", "<tu-pat>", "User")
```

Tres reglas que ahorran horas de depuración:

- `DOMINO_HOST` **sin barra final**.
- **Nunca definas `DOMINO_API_HOST`** en tu PC. El MCP server interpreta esa variable
  como "estoy dentro de un Workspace de Domino" y manda sus llamadas a
  `http://localhost:8899`, que en tu portátil no existe.
- Abre una **terminal nueva** después: las variables no llegan a las ya abiertas.

### 3. Instala el MCP server

```bash
python scripts/domino_mcp_setup.py install
```

Comprueba que tienes `git` y `uv`, clona el servidor oficial de Domino en
`~/.domino/domino_mcp_server`, instala las dependencias y te imprime la configuración.

Después, valida:

```bash
python scripts/domino_mcp_setup.py check
```

Si todo está bien te lista **tus proyectos** con su propietario y si son DFS o Git. Esos
son los valores exactos que necesitas en el paso siguiente.

### 4. Conecta tu proyecto de datos con Domino

En Domino, crea el proyecto como **Git-based** apuntando a tu repositorio de GitHub.
Para repos privados hay que registrar antes una credencial de GitHub en Domino
(*Account settings > Git credentials*); el PAT de GitHub necesita los permisos `repo` y
`read:user`.

Luego, **en la carpeta de tu proyecto de datos** (no en este repositorio):

```bash
python scripts/domino_mcp_setup.py rules --out .
```

Crea dos ficheros:

- `.github/instructions/domino.instructions.md` — las reglas que le dicen al asistente
  cuándo usar Domino, cómo leer los datos y que hay que commitear antes de lanzar Jobs.
- `domino_project_settings.md` — contra qué proyecto trabajar.

Edita el segundo con los valores reales, que salen de la URL del proyecto
(`https://<host>/u/<user_name>/<project_name>/overview`):

```
project_name="advanced-analytics-melia"
user_name="propietario_del_proyecto"
dfs=false
```

> `user_name` es el **propietario del proyecto**, que puede no ser tu usuario si el
> proyecto lo creó otra persona.

### 5. Reinicia Copilot

Los MCP servers se cargan al arrancar. Sin reiniciar, no verás las herramientas.

---

## El ciclo diario

### Con el MCP (modo A)

Simplemente le hablas al asistente:

> *"Analiza la estructura de los datasets del proyecto y lánzalo como Job en Domino.
> Cuando acabe, resume los hallazgos."*

El asistente escribe el script, lo commitea, lo ejecuta en Domino, espera, lee el
resultado y te lo explica. Eso es el vibecoding que buscabas.

Herramientas que tiene disponibles: `get_domino_environment_info`, `run_domino_job`,
`check_domino_job_run_status`, `check_domino_job_run_results`, `open_web_browser`, más
cinco de sincronización de ficheros que **solo funcionan en proyectos DFS**.

### Con el CLI (modo B)

```bash
git add -A
git commit -m "feat: priors calibrados"
git push

python scripts/domino_job.py run \
  --project-id 665f... \
  --command "python projects/media-mix/melia-2026/run_analysis.py" \
  --branch feature/mmm-2026 \
  --tier "GPU T4" \
  --follow
```

`--follow` hace streaming de los logs en tu terminal y devuelve código de salida 0 solo
si el Job termina en `Succeeded`.

Comandos de apoyo: `whoami`, `projects`, `tiers`, `envs`, `jobs`, `status`, `logs`,
`resolve`, `apagado`, `gasto`.

### Al terminar: apagar (obligatorio)

```bash
python scripts/domino_job.py apagado
```

Recorre todos tus proyectos y avisa si queda algún Job corriendo o algún Workspace
abierto. Devuelve código de salida 1 si encuentra algo, así que puedes encadenarlo
detrás de cualquier ejecución.

**Un Job se apaga solo al terminar el script. Un Workspace no: factura hasta que pulsas
*Stop*.** Cerrar la pestaña del navegador no lo apaga. Es la causa número uno de gasto
inesperado en Domino.

### Comprobarlo en la interfaz

Desde el menú de arriba: **`Develop` → `Workspaces`**. Esa página te enseña los
Workspaces de *todos* tus proyectos a la vez, que es justo lo que necesitas. Si dice
*"You have no Workspaces"*, no tienes nada encendido. Al lado está `Develop` → `Jobs`.

Las direcciones directas, verificadas en tu instancia:

| Página | Para qué |
|---|---|
| [`/workspaces`](https://datascience.choreograph.com/workspaces) | **Todos tus Workspaces, de todos los proyectos.** Es la única que factura sin avisar |
| [`/jobs`](https://datascience.choreograph.com/jobs) | Todos tus Jobs, con su estado |

Si solo quieres mirar un proyecto:
`/workspaces/<usuario>/<proyecto>` y `/jobs/<usuario>/<proyecto>`.

Dentro de un proyecto también vale con mirar el panel de la derecha, en `Overview`: si
los contadores **WORKSPACES** y **APPS** están a **0**, ahí no hay nada gastando. El
contador de **JOBS** puede ser alto sin problema: cuenta los que has lanzado en total,
no los que están corriendo.

Qué buscar: cualquier fila cuyo estado **no** sea `Stopped`, `Completed`, `Succeeded`,
`Failed` o `Error`. Un `Running` o `Starting` está consumiendo máquina ahora mismo.

Para apagar un Workspace hay que pulsar **Stop** en su fila. Cerrar la pestaña del
navegador no lo apaga.

> **No te fíes del "TOTAL RUNTIME" del panel del proyecto.** En el pilotaje marcaba
> *"un mes"* cuando el gasto real eran 12 minutos. Lo comprobamos por dos vías: la
> columna `DURATION` de la propia página de Jobs sumaba 12m 36s, y el cálculo por API
> daba 11,4 minutos de máquina. Es un fallo de la interfaz, no gasto.
> El dato bueno es la columna `DURATION` de `Develop` → `Jobs`.

Para ver lo que ha costado algo:

```bash
python scripts/domino_job.py gasto --project-id 665f...
```

### El run definitivo para el cliente

```bash
python scripts/domino_job.py resolve --project-id 665f... feature/mmm-2026
python scripts/domino_job.py run --project-id 665f... \
  --command "python run_analysis.py" \
  --commit <sha-devuelto> --tier "GPU T4" \
  --environment-revision ActiveRevision --follow
```

Así el informe queda atado a un SHA de GitHub y a una imagen de entorno concretas, y es
reproducible dentro de un año.

---

## Escribir scripts que funcionen en los dos sitios

```python
import os
from pathlib import Path

EN_DOMINO = "DOMINO_RUN_ID" in os.environ

BASE   = Path(os.environ.get("DOMINO_WORKING_DIR", Path(__file__).parent))
DATOS  = Path(os.environ.get("DOMINO_DATASETS_DIR", BASE / "data"))
SALIDA = Path(os.environ.get("DOMINO_ARTIFACTS_DIR", BASE / "outputs"))
SALIDA.mkdir(parents=True, exist_ok=True)
```

Tres reglas:

1. **Todo entregable se escribe en `SALIDA`** (`/mnt/artifacts`) o se pierde al acabar.
2. **Los datos pesados van a un Dataset**, no al repositorio. Los ficheros del proyecto
   se copian en *cada* ejecución, con un límite de 10.000 ficheros y 8 GB por fichero.
3. **Nada de rutas absolutas** tipo `C:\Users\...`.

---

## Los errores que vas a cometer

**1. Lanzar sin haber hecho push.** Domino ejecuta lo que hay en el repositorio remoto.
Si no has subido los cambios, ejecutas código viejo y no te enteras: el Job funciona,
solo que con la versión anterior. Es tan común que el propio README oficial del MCP le
dedica un aviso, porque el asistente a veces se olvida.

**2. Esperar que Domino commitee por ti.** En proyectos Git-based, cuando un Job
termina Domino sincroniza **solo los artefactos**. El código nunca se auto-commitea, ni
siquiera el que escribas dentro de un Workspace. Es intencional.

**3. Asumir que el MCP puede elegir GPU.** No puede: `run_domino_job` no acepta
hardware tier ni entorno ni commit. Usa el hardware por defecto del proyecto. Si tu MMM
necesita GPU, o la pones como defecto del proyecto, o lanzas con el CLI.

**4. Dar por hecho que los resultados se guardan.** La carpeta del repositorio dentro
del Job (`/mnt/code`) desaparece al apagarse la máquina. Si tu script escribe en
`outputs/`, cópialo a `/mnt/artifacts` antes de terminar o no lo verás en ningún sitio.
Comprobado por las malas.

**5. Subir tu `pip freeze` como `requirements.txt`.** Domino lo instala **solo y antes
de ejecutar nada**. Un freeze hecho en Windows arrastra `pywinpty`, que no existe en
Linux, y el Job muere en la preparación sin llegar a tu script.

**6. Confiar en que "en mi portátil funciona".** Tu Python es 3.12 y el de Domino 3.11.
Hay sintaxis válida en uno e inválida en el otro. Antes de lanzar, pide que se compile
el repositorio con un Python 3.11 real.

**7. Creer que fijar el commit hace el análisis reproducible.** No basta si el modelo
hace muestreo. Sin fijar la semilla, dos ejecuciones idénticas dan números distintos.
Nos pasó: +717 y +730 sesiones sobre el mismo commit y los mismos datos.

**8. Dejarte un Workspace abierto.** Sigue facturando. Ejecuta `apagado` al terminar.

---

## Un caso real, de principio a fin

El 25/09/2026 se ejecutó el análisis CausalImpact de Paradisus US 2026 desde
`WPPOpen/advanced_analytics_melia` en Domino, y funcionó. Así quedó:

| Paso | Qué se hizo |
|---|---|
| Proyecto | Git-based, conectado al repo, billing tag `Non_client_c9h` |
| Entorno | `Custom Environment: py3.11 - r4.4` (el Standard va con 3.10) |
| Arranque | `bash scripts/run_domino.sh <script.py> <config.json>` |
| Dependencias | `requirements.txt` portable, instalado por Domino automáticamente |
| Resultados | copiados a `/mnt/artifacts` por el script de arranque |
| Recuperación | `browseFiles` para listar + `/v1/.../blobs/{key}` para descargar |
| Coste | 11 minutos de máquina, ~0,02 USD en 7 Jobs |

Resultado del análisis: **+706 sesiones diarias (+23,1 %)**, +36.028 acumuladas,
p < 0,01. Dos ejecuciones distintas dieron exactamente lo mismo, una vez fijada la
semilla.

---

## Si necesitas trastear en vivo con la GPU (modo C)

SSH contra un Workspace, con tu VS Code local:

```bash
dom connect <workspace_id> --domino-api-host=https://<tu-dominio> -l ubuntu
```

Requiere que el entorno tenga `openssh-server`, marcar *Enable SSH access* al lanzar el
Workspace, y el **Dom CLI** (que es una herramienta distinta del Domino CLI, y solo se
descarga desde el panel *Settings* de un Workspace ya arrancado).

Más cómodo: la **extensión oficial de Domino para VS Code**
(`DominoDataLab.domino-data-lab-vscode-extension`), que monta el túnel sola y además
permite lanzar Jobs eligiendo hardware tier y entorno.

Ojo al coste: el Workspace consume cuota mientras está encendido, no solo mientras
entrena.

---

## Dónde está cada cosa

| Recurso | Para qué |
|---|---|
| `skills/domino-datalab/SKILL.md` | El conocimiento que carga Copilot |
| `skills/domino-datalab/references/mcp-server.md` | El MCP a fondo: 10 herramientas, límites |
| `skills/domino-datalab/references/verificado-6.2.md` | Qué funciona de verdad en tu 6.2.2 |
| `skills/domino-datalab/references/remote-development.md` | SSH, extensión de VS Code, asistentes |
| `skills/domino-datalab/references/api-reference.md` | Endpoints reales verificados |
| `skills/domino-datalab/references/pitfalls.md` | Las trampas, por temas |
| `scripts/domino_mcp_setup.py` | Instalar y validar el MCP |
| `scripts/domino_job.py` | Lanzar Jobs con control total |
| `extensions/domino-expert/` | Herramientas de consulta en cualquier chat |

Documentación oficial: [docs.domino.ai](https://docs.domino.ai) ·
índice para agentes: `https://docs.domino.ai/llms.txt` ·
tu instancia publica su propia API en `https://<tu-dominio>/docs`.
