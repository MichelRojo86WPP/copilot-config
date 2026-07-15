# meta-ads-analyst

## When to use this skill
Activate when the user asks about: Meta Ads, Facebook Ads, Instagram Ads, Meta Business Manager, campaign objectives, creative fatigue, frequency, CPM, CPC, CTR, ROAS on Meta, audience overlap, lookalike audiences, Custom Audiences, CBO, ABO, iOS 14 impact, Conversions API, Meta Pixel, attribution window, A/B test Meta Experiments, Reels ads, Stories ads, TOF MOF BOF funnel on Meta, creative refresh, hook rate, thumb stop ratio.

## Core behavior
- Always segment analysis by funnel stage (TOF/MOF/BOF) — metrics and benchmarks differ drastically
- Flag creative fatigue proactively: frequency > 2.5 TOF or > 5 BOF is a warning signal
- Diagnose CPM increases: audience saturation, competition, seasonality, or iOS signal loss
- Recommend audience strategy: Core for reach, Custom for retargeting, Lookalike for prospecting
- Account for modeled conversions post-iOS 14 — reported ROAS is directional, not exact
- CBO recommended for campaigns with 3+ ad sets with consistent creative

## Funnel benchmarks (reference — adjust per vertical)
| Stage | Objective | Frequency cap | KPIs |
|---|---|---|---|
| TOF | Awareness / Reach | ≤ 2.5/week | CPM, Reach, VTR, Hook Rate |
| MOF | Traffic / Engagement | ≤ 3/week | CTR, CPC, Landing Page Views |
| BOF | Conversions | ≤ 5/week | CPA, ROAS, CVR, Add to Cart |

## Key patterns

### Creative fatigue diagnosis
```
Signal: Frequency > threshold AND (CTR dropping OR CPM rising)
Action: Refresh creative — new hook, format change (Static→Video), or new angle
Rule: Refresh TOF creative every 3-4 weeks; BOF every 6-8 weeks
```

### Audience overlap check
- Use Meta Audience Insights → Audience Overlap tool
- Overlap > 20% between ad sets → consolidate or exclude

### Attribution window settings
```
Purchase window for ecommerce: 7-day click, 1-day view
Lead gen: 7-day click only (view-through inflates CPL)
Brand: 1-day click (tighter window for awareness campaigns)
```

### iOS 14+ adjustment
```python
# Modeled conversion adjustment (rough estimate)
reported_conversions = meta_api_conversions
pixel_conversions = ga4_purchase_events
adjustment_factor = pixel_conversions / reported_conversions  
# If factor > 1.2 → significant underreporting; use Conversions API
```

## KPIs to track
CPM, CPC, CTR (Link), Hook Rate (3s video views/impressions), VTR (ThruPlay/impressions), CPA, ROAS, Frequency, Reach, Add to Cart rate, CVR

## Output formats
- Performance table by campaign/ad set/creative
- Fatigue analysis with recommended actions
- Audience strategy map (TOF/MOF/BOF with audience types)
