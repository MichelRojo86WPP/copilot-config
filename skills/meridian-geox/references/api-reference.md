# Referencia técnica de la API pública de `meridian_geox` v1.0.0

Este documento sirve como referencia interna anti-alucinación para usar la API real de `meridian_geox` en skills y análisis de un repositorio de WPP Media.

## Fuentes verificadas

- Código fuente investigado: `google/meridian-geox` branch `main`, commit `f28de1ac94f74d81f1fde91d8bdb9b438a42fd62`.
- API pública raíz: `meridian_geox/__init__.py:19-47`.
- Tipos, enums y dataclasses: `meridian_geox/api.py`.
- Diseño: `meridian_geox/design.py`.
- Análisis: `meridian_geox/analysis.py`.
- Calidad de datos: `meridian_geox/data_quality/data_quality.py`.
- Documentación oficial: `https://developers.google.com/meridian/geox/api-reference`.

## 1. Importación y API pública

El paquete es plano: el patrón correcto es importar el paquete raíz y acceder a los símbolos exportados.

```python
import meridian_geox as geox
```

Bloque real de `meridian_geox/__init__.py:19-47`:

```python
__version__ = '1.0.0'

from .analysis import analyze
from .analysis import plot_analysis
from .api import AnalysisConfig
from .api import AnalysisMetrics
from .api import AnalysisResult
from .api import Budget
from .api import Constraints
from .api import DataSchema
from .api import Design
from .api import DesignConfig
from .api import DesignSet
from .api import Estimate
from .api import ExperimentType
from .api import GeoAssignmentRule
from .api import GeoGroup
from .api import Methodology
from .api import QualityCheckConfig
from .api import QualityCheckResult
from .api import TestType
from .data_quality.data_quality import check_analysis_data_quality
from .data_quality.data_quality import check_design_data_quality
from .design import compare_designs
from .design import concat_design_reports
from .design import plot_design
from .design import run_design
```

Símbolos exportados en el paquete raíz: `__version__`, `analyze`, `plot_analysis`, `AnalysisConfig`, `AnalysisMetrics`, `AnalysisResult`, `Budget`, `Constraints`, `DataSchema`, `Design`, `DesignConfig`, `DesignSet`, `Estimate`, `ExperimentType`, `GeoAssignmentRule`, `GeoGroup`, `Methodology`, `QualityCheckConfig`, `QualityCheckResult`, `TestType`, `check_analysis_data_quality`, `check_design_data_quality`, `compare_designs`, `concat_design_reports`, `plot_design`, `run_design`.

`DescriptiveMetrics` existe en `api.py:465-540`, pero no aparece en el bloque de imports de `__init__.py`.

## 2. Enums

Valores reales en `api.py:169-192`:

```python
class ExperimentType(enum.Enum):
  HOLDBACK = 1
  GO_DARK = 2
  HEAVY_UP = 3

class GeoAssignmentRule(enum.Enum):
  RANDOM = 1
  STRATIFIED_SAMPLING = 2

class Methodology(enum.Enum):
  TBR = 1
  SDID = 2

class TestType(enum.Enum):
  ONE_SIDED = 1
  TWO_SIDED = 2

class GeoGroup(enum.Enum):
  CONTROL = 1
  TREATMENT = 2
  EXCLUDED = 3
```

Notas:

- `Methodology.SDID` está declarado, pero el flujo inspeccionado sólo documenta TBR como metodología soportada.
- La documentación menciona synthetic control en texto, pero no existe `Methodology.SYNTHETIC_CONTROL`.

## 3. Constantes de esquema y `DataSchema`

Constantes reales en `api.py:29-35`:

```python
DATE = "date"
LOCATION = "location"
CONVERSIONS = "conversions"
SPEND = "spend"
CELL_1 = "cell_1"
MULTICELL_SPEND_REGEX = r"^spend_cell_[1-9]\d*$"
```

`DataSchema` está definido con pandera en `api.py:143-166`:

```python
class DataSchema(pa.DataFrameModel):
  """Schema for geo data."""

  # Required: Date.
  date: pa.typing.Series[pd.Timestamp] = pa.Field(alias=DATE, nullable=False)
  # Required: Location Name (String).
  location: pa.typing.Series[str] = pa.Field(
      alias=LOCATION, str_matches=r".+", nullable=False
  )
  # Required: Conversions (Numeric).
  conversions: pa.typing.Series[float] = pa.Field(
      alias=CONVERSIONS, nullable=False
  )
  # Optional: Spend (Numeric).
  spend: Optional[pa.typing.Series[float]] = pa.Field(
      alias=SPEND, ge=0, nullable=False
  )
  # Optional: Spend per cell (Numeric).
  spend_by_cell: Optional[pa.typing.Series[float]] = pa.Field(
      alias=r"^spend_cell_[1-9]\d*$", regex=True, ge=0, nullable=False
  )
```

Tipos anotados relevantes en `api.py:38-124`:

- `Timestamp`: valida `pd.Timestamp` y serializa a string.
- `SortedSet[T]`: serializa sets como listas ordenadas.
- `JnpArray`: serializa arrays JAX vía `.tolist()`.
- `DataFrame`: fuerza columnas a minúsculas, convierte `date` con `pd.to_datetime` y serializa con `to_dict(orient="split")`.
- `_validate_duration`: exige `timedelta` en días/semanas completos; rechaza horas, minutos, segundos y microsegundos.

## 4. `DesignConfig`

`DesignConfig` es una pydantic dataclass (`api.py:195-282`, `arbitrary_types_allowed=True`). La tabla siguiente contiene los campos documentados en el código; aunque algunas notas internas hablan de 17 parámetros, el código inspeccionado contiene 18 campos.

| Parámetro | Tipo | Default | Descripción |
|---|---|---:|---|
| `experiment_duration` | `datetime.timedelta` | obligatorio | Duración del experimento; debe ser > 0 y en días/semanas completos. |
| `experiment_types` | `ExperimentType \| dict[str, ExperimentType]` | `ExperimentType.HOLDBACK` | Tipo global o por celda (`cell_1`, `cell_2`, etc.). |
| `methodology` | `Methodology` | `Methodology.TBR` | Metodología de modelado; TBR es la metodología soportada/documentada. |
| `geo_assignment_rule` | `GeoAssignmentRule` | `GeoAssignmentRule.STRATIFIED_SAMPLING` | Generación de candidatos aleatoria o estratificada. |
| `cell_count` | `int` | `1` | Número de celdas de tratamiento; > 0. |
| `alpha` | `float` | `0.1` | Nivel de significancia; 0 < alpha < 1. |
| `power` | `float` | `0.8` | Potencia estadística; 0 < power < 1. |
| `test_type` | `TestType` | `TestType.TWO_SIDED` | Test unilateral o bilateral. |
| `design_output_count` | `int` | `10` | Número de diseños devueltos; > 0. |
| `cost_per_incremental_conversion` | `float \| dict[str, float]` | `1.0` | CpIC; sólo se replica a celdas `HOLDBACK`. |
| `n_candidates` | `int` | `100_000` | Candidatos para el fast scoring. |
| `n_ranked_candidates` | `int` | `100` | Candidatos con scoring completo. |
| `max_candidate_generation_retries` | `int` | `10` | Reintentos de generación de candidatos. |
| `seed` | `int` | `42` | Semilla PRNG. |
| `slope_tolerance` | `float` | `0.2` | Diferencia simétrica máxima en slope check. |
| `min_r2` | `float` | `0.8` | R² out-of-sample mínimo para aceptar un diseño. |
| `num_strata` | `int` | `4` | Número de estratos para k-means. |
| `k_means_iterations` | `int` | `10` | Iteraciones de k-means. |

Validador `_normalize` real (`api.py:250-266`):

```python
@pydantic.model_validator(mode="after")
def _normalize(self) -> "DesignConfig":
    """Normalizes the config to a standard format."""
    if isinstance(self.experiment_types, ExperimentType):
      self.experiment_types = {
          f"cell_{i}": self.experiment_types
          for i in range(1, self.cell_count + 1)
      }

    if isinstance(self.cost_per_incremental_conversion, float):
      cpic_val = self.cost_per_incremental_conversion
      self.cost_per_incremental_conversion = {
          cell: cpic_val
          for cell, et in self.experiment_types.items()
          if et == ExperimentType.HOLDBACK
      }
    return self
```

