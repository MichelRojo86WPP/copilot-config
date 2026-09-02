# Contexto WPP Media — convenciones de proyecto y entregables

Cómo se aplica Meridian GeoX dentro de un repositorio de análisis de WPP Media: convenciones, ubicación de los proyectos, encaje con las otras metodologías del equipo y guía de estilo de los entregables.

> **Nota:** este documento recoge únicamente conocimiento **portable** de WPP Media, reutilizable con cualquier cliente. El contexto específico de cada cliente (particularidades de su negocio, integraciones internas, rutas de su propio repositorio) vive en el repositorio de ese cliente, no aquí.

---

## 1. Encaje en el ecosistema analítico del equipo

El repositorio cubre tres familias de análisis causal y de atribución que se solapan parcialmente. Elegir la equivocada es la fuente de error más cara.

| | **Meridian GeoX** | **CausalImpact (TFP)** | **Meridian MMM** |
|---|---|---|---|
| Naturaleza | Experimento **planificado** | Cuasi-experimento **retrospectivo** | Modelo **observacional** |
| ¿Se interviene? | Sí, se decide qué geos tratar | No, la intervención ya ocurrió | No |
| Unidad de análisis | Geografías (DMA, provincia, mercado) | Serie temporal tratada + controles | Geo × semana × canal |
| Motor | JAX (TBR + placebos) | TFP (BSTS bayesiano) | TFP (MCMC bayesiano) |
| Horizonte típico | 4–8 semanas de vuelo | Ventana ya ocurrida | 2–3 años de histórico |
| Salida principal | Lift incremental, iCPD, iROAS | Efecto absoluto y relativo, CI | ROI/mROI, curvas, presupuesto óptimo |
| Skill | `skills/meridian-geox/` | `analysis/causal_impact/` + extensión `causal-impact-expert` | `skills/meridian-mmm/` |
| Proyectos | `projects/geo-experiments/` | `projects/causal-impact/` | `projects/media-mix/` |

### Árbol de decisión

```
¿Puedo decidir de antemano qué geografías reciben el tratamiento?
├── SÍ  → Meridian GeoX (evidencia causal más fuerte disponible)
└── NO
    ├── ¿Hubo un evento puntual identificable con un antes/después claro?
    │   └── SÍ → CausalImpact
    └── ¿Quiero explicar y repartir la inversión entre muchos canales?
        └── SÍ → Meridian MMM
```

### El ciclo virtuoso GeoX ↔ MMM

Es el flujo objetivo del equipo:

1. El **MMM** identifica un canal con ROI de alta incertidumbre o contraintuitivo.
2. Se diseña un **geo-experimento** sobre ese canal concreto (`run_design`).
3. Se ejecuta y se analiza (`analyze`) obteniendo evidencia causal.
4. El `AnalysisResult` se convierte en **prior de ROI** del MMM vía `CalibrationBuilder`.
5. El MMM re-entrenado es más fiable → mejores decisiones de presupuesto.

Detalle completo en `references/mmm-calibration.md`.

---

## 2. Ubicación y convención de proyectos

Los geo-experimentos viven en:

```
projects/geo-experiments/<cliente>-<marca-o-mercado>-<año>/
├── run_design.py            ← FASE PRE-TEST: genera y selecciona el diseño
├── run_analysis.py          ← FASE POST-TEST: analiza los resultados
├── run_calibration.py       ← OPCIONAL: convierte el resultado en priors del MMM
├── config/
│   ├── design_config.json   ← parámetros del diseño
│   └── analysis_config.json ← parámetros del análisis
├── data/
│   ├── pretest.csv          ← datos de diseño
│   └── posttest.csv         ← datos de análisis
├── outputs/
│   ├── design.json          ← EL DISEÑO CONGELADO (artefacto crítico)
│   ├── charts/              ← PNG numerados
│   └── reports/             ← HTML standalone branded + PDF
└── README.md                ← qué se testó, periodos, cómo replicarlo
```

**Regla de autosuficiencia del repo:** cualquier compañero debe poder replicar el estudio completo disponiendo únicamente de la carpeta del proyecto.

### `design.json` es el artefacto más crítico

El diseño **debe congelarse antes de activar el test** y **no puede modificarse después**. El análisis tiene que usar exactamente el mismo objeto `Design` que se ejecutó en plataforma, porque la inferencia por placebos reproduce el mecanismo de asignación de ese diseño concreto. Analizar con un diseño distinto invalida los p-values.

- Versionar `outputs/design.json` en git **siempre**.
- Registrar en el `README.md` la fecha de congelación y el `design_id` seleccionado.
- Si el test se replantea, generar un diseño nuevo con nombre nuevo; no sobrescribir.

---

## 3. Nomenclatura de proyectos

