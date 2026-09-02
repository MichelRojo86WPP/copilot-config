# Referencia técnica de troubleshooting y glosario de Meridian GeoX

Propósito: servir como referencia interna, en español, para diagnosticar diseños GeoX, comparar alternativas, resolver dudas frecuentes y evitar terminología no soportada por la documentación pública de Meridian GeoX.

## Parte 1 — Troubleshooting

### 1. Las tres métricas núcleo del diseño

Meridian GeoX usa tres métricas que deben leerse juntas, no de forma aislada.

| Métrica | Qué es | Cómo se interpreta | Relación con las demás |
|---|---|---|---|
| **MDE** (`mde`, `mde_abs`) | **Minimum Detectable Effect**: menor uplift porcentual que el experimento puede detectar con el `alpha`, `power`, duración y split treatment/control definidos. | Si el lift esperado de negocio está por debajo del MDE, el test está underpowered y puede acabar no concluyente aunque exista efecto real. | Según la documentación, el MDE está determinado por la volatilidad histórica y el matching de geos; cambiar sólo el `budget` no cambia este límite estadístico. |
| **Budget** (`budget`) | Cambio total proyectado de gasto durante el test. En go-dark/heavy-up se calcula desde el spend histórico y `budget_pct`; en holdback se proyecta con `cost_per_incremental_conversion`. | Mide la disrupción o inversión necesaria para generar señal suficiente. | El budget traduce la potencia estadística a requisito fiscal, pero no cambia por sí solo el MDE. |
| **Design-implied CpIC** (`design_implied_cpic`) | `budget / minimum required incremental conversions`. | Coste incremental por conversión implícito que el diseño necesitaría para ser detectable. | Debe compararse con el **theoretical CpIC** estimado: `CPA / Elasticity`. Idealmente, el design-implied CpIC no debería ser menor que el CpIC estimado. |

Relación documentada entre CPA, Elasticity y CpIC:

| Concepto | Fórmula/uso |
|---|---|
| **CPA** | `Spend / Conversions`; incluye conversiones incrementales y no incrementales. |
| **Elasticity** | `(ΔC / C) / (ΔS / S)`; para go-dark, con `ΔS = -100% · S`, equivale esencialmente a `-ΔC / C`, es decir, el lift relativo esperado. |
| **CpIC** | `ΔS / ΔC`; coste real de cada conversión incremental. |
| **Theoretical CpIC** | `CPA / Elasticity`. |
| **Design-implied CpIC** | `budget / minimum required incremental conversions`. |

Trade-off práctico:

- **MDE alto**: exige un lift real grande para detectar efecto.
- **Budget alto**: aumenta la disrupción o inversión, y eleva el design-implied CpIC.
- **Design-implied CpIC demasiado bajo frente al CpIC estimado**: el diseño pide una eficiencia incremental poco realista; puede no concluir.
- **Budget más alto** → design-implied CpIC más alto, menos exigente en eficiencia, pero más costoso.
- **Budget más bajo** → design-implied CpIC más bajo, más exigente en eficiencia, con mayor riesgo de resultado no concluyente.

### 2. Diagnóstico por síntoma

