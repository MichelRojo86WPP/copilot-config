# Meridian — Guías Conceptuales Oficiales (Pre/Advanced/Post-modeling)

> Parte de la skill meridian-mmm. Cargar este archivo para entender conceptos: preparación de datos,
> especificación matemática, nudos/adstock/priors, national vs. geo, health checks y puntuación de salud,
> interpretación de resultados, optimización de presupuesto, planificación de escenarios, depuración y
> actualización periódica del modelo. Fuente: developers.google.com/meridian/docs/ (todas las secciones).

---

## PARTE IV — GUÍAS CONCEPTUALES OFICIALES (ANEXO)

---

### 17. Introducción y Conceptos Básicos

**Fuente:** `https://developers.google.com/meridian/docs/basics/meridian-introduction?hl=es-419`

#### 17.1 ¿Qué es Meridian?

Meridian es una librería de código abierto de Google para **Marketing Mix Modeling (MMM)** basada en **inferencia bayesiana** con muestreo MCMC (Monte Carlo basado en Cadenas de Markov). Permite:

- Cuantificar el efecto causal de cada canal de medios sobre el KPI de negocio
- Calcular ROI histórico y ROI marginal por canal
- Optimizar la asignación de presupuesto para maximizar el retorno
- Incorporar conocimiento previo (experimentos, benchmarks) a través de distribuciones a priori

#### 17.2 Diferencias con enfoques frecuentistas

| Enfoque | Frequentista (OLS) | Bayesiano (Meridian) |
|---|---|---|
| Incertidumbre | Intervalos de confianza | Intervalos creíbles (distribuciones a posteriori) |
| Conocimiento previo | No incorporable | Distribuciones a priori explícitas |
| Muestras pequeñas | Problemático | Regularización natural via priors |
| Multicolinealidad | Colapsa estimaciones | Priors evitan colapso (con precaución) |
| Tiempo de cómputo | Segundos | Minutos/horas (requiere GPU) |

#### 17.3 Glosario de términos clave

| Término | Definición |
|---|---|
| KPI | Indicador clave de rendimiento (ventas, ingresos, conversiones) |
| Resultado incremental | KPI adicional atribuible exclusivamente a los medios |
| Baseline | KPI esperado si todos los tratamientos fueran cero |
| Geo | Unidad geográfica de análisis (país, región, DMA…) |
| Periodo | Unidad temporal (semana, día, mes) |
| Prior | Distribución de probabilidad sobre un parámetro antes de ver los datos |
| Posterior | Distribución actualizada tras ver los datos |
| R-hat | Estadístico de convergencia de MCMC (debe ser < 1.1 ideal, < 1.2 mínimo) |
| PPP | Predictive Posterior P-value (bondad de ajuste bayesiana) |

---

### 18. Pre-modelado

**Fuentes:** `https://developers.google.com/meridian/docs/pre-modeling/`

#### 18.1 Recolección de datos

**Fuente:** `https://developers.google.com/meridian/docs/pre-modeling/collect-data?hl=es-419`

**Datos necesarios:**

| Tipo | Descripción | Formato sugerido |
|---|---|---|
| KPI | Variable objetivo (ventas, ingresos, leads) | Semanal por geografía |
| Inversión en medios | Gasto por canal, geo y periodo | € o $ |
| Métricas de medios | Impresiones, GRPs, clics, alcance | Según canal |
| Variables de control | Factores externos (temporada, competencia, precios) | Misma granularidad |
| Población | Número de habitantes por geografía | Constante o anual |

**Granularidad temporal recomendada:** Semanal es el estándar. Diario es posible pero aumenta drásticamente el número de parámetros. Mensual pierde resolución para Adstock.

#### 18.2 Cantidad de datos necesaria

**Fuente:** `https://developers.google.com/meridian/docs/pre-modeling/amount-data-needed?hl=es-419`

| Escenario | Datos mínimos por parámetro | Regla práctica |
|---|---|---|
| Nacional (sin pooling) | ~15 datos/parámetro | Con 50 periodos: máximo ~3 canales |
| Geo "estricto" (sin pooling) | ≥8 datos/parámetro | Conservador |
| Geo "flexible" (pooling total) | ≥74 datos/parámetro | Teórico |
| Geo (guía práctica EDA) | Usa cálculo flexible como referencia | El modelo hace pooling parcial |

**Cómo calcular datos disponibles vs. parámetros:**

```
# Para modelo geográfico:
datos_efectivos = n_geos × n_times
parámetros_por_canal = ~4 (alpha, ec, slope + beta)
parámetros_globales = n_knots + n_controls × 2 + n_geos

# Regla simplificada:
ratio = datos_efectivos / parámetros_totales
# Debe ser >> 8 (estricto) o >> 74 (flexible)
```

#### 18.3 Selección de geos para modelo nacional vs. geográfico

**Fuente:** `https://developers.google.com/meridian/docs/pre-modeling/geo-selection-national-data?hl=es-419`

| Modelo | Cuándo usar | Limitaciones |
|---|---|---|
| **Nacional** (1 geo) | Datos no disponibles por geo; presupuesto único nacional | Menos identificable (más dependiente de priors) |
| **Geográfico** (multi-geo) | Datos por región/DMA disponibles; variación geográfica en medios | Requiere más datos; mayor complejidad |

**Ventaja del modelo geográfico:** La variación en la ejecución de medios *entre geos* en el mismo periodo temporal actúa como un experimento natural, mejorando la identificabilidad del efecto causal.

#### 18.4 Análisis Exploratorio de Datos (EDA)

**Fuente:** `https://developers.google.com/meridian/docs/pre-modeling/perform-eda?hl=es-419`

Meridian ejecuta automáticamente checks de EDA al inicializar el objeto `Meridian` (o al llamar a `sample_posterior`):

| Check | Umbral de error | Umbral de advertencia |
|---|---|---|
| Correlación pairwise | ERROR si `|corr| > 0.999` | — |
| VIF (multicolinealidad) | ERROR si `VIF > 1,000` | — |
| Std del KPI | ERROR si `std < 1e-4` (KPI constante) | — |
| Variación temporal/geo | ERROR si variable completamente constante | — |

```python
# EDA manual antes del modelado
from meridian.data import eda

eda_report = eda.EDAReport(input_data)
eda_report.check_correlations()      # correlaciones pairwise
eda_report.check_vif()               # Factor de Inflación de la Varianza
eda_report.check_kpi_variance()      # varianza del KPI
eda_report.plot_media_vs_kpi()       # scatterplots media vs KPI
```

#### 18.5 Plataforma MMM de Google

