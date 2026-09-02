# Guía técnica de diseño de geo-experimentos con Meridian GeoX

Propósito: servir como referencia interna para diseñar, evaluar, visualizar y exportar diseños de geo-experimentos con Meridian GeoX sin añadir supuestos fuera de la documentación y del código investigado.

## 1. Qué es un `design` en GeoX

La definición oficial indica que un `design` en GeoX es un **blueprint** que especifica qué unidades geográficas (`geos`) se asignan al grupo de tratamiento y cuáles al grupo de control. El diseño también proyecta el **presupuesto requerido** y el **minimum detectable effect (MDE)** del experimento.

En términos operativos, un diseño contiene:

- asignación `treatment` / `control` por geo;
- presupuesto proyectado por celda;
- MDE relativo y absoluto;
- métricas de ajuste y robustez pre-test;
- datos suficientes para mantener consistencia entre diseño y análisis mediante `export_to_json()` y `Design.load_from_json()`.

## 2. Diseños `single-cell` vs `multi-cell`

| Tipo de diseño | Estructura | Cuándo usarlo | Nota estadística |
|---|---|---|---|
| `single-cell design` | Un grupo de tratamiento vs. un grupo de control. | Tests estándar de incrementalidad; evaluar una única táctica, campaña o canal. Ejemplo documentado: un `go-dark` de YouTube. | Recomendado para incrementality testing estándar porque concentra toda la potencia estadística en una sola comparación. Requiere menos geos y menor presupuesto total para lograr un MDE bajo. |
| `multi-cell design` | Múltiples grupos de tratamiento con intervenciones o niveles de presupuesto distintos contra un **control común**. | Tests con varios niveles de presupuesto, comparaciones cross-publisher y experimentos de optimización. | Menos robusto que `single-cell` para una comparación aislada porque reparte geos y potencia entre varias celdas. |

Casos de uso documentados para `multi-cell`:

1. **Budget level tests**: combinar `heavy-up` + `go-dark` en un mismo test para entender el `baseline lift` y el `new budget level lift`, o probar dos niveles nuevos como `+20%` y `+50%`.
2. **Cross-publisher comparison**: medir y comparar incrementalidad de múltiples plataformas de medios en un solo vuelo.
3. **Optimization experiments**: comparar tácticas distintas midiendo su incrementalidad respectiva, de forma similar a un A/B.

## 3. Tipos de intervención

| `ExperimentType` | Descripción | Qué recibe `treatment` | Qué recibe `control` | Cuándo usarlo |
|---|---|---|---|---|
| `HOLDBACK` | Medición de estrategias publicitarias completamente nuevas: nuevos canales o campañas en cuentas nuevas. | `new spend`. | `held back` o `zero spend`. | Lanzamiento de canales, tácticas o formatos net-new para validar retorno incremental antes de escalar. |
| `GO_DARK` | Mide la incrementalidad de campañas existentes y activas. El spend existente se apaga completamente en los geos de test. | Spend ablado / cero. | `business-as-usual (BAU) spend`. | Defender presupuestos de medios demostrando el valor base que se perdería si se apagan los anuncios. |
| `HEAVY_UP` | Testa incrementar presupuestos de campañas existentes y mide la respuesta incremental de estrategias de expansión. | Spend incrementado, por ejemplo `+X%`. | `BAU spend`. | Prever retornos marginales de aumentar presupuesto en canales establecidos, o crear señal suficiente cuando el spend actual es demasiado bajo para dar potencia a un `go-dark`. |

### `go-dim` / partial `go-dark`

GeoX documenta `GO_DARK` / `GO_DIM` mediante `Budget(budget_pct=...)` negativo:

```python
# Full go-dark: -100% del baseline spend.
geox.Budget(budget_pct=-1.0)

# Go-dim: reducción parcial del 50%.
geox.Budget(budget_pct=-0.5)
```

El partial `go-dark` o `go-dim` se usa para reducir parcialmente inversión, por ejemplo `-20%`, y medir eficiencia marginal minimizando riesgo de ingresos. La documentación advierte que esto **no mide la eficiencia baseline total**, que compara BAU contra cero spend y requiere un `go-dark` completo.

