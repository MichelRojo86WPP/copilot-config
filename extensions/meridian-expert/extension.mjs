// Extension: meridian-expert
// Agente experto en Google Meridian MMM para proyectos WPP/Melia
// Inyecta conocimiento especializado de Meridian y proporciona herramientas
// de referencia rápida para el workflow end-to-end de Media Mix Modeling.

import { joinSession } from "@github/copilot-sdk/extension";

// --- Contexto base que se inyecta en cada sesión ---
const MERIDIAN_SYSTEM_CONTEXT = `
## Experto en Google Meridian MMM — Contexto del proyecto

Eres un experto en **Google Meridian**, el framework bayesiano de Marketing Mix Modeling (MMM)
de código abierto. Estás trabajando en el repositorio **WPPOpen/advanced_analytics_melia**
de WPP Media para Meliá Hotels International.

### Ubicación del código Meridian
- Librería base: \`analysis/media-mix/meridian/\` (copia de google/meridian, commit 11f597d)
- Proyectos MMM: \`projects/media-mix/<cliente>-<año>/\`
- Documentación: \`docs/setup/google-meridian-knowledge.md\`
- Notebook referencia: \`analysis/media-mix/meridian/demo/Meridian_Getting_Started.ipynb\`

### Imports correctos de Meridian (API real)
\`\`\`python
from meridian import constants
from meridian.analysis import analyzer, optimizer, summarizer, visualizer
from meridian.analysis.review import reviewer
from meridian.data import data_frame_input_data_builder
from meridian.model import model, prior_distribution, spec
from meridian.model.eda import meridian_eda
from meridian.schema.serde import meridian_serde
import tensorflow_probability as tfp
\`\`\`

### Workflow end-to-end
1. DataFrameInputDataBuilder (fluent) → InputData
2. PriorDistribution + ModelSpec → configuración bayesiana
3. model.Meridian(input_data, model_spec) → instancia mmm
4. mmm.sample_prior(500) + MeridianEDA → análisis exploratorio
5. mmm.sample_posterior(n_chains, n_adapt, n_burnin, n_keep) → ENTRENAMIENTO GPU
6. ModelReviewer → health checks (R-hat < 1.1)
7. ModelDiagnostics + ModelFit → diagnósticos
8. Summarizer → reportes HTML de resultados
9. BudgetOptimizer → optimización de presupuesto
10. meridian_serde.save_meridian → serialización .binpb

### Convenciones del repositorio
- Cada proyecto en \`projects/media-mix/<cliente>-<año>/\` debe ser autosuficiente
- Fichero principal: \`run_analysis.py\` (autocomentado en español)
- Reportes: HTML standalone branded (paleta WPP Media) + PDF
- Idioma del código y comentarios: español
- Commits: conventional commits (feat:, fix:, refactor:, docs:)

### Paleta WPP Media (para reportes branded)
- Navy: #000050, Lime: #B0F467, Blue: #5465FF, Teal: #00DBEE

### Clases clave del API Meridian
| Clase | Uso |
|-------|-----|
| DataFrameInputDataBuilder | Construir InputData desde DataFrames |
| PriorDistribution | Priors bayesianos (ROI, adstock, etc.) |
| ModelSpec | Hiperparámetros (enable_aks=True recomendado) |
| Meridian | Instancia principal del modelo |
| MeridianEDA | EDA pre-modelado |
| ModelReviewer | Health checks post-modelado |
| ModelDiagnostics | Convergencia (R-hat boxplot) |
| ModelFit | Fitted vs actuals |
| Summarizer | Reportes de resultados |
| BudgetOptimizer | Optimización de presupuesto |
| DataTensors | Tensores para escenarios hipotéticos |
| meridian_serde | Guardar/cargar modelo (.binpb) |
`;

// --- Palabras clave que indican preguntas sobre Meridian ---
const MERIDIAN_KEYWORDS = [
    "meridian", "mmm", "media mix", "budget optim", "roi", "adstock",
    "saturation", "mcmc", "nuts sampler", "sample_posterior", "sample_prior",
    "inputdata", "builder", "modelspec", "priordistr", "dataframe",
    "media_channel", "spend", "impression", "geo", "kpi", "response curve",
    "incremental", "attribution", "media model", "marketing mix"
];