| Síntoma | Causa probable documentada | Acciones concretas |
|---|---|---|
| **MDE demasiado alto / no alcanzable** | Volatilidad histórica alta, mal matching treatment/control, pocos geos o treatment group demasiado pequeño. | 1) Aumentar `experiment_duration` de 4 a 6 u 8 semanas. 2) Aumentar tamaño del treatment group ajustando `max_conversions_percent` sin superar el límite validado `< 0.5`. 3) Probar KPI más superficial y de mayor volumen, como `add-to-cart` en lugar de `purchase`. 4) Usar `STRATIFIED_SAMPLING` cuando haya suficientes geos. |
| **R² out-of-sample por debajo de `min_r2`** | Control geos predicen mal los treatment geos; relación histórica inestable, outliers, cambios bruscos de geo o alta volatilidad. | El default recomendado es `min_r2 = 0.8`. Si se necesita explorar, puede relajarse a `0.75` y luego `0.70`, documentando la pérdida de fiabilidad. `R² < 0.5` indica que el análisis post-test puede ser no fiable. Revisar anomalías, excluir `excluded_dates`/`excluded_geos` y ampliar histórico pretest de `3N` a `6N` o más. |
| **Ningún diseño cumple el objetivo de negocio** | El lift esperado es menor que el MDE o las restricciones dejan muy poco espacio de búsqueda. | 1) Aumentar explícitamente `budget` en `geox.Constraints()`. 2) Aumentar `experiment_duration`. 3) Mantener duración y elevar `max_conversions_percent` para afectar más geos. 4) Cambiar a un KPI de mayor volumen. 5) Replantear el objetivo si sigue por debajo del MDE viable. |
| **Presupuesto requerido inasumible** | El diseño necesita más señal incremental que la inversión o disrupción tolerable permite. | 1) Priorizar single-cell si el objetivo es un único táctico, porque concentra la potencia en una comparación. 2) Alargar duración. 3) Reducir restricciones no imprescindibles. 4) Revisar si holdback, go-dark o heavy-up es el tipo de experimento adecuado. 5) No subir directamente el presupuesto diario de campaña para “forzar” diseño: rompe el supuesto de control geos siempre BAU; si fuera imprescindible, subir primero, esperar suficiente pretest bajo el nuevo BAU y rediseñar. |
| **Pocos geos disponibles** | Tras exclusiones, el pool no permite estratificación robusta. La validación exige al menos `2 * (cell_count + 1)` geos; la FAQ indica mínimo 10 geos para single-cell. | Con 10–20 geos, usar `RANDOM` porque `STRATIFIED_SAMPLING` es menos efectivo al estar limitado el clustering. Con >20 geos, preferir `STRATIFIED_SAMPLING`. Óptimo documentado: 50 a más de 100 geos. Reducir `excluded_geos` o agregaciones demasiado restrictivas. |
| **Alta volatilidad diaria / sparsity de conversiones** | Días sin conversiones, conversiones cero >50% o fracción de días sin conversión >30%; KPI demasiado profundo o granularidad excesiva. | No agregar semanalmente: GeoX exige datos diarios. Extender duración, usar KPI más superficial, aumentar treatment group vía `max_conversions_percent`, excluir fechas/geos anómalos y revisar outliers. Evitar métricas ratio como ROAS; usar conversiones o revenue absolutos raw. |
| **Estacionalidad fuerte y picos estacionales** | La relación entre geos puede cambiar durante periodos de alto volumen; 3N puede ser insuficiente. | Preparar al menos un año de histórico si el negocio es muy estacional. Evitar iniciar o terminar el test en pleno pico. Empezar antes para estabilizar pujas y terminar después cuando el volumen normalice. Validar en picos históricos con placebo/A/A: exigir `p-value >= alpha` y `R² >= 0.8`; si falla, evitar testar en el pico. |
| **Pico estacional “untouchable”** | No se puede apagar publicidad por riesgo de negocio. | Usar **heavy-up** en lugar de go-dark: control en BAU y treatment con +20% a +50% spend. Alternativa: **partial go-dark / go-dim**, por ejemplo -20% en treatment, para medir eficiencia marginal con menor riesgo; no mide la eficiencia total BAU vs cero, que requiere full go-dark. |
| **Placebos insuficientes en análisis** | La inferencia design-aware no conserva suficientes placebos válidos con `min_placebo_r2`. | Defaults documentados: `n_placebo_candidates = 100000`, `n_top_placebos = 500`, `min_placebo_r2 = 0.6`, `min_placebo_count_warning = 100`, `min_placebo_count_error = 10`. Si hay warning `<100`, revisar restricciones, geos y estabilidad del pretest. Si hay error `<10`, el análisis no tiene placebos suficientes: relajar restricciones o rediseñar. |
| **Resultado no significativo tras el test** | Efecto real menor que el MDE, varianza post-test mayor de la estimada, implementación contaminada o cambios durante test/cooldown. | Verificar implementación: control siempre BAU, treatment aplicado como diseñado, `Presence` targeting, sin tests user-level simultáneos, sin shared budgets/portfolio bidding cruzando celdas. Revisar `plot_analysis`: pretest observado vs contrafactual, diferencia pointwise, cumulative lift y cumulative iCPD. Interpretar como no concluyente si el p-value no rechaza la null; no afirmar ausencia de efecto fuera del poder detectable. |