## 5. `Budget` y `Constraints`

Código real de `Budget` (`api.py:285-297`):

```python
@pydantic.dataclasses.dataclass
class Budget:
  """Budget constraint for a single cell."""

  budget: Optional[float] = None
  budget_pct: Optional[float] = None

  def __post_init__(self):
    if (self.budget is not None) == (self.budget_pct is not None):
      raise ValueError(
          "Exactly one of 'budget' or 'budget_pct' must be provided."
      )
```

Regla de exclusividad: debe indicarse exactamente uno de `budget` o `budget_pct`; indicar ambos o ninguno lanza `ValueError`.

Código real de `Constraints` (`api.py:300-330`):

```python
@pydantic.dataclasses.dataclass
class Constraints:
  """Constraints for designing a GeoX study."""

  included_control_geos: SortedSet[str] = dataclasses.field(default_factory=set)
  excluded_geos: SortedSet[str] = dataclasses.field(default_factory=set)
  excluded_dates: SortedSet[Timestamp] = dataclasses.field(default_factory=set)
  budget_constraint: Union[Budget, dict[str, Budget], None] = None
  max_conversions_percent: Optional[float] = 0.3

  def normalize(self, experiment_types: dict[str, ExperimentType]):
    """Normalizes budget based on experiment types."""
    if isinstance(self.budget_constraint, Budget):
      self.budget_constraint = {
          cell: self.budget_constraint for cell in experiment_types
      }
    elif self.budget_constraint is None:
      self.budget_constraint = {}
```

Semántica documentada por tipo de experimento:

| Tipo | Campo esperado | Semántica | Default si falta `budget_pct` |
|---|---|---|---:|
| `HOLDBACK` | `budget` | Presupuesto absoluto máximo por celda. | No documentado para `budget`. |
| `GO_DARK` | `budget_pct` | Cambio porcentual negativo; `-1.0` = apagado total. | `-1.0` |
| `HEAVY_UP` | `budget_pct` | Cambio porcentual positivo; `1.0` = +100%. | `1.0` |

`max_conversions_percent` tiene default `0.3` y debe ser < `0.5` según la tabla maestra de parámetros. En multi-cell se interpreta como el total agregado de todas las celdas de tratamiento, no por celda.

Lógica real de presupuesto en `design.py:_get_design_summary`:

```python
budget_constraint = budget_constraints.get(cell_name)
if util.is_go_dark_or_heavy_up(experiment_type):
    default_pct = (
        -1.0 if experiment_type == api.ExperimentType.GO_DARK else 1.0
    )
    budget_percent = (
        budget_constraint.budget_pct
        if budget_constraint and budget_constraint.budget_pct is not None
        else default_pct
    )
    estimation_eval_spend_np = estimation_eval_spend_np_dict[cell_name]
    treatment_geo_cost = float(
        np.sum(estimation_eval_spend_np[:, treatment_indices])
    )
    required_budget = treatment_geo_cost * budget_percent
else:
    # HOLDBACK
    cpic = cpics[cell_name]
    required_budget = total_mde_abs * cpic

design_implied_cpic = (
    abs(required_budget / total_mde_abs) if total_mde_abs > 0 else 0.0
)
```

## 6. `PerCellDesign`, `Design` y `DesignSet`

Código real de `PerCellDesign` (`api.py:333-349`):

```python
@dataclasses.dataclass
class PerCellDesign:
  """Design results for a single cell."""

  treatment_geos: SortedSet[str]
  minimum_detectable_effect: float
  design_implied_cpic: float
  p_value: float
  budget: float
  counterfactual_conversions: Annotated[
      Optional[DataFrame], pydantic.Field(exclude=True)
  ] = dataclasses.field(default=None, repr=False)
```

Código real de `Design` (`api.py:352-390`):

