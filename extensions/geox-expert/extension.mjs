// Extension: geox-expert
// Agente experto en Google Meridian GeoX (geo-experimentos de incrementalidad)
// para proyectos WPP Media / Meliá Hotels International.
//
// Inyecta conocimiento especializado de GeoX y expone herramientas de referencia
// rápida para el workflow end-to-end: diseño → activación → análisis → calibración MMM.
//
// IMPORTANTE: GeoX NO es Meridian MMM. Son librerías distintas y complementarias.

import { joinSession } from "@github/copilot-sdk/extension";

// --- Contexto base que se inyecta en cada sesión ---
const GEOX_SYSTEM_CONTEXT = `
## Experto en Google Meridian GeoX — Contexto del proyecto

Eres un experto en **Google Meridian GeoX**, la librería open-source de Google para
**diseño y análisis de geo-experimentos de incrementalidad**. Trabajas en el repositorio
**WPPOpen/advanced_analytics_melia** de WPP Media para Meliá Hotels International.

### ⚠️ GeoX NO es Meridian MMM
Son dos librerías distintas y complementarias:
- **Meridian MMM** (\`google-meridian\`): \`from meridian.model import model\` — MMM bayesiano con MCMC sobre TensorFlow Probability.
- **Meridian GeoX** (\`meridian-geox\`): \`import meridian_geox as geox\` — geo-experimentos sobre **JAX**, sin MCMC.
El puente entre ambas es \`CalibrationBuilder\`: el \`AnalysisResult\` de GeoX se convierte en priors de ROI del MMM.

### Ubicación en el repositorio
- Skill: \`skills/meridian-geox/SKILL.md\` + \`skills/meridian-geox/references/\` (9 documentos)
- Proyectos: \`projects/geo-experiments/<cliente>-<año>/\`
- Plantilla informe: \`analysis/geo-experiments/templates/geox_report_template_branded.html\`
- Base de conocimiento: \`docs/setup/meridian-geox-knowledge.md\`
- Skill hermana (MMM): \`skills/meridian-mmm/SKILL.md\`

### Import correcto (API real)
\`\`\`python
import datetime
import pandas as pd
import meridian_geox as geox
\`\`\`
Símbolos: \`run_design\`, \`compare_designs\`, \`concat_design_reports\`, \`plot_design\`,
\`analyze\`, \`plot_analysis\`, \`check_design_data_quality\`, \`check_analysis_data_quality\`,
\`DesignConfig\`, \`Constraints\`, \`Budget\`, \`Design\`, \`DesignSet\`, \`AnalysisConfig\`,
\`AnalysisResult\`, \`AnalysisMetrics\`, \`Estimate\`, \`DataSchema\`, \`QualityCheckConfig\`,
\`QualityCheckResult\`, \`ExperimentType\`, \`Methodology\`, \`GeoAssignmentRule\`, \`TestType\`, \`GeoGroup\`.

### ⚠️ Tres errores verificados contra meridian-geox 1.0.0
1. **Las constantes de columna están en \`geox.api\`, NO en \`geox.DataSchema\`.**
   \`geox.DataSchema\` es un modelo **pandera** de validación y NO expone \`.DATE\`/\`.LOCATION\`.
   Correcto: \`geox.api.DATE\`, \`geox.api.LOCATION\`, \`geox.api.CONVERSIONS\`, \`geox.api.SPEND\`,
   \`geox.api.CELL_1\`, \`geox.api.MULTICELL_SPEND_REGEX\`. O literales \`'date'\`, \`'location'\`,
   \`'conversions'\`, \`'spend'\` como hacen los notebooks oficiales.
2. **\`check_design_data_quality\` requiere 3 argumentos**:
   \`check_design_data_quality(data, design_config, quality_check_config)\`.
   Igual \`check_analysis_data_quality(data, analysis_config, quality_check_config)\`.
3. **No existe \`AnalysisResult.metrics\`.** Las métricas se obtienen **por celda**:
   \`result.results['cell_1']\` → \`AnalysisMetrics\` con \`.lift\`, \`.percent_lift\`, \`.icpd\`
   (todos \`Estimate\` con point_estimate/lower_bound/upper_bound/standard_deviation/p_value),
   más \`.cumulative_lift\`, \`.cumulative_icpd\`, \`.counterfactual_conversions\`,
   \`.pointwise_difference\` (DataFrames) y \`.descriptive_metrics.estimated_bau_spend\`.

### ⚠️ Dependencia no declarada
\`meridian-geox\` 1.0.0 importa \`absl.logging\` pero **no declara \`absl-py\`**.
Si falla con \`ModuleNotFoundError: No module named 'absl'\`, ejecutar \`pip install absl-py\`.

### Workflow end-to-end (7 fases)
1. Datos pretest: serie DIARIA por geo (\`date, location, conversions[, spend|spend_cell_k]\`), ≥3× duración del test
2. \`geox.run_design(data, design_config, constraints)\` → \`DesignSet\` rankeado
3. Revisar \`design_metrics\` (mde, budget, design_implied_cpic, r2, p_value AA) + \`plot_design\`
4. \`selected_design.export_to_json()\` → **CONGELAR el diseño** antes de activar
5. Activación en plataforma (targeting por Presence, exclusión de geos, labels)
6. \`geox.analyze(data, analysis_config)\` → \`AnalysisResult\` + \`plot_analysis\`
7. Opcional: \`CalibrationBuilder\` → priors de ROI para Meridian MMM

### Avisos críticos anti-alucinación
- El paquete es **plano**: no existen subpaquetes \`design/\` ni \`analysis/\`.
- Solo **TBR** está soportada. El enum tiene \`TBR\` y \`SDID\`, pero la FAQ solo reconoce TBR. No existe \`SYNTHETIC_CONTROL\`.
- **\`GBR\` y \`trimmed match\` NO pertenecen a esta librería.** La única referencia legacy es TBRMM.
- \`design_scorer\` está declarado pero NO implementado (\`del design_scorer\`).
- Defaults reales: \`alpha=0.1\` (**CI 90%**, no 95%), \`power=0.8\`, \`min_r2=0.8\`, \`max_conversions_percent=0.3\` (<0.5), \`n_top_placebos=500\`, \`min_placebo_r2=0.6\`, \`num_strata=4\`, \`seed=42\`.
- **Series semanales prohibidas.** Granularidad diaria obligatoria.
- \`conversions\` debe ser absoluta, sin negativos, raw sin atribuir. Ratios como ROAS NO soportados.

### Semántica de Budget por tipo de experimento
- \`HOLDBACK\`: \`Budget(budget=500000)\` — importe absoluto de la nueva campaña
- \`HEAVY_UP\`: \`Budget(budget_pct=0.5)\` — **positivo** (default +1.0)
- \`GO_DARK\`: \`Budget(budget_pct=-1.0)\` apagado total, \`-0.5\` go-dim — **negativo** (default -1.0)
Exactamente uno de \`budget\` o \`budget_pct\`, nunca ambos.

### Convenciones del repositorio
- Cada proyecto en \`projects/geo-experiments/<cliente>-<año>/\` debe ser autosuficiente
- Ficheros principales: \`run_design.py\`, \`run_analysis.py\`, \`run_calibration.py\`
- \`outputs/design.json\` es el artefacto crítico: congelar antes del test, versionar en git, NO modificar después
- Código autocomentado en español, docstrings, comentarios de bloque por fase
- Reportes: HTML standalone branded (paleta WPP Media) + PDF
- Commits: conventional commits (feat:, fix:, refactor:, docs:)

### Paleta WPP Media (obligatoria en gráficos)
NAVY='#000050', LIME='#B0F467', BLUE='#5465FF', PERIWINK='#788BFF',
TEAL='#00DBEE', ROJO='#E84B4B', VERDE='#2DB87A', GRIS='#6B7093'
Convención GeoX: observado=NAVY, contrafactual=BLUE discontinuo, banda CI=PERIWINK alpha .25,
treatment=LIME, control=TEAL, excluidos=GRIS.
`;

