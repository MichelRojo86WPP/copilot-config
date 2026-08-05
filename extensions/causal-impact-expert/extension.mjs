// Extension: causal-impact-expert
// Agente experto en TFP CausalImpact para proyectos WPP/Melia.
// Incorpora aprendizajes reales de:
//   - projects/causal-impact/sem-brand-pause-es-2026/
//   - projects/causal-impact/paradisus-us-2026/
// y la documentación de docs/setup/tfp-causalimpact-knowledge.md

import { joinSession } from "@github/copilot-sdk/extension";

// ---------------------------------------------------------------------------
// CONTEXTO BASE — se inyecta en cada sesión
// ---------------------------------------------------------------------------
const CI_SYSTEM_CONTEXT = `
## Experto en TFP CausalImpact — Contexto WPP/Melia

Eres un experto en **TFP CausalImpact** (implementación Python de Google del paquete
bayesiano de series temporales estructurales de Brodersen et al. 2015).
Trabajas en el repositorio **WPPOpen/advanced_analytics_melia** para Meliá Hotels International.

### Ubicación en el repo
- Documentación: \`docs/setup/tfp-causalimpact-knowledge.md\`
- Plantilla base: \`analysis/causal_impact/run_analysis.py\`
- Config template: \`analysis/causal_impact/config_template.json\`
- Plantilla informe: \`analysis/causal_impact/templates/causal_impact_report_template_branded.html\`
- Proyectos reales:
  - \`projects/causal-impact/sem-brand-pause-es-2026/\` — pausa keyword marca España
  - \`projects/causal-impact/paradisus-us-2026/\` — impacto campaña Paradisus

### Import correcto
\`\`\`python
import causalimpact as ci
from causalimpact import ModelOptions, Seasons
\`\`\`

### Workflow end-to-end
1. Cargar datos → DataFrame con DatetimeIndex, sin NaN
2. Seleccionar controles por correlación en primeras diferencias (SOLO en periodo pre)
3. Transformación logarítmica (series monetarias → np.log; sesiones → np.log1p; Promo_ → sin transformar)
4. Ejecutar ci.fit_causalimpact con ModelOptions(prior_level_sd=0.01, seasons=[Seasons(7,1)], seed=42)
5. Extraer resultados desde posterior en escala original (np.exp antes de sumar)
6. Intervalo del acumulado desde cumulative_effects_lower/upper del ÚLTIMO día (no sumar percentiles diarios)
7. Generar gráficos y reporte HTML branded WPP Media

### Supuestos críticos (siempre validar)
1. Controles NO afectados por la intervención
2. Relación tratada-controles ESTABLE post-intervención
3. Pre-período mínimo 3× duración del post-período

### Paleta WPP Media (OBLIGATORIO en todos los gráficos)
NAVY='#000050', LIME='#B0F467', BLUE='#5465FF', PERIWINK='#788BFF',
TEAL='#00DBEE', ROJO='#E84B4B', VERDE='#2DB87A', GRIS='#6B7093'
`;

