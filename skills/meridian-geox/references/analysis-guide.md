# Guía técnica de análisis post-experimento con `meridian_geox`

Esta guía sirve como referencia interna anti-alucinación para ejecutar e interpretar el análisis post-experimento de GeoX en un repositorio de análisis de WPP Media.

## Fuentes verificadas

| Fuente | Secciones usadas |
|---|---|
| `geox-docs-part1.md` | 10. Analysis; 11. Counterfactual modeling; 12. Time-based regression |
| `geox-docs-part2.md` | 13. Robust inference; 14. Analysis outputs; 19.8-19.10 API reference |
| `geox-repo-research.md` | 8. `analysis.py`; 9. `methodology/tbr.py`; 9.4 `methodology/util.py` |
| `google/meridian-geox` `analysis.py` | Código real de `analyze()` y `plot_analysis()` |

> Regla de uso: si una afirmación no aparece en estas fuentes, se omite o se marca como **no documentado**.

## 1. Flujo de análisis: de datos post-test a `AnalysisResult`

El análisis necesita dos insumos:

1. El `Design` original ejecutado en el experimento.
2. Un `DataFrame` con la misma estructura que el pretest, pero incluyendo **pretest + test**.

La documentación oficial resume el flujo mínimo así:

```python
# Load the existing design
loaded_design = geox.Design.load_from_json(saved_design_json)

# Set analysis config
analysis_config = geox.AnalysisConfig(
    design=loaded_design,
    analysis_start_date=pd.to_datetime("2020-04-01"),
    analysis_end_date=pd.to_datetime("2020-04-30"))

analysis_result = geox.analyze(analysis_data, analysis_config)
analysis_result.results
```

El rango `analysis_start_date` → `analysis_end_date` debe cubrir toda la duración del test; `analysis_end_date` puede extenderse si se quiere incluir cooldown. Si `pretest_end_date` no se define, GeoX usa como pretest todas las fechas anteriores a `analysis_start_date`.

### Código real de `analyze()`

```python
def analyze(
    data: pd.DataFrame,
    analysis_config: api.AnalysisConfig,
    # An option to enable and configure automatic data quality checks.
    data_quality_check_config: api.QualityCheckConfig = api.QualityCheckConfig(),
) -> api.AnalysisResult:
  """Analyzes a GeoX experiment."""

  data = data.copy()
  data.columns = data.columns.astype(str).str.lower()

  error_messages: list[str] = validation.validate_analysis_input(
      data, analysis_config
  )
  if error_messages:
    raise ValueError(f'Data validation failed: {error_messages}')

  # 1. Prepare configuration.
  design_config = _prepare_design_config(analysis_config)
  experiment_types = _get_experiment_types(design_config)

  # 2. Prepare data and masks.
  data = _prepare_data(data, analysis_config)
  treatment = _get_treatment_mask(data, analysis_config.design)

  # Run data quality checks.
  quality_result = data_quality.check_analysis_data_quality(
      data,
      analysis_config,
      data_quality_check_config,
  )

  # Filter out outlier dates identified in the quality check, if configured.
  if (
      quality_result.outlier_dates
      and data_quality_check_config.exclude_outlier_dates
  ):
    data = data[~data[api.DATE].isin(list(quality_result.outlier_dates))]

  # 3. Extract time series arrays.
  conversions = _get_time_series(data, api.CONVERSIONS, analysis_config)

  spend = {}
  if design_config.cell_count == 1:
    if api.SPEND in data.columns:
      spend[api.CELL_1] = _get_time_series(data, api.SPEND, analysis_config)
  elif design_config.cell_count > 1:
    for col in data.columns:
      if re.match(api.MULTICELL_SPEND_REGEX, col):
        cell_name = col[len('spend_') :]  # Removes "spend_" prefix.
        spend[cell_name] = _get_time_series(data, col, analysis_config)

  # 4. Generate placebo masks.
  # We use a key derived from the design config seed to ensure that placebo
  # mask generation is deterministic but distinct from the design phase.
  # We use a fold-in of a constant value to distinguish this key from others.
  # TODO: After refactoring to move placebo design generation to
  # the design phase, replace the constant fold-in with key splitting.
  analysis_key = jax.random.fold_in(jax.random.key(design_config.seed), 12345)
  placebo_masks = _get_placebo_masks(
      design_obj=analysis_config.design,
      treatment=treatment,
      design_config=design_config,
      analysis_config=analysis_config,
      key=analysis_key,
  )

  # 5. Run methodology analysis.
  tbr_results = {}
  experiment_duration_days = design_config.experiment_duration.days
  pretest_train = conversions.pretest[:-experiment_duration_days]
  pretest_val = conversions.pretest[-experiment_duration_days:]

  for cell, experiment_type in experiment_types.items():
    tbr_results[cell] = tbr.analyze(
        pretest_train_conversions=pretest_train,
        pretest_val_conversions=pretest_val,
        test_conversions=conversions.test,
        treatment_mask=treatment.mask,
        placebo_masks=placebo_masks,
        alpha=analysis_config.alpha,  # pyrefly: ignore[bad-argument-type]
        experiment_type=experiment_type,
        test_type=analysis_config.test_type,  # pyrefly: ignore[bad-argument-type]
        treatment_cell_id=util.cell_id_from_cell_name(cell),
        pretest_spend=spend[cell].pretest if cell in spend else None,
        test_spend=spend[cell].test if cell in spend else None,
    )

  geos = sorted(data[api.LOCATION].unique())

  # 6. Package and return results.
  return _get_analysis_summary(
      tbr_results=tbr_results,
      pretest_dates=conversions.pretest_dates,
      test_dates=conversions.test_dates,
      analysis_config=analysis_config,
      geos=geos,
      spend=spend,
      conversions=conversions,
      experiment_types=experiment_types,
      quality_check_result=quality_result,
  )
```

