# Recorrido técnico de los notebooks oficiales de Meridian GeoX

Este documento sirve como referencia interna anti-alucinación para recorrer celda a celda los notebooks oficiales de `meridian_geox` y adaptar su flujo de diseño y análisis en un repositorio de WPP Media.

## Fuentes verificadas

- Fuente principal leída: `geox-repo-research.md`, sección 13 completa, líneas 1176-1790.
- Complementos leídos: sección 5 (`api.py` — tipos, enums y dataclasses) y sección 6 (formato de datos de entrada).
- Repositorio investigado: `google/meridian-geox`, branch `main`, commit de referencia `f28de1ac94f74d81f1fde91d8bdb9b438a42fd62`.
- Ubicación oficial de notebooks: `google/meridian-geox:meridian_geox/colab/`.

## 1. Introducción

Los notebooks oficiales viven en:

```text
google/meridian-geox:meridian_geox/colab/
```

Hay dos notebooks:

| Notebook | Caso de uso | Descripción oficial resumida |
|---|---|---|
| `meridian_geox_single_cell_colab.ipynb` | Experimento de una celda | Prueba exactamente una intervención de marketing (`Treatment`) frente a un grupo base (`Control`) dentro de un único experimento. |
| `meridian_geox_multicell_colab.ipynb` | Experimento multi-celda | Prueba varias intervenciones de marketing (`Treatments`) frente a un grupo base común (`Control`) dentro de un único experimento. |

Ambos comparten la misma estructura general:

1. **Design**: cargar histórico pretest, normalizar columnas, configurar diseño, restricciones y quality checks, ejecutar `geox.run_design()`.
2. **Analysis**: tras finalizar el experimento real, cargar datos pretest + test, cargar el diseño elegido, configurar `AnalysisConfig` y ejecutar `geox.analyze()`.
3. **Compare designs**: comparar configuraciones alternativas con `geox.compare_designs()`.
4. **Concatenate designs**: concatenar reportes de diseños con `geox.concat_design_reports()`.

## 2. Celdas comunes a ambos notebooks

Estas celdas aparecen documentadas como idénticas o comunes en la fuente principal.

### 2.1 Instalación

Código real:

```python
# Install meridian-geox: from PyPI @ latest release
!pip install --upgrade meridian-geox
```

Qué hace y por qué:

- Instala o actualiza `meridian-geox` desde PyPI dentro del runtime de Colab.
- Es la forma usada por los notebooks para garantizar que el paquete está disponible antes de importar `meridian_geox`.
- La fuente complementaria indica que `meridian-geox` requiere Python `>=3.10`; si se instala junto a Meridian MMM, el requisito pasa a Python `>=3.11`.

### 2.2 Imports y configuración global

Código real:

```python
import datetime
from pprint import pprint
import warnings
from IPython.display import display
import meridian_geox as geox
import pandas as pd

warnings.filterwarnings("ignore", category=FutureWarning)
warnings.filterwarnings("ignore", category=UserWarning)
warnings.filterwarnings("ignore", category=DeprecationWarning)
warnings.filterwarnings(
    "ignore",
    message="invalid value encountered in divide",
    category=RuntimeWarning,
)

pd.set_option("display.max_columns", None)

meridian_geox_root = None
```

Qué hace y por qué:

- `datetime` se usa para construir `datetime.timedelta(days=30)` en `DesignConfig`.
- `pprint` facilita inspeccionar diseños y resultados complejos.
- `warnings.filterwarnings(...)` reduce ruido visual en Colab.
- `display` muestra DataFrames con formato notebook.
- `import meridian_geox as geox` es el patrón correcto: el paquete raíz re-exporta las funciones y clases públicas (`run_design`, `analyze`, `plot_design`, `plot_analysis`, `DesignConfig`, `Constraints`, etc.).
- `pd.set_option("display.max_columns", None)` evita que se oculten columnas relevantes en tablas como `design_metrics`.
- `meridian_geox_root = None` permite que las celdas posteriores sepan si Google Drive fue montado o no.

### 2.3 Montaje opcional de Google Drive

Código real:

```python
# If you prefer to save the design in Google Drive, run this cell.
import os
from google.colab import drive

drive_mount = '/content/drive'
drive.mount(drive_mount, force_remount=True)

# Optional: specify a subfolder to organize your runs
subfolder = ''  # @param {"type":"string", "placeholder": "e.g., my_geox_project"}

# Define the root path specifically for GeoX designs and reports
meridian_geox_root = f'{drive_mount}/MyDrive/{subfolder}'

# Create the directory if it doesn't exist
if not os.path.exists(meridian_geox_root):
  os.makedirs(meridian_geox_root)
  print(f'Created directory: {meridian_geox_root}')
else:
  print(f'Using directory: {meridian_geox_root}')
```

Qué hace y por qué:

- Monta Google Drive para persistir diseños exportados a JSON.
- Define `meridian_geox_root` como carpeta raíz de trabajo.
- Crea la carpeta si no existe.
- Las celdas de guardado y carga de JSON comprueban después si `meridian_geox_root` está definido; si no lo está, usan memoria de sesión.

## 3. Notebook SINGLE-CELL (`meridian_geox_single_cell_colab.ipynb`)

El notebook single-cell se describe oficialmente así:

> "A Single-Cell design tests exactly one marketing intervention (Treatment) against a baseline control group (Control) within a single experiment."

### 3.1 Sección 1 — Design

#### C1 — Carga de datos de diseño

Código real:

```python
# Load the design data
single_cell_design_data = pd.read_csv(
    "https://raw.githubusercontent.com/google/meridian-geox/refs/heads/main/meridian_geox/data/example_design_data_single_cell.csv"
)
# Preview the first few rows to ensure it loaded correctly
single_cell_design_data.head()
```

Qué hace y por qué:

- Descarga el CSV oficial de diseño single-cell desde GitHub.
- Carga los datos en un `pd.DataFrame`.
- Muestra las primeras filas para validar visualmente que la descarga y el parseo fueron correctos.
- Según la fuente complementaria, este dataset usa formato long, una fila por `(date, location)`, granularidad diaria y columnas `date`, `location`, `conversions`, `spend`.

Cabecera real del dataset:

```csv
date,location,conversions,spend
2020-01-01,10,1217.186754,13.961282
2020-01-01,103,478.7548505,5.360182842
2020-01-01,105,1077.686355,11.0703539
2020-01-01,108,347.5165323,4.956830216
2020-01-01,11,914.8362022,10.87281349
```

#### C2 — Mapeo de columnas parametrizable

Código real:

```python
date_column_name = "date"  # @param {type:"string"}
location_column_name = "location"  # @param {type:"string"}
conversions_column_name = "conversions"  # @param {type:"string"}
spend_column_name = "spend"  # @param {type:"string"}

single_cell_design_data.columns = single_cell_design_data.columns.str.lower()

rename_mapping = {
    date_column_name.lower(): "date",
    location_column_name.lower(): "location",
    conversions_column_name.lower(): "conversions",
}

# Make spend column optional
if (
    spend_column_name
    and spend_column_name.lower() in single_cell_design_data.columns
):
  rename_mapping[spend_column_name.lower()] = "spend"

# Rename the columns in the dataframe to match the library's expected names
single_cell_design_data = single_cell_design_data.rename(columns=rename_mapping)

print("Columns mapped successfully!")
display(single_cell_design_data.head())
```

Qué hace y por qué:

- Permite adaptar nombres de columnas de un dataset propio al schema esperado por `meridian_geox`.
- Normaliza todos los nombres a minúsculas.
- Renombra las columnas obligatorias a `date`, `location`, `conversions`.
- Añade `spend` al mapeo solo si el usuario ha indicado un nombre y esa columna existe.
- La fuente complementaria confirma que `spend` es opcional en general, pero requerido para experimentos `GO_DARK` o `HEAVY_UP`; en `HOLDBACK` puede omitirse si se usa `cost_per_incremental_conversion`.

#### C3 — Casteo de tipos

Código real:

```python
numeric_cols = ["conversions"]
if "spend" in single_cell_design_data.columns:
  numeric_cols.append("spend")

for colname in numeric_cols:
  single_cell_design_data[colname] = pd.to_numeric(
      single_cell_design_data[colname]
  )
single_cell_design_data["date"] = pd.to_datetime(
    single_cell_design_data["date"]
)
single_cell_design_data["location"] = single_cell_design_data[
    "location"
].astype(str)
single_cell_design_data.head()
```

Qué hace y por qué:

- Convierte `conversions` a numérico.
- Convierte `spend` a numérico si existe.
- Convierte `date` a `pd.Timestamp`.
- Convierte `location` a `str`, como exige el schema de `DataSchema`.
- Muestra una vista previa para validar la transformación.

#### C4 — Configuración del diseño y restricciones

Código real:

```python
single_cell_design_config = geox.DesignConfig(
    experiment_duration=datetime.timedelta(days=30),
    experiment_types=geox.ExperimentType.HOLDBACK,
    methodology=geox.Methodology.TBR,
    geo_assignment_rule=geox.GeoAssignmentRule.STRATIFIED_SAMPLING,
    cost_per_incremental_conversion=1,
    cell_count=1,
    design_output_count=5,
)
single_cell_constraints = geox.Constraints(
    excluded_geos={"105"},
    budget_constraint=geox.Budget(budget=500000),
    max_conversions_percent=0.3,
)
```

Qué hace y por qué:

- Define un experimento de 30 días.
- Usa `HOLDBACK`: una campaña o inversión nueva se lanza solo en tratamiento y se compara contra control.
- Usa metodología `TBR`, la única metodología implementada según la fuente complementaria; `SDID` está declarado, pero no implementado.
- Usa asignación `STRATIFIED_SAMPLING`.
- Define `cost_per_incremental_conversion=1`; para `HOLDBACK`, este valor se normaliza internamente por celda.
- Define `cell_count=1`, porque es single-cell.
- Solicita 5 diseños candidatos en la salida.
- Excluye explícitamente el geo `"105"`.
- Aplica un presupuesto absoluto con `geox.Budget(budget=500000)`.
- Limita el porcentaje máximo de conversiones en tratamiento a `0.3`.

#### C5 — Configuración de calidad de datos

Código real:

```python
exclude_geos_no_response = True  # @param {type:"boolean"}
exclude_outlier_dates_design = True  # @param {type:"boolean"}

design_data_quality_check_config = geox.QualityCheckConfig(
    exclude_geos_no_response=exclude_geos_no_response,
    exclude_outlier_dates=exclude_outlier_dates_design,
)
```

Qué hace y por qué:

- Activa la exclusión de geos sin respuesta durante la fase de diseño.
- Activa la exclusión de fechas outlier.
- Construye `QualityCheckConfig`, que se pasa a `geox.run_design()`.
- La fuente complementaria documenta que `exclude_geos_no_response` es específico de fase de diseño.

#### C6 — Ejecución del diseño

Código real:

```python
print("\nDesigning experiment...")
single_cell_design_set = geox.run_design(
    single_cell_design_data,
    single_cell_design_config,
    single_cell_constraints,
    design_data_quality_check_config,
)
```

Qué hace y por qué:

- Ejecuta el pipeline de diseño con datos, configuración, restricciones y quality checks.
- Devuelve un `DesignSet`.
- Según la fuente complementaria, `DesignSet` contiene:
  - `designs: dict[str, Design]`
  - `design_metrics: DataFrame`
- La firma real es:

```python
def run_design(
    data: pd.DataFrame,
    design_config: api.DesignConfig,
    constraints: api.Constraints,
    data_quality_check_config: api.QualityCheckConfig = api.QualityCheckConfig(),
    design_scorer: Optional[Callable[..., Any]] = None,
) -> api.DesignSet:
  """Designs GeoX experiments."""
```

#### C7 — Revisión de `design_metrics`

Código real:

```python
single_cell_design_set.design_metrics
```

Qué hace y por qué:

- Muestra la tabla de métricas de diseños candidatos.
- La fuente complementaria documenta estas columnas de `design_metrics`: `design_id`, `cell`, `design_methodology`, `r2`, `mde`, `mde_abs`, `p_value (AA)`, `budget`, `design_implied_cpic`, `treatment_conversions_pct`, `treatment_geo_count`.
- El ranking se hace por el MDE máximo entre celdas, ascendente: menor MDE es mejor.

#### C8 — Selección del mejor diseño por MDE si no se indica ID manual

Código real:

```python
single_cell_selected_design_id = ""  # @param {type:"string"}

if not single_cell_selected_design_id.strip():
  single_cell_selected_design_id = single_cell_design_set.design_metrics[
      "design_id"
  ].iloc[0]
  print(
      "Automatically selected top ranked design ID:"
      f" {single_cell_selected_design_id}"
  )
else:
  print(f"Manually selected design ID: {single_cell_selected_design_id}")
```

Qué hace y por qué:

- Permite introducir manualmente un `design_id`.
- Si el parámetro está vacío, selecciona automáticamente la primera fila de `design_metrics`.
- Como la tabla está rankeada por MDE, esa primera fila corresponde al diseño mejor rankeado según el criterio documentado.

#### C9 — Filtrado del diseño por ID

Código real:

```python
# Filter the design based on the selected ID
if single_cell_selected_design_id in single_cell_design_set.designs:
  selected_design = single_cell_design_set.designs[
      single_cell_selected_design_id
  ]
  print(f"Successfully selected design: {single_cell_selected_design_id}")
  pprint(selected_design)
else:
  print(
      "Error: Design ID not found. Please enter a valid ID from the metrics"
      " table above."
  )
```

Qué hace y por qué:

- Verifica que el `design_id` existe como clave del diccionario `single_cell_design_set.designs`.
- Extrae el objeto `Design` elegido.
- Imprime el diseño con `pprint` para revisar geos de tratamiento, control, exclusiones, restricciones y resultados por celda.

#### C10 — CpIC implícito

Código real:

```python
selected_design = single_cell_design_set.designs[single_cell_selected_design_id]
print(
    "Design implied CpIC:"
    f" {selected_design.designs['cell_1'].design_implied_cpic}"
)
```

Qué hace y por qué:

- Recupera el diseño seleccionado.
- Accede a la única celda, `cell_1`.
- Imprime `design_implied_cpic`.
- La fuente complementaria indica que el notebook recomienda comparar el *Implied CpIC* con el *Expected CpIC*: si `Implied < Expected`, el test está infrapotenciado y habría que subir presupuesto o duración. Para `HOLDBACK`, el implied CpIC coincide con el CpIC de input.

#### C11 — Resultado de quality checks

Código real:

```python
# If the output below shows empty sets, no outlier geos or dates were detected.
selected_design.quality_check_result
```

Qué hace y por qué:

- Muestra el objeto `QualityCheckResult`.
- Si los sets están vacíos, no se detectaron geos outlier ni fechas outlier.
- La dataclass documentada contiene `quality_check_config`, `quality_metrics`, `outlier_geos` y `outlier_dates`.

#### C12 — Métricas de calidad de datos

Código real:

```python
# Show all data quality check results.
if selected_design.quality_check_result is not None:
  design_quality_metrics = selected_design.quality_check_result.quality_metrics
  if design_quality_metrics.empty:
    print("No data quality issues identified.")
  else:
    display(design_quality_metrics)
else:
  print("No quality check result available.")
```

Qué hace y por qué:

- Comprueba si existe `quality_check_result`.
- Si existe, extrae `quality_metrics`.
- Si la tabla está vacía, comunica que no se detectaron incidencias.
- Si contiene filas, las muestra con `display`.
- Si no hay resultado disponible, imprime un mensaje explícito.

#### C13 — Visualización del diseño

Código real:

```python
geox.plot_design(single_cell_design_set.designs[single_cell_selected_design_id])
```

Qué hace y por qué:

- Visualiza la alineación pretest del diseño seleccionado.
- La fuente complementaria documenta que `plot_design()` genera una figura por celda, con dos series: `observed` y `counterfactual`, y título `Observed vs Counterfactual total conversions ({cell_id})`.

#### C14 — Export del diseño a JSON