### 3. Comparar metodologías

`geox.compare_designs()` permite comparar varias combinaciones de `DesignConfig` y `Constraints` sobre el mismo dataset. La documentación lo usa para comparar, por ejemplo, `TBR` con `RANDOM` frente a `TBR` con `STRATIFIED_SAMPLING`, evaluando qué alternativa produce mejor R² o menor MDE.

```python
comparison_results = geox.compare_designs(design_data, [
    (geox.DesignConfig(
        experiment_duration=datetime.timedelta(days=28),
        methodology=geox.Methodology.TBR,
        geo_assignment_rule=geox.GeoAssignmentRule.RANDOM,
        design_output_count=5), geox.Constraints()),
    (geox.DesignConfig(
        experiment_duration=datetime.timedelta(days=28),
        methodology=geox.Methodology.TBR,
        geo_assignment_rule=geox.GeoAssignmentRule.STRATIFIED_SAMPLING,
        design_output_count=5), geox.Constraints()),
])
comparison_results.design_metrics
```

`geox.concat_design_reports()` concatena varios `DesignSet` y devuelve un conjunto re-rankeado por métricas. Úsalo cuando se hayan ejecutado búsquedas separadas —por ejemplo con diferentes duraciones, restricciones o tipos de experimento— y se quiera comparar una tabla única de candidatos.

Criterio de elección recomendado:

1. Filtrar por viabilidad de negocio: presupuesto, disrupción y tipo de intervención aceptables.
2. Exigir R² out-of-sample suficiente: ideal `>= 0.8`; relajar sólo con justificación.
3. Exigir A/A sin sesgo: `p-value > alpha`.
4. Elegir menor MDE entre candidatos viables.
5. Comprobar que el design-implied CpIC no exige una eficiencia incremental irrealista frente al CpIC estimado.

### 4. Palancas disponibles, en orden recomendado

| Prioridad | Palanca | Cuándo tocarla | Notas documentadas |
|---|---|---|---|
| 1 | **Calidad de datos** | Antes de relajar criterios. | Revisar duplicados, outliers, geos sin respuesta, negativos, sparsity y granularidad diaria. |
| 2 | **Duración (`experiment_duration`)** | MDE alto, volatilidad o pocos eventos. | Debe cubrir al menos un ciclo de compra; pasar de 4 a 6 u 8 semanas puede ayudar. |
| 3 | **Tipo de experimento** | Riesgo de apagar campañas o señal insuficiente. | Single-cell es más robusto para un único táctico. Heavy-up puede crear señal si go-dark no es viable; go-dim reduce riesgo en picos. |
| 4 | **`max_conversions_percent`** | Treatment group demasiado pequeño. | Default 0.3; validación exige `< 0.5`. Aumentarlo eleva disrupción. |
| 5 | **Geos excluidos/forzados** | Pool limitado o mal fit. | `excluded_geos` e `included_control_geos` restringen randomization pool y pueden subir MDE. Force to treatment no está soportado en core. |
| 6 | **`geo_assignment_rule`** | Pocos geos o comparación de métodos. | 10–20 geos: `RANDOM`; >20: `STRATIFIED_SAMPLING`, recomendado en general con TBR. |
| 7 | **`num_strata`** | Estratificación inestable o demasiados/pocos geos por cluster. | Default 4; k-means usa volumen, tendencia, estacionalidad y DTW. Ajustar sólo con seguimiento de métricas. |
| 8 | **`alpha` y `test_type`** | Necesidad explícita de distinto nivel de significación o test one-sided. | Default `alpha = 0.1`, CI 90%, `TWO_SIDED`. Relajar `alpha` aumenta riesgo de falso positivo. |
| 9 | **KPI** | Conversiones sparse o lift esperado bajo. | Un único KPI por run. Usar métricas absolutas raw; no ROAS ni métricas ratio. |
| 10 | **Presupuesto** | Diseño no alcanza objetivo o design-implied CpIC demasiado exigente. | Cambiar budget no cambia el MDE; cambia el target de eficiencia medible y la disrupción. |