// --- Contexto adicional según el tipo de consulta detectada ---
const TOPIC_CONTEXTS = {
    data: `
### Formato de datos Meridian
El CSV debe tener: geo, time (YYYY-MM-DD), conversions, revenue_per_conversion,
population, <channel>_impression, <channel>_spend, variables de control, Promo.
Ejemplo de datos de muestra: analysis/media-mix/meridian/meridian/data/simulated_data/csv/
`,
    model: `
### Configuración del modelo
\`\`\`python
# Prior ROI LogNormal: roi_mu=0.2, roi_sigma=0.9 son valores de partida estándar
prior = prior_distribution.PriorDistribution(
    roi_m=tfp.distributions.LogNormal(0.2, 0.9, name=constants.ROI_M)
)
model_spec = spec.ModelSpec(prior=prior, enable_aks=True)
mmm = model.Meridian(input_data=data, model_spec=model_spec)
\`\`\`
`,
    training: `
### Parámetros de entrenamiento recomendados
\`\`\`python
mmm.sample_posterior(
    n_chains=10,     # Paralelo en GPU; reducir a 4 en CPU
    n_adapt=2000,    # Fase adaptación NUTS
    n_burnin=500,    # Muestras warmup descartadas
    n_keep=1000,     # Muestras posteriores finales (aumentar a 2000 en prod)
    seed=0           # Reproducibilidad
)
\`\`\`
Tiempo estimado: 10-30 min en GPU T4.
`,
    optimization: `
### Optimización de presupuesto
\`\`\`python
budget_optimizer = optimizer.BudgetOptimizer(mmm)
# Optimización básica (usa presupuesto histórico)
results = budget_optimizer.optimize()
# Optimización con presupuesto personalizado y restricciones
results = budget_optimizer.optimize(
    new_data=data_tensors,
    budget=5_000_000,
    pct_of_spend=[.2, .1, .2, .2, .3]  # Distribución inicial por canal
)
results.output_optimization_summary('output.html', filepath)
\`\`\`
`,
};

// --- Detectar si el prompt es relevante para Meridian ---
function isMeridianRelated(prompt) {
    const lower = prompt.toLowerCase();
    return MERIDIAN_KEYWORDS.some(kw => lower.includes(kw));
}

// --- Detectar el subtema específico del prompt ---
function detectTopic(prompt) {
    const lower = prompt.toLowerCase();
    if (lower.match(/dato|csv|dataframe|builder|inputdata|cargar|formato/))
        return "data";
    if (lower.match(/model|spec|prior|configurar|roi_mu|lognormal/))
        return "model";
    if (lower.match(/train|entrenar|sample_posterior|cadena|chain|burnin/))
        return "training";
    if (lower.match(/optim|presupuest|budget|alloc|pct_of_spend/))
        return "optimization";
    return null;
}

