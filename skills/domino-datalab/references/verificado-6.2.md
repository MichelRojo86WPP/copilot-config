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
