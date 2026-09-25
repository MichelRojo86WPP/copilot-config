# Ciclo de trabajo: GitHub + Domino + Copilot

Cómo seguir haciendo *vibecoding* con Copilot en local cuando la empresa exige que los
análisis se ejecuten en Domino.

---

## Puesta en marcha (una sola vez por proyecto)

### 1. Credencial de GitHub dentro de Domino

Domino necesita poder clonar tu repositorio privado.

1. En GitHub: **Settings > Developer settings > Personal access tokens**. Crea un token
   con permiso de lectura sobre el repo (`repo` o *fine-grained* con acceso al repo).
2. En Domino: **Account > Account settings > Git credentials**. Añade el token.

Los repositorios públicos no necesitan credencial.

### 2. Crear el proyecto como Git-based

Al crear el proyecto en Domino, elige repositorio Git y apunta a tu repo de GitHub.
Fija la rama por defecto en *Project settings*; se autocompleta en todo el proyecto.

> Si el equipo ya tiene un proyecto DFS, se puede seguir trabajando, pero pierdes PRs,
> protección de ramas y CI. Migrar a Git-based es casi siempre lo correcto.

### 3. Token de Domino en tu máquina

**Account > Account settings > Personal Access Token > Generate new Token**.
El valor sale **una sola vez**.

```powershell
# Sesión actual
$env:DOMINO_API_HOST = "https://tuempresa.domino.tech"
$env:DOMINO_TOKEN    = "<tu-pat>"

# Permanente (usuario)
[Environment]::SetEnvironmentVariable("DOMINO_API_HOST", "https://tuempresa.domino.tech", "User")
[Environment]::SetEnvironmentVariable("DOMINO_TOKEN", "<tu-pat>", "User")
```

Alternativa en fichero, `~/.domino/config.json`:

```json
{ "host": "https://tuempresa.domino.tech", "token": "<tu-pat>" }
```

Comprueba que funciona y apunta el `projectId`:

```bash
python scripts/domino_job.py whoami
python scripts/domino_job.py projects
python scripts/domino_job.py tiers     # nombre exacto del tier con GPU
```

### 4. Entorno de cómputo

Para Meridian MMM el Domino Standard Environment no basta: hace falta GPU y versiones
concretas (TensorFlow, TFP nightly). Pide a tu admin un Compute Environment con un
`Dockerfile` como base, y **versiona ese Dockerfile en el repo** (p. ej. en
`infra/domino/Dockerfile`) aunque Domino guarde su propia copia.

---

## El ciclo diario

```
 1. Editas en local con Copilot          →  código, prompts, iteración rápida
 2. git commit + git push                →  GitHub es la fuente de verdad
 3. domino_job.py run --branch <rama> -f →  se ejecuta en GPU, logs en tu terminal
 4. Lees el log, corriges, vuelves a 1
 5. Cuando sale bien: --commit <sha>     →  ejecución reproducible y citable
```

En la práctica:

```bash
git add -A && git commit -m "feat: priors calibrados con el geo-experimento" && git push

python scripts/domino_job.py run \
  --project-id 665f0a1b2c3d4e5f6a7b8c9d \
  --command "python projects/media-mix/melia-2026/run_analysis.py" \
  --branch feature/mmm-2026 \
  --tier "GPU T4" \
  --title "MMM Melia 2026 - priors v3" \
  --follow
```

`--follow` imprime los logs en vivo y termina con código 0 solo si el Job acaba en
`Succeeded`, así que Copilot puede leer el fallo y proponerte la corrección sin que
tengas que abrir la UI de Domino.

### Ejecución reproducible

Para el run definitivo que va al cliente, fija el commit exacto:

```bash
python scripts/domino_job.py resolve --project-id 665f... feature/mmm-2026
python scripts/domino_job.py run --project-id 665f... \
  --command "python run_analysis.py" --commit <sha-devuelto> --tier "GPU T4" --follow
```

Así el informe queda atado a un SHA de GitHub y a una revisión de entorno concretos.

---

## Cómo escribir el script para que funcione en los dos sitios

El mismo `run_analysis.py` debe correr en tu portátil y en Domino sin tocar nada:

```python
import os
from pathlib import Path

EN_DOMINO = "DOMINO_RUN_ID" in os.environ

BASE   = Path(os.environ.get("DOMINO_WORKING_DIR", Path(__file__).parent))
DATOS  = Path(os.environ.get("DOMINO_DATASETS_DIR", BASE / "data"))
SALIDA = Path(os.environ.get("DOMINO_ARTIFACTS_DIR", BASE / "outputs"))
SALIDA.mkdir(parents=True, exist_ok=True)

if EN_DOMINO:
    print(f"Ejecutando en Domino: run {os.environ.get('DOMINO_RUN_NUMBER')} "
          f"en tier {os.environ.get('DOMINO_HARDWARE_TIER_ID')}")
```

Reglas:

- **Todo entregable se escribe en `SALIDA`** (`/mnt/artifacts`). Lo que se escriba en
  otro sitio no se sincroniza y se pierde al acabar el Job.
- Los datos pesados se leen de un **Dataset**, nunca del repositorio.
- Nada de rutas absolutas tipo `C:\Users\...`.

---

## Recuperar resultados

| Vía | Cuándo |
|---|---|
| Pestaña **Artifacts** del proyecto | Consulta puntual desde el navegador |
| `domino download-results` (CLI) | Bajar los resultados de un run concreto |
| Pestaña **Runs** > **Results** | Ver qué generó cada ejecución |

Si los runs generan mucho y no lo quieres en cada sync, activa
**Settings > Results > isolated results branches**.

Controla qué aparece como resultado con `.dominoresults` (patrones a *incluir*) y qué
se excluye del versionado con `.dominoignore` (funciona como `.gitignore`).

---

## Modo B: trabajar dentro de un Workspace de Domino

A veces los datos no pueden salir de Domino. En ese caso el desarrollo ocurre dentro
de un Workspace, y desde Domino 6.3 **los agentes ya vienen instalados**:

| Agente | Extensión VS Code | CLI | Otros IDEs |
|---|---|---|---|
| GitHub Copilot | preinstalada | — | — |
| Claude Code | preinstalada | disponible | funciona en cualquier terminal |
| Codex | preinstalada | disponible | funciona en cualquier terminal |

Además cargan las **Domino Skills** (del repo `dominodatalab/domino-claude-plugin`),
que dan al agente acciones de plataforma: `jobs`, `datasets`, `environments`,
`workspaces`, `projects`, `flows`, `model-endpoints`, `experiment-tracking`,
`python-sdk`, entre otras. Están optimizadas para Claude Code.

> Activa la **persistencia del home** en los ajustes del Workspace: conserva la
> autenticación del agente y el historial de conversación entre reinicios.

Aviso importante: en un proyecto Git-based, el código que escribas en el Workspace
**no se commitea solo**. Haz `git push` desde la terminal del Workspace, o usa el flujo
de sincronización de la UI, que además resuelve conflictos fichero a fichero.

### Cómo convive con este repositorio

Tus skills viven en `~/.copilot/skills` de **tu** máquina. Un Workspace de Domino es
otro contenedor y no las ve. Para llevarlas allí, clona este repositorio dentro del
Workspace y ejecuta el instalador, o añade el clonado al `Dockerfile` del entorno.

---

## Modo C: Flows (pipelines)

Cuando el análisis son varias etapas encadenadas (preparar datos → EDA → entrenar →
diagnósticos → informe), Domino **Flows** las orquesta como tareas Flyte tipadas, con
caché, subflows y pasos de aprobación humana.

Merece la pena cuando:

- el entrenamiento es caro y quieres **cachear** las etapas previas,
- necesitas reejecutar solo un tramo con otros parámetros,
- el cliente exige trazabilidad etapa a etapa.

No merece la pena para un `run_analysis.py` de un solo golpe: ahí un Job basta.

Desde 6.3 se puede relanzar un Flow cambiando inputs, entorno, tier o referencia Git
sin editar su definición, desde UI, API o CLI.

---

## Checklist antes de dar un análisis por bueno

- [ ] El código está pusheado a GitHub y el Job se lanzó con `--commit <sha>`.
- [ ] Los entregables están en `/mnt/artifacts`, no en el directorio de trabajo.
- [ ] Los datos de entrada vienen de un Dataset versionado (o de un snapshot).
- [ ] El entorno se fijó con `ActiveRevision` o `SomeRevision(<id>)`.
- [ ] El Job terminó en `Succeeded` (código de salida 0 con `--follow`).
- [ ] Ningún secreto está en el repositorio.
