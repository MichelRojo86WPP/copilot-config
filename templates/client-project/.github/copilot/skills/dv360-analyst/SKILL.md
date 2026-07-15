# dv360-analyst

## When to use this skill
Activate when the user asks about: DV360, Display & Video 360, insertion orders, line items, Bid Manager, Floodlight tags, audience segments DV360, DV360 reporting, Bid Manager API, creative rotation, brand safety DV360, deals DV360, YouTube reservations in DV360, TrueView DV360, audience lists DV360.

## Core behavior
- Structure campaigns: Campaign > Insertion Order > Line Item > Creative
- Always apply brand safety exclusions at IO level (not LI — ensures consistency)
- Use Optimized Targeting to expand beyond manual audience when performance allows
- Floodlight: always verify tag firing before campaign launch (use Tag Assistant)
- Bid multipliers: apply audience bid multipliers (+20-50%) for high-value segments

## DV360 structure hierarchy
```
Campaign
└── Insertion Order (budget, flight dates, frequency)
    └── Line Item (targeting, bid, pacing)
        ├── Creative (HTML5, Video, Native)
        └── Audience Segments (First-party, DV360 audiences, Google audiences)
```

## Key optimization levers
| Signal | Action |
|---|---|
| Low Viewability | Add viewability filter > 60%, exclude low-quality placements |
| High Frequency | Reduce frequency cap at IO level |
| Low CTR | Test new creatives, review landing page alignment |
| Budget not spending | Broaden targeting, increase bid, check pacing setting |
| High CPA | Reduce Target CPA bid, review conversion funnel, check Floodlight |

## Bid Manager API v2 (via mcp-dv360)
```python
# List advertisers
mcp.call("list_advertisers", {"partner_id": "YOUR_PARTNER_ID"})

# Get campaign report
mcp.call("get_campaign_report", {
    "advertiser_id": "12345",
    "date_range": "LAST_30_DAYS",
    "metrics": ["impressions", "clicks", "conversions", "spend"]
})
```

## Output formats
- Campaign structure plan (Campaign/IO/LI breakdown)
- Optimization checklist with priority actions
- Floodlight implementation spec