El objeto devuelto es un `AnalysisResult` con `results` por celda, la configuración usada, geos/fechas excluidas y, si aplica, el resultado de calidad de datos.

## 2. Modelado contrafactual y ATT

El objetivo es estimar qué habría ocurrido en los geos tratados si la intervención no hubiera sucedido. Durante el test se observa el factual, pero no se observa el contrafactual.

El efecto causal objetivo se define como **ATT** (*Average Treatment effect on the Treated*):

$$
ATT = E[Y(1) - Y(0)\,|\,D = 1]
$$

| Símbolo | Significado |
|---|---|
| $D=1$ | Geo tratado por la regla de asignación del estudio |
| $Y(1)$ | Outcome potencial con tratamiento, observado en test |
| $Y(0)$ | Outcome potencial sin tratamiento, contrafactual no observado |

Supuesto BAU documentado: sin una nueva intervención de marketing, todos los geos estarían bajo *business-as-usual* aunque sus conversiones fluctúen por estacionalidad u otras variaciones naturales.

La pérdida genérica del problema contrafactual se formula como:

$$
\sum_{t \in \text{pretest}} \left\| f\big(Y_{t,T}(0)\big) - g\big(Y_{t,C}(0)\big) \right\|_2^2
$$

En TBR, $f$ suele ser la conversión media del grupo tratado en el instante $t$ y $g$ es una transformación lineal aprendida sobre la conversión media del grupo control.

### Signo del efecto por tipo de experimento

GeoX calcula primero:

$$
\bar{\delta}_t = \bar{Y}_{treat,t} - \hat{\bar{Y}}_{treat,t}
\qquad
\Delta_k = |G_T| \times \sum_{t=1}^{k} \bar{\delta}_t
$$

| Tipo de experimento | Interpretación | Efecto incremental reportado |
|---|---|---|
| `HEAVY_UP` | Se incrementa la presión de medios | $\Delta_k$ |
| `HOLDBACK` | Se compara tratamiento frente a control BAU | $\Delta_k$ |
| `GO_DARK` | La intervención es apagar spend | $-\Delta_k$ |

En `GO_DARK`, el signo se invierte porque el apagado genera un efecto esperado negativo; GeoX lo niega para representar el valor positivo de la publicidad apagada.

## 3. Time-Based Regression (TBR)

TBR entrena una regresión lineal simple con datos pretest agregados y la usa para proyectar el contrafactual del grupo tratado durante el test.

### Agregación de grupos

Para estabilidad numérica y soporte multi-geo, el modelo se ajusta sobre KPI medio por grupo y el efecto final se escala de nuevo al total:

$$
\bar{Y}_{treat,t} = \frac{1}{|G_T|}\sum_{g \in G_T} Y_{g,t}
\qquad
\bar{Y}_{control,t} = \frac{1}{|G_C|}\sum_{g \in G_C} Y_{g,t}
$$