Código real:

```python
single_cell_saved_design_json = single_cell_design_set.designs[
    single_cell_selected_design_id
].export_to_json()
single_cell_saved_design_json
```

Qué hace y por qué:

- Serializa el objeto `Design` seleccionado a JSON.
- Guarda el texto JSON en memoria de sesión.
- El método real documentado es:

```python
def export_to_json(self) -> str:
  """Exports the design to a JSON file."""
  return pydantic.TypeAdapter(Design).dump_json(self).decode()
```

#### C15 — Guardado del JSON en Google Drive

Código real:

```python
# Write the JSON string to a file on Google Drive if mounted to Google Drive
if meridian_geox_root:
  single_cell_design_file_path = os.path.join(
      meridian_geox_root, "single_cell_design.json"
  )
  with open(single_cell_design_file_path, "w") as f:
    f.write(single_cell_saved_design_json)
  print(
      "Design successfully saved to Google Drive at:"
      f" {single_cell_design_file_path}"
  )
else:
  print("Google Drive not mounted. Design exists in session memory only.")
```

Qué hace y por qué:

- Si Google Drive está montado, escribe el JSON en `single_cell_design.json`.
- Si no lo está, deja el diseño solo en memoria.
- Este paso permite separar diseño y análisis: el análisis puede ejecutarse después de que el experimento real haya finalizado, cargando exactamente el diseño que se eligió.

### 3.2 Sección 2 — Analysis

Notas oficiales documentadas en la fuente:

> "Post-experiment analysis (Run AFTER the experiment has completed)."

> "Dataset must include historical pretest data and test period data with optional cooldown period data."

#### C16 — Carga de datos de análisis

Código real:

```python
# Load the analysis data
single_cell_analysis_data = pd.read_csv(
    "https://raw.githubusercontent.com/google/meridian-geox/refs/heads/main/meridian_geox/data/example_analysis_data_single_cell_holdback.csv"
)
single_cell_analysis_data.head()
```

Qué hace y por qué:

- Descarga el dataset oficial de análisis single-cell holdback.
- Este dataset debe incluir datos históricos pretest y datos del periodo de test; puede incluir cooldown.
- Muestra las primeras filas.

#### C17 — Mapeo y casteo de columnas de análisis

Código real documentado:

```text
(Mapeo de columnas y casteo idénticos a los del diseño.)
```

La fuente principal no reproduce la celda completa de mapeo y casteo para `single_cell_analysis_data`; dice explícitamente que son idénticos a los del diseño. Por tanto, no se inventa una celda nueva aquí. La adaptación esperada es aplicar la misma lógica de C2 y C3 sustituyendo `single_cell_design_data` por `single_cell_analysis_data`.

#### C18 — Nombre del fichero de diseño

Código real:

```python
design_file_name = "single_cell_design.json"  # @param {type:"string"}
```

Qué hace y por qué:

- Define el nombre del JSON que se intentará cargar desde Google Drive.
- Coincide con el nombre escrito en C15.

#### C19 — Carga del diseño desde JSON con fallback a memoria

Código real:

```python
# Try to load the design from Google Drive, with a fallback to session memory.
single_cell_loaded_design = None

if meridian_geox_root:
  single_cell_design_file_path = os.path.join(
      meridian_geox_root, design_file_name
  )
  if os.path.exists(single_cell_design_file_path):
    with open(single_cell_design_file_path, "r") as f:
      single_cell_design_json_text = f.read()
    single_cell_loaded_design = geox.Design.load_from_json(
        single_cell_design_json_text
    )
    print(
        "Design successfully loaded from Google Drive:"
        f" {single_cell_design_file_path}"
    )
  else:
    print(
        f"Design file not found at {single_cell_design_file_path}. Will try to"
        " load from session memory."
    )

if single_cell_loaded_design is None:
  try:
    single_cell_loaded_design = geox.Design.load_from_json(
        single_cell_saved_design_json
    )
    print("Design successfully loaded from session memory.")
  except NameError:
    print(
        "Error: Design data not found on Drive or in memory. Please run the"
        " design step first."
    )
```

Qué hace y por qué:

- Inicializa `single_cell_loaded_design` como `None`.
- Si `meridian_geox_root` existe, busca `single_cell_design.json` en Drive.
- Si el fichero existe, lee el texto JSON y lo carga con `geox.Design.load_from_json(...)`.
- Si el fichero no existe, avisa y pasa al fallback.
- Si no se cargó desde Drive, intenta cargar desde la variable de memoria `single_cell_saved_design_json`.
- Si esa variable tampoco existe, imprime un error que indica que hay que ejecutar primero la fase de diseño.

Método real documentado:

```python
@classmethod
def load_from_json(cls, json_str: str) -> "Design":
  """Loads the design from a JSON file."""
  return pydantic.TypeAdapter(cls).validate_json(json_str)
```

#### C20 — Configuración de quality checks para análisis

Código real:

```python
exclude_outlier_dates_analysis = True  # @param {type:"boolean"}

analysis_data_quality_check_config = geox.QualityCheckConfig(
    exclude_outlier_dates=exclude_outlier_dates_analysis,
)
```

Qué hace y por qué:

- Configura la exclusión de fechas outlier durante el análisis.
- No configura `exclude_geos_no_response`, porque la fuente complementaria indica que ese campo es específico de diseño.

#### C21 — `AnalysisConfig` y ejecución de `analyze`

Código real:

```python
# Analyze experiment results
print("\nAnalyzing experiment results...")
single_cell_analysis_config = geox.AnalysisConfig(
    design=single_cell_loaded_design,
    analysis_start_date=pd.to_datetime("2020-04-01"),
    analysis_end_date=pd.to_datetime("2020-04-30"),
)
single_cell_analysis_result = geox.analyze(
    single_cell_analysis_data,
    single_cell_analysis_config,
    analysis_data_quality_check_config,
)
```

Qué hace y por qué:

- Construye `AnalysisConfig` con el diseño cargado y el periodo de análisis.
- Usa `analysis_start_date` y `analysis_end_date` como límites del test.
- Ejecuta `geox.analyze(...)` con los datos de análisis y la configuración de quality checks.
- La fuente complementaria documenta que, si no se proporciona `pretest_end_date`, todo lo anterior a `analysis_start_date` se usa como pretest.

Firma real:

```python
def analyze(
    data: pd.DataFrame,
    analysis_config: api.AnalysisConfig,
    data_quality_check_config: api.QualityCheckConfig = api.QualityCheckConfig(),
) -> api.AnalysisResult:
  """Analyzes a GeoX experiment."""
```

#### C22 — Inspección general de resultados

Código real:

```python
print(f"Analysis result:")
pprint(single_cell_analysis_result.results)
```

Qué hace y por qué:

- Imprime el diccionario `results`.
- En single-cell, el acceso relevante es `single_cell_analysis_result.results["cell_1"]`.
- La fuente complementaria documenta que `AnalysisResult.results` es `dict[str, AnalysisMetrics]`.

#### C23 — Primeros 5 días de `cumulative_lift`

Código real:

```python
# Show first 5 days of the time series data.
single_cell_analysis_result.results["cell_1"].cumulative_lift.head(5)
```

Qué hace y por qué:

- Muestra los primeros 5 días de lift acumulado para `cell_1`.
- La fuente complementaria documenta que `cumulative_lift` tiene índice `test_dates` y columnas `['lift', 'lower_bound', 'upper_bound']`.

#### C24 — Primeros 5 días de `cumulative_icpd` si hay spend

Código real:

```python
if "spend" in single_cell_analysis_data.columns:
  display(single_cell_analysis_result.results["cell_1"].cumulative_icpd.head(5))
else:
  print(
      "Cumulative iCPD is not available because the 'spend' column was not"
      " provided."
  )
```

Qué hace y por qué:

- Solo muestra `cumulative_icpd` si existe columna `spend`.
- Si no existe, imprime un mensaje explícito.
- La fuente complementaria documenta que `cumulative_icpd` solo se puebla si hay datos de spend.

#### C25 — Visualización del análisis

Código real:

```python
geox.plot_analysis(single_cell_analysis_result)
```

