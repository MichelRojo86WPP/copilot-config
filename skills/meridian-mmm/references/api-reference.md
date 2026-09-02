# Meridian — Referencia de API Python (Instalación, Arquitectura, Clases)

> Parte de la skill meridian-mmm. Cargar este archivo al construir InputData/ModelSpec/PriorDistribution,
> usar Analyzer/BudgetOptimizer, o consultar mensajes proto. Fuente: investigación directa del repo
> google/meridian (README, CHANGELOG, código fuente) + documentación oficial. Versión de referencia: Meridian 1.8.0 (agosto 2026).

---

## PARTE I — REPO, INSTALACIÓN Y ARQUITECTURA

---

### 1. Repositorio GitHub y Requisitos

**Fuente:** `https://raw.githubusercontent.com/google/meridian/main/README.md`

#### 1.1 Instalación

```bash
# Instalación base
pip install google-meridian

# Con backend JAX (alternativa a TensorFlow)
pip install google-meridian[jax]

# Con soporte GPU en Linux
pip install google-meridian[and-cuda]

# Con MLflow
pip install google-meridian[mlflow]

# Con Scenario Planner y Full Funnel
pip install google-meridian[scenarioplanner,schema]
```

#### 1.2 Requisitos del sistema

| Componente | Requisito |
|---|---|
| Python | 3.11 – 3.13 (3.10 eliminado en v1.5.3) |
| TensorFlow | `>=2.21,<2.22` |
| TFP (nightly) | `tfp-nightly==0.26.0.dev20260130` ⚠️ versión nightly, no estable |
| NumPy | `>=2.0.2,<2.4.0` |
| GPU (recomendada) | T4 mínimo, 16 GB RAM de GPU |
| JAX (alternativa) | `jax>=0.4.35,<0.6` |

> ⚠️ **Aviso crítico:** TFP usa una versión **nightly** específica, no la versión estable de TensorFlow Probability. Usar la versión estable causará errores en tiempo de ejecución.

> ⚠️ **GPU prácticamente obligatoria:** MCMC en CPU puede tomar horas. GPU T4 es el mínimo viable. Para datasets grandes (muchas geos × semanas), se recomienda A100/V100.

#### 1.3 Versión actual y licencia
- **Versión actual:** 1.8.0 (lanzada el 14 de agosto de 2026)
- **Licencia:** Apache 2.0
- **Repositorio:** `https://github.com/google/meridian`

---

### 2. Arquitectura del Paquete

**Fuente:** GitHub API — estructura de `meridian/`

```
meridian/
├── data/           # Carga y validación de datos
│   ├── test_data.py        # Datos de prueba sintéticos
│   └── test_utils.py       # Utilidades para tests
├── model/          # Núcleo del modelo bayesiano
│   ├── model.py            # Clase principal Meridian
│   ├── spec.py             # ModelSpec
│   ├── prior_distribution.py  # PriorDistribution
│   ├── transformations.py  # HillAdstock, normalización
│   └── knots.py            # AKS y selección de nudos
├── analysis/       # Análisis post-modelado
│   ├── analyzer.py         # Analyzer (ROI, mROI, curvas)
│   ├── optimizer.py        # BudgetOptimizer
│   ├── summarizer.py       # Summarizer (exportar resultados)
│   └── visualizer.py       # ModelDiagnostics, gráficos
└── data_formatter/ # Conversión desde plataformas externas
```

---

### 3. Historial de Versiones y Cambios Clave

**Fuente:** `https://raw.githubusercontent.com/google/meridian/main/CHANGELOG.md`

| Versión | Fecha | Cambios relevantes |
|---|---|---|
| HEAD (sin lanzar) | — | ⚠️ `Meridian.populate_cached_properties()` **eliminado** → usar `ModelContext.populate_cached_properties()` |
| **1.8.0** | 2026-08-14 | Mejoras de estabilidad; versión actual estable |
| 1.5.3 | 2025-Q4 | Python 3.10 **eliminado**; mínimo Python 3.11 |
| 1.5.0 | 2025-Q3 | Refactor arquitectural: introduce `ModelContext` (con estado) y `ModelEquations` (sin estado) |
| 1.2.0 | 2025-Q1 | AKS (Automatic Knot Selection); priors por canal vía `IndependentMultivariateDistribution` |
| 1.0.6 | 2024 | Primera versión pública |