## 4. Metodología de asignación geográfica

GeoX prioriza un enfoque robusto y data-driven para minimizar varianza y requisitos de presupuesto. La metodología recomendada es `STRATIFIED_SAMPLING`; `RANDOM` existe, pero no se recomienda salvo cuando hay pocos geos.

### 4.1 `STRATIFIED_SAMPLING`

El proceso documentado:

1. Particiona los geos en `strata`, es decir, clusters homogéneos definidos por `response volume`, `trend` y `seasonality`.
2. Featuriza la serie de KPI por geo antes del clustering.
3. Agrupa con k-means.
4. Asigna aleatoriamente geos a tratamiento/control dentro de cada cluster.
5. Extiende la lógica a diseños multi-cell.

Features reales usadas en `generate_candidates.py` sobre `selection_train.T` (T0):

| Feature | Cálculo documentado |
|---|---|
| `mean` | Media de la serie del KPI por geo. |
| `coeff_of_variation` | `std / mean`. |
| `trend_slope` | `np.polyfit` de grado 1. |
| `autocorr` | `statsmodels.tsa.stattools.acf` con `nlags=1`. |
| `dtw_distance` | `tslearn.metrics.dtw` contra la serie media de referencia. |

Después, las features se estandarizan con `jax.nn.standardize` y se agrupan con:

```python
jaxkd.extras.k_means(
    key,
    features,
    k=design_config.num_strata,
    steps=design_config.k_means_iterations,
)
```

Defaults documentados:

| Parámetro | Default |
|---|---:|
| `num_strata` | `4` |
| `k_means_iterations` | `10` |

### 4.2 Muestreo estratificado con secuencias de Sobol

Firma documentada:

```python
def get_stratified_sampling_candidates(
    selection_train: jnp.ndarray,
    filtered_data: pd.DataFrame,
    design_config: api.DesignConfig,
    constraints: api.Constraints,
    geo_stratum_labels: jnp.ndarray,
    key: jax.Array,
    selection_train_spend: Optional[dict[str, jnp.ndarray]] = None,
):
```

Algoritmo documentado en `get_unconstrained_stratified_sampling_candidates`:

1. **Balance strata via Sobol sequence**: usa una secuencia de baja discrepancia de etiquetas de estrato.
2. **Randomize geos**: aplica una permutación aleatoria independiente.
3. **Align geos to the stratum sequence**: reordena para que la lista de geos sea aleatoria pero balanceada por estrato.
4. **Assign treatment geos**: asignación greedy respetando el estrato requerido y el límite de conversiones.

Funciones auxiliares públicas documentadas:

```python
get_minimal_discrepancy_stratum_labels
get_stratified_geo_sequence
get_treatment_geos_for_one_cell_greedy
compute_mask_maximizing_conversions(
    geos,
    geo_strata,
    geo_conversions,
    max_conversions_per_cell,
    num_cells=1,
)
linear_fit
autocorrelation
```

Restricción mínima por candidato:

```python
def _check_min_geos_per_cell(mask):
    n_control = jnp.sum(mask == 0)
    cell_ids = jnp.arange(1, design_config.cell_count + 1)
    cell_counts = jnp.sum(mask == cell_ids[:, None], axis=1)
    return (n_control >= 2) & jnp.all(cell_counts >= 2)
```

El límite por celda es:

```python
max_conversions / design_config.cell_count
```

### 4.3 `RANDOM`

`RANDOM` particiona geos aleatoriamente sin estructura de clustering. La documentación indica que no suele recomendarse frente a `STRATIFIED_SAMPLING`, pero se vuelve necesario en GeoX con pocos geos.

Firma documentada:

```python
def get_random_candidates(
    filtered_data: pd.DataFrame,
    design_config: api.DesignConfig,
    constraints: api.Constraints,
    key: jax.Array,
    selection_train: jnp.ndarray,
    selection_train_spend: Optional[dict[str, jnp.ndarray]] = None,
) -> jnp.ndarray:
```

Lógica documentada:

- usa `max_conversions_percent` como proxy del número de geos tratados;
- calcula `n_treated = int(n_geos * max_conversions_percent)`;
- fuerza los `included_control_geos` a control asignándoles score `2.0`, dado que el rango uniforme es `[0, 1)`;
- puede fallar con errores documentados como `Not enough geos`, `Not enough geos to satisfy minimum treatment geos per cell constraint` o `Could not find enough valid candidates satisfying design constraints and/or slope similarity criteria. Consider relaxing constraints.`

## 5. Métricas de evaluación del `design search`

| Métrica | Uso en diseño |
|---|---|
| Out-of-sample R² | Evalúa el ajuste fuera de muestra y se usa para filtrar candidatos. Default `min_r2 = 0.8`. |
| AA robustness | Validación mediante simulaciones A/A y p-values para evitar sesgos A/A significativos. El p-value A/A debe ser `> alpha`. |
| Potencia estadística vía MDE | El MDE del lift relativo resume el efecto mínimo detectable con la potencia objetivo. |
| Budget | Traduce la potencia estadística al requisito fiscal para alcanzar los objetivos de potencia. |

Fórmula oficial del MDE:

$$
MDE_{lift} = \frac{\text{Min incremental conversion}}{\text{Baseline control conversion}} = \frac{SE_{lift} \times (Z_{1-\alpha/2} + Z_{1-\beta})}{\text{Baseline control conversion}}
$$

Donde:

- $SE_{lift}$ es el error estándar del lift absoluto;
- $\alpha$ es el nivel de significación;
- $1-\beta$ es la potencia estadística objetivo;
- $Z$ son cuantiles de la normal estándar;
- por defecto se considera contraste bilateral (`TWO_SIDED`).

La documentación indica que el MDE lift percentage es independiente de las opciones de metodología de análisis.

## 6. Particionado temporal T0/T1/T2

`design.py:prepare_data` divide la serie pivoteada en tres bloques de longitud `experiment_duration_days`. El código documentado conserva estos comentarios originales:

```python
# T0: Training period (for selecting designs).
# T1: Validation period (for selecting designs).
# T2: Estimation period (for calculating MDE).
# For selection phase, we train on T0 and eval on T1.
# For estimation phase, we train on T0 + T1 and eval on T2.
n_dates = len(pivoted_data)
experiment_duration_days = experiment_duration.days
t2_start_idx = n_dates - experiment_duration_days
t1_start_idx = t2_start_idx - experiment_duration_days
```

Interpretación:

| Bloque | Uso |
|---|---|
| T0 | `selection_train`: entrenar candidatos durante la fase de selección. |
| T1 | `selection_eval`: validar candidatos durante la fase de selección. |
| T0 + T1 | `estimation_train`: entrenamiento para estimación final. |
| T2 | `estimation_eval`: cálculo del MDE. |

Por eso la validación exige al menos `3 * experiment_duration` fechas durante la fase de diseño:

```python
if data[api.DATE].nunique() < 3 * design_config.experiment_duration.days:
    errors.append(
        f'Data has {data[api.DATE].nunique()} dates, but experiment duration'
        f' is {design_config.experiment_duration.days}. Need at least 3 *'
        ' experiment duration dates during design phase.'
    )
```

## 7. Pipeline de `run_design`

Firma pública:

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

Nota documentada: `design_scorer` está declarado pero no implementado; el código contiene `del design_scorer  # Unused in skeleton.`

Pasos reales documentados:

1. **Preprocesado**: fuerza `data.columns` a minúsculas, hace `copy.deepcopy(constraints)`, normaliza `experiment_types` y ejecuta `validation.validate_design_input(...)`. Si falla, lanza `ValueError(f'Data validation failed: {error_messages}')`.
2. **Quality checks + exclusiones**: ejecuta `data_quality.check_design_data_quality(...)` y `_prepare_design_constraints(...)`, que añade `outlier_geos` / `outlier_dates` a las constraints si la configuración lo permite.
3. **Generación de candidatos** según `geo_assignment_rule`:

```python
# RANDOM
candidates = generate_candidates.get_random_candidates(...)

# STRATIFIED_SAMPLING
geo_stratum_labels = generate_candidates.cluster_geos(...).labels
candidates = generate_candidates.get_stratified_sampling_candidates(...)
```

4. **Fast scoring**: calcula R² con `tbr.get_r2(selection_train, selection_eval, candidates, cell_ids)`, selecciona los `n_ranked_candidates` con mejor R² usando el mínimo entre celdas, y calcula `z_score_sum`:

```python
if design_config.test_type == api.TestType.TWO_SIDED:
    z_alpha = stats.norm.ppf(1 - design_config.alpha / 2)
else:
    z_alpha = stats.norm.ppf(1 - design_config.alpha)
z_power = stats.norm.ppf(design_config.power)
z_score_sum = z_alpha + z_power
```

5. **Scoring completo**: calcula MDE con `tbr.get_mde(...)`, filtra por `min_r2` y por test A/A (`p_value >= alpha`), y empaqueta el resultado en `DesignSet`.

Two-stage scoring documentado por defaults:

| Fase | Parámetro | Default | Uso |
|---|---|---:|---|
| Fast scoring | `n_candidates` | `100_000` | Genera y evalúa candidatos con scoring rápido. |
| Full scoring | `n_ranked_candidates` | `100` | Recalcula métricas completas de los candidatos mejor rankeados. |

Slope check documentado:

- En ambos generadores, si la celda es `GO_DARK` o `HEAVY_UP` y hay spend, se aplica `tbr.check_slope_similarity(..., design_config.slope_tolerance, ...)`.
- Default `slope_tolerance = 0.2`.

Errores relevantes documentados:

```text
No designs passed the A/A test (p >= alpha).
Unsupported methodology: ...
Unsupported geo assignment rule: ...
```

## 8. Cálculo del presupuesto requerido

Lógica exacta documentada en `design.py:_get_design_summary`:

```python
budget_constraint = budget_constraints.get(cell_name)
if util.is_go_dark_or_heavy_up(experiment_type):
    default_pct = (
        -1.0 if experiment_type == api.ExperimentType.GO_DARK else 1.0
    )
    budget_percent = (
        budget_constraint.budget_pct
        if budget_constraint and budget_constraint.budget_pct is not None
        else default_pct
    )
    estimation_eval_spend_np = estimation_eval_spend_np_dict[cell_name]
    treatment_geo_cost = float(
        np.sum(estimation_eval_spend_np[:, treatment_indices])
    )
    required_budget = treatment_geo_cost * budget_percent
else:
    # HOLDBACK
    cpic = cpics[cell_name]
    required_budget = total_mde_abs * cpic

design_implied_cpic = (
    abs(required_budget / total_mde_abs) if total_mde_abs > 0 else 0.0
)
```

Con:

```python
total_mde_abs = mde_pct * treatment_conversion_volume
```

Semántica por tipo:

| Tipo | Cálculo de presupuesto |
|---|---|
| `GO_DARK` | Usa spend histórico de geos treatment en T2 y `budget_pct`; default `-1.0`. |
| `HEAVY_UP` | Usa spend histórico de geos treatment en T2 y `budget_pct`; default `+1.0`. |
| `HOLDBACK` | Usa `cost_per_incremental_conversion`; `required_budget = total_mde_abs * cpic`. |

Relación `budget` ↔ MDE ↔ design-implied CpIC:

- El MDE está determinado por volatilidad histórica y matching de geos; cambiar solo el `budget` en `Constraints` no altera ese límite estadístico.
- El budget determina el `design_implied_cpic` de forma proporcional.
- Budget más alto implica `design_implied_cpic` más alto, menos eficiente, y mayor probabilidad de test concluyente para campañas de rendimiento moderado.
- Budget más bajo implica CpIC muy bajo; si el rendimiento real es moderado, el test puede no ser concluyente.
- En notebooks se recomienda comparar `Implied CpIC` con `Expected CpIC`: si `Implied < Expected`, el test está infrapotenciado y hay que subir presupuesto o duración.
- Para `HOLDBACK`, el implied CpIC coincide con el CpIC de input.
- La fuente documenta `CpIC ≈ 1/iROAS` o `1/iCPD` según KPI/negocio.

