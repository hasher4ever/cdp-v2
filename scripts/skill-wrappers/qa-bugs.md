---
name: qa-bugs
description: Thin wrapper around `npm run qa:bugs`. Parses bugs.md, detects duplicate IDs + numbering gaps, and cross-references with reports/coverage.json to flag bugs with no regression test. Writes `reports/bugs-mechanical.json`. No LLM in the audit loop — LLM only drafts NEW bug entries or narrative triage on top of this mechanical output.
---

# QA Bugs — Thin Wrapper (Mechanical Audit)

All mechanical work lives in `scripts/qa-bugs.ts`. No LLM in the hot path.

## Commands

```bash
npm run qa:bugs                    # audit -> reports/bugs-mechanical.json + stdout summary
npm run qa:bugs -- --issues        # duplicate IDs + numbering gaps + missing-field list
npm run qa:bugs -- --uncovered     # bugs with no referencing test (requires coverage.json)
npm run qa:bugs -- --json          # machine-readable stdout
npm run qa:bugs -- --quiet         # no stdout
```

## Contract

**Inputs**
- `bugs.md` — canonical bug ledger. Only `## BUG-NNN: <title>` headers (with colon) count as entries; `## BUG-NNN UPDATE (Sxx):` addenda are ignored.
- `reports/coverage.json` *(optional)* — produced by `npm run qa:crawl`. Adds bug-to-test cross-reference.

**Output** — `reports/bugs-mechanical.json`:
```
{
  totals:   { entries, uniqueIds, duplicateIds, gaps, severityBreakdown, statusBreakdown },
  issues:   { duplicateIds[], gaps[], nextFreeId, missingSeverity[], missingEndpoint[] },
  coverage: { present, withTests[], withoutTests[], byBug{} },
  bugs:     [{ id, numericId, title, severity, status, endpoint, line, duplicateOf[] }, ...]
}
```

**Extraction rules** (encoded in the script)
- **Header:** `^## (BUG-(\d{3,4})):\s*(.+)$` — trailing `UPDATE (Sxx):` sub-headers are skipped by design.
- **Severity:** first `**Severity:**` line after the header. Classified to Critical/High/Medium/Low/Unknown by prefix (parentheticals and session notes preserved in `severityRaw`).
- **Status:** first `**Status:**` line. Classified to Open/Resolved/Retracted/Reopened/Duplicate/Unknown.
- **Endpoint:** first `**Endpoint:**` line, backticks stripped.

**Duplicate detection** — bugs sharing the same numeric ID (e.g. two `## BUG-050:` headers). Each duplicate entry carries `duplicateOf: [otherId]` so the issue surfaces in the output even if both entries have distinct titles.

**Gap detection** — integer-complement of `{min..max}` vs present numeric IDs. Useful when drafting a new bug so the next free ID is known (also exposed as `issues.nextFreeId`).

**Coverage cross-reference** — joins `bugs[*].id` against `reports/coverage.json#bugCoverage`. Bugs with zero referencing tests are candidates for a regression test. `--uncovered` prints the list with severity + status for prioritization.

Exit code is always 0 — inventory, not a gate.

## Reframing from the old skill

The previous `qa-bugs.md` was a full LLM-driven bug-report writer: scan session context, identify bugs, dedupe against `bugs.md` by reading it end-to-end, draft curl reproductions, update all three bug files in sequence. That's still the right shape for *authoring* a new bug — but the mechanical parts (ID assignment, duplicate detection, coverage gap) don't need an LLM and can't be done reliably under token pressure with 74+ entries.

This wrapper splits the hot path:
- **Mechanical audit (this script):** inventory, dedup, gaps, uncovered list. Runs in ms, no LLM.
- **Authoring (old skill, still invoked explicitly):** draft new BUG-NNN entries with curl reproductions. The script provides `issues.nextFreeId` so the author knows which ID to claim.

## When the LLM is called (and only when)

The LLM is NOT invoked for the audit. It is only useful for:

1. **Drafting a new bug entry** on top of a confirmed finding — same flow as the legacy `/qa-bugs` skill, but now starting with `issues.nextFreeId` from this report instead of `ls bugs.md | tail`.
2. **Narrative triage summary on request** — read `reports/bugs-mechanical.json` + `reports/triage.json` and describe the bug-debt picture (critical-open ratio, uncovered-bug list, regression cadence) in one paragraph.
3. **Deduplication judgment on borderline cases** — when a new finding shares an endpoint with an existing BUG-NNN but differs in error signature. The script surfaces the overlap; the LLM decides "same bug" vs "new bug".
