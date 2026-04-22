---
name: qa-health
description: Thin wrapper around `npm run qa:health`. Rollup of reports/{env,triage,perf}.json into one verdict. No test execution, no LLM — pure JSON aggregation for CI dashboards and Slack bots.
---

# QA Health — Thin Wrapper

All mechanical work lives in `scripts/qa-health.ts`. No LLM in the hot path.

## Commands

```bash
npm run qa:health                 # rollup -> reports/health.json
npm run qa:health -- --json       # machine-readable stdout
npm run qa:health -- --strict     # exit 1 on WARN (default: only FAIL -> 1)
npm run qa:health -- --quiet      # no stdout, exit code only
```

## Contract

**Inputs** — all optional, missing ones default to UNKNOWN:
- `reports/env.json` (from `npm run qa:env`)
- `reports/triage.json` (from `npm run qa:triage`)
- `reports/perf.json` (from `npm run qa:perf`)

**Output**
- `reports/health.json` — single verdict + per-signal breakdown. This is the file dashboards, Slack bots, and CI status badges should read.

**Verdict rules** (encoded in the script)
- `FAIL` — required input (env or triage) missing, or any signal FAIL.
- `WARN` — any signal WARN (and no FAIL).
- `PASS` — env + triage present and all signals PASS (or perf UNKNOWN but env+triage PASS).

**Exit codes**
- `0` — PASS or WARN (default) / PASS only (--strict)
- `1` — FAIL (default) / WARN or FAIL (--strict)
- `2` — script-level error (malformed input, filesystem)

## Reframing from the old skill

The previous `qa-health.md` was a **page-level** coverage score (element coverage × rule coverage × UX findings × bug exposure), coupled to `/qa-next` Tier 2. That's a coverage metric, not a health rollup.

This replacement is a **run-level** CI rollup — "is the build safe to ship right now?" — which is what developers and CI need to answer every commit. Page-level coverage will move to `qa-crawl` when that skill lands.

## When the LLM is called (and only when)

The LLM is NOT invoked to read or classify signals. It is only useful for:

1. **Narrative summary on request.** `/qa-health` reads `reports/health.json` and describes the verdict in one paragraph. No recomputation.
2. **Drill-down explanation** of a single FAIL signal — read the upstream report and explain what changed.
