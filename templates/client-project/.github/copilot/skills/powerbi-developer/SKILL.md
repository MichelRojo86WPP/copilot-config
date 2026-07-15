# powerbi-developer

## When to use this skill
Activate when the user asks about: Power BI, DAX, measures, calculated columns, star schema, data model, DirectQuery, Import mode, Direct Lake, RLS, row-level security, Power Query, M language, CALCULATE, FILTER, time intelligence, SAMEPERIODLASTYEAR, DATEADD, TOTALYTD, RANKX, SWITCH, semantic model, PBIP, PBIR, Fabric, OneLake, report design, visual formatting, slicers, bookmarks, dashboard publishing, Power BI REST API, incremental refresh, performance optimization.

## Core behavior
- Always use measures over calculated columns for aggregations
- Enforce star schema: fact tables + dimension tables, no many-to-many without bridge table
- Use CALCULATE as the primary filter override function — explain filter context when relevant
- Recommend DirectQuery only when data freshness < 1hr is required; Import for everything else
- Apply USERELATIONSHIP for inactive relationships
- Flag model performance issues: avoid bidirectional filters unless strictly necessary

## Key DAX patterns

### Time intelligence
```dax
Revenue LY = CALCULATE([Revenue], SAMEPERIODLASTYEAR('Date'[Date]))
Revenue YTD = TOTALYTD([Revenue], 'Date'[Date])
Revenue MoM % = DIVIDE([Revenue] - [Revenue PM], [Revenue PM])
Revenue PM = CALCULATE([Revenue], DATEADD('Date'[Date], -1, MONTH))
```

### Dynamic ranking
```dax
Channel Rank = RANKX(ALL('Channel'[Name]), [Revenue],, DESC, DENSE)
Top 5 Channels = IF([Channel Rank] <= 5, [Revenue], BLANK())
```

### SWITCH for KPI status (traffic light)
```dax
KPI Status = 
SWITCH(TRUE(),
    [CVR] >= [CVR Target] * 1.05, "🟢 On Track",
    [CVR] >= [CVR Target] * 0.9,  "🟡 At Risk",
    "🔴 Off Track"
)
```

### RLS filter
```dax
-- In Power BI Desktop > Manage Roles > [Client] role:
[Client_Name] = USERPRINCIPALNAME()
-- Or for table-based RLS:
[Client_Name] = LOOKUPVALUE('Users'[Client], 'Users'[Email], USERPRINCIPALNAME())
```

### Marketing ROAS measure
```dax
ROAS = DIVIDE([Revenue], [Ad Spend])
ROAS Target = 3.5  -- update per client
ROAS vs Target = DIVIDE([ROAS], [ROAS Target]) - 1
```

## Model design checklist
- [ ] Date table with contiguous dates, marked as date table
- [ ] All fact→dimension relationships on single column
- [ ] No calculated columns that can be measures
- [ ] RLS implemented and tested before publish
- [ ] Incremental refresh on large fact tables (> 1M rows)

## Output formats
- DAX measure code with comments
- Star schema diagram description
- M Query code for Power Query transformations
- Report page structure recommendation (page per audience level)
