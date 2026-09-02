# Calibración de Meridian MMM con resultados GeoX

Este documento define el puente técnico GeoX → Meridian MMM para convertir resultados causales de incrementalidad en priors de ROI usados por la skill [`meridian-mmm`](../../meridian-mmm/SKILL.md).

## 1. Por qué calibrar

La calibración cierra un ciclo virtuoso entre MMM y experimentación:

1. El modelo Meridian MMM identifica canales con mayor incertidumbre, saturación o valor marginal esperado.
2. Esa lectura sugiere qué experimento GeoX conviene correr para medir incrementalidad causal.
3. GeoX produce un resultado experimental (`AnalysisResult`) con estimate, error estándar, spend y fechas.
4. `CalibrationBuilder` traduce ese resultado a un prior de ROI para el siguiente ajuste del MMM.

Así, Meridian no depende sólo de datos observacionales: incorpora evidencia experimental como información bayesiana. Para construir el modelo final, usa el API real documentado en [`meridian-mmm/references/api-reference.md`](../../meridian-mmm/references/api-reference.md): `PriorDistribution` → `ModelSpec` → `model.Meridian`.

## 2. `CalibrationBuilder`

`CalibrationBuilder` automatiza la traducción de resultados de experimentos de incrementalidad en **ROI priors** para canales paid media y reach & frequency.

Automatiza cuatro fases:

| Fase | Qué hace |
|---|---|
| Registrar experimentos | Añade resultados GeoX o genéricos a un canal MMM. |
| Aplicar ajustes | Corrige diferencias de spend, recencia y duración entre experimento y ventana MMM. |
| Fusionar distribuciones | Combina N experimentos mediante actualización bayesiana. |
| Ajustar familia paramétrica | Ajusta LogNormal, Gamma o Normal al posterior numérico para producir `roi_m` y `roi_rf`. |

Referencia oficial indicada por las fuentes: `/meridian/reference/api/meridian/model/calibration/prior_builder/CalibrationBuilder`.

## 3. Paso 1 — Registrar experimentos

### 3.1 GeoX: `with_meridian_geox_experiment_result`

`with_meridian_geox_experiment_result` acepta directamente el objeto `AnalysisResult` devuelto por GeoX y extrae automáticamente:

- point estimate;
- standard error;
- spend;
- fechas del experimento.

El objeto GeoX relevante se obtiene con:

```python
import meridian_geox as geox

analysis_result = geox.analyze(
    data=analysis_df,
    analysis_config=analysis_config,
    data_quality_check_config=quality_check_config,
)
```

### 3.2 Experimentos no GeoX: `with_incrementality_experiment_result`

`with_incrementality_experiment_result` se usa para experimentos externos a GeoX. En ese caso se introducen a mano los valores equivalentes: point estimate, standard error, spend y fechas.

> Nota anti-alucinación: las fuentes sólo documentan el propósito de estos métodos; las firmas exactas y nombres de argumentos no están documentados en las fuentes leídas.

### 3.3 Mapeo automático desde GeoX

| Concepto de calibración | Campo GeoX |
|---|---|
| $\mu_{exp}$ | `metrics.icpd.point_estimate` |
| $\sigma_{exp}$ | `metrics.icpd.standard_deviation` |
| spend del experimento | `metrics.descriptive_metrics.estimated_bau_spend` |
| fecha inicio | `analysis_config.analysis_start_date` |
| fecha fin | `analysis_config.analysis_end_date` |

> **Cómo obtener `metrics`** (verificado contra `meridian-geox` 1.0.0): `metrics` es una
> instancia de `AnalysisMetrics`, y se accede **por celda** desde el diccionario
> `AnalysisResult.results`. No existe `AnalysisResult.metrics`:
>
> ```python
> result = geox.analyze(data, analysis_config)
> metrics = result.results['cell_1']        # AnalysisMetrics de la celda
> mu_exp = metrics.icpd.point_estimate
> sigma_exp = metrics.icpd.standard_deviation
> spend = metrics.descriptive_metrics.estimated_bau_spend
> ```

Campos exactos del resultado GeoX:

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

`estimated_bau_spend` representa el spend BAU estimado para las geos incluidas en la celda analizada; no representa necesariamente el spend nacional total del anunciante. En experimentos con KPI no revenue, Meridian convierte automáticamente a escala revenue usando `revenue_per_kpi`.

## 4. Paso 2 — Ajustes de calibración

Meridian ajusta el estimate experimental porque experimento y MMM difieren en scope, timing y duración.

### 4.1 Fórmula general

$$
\mu_{adj} = (\gamma_{duration} + \gamma_{user}) \cdot \mu_{exp}
$$

$$
\sigma_{adj} = \sigma_{exp}\cdot\sqrt{1.0 + \tau_{spend} + \tau_{recency} + \tau_{duration} + \tau_{user}}
$$

Interpretación:

- $\mu_{exp}$ es el point estimate experimental.
- $\sigma_{exp}$ es el standard error experimental.
- $\gamma_{duration}$ escala el estimate cuando el experimento no captura todo el efecto adstock.
- $\gamma_{user}$ es un ajuste opcional del usuario; default documentado: `0`.
- $\tau_{spend}$, $\tau_{recency}$ y $\tau_{duration}$ aumentan la varianza para reflejar incertidumbre adicional.
- $\tau_{user}$ es un ajuste opcional del usuario al standard error; default documentado: `0`.

### 4.2 Ajuste de spend

$$
\tau_{spend} = \frac{1.0 - r}{r}
$$

$$
r = \frac{\min(\text{experiment\_avg\_daily\_spend},\ \text{channel\_avg\_daily\_spend})}{\max(\text{experiment\_avg\_daily\_spend},\ \text{channel\_avg\_daily\_spend})}
$$

$$
\text{experiment\_avg\_daily\_spend} = \frac{\text{experiment\_total\_spend}}{\text{experiment\_duration\_days}}
\qquad
\text{channel\_avg\_daily\_spend} = \frac{\text{total\_channel\_spend}}{\text{model\_duration\_days}}
$$

Si el gasto diario medio del experimento coincide con el del canal modelado, $r = 1.0$ y $\tau_{spend} = 0.0$. Si el experimento tiene un nivel de gasto muy distinto al nivel modelado, $r$ se acerca a 0 y se penaliza la incertidumbre ensanchando el prior.

### 4.3 Ajuste de recencia

$$
\lambda = 0.5^{\,w / 52.0}
\qquad
\tau_{recency} = \frac{1.0 - \lambda}{\lambda}
$$

Donde $w$ es el número de semanas entre la fecha de fin del experimento y la última fecha modelada en el MMM. El half-life documentado es 52 semanas. Un experimento reciente tiene $\lambda = 1.0$ y no añade incertidumbre; un experimento antiguo aporta menos información y aumenta $\tau_{recency}$. Si la última fecha modelada cae antes del experimento, no se aplica ajuste: $\tau_{recency} = 0.0$.

### 4.4 Ajuste de duración

Sea $D$ la duración del experimento en semanas, $L$ el `max_lag` del modelo, y $w_s$ los pesos de adstock decay calculados con `adstock_decay_spec` y tasa $\alpha$.

Si $D \le L + 1$:

$$
p = \frac{\sum_{s=0}^{D-1} w_s}{\sum_{s=0}^{L} w_s}
$$

Si $D > L + 1$:

- con decay binomial, $p = 1.0$ porque los pesos decaen a cero dentro de la ventana de lookback;
- con decay geométrico:

$$
p = \frac{\sum_{s=0}^{L} w_s + \sum_{s=L+1}^{D-1} \alpha^s}{\sum_{s=0}^{L} w_s}
$$

La capture proportion $p$ se acota a $[10^{-6}, 1.0]$.

$$
\gamma_{duration} = \frac{1.0}{p}
\qquad
\tau_{duration} = \max\left(\frac{1.0 - p}{p},\ 0.0\right)
$$

Intuición: si el experimento es corto, no observa toda la cola de adstock; Meridian escala el estimate hacia arriba y añade incertidumbre. Defaults documentados: `adstock_decay_spec='geometric'`, `alpha=0.5`, `max_lag=8`.

## 5. Paso 3 — Fusión bayesiana

Para N experimentos independientes registrados en un canal, Meridian combina las distribuciones ajustadas con un `baseline_prior` opcional:

$$
p(\text{ROI} \mid \{\mu_{adj,i}, \sigma_{adj,i}\}) \propto \pi(\text{ROI}) \prod_{i=1}^{N} L_i(\text{ROI}; \mu_{adj,i}, \sigma_{adj,i})
$$

$$
L_i(\text{ROI}; \mu_{adj,i}, \sigma_{adj,i}) =
\frac{1}{\sqrt{2\pi}\,\sigma_{adj,i}}
\exp\left(-\frac{(\mu_{adj,i} - \text{ROI})^2}{2\sigma_{adj,i}^2}\right)
$$

Equivalente:

$$
\mu_{adj,i} \sim \text{Normal}(\text{ROI},\ \sigma_{adj,i}^2)
\quad \text{for each experiment } i
$$

$$
\text{ROI} \sim \pi(\cdot)
$$

Si no se especifica `baseline_prior`, se usa un prior uniforme impropio sobre reales positivos:

$$
\pi(\text{ROI}) \propto 1 \quad \text{for } \text{ROI} > 0
$$

El posterior se evalúa numéricamente sobre una malla adaptativa.

## 6. Paso 4 — Ajuste paramétrico

Meridian ajusta una familia paramétrica estándar al posterior numérico:

| Familia | Soporte documentado |
|---|---|
| LogNormal | Siempre considerada. |
| Gamma | Siempre considerada. |
| Normal | Evaluada cuando el `baseline_prior` permite soporte negativo. |