### Modelo base

En pretest:

$$
\bar{Y}_{treat,t} = \alpha + \beta\,\bar{Y}_{control,t} + \epsilon_t
\qquad t \in T_{pre}
$$

Donde:

| Parámetro | Papel |
|---|---|
| $\alpha$ | Intercepto; captura diferencia media base entre treatment y control |
| $\beta$ | Pendiente; captura correlación estructural entre grupos |
| $\epsilon_t$ | Residuo; GeoX no documenta supuestos distribucionales y cuantifica incertidumbre con placebos |

La estimación usa OLS y fuerza $\beta \ge 0$ por plausibilidad física:

```python
@jax.jit
def _fit_linear_regression(x, y) -> tuple[jnp.ndarray, jnp.ndarray]:
  x_mean = jnp.mean(x); y_mean = jnp.mean(y)
  ss_xx = jnp.sum((x - x_mean) ** 2)
  ss_xy = jnp.sum((x - x_mean) * (y - y_mean))
  slope = jnp.where(ss_xx > 1e-10, ss_xy / ss_xx, 0.0)
  slope = jnp.maximum(0.0, slope)      # Ensure slope is non-negative.
  intercept = y_mean - slope * x_mean
  return intercept, slope
```

### Proyección del test

Durante el test:

$$
\hat{\bar{Y}}_{treat,t} = \hat{\alpha} + \hat{\beta}\,\bar{Y}_{control,t}
$$

La conversión incremental diaria es observado menos contrafactual, y el efecto total es la suma de efectos diarios en el periodo de test.

### Partición pretest train / validation

En `analyze()`, GeoX separa el pretest en:

```python
experiment_duration_days = design_config.experiment_duration.days
pretest_train = conversions.pretest[:-experiment_duration_days]
pretest_val = conversions.pretest[-experiment_duration_days:]
```

El último bloque de longitud igual a `experiment_duration` sirve como validación para evaluar placebos con R² out-of-sample.

### Dataclasses de resultado

```python
@dataclasses.dataclass
class MdeResults:
  mde_abs: jnp.ndarray                       # (N_designs, k_cells)
  mde_pct: jnp.ndarray
  p_value: jnp.ndarray
  observed_conversions: jnp.ndarray          # (N_designs, k_cells, T)
  counterfactual_conversions: jnp.ndarray

@dataclasses.dataclass
class IcpdResults:
  cumulative_icpd: jnp.ndarray
  lower_bound: jnp.ndarray
  upper_bound: jnp.ndarray
  cumulative_incremental_spend: jnp.ndarray
  counterfactual_spend: jnp.ndarray

@dataclasses.dataclass
class TbrAnalysisResult:
  lift: api.Estimate
  cumulative_lift_with_cis: np.ndarray                    # (T, 3)
  percent_lift: api.Estimate
  icpd: Optional[api.Estimate] = None
  cumulative_icpd_with_cis: Optional[np.ndarray] = None   # (T, 3)
  counterfactual_conversions_with_cis: np.ndarray = ...   # (T, 4)
  pointwise_difference_with_cis: np.ndarray = ...         # (T, 3)
  counterfactual_spend: Optional[np.ndarray] = None
```

### Slope check para conversiones y spend

En generación de candidatos, para `GO_DARK` y `HEAVY_UP` con spend, se aplica `tbr.check_slope_similarity(..., design_config.slope_tolerance, ...)`. El criterio real compara la pendiente conversión-conversión y la pendiente spend-spend:

$$
diff = \frac{2 \times |b_1 - b_2|}{|b_1| + |b_2|}
$$

Código documentado:

```python
# diff = 2 * |b1 - b2| / (|b1| + |b2|)
diff = jnp.where(is_zero, jnp.inf, 2.0 * jnp.abs(b_conv - b_spend) / denom)
return diff <= tolerance
```

## 4. Inferencia robusta / Design-Aware Placebo Inference

### Mecanismo de asignación

Sea $Z \in \Omega = \{0,1\}^N$ el vector de tratamiento para $N$ geos y $X$ la matriz de covariables pretest. El diseño aplica restricciones o minimiza una función de coste:

$$
Z^{*} = \arg\min_{Z \in \Omega} C(Z, X)
$$

