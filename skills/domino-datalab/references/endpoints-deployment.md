# Domino Endpoints — desplegar modelos como API

Un **Domino Endpoint** es una API HTTP construida alrededor de tu código de inferencia.
Domino empaqueta los ficheros del proyecto como una aplicación Flask (Python) o Plumber
(R), junto con el compute environment, y añade una capa de autenticación y balanceo.

Detalle clave de rendimiento: **el script se ejecuta una sola vez al publicar**. Los
objetos y funciones que cree quedan en memoria y cada petición solo invoca la función.
La inicialización cara (cargar un modelo `.binpb`, abrir conexiones) ocurre una vez, no
en cada request.

> Para un MMM Meridian esto encaja bien: se carga el modelo entrenado al publicar y
> cada petición solo evalúa un escenario de presupuesto.

---

## Síncrono o asíncrono

| | **Síncrono** | **Asíncrono** |
|---|---|---|
| Uso | Predicción interactiva, baja latencia | Cargas computacionalmente pesadas |
| Interfaz | Petición → respuesta | Se encola y se hace polling del resultado |
| Límite de payload | — | **10 KB** en petición y respuesta |
| Vida de la petición | — | Se mantiene viva **30 minutos** |
| Resultados | En la respuesta | En un almacén externo que defines tú |
| Paquete extra | — | `seldon-core` |

En asíncrono los payloads se pasan **por referencia** (una ruta o un identificador), no
por valor: 10 KB no dan para un dataset.

---

## Paquetes obligatorios en el entorno

**Python** — Domino da error si faltan: `uWSGI`, `Flask`, `Six`, `prometheus-client`.
Los endpoints asíncronos añaden `seldon-core`.

**R** — `plumber`, `future`, `openmetrics`. Domino intenta instalarlos de CRAN si no
están. R **no** soporta endpoints asíncronos ni registro en el Model Registry.

Todos vienen preinstalados en las variantes del Compute Environment de Domino **salvo
la imagen mínima**, que no trae `seldon-core` ni `mlflow`.

---

## Formas de desplegar

### Desde la UI

**Deployments > Endpoints > Create Domino Endpoint** → nombre, descripción, fichero y
función de predicción, entorno, escalado (instancias y recursos, con GPU si el admin la
ha configurado) y **Request Type**: Sync o Async.

### Desde un Job programado

Al programar un Job, rellena **Update Domino Endpoint**. Domino usa el estado de los
ficheros del proyecto *después* del run para construir y desplegar una nueva versión del
endpoint. Es el patrón para **reentrenar con datos frescos y republicar** en cadencia.

### Desde el API

```bash
curl -X POST "$DOMINO_API_HOST/api/modelServing/v1/modelApis" \
  -H "Authorization: Bearer $DOMINO_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "mmm-melia-escenarios",
    "description": "Evalua escenarios de presupuesto sobre el MMM entrenado",
    "environmentId": "665e...",
    "hardwareTierId": "small-k8s",
    "environmentVariables": [],
    "isAsync": false,
    "strictNodeAntiAffinity": false,
    "replicas": 1,
    "version": {
      "projectId": "665f...",
      "monitoringEnabled": true,
      "logHttpRequestResponse": false,
      "shouldDeploy": true,
      "source": {
        "type": "project",
        "file": "endpoints/predict_mmm.py",
        "function": "evaluar_escenario"
      }
    }
  }'
```

Campos obligatorios (`*` en el OpenAPI): `name`, `description`, `environmentId`,
`environmentVariables`, `isAsync`, `strictNodeAntiAffinity`, `version`.
Dentro de `version`: `projectId`, `monitoringEnabled`, `logHttpRequestResponse`,
`source`. Dentro de `source`: `type`.

`source` admite código del proyecto (`file` + `function`, con `excludeFiles`) o un
modelo del registro (`registeredModelName` + `registeredModelVersion`).

Opcionales útiles: `bundleId` (bundle de gobernanza), `resourceQuotaId`,
`commitId` (fija la versión de código), `recordInvocation`,
`predictionDatasetResourceId`, `provenanceCheckpointId`.

---

## Endpoints del API para gestionarlos

```bash
GET    /api/modelServing/v1/modelApis                                    # listar
POST   /api/modelServing/v1/modelApis                                    # crear
GET    /api/modelServing/v1/modelApis/{id}                               # detalle
PUT    /api/modelServing/v1/modelApis/{id}                               # actualizar
DELETE /api/modelServing/v1/modelApis/{id}                               # borrar

GET    /api/modelServing/v1/modelApis/{id}/versions                      # versiones
POST   /api/modelServing/v1/modelApis/{id}/versions                      # nueva versión
GET    /api/modelServing/v1/modelApis/{id}/versions/{vid}/buildLogs      # log de build
GET    /api/modelServing/v1/modelApis/{id}/versions/{vid}/instanceLogs   # log de ejecución
GET    /api/modelServing/v1/modelApis/{id}/versions/{vid}/exportLogs     # log de export

# Control de acceso
GET/PUT  /api/modelServing/beta/modelApis/{id}/visibility
GET/POST /api/modelServing/beta/modelApis/{id}/collaborators
PUT/DELETE /api/modelServing/beta/modelApis/{id}/collaborators/{collaboratorId}

# Model Deployments (ciclo de vida del despliegue)
GET    /api/modelServing/v1/modelDeployments
POST   /api/modelServing/v1/modelDeployments
PATCH  /api/modelServing/v1/modelDeployments/{id}
POST   /api/modelServing/v1/modelDeployments/{id}/start
POST   /api/modelServing/v1/modelDeployments/{id}/stop
GET    /api/modelServing/v1/modelDeployments/{id}/logs/{logSuffix}
GET    /api/modelServing/v1/modelDeployments/{id}/credentials/{operationType}
```