```python
@dataclasses.dataclass
class Design:
  """A design for a GeoX study."""

  designs: dict[str, PerCellDesign]
  control_geos: SortedSet[str]
  excluded_geos: SortedSet[str]
  excluded_dates: SortedSet[Timestamp] = dataclasses.field(default_factory=set)
  design_config: Optional[DesignConfig] = None
  constraints: Optional[Constraints] = None
  quality_check_result: Optional[QualityCheckResult] = None
  geo_stratum_labels: Optional[JnpArray] = dataclasses.field(
      default=None, repr=False
  )
  data: Optional[DataFrame] = dataclasses.field(default=None, repr=False)

  def export_to_json(self) -> str:
    """Exports the design to a JSON file."""
    return pydantic.TypeAdapter(Design).dump_json(self).decode()

  @classmethod
  def load_from_json(cls, json_str: str) -> "Design":
    """Loads the design from a JSON file."""
    return pydantic.TypeAdapter(cls).validate_json(json_str)
```

Código real de `DesignSet` (`api.py:393-406`):

```python
@dataclasses.dataclass
class DesignSet:
  """A set of designs for a GeoX study."""

  designs: dict[str, Design]
  design_metrics: DataFrame = dataclasses.field(repr=False)
```

Columnas exactas de `design_metrics` construidas en `design.py:_get_design_summary`:

| Columna | Descripción |
|---|---|
| `design_id` | Identificador único del diseño. |
| `cell` | Celda de tratamiento. |
| `design_methodology` | Combinación `{GeoAssignmentRule}-{Methodology}`, por ejemplo `STRATIFIED_SAMPLING-TBR`. |
| `r2` | R² out-of-sample. |
| `mde` | Minimum detectable effect relativo. |
| `mde_abs` | MDE absoluto: `mde * treatment_conversion_volume`. |
| `p_value (AA)` | p-value del test A/A pre-experimento. |
| `budget` | Presupuesto o cambio de gasto proyectado. |
| `design_implied_cpic` | CpIC implícito calculado como `abs(required_budget / total_mde_abs)`. |
| `treatment_conversions_pct` | Porcentaje de conversiones en geos de tratamiento. |
| `treatment_geo_count` | Número de geos de tratamiento. |

El ranking de diseños se hace por el `mde` máximo entre celdas, ascendente (`design.py:_rank_and_filter_metrics`).

## 7. `AnalysisConfig`

Tabla completa de parámetros (`api.py:409-462`):

| Parámetro | Tipo | Default | Descripción |
|---|---|---:|---|
| `design` | `Design` | obligatorio | Diseño usado en el experimento. |
| `analysis_start_date` | `Timestamp` | obligatorio | Inicio del periodo de test. |
| `analysis_end_date` | `Timestamp` | obligatorio | Fin del periodo de test. |
| `pretest_end_date` | `Optional[Timestamp]` | `None` | Si falta, el pretest usa todo lo anterior a `analysis_start_date`. |
| `excluded_dates` | `SortedSet[Timestamp]` | `set()` | Fechas excluidas del análisis. |
| `alpha` | `Optional[float]` | `None` | Si falta, hereda de `design.design_config`. |
| `test_type` | `Optional[TestType]` | `None` | Si falta, hereda de `design.design_config`. |
| `n_placebo_candidates` | `int` | `100_000` | Candidatos placebo iniciales. |
| `n_top_placebos` | `int` | `500` | Placebos válidos top usados en inferencia. |
| `min_placebo_r2` | `float` | `0.6` | R² out-of-sample mínimo para conservar un placebo. |
| `min_placebo_count_warning` | `int` | `100` | Umbral para warning por pocos placebos. |
| `min_placebo_count_error` | `int` | `10` | Umbral para error por pocos placebos. |

Validador de fechas real:

```python
@pydantic.model_validator(mode="after")
def validate_dates(self) -> "AnalysisConfig":
    if self.analysis_start_date > self.analysis_end_date:
      raise ValueError(
          "analysis_start_date must be less than or equal to analysis_end_date."
      )
    if (
        self.pretest_end_date is not None
        and self.pretest_end_date >= self.analysis_start_date
    ):
      raise ValueError(
          "pretest_end_date must be strictly before analysis_start_date."
      )
    return self
```

