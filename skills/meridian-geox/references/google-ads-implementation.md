# Implementación de GeoX en Google Ads para un cliente

Este documento sirve como referencia operativa para traffickers de WPP Media que activan estudios GeoX en Google Ads y plataformas comparables.

## Fuentes verificadas

- `geox-docs-part1.md`, sección 9: implementation of geo testing.
- `geox-docs-part2.md`, secciones 21 a 21.3: Google Ads platform setup.
- `geox-docs-part3.md`, secciones 21.4 a 21.7: multi-cell, performance y best practices.

## 1. Timeline end-to-end: 7-14 semanas

La documentación agrupa el proceso completo en **7-14 semanas**. Las subfases operativas siguientes no tienen todas una duración independiente documentada; se encajan en las ventanas oficiales.

| Fase | Ventana documentada | Qué ocurre | Decisiones operativas |
|---|---:|---|---|
| Diseño | Hasta 2 semanas | Definir unidades geográficas, preparar datos pre-test, asignar geos, determinar cambios de presupuesto. | Bloquear treatment/control/go-dark/holdback en el fichero de diseño antes de tocar campañas. |
| Setup de plataforma | Hasta 2 semanas, dentro de planning/design | Preconfigurar geo-targeting a nivel campaña en todas las plataformas participantes. | Eliminar country targeting amplio; preparar positive targeting con los geo IDs del diseño. |
| Learning / warm-up | Dentro del active test period | "The first few weeks of the test period might be reserved for your campaign warm-up." En heavy-up, el learning period típico documentado es **4-5 días**. | Incluir el learning de heavy-up dentro del periodo de test; eliminar learning periods causados por duplicación del análisis final. |
| Flight / active test | 3-10 semanas | Ejecutar estrictamente la intervención en treatment geos y mantener BAU en control. | No mover geos entre grupos ni cambiar targeting regional durante el vuelo. |
| Cooldown | 2+ semanas junto con análisis | Recomendado si puede haber conversion lag: "highly recommended if the incremental effect of your campaigns could be delayed to after the test period due to the conversion lag". | Devolver treatment y control a BAU; los go-dark recuperan exposición. |
| Análisis | 2+ semanas junto con cooldown | Preparar series de pretest/test, excluir periodos no analizables y calcular resultados incrementales. | El pre-test debe ser al menos **3x** la duración del test. |

## 2. Tipos de estudio en Google Ads

| Tipo | Objetivo | Ejemplo oficial documentado |
|---|---|---|
| **Holdback** | Probar valor incremental net-new de introducir una línea, concepto creativo o canal. | Lanzar una estrategia Demand Gen nueva en ciertas regiones reteniéndola en control: "If the exposed regions show a statistically significant lift in sales, you have causal truth for the effect of adding Demand Gen to your ad strategy." |
| **Go-dark** | Validar contribución base de inversión existente. | Probar si "Always on YouTube" genera ventas incrementales o sólo captura conversiones orgánicas. |
| **Heavy-up** | Justificar escalado de presupuesto. | Incrementar spend de Performance Max en regiones de test para confirmar si los dólares adicionales siguen siendo rentables. |

## 3. Implementation paths

| Ruta | Cuándo aplica | Requisitos de datos documentados |
|---|---|---|
| **Google Ads UI** | Setup manual sin código; mejor para setups de una sola campaña. | **City IDs o ZIP codes** para targets internacionales no-USA; **DMA regions** para USA. |
| **Google Ads Editor** | Migración masiva de campañas y actualizaciones masivas de pujas y presupuestos. | No documentado en la fuente más allá del uso bulk. |
| **Google Ads API** | Automatización completa para frameworks de testing continuos y complejos. | **Control & test city IDs** para no-USA y **DMA** para USA; ZIP code targeting **no está soportado**. |

Nota: la fuente distingue GeoX open-source, implementado modificando campañas directamente en plataforma, de la beta separada de Google Ads "Set up Conversion Lift based on geography".

## 4. Setup single-cell

### 4.1 Holdback

