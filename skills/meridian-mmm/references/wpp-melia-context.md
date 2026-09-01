# Meridian — Contexto y Casos de Uso WPP / Meliá

> Parte de la skill meridian-mmm. Cargar este archivo para casos de uso reales de Meliá: medición de
> campañas, optimización cross-channel, análisis geo EMEA, integración de datos (BRAIN_EMEA.xlsx),
> troubleshooting, integración con CausalImpact/Looker Studio, y best practices del equipo.

---

## PARTE V — CONTEXTO ESPECÍFICO WPP / MELIÁ

> **Nota de corrección (2026-09-01):** la versión anterior de este documento contenía ejemplos
> de código para los casos de uso de Meliá basados en una API **inventada**
> (`meridian.Model(...)`, `model.fit()`, `model.get_incremental_outcome()`, `model.optimize_budget()`,
> `model.plot_roi()`, `meridian.validate_data()`, etc.). Esa API **no existe** en la librería real.
> Los ejemplos de esta sección han sido reescritos usando el API real y verificado de Meridian
> (`DataFrameInputDataBuilder`, `model.Meridian`, `sample_posterior`, `optimizer.BudgetOptimizer`,
> `analyzer.Analyzer`, etc.), documentado en las Partes I-IV de este mismo archivo.

### 32. Medición de impacto de una campaña (ej. campaña de verano)

```python
from meridian import constants
from meridian.analysis import analyzer
from meridian.data import data_frame_input_data_builder
from meridian.model import model, prior_distribution, spec
import tensorflow_probability as tfp

# --- Construir InputData con el KPI de reservas (bookings) ---
builder = data_frame_input_data_builder.DataFrameInputDataBuilder(
    kpi_type='non_revenue',
    default_kpi_column='bookings',
    default_revenue_per_kpi_column='revenue_per_booking',
)
builder = (
    builder
    .with_kpi(df)
    .with_revenue_per_kpi(df)
    .with_population(df)
    .with_controls(df, control_cols=['season_control', 'competitor_price_control', 'covid_restrictions_control'])
    .with_media(
        df,
        media_cols=['google_ads_impression', 'meta_ads_impression', 'tv_impression', 'ooh_impression'],
        media_spend_cols=['google_ads_spend', 'meta_ads_spend', 'tv_spend', 'ooh_spend'],
        media_channels=['google_ads', 'meta_ads', 'tv', 'ooh'],
    )
)
data = builder.build()

# --- Configurar y entrenar el modelo ---
model_spec = spec.ModelSpec(prior=prior_distribution.PriorDistribution(), enable_aks=True)
mmm = model.Meridian(input_data=data, model_spec=model_spec)
mmm.sample_prior(500)
mmm.sample_posterior(n_chains=4, n_adapt=1000, n_burnin=1000, n_keep=1000, seed=0)

# --- Analizar la contribución incremental de google_ads en el Q2 2026 ---
mmm_analyzer = analyzer.Analyzer(mmm)
incremental = mmm_analyzer.incremental_outcome(
    selected_times=['2026-04-01', '2026-06-30'],
)
# incremental es un xarray.Dataset con dimensiones [chain, draw, media_channel];
# filtrar por 'google_ads' y agregar sobre chain/draw para obtener media e intervalo creíble.
```

### 33. Optimización de presupuesto cross-channel

```python
from meridian.analysis import optimizer

budget_optimizer = optimizer.BudgetOptimizer(mmm)

# Optimizar 5M€ entre canales con restricciones por canal
# (pct_of_spend fija el punto de partida; las restricciones min/max reales
# se expresan como límites de porcentaje de asignación, no valores absolutos)
results = budget_optimizer.optimize(
    budget=5_000_000,
    pct_of_spend=[0.30, 0.25, 0.25, 0.20],  # orden: google_ads, meta_ads, tv, ooh
)
results.output_optimization_summary('optimizacion_5M.html', output_dir)
# El HTML resultante incluye la asignación óptima por canal y el ROI esperado.
```

### 34. Análisis geo-level (EMEA: España, UK, Francia…)

```python
# El modelado geo se activa automáticamente si el DataFrame incluye una columna de geografía
# (p. ej. 'country') y se pasa a with_population / los builders de media con esa granularidad.
# No existe un parámetro `geo_column` en el constructor; la geografía es un nivel del índice
# del DataFrame de entrada (geo, time) que Meridian infiere de la estructura de los datos.

builder = data_frame_input_data_builder.DataFrameInputDataBuilder(
    kpi_type='revenue',
    default_kpi_column='revenue',
)
# df debe tener una fila por combinación (country, week) con todas las columnas de media/control
data = (
    builder
    .with_kpi(df)  # df incluye la columna 'geo' = country (ES, UK, FR, ...)
    .with_population(df)
    .with_media(df, media_cols=[...], media_spend_cols=[...], media_channels=[...])
    .build()
)
mmm = model.Meridian(input_data=data, model_spec=model_spec)
# ... entrenar como siempre ...

# Insights por país: filtrar el resultado de Analyzer por la dimensión 'geo'
mmm_analyzer = analyzer.Analyzer(mmm)
roi_por_geo = mmm_analyzer.roi(aggregate_geos=False)  # mantiene la dimensión geo en el resultado
roi_espana = roi_por_geo.sel(geo='ES')
roi_uk = roi_por_geo.sel(geo='UK')
```

### 35. Integración con `BRAIN_EMEA.xlsx`