Generación de placebos en `analysis.py`: se genera sobre geos de control, excluyendo tratamiento; se crean `n_placebo_candidates`, se filtra por `min_placebo_r2`, se ordena por R² descendente y se retienen `n_top_placebos`.

## 8. Resultados de análisis

Estructura real en `api.py:465-540`:

```python
@dataclasses.dataclass
class Estimate:
  point_estimate: float
  lower_bound: float
  upper_bound: float
  standard_deviation: float
  p_value: float


@dataclasses.dataclass
class DescriptiveMetrics:
  estimated_bau_spend: Optional[float] = None


@dataclasses.dataclass
class AnalysisMetrics:
  lift: Estimate
  percent_lift: Estimate
  cumulative_lift: DataFrame = dataclasses.field(default_factory=pd.DataFrame, repr=False)
  counterfactual_conversions: pd.DataFrame = dataclasses.field(default_factory=pd.DataFrame, repr=False)
  pointwise_difference: pd.DataFrame = dataclasses.field(default_factory=pd.DataFrame, repr=False)
  icpd: Optional[Estimate] = None
  cumulative_icpd: Optional[DataFrame] = dataclasses.field(default=None, repr=False)
  descriptive_metrics: Optional[DescriptiveMetrics] = None


@dataclasses.dataclass
class AnalysisResult:
  results: dict[str, AnalysisMetrics]
  analysis_config: AnalysisConfig
  excluded_geos: SortedSet[str] = dataclasses.field(default_factory=set)
  excluded_dates: SortedSet[Timestamp] = dataclasses.field(default_factory=set)
  quality_check_result: Optional[QualityCheckResult] = None
```

DataFrames de `AnalysisMetrics`:

| Campo | Índice | Columnas |
|---|---|---|
| `cumulative_lift` | `test_dates` | `lift`, `lower_bound`, `upper_bound` |
| `cumulative_icpd` | `test_dates` | `icpd`, `lower_bound`, `upper_bound` |
| `counterfactual_conversions` | `pretest_dates + test_dates` | `observed`, `counterfactual`, `lower_bound`, `upper_bound` |
| `pointwise_difference` | fechas completas | `difference`, `lower_bound`, `upper_bound` |

`metrics.icpd` es `Optional[Estimate]` y sólo se informa si hay datos de spend. Para calibración MMM son especialmente relevantes:

- `metrics.icpd.point_estimate`
- `metrics.icpd.standard_deviation`
- `metrics.descriptive_metrics.estimated_bau_spend`

> ⚠️ **`metrics` se obtiene por celda desde `AnalysisResult.results`** (verificado contra
> `meridian-geox` 1.0.0). **No existe `AnalysisResult.metrics`**:
>
> ```python
> result = geox.analyze(data, analysis_config)
> metrics = result.results['cell_1']     # AnalysisMetrics
> print(metrics.lift.point_estimate, metrics.lift.p_value)
> print(metrics.percent_lift.point_estimate)
> print(metrics.icpd.point_estimate)
> ```

`estimated_bau_spend` representa el gasto BAU estimado para los geos incluidos en el análisis de esa celda: tratamiento de la celda + control. No representa el gasto nacional total ni incluye otras celdas de tratamiento.

Lógica documentada de `estimated_bau_spend`:

```python
control_predicted_spend = (
    control_pretest_conversions / treatment_pretest_conversions
) * treatment_test_spend
estimated_bau_spend = treatment_test_spend + control_predicted_spend
```

Para `GO_DARK` / `HEAVY_UP`: `control_test_spend + sum(counterfactual_spend)`.

## 9. Calidad de datos

Código real de `QualityCheckConfig` y `QualityCheckResult` (`api.py:127-140`):