`buildLogs` e `instanceLogs` son el primer sitio donde mirar cuando un endpoint no
arranca.

---

## Formato de las peticiones

Las peticiones van en JSON. Cómo formatearlas depende de cómo escribiste la función:

| Firma de la función | JSON a enviar |
|---|---|
| `mi_funcion(x, y, z)` | `{"data": {"x": 1, "y": 2, "z": 3}}` o `{"parameters": [1, 2, 3]}` |
| `mi_funcion(dict)` que usa `dict["x"]` | `{"parameters": [{"x": 1, "y": 2, "z": 3}]}` — **solo array** |
| `mi_funcion(x, **kwargs)` | `{"data": {"x": 1, "y": 2, "z": 3}}` |

Conversión de tipos JSON → Python / R:

| JSON | Python | R |
|---|---|---|
| dictionary | dict | named list |
| array | list | list |
| string | str | character |
| number (int) | int | integer |
| number (real) | float | numeric |
| true / false | True / False | TRUE / FALSE |
| null | None | N/A |

El resultado de tu función se serializa a JSON en la respuesta.

Para probar: pestaña **Tester** del endpoint en la UI, y la ventana **Request**, que
además genera ejemplos de código en varios lenguajes.

---

## Diferencias del entorno de un endpoint (importante)

Un endpoint **no** se comporta como un Job o un Workspace:

- **Ruta de montaje distinta:** los ficheros del proyecto se montan en
  `/mnt/<username>/<project_name>`, **no** en `/mnt`. Usa `$DOMINO_WORKING_DIR`.
- **No lee `requirements.txt`** ni ejecuta los scripts pre/post-setup ni pre/post-run del
  entorno. Lo que haga falta instalar va en el `Dockerfile` del entorno.
- **No hereda las variables de entorno del proyecto.** Se definen aparte, en la página de
  ajustes del propio endpoint. La separación es deliberada.
- **Corre con `uid`/`gid` 12574** (usuario `domino`). Ese usuario debe existir en la
  imagen del entorno.
- El build usa el **último `USER`** declarado en el `Dockerfile` del entorno (pon
  `USER root` si el build lo necesita).
- **`.modelignore`** en la raíz del proyecto excluye ficheros de la imagen del endpoint.
- Los ficheros del proyecto y los repos Git se copian **en el momento del build**.
  Arrancar o parar el endpoint no los actualiza: hay que **crear una versión nueva**.

### Volúmenes de Kubernetes (solo síncronos)

**Endpoints > [tu endpoint] > Settings > Advanced > Add Volume**: nombre, mount path,
path del nodo y permiso de lectura/escritura. Solo se soportan `hostPaths`.

---

## Despliegue en un Data Plane remoto

Se puede alojar el endpoint en un cluster distinto de donde se entrenó, por escalabilidad
o por proximidad al dato. En el formulario **New Model Endpoint**, elige el hardware tier
asociado al data plane deseado en **Deployment Target**. Domino expone una URL local a
ese cluster y el movimiento de datos queda restringido a él.

> **Limitaciones:** los endpoints en data plane remoto **no** soportan peticiones
> asíncronas ni monitorización integrada de modelos.

---

## Alternativas al endpoint en tiempo real

| Opción | Cuándo |
|---|---|
| **Batch scoring Job** | Puntuar lotes grandes; no necesitas latencia baja |
| **Host an LLM** | Servir un LLM con vLLM sobre GPU y API compatible con OpenAI |
| **Deploy to SageMaker** | Autoescalado y streaming de AWS |
| **Export to NVIDIA Fleet Command** | Despliegue en el edge |
| **Export to Snowflake** | Llevar el modelo donde vive el dato |
| **Model Export API** | Integrar con un CI/CD ya existente |

Para un MMM, lo habitual **no** es un endpoint en tiempo real: el entregable es un
informe. El endpoint tiene sentido cuando el cliente quiere consultar escenarios de
presupuesto de forma interactiva.

---

## Seguridad y escalado

Páginas específicas de la documentación oficial:

- *Domino endpoint security*: visibilidad del endpoint y autorización de predicciones.
- *Select Domino endpoint authorization mode*: modo sin restricción frente a restringido.
- *Domino endpoint scaling and routing*: escalar entre instancias y hardware tiers.
- *Monitor model endpoints*: CPU, memoria, tráfico y estado.
- *Set up prediction capture*: instrumentar el endpoint para monitorización de deriva.
