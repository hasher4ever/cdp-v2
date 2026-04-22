---
name: qa-perf
description: Thin wrapper around `npm run qa:perf`. Measures single-request latency for ~12 cheap CDP endpoints (3 samples, median), diffs against `reports/perf-baseline.json`. LLM only for on-demand narrative.
---

# QA Perf — Thin Wrapper

All mechanical work lives in `scripts/qa-perf.ts`. No LLM in the hot path.

## Commands

```bash
npm run qa:perf                    # measure + diff against baseline -> reports/perf.json
npm run qa:perf:baseline           # overwrite reports/perf-baseline.json with this run
npm run qa:perf -- --samples=5     # override sample count (default 3, max 20)
npm run qa:perf -- --json          # machine-readable stdout
```

## Contract

**Inputs**
- Credentials from `.env` (`CDP_BASE_URL`, `CDP_DOMAIN`, `CDP_EMAIL`, `CDP_PASSWORD`)
- `reports/perf-baseline.json` — persisted median-latency baseline (optional)

**Outputs**
- `reports/perf.json` — latest snapshot, always written. Verdict + per-endpoint diff.
- `reports/perf-baseline.json` — only written on `--baseline`.

**Endpoint set** — hard-coded in `scripts/qa-perf.ts`:
1. `/api/tenants/info`
2. `/api/tenants/udafs`
3. `/api/tenants/udafs/types`
4. `/api/tenants/schema/customers/fields`
5. `/api/tenants/schema/event-types`
6. `/api/tenants/commchan`
7. `/api/tenants/segmentation?page=1&size=10`
8. `/api/tenants/campaign?page=1&size=10`
9. `/api/tenant/data/count`
10. `/api/tenant/template?page=1&size=10`
11. `/api/tenant/ui/settings`
12. `POST /api/tenant/data/customers` (paginated list)

Add/remove endpoints by editing the `ENDPOINTS` array in the script.

**Classification** (encoded in the script)
- `IMPROVED` — current median > 10 % faster than baseline
- `STABLE` — within ±10 %
- `DEGRADED` — 10–50 % slower (WARN)
- `REGRESSION` — > 50 % slower (FAIL)
- `ERROR` — endpoint returned non-2xx or threw (FAIL)
- `NEW` — no baseline entry yet (first run for that endpoint, treated as PASS)

**Verdict**
- `FAIL` — any REGRESSION or ERROR → exit 1
- `WARN` — any DEGRADED (no regressions/errors) → exit 0
- `PASS` — everything STABLE / IMPROVED / NEW → exit 0

Sampling: one warm-up call per endpoint (discarded), then N samples, median taken. Outliers are cheap insurance against cold-cache noise.

## When the LLM is called (and only when)

The LLM is NOT invoked to run, measure, parse, or classify latency. It is only useful for:

1. **Narrative summary on request.** `/qa-perf` reads `reports/perf.json` and describes the verdict in one paragraph — slowest endpoints, biggest regressions, whether it's safe to deploy. Do not recompute anything.
2. **Explaining a specific regression.** When asked "why is `/api/tenants/udafs` slower?", read the diff entry + relevant test source — LLM is good at this, scripts are not.

## Migration note

Ported from the previous interactive procedure:
- Previous skill wrote `reports/perf-baseline.md` (prose) — replaced by `reports/perf.json` + on-demand prose from this wrapper.
- Previous skill targeted GraphQL endpoints that no longer exist — replaced with the current REST surface.
- Previous skill used a single-file "baseline" that got overwritten every run — replaced with a durable `perf-baseline.json` that only changes on `--baseline`, so repeated runs diff against a stable reference instead of yesterday's run.