Qué hace y por qué:

- Genera las visualizaciones de resultados de análisis.
- La fuente complementaria documenta que `plot_analysis()` visualiza una suite de 4 plots con timelines divididos.

Nota metodológica real del notebook:

> "A geo experiment is considered statistically inconclusive when its confidence interval includes zero."

### 3.3 Sección 3 — Compare designs

#### C26 — Comparación de diseños single-cell

Código real:

```python
comparison_design_results = geox.compare_designs(
    single_cell_design_data,
    [
        (
            geox.DesignConfig(
                experiment_duration=datetime.timedelta(days=30),
                experiment_types=geox.ExperimentType.HOLDBACK,
                methodology=geox.Methodology.TBR,
                geo_assignment_rule=geox.GeoAssignmentRule.RANDOM,
            ),
            geox.Constraints(),
        ),
        (
            geox.DesignConfig(
                experiment_duration=datetime.timedelta(days=30),
                experiment_types=geox.ExperimentType.HOLDBACK,
                methodology=geox.Methodology.TBR,
                geo_assignment_rule=geox.GeoAssignmentRule.STRATIFIED_SAMPLING,
            ),
            geox.Constraints(),
        ),
    ],
)
```

Qué hace y por qué:

- Compara dos configuraciones de diseño para los mismos datos:
  - asignación `RANDOM`;
  - asignación `STRATIFIED_SAMPLING`.
- Ambas usan `HOLDBACK`, `TBR` y duración de 30 días.
- Devuelve un `DesignSet` con diseños rankeados.

#### C27 — Selección del mejor diseño comparado por MDE

Código real:

```python
# Best design (by MDE)
comparison_selected_design_id = next(iter(comparison_design_results.designs))
pprint(comparison_design_results.designs[comparison_selected_design_id])
```

Qué hace y por qué:

- Selecciona el primer diseño del diccionario de resultados.
- La fuente documenta que los diseños están rankeados por MDE.
- Imprime el diseño seleccionado.

### 3.4 Sección 4 — Concatenate designs

#### C28 — Concatenación de reportes de diseño

Código real documentado:

```python
design_config_1 = geox.DesignConfig(
    experiment_duration=datetime.timedelta(days=30),
    experiment_types=geox.ExperimentType.HOLDBACK,
    methodology=geox.Methodology.TBR,
    geo_assignment_rule=geox.GeoAssignmentRule.RANDOM,
    cell_count=1,
)
design_set_1 = geox.run_design(
    single_cell_design_data,
    design_config_1,
    constraints=geox.Constraints(),
)
...
combined_design_set = geox.concat_design_reports([design_set_1, design_set_2])
print("Combined design metrics (ranked by mde):")
combined_design_set.design_metrics
```

Qué hace y por qué:

- Genera al menos dos `DesignSet` por separado.
- Usa `geox.concat_design_reports(...)` para combinarlos.
- Muestra las métricas combinadas rankeadas por MDE.
- La fuente principal incluye `...`, por lo que no documenta el código exacto de `design_config_2` ni de `design_set_2`; no se inventan aquí.

## 4. Notebook MULTI-CELL (`meridian_geox_multicell_colab.ipynb`)

El notebook multi-cell se describe oficialmente así:

> "A Multicell design tests multiple marketing interventions (Treatments) against a baseline control group (Control) within a single experiment."

Las celdas de instalación, imports y montaje de Drive son comunes a ambos notebooks y están documentadas en la sección 2 de este fichero. A continuación se detallan las celdas documentadas en la fuente principal y las diferencias clave frente a single-cell.

### 4.1 Sección 1 — Design

#### MC1 — Carga de datos de diseño

Código real:

```python
multicell_design_data = pd.read_csv(
    "https://raw.githubusercontent.com/google/meridian-geox/refs/heads/main/meridian_geox/data/example_design_data_multi_cell_go_dark_heavy_up.csv"
)
multicell_design_data.head()
```

Qué hace y por qué:

- Descarga el CSV oficial de diseño multi-cell.
- Carga datos para un ejemplo de dos celdas: `GO_DARK` y `HEAVY_UP`.
- Muestra primeras filas.
- La fuente complementaria documenta que este dataset tiene columnas `date`, `location`, `conversions`, `spend_cell_1`, `spend_cell_2`.

Cabecera real del dataset:

```csv
date,location,conversions,spend_cell_1,spend_cell_2
2020-01-01,10,890.7786349,91.5,91.5
2020-01-01,103,448.0623914,135.3,135.3
2020-01-01,105,546.1942811,50.4,50.4
```

Nota documentada:

> En este dataset `spend_cell_1 == spend_cell_2` porque ambas celdas modifican el mismo pool de campañas — el "Caso A" descrito en el notebook.

#### MC2 — Mapeo de columnas con dos columnas de spend

Código real:

```python
# Use two cell study as an example.
date_column_name = "date"  # @param {type:"string"}
location_column_name = "location"  # @param {type:"string"}
conversions_column_name = "conversions"  # @param {type:"string"}
spend_cell_1_column_name = "spend_cell_1"  # @param {type:"string"}
spend_cell_2_column_name = "spend_cell_2"  # @param {type:"string"}

multicell_design_data.columns = multicell_design_data.columns.str.lower()

rename_mapping = {
    date_column_name.lower(): "date",
    location_column_name.lower(): "location",
    conversions_column_name.lower(): "conversions",
}

# Make spend column optional
if (
    spend_cell_1_column_name
    and spend_cell_1_column_name.lower() in multicell_design_data.columns
):
  rename_mapping[spend_cell_1_column_name.lower()] = "spend_cell_1"
if (
    spend_cell_2_column_name
    and spend_cell_2_column_name.lower() in multicell_design_data.columns
):
  rename_mapping[spend_cell_2_column_name.lower()] = "spend_cell_2"

multicell_design_data = multicell_design_data.rename(columns=rename_mapping)
```

Qué hace y por qué:

- Adapta nombres de columnas al schema multi-cell esperado.
- En vez de una columna `spend`, usa una columna por celda: `spend_cell_1`, `spend_cell_2`, etc.
- La fuente complementaria indica que el regex aceptado para columnas multi-cell es `^spend_cell_[1-9]\d*$`.
- `spend_cell_k` es necesario para celdas `GO_DARK` o `HEAVY_UP`.

#### MC3 — Casteo de tipos

Código real documentado:

```text
La fuente principal no reproduce una celda de casteo multi-cell completa.
```

Qué se sabe por fuente complementaria:

- `date` debe convertirse a `pd.Timestamp`.
- `location` debe convertirse a `str`.
- `conversions` debe ser numérico.
- `spend_cell_1`, `spend_cell_2`, etc. deben ser numéricos y no negativos si se aportan.

No se reproduce código adicional porque la sección 13.3 no documenta la celda exacta.

#### MC4 — Configuración multi-celda (`GO_DARK` + `HEAVY_UP`)

Código real:

```python
# Design experiment
print('\nDesigning experiment...')
multicell_experiment_types = {
    'cell_1': geox.ExperimentType.GO_DARK,
    'cell_2': geox.ExperimentType.HEAVY_UP,
}
multicell_design_config = geox.DesignConfig(
    experiment_duration=datetime.timedelta(days=30),
    experiment_types=multicell_experiment_types,
    methodology=geox.Methodology.TBR,
    geo_assignment_rule=geox.GeoAssignmentRule.STRATIFIED_SAMPLING,
    cell_count=2,
    design_output_count=5,
)
multicell_budget_constraint = {
    'cell_1': geox.Budget(budget_pct=-1.0),
    'cell_2': geox.Budget(budget_pct=1.0),
}
multicell_constraints = geox.Constraints(
    excluded_geos={'105'},
    budget_constraint=multicell_budget_constraint,
    max_conversions_percent=0.3,
)
```

Qué hace y por qué:

