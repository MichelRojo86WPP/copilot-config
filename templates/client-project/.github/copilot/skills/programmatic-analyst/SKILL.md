# programmatic-analyst

## When to use this skill
Activate when the user asks about: programmatic advertising, DV360, Display & Video 360, The Trade Desk, TTD, Amazon DSP, DSP, SSP, PMP, Private Marketplace, Programmatic Guaranteed, open auction, viewability, brand safety, IVT invalid traffic, frequency capping, deal ID, creative trafficking, Floodlight, impression tracker, VAST, VPAID, HTML5 banners, audience segment activation, DMP, CPM, vCPM, CTR, VTR, completion rate, pacing analysis programmatic.

## Core behavior
- Distinguish between Awareness (CPM/vCPM) and Performance (CPA/ROAS) programmatic objectives
- Always recommend viewability minimum: 50% in-view for 1s display; 50% for 2s video (MRC standard)
- Flag IVT: if invalid traffic > 10%, investigate placement quality and exclusion lists
- Pacing: prefer Even pacing; ASAP only for flight end urgency
- Brand safety: always apply IAS or DoubleVerify tier 2 at minimum

## Deal type decision guide
| Deal type | When to use | Premium | Control |
|---|---|---|---|
| Open Auction | Scale, broad reach | Low | Low |
| PMP | Premium publishers with targeting | Medium | Medium |
| Preferred Deal | Fixed CPM, priority access | High | High |
| Programmatic Guaranteed | Guaranteed impressions, like direct IO | Highest | Highest |

## Key patterns

### Frequency capping recommendation
```
Brand Awareness:  3-5 impressions/user/week per platform
Consideration:    5-8 impressions/user/week
Retargeting:      10-15 impressions/user/week (cap to avoid stalking effect)
Cross-platform:   Track deduplicated frequency via DV360 cross-exchange report
```

### Viewability optimization checklist
```
1. Filter to Above-the-Fold placements only
2. Enable Active View bidding in DV360
3. Exclude: below 40% viewability historically
4. Use vertical video for mobile (100% in-view by default)
5. Minimum banner sizes: 300x250, 728x90, 160x600 (above fold)
```

### DV360 Floodlight — standard events
```
Activity type: Counter (for page views) or Sales (for purchases)
Tag type: Global site tag or iframe
Key params: u1= (order_id), u2= (revenue), u3= (product_id)
```

### Performance analysis framework
```
Step 1: Check delivery (pacing %, impressions vs goal)
Step 2: Check efficiency (CPM, CPC, CPA vs benchmark)
Step 3: Check quality (Viewability %, IVT %, Completion Rate)
Step 4: Segment by placement/audience/creative/device
Step 5: Optimize: pause low performers, scale high performers
```

## KPIs to track
CPM, vCPM, Viewability %, CTR, VTR (video), Completion Rate, Frequency, Reach, CPA, ROAS, IVT %, Brand Safety %

## Output formats
- Campaign structure recommendation
- Pacing and performance analysis table
- Creative trafficking specs (sizes, formats, weights)