// ---------------------------------------------------------------------------
// APRENDIZAJES CRÍTICOS de proyectos reales (codificados como conocimiento)
// ---------------------------------------------------------------------------
const LESSONS_LEARNED = {
    logScale: `### Transformación logarítmica — aprendizaje SEM Brand Pause ES-2026
La serie de ventas va de 121.000 € a 3.601.000 € diarios. En niveles, la varianza
crece con el nivel y el modelo asume la del peor día en todos. En log la varianza
se estabiliza y el efecto es multiplicativo (como se comporta realmente un cambio de canal).
Redujo el error de predicción del pre un 25%.

\`\`\`python
# Diferenciado por tipo de columna:
monetarias = [c for c in df.columns
              if not c.startswith('Promo_') and not c.startswith('Control_SM_')]
sesiones_sm = [c for c in df.columns if c.startswith('Control_SM_')]
datos = df.copy()
datos[monetarias] = np.log(datos[monetarias])      # series monetarias: log()
if sesiones_sm:
    datos[sesiones_sm] = np.log1p(datos[sesiones_sm])  # sesiones: log1p() (evita log(0))
# Promo_* NO se transforman: son indicadores 0/1, log(0) = -inf
\`\`\``,

    controlSelection: `### Selección de controles — aprendizaje SEM Brand Pause ES-2026
Usar correlación en PRIMERAS DIFERENCIAS, no en niveles. Dos series que crecen
juntas tienen alta correlación en niveles aunque no compartan dinámica diaria real.
En diferencias solo sobrevive el co-movimiento genuino que permite predecir un día.

\`\`\`python
MIN_CORRELACION = 0.25  # mercados geográficos
MIN_CORRELACION_SM = 0.20  # canales de marketing (más ruidosos)

def seleccionar_controles(df, response, pre_ini, pre_fin):
    pre = df.loc[pre_ini:pre_fin].dropna()
    dif_respuesta = pre[response].diff().dropna()
    aceptados = []
    for col in pre.columns:
        if col == response or col.startswith('Promo_'):
            continue  # Promo_ siempre entra (ver nota abajo)
        r_dif = pre[col].diff().dropna().corr(dif_respuesta)
        umbral = MIN_CORRELACION_SM if col.startswith('Control_SM_') else MIN_CORRELACION
        if r_dif >= umbral:
            aceptados.append(col)
    # Promo_* siempre incluir si tienen actividad en el pre
    promos = [c for c in pre.columns if c.startswith('Promo_') and pre[c].sum() > 0]
    return aceptados + promos
# CRÍTICO: calcular correlación SOLO en el pre-período, nunca en el post
\`\`\`

**Por qué Promo_ siempre entra**: son indicadores de eventos conocidos (Black Friday,
campañas). Su correlación con ventas es baja porque valen 0 el 95% del tiempo.
El filtro las descartaría justo cuando lo que aportan es explicar el 5% restante,
donde se concentra la varianza que ningún control geográfico captura.`,

    multipleTests: `### Tests múltiples — aprendizaje SEM Brand Pause ES-2026
Ejecutar MÁXIMO 2 análisis independientes sobre los mismos datos (análisis A + réplica B).
Con 5 contrastes al 5% la probabilidad de encontrar un efecto por azar sería del 23%.

\`\`\`python
# CORRECTO: dos análisis independientes
ANALISIS_A = {'pre': ['2024-01-01', '2025-09-30'], 'post': ['2025-10-01', '2025-11-19']}
ANALISIS_B = {'pre': ['2024-01-01', '2026-01-31'], 'post': ['2026-02-12', '2026-07-31']}

# INCORRECTO: 5 ventanas distintas del mismo experimento → p-value inflado
\`\`\``,

    cumulativeInterval: `### Intervalo del acumulado — aprendizaje crítico SEM Brand Pause ES-2026
Usar \`cumulative_effects_lower/upper\` del ÚLTIMO DÍA del post, NO sumar los percentiles diarios.
Sumar el percentil 2.5 de cada día describe el escenario imposible en que todos los días
caen a la vez en su peor valor. Ese error inflaba la anchura del intervalo en un factor de 1.7×.

\`\`\`python
# CORRECTO
ultimo_dia = resultado.series.iloc[post_ini:post_fin + 1].iloc[-1]
dias = post_fin - post_ini + 1
ce_bajo = float(ultimo_dia['cumulative_effects_lower']) / dias
ce_alto = float(ultimo_dia['cumulative_effects_upper']) / dias
# Convertir log-puntos a euros
efecto_bajo = contrafactual * (np.exp(ce_bajo) - 1.0)
efecto_alto = contrafactual * (np.exp(ce_alto) - 1.0)

# INCORRECTO (NO hacer esto)
# efecto_bajo = post['effect_lower'].sum()  ← sobreestima la incertidumbre
\`\`\``,

    backToEuros: `### Vuelta a escala original — aprendizaje SEM Brand Pause ES-2026
El modelo trabaja en logaritmos. Al extraer resultados, aplicar exp() ANTES de sumar.
exp() no es lineal: exponenciar la suma de logaritmos daría el producto de días, no el total.

\`\`\`python
# CORRECTO
post = resultado.series.iloc[post_ini:post_fin + 1]
observado = float(np.exp(post['observed']).sum())
contrafactual = float(np.exp(post['posterior_mean']).sum())
efecto_abs = observado - contrafactual

# INCORRECTO
# observado = post['observed'].sum()  ← suma en escala log, no en euros
\`\`\``,

    nanCheck: `### Validación de NaN — aprendizaje crítico
tfp-causalimpact falla con un error poco descriptivo si hay NaN. Siempre validar:

\`\`\`python
if df.isna().any().any():
    fechas = df[df.isna().any(axis=1)].index
    raise SystemExit(
        f'El dataset tiene {len(fechas)} días con NaN (primero: {fechas[0].date()}).\\n'
        'tfp-causalimpact exige la serie completa. Imputa o elimina los valores ausentes.'
    )
\`\`\`
Para días con incidencias de tracking: imputar con la media de ±3 días del mismo día de semana.
Marcar con columna Diag_Imputado=1 para señalar en gráficos.`,

    modelOptions: `### ModelOptions recomendadas para hotelería (series diarias)
\`\`\`python
PRIOR_LEVEL_SD = 0.01  # rigidez del paseo aleatorio del nivel local
SEMILLA = 42           # siempre fijar para reproducibilidad

opciones = ci.ModelOptions(
    prior_level_sd=PRIOR_LEVEL_SD,
    seasons=[ci.Seasons(num_seasons=7, num_steps_per_season=1)]  # estacionalidad semanal
)

resultado = ci.fit_causalimpact(
    datos.reset_index(drop=True),  # la librería necesita índice entero, no fechas
    (pre_ini, pre_fin),
    (post_ini, post_fin),
    model_options=opciones,
    seed=SEMILLA
)
\`\`\`
**IMPORTANTE**: tfp-causalimpact NO incluye estacionalidad semanal por defecto.
Para datos hoteleros diarios, sin modelar el ciclo semanal, el patrón predecible
queda en el residuo y ensancha los intervalos sin motivo.

**CRÍTICO**: pasar \`datos.reset_index(drop=True)\` — la librería traduce las fechas
a posiciones enteras internamente y necesita el índice reseteado.`,

    configTemplate: `### Estructura config.json
\`\`\`json
{
  "project": {
    "name": "Causal Impact – [NOMBRE]",
    "client": "[CLIENTE]",
    "analyst": "Advanced Analytics WPP"
  },
  "data": {
    "file": "[archivo].csv",
    "date_column": "Date",
    "response_column": "[columna_respuesta]",
    "control_columns": ["Control_1", "Control_2"]
  },
  "model": {
    "pre_period": ["YYYY-MM-DD", "YYYY-MM-DD"],
    "post_period": ["YYYY-MM-DD", "YYYY-MM-DD"],
    "alpha": 0.05,
    "prior_level_sd": 0.01,
    "seed": 42,
    "log_transform": true,
    "seasonality_weekly": true
  },
  "validation": {
    "min_correlation": 0.25,
    "min_correlation_sm": 0.20
  }
}
\`\`\``,
};

