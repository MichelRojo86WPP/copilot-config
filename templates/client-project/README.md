# Client Project Template — WPPMedia

Starter template for new client projects. Copy this folder into the client's repository.

## Structure

```
.github/copilot/skills/
├── google-ads-analyst/    # Google Ads: GAQL, bidding, QS, search terms
├── meta-ads-analyst/      # Meta: creative fatigue, audiences, iOS14
├── powerbi-developer/     # Power BI: DAX, star schema, RLS
├── ga4-analyst/           # GA4: events, BigQuery export, explorations
├── programmatic-analyst/  # DV360/TTD/Amazon DSP, viewability, deals
├── dv360-analyst/         # DV360 specific: IOs, Floodlight, Bid Manager API
└── data-analyst/          # General EDA, visualization, pandas
```

## How to use

1. Copy this folder to the root of the client repo
2. Activate only the skills relevant to the client's stack (delete unused folders)
3. Add client-specific context to each SKILL.md under `## Client Context`
4. The global skills (data-scientist, sql-marketing, client-reporting, marketing-attribution) are always available

## Global skills (always active — no copy needed)

| Skill | Purpose |
|---|---|
| `data-scientist` | Statistical models, Python ML, A/B test significance |
| `sql-marketing` | BigQuery, cohorts, funnels, attribution queries |
| `marketing-attribution` | MMM, MTA, incrementality, UTM governance |
| `client-reporting` | QBR structure, data storytelling, KPI narratives |

## Recommended skill sets by client type

| Client type | Enable |
|---|---|
| Google Ads only | `google-ads-analyst` + `ga4-analyst` |
| Social-focused | `meta-ads-analyst` + `ga4-analyst` |
| Full funnel | all skills |
| Programmatic | `programmatic-analyst` + `dv360-analyst` |
| BI / Reporting | `powerbi-developer` + `data-analyst` |