**Fuente:** `https://developers.google.com/meridian/docs/pre-modeling/using-mmm-data-platform?hl=es-419`

Google ofrece una plataforma de preparación de datos para Meridian que estandariza el formato de entrada. El esquema incluye:

- Tablas de hechos de medios con dimensiones: `date`, `geo`, `channel`, `impressions`, `spend`
- Tablas de KPI con dimensiones: `date`, `geo`, `kpi_value`
- Tablas de controles con dimensiones: `date`, `geo`, `control_name`, `control_value`

---

### 19. Especificación Matemática del Modelo

**Fuente:** `https://developers.google.com/meridian/docs/advanced-modeling/model-spec?hl=es-419`

#### 19.1 Ecuación completa del modelo

$$y_{g,t} = \underbrace{\mu_t + \tau_g}_{\text{baseline}} + \underbrace{\sum_{i=1}^{N_C} \gamma_{g,i}^{[C]} z_{g,t,i}}_{\text{controles}} + \underbrace{\sum_{i=1}^{N_M} \beta_{g,i}^{[M]} \text{HillAdstock}(x_{g,t,i}^{[M]})}_{\text{medios pagados}} + \underbrace{\sum_{i=1}^{N_{OM}} \beta_{g,i}^{[OM]} \text{HillAdstock}(x_{g,t,i}^{[OM]})}_{\text{medios orgánicos}} + \underbrace{\sum_{i=1}^{N_{RF}} \beta_{g,i}^{[RF]} \text{Adstock}(r_{g,t,i} \cdot \text{Hill}(f_{g,t,i}))}_{\text{canales R\&F}} + \underbrace{\sum_{i=1}^{N_N} \gamma_{g,i}^{[N]} n_{g,t,i}}_{\text{tratamientos no-media}} + \varepsilon_{g,t}$$

Donde:
- $g$ = geografía, $t$ = periodo de tiempo
- $\mu_t$ = efecto temporal (tendencia/estacionalidad) mediante nudos
- $\tau_g$ = efecto geográfico diferencial
- $\gamma_{g,i}^{[C]}$ = coeficiente geográfico del control $i$ (modelo jerárquico)
- $\beta_{g,i}^{[M]}$ = coeficiente geográfico del canal de medios $i$ (modelo jerárquico)
- $\varepsilon_{g,t} \sim N(0, \sigma_g)$

#### 19.2 Función HillAdstock

El orden por defecto es `hill_before_adstock=False`, lo que significa:

$$\text{HillAdstock}(x; \alpha, ec, \text{slope}) = \text{Hill}(\text{Adstock}(x; \alpha); ec, \text{slope})$$

**Adstock primero → Hill después** (recomendado en la mayoría de casos)

#### 19.3 Función Hill (Saturación)

$$\text{Hill}(x; ec, \text{slope}) = \frac{1}{1 + (x/ec)^{-\text{slope}}}$$

- `ec` = punto de media-saturación (cuando `x = ec`, el efecto es 0.5)
- `slope < 1` → curva cóncava (retornos decrecientes inmediatos)
- `slope > 1` → curva en S (efecto umbral antes de saturación)
- `slope = 1` → función sigmoide estándar

#### 19.4 Función Adstock (Decaimiento)

Normalización: el efecto es la media ponderada sobre `max_lag` retardos:

$$\text{Adstock}(x_{g,t}; \alpha) = \frac{\sum_{s=0}^{L} w(s; \alpha) \cdot x_{g,t-s}}{\sum_{s=0}^{L} w(s; \alpha)}$$

**Decaimiento geométrico** (`adstock_decay_spec='geometric'`):
$$w(s; \alpha) = \alpha^s$$

- `α = 0` → sin efecto de lag (solo impacto inmediato)
- `α = 1` → todos los lags tienen el mismo peso
- Rango `max_lag` recomendado: 2–10 semanas

**Decaimiento binomial** (`adstock_decay_spec='binomial'`):
- Pesos inspirados en la distribución binomial
- Permite capturar efectos que **aumentan** antes de decaer (hump-shaped)
- Rango `max_lag` recomendado: 4–20 semanas

#### 19.5 Nudos temporales (Baseline `μ_t`)

$$\mu_t = W_t \cdot b$$

Donde $b$ es un vector de K valores de nudos (K ≤ T parámetros) y $W_t$ es la matriz de pesos determinista calculada por interpolación lineal basada en distancia L1 a los dos nudos adyacentes.

- **Default geo:** `knots = n_times` (un nudo por periodo, máxima flexibilidad)
- **Default nacional:** `knots = 1` (un solo intercepto, necesario para identificabilidad)

---

### 20. Variables de Control y Tratamiento

**Fuentes:** `https://developers.google.com/meridian/docs/advanced-modeling/control-variables?hl=es-419`, `https://developers.google.com/meridian/docs/advanced-modeling/organic-and-non-media-variables?hl=es-419`

#### 20.1 Tabla comparativa de tipos de variables

| Tipo | Coste monetario | Adstock/Hill | Intervenible | ROI | Contribución |
|---|---|---|---|---|---|
| `media` (medios pagados) | ✅ | ✅ | ✅ | ✅ | ✅ |
| `organic_media` | ❌ | ✅ | ✅ | ❌ | ✅ |
| `non_media_treatments` | ❌ | ❌ | ✅ | ❌ | ✅ |
| `controls` | ❌ | ❌ | ❌ | ❌ | ❌ |

#### 20.2 Criterios para seleccionar variables de control

Una variable debe ser incluida como **control** si cumple:
1. **Afecta causalmente al KPI** (es causa del KPI, no consecuencia)
2. **Es exógena** (no es causada por los medios)
3. **Varía en el tiempo o entre geos** (si es constante, es colineal con el intercepto)

Ejemplos de controles típicos:
- Temperatura, precipitación (retail, turismo)
- Festividades, eventos especiales
- Índices económicos (IPC, desempleo)
- Actividad de la competencia (si disponible)
- Precio propio del producto

#### 20.3 Variables de control con retardo (Lagged Controls)

Las variables de control **no** se procesan con Adstock/Hill, pero pueden incluirse con retardos manuales:

```python
import numpy as np

# Crear versión retardada del control (ej: precio con lag de 2 semanas)
controls_lagged = np.roll(controls_array, shift=2, axis=1)
controls_lagged[:, :2] = 0  # rellenar los primeros periodos con 0

# Incluir en InputData junto con el control original
controls_combined = np.concatenate([controls_array, controls_lagged], axis=-1)
```

#### 20.4 Escala poblacional de controles

