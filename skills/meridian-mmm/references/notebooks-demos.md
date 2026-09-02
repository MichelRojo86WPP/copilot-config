# Meridian — Demos y Notebooks

> Parte de la skill meridian-mmm. Cargar este archivo al reproducir o adaptar los notebooks oficiales:
> Getting Started (TF/JAX), Reach & Frequency, simulación de datos R&F, ROI/mROI y curvas de respuesta,
> integración MLflow, y Full Funnel. Código verificado contra el repo google/meridian (carpeta demo/).

---

## PARTE III — DEMOS Y NOTEBOOKS

---

### 11. Getting Started (TF y JAX)

**Fuentes:** 
- `https://developers.google.com/meridian/notebook/meridian-getting-started`
- `https://developers.google.com/meridian/notebook/meridian-getting-started-jax`

#### 11.1 Flujo completo de trabajo

```python
from meridian.data import test_data
from meridian.model import model, spec, prior_distribution
from meridian.analysis import analyzer, optimizer
import tensorflow_probability as tfp

# 1. Cargar datos (ejemplo con datos sintéticos)
input_data = test_data.sample_input_data_geo(
    n_geos=10,
    n_times=104,  # 2 años semanales
    n_media_channels=3,
    n_controls=2
)

# 2. Definir priors
prior = prior_distribution.PriorDistribution(
    roi_m=prior_distribution.PriorDistribution.lognormal_dist_from_mean_std(
        mean=[1.5, 2.0, 1.2],
        std=[0.5, 0.7, 0.4]
    )
)

# 3. Especificación del modelo
model_spec = spec.ModelSpec(
    prior=prior,
    media_prior_type='roi',
    knots=52,
    max_lag=8
)

# 4. Instanciar y ajustar
mmm = model.Meridian(input_data=input_data, model_spec=model_spec)
mmm.sample_posterior(
    n_chains=4,
    n_adapt=1000,
    n_burnin=1000,
    n_keep=1000
)

# 5. Análisis
a = analyzer.Analyzer(mmm)
roi_results = a.roi()
mroi_results = a.mroi()
```

#### 11.2 Variante JAX

La principal diferencia del notebook JAX es el import del backend:

```python
# En lugar de tensorflow_probability, usar:
import tensorflow_probability.substrates.jax as tfp_jax

# Y opcionalmente habilitar precisión 64-bit para mayor estabilidad numérica:
from jax import config
config.update("jax_enable_x64", True)
```

> ⚠️ El backend JAX requiere `pip install google-meridian[jax]` y **no** instalar TensorFlow. Son excluyentes.

---

### 12. Demo: Reach & Frequency

**Fuente:** `https://raw.githubusercontent.com/google/meridian/main/demo/Meridian_RF_Demo.ipynb`

#### 12.1 Problema de negocio
Modelar canales donde la métrica relevante no son las impresiones brutas sino el **alcance** (personas únicas alcanzadas) y la **frecuencia** (número promedio de veces que cada persona vio el anuncio). Esto permite optimizar no solo el presupuesto sino también la frecuencia objetivo.

#### 12.2 Estructura de datos R&F

Además de `media` (impresiones), se requieren:
- `reach`: array `[G×T×RF]` — personas únicas alcanzadas
- `frequency`: array `[G×T×RF]` — frecuencia promedio

```python
# Construcción con datos R&F usando el builder with_reach()
input_data = (
    InputData.builder()
    .with_kpi(kpi_data)
    .with_media(media_impressions, media_spend)
    .with_reach(reach_data, frequency_data, rf_spend_data)
    .with_controls(controls_data)
    .with_population(population_data)
    .build()
)
```

#### 12.3 Ecuación del modelo R&F

Para canales R&F, el efecto se modela como:

```
Effect_RF = Adstock({ reach × Hill(frequency; ec_rf, slope_rf) }; alpha_rf)
```

- La función **Hill** se aplica a la frecuencia (no a las impresiones totales)
- **ec_rf** es el punto de media-saturación en términos de frecuencia
- La frecuencia óptima se puede calcular analíticamente porque `b_i` y `c_i` se cancelan en la función objetivo

#### 12.4 Outputs específicos de R&F
- Curva ROI vs. frecuencia (para encontrar la frecuencia óptima)
- Frecuencia óptima por canal R&F
- Comparación ROI con frecuencia histórica vs. frecuencia óptima

---

### 13. Demo: Simulación de Datos R&F

**Fuente:** `https://raw.githubusercontent.com/google/meridian/main/demo/RF_Data_Simulation_for_Meridian.ipynb`

#### 13.1 Problema de negocio
Generar datos sintéticos de Reach & Frequency con propiedades estadísticas realistas para testing y validación de modelos MMM.

#### 13.2 Pasos clave del notebook

```python
import numpy as np

# Simular alcance con distribución log-normal
np.random.seed(42)
n_geos, n_times, n_rf_channels = 10, 104, 2

# Alcance simulado (personas únicas, escala de miles)
reach_sim = np.exp(np.random.normal(8, 1, (n_geos, n_times, n_rf_channels)))

# Frecuencia simulada (distribución gamma, valores entre 1 y 20)
frequency_sim = np.random.gamma(shape=3, scale=1.5, 
                                size=(n_geos, n_times, n_rf_channels))
frequency_sim = np.clip(frequency_sim, 1, 20)  # frecuencia mínima = 1

# Gasto inferido a partir de CPM
cpm = 5.0  # costo por mil impresiones
rf_spend_sim = (reach_sim * frequency_sim / 1000) * cpm
```