1. Crear una campaña nueva.
2. Pausarla hasta el inicio del experimento.
3. Ir a **Settings > Locations**.
4. Eliminar cualquier targeting a nivel país.
5. Seleccionar **Enter another location > Advanced search > Add locations in bulk**.
6. Especificar país y pegar los **test geo IDs**.
7. En **Location options**, seleccionar **Presence** para evitar location leakage.
8. Asignar un presupuesto diario individual con tope duro, no vinculado a `shared budget`.
9. Despausar al inicio del experimento.

### 4.2 Go-dark: targeting only / uncapped budget

Usar esta ruta cuando el presupuesto no está constrained y basta con suprimir exposición mediante targeting.

1. Ir a **Settings > Locations**.
2. Eliminar targeting de país.
3. Pegar y targetear positivamente **sólo los control geo IDs**.
4. En **Location options**, seleccionar **Presence**.
5. Confirmar que la campaña **no** forma parte de ningún `shared budget`.

La fuente lo prioriza así: "Targeting-only is the most effective method to suppress spend."

### 4.3 Go-dark: capped budget / duplication and compression

Usar esta ruta cuando la campaña está budget-constrained. La razón documentada es: "In budget-constrained scenarios, removing test geos triggers immediate **budget shifting**, as the system redistributes unspent funds to control regions and **inflates the baseline**."

1. Duplicar la campaña activa.
2. Mantener la campaña duplicada go-dark **pausada durante todo el experimento** como placeholder.
3. En la campaña de control activa, ir a **Settings > Locations**.
4. Eliminar targeting de país.
5. Targetear positivamente sólo los **control geo IDs**.
6. En **Location options**, seleccionar **Presence**.
7. Fijar el presupuesto diario medio multiplicando el presupuesto diario actual por el porcentaje histórico de spend ocurrido en los control geos.
8. Confirmar que la campaña activa no usa `shared budget`.

### 4.4 Heavy-up: regional modifier / manual bidding / uncapped

Sólo válido para campañas con **manual bidding**, presupuestos uncapped y single-network.

1. Targetear ambos grupos, control y test.
2. Mantener control con **0%** de ajuste.
3. Aplicar en test un modifier positivo, por ejemplo **+50%**.

Restricción literal: "Location bid modifiers are **ignored by Smart Bidding and cross-network formats**."

### 4.5 Heavy-up: duplication

Ruta requerida para campañas con presupuesto limitado, `Smart Bidding` y formatos cross-network.

1. Duplicar campaña para separar brazo control y brazo heavy-up.
2. Campaña control: targetear sólo control geos y fijar presupuesto plano al run rate histórico.
3. Campaña heavy-up: targetear sólo test geos.
4. Si hay **capped budgets**, subir manualmente el presupuesto diario de la duplicada, por ejemplo **+50%** sobre su run rate histórico.
5. Si hay **uncapped budgets**, relajar targets de puja `Target CPA` o `Target ROAS` para forzar más gasto.

Restricción literal: "You can't run heavy-up using non-target Max Conversions or Maximize Conversion Value bidding with uncapped budgets."

## 5. Setup multi-cell same-publisher

Este patrón permite una celda control, una celda heavy-up y una celda go-dark en el mismo publisher sin crear una tercera campaña activa.

### 5.1 Preparación

1. Ir a **Campaigns**.
2. Duplicar la campaña activa.
3. Etiquetar las campañas para distinguir control y heavy-up, por ejemplo `Campaign_Control` y `Campaign_HeavyUp`.

### 5.2 Campaña control

1. Seleccionar **Settings** junto a la campaña de control.
2. Expandir **Locations**.
3. Seleccionar **Enter another location**.
4. Eliminar cualquier targeting a nivel país.
5. Targetear positivamente **sólo los control geos**.
6. Excluir explícitamente los geos **go-dark** y **heavy-up**.
7. En **Location options**, seleccionar **Presence**.
8. Fijar un presupuesto de campaña individual igual al run rate histórico de los control geos.

### 5.3 Campaña heavy-up

1. Seleccionar **Settings** junto a la campaña heavy-up.
2. Expandir **Locations**.
3. Seleccionar **Enter another location**.
4. Eliminar cualquier targeting a nivel país.
5. Targetear positivamente **sólo los heavy-up geos**.
6. Excluir explícitamente los geos **go-dark** y **control**.
7. En **Location options**, seleccionar **Presence**.
8. Gestionar la inyección de spend:
   - **Uncapped budgets**: bid modifier positivo, por ejemplo **+50%**, para manual bidding; o relajar tCPA/tROAS.
   - **Capped budgets**: incrementar el tope de presupuesto diario un **50%** respecto al run rate histórico.