---

## PARTE II — API DE PYTHON

---

### 4. Clases Principales

| Clase | Módulo | Propósito |
|---|---|---|
| `InputData` | `meridian.data` | Contenedor de todos los datos de entrada (KPI, media, controles, población) |
| `ModelSpec` | `meridian.model.spec` | Configuración del modelo (nudos, lags, priors, tipo de distribución) |
| `PriorDistribution` | `meridian.model.prior_distribution` | Distribuciones a priori para todos los parámetros del modelo |
| `Meridian` | `meridian.model.model` | Clase principal: carga datos, especificación y ejecuta MCMC |
| `Analyzer` | `meridian.analysis.analyzer` | Cálculo de ROI, mROI, resultado incremental, curvas de respuesta |
| `BudgetOptimizer` | `meridian.analysis.optimizer` | Optimización de presupuesto (fijo, flexible con ROI/mROI objetivo) |
| `Summarizer` | `meridian.analysis.summarizer` | Exporta resultados a DataFrames/HTML para reporting |
| `ModelDiagnostics` | `meridian.analysis.visualizer` | Gráficos diagnósticos: prior vs. posterior, Adstock, Hill |

---

### 5. `InputData` — Parámetros Detallados

**Fuente:** `https://developers.google.com/meridian/docs/advanced-modeling/input-data?hl=es-419`

`InputData` es el objeto que contiene todos los tensores de datos. Se construye preferentemente con el método estático `InputData.build()`.

#### 5.1 Parámetros principales de `InputData.build()`

| Parámetro | Tipo | Descripción |
|---|---|---|
| `kpi` | `array [G×T]` | KPI objetivo (ventas, ingresos, leads). Debe ser no negativo |
| `kpi_type` | `str` | `'revenue'` o `'non_revenue'`. Afecta priors por defecto |
| `revenue_per_kpi` | `array [G×T]` o `float` | Conversión KPI → ingresos (si KPI no es monetario) |
| `media` | `array [G×T×M]` | Unidades de medios pagados (impresiones, GRPs…) por geo, tiempo y canal |
| `media_spend` | `array [G×T×M]` | Gasto en medios pagados. Obligatorio para calcular ROI |
| `media_time_coords` | `list[str]` | Etiquetas de tiempo para las columnas de media (puede ser mayor que `kpi` — permite ventana previa para Adstock) |
| `organic_media` | `array [G×T×OM]` | Medios orgánicos (sin coste monetario) |
| `non_media_treatments` | `array [G×T×N]` | Variables de tratamiento no mediáticas (precio, distribución) |
| `controls` | `array [G×T×C]` | Variables de control (temperatura, tendencia, estacionalidad…) |
| `population` | `array [G]` | Población por geografía. Usada para normalización |
| `geo_coords` | `list[str]` | Nombres de geografías |
| `time_coords` | `list[str]` | Etiquetas de periodos del KPI |
| `media_names` | `list[str]` | Nombres de canales de medios |
| `control_names` | `list[str]` | Nombres de variables de control |
| `reach` | `array [G×T×RF]` | Alcance para canales R&F |
| `frequency` | `array [G×T×RF]` | Frecuencia para canales R&F |
| `rf_spend` | `array [G×T×RF]` | Gasto para canales R&F |

#### 5.2 Transformaciones automáticas internas

Las siguientes transformaciones se aplican **automáticamente** antes del modelado:

| Variable | Transformación |
|---|---|
| KPI | `kpi / population` → centrar (media=0) → escalar (std=1) |
| Media (impresiones) | `media / population` → escalar por mediana de valores no-cero por canal |
| Controles | Opcionalmente `control / population` si se especifica `control_population_scaling_id` → centrar y escalar a media=0, std=1 |
| GQV | Debe escalar por población manualmente antes de pasar a `controls` |

> ⚠️ **Importante:** La escala de las métricas de medios (impresiones vs. GRPs vs. clics) **no afecta** el ajuste del modelo, gracias a las transformaciones internas. Solo afecta la interpretación del parámetro `ec` (half-saturation point).

---

### 6. `ModelSpec` — Parámetros Detallados

**Fuente:** `https://developers.google.com/meridian/docs/advanced-modeling/model-spec?hl=es-419`

#### 6.1 Parámetros principales de `ModelSpec`

| Parámetro | Tipo | Default | Descripción |
|---|---|---|---|
| `prior` | `PriorDistribution` | Ver §7 | Distribuciones a priori |
| `media_prior_type` | `str` | `'roi'` | Tipo de prior para medios pagados: `'roi'`, `'mroi'`, `'contribution'`, `'coefficient'` |
| `rf_prior_type` | `str` | `'roi'` | Tipo de prior para canales R&F |
| `organic_media_prior_type` | `str` | `'contribution'` | Prior para medios orgánicos |
| `non_media_treatments_prior_type` | `str` | `'contribution'` | Prior para variables no-mediáticas |
| `knots` | `int` o `list[int]` | `n_times` (geo) / `1` (nacional) | Número o posiciones de nudos temporales |
| `enable_aks` | `bool` | `False` | Activa Automatic Knot Selection |
| `max_lag` | `int` | `8` | Número máximo de retardos para Adstock |
| `hill_before_adstock` | `bool` | `False` | `False` = Hill(Adstock(x)) [por defecto]; `True` = Adstock(Hill(x)) |
| `media_effects_dist` | `str` | `'log_normal'` | Distribución de efectos aleatorios geográficos: `'log_normal'` o `'normal'` |
| `unique_sigma_for_each_geo` | `bool` | `True` | Si cada geografía tiene su propio sigma de error |
| `holdout_id` | `array [G×T] bool` | `None` | Máscara de observaciones excluidas de la verosimilitud |
| `adstock_decay_spec` | `str` | `'geometric'` | Función de decaimiento: `'geometric'` o `'binomial'` |
| `control_population_scaling_id` | `list[bool]` | `None` | Qué variables de control escalar por población |

#### 6.2 Ejemplo completo de construcción

```python
from meridian.model import spec, prior_distribution
import tensorflow_probability as tfp

prior = prior_distribution.PriorDistribution(
    roi_m=prior_distribution.PriorDistribution.lognormal_dist_from_mean_std(
        mean=[1.7, 2.5, 1.2],
        std=[0.3, 0.5, 0.4]
    )
)

model_spec = spec.ModelSpec(
    prior=prior,
    media_prior_type='roi',
    knots=52,           # 52 nudos para datos semanales de 2 años
    max_lag=8,
    adstock_decay_spec='geometric',
    media_effects_dist='log_normal',
    hill_before_adstock=False
)
```

---

### 7. `PriorDistribution` — Parámetros Detallados

**Fuentes:** `https://developers.google.com/meridian/docs/advanced-modeling/default-prior-distributions?hl=es-419` y `https://developers.google.com/meridian/docs/advanced-modeling/intro-priors?hl=es-419`

#### 7.1 Distribuciones a priori por parámetro

