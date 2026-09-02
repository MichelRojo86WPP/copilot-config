# Requisitos y calidad de datos para Meridian GeoX

Referencia técnica interna para preparar, validar y leer la calidad de datos antes de ejecutar `geox.run_design()` y `geox.analyze()`.

## 1. Formato de entrada

GeoX espera un `pd.DataFrame` en formato **long**, con una fila por cada par `(date, location)` y granularidad **diaria obligatoria**. Dentro del rango pretest, cada combinación `date` + `location` debe aparecer exactamente una vez; si hay duplicados, el quality check los avisa y la librería los agrega automáticamente.

| Columna | Tipo documentado | Obligatoria | Semántica |
|---|---:|---:|---|
| `date` | string `YYYY-MM-DD` / fecha parseable | Sí | Día de observación. No admite nulos. La serie debe ser diaria. |
| `location` | string | Sí | Geo del experimento, por ejemplo DMA, market area, región o unidad local agregada. Se castea a `str`; no admite nulos ni strings vacíos. |
| `conversions` | numérico | Sí | KPI primario absoluto: conversion counts o revenue raw, sin filtrar, bajo condición BAU. No admite nulos y la suma total debe ser > 0. |
| `spend` | numérico | Depende del experimento | Spend diario de las campañas incluidas en el estudio. Obligatorio en `GO_DARK` y `HEAVY_UP`; no requerido en `HOLDBACK`. No admite nulos ni valores negativos si se aporta. |
| `spend_cell_k` | numérico | Depende del experimento multi-cell | Spend diario de la celda `k`, por ejemplo `spend_cell_1`, `spend_cell_2`. Requerido para celdas `GO_DARK` o `HEAVY_UP`. |

Cabecera real del dataset single-cell `meridian_geox/data/example_design_data_single_cell.csv`:

```csv
date,location,conversions,spend
2020-01-01,10,1217.186754,13.961282
2020-01-01,103,478.7548505,5.360182842
2020-01-01,105,1077.686355,11.0703539
2020-01-01,108,347.5165323,4.956830216
2020-01-01,11,914.8362022,10.87281349
```

Cabecera real del dataset multi-cell `meridian_geox/data/example_design_data_multi_cell_go_dark_heavy_up.csv`:

```csv
date,location,conversions,spend_cell_1,spend_cell_2
2020-01-01,10,890.7786349,91.5,91.5
2020-01-01,103,448.0623914,135.3,135.3
2020-01-01,105,546.1942811,50.4,50.4
```

Para `geox.analyze()`, el dataset debe mantener el mismo formato que el pretest, pero incluyendo **pretest + test**. `analysis_start_date` y `analysis_end_date` deben cubrir toda la duración del test; `analysis_end_date` puede extenderse para incluir cooldown.

## 2. Semántica de `conversions`

`conversions` debe ser una métrica absoluta de negocio, no atribuida y sin filtros previos:

- Debe venir raw, típicamente del CRM del anunciante.
- Debe reflejar condición **BAU (business-as-usual)** antes de la intervención.
- En multi-cell, debe ser la métrica de negocio global compartida por todas las celdas y el control.
- Debe ser absoluta: revenue, unidades vendidas, conversion counts u otra métrica de conversión absoluta.
- **Ratios como ROAS no están soportados.**
- No deben usarse conversiones atribuidas. La documentación indica que esto evita sesgar los resultados con lógica de atribución predefinida que puede representar mal la incrementabilidad causal real.

Los valores negativos están prohibidos para la métrica de conversión. No usar net revenue después de devoluciones si puede producir negativos, porque estos valores rompen la randomización del diseño y el modelado estadístico. El remedio documentado es:

1. ejecutar diseño y análisis sobre `gross revenue` o `gross conversion counts`;
2. si las devoluciones son relevantes, aplicar después del test un ratio histórico `net-to-gross` para traducir el resultado a net.

## 3. Semántica de `spend`

`spend` mide el gasto de las campañas incluidas en el estudio:

- En `GO_DARK` y `HEAVY_UP`, la columna diaria de spend es obligatoria.
- En `HOLDBACK`, no se requiere spend; en su lugar, `cost_per_incremental_conversion` debe ser > 0.
- En single-cell, se espera `spend` o `spend_cell_1` para la primera celda.
- En multi-cell, las celdas siguientes usan `spend_cell_2`, `spend_cell_3`, etc.

### Caso A: mismo pool de campañas

Si dos celdas actúan sobre la misma campaña o canal con estrategias distintas, las columnas de spend pueden ser idénticas.