```python
@dataclasses.dataclass
class QualityCheckConfig:
  """Parameters for checking the quality of the input data."""

  # This specific field is for design phase only.
  exclude_geos_no_response: bool = True
  exclude_outlier_dates: bool = True


@dataclasses.dataclass
class QualityCheckResult:
  quality_check_config: QualityCheckConfig
  quality_metrics: DataFrame = dataclasses.field(repr=False)
  outlier_geos: set[str] = dataclasses.field(default_factory=set)
  outlier_dates: set[Timestamp] = dataclasses.field(default_factory=set)
```

Firmas reales en `data_quality/data_quality.py`:

```python
def check_design_data_quality(
    data: pd.DataFrame,
    design_config: api.DesignConfig,
    quality_check_config: api.QualityCheckConfig,
) -> api.QualityCheckResult:

def check_analysis_data_quality(
    data: pd.DataFrame,
    analysis_config: api.AnalysisConfig,
    quality_check_config: api.QualityCheckConfig,
) -> api.QualityCheckResult:
```

Umbrales reales:

```python
_MAX_GEOS = 500
_MAX_ZERO_RESPONSE_PCT = 0.5
_MAX_MISSING_DAYS_PCT = 0.3
_MAX_DUPLICATE_ENTRIES = 0
```

`quality_metrics` tiene columnas `metric`, `value`, `message`, `threshold`.

| Métrica | Umbral | Fase |
|---|---:|---|
| `Too Many Geos` | > 500 | Diseño y análisis |
| `Percentage of missing conversion days` | > 0.3 | Diseño y análisis |
| `Percentage of missing spend days ({cell_name})` | > 0.3 | Sólo `GO_DARK` / `HEAVY_UP` |
| `Duplicate Entries` | > 0 | Diseño y análisis |
| `Spend > 0 and no conversions` | no documentado | Diseño; puebla `outlier_geos` |
| `Outlier pretest dates` | IQR leave-one-out | Diseño y análisis; puebla `outlier_dates` |
| `Percentage of zero response` | > 0.5 | Diseño y análisis |

La detección de fechas outlier usa validación leave-one-out con regresión OLS y corte `Q3 + 3.0 * IQR`; requiere más de 3 fechas.

## 10. Firmas exactas de funciones públicas

Diseño (`design.py`):

```python
def run_design(
    data: pd.DataFrame,
    design_config: api.DesignConfig,
    constraints: api.Constraints,
    data_quality_check_config: api.QualityCheckConfig = api.QualityCheckConfig(),
    design_scorer: Optional[Callable[..., Any]] = None,
) -> api.DesignSet:
  """Designs GeoX experiments."""

def compare_designs(
    data: pd.DataFrame,
    design_requirements: list[tuple[api.DesignConfig, api.Constraints]],
    design_output_count: int = 10,
) -> api.DesignSet:
  """Compares designs based on different design configurations."""

def concat_design_reports(
    design_sets: list[api.DesignSet], design_output_count: int = 10
) -> api.DesignSet:
  """Concatenates a list of design sets and return the top N designs."""

def plot_design(design_to_plot: api.Design):
  """Visualizes pre-test alignment for all cells in separate plots."""

def prepare_data(
    data: pd.DataFrame,
    experiment_duration: datetime.timedelta,
    constraints: api.Constraints,
) -> ProcessedData:
  """Processes data for experiment design."""
```

Notas operativas de diseño:

- `run_design` normaliza columnas a minúsculas, normaliza constraints, valida input, ejecuta quality checks, genera candidatos, aplica fast scoring por R², calcula MDE y filtra por `min_r2` y A/A test (`p_value >= alpha`).
- `design_scorer` está declarado pero no implementado: el código contiene `del design_scorer  # Unused in skeleton.`
- `plot_design` genera una figura por celda con `observed` y `counterfactual`.

Análisis (`analysis.py`):

```python
def analyze(
    data: pd.DataFrame,
    analysis_config: api.AnalysisConfig,
    data_quality_check_config: api.QualityCheckConfig = api.QualityCheckConfig(),
) -> api.AnalysisResult:
  """Analyzes a GeoX experiment."""

def plot_analysis(analysis_result: api.AnalysisResult):
  """Visualizes the 4-plot suite with divided timelines."""
```