Mecanismo documentado: "By explicitly **omitting and excluding go-dark geos from both active campaigns**, spend for those regions naturally suppresses to $0 **without the need to create a third active campaign**."

## 6. Setup multi-cell cross-publisher

### 6.1 Cross-platform parity

Antes del setup, garantizar:

- Mismas `conversion windows` en todas las plataformas.
- Misma lógica de exclusión de audiencias.
- Exactamente las mismas fronteras geográficas.
- Medición contra una fuente de datos **first-party**, independiente y no atribuida.
- Campaign types y goals comparables entre plataformas.

Cita literal: "Multi-cell cross-publisher tests require explicit **cross-platform parity**."

### 6.2 Lógica de enrutado de 3 celdas

| Celda | Rol |
|---|---|
| **Cell 1** | Brazo de supresión de Google: Google Ads va a oscuras. |
| **Cell 2** | Brazo de supresión externo: el publisher externo va a oscuras. |
| **Cell 3** | Control: ambos publishers operan a niveles estándar. |

Ejemplo operativo documentado:

| Campaign group | Geographic targeting setup | Intervención |
|---|---|---|
| Publisher A | Eliminar targeting nacional; targetear positivamente Treatment Cell 2 y Control. | Cell 1 va go-dark para Publisher A. |
| Publisher B | Eliminar targeting nacional; targetear positivamente Treatment Cell 1 y Control. | Cell 2 va go-dark para Publisher B. |

### 6.3 Targeting only / uncapped

1. Ir a **Campaigns**.
2. Seleccionar **Settings** junto a la campaña activa.
3. Expandir **Locations**.
4. Seleccionar **Enter another location**.
5. Eliminar cualquier targeting a nivel país.
6. Targetear positivamente **sólo los geo IDs asignados a Cell 2 y Cell 3**.
7. Excluir explícitamente los geo IDs de **Cell 1**.
8. En **Location options**, seleccionar **Presence** "to ensure **zero residual traffic leaks**".
9. Mantener presupuesto individual estándar y targets de eficiencia BAU planos.

Resultado esperado documentado: "Google spend in Cell 1 (Google suppression) naturally suppresses to **$0 with zero baseline distortion in Cells 2 and 3**."

### 6.4 Capped / duplication and compression

La fuente limita esta variante así: "The instructions for duplication and compression experiments assume a **budget-constrained** setup."

1. Ir a **Campaigns**.
2. Duplicar una campaña activa para aislar el spend.
3. Mantener la campaña duplicada go-dark **pausada durante todo el experimento**.
4. En la campaña de control activa, seleccionar **Settings**.
5. Expandir **Locations**.
6. Seleccionar **Enter another location**.
7. Eliminar todo targeting a nivel país.
8. Targetear positivamente los geo IDs de **Cell 2 y Cell 3**.
9. Excluir explícitamente los geo IDs de **Cell 1**.
10. En **Location options**, seleccionar **Presence** tanto para targeting como para exclusiones.
11. Ajustar manualmente los presupuestos diarios a la baja para igualar el run rate natural de los geos de control únicamente.
12. Ejemplo literal: "if Cell 2 and Cell 3 account for **70%** of spend, reduce the budget to **70%**".
13. Asegurar que la campaña no usa `shared budget`.

## 7. Geo-targeting

### 7.1 Presence obligatorio

Seleccionar explícitamente **Physical Presence: People located within your targeted locations**.

Evitar el default y **Presence or Interest**, porque el targeting por interés sirve impresiones fuera de los límites geo y contamina la medición.

### 7.2 Targeting positivo y exclusión explícita

- Eliminar targets nacionales amplios como "United Kingdom" o "United States" de todas las campañas del experimento.
- Añadir positive targeting sólo para los geos que deben exponerse.
- En setups multi-cell, excluir explícitamente las celdas que no deben recibir tráfico.
- La fuente recomienda positive targeting en vez de country targeting amplio más negative exclusions.

Cita literal: "Broad targeting can include users with less precise locations than the targeting resolution requires. Possibly biasing and contaminating the incrementality measurement."