Por defecto, los controles **NO** se escalan por población. Para controles a nivel nacional (que no varían entre geos como el índice de precios), es importante habilitarlo:

```python
model_spec = spec.ModelSpec(
    control_population_scaling_id=[True, False, True],  # escala controles 0 y 2
    # ...
)
```

#### 20.5 GQV (Google Query Volume) como variable de confusión

**Fuente:** `https://developers.google.com/meridian/docs/advanced-modeling/paid-search-modeling?hl=es-419`

Para canales de búsqueda pagada (SEM):

```
Confounders: [GQV_branded, GQV_generic]
          ↓         ↓
    SEM_branded → KPI ← SEM_generic
```

El GQV es un **confounding variable** (causa tanto las búsquedas de pago como el KPI directamente). **No incluirlo produce sobreestimación del ROI de SEM**.

Recomendaciones:
- Incluir GQV como **control** (no como media)
- Escalar GQV por población
- Usar GQV_branded y GQV_generic por separado si se modelan búsquedas branded/generic

```python
# GQV en controles, con scaling de población
controls = np.stack([gqv_branded, gqv_generic, other_controls], axis=-1)
control_population_scaling_id = [True, True, False]  # escala GQV por población
```

---

### 21. Parámetros Temporales — Nudos (Knots)

**Fuentes:** `https://developers.google.com/meridian/docs/advanced-modeling/setting-knots?hl=es-419`, `https://developers.google.com/meridian/docs/advanced-modeling/set-max-lag-parameter?hl=es-419`, `https://developers.google.com/meridian/docs/advanced-modeling/set-adstock-decay-spec-parameter?hl=es-419`

#### 21.1 Configuraciones de nudos

```python
from meridian.model import spec

# 1. Número fijo de nudos (distribuidos uniformemente)
model_spec = spec.ModelSpec(knots=26)  # un nudo cada ~2 semanas en datos de 52 semanas

# 2. Posiciones específicas
model_spec = spec.ModelSpec(knots=[0, 13, 26, 39, 52])  # trimestral

# 3. AKS (Automatic Knot Selection) - recomendado
model_spec = spec.ModelSpec(enable_aks=True)

# 4. Hybrid: AKS con nudos obligatorios (útil para refresh del modelo)
from meridian.model import knots as knots_module
aks_result = knots_module.AKS(input_data).automatic_knot_selection(
    required_knots=[0, 52],       # nudos obligatorios (inicio y punto fijo)
    excluded_knots=[30, 31],      # nudos excluidos explícitamente
    restrict_to_right_of_required_knots=True  # el AKS solo selecciona a la derecha del último required
)
model_spec = spec.ModelSpec(knots=aks_result)
```

#### 21.2 Cuándo usar `knots < n_times`

**El caso más importante:** Si una variable de control varía *solo* en el tiempo (sin variación geográfica — es decir, es una variable "nacional") Y `knots = n_times`, el modelo tiene **multicolinealidad perfecta** entre esa variable y los nudos. En ese caso:

- **Opción A:** Reducir `knots < n_times` (ej: `knots=52` para datos de 2 años semanales)
- **Opción B:** Eliminar la variable de control nacional (si los nudos capturan bien la tendencia)

#### 21.3 AKS (Automatic Knot Selection)

El algoritmo AKS minimiza el **AIC** (Criterio de Información de Akaike) con una penalización ajustada por el número de geos:

```
Penalización AKS = 2 × K / n_geos  (en lugar del 2K estándar de AIC)
```

Esto compensa el hecho de que, con muchas geos, el modelo tiene muchos datos y podría sobre-seleccionar nudos.

**Selección Híbrida para refresh del modelo:** Al actualizar el modelo con datos nuevos, usar `restrict_to_right_of_required_knots=True` con el último nudo del modelo anterior como `required_knots` garantiza que los nuevos nudos no cambien la posición de los anteriores (consistencia temporal).

#### 21.4 Configuración de `max_lag`

**Fuente:** `https://developers.google.com/meridian/docs/advanced-modeling/set-max-lag-parameter?hl=es-419`

| Decaimiento | `max_lag` recomendado | Notas |
|---|---|---|
| Geométrico | 2–10 periodos | Para efectos que decaen rápidamente |
| Binomial | 4–20 periodos | Para efectos que tardan más en alcanzar el pico |

El valor de `max_lag` también afecta la **ventana previa de medios** necesaria: si `max_lag=8` y el KPI comienza en semana 0, los datos de medios deben empezar en semana -8.

#### 21.5 Geometric vs. Binomial Adstock

**Fuente:** `https://developers.google.com/meridian/docs/advanced-modeling/set-adstock-decay-spec-parameter?hl=es-419`

| Propiedad | Geométrico | Binomial |
|---|---|---|
| Forma del decaimiento | Monotónico decreciente desde t=0 | Puede aumentar antes de decrecer |
| Prior de `alpha` | `Uniform(0,1)` | `Uniform(0,1)` |
| `max_lag` recomendado | 2–10 | 4–20 |
| Uso típico | Medios digitales, display | TV, radio (donde el efecto tarda en activarse) |
| Interpretación de `alpha` | Alta `α` = larga vida del efecto | Igual |

---

### 22. Distribuciones a Priori

**Fuentes:** `https://developers.google.com/meridian/docs/advanced-modeling/intro-priors?hl=es-419`, `https://developers.google.com/meridian/docs/advanced-modeling/how-to-choose-treatment-prior-types?hl=es-419`, `https://developers.google.com/meridian/docs/advanced-modeling/roi-mroi-contribution-parameterizations?hl=es-419`, `https://developers.google.com/meridian/docs/advanced-modeling/default-prior-distributions?hl=es-419`

#### 22.1 Tipos de prior para canales de medios pagados

| Tipo | Parámetro en `PriorDistribution` | Especificado en `ModelSpec` via | Cuándo usar |
|---|---|---|---|
| **ROI** | `roi_m`, `roi_rf` | `media_prior_type='roi'` (default) | Tienes datos de experimentos de incrementalidad; es la opción más intuitiva |
| **mROI** | `mroi_m`, `mroi_rf` | `media_prior_type='mroi'` | Quieres regularizar cambios de presupuesto recomendados; los canales están cerca de saturación |
| **Contribución** | `contribution_m`, `contribution_rf` | `media_prior_type='contribution'` | No tienes datos de ingresos; el KPI no es monetario |
| **Coeficiente** | `beta_m`, `beta_rf` | `media_prior_type='coefficient'` | Objetivos estadísticos específicos; no recomendado en general |