## Parte 2 — FAQs oficiales

### GeoX vs. medición user-based

| Pregunta | Respuesta |
|---|---|
| ¿En qué se diferencia GeoX de la medición user-based? | GeoX agrupa audiencias por regiones geográficas y usa datos agregados, ignorando la atribución a nivel usuario. El user-based lift rastrea cookies individuales o impresiones para atribuir conversiones. |
| ¿Qué beneficios aporta GeoX? | Permite **cross-publisher incrementality** —Google vs no-Google—, medición offline y omni-channel —ventas en tienda, CRM— y es **privacy-durable**, al no depender de cookies o identificadores individuales afectados por restricciones de iOS. |

### Meridian GeoX vs. librerías legacy (TBRMM)

| Pregunta | Respuesta |
|---|---|
| ¿Qué diferencia a Meridian GeoX de TBRMM? | Meridian GeoX es un **one-stop shop**: diseño y análisis en una librería. Añade `compare_designs`, computación optimizada con JAX para generación rápida de candidatos, soporte multi-cell, restricciones flexibles y **design-aware placebo inference**. |
| ¿Por qué GeoX recomienda presupuestos y MDE mayores que TBRMM? | TBRMM estima potencia con ajuste **in-sample pre-test**, por lo que puede infraestimar la varianza que aparecerá en test y dejar el estudio underpowered. Meridian GeoX usa validación out-of-sample / honest data-splitting y placebo testing en diseño, capturando una varianza post-test más realista; por eso sus presupuestos y MDE son más conservadores. |

### Datos

| Pregunta | Respuesta |
|---|---|
| ¿Se puede usar net revenue con valores negativos? | No recomendado. Aunque la validación sólo exige suma total positiva de `conversions`, valores negativos pueden romper candidate generation —greedy assignment— y modelado estadístico. Usar gross revenue/gross conversions y aplicar ratio net-to-gross post-test. |
| ¿Es obligatorio aportar spend? | Sí para go-dark y heavy-up; la validación falla si falta. Para holdback no es obligatorio, pero se debe aportar una referencia de CpIC mediante `cost_per_incremental_conversion`. |
| ¿Cómo obtener spend por geo? | En Google Ads, vía Google Ads API con reportes como `campaign_location_target_report`. Para otros publishers, mediante APIs específicas o exportes de UI. |
| ¿Qué cuidado hay con identificadores geográficos? | Deben coincidir exactamente entre datasets de conversiones y spend. En ZIP/postal codes, preservar ceros iniciales como strings: `"02138"`, no `"2138"`. |
| ¿Se soportan datos semanales? | No. GeoX exige series temporales diarias; datos semanales disparan errores de validación. |
| ¿Se pueden optimizar múltiples KPI a la vez? | No. Un run usa un único KPI de conversión en la columna `conversions`. Para new vs returning buyers, store visits + sales u otros KPI, se requiere un diseño separado por KPI. |

### Diseño y restricciones