- Define dos celdas de tratamiento.
- `cell_1` es `GO_DARK`: apagado total, representado por `budget_pct=-1.0`.
- `cell_2` es `HEAVY_UP`: incremento de inversión, representado por `budget_pct=1.0`.
- `experiment_types` es un diccionario por celda, no un escalar.
- `cell_count=2`.
- `budget_constraint` es un diccionario de `Budget` por celda.
- `max_conversions_percent=0.3` aplica al total de todas las celdas de tratamiento; la fuente complementaria indica que internamente equivale a `max_conversions / cell_count` por celda.

#### MC5 — Ejecución del diseño

Código real:

```python
multicell_design_set = geox.run_design(
    multicell_design_data,
    multicell_design_config,
    multicell_constraints,
    design_data_quality_check_config,
)
```

Qué hace y por qué:

- Ejecuta el diseño multi-cell con la misma firma de `run_design()` que single-cell.
- Reutiliza `design_data_quality_check_config` documentado en las celdas comunes/single-cell.
- Devuelve un `DesignSet` con diseños que contienen resultados por celda.

#### MC6 — Selección de diseño multi-cell

Código real documentado:

```text
La fuente principal no reproduce la celda exacta que define `multicell_selected_design_id`.
```

Qué se sabe por analogía documentada en la tabla 13.4:

- La inspección de `design_metrics` y la selección del `design_id` siguen el mismo patrón conceptual que en single-cell.
- No se reproduce código no documentado.

#### MC7 — CpIC por celda

Código real:

```python
selected_design = multicell_design_set.designs[multicell_selected_design_id]
for cell_name, cell_design in selected_design.designs.items():
  print(f"Design implied CpIC ({cell_name}): {cell_design.design_implied_cpic}")
```

Qué hace y por qué:

- Recupera el diseño seleccionado por `multicell_selected_design_id`.
- Itera por `selected_design.designs.items()`.
- Imprime `design_implied_cpic` para cada celda.
- Esta es una diferencia importante frente a single-cell, donde se accede directamente a `['cell_1']`.

#### MC8 — Quality checks y plot de diseño

Código real documentado:

```text
La fuente principal no reproduce las celdas exactas de quality checks ni `plot_design` para multi-cell.
```

Qué se sabe por API real:

- `geox.plot_design(design_to_plot)` existe y visualiza pretest alignment por celda.
- La tabla 13.4 indica que el acceso a resultados multi-cell se hace iterando `selected_design.designs.items()` o accediendo a celdas concretas.
- No se reproduce código no documentado.

#### MC9 — Export y guardado a JSON

Código real documentado:

```text
La fuente principal no reproduce las celdas exactas de export y guardado multi-cell.
```

Qué se sabe por la tabla 13.4:

- El fichero guardado para multi-cell es `multicell_design.json`.
- La API real de `Design` expone `export_to_json()` y `load_from_json()`.
- No se inventa la celda completa porque no aparece documentada en la sección 13.3.

### 4.2 Sección 2 — Analysis multi-cell

#### MC10 — Carga de datos de análisis multi-cell

Código real documentado:

```text
La fuente principal no reproduce la celda exacta de carga de `multicell_analysis_data`.
```

Qué se sabe por la lista de datasets verificada:

- Existe `meridian_geox/data/example_analysis_data_multi_cell_go_dark_heavy_up.csv` (573 KB).
- La fuente principal sí usa `multicell_analysis_data` en la llamada a `geox.analyze(...)`.
- No se reproduce un `pd.read_csv(...)` no documentado en la sección 13.3.

#### MC11 — Carga del diseño multi-cell

Código real documentado:

```text
La fuente principal no reproduce la celda exacta de carga de `multicell_loaded_design`.
```

Qué se sabe:

- La celda de análisis documentada usa `design=multicell_loaded_design`.
- La tabla 13.4 indica que el fichero guardado es `multicell_design.json`.
- La API real para cargar diseños es `geox.Design.load_from_json(...)`.
- No se reproduce una celda de carga no documentada.

#### MC12 — `AnalysisConfig` y `analyze` multi-cell

Código real:

```python
# Analyze experiment results
print("\nAnalyzing experiment results...")
multicell_analysis_config = geox.AnalysisConfig(
    design=multicell_loaded_design,
    analysis_start_date=pd.to_datetime("2020-04-01"),
    analysis_end_date=pd.to_datetime("2020-04-30"),
)
multicell_analysis_result = geox.analyze(
    multicell_analysis_data, multicell_analysis_config
)
```

Qué hace y por qué:

- Construye `AnalysisConfig` para el diseño multi-cell cargado.
- Usa el mismo periodo de análisis que el ejemplo single-cell.
- Ejecuta `geox.analyze(...)`.
- Diferencia importante: el notebook multi-cell documentado **no pasa** `analysis_data_quality_check_config`; usa el valor por defecto de la función.

#### MC13 — Resultados por celda

Código real:

```python
multicell_analysis_result.results["cell_1"].cumulative_lift.head(5)
multicell_analysis_result.results["cell_2"].cumulative_lift.head(5)
```

Qué hace y por qué:

- Accede por separado al lift acumulado de `cell_1` y `cell_2`.
- En multi-cell, `results` es un diccionario con una entrada por celda de tratamiento.
- La interpretación debe hacerse por celda, no solo a nivel global.

#### MC14 — `cumulative_icpd` para `cell_1` si hay `spend_cell_1`

Código real:

```python
if "spend_cell_1" in multicell_analysis_data.columns:
  display(multicell_analysis_result.results["cell_1"].cumulative_icpd.head(5))
else:
  print(
      "Cumulative iCPD is not available because the 'spend_cell_1' column was"
      " not provided."
  )
```

Qué hace y por qué:

- Comprueba si existe la columna de spend de `cell_1`.
- Si existe, muestra los primeros 5 días de `cumulative_icpd` para esa celda.
- Si no existe, informa de que no puede calcularse.
- La fuente principal no reproduce una celda equivalente para `cell_2`.

#### MC15 — `plot_analysis`

Código real documentado:

```text
La fuente principal no reproduce la celda exacta de `geox.plot_analysis(multicell_analysis_result)`, aunque la tabla 13.4 describe el mismo flujo end-to-end e incluye `plot_analysis`.
```

No se reproduce código no documentado.

### 4.3 Sección 3 — Compare designs multi-cell

#### MC16 — Comparación de diseños multi-cell

Código real:

```python
comparison_design_results = geox.compare_designs(
    multicell_design_data,
    [
        (
            geox.DesignConfig(
                experiment_duration=datetime.timedelta(days=30),
                experiment_types={
                    'cell_1': geox.ExperimentType.GO_DARK,
                    'cell_2': geox.ExperimentType.HEAVY_UP,
                },
                methodology=geox.Methodology.TBR,
                geo_assignment_rule=geox.GeoAssignmentRule.RANDOM,
                cell_count=2,
            ),
            geox.Constraints(),
        ),
        (
            geox.DesignConfig(
                experiment_duration=datetime.timedelta(days=30),
                experiment_types={
                    'cell_1': geox.ExperimentType.GO_DARK,
                    'cell_2': geox.ExperimentType.HEAVY_UP,
                },
                methodology=geox.Methodology.TBR,
                geo_assignment_rule=geox.GeoAssignmentRule.STRATIFIED_SAMPLING,
                cell_count=2,
            ),
            geox.Constraints(),
        ),
    ],
)
```

Qué hace y por qué:

- Compara dos reglas de asignación en un diseño de dos celdas:
  - `RANDOM`;
  - `STRATIFIED_SAMPLING`.
- Ambas configuraciones usan:
  - duración de 30 días;
  - `GO_DARK` para `cell_1`;
  - `HEAVY_UP` para `cell_2`;
  - `TBR`;
  - `cell_count=2`.

### 4.4 Sección 4 — Concatenate designs multi-cell

Código real documentado:

```text
La fuente principal no reproduce una sección de concatenación multi-cell específica.
```

Qué se sabe:

- La estructura global de ambos notebooks incluye `Concatenate designs`.
- La API real `geox.concat_design_reports([design_set_1, design_set_2])` está documentada en la sección single-cell.
- No se reproduce código no documentado para multi-cell.

## 5. Tabla comparativa single-cell vs multi-cell