// ---------------------------------------------------------------------------
// Detección de intención
// ---------------------------------------------------------------------------
const CI_KEYWORDS = [
    'causal', 'causalimpact', 'contrafactual', 'bayesian', 'bsts',
    'intervención', 'intervencion', 'pre_period', 'post_period', 'pre period',
    'fit_causalimpact', 'modeloptions', 'seasons', 'control', 'serie temporal',
    'pausa', 'campaña', 'efecto', 'incremento', 'sesiones', 'ventas',
    'marca', 'keyword', 'impacto', 'lift', 'significativo', 'p-value',
    'paradisus', 'sem brand', 'tratada', 'sem-brand'
];

function isCIRelated(prompt) {
    const lower = prompt.toLowerCase();
    return CI_KEYWORDS.some(kw => lower.includes(kw));
}

function detectTopic(prompt) {
    const lower = prompt.toLowerCase();
    if (lower.match(/log|escala|transform|monetari/)) return 'logScale';
    if (lower.match(/control|correlaci|seleccion|covariable/)) return 'controlSelection';
    if (lower.match(/multiple|test|p.value|significan|contrastes/)) return 'multipleTests';
    if (lower.match(/acumulad|cumulative|intervalo|ci_/)) return 'cumulativeInterval';
    if (lower.match(/nan|nulo|ausente|missing|imputad/)) return 'nanCheck';
    if (lower.match(/modeloption|season|prior_level|semilla|seed/)) return 'modelOptions';
    if (lower.match(/config|json|configuraci/)) return 'configTemplate';
    if (lower.match(/euro|resultado|efecto|abs|rel|volver/)) return 'backToEuros';
    return null;
}