#### 22.2 Tipos de prior para medios orgánicos y no-media

| Tipo de variable | Prior por defecto | Tipos disponibles |
|---|---|---|
| Medios orgánicos | Contribución | `'contribution'`, `'coefficient'` |
| Tratamientos no-media | Contribución | `'contribution'`, `'coefficient'` |

#### 22.3 Diagramas de decisión (flowchart)

**Para medios pagados, la lógica es:**
1. ¿Tienes datos de ingresos o `revenue_per_kpi`?
   - SÍ → Usar `roi_m` o `mroi_m`
   - NO → Usar `contribution_m` o `coefficient`
2. ¿Tienes experimentos de incrementalidad?
   - SÍ → Usar `roi_m` con la media calibrada en el resultado del experimento
3. ¿Quieres regularizar la optimización de presupuesto (cambios conservadores)?
   - SÍ → Usar `mroi_m` con media cercana a 1.0 y std pequeño

#### 22.4 Reparametrización matemática (ROI ↔ Beta)

La reparametrización del ROI convierte el modelo estándar en términos de `beta_m` (coeficiente de regresión) a términos de `roi_m` (métrica de negocio):

$$\text{ROI}_m \times \text{Cost}_m = \sum_{g,t} \beta_{g,m} \cdot M_{g,t,m}$$

donde:
$$M_{g,t,m} = u_{g,t}^{[Y]} p_g s \cdot \text{HillAdstock}(x_{g,t,m})$$

El parámetro `beta_m` se determina como función de `ROI_m` y los demás parámetros del modelo. La ventaja es que se puede especificar una distribución a priori directamente en la métrica de negocio conocida.

#### 22.5 Ejemplos completos de código para priors

```python
import tensorflow_probability as tfp
from meridian.model import spec, prior_distribution

# ====== EJEMPLO 1: Prior ROI con calibración de experimento ======
# Experimento sugiere ROI medio = 1.7 para canal 0, 2.5 para canal 1
prior = prior_distribution.PriorDistribution(
    roi_m=prior_distribution.PriorDistribution.lognormal_dist_from_mean_std(
        mean=[1.7, 2.5],
        std=[0.3, 0.5]  # std pequeño = prior más informativo
    )
)
model_spec = spec.ModelSpec(prior=prior, media_prior_type='roi')

# ====== EJEMPLO 2: Prior mROI para regularizar presupuesto ======
# Asume que ambos canales están cerca de saturación (mROI ≈ 1.0)
prior = prior_distribution.PriorDistribution(
    mroi_m=prior_distribution.PriorDistribution.lognormal_dist_from_mean_std(
        mean=[1.0, 1.0],
        std=[0.2, 0.2]  # std pequeño = cambios pequeños en presupuesto
    )
)
model_spec = spec.ModelSpec(prior=prior, media_prior_type='mroi')

# ====== EJEMPLO 3: Prior Contribución para KPI no monetario ======
# Canal 0 esperamos ~3% de contribución, canal 1 ~4%
prior = prior_distribution.PriorDistribution(
    contribution_m=tfp.distributions.Beta(
        concentration1=[3.0, 4.0],
        concentration0=[97.0, 96.0]  # Beta(3,97) tiene media=3%
    )
)
model_spec = spec.ModelSpec(prior=prior, media_prior_type='contribution')

# ====== EJEMPLO 4: Prior para canales orgánicos ======
prior = prior_distribution.PriorDistribution(
    contribution_om=tfp.distributions.Beta(
        concentration1=[3.0, 3.0],
        concentration0=[97.0, 97.0]
    )
)
model_spec = spec.ModelSpec(prior=prior, organic_media_prior_type='contribution')

# ====== EJEMPLO 5: Prior Adstock más informativo ======
prior = prior_distribution.PriorDistribution(
    alpha_m=tfp.distributions.Beta(2.0, 5.0)  # concentrado en valores bajos (~0.3)
)
```

---

### 23. Datos de Entrada y Transformaciones

**Fuentes:** `https://developers.google.com/meridian/docs/advanced-modeling/input-data?hl=es-419`, `https://developers.google.com/meridian/docs/advanced-modeling/holdout-observations?hl=es-419`

#### 23.1 Ventana previa de medios (Pre-modeling window)

Para modelar correctamente el efecto de Adstock en los primeros periodos del KPI, los datos de medios pueden incluir periodos **anteriores** al primer periodo del KPI:

```python
# Si KPI empieza en semana 0 y max_lag=8:
# media_time_coords puede incluir semanas [-8, -7, ..., -1, 0, 1, ..., T]
# time_coords del KPI: [0, 1, ..., T]

input_data = InputData.build(
    kpi=kpi_array,           # shape: [G, T]
    media=media_array,       # shape: [G, T+8, M] — 8 semanas extra al inicio
    media_time_coords=list(range(-8, T)),  # incluye ventana previa
    time_coords=list(range(0, T)),          # solo periodos del KPI
    # ...
)
```

#### 23.2 Observaciones holdout

Las observaciones holdout se excluyen de la **verosimilitud** durante el ajuste, pero los medios siguen siendo utilizados (afectan el Adstock de periodos futuros):

```python
import numpy as np

# Crear máscara holdout: últimas 4 semanas para todas las geos
holdout_id = np.zeros((n_geos, n_times), dtype=bool)
holdout_id[:, -4:] = True  # excluir últimas 4 semanas

model_spec = spec.ModelSpec(
    holdout_id=holdout_id,
    # ...
)
```

> ⚠️ **Advertencia:** No excluir bloques contiguos grandes al final del periodo. Los nudos necesitan datos cercanos para funcionar correctamente. Se recomienda usar holdout en periodos intercalados o en una proporción pequeña (<10%) de los datos.

---

### 24. Modelos Nacionales vs. Geográficos

**Fuente:** `https://developers.google.com/meridian/docs/advanced-modeling/national-models?hl=es-419`

#### 24.1 Diferencias automáticas en modelos nacionales

Cuando `n_geos = 1`, Meridian ajusta automáticamente:

| Parámetro | Modelo Geográfico | Modelo Nacional |
|---|---|---|
| `eta_m`, `eta_rf` | Estimado (varianza geo de medios) | Forzado a 0 |
| `xi_c`, `xi_n` | Estimado (varianza geo de controles) | Forzado a 0 |
| `tau_g` | Estimado para cada geo | Forzado a 0 (solo 1 geo) |
| `unique_sigma_for_each_geo` | Puede ser True | Forzado a False |
| `knots` default | `n_times` | `1` |

#### 24.2 Implicaciones para la identificabilidad