| Parámetro | Prior por defecto | Media prior | Interpretación |
|---|---|---|---|
| `roi_m` / `roi_rf` | `LogNormal(0.2, 0.9)` | 1.83 | ROI por canal (ingresos / gasto) |
| `mroi_m` / `mroi_rf` | `LogNormal(0.0, 0.5)` | 1.13 | ROI marginal (retorno por $ adicional) |
| `contribution_m/rf/om/orf` | `Beta(1.0, 99.0)` | 1% | Fracción del resultado total atribuible al canal |
| `contribution_n` | `TruncatedNormal(0.0, 0.1, -1.0, 1.0)` | 0% | Contribución de tratamientos no-mediáticos (puede ser negativa) |
| `beta_m/rf/om/orf` | `HalfNormal(5)` | — | Coeficiente de regresión (paramétrico, difícil de interpretar) |
| `eta_m/rf/om/orf` | `HalfNormal(1)` | — | Varianza jerárquica geográfica de efectos de medios |
| `alpha_m/rf/om/orf` | `Uniform(0, 1)` | 0.5 | Tasa de decaimiento Adstock (0=sin retardo, 1=retardo máximo) |
| `ec_m` / `ec_om` | `TruncatedNormal(0.8, 0.8, 0.1, 10)` | ≈0.8 | Punto de media-saturación (múltiplo de mediana de impresiones) |
| `ec_rf` / `ec_orf` | `TruncatedNormal(0.8, 0.8, 0.1, 10)` | ≈0.8 | Igual para canales R&F (aplicado a frecuencia) |
| `slope_m/rf/om/orf` | `TruncatedNormal(1.0, 1.0, 0.1, 10)` | ≈1.0 | Pendiente de Hill (slope<1 → cóncava; slope>1 → S-curve) |
| `knot_values` | `Normal(0, 5)` | 0 | Valores de nudos temporales (interceptos de tendencia) |
| `tau_g_excl_baseline` | `Normal(0, 5)` | 0 | Efecto geográfico diferencial respecto a baseline |
| `gamma_c` / `gamma_n` | `Normal(0, 5)` | 0 | Coeficiente promedio jerárquico de controles / tratamientos no-media |
| `xi_c` / `xi_n` | `HalfNormal(5)` | — | Varianza jerárquica geográfica de controles |
| `sigma` | Derivado del modelo | — | Ruido del modelo (desviación estándar del error) |

#### 7.2 Funciones helper para construir priors

```python
from meridian.model import prior_distribution

# A partir de media y desviación estándar (crea LogNormal internamente)
roi_prior = prior_distribution.PriorDistribution.lognormal_dist_from_mean_std(
    mean=[1.5, 2.0],
    std=[0.5, 0.7]
)

# A partir de intervalo de confianza
roi_prior = prior_distribution.PriorDistribution.lognormal_dist_from_ci(
    low=[0.5, 0.8],
    high=[4.0, 5.0],
    mass_percent=0.80  # 80% de la masa dentro del rango [low, high]
)

# Prior completo con parámetros específicos
prior = prior_distribution.PriorDistribution(
    roi_m=roi_prior,
    alpha_m=tfp.distributions.Beta(2.0, 5.0),  # decaimiento con tendencia hacia 0
    ec_m=tfp.distributions.TruncatedNormal(1.5, 0.5, 0.1, 10.0)
)
```

#### 7.3 Priors por canal (independientes)

Desde v1.2.0, se pueden especificar distribuciones distintas por canal:

```python
import tensorflow_probability as tfp
from meridian.model import prior_distribution

# Canal 0: LogNormal(mean=2.0), Canal 1: LogNormal(mean=1.5), Canal 2: LogNormal(mean=3.0)
roi_m = prior_distribution.PriorDistribution.lognormal_dist_from_mean_std(
    mean=[2.0, 1.5, 3.0],
    std=[0.5, 0.3, 0.8]
)

prior = prior_distribution.PriorDistribution(roi_m=roi_m)
```

---

### 8. `Analyzer` — Métodos Clave

**Fuente:** `https://developers.google.com/meridian/docs/post-modeling/roi-mroi-response-curves?hl=es-419`

```python
from meridian.analysis import analyzer
a = analyzer.Analyzer(mmm)
```