La documentación advierte que no es necesario escoger el mínimo exacto, porque puede estar sobreajustado. Basta seleccionar uniformemente desde el subconjunto de diseños aceptables:

$$
\Omega_D = \{ Z \in \Omega \mid C(Z, X) \le \epsilon \}
$$

### Problema que resuelve

La inferencia contrasta la **sharp null hypothesis**:

$$
H_0: Y_i(1) = Y_i(0)
$$

para cada unidad tratada $i$. El p-value es la probabilidad de observar un estadístico al menos tan extremo como el observado bajo el mismo mecanismo de asignación real.

### Por qué los placebos deben respetar el diseño

Los placebos estándar barajan etiquetas dentro de $\Omega$ usando sólo geos de control. Si ignoran estratificación, restricciones de presupuesto y calidad pretest, generan *bad splits*. Esos splits contaminan la distribución nula empírica con errores grandes, inflan error tipo I y reducen la potencia.

La inferencia design-aware restringe los placebos a $\Omega_D$: mismo algoritmo generativo, mismas funciones objetivo, mismos límites de presupuesto y mismas restricciones del diseño ejecutado. Por eso la distribución nula representa la incertidumbre del diseño real y no la de un experimento hipotético distinto.

### Pasos de implementación

1. Formalizar $P(Z|X)$ con la configuración real del diseño.
2. Generar asignaciones placebo $\{Z^{(1)},\dots,Z^{(K)}\}$ con el mismo mecanismo que el diseño.
3. Para cada placebo, ajustar contrafactual sólo con pretest y evaluar el test real:

$$
T^{(k)} = \sum_{t > t_0}\left(Y_t^{(k)} - \widehat{Y_t^{(k)}(0)}\right)
$$

4. Calcular p-values e intervalos de confianza con estadísticos studentizados.

En `analysis.py`, `_get_placebo_masks` reutiliza el motor de diseño sólo sobre geos de control, excluye los geos tratados, genera `n_placebo_candidates`, calcula R² con `tbr.get_r2`, filtra por `min_placebo_r2` y conserva los `n_top_placebos` mejores ordenados por R² descendente.

## 5. p-values studentizados e intervalos empíricos

Para corregir diferencias de ajuste entre placebos, GeoX usa el estadístico studentizado:

$$
\tilde{T}^{(k)} = \frac{T^{(k)}}{RMSE_{\text{pre}}^{(k)}}
$$

La fórmula general documentada del p-value es:

$$
p = \frac{1}{K+1}\left\{1 + \sum_{k=1}^{K}\mathbb{I}\left(\tilde{T}^{(k)} \text{ is more extreme than } \tilde{T}_{\text{obs}}\right)\right\}
$$

Implementación real en `methodology/util.py`:

```python
@functools.partial(jax.jit, static_argnames=['test_type'])
def compute_studentized_p_value(estimate, rmse, t_placebo,
                                test_type=api.TestType.TWO_SIDED) -> jnp.ndarray:
  t_obs = estimate / jnp.maximum(rmse, 1e-9)
  n_placebo = len(t_placebo)
  if test_type == api.TestType.TWO_SIDED:
    n_extreme = 2 * jnp.minimum(jnp.sum(t_placebo <= t_obs), jnp.sum(t_placebo >= t_obs))
    n_extreme = jnp.minimum(n_extreme, n_placebo)
  else:
    n_extreme = jnp.sum(t_placebo >= t_obs)
  p_value = (1.0 + n_extreme) / (1.0 + n_placebo)
  return p_value
```

Intervalos de confianza reales:

```python
@functools.partial(jax.jit, static_argnames=['test_type'])
def compute_cis(estimate, rmse, t_placebo, alpha,
                test_type=api.TestType.TWO_SIDED) -> tuple[jnp.ndarray, jnp.ndarray]:
  if test_type == api.TestType.TWO_SIDED:
    lower = estimate - jnp.quantile(t_placebo, 1 - alpha / 2) * rmse
    upper = estimate - jnp.quantile(t_placebo, alpha / 2) * rmse
  else:
    lower = estimate - jnp.quantile(t_placebo, 1 - alpha) * rmse
    upper = jnp.array(jnp.inf)
  return lower, upper
```

Error estándar:

```python
@jax.jit
def compute_se(rmse, t_placebo):
  return jnp.std(t_placebo) * rmse
```