| Aspecto | Single-cell | Multi-cell | Implicación práctica |
|---|---|---|---|
| Notebook | `meridian_geox_single_cell_colab.ipynb` | `meridian_geox_multicell_colab.ipynb` | Elegir según si hay una intervención o varias intervenciones simultáneas. |
| Descripción oficial | Una intervención de marketing frente a control. | Varias intervenciones frente a control común. | Multi-cell requiere interpretar resultados por celda. |
| Dataset de diseño | `example_design_data_single_cell.csv` | `example_design_data_multi_cell_go_dark_heavy_up.csv` | El formato long diario se mantiene en ambos. |
| Dataset de análisis | `example_analysis_data_single_cell_holdback.csv` | `example_analysis_data_multi_cell_go_dark_heavy_up.csv` | El análisis requiere pretest + test. |
| Columna(s) de coste | `spend` | `spend_cell_1`, `spend_cell_2`, … | En multi-cell se necesita una columna por celda. |
| Regex de spend multi-cell | No aplica | `^spend_cell_[1-9]\d*$` | Los nombres deben respetar el patrón `spend_cell_k`. |
| `experiment_types` | `geox.ExperimentType.HOLDBACK` como escalar | `dict`: `{'cell_1': GO_DARK, 'cell_2': HEAVY_UP}` | Single-cell permite escalar; multi-cell necesita mapping explícito por celda. |
| `cell_count` | `1` | `2` en el notebook documentado | Debe coincidir con el número de celdas de tratamiento. |
| `budget_constraint` | `geox.Budget(budget=500000)` | `dict` de `Budget(budget_pct=...)` por celda | `HOLDBACK` usa presupuesto absoluto; `GO_DARK`/`HEAVY_UP` usan porcentaje. |
| `Budget` para `GO_DARK` | No aplica en el ejemplo single-cell | `geox.Budget(budget_pct=-1.0)` | Negativo: apagado o reducción. |
| `Budget` para `HEAVY_UP` | No aplica en el ejemplo single-cell | `geox.Budget(budget_pct=1.0)` | Positivo: incremento de inversión. |
| `cost_per_incremental_conversion` | `1` como escalar | Opcional; dict por celda para celdas `HOLDBACK` | En el ejemplo multi-cell no se especifica porque las celdas son `GO_DARK` y `HEAVY_UP`. |
| `max_conversions_percent` | `0.3` para la única celda | `0.3` total para todas las celdas de tratamiento | La fuente indica `max_conversions / cell_count` por celda. |
| Acceso a diseño por celda | `.designs['cell_1']` | iterar `selected_design.designs.items()` | Multi-cell necesita loops o accesos por `cell_k`. |
| Acceso a resultados | `.results['cell_1']` | `.results['cell_1']` y `.results['cell_2']` | Cada celda produce sus propias métricas. |
| KPI de conversiones | Conversión o revenue de la campaña/negocio | Métrica global compartida por todas las celdas y control | En multi-cell no usar métricas atribuidas específicas por celda como KPI principal. |
| Máscara interna | `0` = control, `1` = tratamiento | `0` = control, `k` = celda k | La codificación permite control común y múltiples tratamientos. |
| `run_design` | Misma firma | Misma firma | Cambian datos/configuración/restricciones, no la función. |
| Fichero guardado | `single_cell_design.json` | `multicell_design.json` | Mantener nombres distintos para no mezclar diseños. |
| Llamada a `analyze` | Pasa `analysis_data_quality_check_config` | No lo pasa en el código documentado | Multi-cell usa default en la celda reproducida. |
| `cumulative_icpd` | Comprueba columna `spend` | Comprueba columna `spend_cell_1` en la celda documentada | El coste incremental depende del spend disponible por celda. |
| `plot_design` | Celda reproducida | Celda no reproducida en la fuente | La API existe, pero no se inventa la celda multi-cell exacta. |
| `plot_analysis` | Celda reproducida | Mencionado en flujo, celda no reproducida en la fuente | No se reproduce código multi-cell no documentado. |
| `compare_designs` | Compara `RANDOM` vs `STRATIFIED_SAMPLING` para `HOLDBACK` | Compara `RANDOM` vs `STRATIFIED_SAMPLING` para `GO_DARK` + `HEAVY_UP` | Útil para validar sensibilidad a reglas de asignación. |
| `concat_design_reports` | Celda parcialmente documentada con `...` | No documentada específicamente | No completar huecos con código inventado. |

Flujo end-to-end documentado:

```text
carga CSV → normalización de columnas y tipos → DesignConfig + Constraints + QualityCheckConfig → run_design → revisión de design_metrics y selección de design_id → plot_design → export_to_json → ejecución real del experimento → carga de datos post-test → Design.load_from_json → AnalysisConfig → analyze → results/cumulative_lift/cumulative_icpd → plot_analysis → opcionalmente compare_designs / concat_design_reports
```

## 6. Plantilla de código consolidada

Las siguientes plantillas son una consolidación de las celdas documentadas. No añaden APIs inexistentes. Cuando la fuente principal no reproduce una celda, se marca explícitamente con comentarios para adaptar manualmente.

### 6.1 Plantilla single-cell — diseño + análisis