## 9. Ranking de diseños y columnas de `design_metrics`

El ranking real se hace por el MDE máximo entre celdas, ascendente:

```python
def _rank_and_filter_metrics(metrics: pd.DataFrame, limit: int) -> tuple[pd.DataFrame, pd.Series]:
  # Rank by max_mde across cells.
  max_mde_df = metrics.groupby('design_id')['mde'].max().reset_index(name='max_mde')
  top_design_ids = max_mde_df.sort_values(by='max_mde').head(limit)['design_id']
```

Es decir: menor MDE máximo entre celdas = mejor diseño. Los `design_id` son `str(uuid.uuid4())`.

Columnas documentadas de `design_metrics`:

| Columna | Descripción documentada |
|---|---|
| `design_id` | Identificador del diseño. |
| `cell` | Celda del diseño, por ejemplo `cell_1`. |
| `design_methodology` | `{RULE}-{METHODOLOGY}`, por ejemplo `STRATIFIED_SAMPLING-TBR`. |
| `r2` | R² out-of-sample. |
| `mde` | MDE relativo. |
| `mde_abs` | MDE absoluto. |
| `p_value (AA)` | p-value de robustez A/A. |
| `budget` | Presupuesto proyectado. |
| `design_implied_cpic` | CpIC implícito del diseño. |
| `treatment_conversions_pct` | Porcentaje de conversiones en tratamiento. |
| `treatment_geo_count` | Número de geos en tratamiento. |

Ejemplo documentado de tabla:

| design_id | cell | design_methodology | r2 | mde | mde_abs | p_value (AA) | budget | design_implied_cpic | treatment_conversions_pct | treatment_geo_count |
|---|---|---|---:|---:|---:|---:|---:|---:|---:|---:|
| 52456ea8 | cell_1 | STRATIFIED_SAMPLING-TBR | 0.913 | 0.013 | 7085.925 | 0.394 | 7085.925 | 1 | 30.073 | 27 |
| d42f5f69 | cell_1 | STRATIFIED_SAMPLING-TBR | 0.917 | 0.014 | 7610.810 | 0.920 | 7610.810 | 1 | 29.820 | 29 |
| 06c83b68 | cell_1 | STRATIFIED_SAMPLING-TBR | 0.945 | 0.015 | 7873.250 | 0.497 | 7873.250 | 1 | 30.064 | 30 |

Si una celda `HOLDBACK` requiere más presupuesto del provisto, se emite un warning documentado:

```python
logging.warning(
    'Design %s: %s required budget (%.2f) exceeds provided '
    'budget (%.2f).', design_id, cell_name, per_cell_design.budget,
    provided_budget.budget,
)
```

## 10. Restricciones operativas (`Constraints`)

Definición documentada:

```python
@pydantic.dataclasses.dataclass
class Constraints:
  """Constraints for designing a GeoX study."""

  included_control_geos: SortedSet[str] = dataclasses.field(default_factory=set)
  excluded_geos: SortedSet[str] = dataclasses.field(default_factory=set)
  excluded_dates: SortedSet[Timestamp] = dataclasses.field(default_factory=set)
  budget_constraint: Union[Budget, dict[str, Budget], None] = None
  max_conversions_percent: Optional[float] = 0.3

  def normalize(self, experiment_types: dict[str, ExperimentType]):
    """Normalizes budget based on experiment types."""
    if isinstance(self.budget_constraint, Budget):
      self.budget_constraint = {
          cell: self.budget_constraint for cell in experiment_types
      }
    elif self.budget_constraint is None:
      self.budget_constraint = {}
```

| Constraint | Uso documentado |
|---|---|
| `included_control_geos` | Geos que deben quedar en control. En `RANDOM`, se fuerzan asignándoles score `2.0`. |
| `excluded_geos` | Geos excluidos del diseño; normalmente grandes metros o geos que pueden causar disrupción de medios. |
| `excluded_dates` | Fechas excluidas del diseño. |
| `budget_constraint` | Restricción de presupuesto por celda: importe total o cambio porcentual. |
| `max_conversions_percent` | Volumen máximo de conversiones del grupo de tratamiento. Default `0.3`; tabla maestra indica que debe ser `< 0.5`. |

