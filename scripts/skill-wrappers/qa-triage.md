---
name: qa-triage
description: Thin wrapper around `npm run qa:triage`. Mechanical work (run suites, parse JSON, diff against expected-failures.json, emit triage.json) is a deterministic TypeScript script. LLM is only invoked on request for narrative summary.
---

# QA Triage — Thin Wrapper

All mechanical work lives in `scripts/qa-triage.ts`. No LLM in the hot path.

## Commands

```bash
npm run qa:triage                           # classify current results → reports/triage.json
npm run qa:triage -- --suite=backend        # one suite only
npm run qa:triage:bootstrap                 # (re)seed reports/expected-failures.json from today's failures
```

## Contract

**Inputs**
- `reports/vitest-backend-results.json`  (produced by `npm run test:backend -- --reporter=json`)
- `reports/vitest-business-results.json` (produced by `npm run test:business -- --reporter=json`)
- `reports/expected-failures.json` — manifest of known-bug failures, keyed by `{suite, file, fullName}` → `bugId`

**Outputs**
- `reports/triage.json` — verdict (`PASS | FAIL | WARN`), counts, and categorized lists. Single source of truth for downstream (`qa-gate`, dashboards).

**Verdict rules** (encoded in the script)
- `FAIL` — one or more truly-new failures (not in manifest, no `BUG-NNN` token in test name).
- `WARN` — no new failures, but one or more previously-known failures now pass (update `bugs.md` + re-bootstrap manifest).
- `PASS` — everything else.

Exit code is always 0 — `qa-gate` owns the exit-code decision by reading `triage.json`.

## When the LLM is called (and only when)

The LLM is NOT invoked to run, parse, or classify tests. It is only useful for:

1. **Narrative summary on request.** When a human types `/qa-triage`, read `reports/triage.json` and describe the verdict in one paragraph. Do not recompute anything.
2. **Explaining a specific new failure.** When asked "why did X fail?", read the `failureMessage` from `triage.json` and the test source — LLM is good at this, scripts are not.
3. **Drafting a `bugs.md` entry** from an unclassified failure. Hand off to `/qa-bugs`.

## Migration note

Ported from the previous interactive procedure. Gate-output behavior is unchanged; only execution path and cost.

- Previous skill wrote `reports/QA_TRIAGE_REPORT.md` — replaced by `reports/triage.json` + on-demand prose from this wrapper.
- Previous skill maintained `reports/QA_WRITE_LOG.md` "Failing Tests" table by hand — replaced by `reports/expected-failures.json`.
- E2E skipped under the no-browser policy; the script only consumes vitest JSON today. Adding Playwright JSON is ~30 lines when the policy lifts.