### 7.3 Efecto de pasar de country a city/zip targeting

El cambio requerido desde country targeting a city o zip code targeting reduce el tráfico total, porque no todos los usuarios tienen granular location data determinable.

Cita literal: "switching from country to city or zip code targeting (as required) **will reduce overall traffic**, as granular location data can't be determined for all users."

## 8. Learning periods

### 8.1 Por qué la duplicación dispara learning

"Campaign duplication **triggers a learning period** because the newly duplicated campaign lacks baseline historical data, while the original campaign retains it."

### 8.2 Tratamiento en análisis

Instrucción literal: "**Remove the learning period from your final analysis.**"

### 8.3 Heavy-up

En heavy-up, factorizar el learning period típico de **4-5 días**, dependiente de campaña, y asegurarse de que queda **completamente dentro** del periodo de test.

### 8.4 Mitigaciones

- Duplicar campañas lo antes posible después de la fase de diseño.
- Esperar el número de semanas especificado para que las campañas tengan más probabilidad de converger.
- Limitar cambios durante el estudio.

## 9. Regla del 20%

Regla literal documentada: "Any budget change **greater than 20%** necessitates a new learning period, whereas **bid modifiers under 20%** can be applied without a severe learning reset."

Aplicación operativa:

- Cambios de presupuesto **>20%**: asumir nuevo `learning period`.
- `Bid modifiers` **<20%**: no disparan un reset severo documentado.
- Para cambios no documentados o combinaciones de cambios, tratarlos como riesgo de learning y escalarlos al equipo de medición.

## 10. Gestión avanzada de presupuesto

### 10.1 Labels obligatorios

Etiquetar campañas durante la modificación para seguimiento:

- `Control`
- `Heavy-up`
- `Go-dark`

### 10.2 Shared budgets y portfolio bidding

Regla documentada:

- Aplicar `shared budgets` y `portfolio bidding` **sólo a nivel de celda** y **dentro de una celda**.
- No compartir nunca estrategias o presupuestos con campañas de otras celdas.
- Separar campañas de estrategias existentes que no formen parte del test.
- Método recomendado para campañas con capped budgets.
- Nunca usarlo para go-dark tests.

Cita literal: "Should **ONLY** be applied uniquely **at cell level and within a cell**, never across campaigns in other cells."

### 10.3 Looker pacing dashboard

Mapear campaign labels al fichero de diseño GeoX en Looker para:

- Monitorizar spend pacing en tiempo real.
- Verificar estabilidad de control.
- Verificar fuga **$0** en go-dark.
- Detectar spend en geos excluidos.

Cita literal: "Map campaign labels to your GeoX design file in Looker to monitor **real-time spend pacing and control stability**, including to **verify $0 go-dark leakage**."

## 11. Protocolos de cooldown

### 11.1 Reset de treatment

Durante el cooldown post-experimento, devolver inmediatamente campañas treatment a presupuestos **BAU** tanto para go-dark como para heavy-up.

Cita literal: "advertisers should **immediately revert the treatment arm campaigns to their 'business as usual' (BAU) budgets** for both go-dark and heavy-up tactics."

### 11.2 Holdback

Si la táctica testada fue holdback, detener la campaña por completo después del test.

Cita literal: "If the tested tactic was a **holdback, completely stop the campaign post-test**."

### 11.3 Go-dark

Prohibición literal: "**Don't increase the campaign budget under any circumstances for go-dark tactics during cooldown.**"

## 12. Best practices

### 12.1 Test limpio

- Monitorizar lanzamientos regionales relevantes durante el test.
- Excluir proactivamente regiones con lanzamientos regionales que puedan sesgar resultados.
- Asegurar que no hay otro regional testing del cliente, incluido offline testing.
- Evitar user-level measurements paralelos como Brand Lift, Search Lift o Conversion Lift sobre campañas incluidas en el GeoX study.

### 12.2 Seguir best practices de campaña

La fuente resume: "Your test is as efficient as the campaigns you run."

Aplicar guidelines específicas del tipo de campaña:

- Demand Gen: guidelines Demand Gen documentadas por Google Ads.
- Performance Max: guidelines PMax documentadas por Google Ads.

### 12.3 Limitar cambios