// ---------------------------------------------------------------------------
// Herramienta: referencia del workflow por paso
// ---------------------------------------------------------------------------
const WORKFLOW_STEPS = {
    load: `## Paso: Cargar datos
\`\`\`python
import pandas as pd
import numpy as np
import causalimpact as ci

# Leer CSV con fechas — utf-8-sig tolera BOM de Windows
df = pd.read_csv('data/dataset.csv', parse_dates=['Date'], encoding='utf-8-sig')
df = df.set_index('Date').sort_index()

# Validación crítica: tfp-causalimpact falla sin descripción útil si hay NaN
if df.isna().any().any():
    fechas = df[df.isna().any(axis=1)].index
    raise SystemExit(f'NaN en {len(fechas)} días (primero: {fechas[0].date()})')
\`\`\``,

    controls: `## Paso: Seleccionar controles
\`\`\`python
MIN_CORR = 0.25   # mercados geográficos
MIN_CORR_SM = 0.20  # canales de marketing (más ruido diario)

def seleccionar_controles(df, response, pre_ini, pre_fin):
    """Filtra controles por correlación en primeras diferencias en el pre-período."""
    pre = df.loc[pre_ini:pre_fin].dropna()
    dif_y = pre[response].diff().dropna()
    aceptados, promos = [], []
    for col in pre.columns:
        if col == response:
            continue
        if col.startswith('Promo_'):
            if pre[col].sum() > 0:  # solo si hay actividad en el pre
                promos.append(col)
            continue
        umbral = MIN_CORR_SM if col.startswith('Control_SM_') else MIN_CORR
        r_dif = pre[col].diff().dropna().corr(dif_y)
        if r_dif >= umbral:
            aceptados.append(col)
    return aceptados + promos
\`\`\``,

    transform: `## Paso: Transformación logarítmica
\`\`\`python
def transformar_log(df):
    """Aplica log a series monetarias y log1p a sesiones. Promo_* sin transformar."""
    datos = df.copy()
    monetarias = [c for c in df.columns
                  if not c.startswith('Promo_') and not c.startswith('Control_SM_')]
    sesiones = [c for c in df.columns if c.startswith('Control_SM_')]
    datos[monetarias] = np.log(datos[monetarias])
    if sesiones:
        datos[sesiones] = np.log1p(datos[sesiones])  # log1p: seguro para ceros
    return datos
\`\`\``,

    fit: `## Paso: Ajustar el modelo
\`\`\`python
PRIOR_LEVEL_SD = 0.01  # rigidez paseo aleatorio del nivel local
SEMILLA = 42

def ajustar_modelo(datos, response, controles, pre, post):
    """Ajusta CausalImpact. Traduce fechas a posiciones enteras (requerido por la lib)."""
    matriz = datos[[response] + controles]
    idx = matriz.index

    # Traducción fechas → índices enteros
    pre_ini = idx.get_loc(idx[idx >= pd.Timestamp(pre[0])][0])
    pre_fin = idx.get_loc(idx[idx <= pd.Timestamp(pre[1])][-1])
    post_ini = idx.get_loc(idx[idx >= pd.Timestamp(post[0])][0])
    post_fin = idx.get_loc(idx[idx <= pd.Timestamp(post[1])][-1])

    opciones = ci.ModelOptions(
        prior_level_sd=PRIOR_LEVEL_SD,
        seasons=[ci.Seasons(num_seasons=7, num_steps_per_season=1)]  # estacionalidad semanal
    )

    resultado = ci.fit_causalimpact(
        matriz.reset_index(drop=True),  # índice entero, no fechas
        (pre_ini, pre_fin),
        (post_ini, post_fin),
        model_options=opciones,
        seed=SEMILLA
    )
    return resultado, (pre_ini, pre_fin, post_ini, post_fin)
\`\`\``,

    results: `## Paso: Extraer resultados en escala original
\`\`\`python
def extraer_resultados(resultado, indices):
    """Convierte resultados de log a euros. Intervalo desde cumulative del último día."""
    _, _, post_ini, post_fin = indices
    s = resultado.series
    post = s.iloc[post_ini:post_fin + 1]

    # exp() ANTES de sumar (no lineal)
    observado = float(np.exp(post['observed']).sum())
    contrafactual = float(np.exp(post['posterior_mean']).sum())
    efecto_abs = observado - contrafactual
    efecto_rel = 100.0 * efecto_abs / contrafactual

    # Intervalo del acumulado desde el ÚLTIMO día (no suma de percentiles diarios)
    ultimo = post.iloc[-1]
    dias = post_fin - post_ini + 1
    ce_bajo = float(ultimo['cumulative_effects_lower']) / dias
    ce_alto = float(ultimo['cumulative_effects_upper']) / dias
    efecto_bajo = contrafactual * (np.exp(ce_bajo) - 1.0)
    efecto_alto = contrafactual * (np.exp(ce_alto) - 1.0)

    return {
        'observado': observado,
        'contrafactual': contrafactual,
        'efecto_abs': efecto_abs,
        'efecto_rel': efecto_rel,
        'ic_bajo': efecto_bajo,
        'ic_alto': efecto_alto,
        'p_value': float(resultado.summary['p_value']) if 'p_value' in resultado.summary else None,
    }
\`\`\``,

    report: `## Paso: Generar informe HTML branded
\`\`\`python
# Partir siempre de la plantilla WPP Media:
# analysis/causal_impact/templates/causal_impact_report_template_branded.html
# Sustituir placeholders: {{CLIENT_FULL}}, {{CLIENT_SHORT}}, {{STUDY_YEAR}},
# {{REPORT_DATE}}, {{CHART_IMAGE_BASE64}}

import base64
from pathlib import Path

def imagen_a_base64(ruta):
    """Embebe imagen PNG en base64 para HTML standalone."""
    with open(ruta, 'rb') as f:
        return base64.b64encode(f.read()).decode('utf-8')

# Leer plantilla, sustituir y guardar
template = Path('analysis/causal_impact/templates/causal_impact_report_template_branded.html').read_text('utf-8')
html = (template
    .replace('{{CLIENT_FULL}}', 'Meliá Hotels International')
    .replace('{{CLIENT_SHORT}}', 'melia')
    .replace('{{STUDY_YEAR}}', '2026')
    .replace('{{REPORT_DATE}}', '05/08/2026')
    .replace('{{CHART_IMAGE_BASE64}}', imagen_a_base64('outputs/charts/01-causal-impact.png'))
)
Path('outputs/reports/informe_branded.html').write_text(html, encoding='utf-8')
\`\`\``,
};

