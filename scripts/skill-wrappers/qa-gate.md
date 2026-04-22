---
name: qa-gate
description: Release-readiness gate. Thin wrapper around `npm run qa:gate` — reads reports/triage.json, emits PASS/WARN/FAIL with a CI-suitable exit code. No LLM in the hot path.
---

# QA Gate — Thin Wrapper

All decision logic lives in `scripts/qa-gate.ts`. No re-classification — it reads what `qa-triage` wrote.

## Commands

```bash
npm run qa:gate                       # PASS/WARN exit 0, FAIL exit 1
npx tsx scripts/qa-gate.ts --strict   # WARN also exits 1 (every fixed-known-fail must be cleaned up)
npx tsx scripts/qa-gate.ts --quiet    # no stdout, exit code only (wrap in other scripts)
npx tsx scripts/qa-gate.ts --json     # machine-readable stdout
```

## Contract

**Input:** `reports/triage.json` (from `qa-triage`)
**Output:** exit code + stdout summary

**Exit codes:**
- `0` — `PASS` or `WARN` (default mode)
- `1` — `FAIL`, missing/malformed `triage.json`, or `--strict` + `WARN`

## When the LLM is called

Only on explicit user request — to explain a specific new failure or draft a `bugs.md` entry (hand off to `/qa-bugs`). The gate itself is a pure read-and-decide. If the user types `/qa-gate`, just run the script and relay the exit code and top-line summary.

## CI integration

Add `npm run qa:ci` as the test step — it runs `test:backend && test:business && qa:triage && qa:gate`. Non-zero exit fails the build.