| Pregunta | Respuesta |
|---|---|
| ¿Se pueden forzar mercados? | **Force to control** sí, con `included_control_geos`. **Excluir geos** sí, con `excluded_geos`. **Force to treatment** no está soportado en la librería core. |
| ¿Qué riesgo tienen las exclusiones o geos forzados? | Restringen el randomization pool y pueden degradar el model fit, resultando en MDE mayor. Deben usarse sólo por razones de negocio. |
| ¿Cuál es el número mínimo de geos? | La FAQ indica mínimo 10 geos para single-cell. Con 10–20 geos se recomienda `RANDOM`; con >20 geos, `STRATIFIED_SAMPLING`. El rango óptimo documentado es 50 a más de 100 geos. |
| ¿Cómo funciona budget flexible con target iCPA/iROAS? | En holdback se introduce CpIC objetivo con `cost_per_incremental_conversion`, equivalente a `1/iROAS` si `conversions` es revenue; la librería calcula el presupuesto necesario. En go-dark/heavy-up no se introduce CpIC: el budget se deriva del spend histórico de treatment geos y `budget_pct`. |
| ¿Cambiar budget cambia el MDE? | No. El MDE estadístico está determinado por volatilidad histórica y matching de geos. El budget cambia los targets de eficiencia medibles, no el límite estadístico. |

### Implementación y post-test

| Pregunta | Respuesta |
|---|---|
| ¿Qué pathways de setup existen? | Platform UI para estudios estándar manuales; Platform editor para bulk y multi-campaña con editor backup file; Platform API para automatización enterprise. El targeting por ZIP code no está soportado vía API. |
| ¿Cuándo modificar directamente una campaña? | Cuando los presupuestos son **uncapped**. Restringir geos directamente mantiene intacto el machine learning histórico. |
| ¿Cuándo duplicar campañas? | Es obligatorio con campañas con presupuesto diario **capped**. Si sólo se restringen geos en una campaña capped, el algoritmo redistribuye el presupuesto ahorrado a control geos, contaminando el control group. |
| ¿Qué targeting debe usarse? | `Presence` targeting estricto. |
| ¿Hay cooldown? | La FAQ indica cooldown de 1–2 semanas antes de volver a BAU para capturar conversiones rezagadas. La guía de implementación indica cooldown opcional pero altamente recomendado si puede haber lag de conversión. |
| ¿Pueden convivir tests user-level simultáneos? | No. Conversion lift y brand lift deben desactivarse en campañas evaluadas porque crean holdouts aleatorios ocultos dentro de geos, contaminan treatment/control, diluyen potencia y sesgan el análisis. |
| ¿Un multi-cell testa significancia entre dos brazos activos? | No. Cada treatment cell se evalúa independientemente contra el control compartido. La librería no aporta una métrica directa para testar si la diferencia entre dos brazos activos es significativa. |

## Parte 3 — Glosario

