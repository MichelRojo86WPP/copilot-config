# Guia de Skills de Copilot

## Que son las skills

Las skills son instrucciones especializadas que transforman a Copilot en un agente experto para tareas concretas. Se invocan escribiendo `/skill nombre-skill` en cualquier sesion de Copilot.

## Como instalar skills globalmente

Las skills globales van en:
```
~/.copilot/plugins/superpowers/skills/
```

Cada skill es una carpeta con al menos un fichero `SKILL.md`. Para instalar:
```powershell
Copy-Item skills\mi-skill "$env:USERPROFILE\.copilot\plugins\superpowers\skills\" -Recurse
```

Reiniciar Copilot para que las cargue.

## Skills instaladas

### data-scientist
**Uso:** `/skill data-scientist`

Convierte a Copilot en un data scientist senior. Capacidades:
- Analisis exploratorio de datos (EDA) con pandas, seaborn, matplotlib
- Construccion de pipelines ML con scikit-learn, XGBoost, LightGBM
- Feature engineering y seleccion de variables
- Evaluacion de modelos y metricas
- Visualizaciones avanzadas
- Interpretabilidad de modelos (SHAP, LIME)

Ideal para: proyectos de ML, notebooks de analisis, competiciones de datos.

---

### data-analyst
**Uso:** `/skill data-analyst`

Analista de datos para negocio. Capacidades:
- Queries SQL optimizadas
- Analisis con pandas y Excel
- Dashboards y reportes para stakeholders
- KPIs y metricas de negocio
- Storytelling con datos
- Pivot tables, agrupaciones, cohort analysis

Ideal para: reportes de negocio, analisis de ventas, metricas operacionales.

---

### causal-impact
**Uso:** `/skill causal-impact`

Analisis de impacto causal y experimentos. Capacidades:
- A/B testing estadistico riguroso
- Diferencias en diferencias (DiD)
- Variables instrumentales
- Regression discontinuity
- Synthetic control
- Analisis pre/post con CausalImpact de Google

Ideal para: evaluar el impacto de campanas, cambios de producto, politicas.

---

### ml-ops-engineer
**Uso:** `/skill ml-ops-engineer`

Ingenieria MLOps para produccion. Capacidades:
- Pipelines de datos y modelos con Airflow, Prefect
- Containerizacion con Docker y Kubernetes
- Tracking de experimentos con MLflow, W&B
- Serving de modelos con FastAPI, TorchServe
- Monitoring y drift detection
- CI/CD para modelos de ML

Ideal para: llevar modelos a produccion, automatizar pipelines.

---

### runbook-generator
**Uso:** `/skill runbook-generator`

Genera documentacion operacional automaticamente. Capacidades:
- Runbooks de incidentes paso a paso
- Playbooks de recuperacion
- Documentacion de sistemas y APIs
- Diagramas de arquitectura en texto
- Procedimientos de oncall

Ideal para: documentar sistemas, preparar respuesta a incidentes.

---

### release-manager
**Uso:** `/skill release-manager`

Gestiona releases de software. Capacidades:
- Generacion de changelogs automatica
- Bumping de versiones (semver)
- Release notes para usuarios
- Gestion de ramas de release
- Coordinacion de deploys

Scripts incluidos:
- `changelog_generator.py` — genera CHANGELOG.md desde commits
- `version_bumper.py` — sube version en package.json / pyproject.toml
- `release_planner.py` — planifica el release

Ideal para: proyectos con releases frecuentes, CI/CD.

---

### accelerated-computing-cudf (NVIDIA Oficial)
**Uso:** `/skill accelerated-computing-cudf`

Skill oficial de NVIDIA para GPU DataFrames. Capacidades:
- Uso de `cuDF` como drop-in replacement de pandas en GPU
- `cuDF.pandas`: acelerar codigo pandas existente sin cambiarlo
- Joins, groupby, operaciones vectorizadas en GPU
- CSV/Parquet I/O optimizado
- Dask-cuDF para multi-GPU
- Comparativas de rendimiento CPU vs GPU

Ideal para: datasets grandes (10M+ filas), analisis que tarda demasiado con pandas.

```python
# Ejemplo rapido
import cudf.pandas
cudf.pandas.install()
import pandas as pd  # Ahora usa GPU automaticamente
df = pd.read_csv("huge_file.csv")  # 10x-100x mas rapido
```

## Mejores practicas

1. **Selecciona la skill correcta** para el tipo de tarea
2. **Proporciona contexto** al invocar: describe tus datos, objetivo, etc.
3. **Las skills son acumulativas** — puedes combinar varias en una sesion
4. **Para data science**: combina `data-scientist` + `accelerated-computing-cudf` para maxima potencia

## Crear nuevas skills

Ver la skill `writing-skills` que viene en superpowers:
```
~/.copilot/plugins/superpowers/skills/writing-skills/
```

Estructura minima de una skill:
```
mi-skill/
└── SKILL.md   # Instrucciones del agente en markdown
```

Ejemplo de `SKILL.md`:
```markdown
# Mi Skill Nombre

## Cuando usar esta skill
Describe en que situaciones activarla.

## Comportamiento
Instrucciones detalladas de como debe comportarse el agente.

## Capacidades
- Capacidad 1
- Capacidad 2
```