const session = await joinSession({
    tools: [
        {
            name: "causal_impact_workflow_reference",
            description: "Devuelve el código real y validado de cada paso del workflow TFP CausalImpact, con todos los aprendizajes de los proyectos reales de Melia (SEM Brand Pause ES-2026, Paradisus US-2026). Usar cuando necesites código correcto para cualquier fase del análisis.",
            parameters: {
                type: "object",
                properties: {
                    step: {
                        type: "string",
                        description: "Paso a consultar: 'load', 'controls', 'transform', 'fit', 'results', 'report'. Omitir para obtener todo.",
                    },
                },
            },
            skipPermission: true,
            handler: async (args) => {
                if (args.step && WORKFLOW_STEPS[args.step]) {
                    return WORKFLOW_STEPS[args.step];
                }
                return Object.values(WORKFLOW_STEPS).join('\n\n---\n\n');
            },
        },

        {
            name: "causal_impact_lessons_learned",
            description: "Devuelve los aprendizajes críticos extraídos de proyectos reales (errores que inflaban intervalos, transformaciones incorrectas, selección de controles errónea). Consultar antes de implementar cualquier análisis CausalImpact.",
            parameters: {
                type: "object",
                properties: {
                    topic: {
                        type: "string",
                        description: "Tema específico: 'logScale', 'controlSelection', 'multipleTests', 'cumulativeInterval', 'backToEuros', 'nanCheck', 'modelOptions', 'configTemplate'. Omitir para todos.",
                    },
                },
            },
            skipPermission: true,
            handler: async (args) => {
                if (args.topic && LESSONS_LEARNED[args.topic]) {
                    return LESSONS_LEARNED[args.topic];
                }
                return Object.entries(LESSONS_LEARNED)
                    .map(([k, v]) => v)
                    .join('\n\n---\n\n');
            },
        },

        {
            name: "causal_impact_checklist",
            description: "Devuelve el checklist completo de validación antes, durante y después de un análisis CausalImpact para proyectos Melia.",
            parameters: { type: "object", properties: {} },
            skipPermission: true,
            handler: async () => `## Checklist CausalImpact — WPP/Melia

### ✅ ANTES del análisis
- [ ] Controles NO afectados por la intervención (mercados geográficos sin campaña, canales no pausados)
- [ ] Período pre mínimo 3× el post (ej: post=50 días → pre mínimo 150 días)
- [ ] Sin NaN en ninguna columna (tfp-causalimpact falla sin mensaje útil)
- [ ] Días de incidencia de tracking marcados con Diag_Imputado=1 e imputados
- [ ] Máximo 2 análisis independientes sobre los mismos datos (A + réplica B)
- [ ] Config JSON con utf-8-sig para tolerar BOM de Windows

### ✅ SELECCIÓN DE CONTROLES
- [ ] Correlación calculada en PRIMERAS DIFERENCIAS (no niveles)
- [ ] Calculada SOLO en pre-período (no contaminar con el post)
- [ ] Umbral 0.25 para mercados geográficos, 0.20 para Control_SM_*
- [ ] Promo_* siempre incluidas si tienen actividad en el pre (skip filtro correlación)

### ✅ TRANSFORMACIÓN
- [ ] Escala logarítmica en series monetarias: np.log()
- [ ] log1p() para sesiones (pueden tener ceros): np.log1p()
- [ ] Promo_* sin transformar (son 0/1)

### ✅ MODELO
- [ ] ModelOptions con prior_level_sd=0.01 y seasons=[Seasons(7,1)] (semanal)
- [ ] Semilla fija seed=42 para reproducibilidad
- [ ] datos.reset_index(drop=True) antes de fit_causalimpact
- [ ] Traducción de fechas a índices enteros correcta

### ✅ RESULTADOS
- [ ] exp() ANTES de sumar para volver a euros
- [ ] Intervalo del acumulado desde cumulative_effects del ÚLTIMO día (no suma de diarios)
- [ ] p-value < 0.05 para significancia estadística
- [ ] Efecto relativo coherente con expectativas de negocio

### ✅ INFORME
- [ ] Partir de plantilla branded: analysis/causal_impact/templates/causal_impact_report_template_branded.html
- [ ] Paleta WPP Media (Navy, Lime, Blue, Teal)
- [ ] Imágenes embebidas en base64 (HTML standalone)
- [ ] PDF generado a partir del HTML
- [ ] Nombre fichero: informe-<estudio>_branded.html`,
        },
    ],

    hooks: {
        onSessionStart: async (input, invocation) => {
            await session.log("🔬 CausalImpact Expert activado — TFP WPP/Melia", { ephemeral: true });
            return { additionalContext: CI_SYSTEM_CONTEXT };
        },

        onUserPromptSubmitted: async (input, invocation) => {
            if (!isCIRelated(input.prompt)) return;

            const topic = detectTopic(input.prompt);
            const lesson = topic ? `\n\n### Aprendizaje relevante\n${LESSONS_LEARNED[topic] ?? ''}` : '';

            return {
                additionalContext: `[CausalImpact Expert] El usuario pregunta sobre TFP CausalImpact.${lesson}
Responde en español. Usa el API real de tfp-causalimpact.
CRÍTICOS a recordar siempre:
- Transformación log diferenciada por tipo de columna (monetarias/sesiones/promo)
- Correlación en primeras diferencias SOLO en pre para seleccionar controles
- Intervalo acumulado desde cumulative_effects del ÚLTIMO día, no suma de percentiles
- exp() ANTES de sumar para volver a euros
- datos.reset_index(drop=True) antes de fit_causalimpact
- Estacionalidad semanal en ModelOptions (seasons=[Seasons(7,1)])
Código autocomentado en español, siguiendo convenciones del repo.`,
            };
        },
    },
});