`plot_analysis` genera por celda 3 paneles si no hay `icpd`, o 4 paneles si hay spend: observed vs counterfactual, pointwise differences, cumulative lift y cumulative iCPD.

Calidad de datos:

```python
def check_design_data_quality(
    data: pd.DataFrame,
    design_config: api.DesignConfig,
    quality_check_config: api.QualityCheckConfig,
) -> api.QualityCheckResult:

def check_analysis_data_quality(
    data: pd.DataFrame,
    analysis_config: api.AnalysisConfig,
    quality_check_config: api.QualityCheckConfig,
) -> api.QualityCheckResult:
```

## 11. Apuntes metodológicos mínimos de TBR

GeoX usa TBR con regresión lineal simple entre media del grupo tratamiento y media del grupo control. Fragmento real (`methodology/tbr.py`):

```python
@jax.jit
def _fit_linear_regression(x, y) -> tuple[jnp.ndarray, jnp.ndarray]:
  x_mean = jnp.mean(x); y_mean = jnp.mean(y)
  ss_xx = jnp.sum((x - x_mean) ** 2)
  ss_xy = jnp.sum((x - x_mean) * (y - y_mean))
  slope = jnp.where(ss_xx > 1e-10, ss_xy / ss_xx, 0.0)
  slope = jnp.maximum(0.0, slope)
  intercept = y_mean - slope * x_mean
  return intercept, slope
```

Convención de máscaras: `0.0` = control; enteros positivos `1.0`, `2.0`, etc. = celdas de tratamiento.

Funciones públicas del módulo TBR no exportadas en el paquete raíz:

```python
@jax.jit
def get_r2(data_pre, data_val, treatment_masks, cell_ids) -> jnp.ndarray:

def get_mde(data_pre, data_val, treatment_masks, z_score_sum,
            test_type=api.TestType.TWO_SIDED, cell_ids=None) -> MdeResults:

@jax.jit
def check_slope_similarity(candidates, conversion_data, spend_data,
                           tolerance, cell_id) -> jnp.ndarray:

def analyze(pretest_train_conversions, pretest_val_conversions,
            test_conversions, treatment_mask, placebo_masks, alpha,
            experiment_type, test_type=api.TestType.TWO_SIDED,
            treatment_cell_id=1.0, pretest_spend=None,
            test_spend=None) -> TbrAnalysisResult:
```

## 12. API que NO existe

Advertencias anti-alucinación para esta skill:

- No existen subpaquetes públicos `meridian_geox.design` / `meridian_geox.analysis` como namespaces de clases separados al estilo `geox.design.Runner`; el paquete de distribución es plano y exporta funciones en `__init__.py`.
- No hay carpetas/subpaquetes `design/` ni `analysis/`; los módulos reales son ficheros `design.py` y `analysis.py`.
- `design_scorer` aparece en la firma de `run_design`, pero está declarado y no implementado; no se debe prometer scoring custom.
- No existe `Methodology.SYNTHETIC_CONTROL`.
- Aunque la documentación menciona synthetic control y synthetic difference-in-differences, el enum real sólo contiene `TBR` y `SDID`; la FAQ indica TBR como metodología soportada.
- `GBR` no forma parte de esta librería ni aparece en la documentación GeoX inspeccionada.
- `trimmed match` no forma parte de esta librería; corresponde a otra librería/metodología legacy, no a `meridian_geox` v1.0.0.
- No existen clases documentadas como `DesignRunner`, `AnalysisRunner`, `GeoExperiment`, `GeoXModel`, `TBRModel`, `SyntheticControl`, `GBRModel`, `TrimmedMatch`, `ExperimentDesign`, `DesignReport`, `AnalysisReport`, `CalibrationResult` o `MMMCalibrationAdapter`.
- No existen métodos públicos documentados como `fit()`, `predict()`, `score()`, `calibrate_mmm()`, `to_dataframe()`, `from_dataframe()`, `save()`, `load()`, `export_html()` o `export_pdf()` en las dataclasses principales; los métodos de serialización documentados son `Design.export_to_json()` y `Design.load_from_json()`.

