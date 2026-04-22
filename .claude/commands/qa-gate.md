---
name: qa-gate
description: Use before deploys or when deciding if a build is release-ready. Reads all QA outputs, produces a PASS/FAIL/WARN verdict with blocking issues list. The go/no-go checkpoint.
---

# QA Gate — Release Readiness Checkpoint

Go/no-go decision for deploys. Reads all QA pipeline outputs, produces a verdict.

**Usage:**
- `/qa-gate` — full gate check against all quality criteria
- `/qa-gate --quick` — pass/fail only, no details (for CI integration)

## Procedure

### Step 1: Gather signals (parallel reads, limit: 20 each)

| Source | What to extract |
|--------|----------------|
| `state.md` | App health summary, failing test counts |
| `reports/QA_TRIAGE_REPORT.md` | Regressions count, last triage date |
| `reports/QA_WRITE_LOG.md` | Failing tests table, known blockers |
| `bugs.md` | Open High/Critical bugs count |
| `reports/QA_HEALTH.md` | Pages at grade D or F |
| `reports/UX_AUDIT.md` | P1 issue count |

### Step 2: Evaluate gate criteria

| Gate | PASS | WARN | FAIL |
|------|------|------|------|
| **Regressions** | 0 regressions since last deploy | 1-2 regressions (minor) | 3+ regressions OR any Critical |
| **Open blockers** | 0 Critical bugs | 0 Critical, ≤3 High | Any Critical open |
| **Test pass rate (BE)** | ≥95% | 90-95% | <90% |
| **Test pass rate (FE)** | ≥90% | 80-90% | <80% |
| **Triage freshness** | Triaged within 24h | 1-3 days | >3 days or never |
| **P1 UX issues** | 0 new P1s since last deploy | Existing P1s (known) | New P1 introduced |
| **Page health** | All pages B+ | 1-2 pages at C | Any page at D or F |

### Step 3: Produce verdict

**PASS** — all gates pass. Safe to deploy.
**WARN** — some gates at WARN level. Deploy with caution, monitor after.
**FAIL** — any gate fails. Do NOT deploy. Blocking issues listed.

### Step 4: Write report

Write `reports/release-gate-{date}.md`:

```markdown
# Release Gate — {date}

## Verdict: {PASS / WARN / FAIL}

| Gate | Status | Value | Threshold |
|------|--------|-------|-----------|
| Regressions | {P/W/F} | {N} | 0 |
| Open blockers | {P/W/F} | {N} Critical, {N} High | 0 Critical |
| BE pass rate | {P/W/F} | {N}% | ≥95% |
| FE pass rate | {P/W/F} | {N}% | ≥90% |
| Triage freshness | {P/W/F} | {date} | <24h |
| P1 UX issues | {P/W/F} | {N} new | 0 new |
| Page health | {P/W/F} | lowest: {page} {grade} | All B+ |

## Blocking Issues (if FAIL)

| # | Issue | Severity | Action Required |
|---|-------|----------|----------------|

## Risks (if WARN)

| # | Risk | Mitigation |
|---|------|-----------|

## Recommendation

{One sentence: deploy / hold / fix first}
```

For `--quick` mode: print only the verdict line and blocking issue count.

## Rules

1. **Read-only.** Never modify test files, bug files, or run tests. Just reads and judges.
2. **Conservative.** When in doubt, WARN. False-positive holds are cheaper than production bugs.
3. **Stale data = FAIL.** If triage hasn't run in 3+ days, the gate can't trust the data.
4. **No overrides.** The verdict is what the data says. If the user wants to deploy despite FAIL, that's their call — the gate documents the risk.