Ejemplo documentado de exclusiones y presupuesto:

```python
# 1. Define specific dates to exclude
dates_to_exclude = {pd.to_datetime('2024-12-31'), pd.to_datetime('2025-01-01')}
# 2. Add them to your Constraints object
custom_constraints = geox.Constraints(
    excluded_geos={'loc1','loc2','loc3'},
    excluded_dates=dates_to_exclude,
    max_conversions_percent=0.2,
    budget_constraint=geox.Budget(budget=150000))
# 3. Use these constraints in a new design
custom_design_set = geox.run_design(design_data, design_config, custom_constraints)
```

Ejemplo de `budget_constraint` por tipo:

```python
# HOLDBACK: límite de gasto total en la nueva campaña.
holdback_budget = geox.Budget(budget=500000)

# HEAVY_UP: +50% sobre baseline; debe ser positivo.
heavy_up_budget = geox.Budget(budget_pct=0.5)

# GO_DARK: apagado total; debe ser negativo.
go_dark_budget = geox.Budget(budget_pct=-1.0)

# GO_DIM: reducción parcial del 50%; debe ser negativo.
go_dim_budget = geox.Budget(budget_pct=-0.5)
```

Ejemplo multi-cell documentado:

```python
multi_cell_constraints = geox.Constraints(
    budget_constraint={'cell_1': geox.Budget(budget_pct=-1.0),
                       'cell_2': geox.Budget(budget_pct=1.0)})
```

## 11. Ejemplos de código end-to-end

### 11.1 `single-cell heavy-up` con TBR y stratified sampling

```python
import datetime
import meridian_geox as geox

# Example: Specify a 28-day 'heavy-up' (increased spend) experiment using TBR
# and stratified sampling.
design_config = geox.DesignConfig(
    experiment_duration=datetime.timedelta(days=28),
    experiment_types=geox.ExperimentType.HEAVY_UP,
    methodology=geox.Methodology.TBR,
    geo_assignment_rule=geox.GeoAssignmentRule.STRATIFIED_SAMPLING,
    design_output_count=5)

# Limit the max experiment budget to be 100000.
constraints = geox.Constraints(budget_constraint=geox.Budget(budget=100000))

# Generate Design
# 'design_data' should be your pre-test pandas dataframe.
design_set = geox.run_design(design_data, design_config, constraints)
# Select the top-ranked design
selected_id = next(iter(design_set.designs))
selected_design = design_set.designs[selected_id]
```

### 11.2 `multi-cell budget-neutral` (`go-dark` + `heavy-up`)

```python
import datetime
import meridian_geox as geox

multi_cell_design_config = geox.DesignConfig(
    cell_count=2,
    experiment_duration=datetime.timedelta(days=28),
    experiment_types={'cell_1': geox.ExperimentType.GO_DARK,
                      'cell_2': geox.ExperimentType.HEAVY_UP},
    methodology=geox.Methodology.TBR,
    geo_assignment_rule=geox.GeoAssignmentRule.STRATIFIED_SAMPLING,
    design_output_count=5)

multi_cell_constraints = geox.Constraints(
    budget_constraint={'cell_1': geox.Budget(budget_pct=-1.0),
                       'cell_2': geox.Budget(budget_pct=1.0)})

multi_cell_design_set = geox.run_design(
    design_data, multi_cell_design_config, multi_cell_constraints)
```

`budget_pct=-1.0` equivale a `-100%` para `go-dark`; `budget_pct=1.0` equivale a `+100%` para `heavy-up`.

## 12. Evaluación, visualización y export del diseño

### 12.1 Evaluación mínima del diseño seleccionado

Criterios documentados:

1. **R² threshold**: recomendado `R² >= 0.8`. Un `R² < 0.5` indica que los geos de control son pobres predictores de los geos de tratamiento y puede hacer el análisis post-test no fiable bajo ciertos escenarios.
2. **A/A test validation**: el p-value del A/A debe ser `> alpha` para asegurar que no existe sesgo preexistente significativo.
3. **Feasibility of MDE**: comparar el MDE contra expectativas de negocio. Si se espera un lift del 5% y el diseño tiene MDE del 12%, el estudio está infrapotenciado.

### 12.2 `plot_design`

Firma pública:

```python
def plot_design(design_to_plot: api.Design):
  """Visualizes pre-test alignment for all cells in separate plots."""
```

Comportamiento documentado:

- genera una figura por celda;
- usa `figsize=(15, 7)` y `sns.set_style('ticks')`;
- muestra `observed` en azul y `counterfactual` en verde;
- el título es `Observed vs Counterfactual total conversions ({cell_id})`.

Uso:

```python
geox.plot_design(selected_design)
```

### 12.3 Export y reload

Métodos documentados:

```python
single_cell_saved_design_json = single_cell_design_set.designs[
    single_cell_selected_design_id
].export_to_json()

loaded_design = geox.Design.load_from_json(single_cell_saved_design_json)
```

También aparece documentado como patrón para garantizar consistencia diseño ↔ análisis:

```python
design.export_to_json()
geox.Design.load_from_json(saved_design_json)
```

### 12.4 `compare_designs`

Firma pública:

```python
def compare_designs(
    data: pd.DataFrame,
    design_requirements: list[tuple[api.DesignConfig, api.Constraints]],
    design_output_count: int = 10,
) -> api.DesignSet:
  """Compares designs based on different design configurations."""
```

Ejemplo documentado para comparar `RANDOM` vs `STRATIFIED_SAMPLING`:

```python
comparison_results = geox.compare_designs(design_data, [
  # Option A: TBR with Random Assignment
  (geox.DesignConfig(experiment_duration=datetime.timedelta(days=28),
                     methodology=geox.Methodology.TBR,
                     geo_assignment_rule=geox.GeoAssignmentRule.RANDOM,
                     design_output_count=5), geox.Constraints()),
  # Option B: TBR with Stratified Sampling
  (geox.DesignConfig(experiment_duration=datetime.timedelta(days=28),
                     methodology=geox.Methodology.TBR,
                     geo_assignment_rule=geox.GeoAssignmentRule.STRATIFIED_SAMPLING,
                     design_output_count=5), geox.Constraints()),
])
comparison_results.design_metrics
```

La recomendación documentada es que, en general, `STRATIFIED_SAMPLING` funciona bien con TBR y tiende a producir diseños con menor varianza.

### 12.5 `concat_design_reports`

Firma pública:

```python
def concat_design_reports(
    design_sets: list[api.DesignSet], design_output_count: int = 10
) -> api.DesignSet:
  """Concatenates a list of design sets and return the top N designs."""
```

Uso documentado en notebooks:

```python
combined_design_set = geox.concat_design_reports([design_set_1, design_set_2])
print("Combined design metrics (ranked by mde):")
combined_design_set.design_metrics
```

## 13. Defaults críticos para diseño