const session = await joinSession({
    tools: [
        {
            name: "meridian_workflow_reference",
            description: "Devuelve la referencia completa del workflow end-to-end de Meridian MMM con el API real. Usar cuando necesites recordar el orden de pasos, los parámetros exactos o las clases involucradas.",
            parameters: {
                type: "object",
                properties: {
                    step: {
                        type: "string",
                        description: "Paso específico del workflow a consultar: 'data', 'model', 'eda', 'training', 'healthcheck', 'diagnostics', 'results', 'optimization', 'save'. Omitir para obtener el workflow completo.",
                    },
                },
            },
            skipPermission: true,
            handler: async (args) => {
                const steps = {
                    data: `## Paso: Cargar y construir InputData\n\`\`\`python\nbuilder = data_frame_input_data_builder.DataFrameInputDataBuilder(\n    kpi_type='non_revenue',\n    default_kpi_column='conversions',\n    default_revenue_per_kpi_column='revenue_per_conversion',\n)\nbuilder = (\n    builder\n    .with_kpi(df)\n    .with_revenue_per_kpi(df)\n    .with_population(df)\n    .with_controls(df, control_cols=['sentiment_score_control', 'competitor_sales_control'])\n)\nchannels = ['Channel0', 'Channel1', 'Channel2', 'Channel3', 'Channel4']\nbuilder = builder.with_media(\n    df,\n    media_cols=[f'{ch}_impression' for ch in channels],\n    media_spend_cols=[f'{ch}_spend' for ch in channels],\n    media_channels=channels,\n)\nbuilder = builder.with_non_media_treatments(\n    df, non_media_treatment_cols=['Promo']\n).with_organic_media(\n    df,\n    organic_media_cols=['Organic_channel0_impression'],\n    organic_media_channels=['Organic_channel0'],\n)\ndata = builder.build()\n\`\`\``,

                    model: `## Paso: Configurar modelo\n\`\`\`python\nroi_mu = 0.2\nroi_sigma = 0.9\nprior = prior_distribution.PriorDistribution(\n    roi_m=tfp.distributions.LogNormal(roi_mu, roi_sigma, name=constants.ROI_M)\n)\nmodel_spec = spec.ModelSpec(prior=prior, enable_aks=True)\nmmm = model.Meridian(input_data=data, model_spec=model_spec)\n\`\`\``,

                    eda: `## Paso: EDA\n\`\`\`python\nmmm.sample_prior(500)\neda = meridian_eda.MeridianEDA(mmm)\neda.generate_and_save_report(filename='eda_report.html', filepath=output_dir)\n\`\`\``,

                    training: `## Paso: Entrenamiento MCMC\n\`\`\`python\nmmm.sample_posterior(\n    n_chains=10,\n    n_adapt=2000,\n    n_burnin=500,\n    n_keep=1000,\n    seed=0\n)\n\`\`\`\nRequiere GPU. Tiempo estimado: 10-30 min en T4.`,

                    healthcheck: `## Paso: Health checks\n\`\`\`python\nhealth_summary = reviewer.ModelReviewer(mmm).run()\nhealth_summary.output_model_health_card(filename='health_card.html', filepath=output_dir)\n\`\`\`\nVerificar R-hat < 1.1 para todas las cadenas.`,

                    diagnostics: `## Paso: Diagnósticos\n\`\`\`python\nmodel_diagnostics = visualizer.ModelDiagnostics(mmm)\nmodel_diagnostics.plot_rhat_boxplot()\nmodel_fit = visualizer.ModelFit(mmm)\nmodel_fit.plot_model_fit()\n\`\`\``,

                    results: `## Paso: Resultados\n\`\`\`python\nmmm_summarizer = summarizer.Summarizer(mmm)\nmmm_summarizer.output_model_results_summary(\n    'summary_output.html', output_dir,\n    start_date='2021-01-25', end_date='2024-01-15'\n)\n\`\`\``,

                    optimization: `## Paso: Optimización de presupuesto\n\`\`\`python\nbudget_optimizer = optimizer.BudgetOptimizer(mmm)\nresults = budget_optimizer.optimize()  # usa presupuesto histórico\nresults.output_optimization_summary('optimization_output.html', output_dir)\n\`\`\``,

                    save: `## Paso: Guardar y cargar modelo\n\`\`\`python\n# Guardar\nfile_path = f'{output_dir}/saved_mmm.binpb'\nmeridian_serde.save_meridian(mmm, file_path)\n# Cargar\nmmm = meridian_serde.load_meridian(file_path)\n\`\`\``,
                };

                if (args.step && steps[args.step]) {
                    return steps[args.step];
                }

                // Devolver workflow completo
                return Object.entries(steps)
                    .map(([k, v]) => v)
                    .join('\n\n---\n\n');
            },
        },

        {
            name: "meridian_project_scaffold",
            description: "Genera la estructura de directorios y el esqueleto de run_analysis.py para un nuevo proyecto MMM Meridian en projects/media-mix/<cliente>-<año>/. Incluye configuración, imports y secciones comentadas en español.",
            parameters: {
                type: "object",
                properties: {
                    cliente: {
                        type: "string",
                        description: "Nombre corto del cliente, ej: 'melia'",
                    },
                    year: {
                        type: "string",
                        description: "Año del estudio, ej: '2026'",
                    },
                    channels: {
                        type: "string",
                        description: "Lista de canales de media separados por coma, ej: 'search,social,display,tv,ooh'",
                    },
                    kpi: {
                        type: "string",
                        description: "Nombre del KPI principal, ej: 'bookings' o 'revenue'",
                    },
                },
                required: ["cliente", "year"],
            },
            skipPermission: true,
            handler: async (args) => {
                const { cliente, year, channels = "search,social,display", kpi = "conversions" } = args;
                const channelList = channels.split(",").map(c => c.trim());
                const channelsPy = JSON.stringify(channelList);

                return `## Estructura a crear: projects/media-mix/${cliente}-${year}/

\`\`\`
projects/media-mix/${cliente}-${year}/
├── run_analysis.py         ← Script principal (ejecutar este)
├── config/
│   └── config.json         ← Parámetros del análisis
├── data/
│   └── .gitkeep            ← Añadir aquí los datos Excel/CSV
├── outputs/
│   ├── charts/             ← Gráficos PNG
│   └── reports/            ← HTML + PDF entregables
└── README.md               ← Cómo replicar el estudio
\`\`\`

## Esqueleto de run_analysis.py

\`\`\`python
"""
Análisis MMM Meridian - ${cliente.toUpperCase()} ${year}
======================================================
Script principal de Media Mix Modeling para ${cliente} usando Google Meridian.

Ejecutar:
    python run_analysis.py

Requisitos:
    - GPU disponible (mínimo T4)
    - pip install google-meridian[and-cuda]
    - Datos en data/ (ver README.md para formato)
"""

import json
import os
from pathlib import Path

import numpy as np
import pandas as pd
import tensorflow as tf
import tensorflow_probability as tfp

from meridian import constants
from meridian.analysis import analyzer, optimizer, summarizer, visualizer
from meridian.analysis.review import reviewer
from meridian.data import data_frame_input_data_builder
from meridian.model import model, prior_distribution, spec
from meridian.model.eda import meridian_eda
from meridian.schema.serde import meridian_serde

# =============================================================================
# CONFIGURACIÓN
# =============================================================================

BASE_DIR = Path(__file__).parent
CONFIG_PATH = BASE_DIR / "config" / "config.json"
DATA_DIR = BASE_DIR / "data"
OUTPUT_DIR = BASE_DIR / "outputs"
REPORTS_DIR = OUTPUT_DIR / "reports"
CHARTS_DIR = OUTPUT_DIR / "charts"

with open(CONFIG_PATH) as f:
    CONFIG = json.load(f)

# Asegurar que existen los directorios de salida
REPORTS_DIR.mkdir(parents=True, exist_ok=True)
CHARTS_DIR.mkdir(parents=True, exist_ok=True)


# =============================================================================
# VERIFICACIÓN DE HARDWARE
# =============================================================================

def verificar_hardware():
    """Verifica disponibilidad de GPU antes de iniciar el entrenamiento."""
    gpus = tf.config.experimental.list_physical_devices("GPU")
    print(f"GPUs disponibles: {len(gpus)}")
    if not gpus:
        print("⚠️  ADVERTENCIA: Sin GPU detectada. El entrenamiento será muy lento.")
    return len(gpus) > 0


# =============================================================================
# CARGA DE DATOS
# =============================================================================

def cargar_datos():
    """
    Carga y valida los datos de entrada.
    Devuelve DataFrame con el formato esperado por Meridian.
    """
    data_file = DATA_DIR / CONFIG["data_file"]
    print(f"Cargando datos desde: {data_file}")
    df = pd.read_csv(data_file, index_col=0)
    print(f"Datos cargados: {df.shape[0]} filas × {df.shape[1]} columnas")
    return df


# =============================================================================
# CONSTRUCCIÓN DE INPUTDATA
# =============================================================================

def construir_inputdata(df):
    """
    Construye el objeto InputData de Meridian desde el DataFrame.
    Usa el patrón fluent de DataFrameInputDataBuilder.
    Devuelve objeto InputData listo para el modelo.
    """
    channels = CONFIG["media_channels"]
    control_cols = CONFIG.get("control_columns", [])
    kpi_col = CONFIG["kpi_column"]

    # --- Inicializar builder con el tipo de KPI ---
    builder = data_frame_input_data_builder.DataFrameInputDataBuilder(
        kpi_type=CONFIG.get("kpi_type", "non_revenue"),
        default_kpi_column=kpi_col,
        default_revenue_per_kpi_column=CONFIG.get("revenue_per_kpi_column", "revenue_per_conversion"),
    )

    # --- Añadir datos base ---
    builder = (
        builder
        .with_kpi(df)
        .with_revenue_per_kpi(df)
        .with_population(df)
    )

    if control_cols:
        builder = builder.with_controls(df, control_cols=control_cols)

    # --- Añadir canales de media de pago ---
    builder = builder.with_media(
        df,
        media_cols=[f"{ch}_impression" for ch in channels],
        media_spend_cols=[f"{ch}_spend" for ch in channels],
        media_channels=channels,
    )

    return builder.build()


# =============================================================================
# CONFIGURACIÓN DEL MODELO BAYESIANO
# =============================================================================

def configurar_modelo(data):
    """
    Define los priors bayesianos y la especificación del modelo.
    roi_mu y roi_sigma (LogNormal) controlan la distribución a priori del ROI.
    Devuelve instancia de model.Meridian lista para entrenamiento.
    """
    # Prior ROI LogNormal: mu=0.2, sigma=0.9 son valores de partida conservadores
    # Ajustar con resultados de experimentos reales si se dispone de ellos
    roi_mu = CONFIG.get("roi_prior_mu", 0.2)
    roi_sigma = CONFIG.get("roi_prior_sigma", 0.9)

    prior = prior_distribution.PriorDistribution(
        roi_m=tfp.distributions.LogNormal(roi_mu, roi_sigma, name=constants.ROI_M)
    )

    # enable_aks=True activa el Adstock Kernel Selection automático
    model_spec = spec.ModelSpec(prior=prior, enable_aks=True)

    return model.Meridian(input_data=data, model_spec=model_spec)


# =============================================================================
# ANÁLISIS EXPLORATORIO (EDA)
# =============================================================================

def ejecutar_eda(mmm):
    """
    Genera el reporte HTML de EDA pre-modelado.
    Permite detectar problemas en los datos antes de entrenar.
    """
    print("Generando reporte EDA...")
    mmm.sample_prior(500)
    eda = meridian_eda.MeridianEDA(mmm)
    eda.generate_and_save_report(
        filename="eda_report.html",
        filepath=str(REPORTS_DIR),
    )
    print(f"EDA guardado en: {REPORTS_DIR}/eda_report.html")


# =============================================================================
# ENTRENAMIENTO
# =============================================================================

def entrenar_modelo(mmm):
    """
    Ejecuta el muestreo MCMC posterior (NUTS sampler).
    Es el paso más costoso computacionalmente; requiere GPU.
    Los parámetros n_chains, n_adapt, n_burnin, n_keep se leen de config.json.
    """
    params = CONFIG.get("sampling_params", {})
    print(f"Iniciando entrenamiento MCMC: {params}")
    mmm.sample_posterior(
        n_chains=params.get("n_chains", 10),
        n_adapt=params.get("n_adapt", 2000),
        n_burnin=params.get("n_burnin", 500),
        n_keep=params.get("n_keep", 1000),
        seed=params.get("seed", 0),
    )
    print("✅ Entrenamiento completado.")


# =============================================================================
# VALIDACIÓN Y DIAGNÓSTICOS
# =============================================================================

def validar_modelo(mmm):
    """
    Ejecuta health checks automáticos y genera reporte de diagnósticos.
    Verifica convergencia (R-hat < 1.1) y calidad del ajuste.
    """
    # --- Health checks ---
    print("Ejecutando health checks...")
    health_summary = reviewer.ModelReviewer(mmm).run()
    health_summary.output_model_health_card(
        filename="health_card.html",
        filepath=str(REPORTS_DIR),
    )

    # --- Diagnósticos visuales ---
    diag = visualizer.ModelDiagnostics(mmm)
    diag.plot_rhat_boxplot()

    fit = visualizer.ModelFit(mmm)
    fit.plot_model_fit()

    print(f"Health card guardada en: {REPORTS_DIR}/health_card.html")


# =============================================================================
# RESULTADOS Y OPTIMIZACIÓN
# =============================================================================

def generar_resultados(mmm):
    """
    Genera el reporte HTML de resultados (ROI, contribuciones, response curves)
    y ejecuta la optimización de presupuesto con el presupuesto histórico.
    """
    period = CONFIG.get("analysis_period", {})

    # --- Reporte de resultados ---
    print("Generando reporte de resultados...")
    mmm_summarizer = summarizer.Summarizer(mmm)
    mmm_summarizer.output_model_results_summary(
        "summary_output.html",
        str(REPORTS_DIR),
        start_date=period.get("start_date"),
        end_date=period.get("end_date"),
    )

    # --- Optimización de presupuesto ---
    print("Ejecutando optimización de presupuesto...")
    budget_optimizer = optimizer.BudgetOptimizer(mmm)
    results = budget_optimizer.optimize()
    results.output_optimization_summary("optimization_output.html", str(REPORTS_DIR))

    print(f"Reportes guardados en: {REPORTS_DIR}/")


# =============================================================================
# GUARDAR MODELO
# =============================================================================

def guardar_modelo(mmm):
    """Serializa el modelo entrenado en formato .binpb (Protocol Buffer)."""
    model_path = str(REPORTS_DIR / "saved_mmm.binpb")
    meridian_serde.save_meridian(mmm, model_path)
    print(f"Modelo guardado en: {model_path}")


# =============================================================================
# MAIN
# =============================================================================

if __name__ == "__main__":
    print("=" * 60)
    print(f"MMM Meridian — ${cliente.toUpperCase()} ${year}")
    print("=" * 60)

    verificar_hardware()
    df = cargar_datos()
    data = construir_inputdata(df)
    mmm = configurar_modelo(data)
    ejecutar_eda(mmm)
    entrenar_modelo(mmm)
    validar_modelo(mmm)
    generar_resultados(mmm)
    guardar_modelo(mmm)

    print("\\n✅ Análisis completado.")
\`\`\`

## config/config.json

\`\`\`json
{
  "data_file": "${cliente}_media_data.csv",
  "kpi_column": "${kpi}",
  "kpi_type": "non_revenue",
  "revenue_per_kpi_column": "revenue_per_conversion",
  "media_channels": ${channelsPy},
  "control_columns": [],
  "analysis_period": {
    "start_date": "${year}-01-01",
    "end_date": "${year}-12-31"
  },
  "roi_prior_mu": 0.2,
  "roi_prior_sigma": 0.9,
  "sampling_params": {
    "n_chains": 10,
    "n_adapt": 2000,
    "n_burnin": 500,
    "n_keep": 1000,
    "seed": 0
  }
}
\`\`\``;
            },
        },
    ],

    hooks: {
        // Inyectar conocimiento Meridian al inicio de cada sesión
        onSessionStart: async (input, invocation) => {
            await session.log("🧪 Meridian Expert activado — MMM WPP/Melia", { ephemeral: true });
            return {
                additionalContext: MERIDIAN_SYSTEM_CONTEXT,
            };
        },

        // Enriquecer prompts que mencionen Meridian con contexto específico
        onUserPromptSubmitted: async (input, invocation) => {
            if (!isMeridianRelated(input.prompt)) return;

            const topic = detectTopic(input.prompt);
            const extra = topic ? TOPIC_CONTEXTS[topic] : "";

            return {
                additionalContext: `[Meridian Expert] El usuario está preguntando sobre Meridian MMM.${extra}
Responde en español. Usa el API real de Meridian (no pseudocódigo).
Cuando generes código Python, sigue las convenciones del repositorio:
autocomentado en español, docstrings, comentarios de bloque por fase.`,
            };
        },
    },
});