| Término en inglés | Traducción/uso | Definición |
|---|---|---|
| **A/A test** | Test A/A / robustez pre-experimento | Chequeo que aplica el modelo a un periodo sin tratamiento conocido. `p-value > alpha` indica que el diseño no muestra sesgo preexistente significativo. |
| **Alpha** | Nivel de significación | Probabilidad de rechazar la hipótesis nula cuando es cierta; error Tipo I. Default documentado en `DesignConfig`: `0.1`, con CI 90%. |
| **ATT (Average Treatment effect on the Treated)** | Efecto medio en tratados | Estimando `E[Y(1) - Y(0) | D = 1]`; base causal del efecto en treatment geos. |
| **Budget-neutral test** | Test neutral en presupuesto | Diseño multi-cell que combina, por ejemplo, go-dark y heavy-up al mismo tiempo, manteniendo neutral el presupuesto total entre geos. |
| **Conversion** | Conversión / KPI primario | Variable KPI primaria: revenue, unidades vendidas, engagement upper-funnel u otra métrica sobre la que marketing pueda tener efecto causal. Debe ser absoluta y raw. |
| **Control geos** | Geos de control | Grupo que no recibe la intervención y sirve como baseline para estimar el contrafactual de treatment geos. |
| **Cooldown** | Periodo de enfriamiento | Periodo posterior al test usado para evaluar impactos retardados por conversion lag; durante cooldown todos los geos vuelven a BAU. |
| **Cost per incremental conversion (CpIC)** | Coste por conversión incremental / iCPA | Inverso de la conversión incremental esperada por dólar (`1 / expected ICPD`). Si `conversions` es revenue, equivale a `1 / expected iROAS`. Se usa sobre todo en holdback. |
| **Counterfactual** | Contrafactual | Resultado esperado para treatment geos si no hubieran recibido intervención; GeoX lo estima con modelos como TBR. |
| **Design-aware inference** | Inferencia consciente del diseño | Inferencia por placebos que respeta la topología y restricciones del diseño original (`Ω_D`), evitando splits placebo inválidos. |
| **Design-implied CpIC** | CpIC implícito del diseño | `budget / minimum required incremental conversions`; métrica para contrastar si el diseño exige una eficiencia incremental realista. |
| **DTW (Dynamic Time Warping)** | Métrica de forma temporal | Feature usada en stratified sampling para capturar similitud de patrones temporales entre geos. |
| **Excluded geos** | Geos excluidos | Geos similares a control porque no reciben intervención, pero quedan completamente fuera del test y no contribuyen al contrafactual. |
| **Experiment budget** | Presupuesto del experimento | Cambios totales proyectados del gasto de marketing durante el test. En campañas existentes depende del tamaño del treatment group. |
| **Geo unit** | Unidad geográfica | Nivel geográfico del diseño y ejecución, definido por fronteras regionales. Recomendación oficial: DMA en EE.UU. y GMA fuera de EE.UU.; si no, unidades locales agregadas. |
| **Go-dark** | Apagado total | Intervención en campañas existentes donde el spend se apaga completamente en treatment geos; control mantiene BAU. |
| **Go-dim / partial go-dark** | Apagado parcial | Reducción parcial del spend, por ejemplo -20%, para medir eficiencia marginal con menor riesgo; no mide eficiencia total BAU vs cero. |
| **Heavy-up** | Incremento de inversión | Intervención en campañas existentes donde treatment recibe spend incrementado y control mantiene BAU. |
| **Holdback / holdout** | Retención / grupo sin exposición | Tipo de test para estrategias nuevas: treatment recibe new spend y control queda held back o con zero spend. |
| **Incremental conversion** | Conversión incremental | Lift en resultados de negocio resultante de la intervención, calculado mediante modelado contrafactual. |
| **Incremental conversion per dollar (ICPD / iCPD)** | Conversión incremental por dólar | Eficiencia incremental normalizada por spend. Equivale a iROAS si `conversions` es revenue. |
| **iROAS** | ROAS incremental | Equivalente a ICPD cuando la métrica de conversión es revenue. |
| **Learning period** | Periodo de aprendizaje | Periodo de estabilización de pujas/campañas. La guía indica que duplicar campañas lo dispara; en heavy-up considerar 4–5 días dentro del test. |
| **MDE (Minimum Detectable Effect)** | Efecto mínimo detectable | Menor uplift porcentual que el experimento puede detectar con la configuración elegida. |
| **Placebo inference** | Inferencia por placebos | Distribución nula empírica generada con asignaciones placebo; en GeoX se documenta como design-aware placebo inference. |
| **Power** | Potencia estadística | Probabilidad de detectar correctamente conversión incremental si realmente existe; capacidad de evitar una lectura no concluyente. Default 80%. |
| **Pretest** | Periodo pretest | Periodo anterior al experimento usado para recoger series históricas por geo y buscar diseños. Debe tener al menos `3 × experiment_duration`. |
| **R² out-of-sample** | Ajuste fuera de muestra | Métrica usada para filtrar candidatos; default `min_r2 = 0.8`. |
| **SDID (Synthetic Difference-in-Differences)** | Synthetic diff-in-diff | Aparece en el enum real como `SDID`, pero está poco documentado; tratar como disponible-pero-no-documentado. |
| **Stratified sampling** | Muestreo estratificado | Asignación que clusteriza geos en strata homogéneos por volumen, tendencia y estacionalidad, y asigna treatment/control dentro de cada cluster. |
| **Synthetic control** | Control sintético | Mencionado en documentación/abstract como metodología del framework, pero no existe como valor de enum inspeccionado. No tratarlo como soportado en la API actual. |
| **TBR (Time-Based Regression)** | Regresión basada en tiempo | Método contrafactual plenamente documentado donde el contrafactual de treatment se estima con una transformación lineal de la conversión media de control geos. |
| **TBRMM** | Time-Based Regression Matched Markets | Librería legacy referenciada por la FAQ; GeoX la compara como software previo de geo-experimentos. |
| **Test** | Periodo activo | Periodo durante el cual se aplica la intervención a treatment geos. |
| **Test type** | Tipo de contraste | `TWO_SIDED` por defecto u `ONE_SIDED`, según `DesignConfig`/`AnalysisConfig`. |
| **Treatment geos** | Geos tratados | Grupo que recibe la intervención de marketing testada: holdback, go-dark, heavy-up u otra celda activa. |