En el modelo nacional, con `knots=1` (un solo intercepto), el modelo es menos flexible pero más identificable. La recomendación es:

- Si hay **tendencia** o **estacionalidad** en el KPI → aumentar `knots` (ej: `knots=4` o `knots=12`)
- Si las variables de control capturan bien la tendencia → mantener `knots` bajo
- Nunca usar `knots = n_times` con variables de control a nivel nacional (multicolinealidad perfecta)

---

### 25. Post-modelado: Health Checks y Puntuación de Salud

**Fuentes:** `https://developers.google.com/meridian/docs/post-modeling/health-checks?hl=es-419`, `https://developers.google.com/meridian/docs/post-modeling/health-score?hl=es-419`

#### 25.1 Ejecutar health checks

```python
from meridian.analysis import visualizer

model_diagnostics = visualizer.ModelDiagnostics(mmm)
health_report = model_diagnostics.run_health_checks()
print(health_report)
```

#### 25.2 Los 6 componentes del Health Score (0–100)

| Componente | Peso | Condición PASS | Acción si FAIL/REVIEW |
|---|---|---|---|
| **Convergencia R-hat** | Gate (bloqueo) | R-hat < 1.2 para todos los parámetros; si FAIL → Score = 0 | Más cadenas, más iteraciones |
| **PPP (Bayesian p-value)** | 30% | PPP ≥ 0.05 | Revisar especificación del modelo, priors, controles |
| **Probabilidad de baseline negativo** | 30% | P(baseline < 0) < 0.2 | Ajustar priors de ROI/contribución; aumentar controles |
| **R² (Bondad de ajuste)** | 10% | R² > 0 (transformación sigmoidal) | Revisar si conflicto prior-datos es intencional |
| **Shift prior→posterior ROI** | 15% | Cambio estadísticamente significativo en ≥1 estadístico | Canal con poca señal; considerar combinar canales |
| **Consistencia del ROI** | 15% | Media posterior ROI entre P1 y P99 del prior | ROI extremo; revisar datos o priors |

#### 25.3 Fórmula del Health Score

```
Score_final = 
  IF convergence_FAIL: 0
  ELSE:
    0.30 × score_ppp +
    0.30 × score_baseline +
    0.10 × score_r2 +
    0.15 × score_roi_shift +
    0.15 × score_roi_consistency
```

**Interpretación:**
- Score ≥ 90 → Modelo bueno
- 70 < Score < 90 → Modelo aceptable, revisar componentes en REVIEW
- Score ≤ 70 → Modelo requiere investigación importante

#### 25.4 Detalles del check de convergencia

```python
# R-hat por parámetro
convergence = model_diagnostics.check_convergence()
max_rhat = convergence.max_r_hat
# Objetivo: max_r_hat < 1.1 (ideal) o < 1.2 (mínimo aceptable)

# Visualizar trazas de cadenas MCMC
model_diagnostics.plot_trace(parameter='roi_m')
```

#### 25.5 Detalles del PPP (Posterior Predictive P-value)

El PPP verifica si los datos observados son "típicos" bajo el modelo ajustado:

```
PPP = P(T(y_rep) ≥ T(y_obs) | data)
donde T es una estadística de prueba (ej: varianza total, χ²)
```

- `PPP ≈ 0.5` → El modelo es perfectamente calibrado
- `PPP < 0.05` → El modelo sistémicamente subestima la varianza (FAIL)
- `PPP > 0.95` → El modelo sobreestima la varianza

#### 25.6 Check de shift prior→posterior ROI

Meridian realiza **prueba de hipótesis bilateral** (bootstrap) comparando estadísticos (media, mediana, Q1, Q3) entre prior y posterior por canal. Si ningún estadístico cambia significativamente (p-value > 0.05), el canal tiene status REVIEW:

```python
# Visualizar prior vs posterior por canal
model_diagnostics.plot_prior_and_posterior_distribution()
```

---

### 26. Post-modelado: Resultados — Ajuste, ROI y Baseline

**Fuentes:** `https://developers.google.com/meridian/docs/post-modeling/model-fit?hl=es-419`, `https://developers.google.com/meridian/docs/post-modeling/roi-mroi-response-curves?hl=es-419`, `https://developers.google.com/meridian/docs/post-modeling/baseline?hl=es-419`

#### 26.1 Métricas de ajuste

```python
from meridian.analysis import analyzer, summarizer

a = analyzer.Analyzer(mmm)

# R² (proporción de varianza explicada)
r2 = a.r_squared()  # escalar o por geo

# MAPE y wMAPE
summary = summarizer.MeridianSummarizer(mmm)
fit_metrics = summary.model_fit_metrics()
# Retorna DataFrame con: r_squared, mape, wmape
```

#### 26.2 Evaluación del baseline

El **baseline** es el resultado esperado si todos los tratamientos (medios, orgánicos, no-media) se establecen a sus valores de referencia (0 para medios, mínimo para no-media):

```python
# Probabilidad de baseline negativo (debe ser < 0.2)
prob_neg = a.negative_baseline_probability()
print(f"P(baseline < 0) = {prob_neg:.3f}")

# Si prob_neg > 0.2 → modelo tiene problema de atribución excesiva
```

**Causas comunes de baseline negativo:**
1. Priors de ROI/contribución demasiado permisivos (los medios reciben demasiado crédito)
2. Insuficientes controles (variables de confusión no capturadas)
3. Insuficientes nudos (tendencia temporal no capturada)

**Mitigación:**
```python
# Calcular probabilidad a priori de contribución total > 100%
mmm.sample_prior(n_samples=1000)
a_prior = analyzer.Analyzer(mmm)
prior_contribution = a_prior.incremental_outcome(use_posterior=False) / total_outcome
prob_over_100 = np.mean(np.sum(prior_contribution, axis=-1) > 1)
# Si prob_over_100 > 0.2 → ajustar priors antes de ajustar el modelo
```

#### 26.3 Definición del resultado incremental

$$\text{IncrementalOutcome}_m = \text{E}[Y | x_m = x_m^{hist}] - \text{E}[Y | x_m = 0]$$

- Compara resultado esperado con medios históricos vs. resultado esperado sin ese canal de medios
- Para medios pagados: `ROI = IncrementalOutcome / Spend`
- Para medios orgánicos: `Contribution = IncrementalOutcome / TotalOutcome`

---

### 27. Post-modelado: Visualizaciones e Interpretación

**Fuente:** `https://developers.google.com/meridian/docs/post-modeling/interpret-visualizations?hl=es-419`