```csv
date,location,conversions,spend_cell_1,spend_cell_2
2026-05-01,Region_A,45,120,120
2026-05-01,Region_B,30,80,80
```

Ejemplo documentado: `cell_1 = GO_DARK` en YouTube y `cell_2 = HEAVY_UP` en YouTube. Ambas celdas modifican el mismo pool de campañas.

### Caso B: canales o tácticas distintas

Si cada celda mide un canal o táctica distinta, las columnas de spend deben contener valores distintos.

```csv
date,location,conversions,spend_cell_1,spend_cell_2
2026-05-01,Region_A,45,120,150
2026-05-01,Region_B,30,80,100
```

Ejemplos documentados: YouTube vs Demand Gen, prospecting vs retargeting, o Publisher A vs Publisher B.

## 4. Requisitos temporales

La regla mínima es **3N**: el pretest debe tener al menos `3 * experiment_duration` días, donde `N = experiment_duration.days`.

Código real de validación de diseño:

```python
if data[api.DATE].nunique() < 3 * design_config.experiment_duration.days:
    errors.append(
        f'Data has {data[api.DATE].nunique()} dates, but experiment duration'
        f' is {design_config.experiment_duration.days}. Need at least 3 *'
        ' experiment duration dates during design phase.'
    )
```

En análisis, la validación exige al menos **3N fechas de pretest**. Si hay estacionalidad fuerte o patrones cíclicos, la recomendación documentada es preparar más histórico: **6N o un año** para entrenar el modelo y evitar sesgo en la estimación contrafactual.

Las series semanales están explícitamente bloqueadas. Código real de detección:

```python
date_diffs = unique_dates.diff().dt.days.dropna()
if (date_diffs == 7).all():
    errors.append('Weekly patterns are not supported.')
```

La documentación recomienda no agregar semanalmente. Si hay demasiada volatilidad diaria, los remedios documentados son ampliar la duración del test, usar un KPI más superficial o aumentar el tamaño del grupo de tratamiento / ajustar `max_conversions_percent`.

## 5. Requisitos de geos

| Criterio | Valor |
|---|---:|
| Mínimo bloqueante en validación | `2 * (cell_count + 1)` geos tras excluir geos |
| Mínimo recomendado en FAQ para single-cell | 10 geos |
| Rango óptimo recomendado | 50-100+ geos |

El quality check también avisa si hay más de 500 geos únicos, porque una granularidad excesiva puede contaminar los lift estimates por flujos de población entre geos.

## 6. Criterios de selección del KPI

### Business criteria

La definición de conversión debe alinearse con el KPI primario que informa decisiones estratégicas y reflejar la influencia específica del canal evaluado. Por ejemplo, al testar tácticas de brand awareness, la documentación recomienda priorizar indicadores upper-funnel.

### Technical criteria

Los datos de conversión deben estar disponibles al nivel geográfico del experimento. Deben evitarse métricas con sparsity significativa o alta proporción de nulos.

### Un único KPI primario

GeoX optimiza un único KPI primario de conversión por run. No se pueden optimizar varias métricas a la vez, como `new buyers` y `returning buyers`. Los KPIs secundarios pueden analizarse post-test ejecutando `geox.analyze()` sobre sus datasets respectivos.

## 7. Volatilidad diaria y sparsity

GeoX requiere datos diarios. Ante volatilidad diaria, muchos ceros o sparsity, los remedios documentados son:

| Problema | Remedios documentados |
|---|---|
| Alta volatilidad diaria | Extender la duración del test, por ejemplo de 4 a 6 u 8 semanas. |
| Demasiados días con cero | Usar un KPI más superficial, como `add-to-cart` en lugar de `purchase`, para aumentar volumen. |
| Tratamiento demasiado pequeño | Aumentar el tamaño del grupo de tratamiento o ajustar `max_conversions_percent`. |
| Falta de histórico | Preparar al menos 3N; preferir 6N o un año si hay estacionalidad fuerte. |

## 8. Validation checks

Los **validation checks** son bloqueantes: si fallan, GeoX lanza `ValueError` y detiene la ejecución.

### Baseline validation checks comunes

| Check | Fase | Resultado si falla |
|---|---|---|
| `date` sin nulos | `run_design`, `analyze` | Error bloqueante |
| `location` string no vacío y sin nulos | `run_design`, `analyze` | Error bloqueante |
| `conversions` sin nulos | `run_design`, `analyze` | Error bloqueante |
| `spend` sin nulos si se aporta | `run_design`, `analyze` | Error bloqueante |
| `spend` no negativo si se aporta | `run_design`, `analyze` | Error bloqueante |
| Suma total de `conversions` > 0 | `run_design`, `analyze` | Error bloqueante |
| Granularidad diaria; patrones semanales no soportados | `run_design`, `analyze` | Error bloqueante |