| Método | Descripción | Parámetros clave |
|---|---|---|
| `a.roi()` | ROI por canal (resultado incremental / gasto) | `selected_times`, `selected_geos`, `use_posterior=True` |
| `a.mroi()` | ROI marginal por canal | igual que `roi()` |
| `a.incremental_outcome()` | Resultado incremental por canal | `media_selected_times`, `selected_times`, `new_data` |
| `a.response_curves()` | Curvas de respuesta (gasto vs. resultado) | `by_reach=False`, `new_data` |
| `a.negative_baseline_probability()` | Probabilidad de baseline negativa | — |
| `a.expected_outcome()` | Resultado esperado (con o sin medios) | `use_posterior=True` |
| `a.baseline_outcome()` | Resultado baseline (sin ningún tratamiento) | — |
| `a.summary_metrics()` | DataFrame con todas las métricas por canal | — |
| `a.r_squared()` | R² del ajuste del modelo | `by_geo=False` |

#### 8.1 Definición formal de ROI y mROI

- **ROI** = `IncrementalOutcome_m / Cost_m` (histórico, promedio de toda la ventana)
- **mROI** = Retorno por el próximo $ adicional ≈ `ΔIncrementalOutcome / ΔCost` (derivada de la curva de respuesta en el nivel actual de gasto)
- **Nota:** mROI ≤ ROI casi siempre (por saturación). `mROI < 1` → canal sobreinvertido. `mROI > 1` → canal subinvertido.

---

### 9. `BudgetOptimizer` — Métodos Clave

**Fuentes:** `https://developers.google.com/meridian/docs/post-modeling/optimization-without-reach-frequency?hl=es-419`, `https://developers.google.com/meridian/docs/post-modeling/optimization-with-reach-frequency?hl=es-419`

```python
from meridian.analysis import optimizer
opt = optimizer.BudgetOptimizer(mmm)
```

#### 9.1 Escenarios de optimización disponibles

| Escenario | Descripción | Parámetro clave |
|---|---|---|
| **Presupuesto fijo** | Redistribuye un total dado entre canales para maximizar ROI global | `budget=<total>` |
| **Presupuesto flexible + ROI objetivo** | Maximiza ingresos incrementales manteniendo `ROI ≥ roi_target` | `roi_target=<valor>` |
| **Presupuesto flexible + mROI mínimo** | Maximiza hasta que `mROI_i ≥ mroi_min` por canal | `mroi_min=<valor>` |

#### 9.2 Restricciones de inversión por canal

```python
results = opt.optimize(
    budget=1_000_000,
    pct_of_spend={
        'tv': (0.5, 2.0),      # ±50% del gasto histórico de TV
        'digital': (0.3, 3.0)  # entre 30% y 300% del histórico digital
    }
)
```

La fórmula es: `b_i' × LB_i ≤ b_i ≤ b_i' × UB_i`, donde `b_i'` es el gasto histórico.

#### 9.3 Optimización con R&F

Para canales con datos de Reach & Frequency, se puede optimizar también la **frecuencia óptima**:

```python
# La frecuencia óptima no depende de la asignación de presupuesto
# (b_i y c_i se cancelan en la función objetivo)
results_rf = opt.optimize(
    budget=1_000_000,
    use_optimal_frequency=True  # calcula frecuencia óptima antes de optimizar presupuesto
)
```

---

### 10. Referencia Proto (Mensajes Protobuf)

**Fuente:** `https://developers.google.com/meridian/reference/api/proto`

Los mensajes protobuf definen la estructura de datos serializable de Meridian. Los más relevantes:

| Mensaje Proto | Uso |
|---|---|
| `PriorDistributions` | Contiene todos los campos de distribuciones a priori (roi_m, alpha_m, ec_m, slope_m…) |
| `ModelSpec` (proto) | Configuración serializada del modelo |
| `InputData` (proto) | Datos de entrada serializados para almacenamiento/reproducción |

> **Nota:** La referencia completa de API Python en `https://developers.google.com/meridian/reference/api/meridian` devolvía solo el footer de la licencia al momento de la investigación — no contenido. La información de los parámetros se extrajo del código fuente en GitHub y de la documentación de guías en `/docs/`.

---