La forma final se escoge minimizando cross-entropy loss, equivalente a minimizar divergencia KL contra el posterior numérico.

El output de `build()` es `CalibratedPriors`, que contiene:

- `priors.roi_m`: prior calibrado para canales paid media.
- `priors.roi_rf`: prior calibrado para canales reach & frequency.

Para canales no calibrados, `CalibrationBuilder` asigna el prior custom aportado en `custom_prior`. El prior default `LogNormal(0.2, 0.9)` sólo se usa si no se aporta prior custom para ese canal.

## 7. Flujo de código end-to-end

El siguiente bloque muestra el encadenado correcto sin inventar firmas no documentadas. Las piezas de Meridian MMM usan el API real de la skill `meridian-mmm`; las llamadas concretas a `CalibrationBuilder` mantienen placeholders donde la fuente no documenta nombres de argumentos.

```python
import meridian_geox as geox
from meridian.data import data_frame_input_data_builder
from meridian.model import model, prior_distribution, spec
from meridian.model.calibration import prior_builder

# 1) Ejecutar GeoX y obtener AnalysisResult.
analysis_result = geox.analyze(
    data=analysis_df,
    analysis_config=analysis_config,
    data_quality_check_config=quality_check_config,
)

# 2) Preparar InputData con el API real de Meridian MMM.
input_data = (
    data_frame_input_data_builder.DataFrameInputDataBuilder(
        kpi_type='non_revenue',
        default_kpi_column='bookings',
        default_revenue_per_kpi_column='revenue_per_booking',
    )
    .with_kpi(mmm_df)
    .with_revenue_per_kpi(mmm_df)
    .with_population(mmm_df)
    .with_controls(mmm_df, control_cols=['season_control'])
    .with_media(
        mmm_df,
        media_cols=['google_ads_impression'],
        media_spend_cols=['google_ads_spend'],
        media_channels=['google_ads'],
    )
    .build()
)

# 3) Convertir AnalysisResult en CalibratedPriors.
# No documentado en las fuentes: firma exacta del constructor y argumentos.
calibrated_priors = (
    prior_builder.CalibrationBuilder(
        ...  # conectar con input_data, canal MMM, custom_prior/baseline_prior si aplica
    )
    .with_meridian_geox_experiment_result(
        ...  # pasar analysis_result y el canal equivalente del MMM
    )
    .build()
)

# 4) Inyectar los priors calibrados en PriorDistribution.
priors = prior_distribution.PriorDistribution(
    roi_m=calibrated_priors.priors.roi_m,
    roi_rf=calibrated_priors.priors.roi_rf,
)

# 5) Crear ModelSpec y ajustar Meridian.
model_spec = spec.ModelSpec(
    prior=priors,
    media_prior_type='roi',
    rf_prior_type='roi',
    max_lag=8,
    adstock_decay_spec='geometric',
)

mmm = model.Meridian(input_data=input_data, model_spec=model_spec)
mmm.sample_prior(500)
mmm.sample_posterior(
    n_chains=4,
    n_adapt=1000,
    n_burnin=1000,
    n_keep=1000,
    seed=0,
)
```

Para un experimento no GeoX, sustituir el registro de experimento por `with_incrementality_experiment_result(...)` introduciendo manualmente $\mu_{exp}$, $\sigma_{exp}$, spend y fechas. La firma exacta también queda como no documentada en las fuentes.

## 8. Notebooks de referencia

Los Colabs de referencia están en `google/meridian:demo/`:

- `Meridian_Prior_Calibration_TF.ipynb`
- `Meridian_Prior_Calibration_JAX.ipynb`

## 9. Buenas prácticas y limitaciones

| Tema | Recomendación |
|---|---|
| Quality checks | No calibrar con experimentos que no pasen los quality checks de diseño/análisis GeoX. |
| Número de experimentos | Combinar varios experimentos independientes cuando midan el mismo canal/constructo; si sólo hay uno, documentar la dependencia del prior respecto a ese test. |
| Coherencia de canal | El canal experimental debe mapear de forma explícita al canal MMM. Si el test es de campaña y el MMM modela canal completo, el ajuste de spend penaliza la diferencia de granularidad. |
| KPI no revenue | No convertir manualmente si el modelo aporta `revenue_per_kpi`; Meridian lo hace automáticamente. |
| Priors custom | Aportar `custom_prior` para canales no calibrados cuando exista evidencia de negocio; si no, se usará el default sólo como fallback. |
| Fuente oficial | La página `/meridian/geox/intro-to-incrementality-based-calibration` está publicada vacía. La fuente válida para esta calibración es `/meridian/docs/advanced-modeling/set-custom-priors-past-experiments`. |

La calibración no sustituye la revisión del experimento: si hay problemas de aleatorización, contaminación entre geos, periodos atípicos, outages o baja potencia, el resultado no debe convertirse en prior informativo del MMM.