| Parámetro | Objeto | Default | Restricción/nota |
|---|---|---:|---|
| `experiment_duration` | `DesignConfig` | requerido | Solo días/semanas completas; `> 0`. |
| `experiment_types` | `DesignConfig` | `HOLDBACK` | Enum o dict por celda. |
| `methodology` | `DesignConfig` | `TBR` | Enums reales: `TBR`, `SDID`; `SDID` declarado pero no implementado en `run_design` según investigación. |
| `geo_assignment_rule` | `DesignConfig` | `STRATIFIED_SAMPLING` | O `RANDOM`. |
| `cell_count` | `DesignConfig` | `1` | `> 0`. |
| `alpha` | `DesignConfig` | `0.1` | CI = 90%. |
| `power` | `DesignConfig` | `0.8` | `0 < power < 1`. |
| `test_type` | `DesignConfig` | `TWO_SIDED` | O `ONE_SIDED`. |
| `design_output_count` | `DesignConfig` | `10` | `> 0`. |
| `cost_per_incremental_conversion` | `DesignConfig` | `1.0` | Solo holdback; `> 0`; aproximadamente `1/iROAS`. |
| `n_candidates` | `DesignConfig` | `100_000` | Fast scoring. |
| `n_ranked_candidates` | `DesignConfig` | `100` | Full scoring. |
| `max_candidate_generation_retries` | `DesignConfig` | `10` | Reintentos. |
| `seed` | `DesignConfig` | `42` | Semilla. |
| `slope_tolerance` | `DesignConfig` | `0.2` | Slope check. |
| `min_r2` | `DesignConfig` | `0.8` | Relajable a `0.75` / `0.70` según tabla fuente. |
| `num_strata` | `DesignConfig` | `4` | k-means. |
| `k_means_iterations` | `DesignConfig` | `10` | Iteraciones k-means. |
| `max_conversions_percent` | `Constraints` | `0.3` | Debe ser `< 0.5`. |
| `budget_pct` (`GO_DARK`) | `Constraints/Budget` | `-100%` | Debe ser negativo. |
| `budget_pct` (`HEAVY_UP`) | `Constraints/Budget` | `+100%` | Debe ser positivo. |
| Longitud pretest mínima | validación | `3 * experiment_duration` | Recomendado `6N` o 1 año con estacionalidad fuerte. |
| Geos mínimos | validación / FAQ | `2 * (cell_count + 1)` | FAQ single-cell: `10`; óptimo `50-100+`. |

## 14. Checklist de diseño

Antes de dar un diseño por bueno:

- [ ] Confirmar que el KPI primario es absoluto (`revenue` o conteo de conversiones), no ratio como ROAS.
- [ ] Confirmar que hay datos diarios, no semanales.
- [ ] Confirmar que cada par `date` + `location` aparece exactamente una vez en el pre-test.
- [ ] Confirmar que hay al menos `3 * experiment_duration` fechas; usar `6N` o más si hay alta estacionalidad o problemas A/A.
- [ ] Confirmar que `conversions.sum() > 0` y que no se usan métricas negativas como net revenue tras devoluciones.
- [ ] Confirmar que el número de geos cumple al menos `2 * (cell_count + 1)` tras exclusiones.
- [ ] Elegir `single-cell` salvo que el caso de negocio requiera budget levels, cross-publisher u optimization experiments.
- [ ] Preferir `STRATIFIED_SAMPLING`; usar `RANDOM` solo si hay pocos geos o si se está comparando metodología.
- [ ] Revisar que `num_strata=4` y `k_means_iterations=10` son razonables para el dataset; no hay guía adicional documentada en las fuentes.
- [ ] Configurar `experiment_types` por celda si `cell_count > 1`.
- [ ] Revisar que `budget_pct` es negativo para `GO_DARK` / `go-dim` y positivo para `HEAVY_UP`.
- [ ] Revisar que `max_conversions_percent` no supera el límite documentado (`< 0.5`) y que por defecto afecta como máximo al 30% de conversiones.
- [ ] Excluir geos operativamente inviables con `excluded_geos`.
- [ ] Excluir fechas atípicas con `excluded_dates`.
- [ ] Forzar geos que deben permanecer en control mediante `included_control_geos` si aplica.
- [ ] Verificar `r2 >= min_r2`; recomendado `R² >= 0.8`.
- [ ] Verificar que el p-value A/A es `> alpha`.
- [ ] Comparar MDE contra el lift esperado de negocio; no avanzar si el MDE supera claramente el efecto esperable.
- [ ] Comparar `design_implied_cpic` contra el `Expected CpIC` o contra `1/iROAS` objetivo si existe referencia previa.
- [ ] Revisar `plot_design(selected_design)` para confirmar alineación pre-test entre observed y counterfactual.
- [ ] Exportar el diseño con `export_to_json()` y recargarlo con `Design.load_from_json()` antes del análisis post-test.
- [ ] Si ningún diseño cumple, seguir el orden documentado: subir `budget`, aumentar `experiment_duration`, aumentar `max_conversions_percent` o considerar KPIs más superficiales con mayor volumen.