"Maintain a stable test environment by limiting changes during the study. **Ideally, avoid all changes to prevent introducing noise.**"

### 12.4 Geos excluidos y presupuesto BAU

Al duplicar campañas, los geos excluidos del experimento pueden no recibir BAU budget.

Cita literal: "**excluded geos from your experiment will not receive BAU budget when duplicating campaigns**."

Acciones documentadas:

- Usar campaign labels y Looker para comprobar spend en esas regiones.
- Considerar iniciar una campaña BAU aparte para mantener prioridades comerciales y regional sales.
- Vigilar exclusiones orgánicas por selección manual o geo mismatch durante geo-unit mapping.

### 12.5 Pretest mínimo

Regla literal: "**Pre-test data must be at least 3 times the duration of the test period.**"

### 12.6 Ruido de datos

Si hay outages web/app o ruido similar que pueda impactar el KPI primario, considerar retirar esa fecha del análisis final.

## 13. Checklist de activación

### 13.1 Pre-lanzamiento

- [ ] Confirmar tipo de estudio: holdback, go-dark o heavy-up.
- [ ] Confirmar un único KPI primario definido antes del lanzamiento.
- [ ] Confirmar que el KPI se mide con conversion events raw sin filtrar, no conversiones atribuidas.
- [ ] Confirmar que el pretest disponible es al menos **3x** la duración del test.
- [ ] Confirmar que la ventana de test cubre al menos un ciclo de compra.
- [ ] Confirmar que las geo units del diseño son compatibles con todas las plataformas participantes.
- [ ] Confirmar que el fichero de diseño contiene control, treatment, heavy-up, go-dark o holdback según aplique.
- [ ] Confirmar que no hay campañas del estudio inscritas en Brand Lift, Search Lift, Conversion Lift u otros holdouts solapados.
- [ ] Confirmar que no hay regional testing cliente/offline solapado; si lo hay, excluir regiones afectadas del diseño.
- [ ] Eliminar country targeting amplio de las campañas del experimento.
- [ ] Cargar positive targeting sólo con geo IDs permitidos por el diseño.
- [ ] Seleccionar **Presence** en Location options.
- [ ] Evitar **Presence or Interest**.
- [ ] En multi-cell, excluir explícitamente las celdas que deben quedar sin exposición.
- [ ] Etiquetar campañas como `Control`, `Heavy-up` o `Go-dark`.
- [ ] Verificar que `shared budget` y `portfolio bidding` sólo existen intra-celda, nunca entre celdas.
- [ ] Verificar que ningún go-dark test usa `shared budget`.
- [ ] Mapear labels al fichero de diseño en Looker.
- [ ] Si se duplican campañas, duplicarlas lo antes posible tras diseño y planificar learning/convergencia.

### 13.2 Durante el vuelo

- [ ] Verificar en Looker spend pacing en tiempo real.
- [ ] Verificar estabilidad de control.
- [ ] Verificar fuga **$0** en geos go-dark.
- [ ] Verificar que los geos excluidos no reciben spend inesperado o documentar si requieren campaña BAU aparte.
- [ ] No añadir geos nuevos a treatment durante el test.
- [ ] No eliminar geos de bajo rendimiento de ningún grupo.
- [ ] No intercambiar regiones de control a treatment.
- [ ] Evitar cambios de campaña; idealmente no hacer ninguno.
- [ ] Si un cambio de presupuesto supera el **20%**, marcar nuevo `learning period`.
- [ ] Mantener el learning heavy-up de **4-5 días** dentro del periodo de test.
- [ ] Documentar outages web/app o ruido que pueda afectar el KPI.

### 13.3 Post-test y cooldown

- [ ] Devolver inmediatamente treatment campaigns a presupuestos BAU.
- [ ] En holdback, detener la campaña por completo después del test.
- [ ] En go-dark, no subir presupuesto durante cooldown bajo ninguna circunstancia.
- [ ] Restaurar exposición BAU en geos go-dark durante cooldown si aplica.
- [ ] Excluir learning periods causados por duplicación del análisis final.
- [ ] Considerar retirar fechas con outages o ruido significativo del análisis final.
- [ ] Confirmar que timestamps de inicio, fin y cooldown quedaron sincronizados entre plataformas.
