# ga4-analyst

## When to use this skill
Activate when the user asks about: GA4, Google Analytics 4, events, parameters, key events, conversions in GA4, explorations, funnels in GA4, cohorts GA4, BigQuery export GA4, GA4 audiences, predictive audiences, purchase probability, Consent Mode v2, data streams, custom dimensions, custom metrics, Looker Studio GA4, GA4 vs Universal Analytics, ecommerce tracking GA4, GTM Google Tag Manager GA4, session reconstruction BigQuery.

## Core behavior
- Clarify the GA4 data model upfront: events-based (not session/hit like UA)
- Recommend BigQuery export for any analysis beyond 14-month data retention
- Use explorations for ad-hoc analysis; Looker Studio for recurring reports
- Flag consent mode gaps: if consent rate < 80%, modeled data may be unreliable
- Event naming convention: snake_case, max 40 chars, no PII in parameters

## Key patterns

### GA4 BigQuery — session reconstruction
```sql
WITH sessions AS (
  SELECT
    user_pseudo_id,
    (SELECT value.int_value FROM UNNEST(event_params) WHERE key = 'ga_session_id') AS session_id,
    MIN(TIMESTAMP_MICROS(event_timestamp)) AS session_start,
    COUNTIF(event_name = 'page_view') AS pageviews,
    MAX(IF(event_name = 'purchase',
      (SELECT value.double_value FROM UNNEST(event_params) WHERE key = 'value'), 0)) AS revenue
  FROM `project.analytics_XXXXX.events_*`
  WHERE _TABLE_SUFFIX BETWEEN '20240101' AND '20240131'
  GROUP BY 1, 2
)
SELECT * FROM sessions WHERE session_id IS NOT NULL
```

### GA4 BigQuery — channel attribution
```sql
SELECT
  traffic_source.source,
  traffic_source.medium,
  traffic_source.name AS campaign,
  COUNT(DISTINCT user_pseudo_id) AS users,
  COUNTIF(event_name = 'purchase') AS purchases,
  SUM(IF(event_name = 'purchase',
    (SELECT value.double_value FROM UNNEST(event_params) WHERE key = 'value'), 0)) AS revenue
FROM `project.analytics_XXXXX.events_*`
WHERE _TABLE_SUFFIX BETWEEN '20240101' AND '20240131'
GROUP BY 1,2,3
ORDER BY revenue DESC
```

### Funnel exploration setup
```
Steps (in GA4 Explore → Funnel):
1. session_start (entry)
2. view_item (product view)
3. add_to_cart
4. begin_checkout
5. purchase
Breakdown: device category, channel grouping
```

### Custom dimension registration
```javascript
// GTM — GA4 Event tag > Event Parameters
parameter_name: client_id     value: {{DL - clientId}}
parameter_name: user_type     value: {{DL - userType}}
// Then register in GA4 Admin > Custom Definitions > Custom Dimensions
```

## KPIs to track
Sessions, Users, Engaged Sessions, Engagement Rate, Key Event Rate (CVR), Revenue, ARPU, Funnel Drop-off by step, New vs Returning User ratio

## Output formats
- BigQuery SQL queries for GA4 event tables
- Exploration setup instructions (step-by-step)
- Custom dimension/metric registration checklist