## Parte 4 — Terminología que NO pertenece a Meridian GeoX

### Aviso anti-alucinación

| Término | Estado en documentación Meridian GeoX | Recomendación interna |
|---|---|---|
| **GBR** | No aparece en ninguna página revisada de la documentación GeoX. | No usarlo como metodología de Meridian GeoX. Si aparece en literatura previa de Google, etiquetarlo como terminología externa, no de esta librería. |
| **trimmed match** | No aparece en la documentación GeoX. Es una librería separada de Google (`google/trimmed_match`). La FAQ de GeoX sólo referencia **TBRMM** como legacy Google GeoX open source software. | No documentarlo como parte de Meridian GeoX. Si se menciona, hacerlo sólo como herramienta externa/legacy distinta. |

### Discrepancia doc ↔ código sobre metodologías

La documentación de configuración menciona `synthetic control` y `synthetic difference-in-differences` como opciones de metodología, y el abstract del paper habla de Time-Based Regression, Synthetic Control y Synthetic Difference-in-Differences. Sin embargo, el enum real inspeccionado sólo contiene:

| Enum real | Estado |
|---|---|
| `Methodology.TBR` | Plenamente documentado y soportado por la FAQ. |
| `Methodology.SDID` | Existe en código, pero la documentación pública no desarrolla su uso. |
| `SYNTHETIC_CONTROL` | No existe como valor de enum en la versión inspeccionada. |

Recomendación interna: tratar **TBR** como la única metodología plenamente soportada/documentada para trabajo operativo. Tratar **SDID** como disponible-pero-no-documentada y no basar una entrega en ella sin verificación adicional contra código y pruebas.

### Otras lagunas e incertidumbres documentadas

| Laguna | Estado | Acción recomendada |
|---|---|---|
| Página de calibración GeoX→MMM | `intro-to-incrementality-based-calibration` aparece publicada sin contenido útil; sólo footer de licencia. | Usar la documentación de Meridian MMM sobre custom priors de experimentos pasados como fuente complementaria, marcándola como fuera de GeoX. |
| PDF del white paper | La landing de Google Research expone el abstract; el PDF completo no fue accesible vía fetch. | No citar detalles no verificables del paper más allá del abstract disponible. |
| Seis pasos del design search pipeline | La guía dice que existen seis pasos, pero sólo aparecen en una imagen (`meridian-geox-design-search-workflow.png`), sin descripción textual. | No inventar los seis pasos; describir sólo training/validation/final selection y marcar el detalle como no documentado en texto. |
| Página `geox/notebook` | HTML renderizado casi vacío; notebooks concretos están en GitHub bajo `meridian_geox/colab`. | No asumir lista de notebooks desde la doc renderizada; verificar en GitHub si se necesita. |
| Detalles presentes sólo en código | `MULTICELL_SPEND_REGEX`, enum `GeoGroup`, validadores `_normalize` y `validate_dates`, normalización de columnas a minúsculas. | Usarlos sólo si se ha verificado contra la versión exacta del código; no presentarlos como contenido de la documentación pública. |