#### 27.1 Informe HTML automático

```python
from meridian.analysis import summarizer

s = summarizer.MeridianSummarizer(mmm)

# Generar informe HTML de 2 páginas (modelo + optimización)
s.generate_model_results_output(
    period_start='2024-01-01',
    period_end='2024-12-31',
    output_path='meridian_report.html'
)
```

#### 27.2 Gráficos disponibles y su interpretación

| Gráfico | Tipo | Interpretación |
|---|---|---|
| **Model fit (Expected vs. Actual)** | Serie temporal | Línea azul (esperada) vs. verde (real); línea dorada = sin medios |
| **Channel contribution waterfall** | Cascada | Contribución incremental de cada canal al resultado total |
| **Pie chart de contribuciones** | Circular | % del KPI atribuible a medios vs. baseline |
| **ROI by channel** | Barras con IC creíble | Comparación de ROI medio e IC 90% por canal |
| **mROI vs. ROI** | Scatter | Canales en cuadrante mROI>1, ROI>media = excelentes candidatos a reinversión |
| **Effectiveness vs. ROI** | Scatter | Efectividad = ingresos/impresión (no depende del presupuesto) |
| **Response curves** | Curvas | Gasto (eje X) vs. resultado incremental (eje Y); punto actual = círculo |
| **Adstock decay curves** | Curvas | Peso por lag (0 a max_lag); prior vs. posterior |
| **Hill saturation curves** | Curvas + histograma | Efecto relativo vs. unidades de medios per cápita; histograma de ejecución histórica |

#### 27.3 Gotchas de interpretación

- Las **curvas de respuesta fuera del rango histórico** son extrapolaciones paramétricas — usar con cautela para decisiones de inversión
- **ROI alto + mROI bajo** = canal saturado (posible sobreinversión)
- **ROI bajo + mROI alto** = canal con potencial (posible subinversión)
- Las **curvas de Hill** con histograma concentrado en un rango estrecho indican que el modelo no ha observado variación suficiente fuera de ese rango

---

### 28. Post-modelado: Optimización de Presupuesto

**Fuentes:** `https://developers.google.com/meridian/docs/post-modeling/interpret-optimizations?hl=es-419`, `https://developers.google.com/meridian/docs/post-modeling/optimization-without-reach-frequency?hl=es-419`, `https://developers.google.com/meridian/docs/post-modeling/optimization-with-reach-frequency?hl=es-419`

#### 28.1 Función objetivo de la optimización

Para **presupuesto fijo** (sin R&F):

$$b_{\text{optimal}} = \underset{b \in B_C}{\text{argmax}} \frac{1}{J} \sum_{j=1}^J \sum_{g,t} u_{g,t}^{[Y]} L_{g,t}^{[Y]-1} \left( \sum_{m} \beta_{g,m}^{(j)} \text{HillAdstock}\left(\frac{x_{g,t,m}^{hist} \cdot b_m}{c_m}\right) \right)$$

Donde:
- $c_m$ = gasto histórico del canal $m$ en el periodo de optimización
- $b_m$ = nuevo presupuesto propuesto para canal $m$
- $b_m/c_m$ = ratio de ajuste que escala las unidades de medios proporcionalmente

**Supuestos clave del optimizador:**
- El patrón de distribución temporal/geográfico del canal permanece constante
- El costo por unidad de medios no depende del presupuesto (no hay descuentos por volumen)

#### 28.2 Modos de optimización

```python
from meridian.analysis import optimizer

opt = optimizer.BudgetOptimizer(mmm)

# 1. Presupuesto fijo: redistribuir €1M entre canales
result_fixed = opt.optimize(budget=1_000_000)

# 2. Presupuesto flexible + ROI objetivo: maximizar ingresos con ROI ≥ 1.5
result_roi = opt.optimize(roi_target=1.5)

# 3. Presupuesto flexible + mROI mínimo: invertir hasta mROI = 1.0 por canal
result_mroi = opt.optimize(mroi_min=1.0)

# Con restricciones por canal
result_constrained = opt.optimize(
    budget=1_000_000,
    pct_of_spend={
        'tv': (0.5, 1.5),      # TV: entre 50% y 150% del histórico
        'search': (0.8, 2.0)    # Search: entre 80% y 200% del histórico
    }
)
```

#### 28.3 Optimización con R&F: Frecuencia óptima

La **frecuencia óptima** se calcula primero (es independiente del presupuesto):

$$f_{\text{optimal}, i} = \underset{f_i}{\text{argmax}} \sum_{j,g,t} \beta_{g,i}^{[RF](j)} \text{Adstock}\left(\frac{r_{g,t,i}^{hist} f_{g,t,i}^{hist}}{f_i} \text{Hill}(f_i; ec_i^{RF}, \text{slope}_i^{RF})\right)$$

Luego el optimizador usa esa frecuencia óptima al asignar el presupuesto:

```python
# Optimizar con frecuencia óptima (recomendado si tienes R&F)
result_rf = opt.optimize(
    budget=1_000_000,
    use_optimal_frequency=True
)
# vs. frecuencia histórica (más conservador)
result_rf_hist = opt.optimize(
    budget=1_000_000,
    use_optimal_frequency=False
)
```

---

### 29. Post-modelado: Planificación de Escenarios Futuros

**Fuente:** `https://developers.google.com/meridian/docs/post-modeling/scenario-planning-and-future-budget-optimization?hl=es-419`

#### 29.1 Concepto clave

La planificación de escenarios modifica las **definiciones de las métricas** (ROI, resultado incremental) pero **no** re-estima los parámetros del modelo. Se puede cambiar:

- Costo por unidad de medios (ej: si el CPC aumentó)
- Ingresos por KPI (ej: si el precio del producto cambió)
- Patrón de distribución (ej: nuevo canal con diferente distribución histórica)

#### 29.2 Argumento `new_data`

La mayoría de métodos de `Analyzer` y `BudgetOptimizer` aceptan `new_data` para definir el escenario:

```python
from meridian.data import test_data

# Escenario: el CPC de búsqueda aumentó un 20%
new_spend = original_spend.copy()
new_spend[:, :, search_channel_idx] *= 1.20  # 20% más caro

new_data = test_data.InputData.build(
    media_spend=new_spend,
    media=original_impressions,  # las impresiones bajan proporcionalmente
    # ... otros campos necesarios
)

# ROI con los nuevos costes
roi_scenario = a.roi(new_data=new_data)

# Optimización con los nuevos costes
result_scenario = opt.optimize(budget=1_000_000, new_data=new_data)
```

#### 29.3 Método auxiliar `create_optimization_tensors`