### Parámetros de placebos en `AnalysisConfig`

| Parámetro | Default | Papel |
|---|---:|---|
| `n_placebo_candidates` | `100_000` | Candidatos placebo iniciales |
| `n_top_placebos` | `500` | $K$ placebos válidos usados en p-values y CIs |
| `min_placebo_r2` | `0.6` | R² out-of-sample mínimo para conservar un placebo |
| `min_placebo_count_warning` | `100` | Warning si hay pocos placebos válidos |
| `min_placebo_count_error` | `10` | Error si no hay suficientes placebos válidos |

Mensaje de error real:

```python
error_message = (
    'Insufficient valid placebo candidates (found {count}, required at least '
    '{min_count_error}). Only placebo designs with '
    'an out-of-sample R-squared score >= {min_r2} are '
    'kept for analysis. This is usually caused by heterogeneity and '
    'volatility among geos, such that the exchangeability assumption '
    'among geos is violated. Consider providing more stationary pre-test '
    "data or lowering the 'min_placebo_r2' threshold in your AnalysisConfig."
)
```

`percent_lift` se calcula en escala log, construye el CI en esa escala y luego aplica exponenciación menos 1. Para `GO_DARK`, estimate y límites se niegan.

```python
def compute_regularized_log_ratio(y_num, y_den, scale=None) -> jnp.ndarray:
  if scale is None:
    scale = jnp.maximum(jnp.abs(y_num), jnp.abs(y_den))
  threshold = jnp.maximum(1e-3 * scale, 1e-9)
  return jnp.log(jnp.maximum(y_num, threshold) / jnp.maximum(y_den, threshold))
```

## 6. Pipeline real de `analyze`

| Paso | Comentario original | Qué hace |
|---:|---|---|
| 1 | `# 1. Prepare configuration.` | Prepara `DesignConfig`, hereda `alpha` y `test_type` si faltan, exige `Methodology.TBR`. |
| 2 | `# 2. Prepare data and masks.` | Filtra geos/fechas excluidas y construye la máscara `0.0 = control`, `k = cell_k`. |
| 2b | `# Run data quality checks.` | Ejecuta `check_analysis_data_quality`. |
| 2c | `# Filter out outlier dates identified in the quality check, if configured.` | Elimina outlier dates si `exclude_outlier_dates=True`. |
| 3 | `# 3. Extract time series arrays.` | Extrae `conversions` y `spend` en `TimeSeries(pretest, test, pretest_dates, test_dates)`. |
| 4 | `# 4. Generate placebo masks.` | Genera placebos deterministas con seed derivada (`fold_in(..., 12345)`). |
| 5 | `# 5. Run methodology analysis.` | Ejecuta `tbr.analyze` por celda usando pretest train/validation y test. |
| 6 | `# 6. Package and return results.` | Convierte resultados TBR a `AnalysisResult` con DataFrames interpretables. |

### Spend single-cell vs multi-cell

GeoX normaliza columnas a minúscula (`data.columns.astype(str).str.lower()`).

| Diseño | Columna esperada |
|---|---|
| Single-cell | `spend` |
| Multi-cell | Columnas que cumplen `api.MULTICELL_SPEND_REGEX` |

Constante real:

```python
MULTICELL_SPEND_REGEX = r"^spend_cell_[1-9]\d*$"
```

Extracción real:

```python
spend = {}
if design_config.cell_count == 1:
  if api.SPEND in data.columns:
    spend[api.CELL_1] = _get_time_series(data, api.SPEND, analysis_config)
elif design_config.cell_count > 1:
  for col in data.columns:
    if re.match(api.MULTICELL_SPEND_REGEX, col):
      cell_name = col[len('spend_') :]  # Removes "spend_" prefix.
      spend[cell_name] = _get_time_series(data, col, analysis_config)
```

## 7. Métricas de salida: `AnalysisMetrics`

Estructura real:

