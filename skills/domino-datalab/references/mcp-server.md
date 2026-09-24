# MCP server de Domino — conectar tu asistente de código a la plataforma

Domino publica un **MCP server oficial** que da a un asistente de código (Copilot,
Cursor, VS Code) la capacidad de lanzar Jobs en Domino, leer sus resultados y
sincronizar ficheros, sin salir del chat. Es la pieza que convierte el "vibecoding"
en algo real: tú describes lo que quieres, el asistente escribe el script, lo ejecuta
en la infraestructura de Domino y te explica el resultado.

- Repositorio: `https://github.com/dominodatalab/domino_mcp_server`
- Documentación: *Vibe Modeling with Domino* (`user_guide/ea335f`)
- Blueprint con las reglas originales: `https://domino.ai/resources/blueprints/vibe-modeling`

> Todo lo de esta página está verificado leyendo `domino_mcp_server.py` (813 líneas),
> no solo el README, que está desactualizado: dice que expone dos funciones cuando en
> realidad expone **diez**.

---

## Las 10 herramientas

| Herramienta | Firma | Qué hace |
|---|---|---|
| `get_domino_environment_info` | `()` | Detecta entorno, proyecto, DFS/Git y modo de auth |
| `run_domino_job` | `(user_name, project_name, run_command, title)` | Lanza un comando como Job |
| `check_domino_job_run_status` | `(user_name, project_name, run_id)` | ¿Terminó, sigue o falló? |
| `check_domino_job_run_results` | `(user_name, project_name, run_id)` | Devuelve el stdout del Job |
| `open_web_browser` | `(url)` | Abre una URL (enlaces de MLflow) |
| `list_domino_project_files` | `(user_name, project_name, path="/")` | Lista ficheros — **solo DFS** |
| `upload_file_to_domino_project` | `(user_name, project_name, file_path, file_content)` | Sube contenido — **solo DFS** |
| `download_file_from_domino_project` | `(user_name, project_name, file_path)` | Descarga contenido — **solo DFS** |
| `sync_local_file_to_domino` | `(user_name, project_name, local_file_path, domino_file_path=None)` | Sube un fichero local — **solo DFS** |
| `smart_sync_file` | `(user_name, project_name, file_path, content, force_overwrite=False)` | Sube detectando conflictos — **solo DFS** |

Los proyectos se direccionan por **`user_name` + `project_name`**, no por `projectId`.
Ambos salen de la URL del proyecto:

```
https://tuempresa.domino.tech/u/<user_name>/<project_name>/overview
```

`user_name` es el **propietario del proyecto**, que no tiene por qué ser tu usuario si
el proyecto es de otra persona.

---

## Lo que el MCP server NO puede hacer
Estas tres limitaciones están en el código, y son la razón de que el CLI
`scripts/domino_job.py` siga siendo necesario:

**1. No elige hardware tier ni entorno.** El cuerpo que envía es exactamente:

```python
payload = {
    "command": run_command.split(),
    "isDirect": False,
    "title": title,
    "publishApiEndpoint": False,
}
```

No hay campo de tier. El Job hereda el **hardware por defecto del proyecto**. Si tu
MMM necesita GPU, o pones la GPU como defecto del proyecto, o lanzas con el CLI.

**2. No fija rama ni commit.** Ejecuta la referencia por defecto del proyecto. Para
un run reproducible atado a un SHA (el que va al cliente) hay que usar el CLI.

**3. Parte el comando por espacios** con `.split()`. Un argumento entrecomillado con
espacios (`--titulo "MMM Melia 2026"`) se rompe en trozos. Evita espacios en los
argumentos o pásalos por un fichero de configuración.

**4. (Solo en Domino < 6.4) No resuelve proyectos ajenos.** Su `_get_project_id()`
consulta `relationship=Owned` y, si no encuentra el proyecto, reintenta con
`relationship=All`. En 6.2.2 ese valor **no existe** y devuelve HTTP 500, que su
`except requests.exceptions.RequestException` se traga silenciosamente: la función
acaba devolviendo `None`.

Efecto real: **las cinco herramientas de ficheros fallan en proyectos de los que no eres
propietario**. `run_domino_job` no se ve afectada, porque direcciona por
`user_name`/`project_name` y nunca necesita el `projectId`. Detalle en
`references/verificado-6.2.md`.

