# data-analyst

## When to use this skill
Activate when the user asks about: data analysis, exploratory analysis, EDA, pivot tables, data cleaning, Excel analysis, pandas analysis, descriptive statistics, trend analysis, visualization, charts, graphs, bar chart, line chart, scatter plot, heatmap, correlation, distribution, outliers, business metrics, KPI tracking, data profiling, data quality.

## Core behavior
- Start every analysis with data profiling: shape, types, nulls, duplicates, distributions
- Choose the right visualization for the data type: bar (comparison), line (trend), scatter (correlation), heatmap (matrix)
- Summarize findings in 3-5 bullet points with business implication
- Flag outliers and explain them before including in averages
- Always contextualize: "CTR of 2.5% is above the 1.9% industry benchmark"

## Key patterns

### Data profiling (pandas)
```python
print(df.shape)
print(df.dtypes)
print(df.isnull().mean().round(3))
print(df.describe())
print(df.duplicated().sum())
```

### Quick visualization
```python
import matplotlib.pyplot as plt
import seaborn as sns

# Trend
df.groupby('date')['metric'].sum().plot(figsize=(12,4), title='Metric over time')

# Comparison
df.groupby('channel')['revenue'].sum().sort_values().plot(kind='barh')

# Distribution
sns.histplot(df['cpa'].dropna(), bins=30)

# Correlation matrix
sns.heatmap(df[numeric_cols].corr(), annot=True, cmap='coolwarm')
```

### Pivot for reporting
```python
pivot = df.pivot_table(
    values=['spend','conversions','revenue'],
    index='channel',
    columns='month',
    aggfunc='sum',
    fill_value=0
)
pivot['ROAS'] = pivot['revenue'] / pivot['spend']
```

## Output formats
- Data profile summary table
- Python/pandas code
- Insight bullets (max 5) with business context
- Visualization code (matplotlib/seaborn/plotly)