#### 13.3 Gotchas técnicos
- La frecuencia debe ser **≥ 1** siempre (no puede haber frecuencia menor que 1)
- El alcance se expresa en personas únicas (no en impresiones brutas)
- `reach × frequency = impresiones brutas` (relación de consistencia)

---

### 14. Demo: ROI, mROI y Curvas de Respuesta

**Fuente:** `https://raw.githubusercontent.com/google/meridian/main/demo/ROI_mROI_Response_Curves.ipynb`

#### 14.1 Problema de negocio
Extraer, visualizar e interpretar las métricas de efectividad por canal: ROI histórico, ROI marginal, curvas de respuesta, y punto de saturación.

#### 14.2 Código clave de extracción de métricas

```python
from meridian.analysis import analyzer, visualizer

a = analyzer.Analyzer(mmm)

# ROI con intervalo creíble al 90%
roi_df = a.roi(confidence_level=0.90)
print(roi_df)
# Columnas: channel, roi_mean, roi_median, roi_ci_lo, roi_ci_hi

# mROI
mroi_df = a.mroi(confidence_level=0.90)

# Curvas de respuesta
response_df = a.response_curves(
    by_reach=False,  # True para canales R&F
    confidence_level=0.90
)

# Visualización
viz = visualizer.ModelVisualizer(mmm)
viz.plot_roi()
viz.plot_response_curves()
viz.plot_mroi_vs_roi()
```

#### 14.3 Interpretación de las curvas de respuesta

- **Eje X:** Gasto total (todas las geos, todos los periodos) en el canal
- **Eje Y:** Resultado incremental esperado
- **Punto actual:** Nivel histórico de gasto (círculo en la curva)
- **Punto óptimo:** Nivel de gasto recomendado por el optimizador (cuadrado)
- **Región sólida:** Dentro de las restricciones de inversión
- **Región punteada:** Fuera de las restricciones

> ⚠️ Las curvas fuera del rango histórico de datos implican **extrapolación paramétrica**. Se debe ejercer cautela al interpretar puntos muy alejados del gasto histórico.

---

### 15. Demo: Integración MLflow

**Fuente:** `https://raw.githubusercontent.com/google/meridian/main/demo/Meridian_MLflow_Demo.ipynb`

#### 15.1 Problema de negocio
Registrar experimentos MMM de forma sistemática para comparar configuraciones de modelo, reproducir resultados y auditar análisis.

#### 15.2 Instalación y uso

```bash
pip install google-meridian[mlflow]
```

```python
import mlflow
from meridian.analysis import summarizer

# Iniciar run de MLflow
with mlflow.start_run():
    # El autolog captura automáticamente
    summarizer.MeridianSummarizer(mmm).log_to_mlflow()
    
    # También se pueden registrar métricas manuales
    mlflow.log_metric("r_squared", a.r_squared())
    mlflow.log_metric("roi_channel_0", float(a.roi()['roi_mean'][0]))
```

#### 15.3 Qué captura el autolog

| Categoría | Métricas registradas |
|---|---|
| Ajuste del modelo | R², MAPE, wMAPE |
| ROI por canal | media, mediana, percentil 10/90 por canal |
| Convergencia | R-hat máximo, número de divergencias |
| Configuración | `n_chains`, `n_keep`, `max_lag`, `knots`, `media_prior_type` |
| Priors | Parámetros de las distribuciones a priori especificadas |

---

### 16. Demo: Full Funnel

**Fuente:** `https://raw.githubusercontent.com/google/meridian/main/demo/Meridian_Full_Funnel.ipynb`

#### 16.1 Problema de negocio
Modelar el efecto de los medios en **dos etapas del funnel de conversión**: Upper Funnel (awareness, consideración) y Lower Funnel (compra, conversión), donde el efecto del upper funnel influye al lower funnel.

#### 16.2 Arquitectura del modelo full-funnel

```
Upper Funnel KPI (ej: visitas web)
    ↑
    Media canales upper (TV, Display)
    ↓ [el UF KPI se usa como variable en el LF]
Lower Funnel KPI (ej: ventas)
    ↑
    Media canales lower (Search, Shopping)
    ↑
    Upper Funnel KPI (como control/tratamiento)
```

#### 16.3 Clase `AnalyzerFullFunnel` (NO está en el paquete)

> ⚠️ **Advertencia crítica:** `AnalyzerFullFunnel` **no se instala con `pip install google-meridian`**. Debe copiarse directamente desde el notebook demo. Esta es una decisión deliberada de los mantenedores: la clase es experimental y no tiene garantías de estabilidad.

```python
# La clase se define dentro del notebook (~200 líneas de código)
# y permite calcular ROI de dos etapas:
# ROI_full = ROI_UF + (ROI_LF × coeficiente de conversión UF→LF)

class AnalyzerFullFunnel:
    def __init__(self, mmm_upper, mmm_lower):
        self.upper = mmm_upper
        self.lower = mmm_lower
    
    def full_funnel_roi(self):
        # Combina resultados incrementales de ambas etapas
        upper_roi = analyzer.Analyzer(self.upper).roi()
        lower_roi = analyzer.Analyzer(self.lower).roi()
        # ... lógica de combinación ...
```

#### 16.4 Requisitos adicionales

```bash
pip install google-meridian[scenarioplanner,schema]
```

---