### Design phase: `geox.run_design()`

| Check | Criterio | Resultado si falla |
|---|---|---|
| Pretest data length | Fechas únicas ≥ `3 * experiment_duration` | Error bloqueante |
| Geos availability | Geos restantes ≥ `2 * (cell_count + 1)` | Error bloqueante |
| Constraint overlaps | Geos excluidos no pueden solaparse con control geos forzados | Error bloqueante |
| Alpha bounds | `0 < alpha < 1` | Error bloqueante |
| Power bounds | `0 < power < 1` | Error bloqueante |
| Spend en `GO_DARK` / `HEAVY_UP` | `spend` o `spend_cell_k` diario requerido | Error bloqueante |
| `HOLDBACK` CpIC | `cost_per_incremental_conversion > 0` | Error bloqueante |
| Max conversions | `max_conversions_percent < 0.5` | Error bloqueante |

### Analysis phase: `geox.analyze()`

| Check | Criterio | Resultado si falla |
|---|---|---|
| Geo set consistency | Locations del análisis = unión exacta de control + treatment geos del diseño, tras excluidos | Error bloqueante |
| Pretest duration | Pretest en análisis ≥ `3 * experiment_duration` | Error bloqueante |
| No overlap | `pretest_end_date` estrictamente anterior a `analysis_start_date` | Error bloqueante |

## 9. Quality checks

Los **quality checks** no detienen el código. Registran warnings y devuelven detalles en un `QualityCheckResult`.

```python
import meridian_geox as geox

quality_config = geox.QualityCheckConfig(
    exclude_geos_no_response=True,   # design phase only
    exclude_outlier_dates=True,
)
```

| Parámetro | Default | Fase | Efecto documentado |
|---|---:|---|---|
| `exclude_geos_no_response` | `True` | Solo diseño | Excluye de splits candidatos geos con spend > 0 pero sin conversiones registradas. |
| `exclude_outlier_dates` | `True` | Diseño y análisis | Excluye fechas pretest detectadas como outliers. |

Umbrales reales:

```python
_MAX_GEOS = 500
_MAX_ZERO_RESPONSE_PCT = 0.5
_MAX_MISSING_DAYS_PCT = 0.3
_MAX_DUPLICATE_ENTRIES = 0
```

| Métrica (`quality_metrics['metric']`) | Umbral | Fase | Resultado |
|---|---:|---|---|
| `Too Many Geos` | > 500 | Ambas | Warning |
| `Percentage of missing conversion days` | > 0.3 | Ambas, evaluado sobre pretest | Warning |
| `Percentage of missing spend days ({cell_name})` | > 0.3 | `GO_DARK` / `HEAVY_UP` | Warning |
| `Duplicate Entries` | > 0 | Ambas | Warning; se agregan automáticamente |
| `Spend > 0 and no conversions` | No documentado | Solo diseño | Warning; puebla `outlier_geos` |
| `Outlier pretest dates` | IQR | Ambas | Warning; puebla `outlier_dates` |
| `Percentage of zero response` | > 0.5 | Ambas, evaluado sobre pretest | Warning |

En análisis, los quality checks se evalúan específicamente sobre el periodo pretest para evitar post-treatment bias.

### Detección de fechas outlier: leave-one-out + IQR

La función interna `_detect_pretest_date_outliers(y, t, multiplier=3.0)` aplica regresión lineal OLS `y ~ alpha + beta * t` con validación leave-one-out:

```python
def _detect_pretest_date_outliers(y, t, multiplier=3.0) -> tuple[np.ndarray, float]:
  """Detects outlier pre-test dates using Leave-One-Out (LOO) cross-validation.

  Applies standard ordinary least squares (OLS) linear regression (y ~ alpha +
  beta * t) sequentially across the timeline, holding one date index out at a
  time. ... Outliers are identified as dates where the gap exceeds the empirical
  IQR threshold: Q3 + multiplier * IQR.
  """
  for k in range(num_dates):
    train_x = np.delete(t, k); train_y = np.delete(y, k)
    slope, intercept = np.polyfit(train_x, train_y, 1)
    y_pred = intercept + slope * t[k]
    gaps.append(abs(y[k] - y_pred))
  q75, q25 = np.percentile(gaps, [75, 25])
  iqr = q75 - q25
  cutoff = q75 + (multiplier * iqr)
```

Requisitos y criterio:

- Requiere `num_dates > 3`.
- Calcula el error absoluto de cada fecha dejando esa fecha fuera del ajuste.
- Calcula `Q3 + multiplier * IQR`, con `multiplier=3.0`.
- Marca una fecha como outlier si `gaps[k] > cutoff and gaps[k] > 1e-5`.

## 10. Cómo leer `QualityCheckResult`

`QualityCheckResult` contiene:

```python
# quality_metrics: pd.DataFrame con columnas:
#   ['metric', 'value', 'message', 'threshold']
# outlier_geos: Set de localizaciones outlier
# outlier_dates: Set de fechas outlier
```

| Señal | Lectura | Acción recomendada |
|---|---|---|
| `quality_metrics` vacío | No hay warnings de calidad documentados. | Continuar con `run_design` o `analyze`. |
| `Too Many Geos` | La granularidad supera 500 geos. | Revisar si la unidad geo es demasiado fina; la documentación advierte posible contaminación por population flow. |
| `Percentage of missing conversion days` | Más del 30% de días de conversión ausentes. | Revisar extracción del KPI; considerar un KPI más superficial o más histórico si el problema es sparsity real. |
| `Percentage of missing spend days ({cell_name})` | Más del 30% de días de spend ausentes en celda activa. | Revisar la serie diaria de spend de esa celda antes del diseño. |
| `Duplicate Entries` | Hay más de una fila por `date` + `location`. | Aunque se agregan automáticamente, limpiar el dataset para que cada par sea único. |
| `Spend > 0 and no conversions` | Geo con inversión pero sin conversiones. | En diseño, si `exclude_geos_no_response=True`, se excluye de splits candidatos; revisar si es un problema de medición. |
| `Outlier pretest dates` | Fechas pretest anómalas por LOO + IQR. | Si `exclude_outlier_dates=True`, se excluyen; revisar causas de negocio o tracking para esas fechas. |
| `Percentage of zero response` | Más del 50% de response cero. | Considerar extender duración, usar KPI más superficial o aumentar treatment / ajustar `max_conversions_percent`. |

Si un aviso aparece en análisis, recordar que se evalúa solo sobre el pretest para evitar sesgo post-tratamiento.

## 11. Checklist de preparación de datos

### Antes de lanzar `geox.run_design()`

- [ ] Dataset en formato long, con una fila por `(date, location)`.
- [ ] Fechas a granularidad diaria; no usar agregación semanal.
- [ ] Histórico pretest ≥ `3 * experiment_duration`; preferir 6N o un año con estacionalidad fuerte.
- [ ] `date`, `location` y `conversions` completos, sin nulos.
- [ ] `location` sin strings vacíos y casteable a `str`.
- [ ] `conversions` raw, sin filtrar, no atribuidas y bajo BAU.
- [ ] `conversions` absoluto; no usar ROAS ni otros ratios.
- [ ] `conversions` sin negativos; usar gross, no net tras devoluciones.
- [ ] Suma total de `conversions` > 0.
- [ ] Para `GO_DARK` o `HEAVY_UP`, `spend` / `spend_cell_k` diario completo, no negativo y sin nulos.
- [ ] Para `HOLDBACK`, confirmar que `cost_per_incremental_conversion > 0`.
- [ ] En multi-cell, confirmar si el spend corresponde al Caso A o Caso B y mapear columnas por celda.
- [ ] Geos disponibles tras exclusiones ≥ `2 * (cell_count + 1)`; idealmente 50-100+.
- [ ] Sin solape entre geos excluidos y control geos forzados.
- [ ] `alpha` y `power` estrictamente entre 0 y 1.
- [ ] `max_conversions_percent < 0.5`.
- [ ] Revisar warnings de `QualityCheckResult` antes de aceptar el diseño.

### Antes de lanzar `geox.analyze()`

- [ ] Dataset con el mismo formato que el pretest, incluyendo pretest + test.
- [ ] `analysis_start_date` y `analysis_end_date` cubren toda la duración del test.
- [ ] Si aplica cooldown, `analysis_end_date` lo incluye.
- [ ] Geos del dataset de análisis coinciden exactamente con la unión de control + treatment geos del diseño, tras excluidos.
- [ ] Pretest disponible en análisis ≥ `3 * experiment_duration`.
- [ ] Si se fija `pretest_end_date`, es estrictamente anterior a `analysis_start_date`.
- [ ] No introducir filtros de atribución ni cambios de definición del KPI respecto a diseño.
- [ ] Revisar `QualityCheckResult` de análisis, sabiendo que se evalúa sobre el pretest.