// --- Contextos adicionales por tema detectado en el prompt ---
const TOPIC_CONTEXTS = {
    design: `
Tema detectado: DISEÑO del experimento. Recuerda:
- El DesignSet ya viene rankeado; el primer elemento es el mejor.
- Verifica siempre el p-value del test A/A antes de aceptar un diseño.
- MDE, budget y design_implied_cpic son las tres métricas núcleo y están acopladas.
- Consulta skills/meridian-geox/references/design-guide.md`,

    analysis: `
Tema detectado: ANÁLISIS post-experimento. Recuerda:
- Hay que usar EXACTAMENTE el mismo Design congelado que se ejecutó en plataforma.
- Verifica el número de placebos válidos (warning <100, ERROR <10).
- El CI por defecto es del 90% (alpha=0.1), no del 95%.
- Consulta skills/meridian-geox/references/analysis-guide.md`,

    data: `
Tema detectado: DATOS y calidad. Recuerda:
- Granularidad diaria obligatoria; las series semanales se rechazan.
- Pretest ≥ 3× duración del test; geos ≥ 2*(cell_count+1).
- conversions absolutas, sin negativos, raw sin atribuir.
- Consulta skills/meridian-geox/references/data-requirements.md`,

    activation: `
Tema detectado: ACTIVACIÓN en plataforma. Recuerda:
- Targeting por Presence, nunca "presence or interest".
- Los learning periods deben excluirse del análisis final.
- Cambios de presupuesto >20% disparan nuevo learning period.
- Shared budgets y portfolio bidding: solo intra-celda, nunca entre celdas, nunca en go-dark.
- Consulta skills/meridian-geox/references/google-ads-implementation.md`,

    calibration: `
Tema detectado: CALIBRACIÓN del MMM. Recuerda:
- CalibrationBuilder.with_meridian_geox_experiment_result() acepta el AnalysisResult directamente.
- Mapeo: mu <- metrics.icpd.point_estimate, sigma <- metrics.icpd.standard_deviation,
  spend <- metrics.descriptive_metrics.estimated_bau_spend.
- Ajustes: spend, recencia (half-life 52 semanas) y duración (adstock capture proportion).
- Consulta skills/meridian-geox/references/mmm-calibration.md`,

    troubleshooting: `
Tema detectado: TROUBLESHOOTING. Recuerda:
- min_r2 puede relajarse 0.8 → 0.75 → 0.70, documentando la razón.
- Palancas ante un MDE inalcanzable: duración, tipo de experimento, max_conversions_percent,
  num_strata, geo_assignment_rule, KPI más superficial, presupuesto.
- Consulta skills/meridian-geox/references/troubleshooting-glossary.md`,
};

/** Detecta si el prompt está relacionado con GeoX o geo-experimentos. */
function isGeoXRelated(prompt) {
    if (!prompt) return false;
    const lower = prompt.toLowerCase();
    return /geox|geo.?experiment|geo.?test|geo.?lift|holdback|go.?dark|heavy.?up|go.?dim|incrementalidad|incremental(ity)?|treatment geo|control geo|\bmde\b|minimum detectable|run_design|designconfig|analysisconfig|time.?based regression|\btbr\b|placebo|icpd|iroas|cpic/.test(lower);
}

/** Clasifica el prompt en uno de los temas con contexto adicional. */
function detectTopic(prompt) {
    const lower = prompt.toLowerCase();
    if (lower.match(/calibra|prior|roi_m|mmm|meridian mmm|calibrationbuilder/))
        return "calibration";
    if (lower.match(/google ads|campa|targeting|presence|learning period|cooldown|activa|traffick|pacing|looker/))
        return "activation";
    if (lower.match(/dato|data|csv|columna|schema|calidad|quality|outlier|nan|sparsit|semanal|diari/))
        return "data";
    if (lower.match(/analiz|analysis|analyze|resultado|placebo|p.?value|lift|significa|icpd|iroas/))
        return "analysis";
    if (lower.match(/problema|error|falla|no sale|troubleshoot|r2|r.?cuadrado|no significativ|demasiado alto/))
        return "troubleshooting";
    if (lower.match(/dise|design|mde|potencia|power|presupuesto|budget|estrat|geo.?assign|celda|cell/))
        return "design";
    return null;
}