```python
# Para especificar directamente el costo por unidad de medios
opt_tensors = opt.create_optimization_tensors(
    media_units=expected_impressions_future,  # impresiones proyectadas
    cost_per_media_unit=new_cpms,             # CPMs futuros
)
result_future = opt.optimize(budget=2_000_000, new_data=opt_tensors)
```

#### 29.4 Por qué Meridian no hace predicciones del resultado total

Meridian predice el **resultado incremental** (atribuible a medios), pero **no** el resultado total futuro. Para proyectar el resultado total, se necesitaría también modelar el baseline futuro (demanda orgánica), que depende de factores macroeconómicos, estacionalidad futura, etc., fuera del alcance del MMM.

---

### 30. Post-modelado: Depuración del Modelo

**Fuente:** `https://developers.google.com/meridian/docs/post-modeling/model-debugging?hl=es-419`

#### 30.1 Problema: No convergencia MCMC (R-hat elevado)

**Causas y soluciones en orden de prioridad:**

1. **Aumentar iteraciones:**
   ```python
   mmm.sample_posterior(
       n_chains=4,
       n_adapt=2000,    # aumentar de 1000 a 2000
       n_burnin=2000,   # aumentar de 1000 a 2000
       n_keep=2000      # aumentar para más muestras
   )
   ```

2. **Verificar identificabilidad:**
   - ¿Hay variables de medios o controles altamente multicolineales?
   - ¿La variación en los datos de medios es tan baja que es difícil estimar el efecto?
   - ¿Alguna variable de control está perfectamente colineal con el tiempo? (→ usar `knots < n_times`)
   - ¿Hay canales muy dispersos (pocas geos con ejecución, muchos periodos sin datos)?

3. **Revisar priors:**
   - Priors poco informativos dificultan la convergencia cuando hay pocos datos
   - Priors muy informativos también pueden causar problemas de convergencia en algunos casos
   - Para KPI monetario: usar consejos de calibración de ROI
   - Para KPI no monetario: reducir std del prior de contribución total

4. **Reducir complejidad:**
   ```python
   model_spec = spec.ModelSpec(
       knots=26,                    # reducir nudos
       unique_sigma_for_each_geo=False,  # compartir sigma entre geos
       # ...
   )
   ```

5. **Verificar datos:** ¿El orden de `population` coincide con el de `media` para las geos?

6. **Precisión 64-bit (solo JAX):**
   ```python
   from jax import config
   config.update("jax_enable_x64", True)
   ```

#### 30.2 Problema: ResourceExhaustedError (sin memoria GPU)

```python
# En lugar de n_chains=10 (paralelo):
mmm.sample_posterior(n_chains=[5, 5], ...)  # 2 llamadas secuenciales de 5 cadenas

# Nota: [5,5] tarda el doble que 10. [4,3,3] tarda el triple.
```

#### 30.3 Problema: Posterior = Prior (el modelo no aprende)

**Causas:**
- Canal con inversión muy baja (poca señal en los datos)
- Alta correlación entre canales (datos no distinguen efectos individuales)
- Prior demasiado informativo relativo a los datos

**Interpretación correcta:** Si los datos tienen poca información, que posterior ≈ prior es estadísticamente correcto. No significa que el modelo esté mal — significa que los datos no son suficientes para actualizar la creencia inicial.

**Acciones:**
- Combinar el canal con otro canal relacionado (más señal combinada)
- Si la inversión es verdaderamente insignificante, considerar eliminar el canal como último recurso
- Verificar que los priors sean razonables (si son poco informativos Y los datos tienen poca info → posterior muy amplio)

#### 30.4 Problema: ROI muy diferente según el tipo de prior usado

Cuando se usan priors de `beta` (coeficiente) en lugar de `roi`:
- Las distribuciones a posteriori del ROI **no están regularizadas hacia la misma distribución** para todos los canales
- El mismo valor de `beta` implica ROIs distintos para canales con diferente escala de datos
- En situaciones de poca información: priors de `beta` generan ROIs diferentes entre canales sin que los datos lo justifiquen

**Solución:** Usar `media_prior_type='roi'` (default) en lugar de `'coefficient'`.

#### 30.5 Problema: Contribución de medios orgánicos muy alta

```python
# Si media_effects_dist='log_normal' y la contribución es inesperadamente alta:
# El default HalfNormal(5.0) puede concentrar demasiada densidad lejos de cero

prior = prior_distribution.PriorDistribution(
    # Opción 1: HalfNormal más ajustado
    beta_om=tfp.distributions.HalfNormal(scale=0.1),
    
    # Opción 2: Normal (permite establecer ubicación y escala)
    beta_om=tfp.distributions.Normal(loc=0.0, scale=3.0)
)
```

#### 30.6 Problema: Error de control con varianza constante

```
Error: "Control variable X does not vary across geos"
```

**Causa:** Variable de control a nivel nacional (sin variación geográfica) + `knots = n_times` → colinealidad perfecta.

**Solución:** Elegir entre:
- `knots < n_times` (ej: `knots=26`)
- Eliminar la variable de control nacional (si los nudos la reemplazan)

#### 30.7 Problema: R² negativo

Un R² negativo indica que las predicciones del modelo son **peores** que simplemente usar la media del KPI. Causas:
- Prior muy informativo que entra en conflicto con los datos
- Si el conflicto es intencional (prior basado en experimento para corregir sesgo), el R² negativo puede ser aceptable

```
Acción: Si no es intencional → flexibilizar priors (aumentar std)
```

---

### 31. Post-modelado: Actualización del Modelo

**Fuente:** `https://developers.google.com/meridian/docs/post-modeling/refreshing-model?hl=es-419`

#### 31.1 Frecuencia recomendada de actualización

- **Trimestral o anual** es lo más común
- Elegir frecuencia que coincida con el ciclo de toma de decisiones de presupuesto
- El modelo se puede actualizar con cualquier frecuencia; no hay restricción técnica

#### 31.2 Opción recomendada: Agregar datos nuevos a los existentes

```python
# Estrategia: concatenar datos nuevos con datos históricos
import numpy as np

# Datos originales: 104 semanas (2 años)
# Datos nuevos: 13 semanas (1 trimestre)
kpi_updated = np.concatenate([kpi_original, kpi_new], axis=1)  # [G, 117]
media_updated = np.concatenate([media_original, media_new], axis=1)
controls_updated = np.concatenate([controls_original, controls_new], axis=1)

# Si el periodo total supera 2-3 años, considerar descartar datos más antiguos
# Tradeoff: más datos → menos varianza pero potencial sesgo si efectividad cambió
kpi_rolling = kpi_updated[:, -104:]  # mantener solo las últimas 104 semanas
```