---

## Autenticación: dos modos automáticos

El servidor decide solo, mirando si existe la variable `DOMINO_API_HOST`:

| Dónde corre | Detección | Host que usa | Cabecera |
|---|---|---|---|
| Dentro de un Workspace | `DOMINO_API_HOST` existe | `http://localhost:8899` | `Authorization: <token efímero>` |
| En tu portátil | no existe | `DOMINO_HOST` del entorno | `X-Domino-Api-Key: <DOMINO_API_KEY>` |

Dentro de un Workspace pide un token nuevo a `http://localhost:8899/access-token` **en
cada llamada**, porque caduca muy rápido. Fuera, usa la API key clásica.

La variable `API_KEY_OVERRIDE` fuerza el uso de una API key aunque estés dentro de
Domino (útil para depurar).

> ⚠️ **Colisión de variables.** El CLI `domino_job.py` aceptaba `DOMINO_API_HOST` como
> nombre del host. Si la defines en tu portátil, el MCP server creerá que está dentro
> de un Workspace y llamará a `http://localhost:8899`, que en local no existe.
> **Usa `DOMINO_HOST` en el portátil.** El CLI ya la prefiere, así que una sola
> variable sirve para los dos.

> ⚠️ **API key vs PAT.** El MCP server usa `X-Domino-Api-Key`, que Domino marcó como
> **deprecada a partir de 6.3**. Si tu instancia ya las tiene desactivadas, el servidor
> devolverá 401 y habrá que parchear `_get_auth_headers()` para que mande
> `Authorization: Bearer <PAT>`. Es un cambio de dos líneas.

---

## La API que usa: legacy v1/v4, no la Public API 6.4.0

Detalle importante para no mezclar churras con merinas. El MCP server **no** usa la
Public API moderna que documenta `api-reference.md`; usa la generación anterior:

| Operación | MCP server (legacy) | Public API 6.4.0 |
|---|---|---|
| Lanzar Job | `POST /v1/projects/{user}/{proj}/runs` | `POST /api/jobs/v1/jobs` |
| Estado | `GET /v1/projects/{user}/{proj}/runs/{runId}` | `GET /api/jobs/beta/jobs/{id}` |
| Salida | `GET /v1/projects/{user}/{proj}/run/{runId}/stdout` | `GET /api/jobs/beta/jobs/{id}/logs` |
| Proyectos | `GET /v4/gateway/projects?relationship=All` | `GET /api/projects/beta/projects` |
| Listar ficheros | `GET /v4/files/browseFiles` | — |
| Subir fichero | `PUT /v1/projects/{user}/{proj}/{path}` | — |
| Leer fichero | `GET /v4/files/editCode` | — |

Ambas funcionan. Simplemente no esperes que los `runId` del MCP encajen en los
endpoints `/api/jobs/beta/`, ni al revés: son espacios de identificadores distintos.

`GET /v4/gateway/projects?relationship=All` es útil por su cuenta: devuelve la lista de
proyectos accesibles con su `name` e `id`. Es lo que usa
`domino_mcp_setup.py check` para validar credenciales y enseñarte los nombres exactos
que tienes que poner en `domino_project_settings.md`.

---

## Instalación

Con el script del repositorio, que hace los cuatro pasos de golpe:

```bash
python scripts/domino_mcp_setup.py install
```

Comprueba `git` y `uv`, clona o actualiza el repositorio en
`~/.domino/domino_mcp_server`, instala dependencias y te imprime la configuración.

Manualmente sería:

```bash
git clone https://github.com/dominodatalab/domino_mcp_server.git
cd domino_mcp_server
uv venv
uv pip install -e .
```

Requisitos: Python ≥ 3.11. Dependencias: `mcp[cli]>=1.6.0`, `FastMCP`, `requests`,
`python-dotenv`.

### Credenciales

```powershell
[Environment]::SetEnvironmentVariable("DOMINO_MCP_DIR", "$env:USERPROFILE\.domino\domino_mcp_server", "User")
[Environment]::SetEnvironmentVariable("DOMINO_HOST", "https://tuempresa.domino.tech", "User")
[Environment]::SetEnvironmentVariable("DOMINO_API_KEY", "<tu-api-key>", "User")
```