const session = await joinSession({
    tools: [
        {
            name: "geox_workflow_reference",
            description:
                "Devuelve la referencia del workflow end-to-end de Meridian GeoX con el API real (código Python ejecutable). Usar cuando necesites recordar el orden de pasos, los parámetros exactos o las clases involucradas en un geo-experimento.",
            parameters: {
                type: "object",
                properties: {
                    step: {
                        type: "string",
                        description:
                            "Paso concreto a consultar: 'data', 'quality', 'design', 'compare', 'plot_design', 'export', 'analyze', 'plot_analysis', 'calibration'. Omitir para obtener el workflow completo.",
                    },
                },
            },
            skipPermission: true,
            handler: async (args) => {
                const steps = {
                    data: `## Paso 1: Preparar los datos pretest

Formato largo, una fila por (date, location), **granularidad diaria obligatoria**.

\`\`\`python
import pandas as pd
import meridian_geox as geox

# Single-cell: date, location, conversions [, spend]
design_data = pd.read_csv('data/pretest.csv')

# Renombrar al esquema esperado por la librería
# OJO: las constantes viven en geox.api, NO en geox.DataSchema (que es pandera).
design_data = design_data.rename(columns={
    'fecha': geox.api.DATE,
    'mercado': geox.api.LOCATION,
    'reservas': geox.api.CONVERSIONS,
    'inversion': geox.api.SPEND,
})
design_data[geox.api.DATE] = pd.to_datetime(design_data[geox.api.DATE])
design_data[geox.api.LOCATION] = design_data[geox.api.LOCATION].astype(str)
\`\`\`

**Reglas duras:**
- Pretest ≥ **3 × duración del test** (ideal 6N o 1 año con estacionalidad fuerte)
- Geos ≥ \`2 * (cell_count + 1)\`
- \`conversions\` absoluta, sin negativos, raw sin atribuir. Ratios (ROAS) NO soportados
- \`spend\` obligatorio en GO_DARK y HEAVY_UP; opcional en HOLDBACK
- Multi-cell: una columna \`spend_cell_1\`, \`spend_cell_2\`… por celda
- **Series semanales rechazadas** ('Weekly patterns are not supported.')`,

                    quality: `## Paso 2: Chequeos de calidad

\`\`\`python
quality_config = geox.QualityCheckConfig(
    exclude_geos_no_response=True,   # solo aplica en diseño
    exclude_outlier_dates=True,      # diseño y análisis
)

quality_result = geox.check_design_data_quality(design_data, design_config, quality_config)
print(quality_result)   # si sale vacío, no se detectaron geos ni fechas outlier
\`\`\`

⚠️ Requiere **3 argumentos**: \`(data, design_config, quality_check_config)\`.

Umbrales: sparsity 30% de días ausentes (warning), zero-conversions 50% (warning),
cardinalidad 500 geos únicos (warning). Detección de fechas outlier por leave-one-out + IQR.

En la fase de análisis el equivalente es \`geox.check_analysis_data_quality(...)\`.`,

                    design: `## Paso 3: Generar el diseño

\`\`\`python
import datetime

design_config = geox.DesignConfig(
    experiment_duration=datetime.timedelta(days=28),
    experiment_types=geox.ExperimentType.HEAVY_UP,
    methodology=geox.Methodology.TBR,
    geo_assignment_rule=geox.GeoAssignmentRule.STRATIFIED_SAMPLING,
    design_output_count=5,
    # Defaults relevantes: alpha=0.1 (CI 90%), power=0.8, min_r2=0.8,
    # n_candidates=100_000, n_ranked_candidates=100, num_strata=4, seed=42
)

constraints = geox.Constraints(
    budget_constraint=geox.Budget(budget_pct=0.5),   # HEAVY_UP -> POSITIVO
    excluded_geos={'CEUTA', 'MELILLA'},
    max_conversions_percent=0.3,                      # debe ser < 0.5
)

design_set = geox.run_design(design_data, design_config, constraints)
print(design_set.design_metrics)
# columnas: design_id, cell, design_methodology, r2, mde, mde_abs,
#           'p_value (AA)', budget, design_implied_cpic,
#           treatment_conversions_pct, treatment_geo_count
\`\`\`

**Multi-cell budget-neutral** (go-dark + heavy-up con control común):

\`\`\`python
design_config = geox.DesignConfig(
    experiment_duration=datetime.timedelta(days=28),
    cell_count=2,
    experiment_types={
        'cell_1': geox.ExperimentType.GO_DARK,
        'cell_2': geox.ExperimentType.HEAVY_UP,
    },
)
constraints = geox.Constraints(budget_constraint={
    'cell_1': geox.Budget(budget_pct=-1.0),   # GO_DARK -> NEGATIVO
    'cell_2': geox.Budget(budget_pct=0.5),    # HEAVY_UP -> POSITIVO
})
\`\`\``,

                    compare: `## Paso 3b: Comparar diseños alternativos

\`\`\`python
# Comparar varias combinaciones (config, constraints) sobre los mismos datos
design_set = geox.compare_designs(
    design_data,
    design_requirements=[
        (config_28d, constraints_a),
        (config_42d, constraints_b),
    ],
    design_output_count=10,
)

# O concatenar DesignSets ya calculados y quedarse con los mejores N
combined = geox.concat_design_reports([design_set_a, design_set_b], design_output_count=10)
\`\`\``,

                    plot_design: `## Paso 4: Validar visualmente el diseño

\`\`\`python
selected_id = next(iter(design_set.designs))     # el DesignSet ya viene rankeado
selected_design = design_set.designs[selected_id]

geox.plot_design(selected_design)   # alineamiento pretest treatment vs control, por celda

for cell, per_cell in selected_design.designs.items():
    print(cell,
          'MDE:', per_cell.minimum_detectable_effect,
          'budget:', per_cell.budget,
          'CpIC:', per_cell.design_implied_cpic,
          'p(AA):', per_cell.p_value,
          'geos:', len(per_cell.treatment_geos))
\`\`\`

**Criterio de aceptación:** MDE por debajo del efecto que el negocio considera relevante,
R² ≥ min_r2, y p-value del test A/A **no** significativo.`,

                    export: `## Paso 5: Congelar el diseño (CRÍTICO)

\`\`\`python
with open('outputs/design.json', 'w', encoding='utf-8') as f:
    f.write(selected_design.export_to_json())
\`\`\`

El diseño debe congelarse **antes** de activar el test y **no puede modificarse después**.
El análisis tiene que usar exactamente el mismo objeto \`Design\`, porque la inferencia por
placebos reproduce el mecanismo de asignación de ese diseño concreto. Analizar con otro
diseño invalida los p-values.

Versionar \`outputs/design.json\` en git siempre.`,

                    analyze: `## Paso 6: Analizar los resultados

\`\`\`python
with open('outputs/design.json', encoding='utf-8') as f:
    design = geox.Design.load_from_json(f.read())

analysis_data = pd.read_csv('data/posttest.csv')

analysis_config = geox.AnalysisConfig(
    design=design,
    analysis_start_date=pd.Timestamp('2026-05-01'),
    analysis_end_date=pd.Timestamp('2026-05-28'),
    pretest_end_date=pd.Timestamp('2026-04-30'),   # opcional; si no, todo lo anterior
    excluded_dates={pd.Timestamp('2026-05-12')},   # p.ej. learning period o incidencia
    # Defaults: n_placebo_candidates=100_000, n_top_placebos=500,
    #           min_placebo_r2=0.6, warning<100 placebos, ERROR<10
)

result = geox.analyze(analysis_data, analysis_config)
\`\`\`

El análisis también requiere **≥3N fechas de pretest**.`,

                    plot_analysis: `## Paso 7: Visualizar e interpretar

\`\`\`python
geox.plot_analysis(result)   # 4-plot suite con timelines divididos pretest/test

# Las métricas se obtienen POR CELDA desde result.results.
# NO existe result.metrics.
metrics = result.results['cell_1']               # AnalysisMetrics

print(metrics.lift.point_estimate, metrics.lift.p_value)      # efecto absoluto
print(metrics.percent_lift.point_estimate)                    # efecto relativo
print(metrics.icpd.point_estimate)                            # coste por conversión incremental
print(metrics.icpd.standard_deviation)
print(metrics.descriptive_metrics.estimated_bau_spend)

# Series acumuladas día a día (DataFrames)
print(metrics.cumulative_lift.tail())     # columnas: lift, lower_bound, upper_bound
print(metrics.cumulative_icpd.tail())     # columnas: icpd, lower_bound, upper_bound
\`\`\`

**Antes de comunicar:**
- Revisar \`QualityCheckResult\` del análisis
- Verificar nº de placebos válidos (warning <100, ERROR <10)
- Reportar el CI indicando su nivel real: **90%** con \`alpha=0.1\``,

                    calibration: `## Paso 8 (opcional): Calibrar priors de Meridian MMM

El \`AnalysisResult\` de GeoX alimenta directamente el \`CalibrationBuilder\` de Meridian MMM.

Mapeo automático (\`metrics = result.results['cell_1']\`):
| Meridian MMM | ← GeoX |
|---|---|
| \`mu_exp\` | \`metrics.icpd.point_estimate\` |
| \`sigma_exp\` | \`metrics.icpd.standard_deviation\` |
| spend del experimento | \`metrics.descriptive_metrics.estimated_bau_spend\` |
| fechas | \`analysis_config.analysis_start_date\` / \`analysis_end_date\` |

Ajustes aplicados: **spend** (τ=(1-r)/r), **recencia** (half-life 52 semanas) y
**duración** (adstock capture proportion; defaults geometric, alpha=0.5, max_lag=8).
Después: fusión bayesiana de N experimentos y ajuste paramétrico (LogNormal/Gamma/Normal)
minimizando cross-entropy → \`CalibratedPriors.priors.roi_m\`.

Ver \`skills/meridian-geox/references/mmm-calibration.md\` para el detalle y las fórmulas.`,
                };

                if (args.step && steps[args.step]) {
                    return steps[args.step];
                }

                return Object.values(steps).join("\n\n---\n\n");
            },
        },

        {
            name: "geox_design_config_builder",
            description:
                "Genera un DesignConfig y unos Constraints válidos de Meridian GeoX a partir de parámetros de negocio, validando la semántica del presupuesto según el tipo de experimento (positivo en HEAVY_UP, negativo en GO_DARK, absoluto en HOLDBACK). Usar antes de escribir el código de un diseño nuevo.",
            parameters: {
                type: "object",
                properties: {
                    experiment_type: {
                        type: "string",
                        description: "Tipo de experimento: 'holdback', 'go_dark', 'heavy_up'. En multi-celda, lista separada por comas en orden de celda, ej: 'go_dark,heavy_up'.",
                    },
                    duration_days: {
                        type: "string",
                        description: "Duración del test en días, ej: '28'. Debe cubrir al menos un ciclo de compra.",
                    },
                    budget: {
                        type: "string",
                        description: "Presupuesto. Para holdback, importe absoluto (ej: '100000'). Para go_dark/heavy_up, porcentaje decimal con signo (ej: '-1.0' apagado total, '0.5' para +50%). En multi-celda, lista separada por comas en orden de celda.",
                    },
                    excluded_geos: {
                        type: "string",
                        description: "Geografías a excluir, separadas por comas. Opcional.",
                    },
                },
                required: ["experiment_type", "duration_days"],
            },
            skipPermission: true,
            handler: async (args) => {
                const {
                    experiment_type,
                    duration_days,
                    budget = "",
                    excluded_geos = "",
                } = args;

                const types = experiment_type
                    .split(",")
                    .map((t) => t.trim().toUpperCase().replace(/[-\s]/g, "_"));
                const budgets = budget ? budget.split(",").map((b) => b.trim()) : [];
                const cellCount = types.length;

                const VALID = ["HOLDBACK", "GO_DARK", "HEAVY_UP"];
                const invalid = types.filter((t) => !VALID.includes(t));
                if (invalid.length) {
                    return `❌ Tipo de experimento no válido: ${invalid.join(", ")}.\nValores admitidos: HOLDBACK, GO_DARK, HEAVY_UP.\nNota: 'go-dim' no es un tipo propio — es un GO_DARK con budget_pct parcial (ej: -0.5).`;
                }

                // --- Validación de la semántica de Budget por tipo de experimento ---
                const avisos = [];
                const budgetExprs = types.map((t, i) => {
                    const raw = budgets[i] ?? budgets[0] ?? null;
                    if (raw === null) {
                        if (t === "GO_DARK") {
                            avisos.push(`cell_${i + 1} (GO_DARK): sin presupuesto indicado → se usará el default budget_pct=-1.0 (apagado total).`);
                            return "geox.Budget(budget_pct=-1.0)";
                        }
                        if (t === "HEAVY_UP") {
                            avisos.push(`cell_${i + 1} (HEAVY_UP): sin presupuesto indicado → se usará el default budget_pct=+1.0 (+100%).`);
                            return "geox.Budget(budget_pct=1.0)";
                        }
                        avisos.push(`cell_${i + 1} (HOLDBACK): sin presupuesto indicado. Debes fijar un importe absoluto con Budget(budget=...).`);
                        return "geox.Budget(budget=<IMPORTE>)";
                    }

                    const num = parseFloat(raw);
                    if (Number.isNaN(num)) {
                        avisos.push(`cell_${i + 1}: presupuesto '${raw}' no es numérico.`);
                        return "geox.Budget(budget=<IMPORTE>)";
                    }

                    if (t === "HOLDBACK") {
                        if (num <= 0) avisos.push(`⚠️ cell_${i + 1} (HOLDBACK): el presupuesto debe ser un importe absoluto positivo.`);
                        return `geox.Budget(budget=${num})`;
                    }
                    if (t === "GO_DARK") {
                        if (num >= 0) {
                            avisos.push(`❌ cell_${i + 1} (GO_DARK): budget_pct debe ser NEGATIVO. Recibido ${num} → corregido a ${-Math.abs(num)}.`);
                        }
                        const v = -Math.abs(num);
                        if (v > -1) avisos.push(`ℹ️ cell_${i + 1}: budget_pct=${v} es un **go-dim** (apagado parcial), no un go-dark total.`);
                        return `geox.Budget(budget_pct=${v})`;
                    }
                    // HEAVY_UP
                    if (num <= 0) {
                        avisos.push(`❌ cell_${i + 1} (HEAVY_UP): budget_pct debe ser POSITIVO. Recibido ${num} → corregido a ${Math.abs(num)}.`);
                    }
                    return `geox.Budget(budget_pct=${Math.abs(num)})`;
                });

                const dur = parseInt(duration_days, 10);
                if (Number.isNaN(dur) || dur <= 0) {
                    return `❌ duration_days debe ser un entero positivo. Recibido: '${duration_days}'.`;
                }
                avisos.push(`📏 Con ${dur} días de test necesitas **≥ ${dur * 3} fechas** de pretest (regla 3N). Recomendado: ${dur * 6} o un año completo si hay estacionalidad fuerte.`);
                avisos.push(`🗺️ Necesitas al menos **${2 * (cellCount + 1)} geos** tras exclusiones (2 × (cell_count + 1)). Óptimo: 50-100+.`);

                const needsSpend = types.some((t) => t === "GO_DARK" || t === "HEAVY_UP");
                if (needsSpend) {
                    avisos.push(`💰 Al usar ${types.filter((t) => t !== "HOLDBACK").join("/")}, la columna de spend es **obligatoria** en los datos.` +
                        (cellCount > 1 ? ` En multi-celda: una columna \`spend_cell_1\`…\`spend_cell_${cellCount}\` por celda.` : ""));
                }

                const excluded = excluded_geos
                    .split(",")
                    .map((g) => g.trim())
                    .filter(Boolean);

                // --- Construcción del bloque de código ---
                const typesExpr =
                    cellCount === 1
                        ? `geox.ExperimentType.${types[0]}`
                        : `{\n${types.map((t, i) => `        'cell_${i + 1}': geox.ExperimentType.${t},`).join("\n")}\n    }`;

                const budgetExpr =
                    cellCount === 1
                        ? budgetExprs[0]
                        : `{\n${budgetExprs.map((b, i) => `        'cell_${i + 1}': ${b},`).join("\n")}\n    }`;

                const excludedLine = excluded.length
                    ? `\n    excluded_geos={${excluded.map((g) => `'${g}'`).join(", ")}},`
                    : "";

                return `## DesignConfig y Constraints generados

\`\`\`python
import datetime
import meridian_geox as geox

design_config = geox.DesignConfig(
    experiment_duration=datetime.timedelta(days=${dur}),${cellCount > 1 ? `\n    cell_count=${cellCount},` : ""}
    experiment_types=${typesExpr},
    methodology=geox.Methodology.TBR,
    geo_assignment_rule=geox.GeoAssignmentRule.STRATIFIED_SAMPLING,
    design_output_count=10,
    # Defaults aplicados implícitamente:
    #   alpha=0.1 (CI del 90%), power=0.8, test_type=TWO_SIDED,
    #   min_r2=0.8, slope_tolerance=0.2, num_strata=4, k_means_iterations=10,
    #   n_candidates=100_000, n_ranked_candidates=100, seed=42
)

constraints = geox.Constraints(
    budget_constraint=${budgetExpr},${excludedLine}
    max_conversions_percent=0.3,   # debe ser < 0.5
)

design_set = geox.run_design(design_data, design_config, constraints)
print(design_set.design_metrics)
\`\`\`

## Validaciones y avisos

${avisos.map((a) => `- ${a}`).join("\n")}

## Siguiente paso
Revisa \`design_metrics\` (mde, budget, design_implied_cpic, r2, 'p_value (AA)'),
valida con \`geox.plot_design(...)\` y **congela** el diseño con \`export_to_json()\`
antes de activar nada en plataforma.`;
            },
        },

        {
            name: "geox_pitfalls",
            description:
                "Devuelve los errores frecuentes, trampas y defaults reales de Meridian GeoX. Usar SIEMPRE antes de escribir código GeoX para evitar API inventada o supuestos incorrectos.",
            parameters: {
                type: "object",
                properties: {
                    topic: {
                        type: "string",
                        description:
                            "Tema: 'api' (API inexistente), 'defaults' (valores por defecto reales), 'data' (reglas de datos), 'budget' (semántica de presupuesto), 'analysis' (trampas del análisis), 'terminology' (términos que no pertenecen a GeoX). Omitir para todos.",
                    },
                },
            },
            skipPermission: true,
            handler: async (args) => {
                const pitfalls = {
                    api: `## ❌ API que NO existe en meridian_geox

- **No hay subpaquetes** \`meridian_geox.design\` ni \`meridian_geox.analysis\` como namespaces de clases. El paquete es **plano**: \`api.py\`, \`design.py\`, \`analysis.py\`, \`generate_candidates.py\`, \`validation.py\`, \`util.py\`, + \`data_quality/\` y \`methodology/\`. El directorio \`meridian_geox/data/\` contiene **datasets de ejemplo**, no código.
- **No existe** \`Methodology.SYNTHETIC_CONTROL\`. El enum solo tiene \`TBR\` y \`SDID\`.
- **No existen** clases tipo \`DesignRunner\`, \`AnalysisRunner\`, \`GeoExperiment\`, \`GeoXModel\`, \`TBRModel\` como API pública.
- \`design_scorer\` es un parámetro **declarado pero no implementado** en \`run_design\` (\`del design_scorer  # Unused in skeleton.\`). No lo uses.
- GeoX **no** usa MCMC, \`sample_prior\`, \`sample_posterior\` ni \`n_chains\` — eso es Meridian **MMM**, otra librería.

## 🔴 Cuatro errores CONFIRMADOS por introspección de meridian-geox 1.0.0

Estos cuatro fallos aparecen sistemáticamente al inferir la API desde la documentación.
Están verificados ejecutando la librería real:

**1. \`geox.DataSchema.DATE\` NO existe.**
\`DataSchema\` es un \`pandera.DataFrameModel\` de **validación**, no un contenedor de constantes.
Sus atributos son minúsculas (\`date\`, \`location\`, \`conversions\`, \`spend\`, \`spend_by_cell\`)
y son campos pandera, no strings.
\`\`\`python
# ❌ AttributeError
df[geox.DataSchema.DATE]
# ✅ las constantes están en geox.api
df[geox.api.DATE]          # 'date'
df[geox.api.LOCATION]      # 'location'
df[geox.api.CONVERSIONS]   # 'conversions'
df[geox.api.SPEND]         # 'spend'
df[geox.api.CELL_1]        # 'cell_1'
geox.api.MULTICELL_SPEND_REGEX   # '^spend_cell_[1-9]\\d*$'
\`\`\`

**2. Los quality checks requieren 3 argumentos, no 2.**
\`\`\`python
# ❌ TypeError: falta un argumento posicional
geox.check_design_data_quality(df, quality_config)
# ✅
geox.check_design_data_quality(df, design_config, quality_config)
geox.check_analysis_data_quality(df, analysis_config, quality_config)
\`\`\`

**3. \`result.metrics\` NO existe.** Las métricas van **por celda**:
\`\`\`python
# ❌ AttributeError
result.metrics.icpd.point_estimate
# ✅ AnalysisResult.results es dict[str, AnalysisMetrics]
metrics = result.results['cell_1']         # o geox.api.CELL_1
metrics.lift                    # Estimate
metrics.percent_lift            # Estimate
metrics.icpd                    # Optional[Estimate]
metrics.cumulative_lift         # DataFrame
metrics.cumulative_icpd         # Optional[DataFrame]
metrics.counterfactual_conversions   # DataFrame
metrics.pointwise_difference         # DataFrame
metrics.descriptive_metrics.estimated_bau_spend
\`\`\`
\`Estimate\` expone \`point_estimate\`, \`lower_bound\`, \`upper_bound\`,
\`standard_deviation\` y \`p_value\`.

**4. \`absl-py\` es una dependencia NO declarada.**
\`import meridian_geox\` falla con \`ModuleNotFoundError: No module named 'absl'\`
en una instalación limpia. Solución: \`pip install absl-py\`.`,

                    defaults: `## ⚙️ Defaults reales (los más confundidos)

| Parámetro | Default real | Error habitual |
|---|---|---|
| \`alpha\` | **0.1** → CI del **90%** | asumir 0.05 / CI 95% |
| \`power\` | 0.8 | — |
| \`test_type\` | \`TWO_SIDED\` | — |
| \`methodology\` | \`TBR\` | — |
| \`geo_assignment_rule\` | \`STRATIFIED_SAMPLING\` | asumir RANDOM |
| \`experiment_types\` | \`HOLDBACK\` | — |
| \`cell_count\` | 1 | — |
| \`min_r2\` | **0.8** | — |
| \`slope_tolerance\` | 0.2 | — |
| \`max_conversions_percent\` | **0.3** (debe ser **<0.5**) | asumir 0.5 |
| \`n_candidates\` | 100.000 | — |
| \`n_ranked_candidates\` | 100 | — |
| \`num_strata\` | 4 | — |
| \`k_means_iterations\` | 10 | — |
| \`design_output_count\` | 10 | — |
| \`seed\` | 42 | — |
| \`cost_per_incremental_conversion\` | 1.0 (solo HOLDBACK) | — |
| \`n_placebo_candidates\` | 100.000 | — |
| \`n_top_placebos\` | **500** | — |
| \`min_placebo_r2\` | **0.6** | confundirlo con \`min_r2\` (0.8) |
| \`min_placebo_count_warning\` | 100 | — |
| \`min_placebo_count_error\` | **10** (bloqueante) | — |`,

                    data: `## 📊 Reglas duras de datos

- **Granularidad diaria obligatoria.** Las series semanales se rechazan explícitamente: \`'Weekly patterns are not supported.'\`
- **Regla 3N:** pretest ≥ 3 × duración del test. Aplica tanto en \`run_design\` como en \`analyze\`. Con estacionalidad fuerte, preparar un año o más.
- **Geos ≥ \`2 * (cell_count + 1)\`** tras exclusiones. La FAQ recomienda ≥10 en single-cell; óptimo 50-100+.
- \`conversions\` debe ser **absoluta**: revenue o conteo. Las **métricas ratio (ROAS) NO están soportadas**.
- **Sin valores negativos**: no usar net revenue tras devoluciones. Usar gross y aplicar un ratio net-to-gross post-test.
- Conversiones **raw, sin atribuir** — no usar conversiones atribuidas, sesgan la incrementalidad real.
- Condición **BAU** en el periodo pretest.
- \`spend\` **obligatorio** en GO_DARK y HEAVY_UP; **no requerido** en HOLDBACK.
- **Un solo KPI primario por run.** Los secundarios se analizan después con \`analyze\` sobre sus propios datos.
- \`conversions.sum()\` debe ser > 0.`,

                    budget: `## 💰 Semántica de Budget por tipo de experimento

\`Budget\` exige **exactamente uno** de \`budget\` o \`budget_pct\`. Pasar ambos o ninguno lanza \`ValueError\`.

| Tipo | Expresión | Signo | Default si se omite |
|---|---|---|---|
| \`HOLDBACK\` | \`Budget(budget=500000)\` — importe absoluto de la campaña nueva | absoluto positivo | — |
| \`HEAVY_UP\` | \`Budget(budget_pct=0.5)\` — +50% sobre baseline | **positivo** | \`+1.0\` |
| \`GO_DARK\` | \`Budget(budget_pct=-1.0)\` apagado total | **negativo** | \`-1.0\` |
| go-dim | \`Budget(budget_pct=-0.5)\` — apagado parcial 50% | negativo | — |

**go-dim no es un \`ExperimentType\` propio**: es un \`GO_DARK\` con \`budget_pct\` parcial.

En multi-celda, \`budget_constraint\` puede ser un dict \`{'cell_1': Budget(...), 'cell_2': Budget(...)}\`.
\`cost_per_incremental_conversion\` (CpIC ≈ 1/iROAS objetivo) **solo aplica a celdas HOLDBACK**.`,

                    analysis: `## 🔬 Trampas del análisis

- **Usa el MISMO \`Design\` congelado** que se ejecutó en plataforma. La inferencia por placebos reproduce el mecanismo de asignación de ese diseño; analizar con otro invalida los p-values.
- **Excluye los learning periods** del análisis (la duplicación de campañas los dispara) y las fechas con incidencias, vía \`excluded_dates\`.
- El **CI por defecto es del 90%** (\`alpha=0.1\`), no del 95%. Indícalo siempre al reportar.
- **Verifica el número de placebos válidos**: warning por debajo de 100, **error bloqueante** por debajo de 10. Pocos placebos ⇒ inferencia poco fiable.
- \`min_placebo_r2=0.6\` es distinto de \`min_r2=0.8\` del diseño. No los confundas.
- **Signo del efecto:** en \`GO_DARK\` la intervención es un apagado, el efecto crudo es negativo y se niega para representar el valor positivo de la publicidad apagada.
- El análisis también requiere **≥3N fechas de pretest**.
- Revisa el \`QualityCheckResult\` del análisis antes de comunicar cualquier cifra.`,

                    terminology: `## 🚫 Terminología que NO pertenece a Meridian GeoX

- **GBR** (Geo-Based Regression): no aparece en ninguna página de la documentación de Meridian GeoX. Es terminología de la literatura previa de Google (Vaver & Koehler), no de esta librería.
- **trimmed match**: no forma parte de GeoX. Es una librería separada de Google (\`google/trimmed_match\`) usada en geo-experimentos pareados.
- **TBRMM** (time-based regression matched markets): es la única referencia legacy que la FAQ de GeoX reconoce, como software anterior — no como API de GeoX.
- **Synthetic control / synthetic diff-in-diff**: la documentación los menciona como opciones de \`methodology\`, pero el enum real solo tiene \`TBR\` y \`SDID\`, y la FAQ afirma que GeoX soporta TBR. **Trata TBR como la única metodología plenamente soportada.**

### Lagunas conocidas de la documentación oficial
- \`/meridian/geox/intro-to-incrementality-based-calibration\` está publicada **vacía**. La fuente válida para calibración es \`/meridian/docs/advanced-modeling/set-custom-priors-past-experiments\`.
- Los 6 pasos del design search pipeline solo existen como diagrama de imagen, sin descripción textual.`,
                };

                if (args.topic && pitfalls[args.topic]) {
                    return pitfalls[args.topic];
                }

                return Object.values(pitfalls).join("\n\n---\n\n");
            },
        },

        {
            name: "geox_project_scaffold",
            description:
                "Genera la estructura de directorios y los esqueletos de run_design.py y run_analysis.py para un nuevo proyecto de geo-experimento en projects/geo-experiments/<cliente>-<año>/. Incluye configuración, imports y secciones comentadas en español según las convenciones del repositorio.",
            parameters: {
                type: "object",
                properties: {
                    cliente: {
                        type: "string",
                        description: "Nombre corto del proyecto, ej: 'paradisus-us' o 'melia-es'",
                    },
                    year: {
                        type: "string",
                        description: "Año del estudio, ej: '2026'",
                    },
                    experiment_type: {
                        type: "string",
                        description: "Tipo de experimento: 'holdback', 'go_dark' o 'heavy_up'. Default: 'heavy_up'",
                    },
                    duration_days: {
                        type: "string",
                        description: "Duración del test en días, ej: '28'. Default: '28'",
                    },
                    kpi: {
                        type: "string",
                        description: "Nombre de negocio del KPI, ej: 'bookings' o 'revenue'. Default: 'conversions'",
                    },
                },
                required: ["cliente", "year"],
            },
            skipPermission: true,
            handler: async (args) => {
                const {
                    cliente,
                    year,
                    experiment_type = "heavy_up",
                    duration_days = "28",
                    kpi = "conversions",
                } = args;

                const tipo = experiment_type.trim().toUpperCase().replace(/[-\s]/g, "_");
                const dur = parseInt(duration_days, 10) || 28;
                const proj = `${cliente}-${year}`;

                return `## Estructura a crear: projects/geo-experiments/${proj}/

\`\`\`
projects/geo-experiments/${proj}/
├── run_design.py            ← FASE PRE-TEST: genera y selecciona el diseño
├── run_analysis.py          ← FASE POST-TEST: analiza los resultados
├── run_calibration.py       ← OPCIONAL: convierte el resultado en priors del MMM
├── config/
│   ├── design_config.json   ← parámetros del diseño
│   └── analysis_config.json ← parámetros del análisis
├── data/
│   ├── pretest.csv          ← datos de diseño (date, location, ${kpi}[, spend])
│   └── posttest.csv         ← datos de análisis
├── outputs/
│   ├── design.json          ← EL DISEÑO CONGELADO (versionar en git)
│   ├── charts/              ← PNG numerados
│   └── reports/             ← HTML branded + PDF
└── README.md                ← qué se testó, periodos, cómo replicarlo
\`\`\`

## config/design_config.json

\`\`\`json
{
  "proyecto": "${proj}",
  "kpi_negocio": "${kpi}",
  "data_file": "pretest.csv",
  "experiment_type": "${tipo}",
  "experiment_duration_days": ${dur},
  "cell_count": 1,
  "geo_assignment_rule": "STRATIFIED_SAMPLING",
  "design_output_count": 10,
  "alpha": 0.1,
  "power": 0.8,
  "min_r2": 0.8,
  "max_conversions_percent": 0.3,
  "budget_pct": ${tipo === "GO_DARK" ? "-1.0" : tipo === "HEAVY_UP" ? "0.5" : "null"},
  "budget": ${tipo === "HOLDBACK" ? "100000" : "null"},
  "excluded_geos": [],
  "seed": 42
}
\`\`\`

## Esqueleto de run_design.py

\`\`\`python
"""
Diseño de geo-experimento — ${cliente.toUpperCase()} ${year}
=========================================================
Fase PRE-TEST: genera diseños candidatos con Meridian GeoX, selecciona el mejor
y lo congela en outputs/design.json.

Ejecutar:
    python run_design.py

Requisitos:
    - pip install meridian-geox
    - data/pretest.csv con columnas: date, location, ${kpi}[, spend]
    - Al menos ${dur * 3} fechas de pretest (regla 3N para un test de ${dur} días)
"""

import datetime
import json
from pathlib import Path

import matplotlib.pyplot as plt
import pandas as pd

import meridian_geox as geox

# --- Constantes de columna que exige la librería ---
# Viven en geox.api. OJO: geox.DataSchema es un validador pandera y NO expone
# .DATE/.LOCATION/.CONVERSIONS/.SPEND.
COL_DATE = geox.api.DATE
COL_LOCATION = geox.api.LOCATION
COL_CONVERSIONS = geox.api.CONVERSIONS
COL_SPEND = geox.api.SPEND

# =============================================================================
# CONFIGURACIÓN
# =============================================================================
# Todos los parámetros del estudio viven en config/design_config.json para que
# el script sea reutilizable y el diseño quede documentado y versionado.

BASE_DIR = Path(__file__).parent
CONFIG_PATH = BASE_DIR / "config" / "design_config.json"
DATA_DIR = BASE_DIR / "data"
OUTPUT_DIR = BASE_DIR / "outputs"
CHARTS_DIR = OUTPUT_DIR / "charts"

with open(CONFIG_PATH, encoding="utf-8") as f:
    CONFIG = json.load(f)

CHARTS_DIR.mkdir(parents=True, exist_ok=True)

# --- Paleta corporativa WPP Media --------------------------------------------
NAVY, LIME, BLUE = "#000050", "#B0F467", "#5465FF"
PERIWINK, TEAL, GRIS = "#788BFF", "#00DBEE", "#6B7093"


# =============================================================================
# CARGA Y NORMALIZACIÓN DE DATOS
# =============================================================================

def cargar_datos():
    """Carga el CSV de pretest y lo normaliza al esquema que espera GeoX.

    Devuelve un DataFrame con columnas date (datetime), location (str),
    conversions (float) y, si aplica, spend (float).
    """
    df = pd.read_csv(DATA_DIR / CONFIG["data_file"])

    # GeoX exige nombres de columna concretos; renombramos desde el esquema
    # de negocio al esquema de la librería.
    df = df.rename(columns={CONFIG["kpi_negocio"]: COL_CONVERSIONS})
    df[COL_DATE] = pd.to_datetime(df[COL_DATE])
    df[COL_LOCATION] = df[COL_LOCATION].astype(str)

    print(f"Datos cargados: {len(df)} filas, "
          f"{df[COL_LOCATION].nunique()} geos, "
          f"{df[COL_DATE].nunique()} fechas")
    return df


# =============================================================================
# CONSTRUCCIÓN DE LA CONFIGURACIÓN DEL DISEÑO
# =============================================================================

def construir_config():
    """Traduce el JSON de configuración a los objetos DesignConfig y Constraints.

    Devuelve la tupla (design_config, constraints).
    """
    design_config = geox.DesignConfig(
        experiment_duration=datetime.timedelta(days=CONFIG["experiment_duration_days"]),
        experiment_types=geox.ExperimentType[CONFIG["experiment_type"]],
        methodology=geox.Methodology.TBR,
        geo_assignment_rule=geox.GeoAssignmentRule[CONFIG["geo_assignment_rule"]],
        design_output_count=CONFIG["design_output_count"],
        alpha=CONFIG["alpha"],
        power=CONFIG["power"],
        min_r2=CONFIG["min_r2"],
        seed=CONFIG["seed"],
    )

    # --- Presupuesto ---
    # HOLDBACK usa importe absoluto; GO_DARK y HEAVY_UP usan porcentaje con signo
    # (negativo para apagados, positivo para incrementos).
    if CONFIG.get("budget") is not None:
        budget = geox.Budget(budget=CONFIG["budget"])
    else:
        budget = geox.Budget(budget_pct=CONFIG["budget_pct"])

    constraints = geox.Constraints(
        budget_constraint=budget,
        excluded_geos=set(CONFIG.get("excluded_geos", [])),
        max_conversions_percent=CONFIG["max_conversions_percent"],
    )
    return design_config, constraints


# =============================================================================
# GENERACIÓN Y SELECCIÓN DEL DISEÑO
# =============================================================================

def generar_disenos(df, design_config, constraints):
    """Ejecuta la búsqueda de diseños y devuelve el DesignSet rankeado."""
    design_set = geox.run_design(df, design_config, constraints)
    print(design_set.design_metrics.to_string())
    return design_set


def seleccionar_diseno(design_set, alpha):
    """Selecciona el primer diseño que además supere el test A/A.

    run_design devuelve el DesignSet ya rankeado, pero un diseño con sesgo A/A
    significativo (p < alpha) invalidaría el análisis posterior, así que lo
    descartamos y bajamos al siguiente candidato.
    """
    for design_id, design in design_set.designs.items():
        p_values = [c.p_value for c in design.designs.values()]
        if all(p >= alpha for p in p_values):
            print(f"Diseño seleccionado: {design_id} (p-values AA: {p_values})")
            return design_id, design
        print(f"Descartado {design_id} por sesgo A/A: {p_values}")
    raise RuntimeError("Ningún diseño supera el test A/A. Revisa datos y restricciones.")


# =============================================================================
# CONGELADO DEL DISEÑO
# =============================================================================

def congelar_diseno(design):
    """Exporta el diseño a outputs/design.json.

    Este fichero es el artefacto crítico del estudio: el análisis posterior debe
    usar exactamente este mismo objeto Design, porque la inferencia por placebos
    reproduce su mecanismo de asignación. No modificarlo tras activar el test.
    """
    path = OUTPUT_DIR / "design.json"
    path.write_text(design.export_to_json(), encoding="utf-8")
    print(f"Diseño congelado en {path}")


# =============================================================================
# MAIN
# =============================================================================

def main():
    df = cargar_datos()

    design_config, constraints = construir_config()

    # Los chequeos de calidad detectan geos sin respuesta y fechas outlier antes
    # de invertir tiempo en la búsqueda de diseños. Requiere el design_config.
    quality = geox.check_design_data_quality(
        df, design_config, geox.QualityCheckConfig()
    )
    print(quality)

    design_set = generar_disenos(df, design_config, constraints)
    _, design = seleccionar_diseno(design_set, CONFIG["alpha"])

    geox.plot_design(design)
    plt.savefig(CHARTS_DIR / "01-design-alignment.png", dpi=150, bbox_inches="tight")

    congelar_diseno(design)


if __name__ == "__main__":
    main()
\`\`\`

## Esqueleto de run_analysis.py

\`\`\`python
"""
Análisis de geo-experimento — ${cliente.toUpperCase()} ${year}
===========================================================
Fase POST-TEST: analiza los resultados del experimento usando el diseño
congelado en outputs/design.json.

Ejecutar:
    python run_analysis.py
"""

import json
from pathlib import Path

import matplotlib.pyplot as plt
import pandas as pd

import meridian_geox as geox

# Constantes de columna: viven en geox.api, NO en geox.DataSchema.
COL_DATE = geox.api.DATE
COL_LOCATION = geox.api.LOCATION
COL_CONVERSIONS = geox.api.CONVERSIONS

BASE_DIR = Path(__file__).parent
CONFIG = json.loads((BASE_DIR / "config" / "analysis_config.json").read_text(encoding="utf-8"))
OUTPUT_DIR = BASE_DIR / "outputs"
CHARTS_DIR = OUTPUT_DIR / "charts"


def cargar_diseno():
    """Carga el diseño congelado. Debe ser el mismo que se ejecutó en plataforma."""
    return geox.Design.load_from_json(
        (OUTPUT_DIR / "design.json").read_text(encoding="utf-8")
    )


def cargar_datos():
    """Carga el CSV post-test y lo normaliza al esquema de GeoX."""
    df = pd.read_csv(BASE_DIR / "data" / CONFIG["data_file"])
    df = df.rename(columns={CONFIG["kpi_negocio"]: COL_CONVERSIONS})
    df[COL_DATE] = pd.to_datetime(df[COL_DATE])
    df[COL_LOCATION] = df[COL_LOCATION].astype(str)
    return df


def main():
    design = cargar_diseno()
    df = cargar_datos()

    # Las fechas excluidas cubren learning periods e incidencias conocidas: si no
    # se excluyen, contaminan la estimación del efecto.
    excluded = {pd.Timestamp(d) for d in CONFIG.get("excluded_dates", [])}

    analysis_config = geox.AnalysisConfig(
        design=design,
        analysis_start_date=pd.Timestamp(CONFIG["analysis_start_date"]),
        analysis_end_date=pd.Timestamp(CONFIG["analysis_end_date"]),
        excluded_dates=excluded,
    )

    result = geox.analyze(df, analysis_config)

    geox.plot_analysis(result)
    plt.savefig(CHARTS_DIR / "02-analysis-results.png", dpi=150, bbox_inches="tight")

    # Las métricas se obtienen POR CELDA desde result.results.
    # El iCPD (coste por conversión incremental) alimenta la calibración del MMM.
    metrics = result.results[geox.api.CELL_1]
    print("Lift:", metrics.lift.point_estimate,
          "| p-value:", metrics.lift.p_value)
    print("Lift %:", metrics.percent_lift.point_estimate)
    print("iCPD:", metrics.icpd.point_estimate,
          "±", metrics.icpd.standard_deviation)
    print("Spend BAU estimado:", metrics.descriptive_metrics.estimated_bau_spend)


if __name__ == "__main__":
    main()
\`\`\`

## Recordatorios

- Pretest necesario: **≥ ${dur * 3} fechas** (regla 3N para ${dur} días de test)
- Geos mínimos: **4** en single-cell (2 × (cell_count + 1)); óptimo 50-100+
${tipo !== "HOLDBACK" ? `- \`spend\` es **obligatorio** en los datos por ser un experimento ${tipo}` : "- `spend` es opcional por ser un HOLDBACK"}
- El CI reportado será del **90%** (\`alpha=0.1\`)
- Versionar \`outputs/design.json\` en git y documentar en el README la fecha de congelación`;
            },
        },
    ],

    hooks: {
        // Inyectar el conocimiento GeoX al inicio de cada sesión
        onSessionStart: async (input, invocation) => {
            await session.log("🌍 GeoX Expert activado — geo-experimentos WPP/Melia", { ephemeral: true });
            return {
                additionalContext: GEOX_SYSTEM_CONTEXT,
            };
        },

        // Enriquecer prompts relacionados con geo-experimentos
        onUserPromptSubmitted: async (input, invocation) => {
            if (!isGeoXRelated(input.prompt)) return;

            const topic = detectTopic(input.prompt);
            const extra = topic ? TOPIC_CONTEXTS[topic] : "";

            return {
                additionalContext: `[GeoX Expert] El usuario está preguntando sobre geo-experimentos con Meridian GeoX.${extra}

Responde en español. Usa el API real de meridian_geox (no pseudocódigo) y verifica
contra skills/meridian-geox/references/api-reference.md antes de escribir código.
Recuerda: GeoX NO es Meridian MMM. Solo TBR está soportada. alpha por defecto es 0.1 (CI 90%).
Cuando generes código Python, sigue las convenciones del repositorio: autocomentado en
español, docstrings, comentarios de bloque por fase.`,
            };
        },
    },
});