#### 31.3 Consistencia de nudos entre actualizaciones (AKS Hybrid)

Al actualizar con AKS, los nudos podrían cambiar completamente entre modelos, dificultando la comparación. La **selección híbrida** garantiza consistencia:

```python
from meridian.model import knots as knots_module

# Nudos del modelo anterior: [0, 13, 26, 52, 78, 104]
previous_knots = [0, 13, 26, 52, 78, 104]

# Al actualizar (datos hasta semana 117):
aks_updated = knots_module.AKS(input_data_updated).automatic_knot_selection(
    required_knots=previous_knots,  # conservar todos los nudos anteriores
    restrict_to_right_of_required_knots=True  # AKS solo añade nudos a la derecha del último
)
model_spec_updated = spec.ModelSpec(knots=aks_updated)
```

#### 31.4 Opción alternativa: Modelar solo datos nuevos (no recomendada)

Ajustar un modelo **solo** con datos nuevos (ej: 1 trimestre) tiene estos problemas:
- El efecto de Adstock no se modela correctamente en los primeros periodos (falta la ventana previa)
- Con tan pocos datos, el modelo será casi idéntico al prior (posterior ≈ prior)
- Las interdependencias entre parámetros se pierden si se usa la posterior del modelo anterior como prior del nuevo (solo captura distribuciones marginales, no la conjunta)

**Cuándo podría ser válido:** Si hay suficientes datos (>20 periodos) en la ventana nueva y se incluye la ventana previa de medios para Adstock.

#### 31.5 Uso de resultados anteriores como priors (con precaución)

```python
# Si el modelo anterior tiene posterior_roi_mean=[1.8, 2.2, 1.5]:
# Se puede usar como prior del modelo nuevo, PERO:
# ⚠️ Esto cuenta los datos anteriores DOS VECES (sesgo)

# Solo es razonable cuando:
# 1. Los datos nuevos son muy pocos (<10 periodos)
# 2. Se tiene confianza alta en la estabilidad de los efectos de medios
prior_informed = prior_distribution.PriorDistribution(
    roi_m=prior_distribution.PriorDistribution.lognormal_dist_from_mean_std(
        mean=[1.8, 2.2, 1.5],   # medias del modelo anterior
        std=[0.6, 0.7, 0.5]      # std más amplio para no sobre-regularizar
    )
)
```

---

## APÉNDICE: RESUMEN RÁPIDO DE REFERENCIAS

### URLs consultadas y su estado de accesibilidad

| URL | Estado | Alternativa usada |
|---|---|---|
| `github.com/google/meridian` (README) | ✅ Accesible via raw GitHub | `raw.githubusercontent.com/google/meridian/main/README.md` |
| `developers.google.com/meridian/reference/api/meridian` | ❌ Solo devuelve footer | Código fuente + docs `/docs/` |
| `developers.google.com/meridian/reference/api/proto` | ✅ Parcial | — |
| `developers.google.com/meridian/notebook?hl=es-419` | ❌ Solo devuelve footer | README + estructura de repo |
| `developers.google.com/meridian/notebook/meridian-getting-started` | ✅ | — |
| `colab.research.google.com/github/google/meridian/blob/main/demo/*.ipynb` | ❌ Requiere auth | `raw.githubusercontent.com/google/meridian/main/demo/*.ipynb` |
| Todas las páginas `developers.google.com/meridian/docs/` | ✅ La mayoría accesibles | — |

### Flujo de trabajo recomendado para WPP/Meliá

```
1. PREPARACIÓN (pre-modeling)
   ├── Recolectar datos: KPI semanal por geografía (2-3 años)
   ├── Preparar medios: impresiones + gasto por canal, geo, semana
   ├── Preparar controles: estacionalidad, eventos, GQV para SEM
   ├── EDA: verificar correlaciones, VIF, varianza del KPI
   └── Evaluar cantidad de datos vs. número de parámetros

2. ESPECIFICACIÓN DEL MODELO
   ├── Elegir tipo de prior: 'roi' si se tienen experimentos, 'contribution' si KPI no monetario
   ├── Calibrar priors: lognormal_dist_from_mean_std() con valores de experimentos/benchmarks
   ├── Configurar knots: enable_aks=True (recomendado) o valor fijo
   ├── Configurar max_lag: 8 semanas (default), ajustar si canal tiene efectos largos
   └── Decidir national vs. geo model

3. AJUSTE DEL MODELO
   ├── mmm.sample_posterior(n_chains=4, n_adapt=1000, n_burnin=1000, n_keep=1000)
   ├── Verificar convergencia: R-hat < 1.2 para todos los parámetros
   └── GPU recomendada (T4 mínimo)

4. DIAGNÓSTICO POST-MODELADO
   ├── Health Score: objetivo ≥ 90
   ├── PPP: debe ser ≥ 0.05
   ├── P(baseline < 0): debe ser < 0.2
   ├── Shift prior→posterior: verificar que el modelo aprende
   └── Curvas de Hill/Adstock: prior vs. posterior coherentes

5. RESULTADOS E INTERPRETACIÓN
   ├── ROI por canal con intervalos creíbles al 90%
   ├── mROI: identificar canales sobre/bajo-invertidos
   ├── Curvas de respuesta: identificar puntos de saturación
   └── Waterfall de contribuciones: baseline vs. canales individuales

6. OPTIMIZACIÓN DE PRESUPUESTO
   ├── Definir escenario: presupuesto fijo o flexible
   ├── Establecer restricciones por canal (±50% del histórico)
   ├── Interpretar: círculo (actual) vs. cuadrado (óptimo) en curvas de respuesta
   └── Para R&F: calcular frecuencia óptima primero

7. ACTUALIZACIÓN PERIÓDICA
   ├── Frecuencia: trimestral o anual
   ├── Agregar datos nuevos a histórico (no modelar solo nuevos datos)
   ├── Usar AKS Hybrid para consistencia de nudos entre actualizaciones
   └── Documentar cambios en priors y razones de negocio
```

---

*Documento generado a partir de investigación directa de: repositorio GitHub `google/meridian`, documentación oficial `developers.google.com/meridian/docs/` (todas las secciones: pre-modeling, advanced-modeling, post-modeling), notebooks demo (5 notebooks en `raw.githubusercontent.com`), y CHANGELOG + pyproject.toml para detalles de versión. Versión Meridian: 1.8.0. Fecha de referencia: agosto 2026.*
