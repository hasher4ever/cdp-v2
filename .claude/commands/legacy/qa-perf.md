---
name: qa-perf
description: Use to capture API performance baselines or detect degradation after deploys. Measures response times for key endpoints, compares against previous baselines. Not load testing — just single-request latency tracking.
---

# QA Perf — Performance Baseline

Capture API response times. Detect degradation between deploys.

**Usage:**
- `/qa-perf` — measure all key endpoints, compare against last baseline
- `/qa-perf --baseline` — first run, establish baseline (no comparison)

## Procedure

### Step 1: Build endpoint list

Read `qa_coverage/api-contracts.md` (if exists) or derive from `page_crawl/*.md` network logs. Extract the most-used endpoints (queries and mutations).

**Minimum set for CDP:**
```
{ __typename }                    — healthcheck
{ me { ... } }                    — auth/user
{ customers(pagination:...) }     — customer list
{ segments(pagination:...) }      — segments
{ events(pagination:...) }        — events
{ udafs(pagination:...) }         — UDAFs
{ campaigns(pagination:...) }     — campaigns
```

### Step 2: Measure (one bash command per endpoint)

For each endpoint, run 3 requests and take the median:

```bash
for i in 1 2 3; do
  curl -s -o /dev/null -w "%{time_total}" \
    'https://cdpv2.ssd.uz/graphql/' \
    -H 'content-type: application/json' \
    -H 'authorization: Bearer $TOKEN' \
    -d '{"query":"{ QUERY }"}'
  echo
done
```

### Step 3: Compare against baseline

Read `reports/perf-baseline.md` (if exists). For each endpoint, compare median latency:

| Change | Classification |
|--------|---------------|
| ≤ 10% increase | **Stable** |
| 10-50% increase | **Degraded** — flag in report |
| > 50% increase | **Regression** — flag as potential bug |
| Any decrease | **Improved** |

### Step 4: Write report

Write `reports/perf-baseline.md` (overwrite with latest):

```markdown
# API Performance Baseline — {date}

| # | Endpoint | Median (ms) | Previous | Change | Status |
|---|----------|------------|----------|--------|--------|
| 1 | healthcheck | {N} | {N} | {+/-}% | {Stable/Degraded/Regression} |

## Summary
- Endpoints measured: {N}
- Stable: {N} | Degraded: {N} | Regression: {N} | Improved: {N}
- Slowest: {endpoint} at {N}ms
```

## Integration

- **qa-gate** reads perf baseline to detect regressions before deploy
- **qa-autopilot** can include perf as a low-cost cycle action
- **qa-triage** can trigger perf after detecting test regressions

## Rules

1. **Not load testing.** Single-request latency only. No concurrent requests.
2. **3 samples per endpoint.** Median avoids outliers.
3. **Baseline is overwritten.** Only latest baseline kept. Trend tracking is via git history.
4. **Auth required.** Most endpoints need a Bearer token — run auth first.