| Elemento | Convención | Ejemplo |
|---|---|---|
| Carpeta de proyecto | `kebab-case`, `<marca>-<mercado>-<año>` | `cliente-mercado-2026` |
| Ficheros | `kebab-case` | `design-summary.png` |
| Gráficos | Prefijo numérico de orden | `01-design-alignment.png` |
| Reportes branded | Sufijo `_branded` | `geox_report_cliente_branded.html` |
| Commits | Conventional commits | `feat(geox): diseño go-dark cliente-mercado-2026` |

---

## 4. Estilo de código Python — obligatorio

Los scripts de `projects/geo-experiments/` siguen las mismas reglas que el resto del repositorio:

- **Autocomentados en español.** Cada fase del script lleva un comentario de bloque `# --- descripción ---` explicando el objetivo, no cada línea.
- **Docstrings** en todas las funciones: `"""Qué hace, qué devuelve."""`
- Para **decisiones estadísticas concretas** (umbrales, criterios de selección de diseño, exclusión de fechas) añadir una línea explicando el criterio y por qué se eligió.
- Objetivo: un compañero sin contexto previo entiende el flujo completo leyendo el código.

Ejemplo del nivel de detalle esperado:

```python
# --- Selección del diseño ganador -------------------------------------------
# run_design devuelve el DesignSet ya rankeado; el primer elemento es el mejor
# según el criterio interno de la librería (combinación de MDE, R² y coste).
# Aun así verificamos explícitamente el p-value del test A/A: si el diseño
# muestra sesgo A/A significativo (p < alpha), lo descartamos y bajamos al
# siguiente, porque un diseño sesgado invalidaría el análisis posterior.
selected_id = next(iter(design_set.designs))
selected_design = design_set.designs[selected_id]
```

---

## 5. Guía visual de los entregables

Todos los gráficos y reportes siguen la paleta **WPP Media**.

### Paleta obligatoria en matplotlib

```python
# --- Paleta corporativa WPP Media -------------------------------------------
NAVY     = '#000050'   # texto principal, ejes, serie observada
LIME     = '#B0F467'   # acento principal, geos treatment
BLUE     = '#5465FF'   # contrafactual, subheadings
PERIWINK = '#788BFF'   # banda de intervalo de confianza
TEAL     = '#00DBEE'   # geos control, decoraciones
ROJO     = '#E84B4B'   # efectos negativos
VERDE    = '#2DB87A'   # efectos positivos
GRIS     = '#6B7093'   # elementos neutros, rejilla
```

### Convención cromática específica de GeoX

| Elemento | Color |
|---|---|
| Serie observada (treatment) | `NAVY` |
| Contrafactual predicho | `BLUE` (línea discontinua) |
| Banda de confianza | `PERIWINK` con `alpha=0.25` |
| Geos treatment (mapas/asignación) | `LIME` |
| Geos control | `TEAL` |
| Geos excluidos | `GRIS` |
| Lift positivo | `VERDE` |
| Lift negativo | `ROJO` |
| Inicio del periodo de test | Línea vertical `GRIS` discontinua |
| Learning period excluido | Sombreado `GRIS` con `alpha=0.15` |

### Reportes HTML

Partir siempre de la plantilla branded del repositorio:

```
analysis/geo-experiments/templates/geox_report_template_branded.html
```

Estructura de secciones esperada en un informe de geo-experimento:

1. Resumen ejecutivo con KPIs destacados (lift incremental, iCPD, significancia)
2. Diseño del experimento (tipo, duración, celdas, MDE proyectado, presupuesto)
3. Asignación de geografías (treatment / control / excluidos)
4. Validación pre-test (alineamiento, R², test A/A)
5. Resultados del análisis (efecto, intervalos, p-value)
6. Interpretación de negocio y recomendaciones
7. Anexo: metodología (TBR + inferencia por placebos) y glosario

Idioma de todos los entregables: **español**. Formato: HTML standalone con imágenes embebidas en base64 + PDF.

---

## 6. Checklist de proyecto

**Antes de congelar el diseño**
- [ ] Datos diarios, sin NaN, sin valores negativos en `conversions`
- [ ] Pretest ≥ 3× duración del test (ideal: ≥ 1 año si hay estacionalidad)
- [ ] `QualityCheckResult` revisado y sin errores bloqueantes
- [ ] MDE proyectado por debajo del efecto que el negocio considera relevante
- [ ] Presupuesto requerido validado con el cliente
- [ ] p-value del test A/A no significativo
- [ ] Geos propuestos validados como operables por el equipo de plataforma
- [ ] `design.json` exportado, versionado en git y documentado en el README

**Antes de comunicar resultados**
- [ ] Se ha usado exactamente el mismo `design.json` congelado
- [ ] Learning periods y fechas con incidencias excluidos y documentados
- [ ] Nº de placebos válidos por encima del umbral de warning (≥100)
- [ ] `QualityCheckResult` del análisis revisado
- [ ] Intervalo de confianza reportado indicando su nivel real (90% con `alpha=0.1`)
- [ ] Interpretación de negocio revisada por el equipo de cuenta
