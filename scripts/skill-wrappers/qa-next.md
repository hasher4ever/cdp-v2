---
name: qa-next
description: Thin wrapper around `npm run qa:next`. Reads reports/{env,triage,perf,health}.json + expected-failures.json, walks a fixed decision tree, and emits a rank-ordered next-action list to `reports/next.json`. No LLM, no state.md, no timestamp heuristics.
---

# QA Next — Thin Wrapper

All mechanical work lives in `scripts/qa-next.ts`. No LLM in the hot path.

## Commands

```bash
npm run qa:next                # ranked actions -> reports/next.json + stdout
npm run qa:next -- --json      # machine-readable stdout
npm run qa:next -- --top       # only the #1 action (for shell integration / status bars)
npm run qa:next -- --quiet     # no stdout
```

## Contract

**Inputs** — all optional; missing ones flow into the action list:
- `reports/env.json`, `reports/triage.json`, `reports/perf.json`, `reports/health.json`
- `reports/expected-failures.json`

**Output**
- `reports/next.json` — `{ top, actions[], inputs }`. `top` is the highest-severity action; `actions[]` is the full rank-ordered list.

**Decision tree** (hard-coded in the script)

| When… | Action | Severity |
|-------|--------|----------|
| `env.overall === "DOWN"` | Fix environment before anything else | BLOCKER |
| `env.json` missing | Run `npm run qa:env` | HIGH |
| `env.json` > 24h old | Refresh env probe | LOW |
| `triage.verdict === "FAIL"` | Investigate regressions | BLOCKER |
| `triage.verdict === "WARN"` | Update expected-failures manifest | HIGH |
| `triage.json` missing | Run backend tests + triage | HIGH |
| `perf.verdict === "FAIL"` | Investigate latency regressions | BLOCKER |
| `perf.verdict === "WARN"` | Watch degraded endpoints | MEDIUM |
| `perf.json` missing | Capture perf baseline / snapshot | LOW |
| `expected-failures.json` has unclassified entries | Annotate with bug IDs | MEDIUM |
| Everything green | Run full CI cycle | LOW |

Actions are rank-ordered: BLOCKER → HIGH → MEDIUM → LOW. `top` is the first entry.

**Exit code is always 0.** `qa-next` recommends, it doesn't gate. Use `qa-gate` or `qa-health` for exit-code policy.

## Reframing from the old skill

The previous `qa-next.md` was a 3-tier LLM-reasoning cache that read `state.md`, compared file mtimes, and decided which tier to enter. That tier selection was token-expensive and non-deterministic — the same inputs could yield different recommendations run-to-run.

This replacement is a pure function of the JSON inputs on disk. Same inputs → same output, every time. The decision tree is 11 rules, all encoded in `scripts/qa-next.ts`. No LLM, no tier caching, no `state.md`.

## When the LLM is called (and only when)

The LLM is NOT invoked to compute the next action. It is only useful for:

1. **Narrative summary on request.** `/qa-next` reads `reports/next.json` and describes the top action in one paragraph with context from upstream reports.
2. **Drafting the actual fix.** Once the decision tree points at, say, "investigate regression in `X.test.ts`", the LLM can read the test source + failure message and propose a patch. That's in `/qa-write --resync` territory, not here.