```python
# --- Instalación en Colab ---
# Install meridian-geox: from PyPI @ latest release
!pip install --upgrade meridian-geox

# --- Imports y configuración global ---
import datetime
from pprint import pprint
import warnings
from IPython.display import display
import meridian_geox as geox
import pandas as pd

warnings.filterwarnings("ignore", category=FutureWarning)
warnings.filterwarnings("ignore", category=UserWarning)
warnings.filterwarnings("ignore", category=DeprecationWarning)
warnings.filterwarnings(
    "ignore",
    message="invalid value encountered in divide",
    category=RuntimeWarning,
)

pd.set_option("display.max_columns", None)

meridian_geox_root = None

# --- Carga de datos de diseño single-cell ---
# Load the design data
single_cell_design_data = pd.read_csv(
    "https://raw.githubusercontent.com/google/meridian-geox/refs/heads/main/meridian_geox/data/example_design_data_single_cell.csv"
)
# Preview the first few rows to ensure it loaded correctly
single_cell_design_data.head()

# --- Normalización de columnas del diseño ---
date_column_name = "date"  # @param {type:"string"}
location_column_name = "location"  # @param {type:"string"}
conversions_column_name = "conversions"  # @param {type:"string"}
spend_column_name = "spend"  # @param {type:"string"}

single_cell_design_data.columns = single_cell_design_data.columns.str.lower()

rename_mapping = {
    date_column_name.lower(): "date",
    location_column_name.lower(): "location",
    conversions_column_name.lower(): "conversions",
}

# Make spend column optional
if (
    spend_column_name
    and spend_column_name.lower() in single_cell_design_data.columns
):
  rename_mapping[spend_column_name.lower()] = "spend"

# Rename the columns in the dataframe to match the library's expected names
single_cell_design_data = single_cell_design_data.rename(columns=rename_mapping)

print("Columns mapped successfully!")
display(single_cell_design_data.head())

# --- Casteo de tipos del diseño ---
numeric_cols = ["conversions"]
if "spend" in single_cell_design_data.columns:
  numeric_cols.append("spend")

for colname in numeric_cols:
  single_cell_design_data[colname] = pd.to_numeric(
      single_cell_design_data[colname]
  )
single_cell_design_data["date"] = pd.to_datetime(
    single_cell_design_data["date"]
)
single_cell_design_data["location"] = single_cell_design_data[
    "location"
].astype(str)
single_cell_design_data.head()

# --- Configuración de diseño y restricciones ---
single_cell_design_config = geox.DesignConfig(
    experiment_duration=datetime.timedelta(days=30),
    experiment_types=geox.ExperimentType.HOLDBACK,
    methodology=geox.Methodology.TBR,
    geo_assignment_rule=geox.GeoAssignmentRule.STRATIFIED_SAMPLING,
    cost_per_incremental_conversion=1,
    cell_count=1,
    design_output_count=5,
)
single_cell_constraints = geox.Constraints(
    excluded_geos={"105"},
    budget_constraint=geox.Budget(budget=500000),
    max_conversions_percent=0.3,
)

# --- Quality checks de diseño ---
exclude_geos_no_response = True  # @param {type:"boolean"}
exclude_outlier_dates_design = True  # @param {type:"boolean"}

design_data_quality_check_config = geox.QualityCheckConfig(
    exclude_geos_no_response=exclude_geos_no_response,
    exclude_outlier_dates=exclude_outlier_dates_design,
)

# --- Ejecución del diseño ---
print("\nDesigning experiment...")
single_cell_design_set = geox.run_design(
    single_cell_design_data,
    single_cell_design_config,
    single_cell_constraints,
    design_data_quality_check_config,
)

# --- Inspección y selección del diseño ---
single_cell_design_set.design_metrics

single_cell_selected_design_id = ""  # @param {type:"string"}

if not single_cell_selected_design_id.strip():
  single_cell_selected_design_id = single_cell_design_set.design_metrics[
      "design_id"
  ].iloc[0]
  print(
      "Automatically selected top ranked design ID:"
      f" {single_cell_selected_design_id}"
  )
else:
  print(f"Manually selected design ID: {single_cell_selected_design_id}")

# Filter the design based on the selected ID
if single_cell_selected_design_id in single_cell_design_set.designs:
  selected_design = single_cell_design_set.designs[
      single_cell_selected_design_id
  ]
  print(f"Successfully selected design: {single_cell_selected_design_id}")
  pprint(selected_design)
else:
  print(
      "Error: Design ID not found. Please enter a valid ID from the metrics"
      " table above."
  )

selected_design = single_cell_design_set.designs[single_cell_selected_design_id]
print(
    "Design implied CpIC:"
    f" {selected_design.designs['cell_1'].design_implied_cpic}"
)

# --- Quality checks y visualización del diseño ---
# If the output below shows empty sets, no outlier geos or dates were detected.
selected_design.quality_check_result

# Show all data quality check results.
if selected_design.quality_check_result is not None:
  design_quality_metrics = selected_design.quality_check_result.quality_metrics
  if design_quality_metrics.empty:
    print("No data quality issues identified.")
  else:
    display(design_quality_metrics)
else:
  print("No quality check result available.")

geox.plot_design(single_cell_design_set.designs[single_cell_selected_design_id])

# --- Export del diseño a JSON ---
single_cell_saved_design_json = single_cell_design_set.designs[
    single_cell_selected_design_id
].export_to_json()
single_cell_saved_design_json

# --- Guardado opcional del diseño en Drive ---
# La celda oficial requiere `import os` si se ha montado Google Drive.
# Write the JSON string to a file on Google Drive if mounted to Google Drive
if meridian_geox_root:
  single_cell_design_file_path = os.path.join(
      meridian_geox_root, "single_cell_design.json"
  )
  with open(single_cell_design_file_path, "w") as f:
    f.write(single_cell_saved_design_json)
  print(
      "Design successfully saved to Google Drive at:"
      f" {single_cell_design_file_path}"
  )
else:
  print("Google Drive not mounted. Design exists in session memory only.")

# --- Carga de datos de análisis single-cell ---
# Load the analysis data
single_cell_analysis_data = pd.read_csv(
    "https://raw.githubusercontent.com/google/meridian-geox/refs/heads/main/meridian_geox/data/example_analysis_data_single_cell_holdback.csv"
)
single_cell_analysis_data.head()

# --- Normalización de análisis ---
# La fuente indica que el mapeo de columnas y casteo son idénticos a diseño.
# Adaptar aquí C2 y C3 sustituyendo `single_cell_design_data` por `single_cell_analysis_data`.

# --- Carga del diseño desde JSON con fallback a memoria ---
design_file_name = "single_cell_design.json"  # @param {type:"string"}

# Try to load the design from Google Drive, with a fallback to session memory.
single_cell_loaded_design = None

if meridian_geox_root:
  single_cell_design_file_path = os.path.join(
      meridian_geox_root, design_file_name
  )
  if os.path.exists(single_cell_design_file_path):
    with open(single_cell_design_file_path, "r") as f:
      single_cell_design_json_text = f.read()
    single_cell_loaded_design = geox.Design.load_from_json(
        single_cell_design_json_text
    )
    print(
        "Design successfully loaded from Google Drive:"
        f" {single_cell_design_file_path}"
    )
  else:
    print(
        f"Design file not found at {single_cell_design_file_path}. Will try to"
        " load from session memory."
    )

if single_cell_loaded_design is None:
  try:
    single_cell_loaded_design = geox.Design.load_from_json(
        single_cell_saved_design_json
    )
    print("Design successfully loaded from session memory.")
  except NameError:
    print(
        "Error: Design data not found on Drive or in memory. Please run the"
        " design step first."
    )

# --- Quality checks de análisis ---
exclude_outlier_dates_analysis = True  # @param {type:"boolean"}

analysis_data_quality_check_config = geox.QualityCheckConfig(
    exclude_outlier_dates=exclude_outlier_dates_analysis,
)

# --- Ejecución del análisis ---
# Analyze experiment results
print("\nAnalyzing experiment results...")
single_cell_analysis_config = geox.AnalysisConfig(
    design=single_cell_loaded_design,
    analysis_start_date=pd.to_datetime("2020-04-01"),
    analysis_end_date=pd.to_datetime("2020-04-30"),
)
single_cell_analysis_result = geox.analyze(
    single_cell_analysis_data,
    single_cell_analysis_config,
    analysis_data_quality_check_config,
)

# --- Resultados y visualización ---
print(f"Analysis result:")
pprint(single_cell_analysis_result.results)

# Show first 5 days of the time series data.
single_cell_analysis_result.results["cell_1"].cumulative_lift.head(5)

if "spend" in single_cell_analysis_data.columns:
  display(single_cell_analysis_result.results["cell_1"].cumulative_icpd.head(5))
else:
  print(
      "Cumulative iCPD is not available because the 'spend' column was not"
      " provided."
  )

geox.plot_analysis(single_cell_analysis_result)
```

### 6.2 Plantilla multi-cell — diseño + análisis