`DOMINO_HOST` **sin barra final**. La API key está en *Account > Account settings*.

Pasar las credenciales por el bloque `env` de la configuración MCP es preferible a
escribirlas en el fichero `.env` del repositorio clonado: `load_dotenv()` no sobrescribe
variables que ya existen en el proceso, así que las del entorno ganan, y no dejas una
clave en texto plano dentro de un clon de git.

### Registro en el cliente

Ya está incluido en `mcp/mcp.json` de este repositorio:

```json
{
  "mcpServers": {
    "domino_server": {
      "type": "stdio",
      "command": "uv",
      "args": ["--directory", "${DOMINO_MCP_DIR}", "run", "domino_mcp_server.py"],
      "env": {
        "DOMINO_HOST": "${DOMINO_HOST}",
        "DOMINO_API_KEY": "${DOMINO_API_KEY}"
      }
    }
  }
}
```

Para otros clientes, `domino_mcp_setup.py config --client vscode|cursor` imprime el
bloque correcto. Diferencias reales entre ellos:

- **VS Code** usa la clave `servers`, no `mcpServers`, en `.vscode/mcp.json`.
- **Cursor** usa `.cursor/mcp.json` y **no interpola `${VAR}`**: ahí sí hace falta el
  fichero `.env` dentro del directorio del servidor.

### Ficheros de contexto en el proyecto de datos

Sin ellos el asistente no sabe contra qué proyecto trabaja ni cuándo usar Domino:

```bash
python scripts/domino_mcp_setup.py rules --out .
```

Genera `.github/instructions/domino.instructions.md` (las reglas, con cabecera
`applyTo: '**'`) y `domino_project_settings.md` (el proyecto y su propietario).
Con `--cursor` añade además `.cursor/rules/domino-project-rule.mdc`.

En Cursor hay que marcar la regla como **"Always"** en los ajustes para que se aplique
siempre.

### Verificación

```bash
python scripts/domino_mcp_setup.py check
```

Revisa variables, detecta la colisión de `DOMINO_API_HOST`, prueba la conexión y lista
tus proyectos con su propietario y si son DFS o Git.

Después, **reinicia el cliente**: los MCP servers se cargan al arrancar.

---

## MCP o CLI: cuál usar

No compiten, se complementan.

| Necesitas | Usa | Por qué |
|---|---|---|
| Iterar rápido hablando con el asistente | **MCP** | El asistente lanza y lee solo |
| GPU o un tier concreto | **CLI** | El MCP no elige tier |
| Ejecutar un commit exacto | **CLI** | El MCP no fija refs de Git |
| Logs en streaming en vivo | **CLI** (`--follow`) | El MCP devuelve stdout al acabar |
| stderr o el log de preparación | **CLI** (`--log-type`) | El MCP solo da stdout |
| Encadenar en un script o CI | **CLI** | Devuelve código de salida 0/1 |
| Sincronizar ficheros en proyecto DFS | **MCP** | Tiene las funciones de sync |
| Entregable reproducible para cliente | **CLI** | Commit y revisión de entorno fijados |

Un patrón que funciona bien: **explora y depura con el MCP**, y cuando el análisis ya
sale bien, **lanza el run definitivo con el CLI** fijando commit y tier.

---

## Problemas frecuentes

**El asistente no ve las herramientas.** Reinicia el cliente. En Cursor,
*Settings > Context > Model Context Protocol* debe listar `domino_server`.

**401 o 403.** La API key es inválida, está revocada, o tu instancia es 6.3+ y las ha
desactivado. Genera una nueva; si sigue fallando, tu Domino exige PAT y hay que
parchear `_get_auth_headers()`.

**Connection refused a localhost:8899 estando en local.** Tienes `DOMINO_API_HOST`
definida. Bórrala.

**El Job ejecuta código viejo.** No hiciste push. Es *el* error clásico, tanto que el
README oficial le dedica un aviso: el asistente a veces se olvida de commitear. En
proyectos Git-based, Domino ejecuta lo que hay en el repositorio remoto.

**Las funciones de ficheros fallan.** Solo sirven en proyectos DFS. En Git-based el
código entra por `git push`.

**Respuesta que no es JSON.** La URL apunta a una página de login: revisa `DOMINO_HOST`
y si necesitas VPN.
