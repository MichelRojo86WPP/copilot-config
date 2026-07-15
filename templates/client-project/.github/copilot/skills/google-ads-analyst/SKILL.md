# google-ads-analyst

## When to use this skill
Activate when the user asks about: Google Ads, GAQL, ROAS, Quality Score, CPA, keywords, negative keywords, match types, Smart Bidding, Target CPA, Target ROAS, Maximize Conversions, PMAX, Performance Max, Search campaigns, Display, YouTube Ads, Shopping, RSA, responsive search ads, auction insights, impression share, brand vs non-brand, Google Ads scripts, ad schedule, bid adjustments, conversion tracking, Google tag.

## Core behavior
- Write GAQL queries for performance analysis
- Diagnose Quality Score issues (Expected CTR, Ad Relevance, Landing Page Experience)
- Recommend bid strategy based on conversion volume and margin
- Separate brand/non-brand analysis — never blend them in reporting
- Flag structural issues: single-keyword ad groups, broad match without targets, missing negatives
- Interpret Impression Share data: Lost IS (Budget) vs Lost IS (Rank)

## Key patterns

### GAQL — campaign performance
```sql
SELECT campaign.name, campaign.status,
  metrics.impressions, metrics.clicks, metrics.cost_micros,
  metrics.conversions, metrics.conversions_value,
  metrics.search_impression_share
FROM campaign
WHERE segments.date DURING LAST_30_DAYS
  AND campaign.status = 'ENABLED'
ORDER BY metrics.cost_micros DESC
LIMIT 50
```

### GAQL — search terms report
```sql
SELECT search_term_view.search_term, search_term_view.status,
  metrics.clicks, metrics.impressions, metrics.ctr,
  metrics.average_cpc, metrics.conversions
FROM search_term_view
WHERE segments.date DURING LAST_30_DAYS
  AND metrics.impressions > 10
ORDER BY metrics.cost_micros DESC
```

### Quality Score breakdown
```sql
SELECT ad_group_criterion.keyword.text,
  ad_group_criterion.quality_info.quality_score,
  ad_group_criterion.quality_info.creative_quality_score,
  ad_group_criterion.quality_info.post_click_quality_score,
  ad_group_criterion.quality_info.search_predicted_ctr
FROM ad_group_criterion
WHERE ad_group_criterion.type = 'KEYWORD'
```

### ROAS target calculation
```
Target ROAS = Revenue Target / Spend Budget
Example: €10,000 revenue / €2,500 budget = 400% tROAS
Rule of thumb: need 30+ conversions/month per campaign for Smart Bidding to work
```

## KPIs to track
CTR, CPC, CPA, ROAS, Impression Share, Search IS Lost (Budget/Rank), Quality Score avg, CVR, Absolute Top IS

## Output formats
- GAQL queries ready to run
- Performance table by campaign/ad group/keyword
- Recommendations ranked by potential impact (Quick wins / Strategic)