```python
# --- Instalación en Colab ---
# Install meridian-geox: from PyPI @ latest release
!pip install --upgrade meridian-geox

# --- Imports y configuración global ---
import datetime
from pprint import pprint
import warnings
from IPython.display import display
import meridian_geox as geox
import pandas as pd

warnings.filterwarnings("ignore", category=FutureWarning)
warnings.filterwarnings("ignore", category=UserWarning)
warnings.filterwarnings("ignore", category=DeprecationWarning)
warnings.filterwarnings(
    "ignore",
    message="invalid value encountered in divide",
    category=RuntimeWarning,
)

pd.set_option("display.max_columns", None)

meridian_geox_root = None

# --- Carga de datos de diseño multi-cell ---
multicell_design_data = pd.read_csv(
    "https://raw.githubusercontent.com/google/meridian-geox/refs/heads/main/meridian_geox/data/example_design_data_multi_cell_go_dark_heavy_up.csv"
)
multicell_design_data.head()

# --- Normalización de columnas multi-cell ---
# Use two cell study as an example.
date_column_name = "date"  # @param {type:"string"}
location_column_name = "location"  # @param {type:"string"}
conversions_column_name = "conversions"  # @param {type:"string"}
spend_cell_1_column_name = "spend_cell_1"  # @param {type:"string"}
spend_cell_2_column_name = "spend_cell_2"  # @param {type:"string"}

multicell_design_data.columns = multicell_design_data.columns.str.lower()

rename_mapping = {
    date_column_name.lower(): "date",
    location_column_name.lower(): "location",
    conversions_column_name.lower(): "conversions",
}

# Make spend column optional
if (
    spend_cell_1_column_name
    and spend_cell_1_column_name.lower() in multicell_design_data.columns
):
  rename_mapping[spend_cell_1_column_name.lower()] = "spend_cell_1"
if (
    spend_cell_2_column_name
    and spend_cell_2_column_name.lower() in multicell_design_data.columns
):
  rename_mapping[spend_cell_2_column_name.lower()] = "spend_cell_2"

multicell_design_data = multicell_design_data.rename(columns=rename_mapping)

# --- Casteo de tipos ---
# La fuente principal no reproduce esta celda multi-cell completa.
# Aplicar conversión a numérico en `conversions`, `spend_cell_1`, `spend_cell_2`,
# `pd.to_datetime` a `date`, y `astype(str)` a `location`.

# --- Configuración multi-celda ---
# Design experiment
print('\nDesigning experiment...')
multicell_experiment_types = {
    'cell_1': geox.ExperimentType.GO_DARK,
    'cell_2': geox.ExperimentType.HEAVY_UP,
}
multicell_design_config = geox.DesignConfig(
    experiment_duration=datetime.timedelta(days=30),
    experiment_types=multicell_experiment_types,
    methodology=geox.Methodology.TBR,
    geo_assignment_rule=geox.GeoAssignmentRule.STRATIFIED_SAMPLING,
    cell_count=2,
    design_output_count=5,
)
multicell_budget_constraint = {
    'cell_1': geox.Budget(budget_pct=-1.0),
    'cell_2': geox.Budget(budget_pct=1.0),
}
multicell_constraints = geox.Constraints(
    excluded_geos={'105'},
    budget_constraint=multicell_budget_constraint,
    max_conversions_percent=0.3,
)

# --- Quality checks de diseño ---
exclude_geos_no_response = True  # @param {type:"boolean"}
exclude_outlier_dates_design = True  # @param {type:"boolean"}

design_data_quality_check_config = geox.QualityCheckConfig(
    exclude_geos_no_response=exclude_geos_no_response,
    exclude_outlier_dates=exclude_outlier_dates_design,
)

# --- Ejecución del diseño ---
multicell_design_set = geox.run_design(
    multicell_design_data,
    multicell_design_config,
    multicell_constraints,
    design_data_quality_check_config,
)

# --- Selección de diseño ---
# La fuente principal no reproduce la celda exacta que define `multicell_selected_design_id`.
# Usar `multicell_design_set.design_metrics` para elegir el ID; el acceso posterior documentado es:
selected_design = multicell_design_set.designs[multicell_selected_design_id]
for cell_name, cell_design in selected_design.designs.items():
  print(f"Design implied CpIC ({cell_name}): {cell_design.design_implied_cpic}")

# --- Export/carga de diseño multi-cell ---
# La fuente no reproduce las celdas exactas.
# La tabla documenta que el fichero guardado es `multicell_design.json`.

# --- Carga de datos de análisis multi-cell ---
# La fuente no reproduce la celda exacta de `pd.read_csv`.
# Dataset verificado disponible: `example_analysis_data_multi_cell_go_dark_heavy_up.csv`.

# --- Ejecución del análisis multi-cell ---
# Analyze experiment results
print("\nAnalyzing experiment results...")
multicell_analysis_config = geox.AnalysisConfig(
    design=multicell_loaded_design,
    analysis_start_date=pd.to_datetime("2020-04-01"),
    analysis_end_date=pd.to_datetime("2020-04-30"),
)
multicell_analysis_result = geox.analyze(
    multicell_analysis_data, multicell_analysis_config
)

# --- Resultados por celda ---
multicell_analysis_result.results["cell_1"].cumulative_lift.head(5)
multicell_analysis_result.results["cell_2"].cumulative_lift.head(5)

if "spend_cell_1" in multicell_analysis_data.columns:
  display(multicell_analysis_result.results["cell_1"].cumulative_icpd.head(5))
else:
  print(
      "Cumulative iCPD is not available because the 'spend_cell_1' column was"
      " not provided."
  )
```

## 7. Datasets de ejemplo

Los 6 ficheros verificados en `meridian_geox/data/` son:

| Fichero | Tamaño | Para qué sirve | Cómo cargarlo |
|---|---:|---|---|
| `example_design_data_single_cell.csv` | 397 KB | Datos históricos para diseñar un experimento single-cell. | Código real reproducido en C1 con `pd.read_csv("https://raw.githubusercontent.com/google/meridian-geox/refs/heads/main/meridian_geox/data/example_design_data_single_cell.csv")`. |
| `example_design_data_multi_cell_go_dark_heavy_up.csv` | 381 KB | Datos históricos para diseñar un experimento multi-cell con `GO_DARK` y `HEAVY_UP`. | Código real reproducido en MC1 con `pd.read_csv("https://raw.githubusercontent.com/google/meridian-geox/refs/heads/main/meridian_geox/data/example_design_data_multi_cell_go_dark_heavy_up.csv")`. |
| `example_analysis_data_single_cell_holdback.csv` | 535 KB | Datos pretest + test para analizar el experimento single-cell holdback. | Código real reproducido en C16 con `pd.read_csv("https://raw.githubusercontent.com/google/meridian-geox/refs/heads/main/meridian_geox/data/example_analysis_data_single_cell_holdback.csv")`. |
| `example_analysis_data_multi_cell_go_dark_heavy_up.csv` | 573 KB | Datos pretest + test para analizar el experimento multi-cell `GO_DARK` + `HEAVY_UP`. | La fuente verifica el fichero, pero no reproduce la celda exacta de carga en el notebook multi-cell. |
| `example_design_stratified_sampling_holdback.json` | 1.2 MB | Objeto `Design` serializado para un diseño holdback con stratified sampling. | Cargar con la API real `geox.Design.load_from_json(json_text)` tras leer el texto JSON; la fuente no reproduce una celda específica para este fichero. |
| `example_multicell_design_stratified_sampling_go_dark_heavy_up.json` | 1.28 MB | Objeto `Design` serializado para un diseño multi-cell stratified sampling con `GO_DARK` + `HEAVY_UP`. | Cargar con la API real `geox.Design.load_from_json(json_text)` tras leer el texto JSON; la fuente no reproduce una celda específica para este fichero. |

### 7.1 Formato esperado de CSV

GeoX espera un `pd.DataFrame` en formato long, una fila por `(date, location)`, con granularidad diaria obligatoria.

Single-cell:

```csv
date,location,conversions,spend
2020-01-01,10,1217.186754,13.961282
2020-01-01,103,478.7548505,5.360182842
2020-01-01,105,1077.686355,11.0703539
2020-01-01,108,347.5165323,4.956830216
2020-01-01,11,914.8362022,10.87281349
```

Multi-cell:

```csv
date,location,conversions,spend_cell_1,spend_cell_2
2020-01-01,10,890.7786349,91.5,91.5
2020-01-01,103,448.0623914,135.3,135.3
2020-01-01,105,546.1942811,50.4,50.4
```

Semántica de columnas:

| Columna | Semántica |
|---|---|
| `date` | String `YYYY-MM-DD`, convertido a `pd.Timestamp`. |
| `location` | Geo, por ejemplo DMA o market area; se castea a `str`. |
| `conversions` | Conversiones o revenue crudo y sin filtrar; debe reflejar BAU. En multi-cell, debe ser la métrica global compartida por todas las celdas y el control. |
| `spend` | Gasto de campañas incluidas en el estudio; obligatorio si el estudio/celda es `GO_DARK` o `HEAVY_UP`. |
| `spend_cell_1`, `spend_cell_2`, … | Spend por celda en multi-cell; pueden ser iguales si las celdas modifican el mismo pool de campañas o distintos si representan canales/tácticas distintas. |

### 7.2 Requisitos temporales verificados

- Diseño: al menos `3N` fechas, donde `N = experiment_duration.days`.
- Análisis: al menos `3N` fechas de pretest.
- Número de geos: al menos `2 * (cell_count + 1)` tras excluir geos.
- Las series semanales están explícitamente prohibidas.
- `conversions.sum()` debe ser mayor que 0.

Código real de validación temporal de diseño:

```python
if data[api.DATE].nunique() < 3 * design_config.experiment_duration.days:
    errors.append(
        f'Data has {data[api.DATE].nunique()} dates, but experiment duration'
        f' is {design_config.experiment_duration.days}. Need at least 3 *'
        ' experiment duration dates during design phase.'
    )
```

Código real de rechazo de patrones semanales:

```python
date_diffs = unique_dates.diff().dt.days.dropna()
if (date_diffs == 7).all():
    errors.append('Weekly patterns are not supported.')
```