```python
@dataclasses.dataclass
class AnalysisResult:
  results: dict[str, AnalysisMetrics]
  analysis_config: AnalysisConfig
  excluded_geos: Set[str]
  excluded_dates: Set[pd.Timestamp]
  quality_check_result: Optional[QualityCheckResult] = None

@dataclasses.dataclass
class AnalysisMetrics:
  lift: Estimate
  percent_lift: Estimate
  cumulative_lift: pd.DataFrame
  counterfactual_conversions: pd.DataFrame
  pointwise_difference: pd.DataFrame
  icpd: Optional[Estimate] = None
  cumulative_icpd: Optional[pd.DataFrame] = None
  descriptive_metrics: Optional[DescriptiveMetrics] = None

@dataclasses.dataclass
class Estimate:
  point_estimate: float
  lower_bound: float
  upper_bound: float
  standard_deviation: float
  p_value: float

@dataclasses.dataclass
class DescriptiveMetrics:
  estimated_bau_spend: Optional[float] = None
```

### DataFrames incluidos

| DataFrame | Índice | Columnas |
|---|---|---|
| `cumulative_lift` | `test_dates` | `lift`, `lower_bound`, `upper_bound` |
| `cumulative_icpd` | `test_dates` | `icpd`, `lower_bound`, `upper_bound` |
| `counterfactual_conversions` | `pretest_dates + test_dates` | `observed`, `counterfactual`, `lower_bound`, `upper_bound` |
| `pointwise_difference` | Fechas completas | `difference`, `lower_bound`, `upper_bound` |

En `counterfactual_conversions`, los intervalos de confianza son `NaN` en pretest y aparecen en test.

### Interpretación de negocio

| Métrica | Qué significa | Cómo leerla |
|---|---|---|
| `lift` / incremental conversions | Conversiones o revenue incremental total causado por la intervención | `point_estimate` es el efecto acumulado; CI y p-value cuantifican incertidumbre |
| `percent_lift` | Incremental relativo frente al baseline contrafactual | Si vale `0.049`, equivale a ~4.9% de uplift |
| `icpd` / `ICPD` | Incremental conversion per dollar | Conversiones incrementales por unidad de spend |
| `iROAS` | No es campo distinto; si `conversions` es revenue, `icpd ≡ iROAS` | Interpretar como revenue incremental por dólar de spend |
| `estimated_bau_spend` | Spend BAU estimado de geos incluidos en esa celda | No es spend nacional; sólo treatment de esa celda + control |
| `p_value` | Evidencia contra la hipótesis nula bajo inferencia design-aware | Comparar con `alpha` |
| `lower_bound` / `upper_bound` | Intervalo de confianza empírico | Con `alpha=0.1`, cobertura esperada 90% |

`estimated_bau_spend` se calcula de forma diferente según el tipo:

```python
control_predicted_spend = (
    control_pretest_conversions / treatment_pretest_conversions
) * treatment_test_spend
estimated_bau_spend = treatment_test_spend + control_predicted_spend
```

Para `GO_DARK` / `HEAVY_UP`: `control_test_spend + sum(counterfactual_spend)`.

## 8. `plot_analysis`: suite de 4 gráficos

`geox.plot_analysis(analysis_result)` genera una figura por celda. La fuente resume `n_rows = 3 + has_icpd`, por lo que hay 3 paneles si no existe spend y 4 si `cumulative_icpd` está disponible.

| Panel | Título real | Qué muestra | Interpretación |
|---:|---|---|---|
| 1 | `Observed vs. Counterfactual total conversions ({cell_id})` | Timeline completa de conversiones observadas vs contrafactual; CI sólo en test | En pretest deberían alinearse bien; divergencia en test sugiere efecto |
| 2 | `Pointwise differences time series ({cell_id})` | Diferencia diaria observado − contrafactual | En pretest debería estar cerca de 0; en test muestra efecto diario |
| 3 | `Cumulative lift time series ({cell_id})` | Lift acumulado sólo en test | Se espera que crezca con el tiempo si hay efecto incremental sostenido |
| 4 | `Cumulative iCPD time series ({cell_id})` | iCPD acumulado sólo si hay spend | Eficiencia incremental acumulada |

Detalles reales:

- Usa `sns.set_style('whitegrid')`.
- Añade línea gris punteada en `analysis_start_date` con etiqueta `Test start date`.
- Añade línea gris continua en `pretest_end_date` en los dos primeros paneles si existe.
- En `ONE_SIDED`, reemplaza ±`inf` por límites recortados para `fill_between`.

## 9. Interpretación de resultados

`alpha` es el nivel de significación. Por defecto es `0.1`, por lo que la cobertura esperada del intervalo de confianza es:

$$
1 - \alpha = 90\%
$$

`test_type` controla la cola del contraste:

| `test_type` | Cálculo documentado |
|---|---|
| `TWO_SIDED` | CI usa cuantiles `1 - alpha / 2` y `alpha / 2`; p-value cuenta extremos en ambos lados |
| `ONE_SIDED` | CI inferior finito y `upper = inf`; p-value cuenta `t_placebo >= t_obs` |

Lectura práctica:

1. Un resultado es concluyente si el `p_value` de la métrica relevante es menor o igual que `alpha`.
2. Si no es concluyente, no afirmar ausencia de efecto; reportar que el experimento no detectó evidencia suficiente bajo el diseño ejecutado.
3. Revisar número de placebos válidos, `min_placebo_r2`, calidad del ajuste pretest y warnings de calidad.
4. No cambiar a posteriori el diseño, las fechas o las restricciones para obtener significancia: eso rompe la inferencia design-aware.

## 10. Errores frecuentes y trampas anti-alucinación

| Trampa | Regla segura |
|---|---|
| Usar métricas ratio como KPI principal | No documentado como soportado. GeoX espera un único KPI `conversions` aditivo por run. |
| Agregar datos diarios a semanal | Prohibido por validación: la granularidad diaria es obligatoria y datos semanales disparan errores. |
| Usar menos de `3N` de pretest | El pretest debe tener al menos `3 × experiment_duration` fechas únicas. |
| Incluir fechas con incidencias u outliers | Usar `excluded_dates` y/o `QualityCheckConfig(exclude_outlier_dates=True)` cuando corresponda. |
| Ignorar learning periods | La exclusión explícita de “learning periods” no está documentada en las fuentes; si son fechas de incidencia operativa conocidas, tratarlas como exclusiones documentadas. |
| Reutilizar un diseño distinto al ejecutado | Incorrecto: el análisis requiere el diseño original, sus geos, restricciones, metodología y regla de asignación. |
| Generar placebos con otro mecanismo | Incorrecto: los placebos deben salir del mismo mecanismo de asignación del diseño real. |
| Mezclar KPIs | No soportado en un mismo run; la documentación indica un único KPI `conversions`. |
| Interpretar `estimated_bau_spend` como spend nacional | Incorrecto: sólo cubre geos incluidos en la celda analizada. |
| Comparar directamente dos celdas activas | No documentado como métrica soportada; cada celda se evalúa contra el control compartido. |
| Activar tests user-level simultáneos | La documentación advierte que contaminan treatment/control y diluyen potencia. |

## 11. Ejemplo end-to-end

Ejemplo single-cell documentado en notebooks y guías:

```python
import pandas as pd
from pprint import pprint
import meridian_geox as geox

# Load analysis data with pretest + test rows.
single_cell_analysis_data = pd.read_csv("analysis_data.csv")
single_cell_analysis_data["date"] = pd.to_datetime(
    single_cell_analysis_data["date"]
)

# Load the design that was actually executed.
single_cell_loaded_design = geox.Design.load_from_json(saved_design_json)

# Configure optional analysis quality checks.
exclude_outlier_dates_analysis = True  # @param {type:"boolean"}

analysis_data_quality_check_config = geox.QualityCheckConfig(
    exclude_outlier_dates=exclude_outlier_dates_analysis,
)

# Analyze experiment results.
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

# Inspect point estimates and uncertainty.
print("Analysis result:")
pprint(single_cell_analysis_result.results)

# Show first 5 days of cumulative lift.
single_cell_analysis_result.results["cell_1"].cumulative_lift.head(5)

# iCPD is available only when spend was provided.
if "spend" in single_cell_analysis_data.columns:
  display(single_cell_analysis_result.results["cell_1"].cumulative_icpd.head(5))
else:
  print(
      "Cumulative iCPD is not available because the 'spend' column was not"
      " provided."
  )

# Visual diagnostic suite.
geox.plot_analysis(single_cell_analysis_result)
```

Ejemplo multi-cell:

```python
# Analyze experiment results.
print("\nAnalyzing experiment results...")
multicell_analysis_config = geox.AnalysisConfig(
    design=multicell_loaded_design,
    analysis_start_date=pd.to_datetime("2020-04-01"),
    analysis_end_date=pd.to_datetime("2020-04-30"),
)
multicell_analysis_result = geox.analyze(
    multicell_analysis_data, multicell_analysis_config
)

# Results by cell.
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