```python
import pandas as pd

# Cargar y preparar los datos de Meliá desde el Excel interno
brain_data = pd.read_excel('BRAIN_EMEA.xlsx')

# Renombrar/transformar columnas al formato esperado por Meridian:
# - una fila por (geo, semana)
# - columnas <canal>_impression y <canal>_spend por cada canal de medios
# - columna de KPI (p. ej. 'revenue') y, si aplica, 'revenue_per_kpi'
df_meridian = brain_data.rename(columns={
    "pais": "geo",
    "semana": "time",
    "ingresos": "revenue",
    "digital_impresiones": "digital_impression",
    "digital_gasto": "digital_spend",
    "tv_impresiones": "tv_impression",
    "tv_gasto": "tv_spend",
})

builder = data_frame_input_data_builder.DataFrameInputDataBuilder(
    kpi_type='revenue', default_kpi_column='revenue',
)
data = (
    builder
    .with_kpi(df_meridian)
    .with_population(df_meridian)
    .with_media(
        df_meridian,
        media_cols=['digital_impression', 'tv_impression'],
        media_spend_cols=['digital_spend', 'tv_spend'],
        media_channels=['digital', 'tv'],
    )
    .build()
)
mmm = model.Meridian(input_data=data, model_spec=model_spec)
mmm.sample_posterior(n_chains=4, n_adapt=1000, n_burnin=1000, n_keep=1000, seed=0)
```

### 36. Troubleshooting rápido (con el API real)

**Entrenamiento muy lento / sin GPU:**
```python
import tensorflow as tf
print("GPUs disponibles:", tf.config.experimental.list_physical_devices("GPU"))

# Si no hay GPU, reducir carga en lugar de num_chains/num_warmup/num_samples
# (esos nombres no existen; los parámetros reales son n_chains, n_adapt, n_burnin, n_keep):
mmm.sample_posterior(n_chains=2, n_adapt=500, n_burnin=250, n_keep=500, seed=0)
```

**El modelo no converge (R-hat alto):**
```python
from meridian.analysis import visualizer

diagnostics = visualizer.ModelDiagnostics(mmm)
diagnostics.plot_rhat_boxplot()  # objetivo: max R-hat < 1.1 (ideal) o < 1.2 (mínimo aceptable)

# Aumentar la fase de adaptación/burn-in en vez de "warmup" genérico:
mmm.sample_posterior(n_chains=4, n_adapt=2000, n_burnin=1500, n_keep=1000, seed=0)

# Ajustar priors para regularizar más (no existe `prior_scale`; se ajusta
# directamente la distribución a priori, p. ej. reduciendo roi_sigma):
prior = prior_distribution.PriorDistribution(
    roi_m=tfp.distributions.LogNormal(0.2, 0.5, name=constants.ROI_M)  # sigma más bajo = más informativo
)
```

**Formato de datos incorrecto:**
```python
# No existen meridian.get_data_schema() ni meridian.validate_data().
# La validación real ocurre al llamar a builder.build(): lanza excepciones descriptivas
# si faltan columnas requeridas o hay incompatibilidades de forma/tipos.
# Además, ejecutar el EDA de Meridian ANTES de entrenar ayuda a detectar
# problemas de datos (missing values, correlaciones fuertes, varianza anómala):
from meridian.model.eda import meridian_eda
eda = meridian_eda.MeridianEDA(mmm)
eda.generate_and_save_report(filename='eda_report.html', filepath=output_dir)
```

### 37. Integración con TFP CausalImpact

Sigue siendo válido combinar ambos frameworks para responsabilidades distintas:
Meridian para atribución/optimización general, y `CausalImpact` (paquete `tfcausalimpact` en Python)
para medir el efecto incremental de una intervención puntual (p. ej. un evento o cambio de precio concreto).

```python
# 1. Contribución general estimada por Meridian
mmm_analyzer = analyzer.Analyzer(mmm)
roi_google_ads = mmm_analyzer.roi()  # DataFrame/Dataset con ROI medio por canal + intervalo creíble

# 2. Efecto incremental de una intervención puntual con CausalImpact
from causalimpact import CausalImpact
ci = CausalImpact(campaign_data, pre_period=[0, 100], post_period=[101, 150])
ci_summary = ci.summary()

# 3. Comparar: el ROI agregado de Meridian frente al lift puntual de CausalImpact
# para triangular resultados (ver extensión causal-impact-expert para el detalle del workflow CausalImpact).
```

### 38. Con Looker Studio (Scenario Planner)

Meridian ofrece un Scenario Planner que se puede exponer en Looker Studio para que los stakeholders
de negocio simulen presupuestos sin tocar código. Requiere el extra de instalación `[scenario-planning]`
(ver Parte I, sección de extras de instalación) y sirve principalmente como capa de visualización sobre
los resultados ya calculados por `BudgetOptimizer`, no como sustituto del análisis en Python.

### 39. Best Practices para Meliá (vigentes)

1. **Calidad de datos**: mínimo 2 años de datos semanales (104 semanas) por geografía; sin huecos en KPI ni en gasto de medios; variables de control completas para todo el periodo.
2. **Granularidad**: preferir modelado geo-level (país/región) si hay suficientes datos por geo (ver Parte IV, sección 24, regla de "número de parámetros << número de observaciones"); usar modelo nacional con controles robustos si no.
3. **Calibración**: incorporar resultados de experimentos previos (geo lift tests, holdouts) como priors informativos de ROI en vez de dejar los valores por defecto (ver Parte IV, sección 22).
4. **Cadencia de actualización**: re-entrenar cada 3-6 meses; usar la estrategia de "nudos híbridos" al añadir datos nuevos para no invalidar el modelo anterior (ver Parte IV, sección 31).
5. **Validación**: usar holdout de las últimas 8-12 semanas y comparar predicho vs. real; apoyarse en la Puntuación de Salud del modelo (objetivo ≥ 90/100, ver Parte IV, sección 25) en vez de solo un umbral de R².
