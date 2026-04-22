# QA Output Templates (Reference)

> Loaded on-demand when a skill needs to write structured output files.

## § QA_WRITE_LOG.md

```markdown
# QA Write Log

> Auto-maintained by /qa-write. Read this first on every run.

## Test Architecture
- Language: {lang}
- E2E: {framework} | dir: {path} | run: {command} | config: {config file}
- API: {framework} | dir: {path} | run: {command}
- Logic: {framework} | dir: {path} | run: {command}
- Style: {describe style from examples}
- Auth: {how auth works in tests}
- Conventions: {from CLAUDE.md}

### Config Changes
| Date | File | Change | Impact |
|------|------|--------|--------|

## Run History

### Run {N} — {date}
- **Depth:** {all levels | L{n}}
- **Pages completed:** {list}
- **Pages skipped/failed:** {list with reasons}
- **Tests written:** {layer}: {N}, ...
- **Passing:** {N}/{total}
- **Bugs found:** {list}
- **Stopped because:** {reason}
- **Next up:** {first remaining page or "All done"}

## Page Status

| Page | Depth | Tests Written | Passing | Bugs | Last Run | Notes |
|------|-------|---------------|---------|------|----------|-------|

## Failing Tests

| Test | File | Layer | Failure Reason | Bug ID | Attempts |
|------|------|-------|----------------|--------|----------|

## Flaky Tests

| Test | File | Flips | Last Flip | Likely Cause |
|------|------|-------|-----------|-------------|

## Known Blockers

- {page}: {reason}

## Test Data

| Entity Type | Prefix | Created By | Cleanup Method | Notes |
|-------------|--------|------------|----------------|-------|
```

## § QA_COVERAGE.md

```markdown
# QA Coverage — [Project Name]

> Consumed from /website-crawl cache. Updated by /qa-crawl.

## Routes

| Route | Page | Elements | Tested | Coverage | Spec File | Last Checked |
|-------|------|----------|--------|----------|-----------|-------------|

## Coverage Summary

| Metric | Count |
|--------|-------|
| Total elements | 0 |
| Tested | 0 |
| Untested | 0 |
| **Coverage %** | **0%** |

## Uncovered Paths

| Path / Trigger | Notes |
|----------------|-------|
```

## § Per-Page Coverage (qa_coverage/{page}.md)

```markdown
# {Page Name} — Test Coverage

**Source:** `page_crawl/{page}.md` (crawled {date})
**Spec:** {spec file path} ({N} tests)
**Coverage:** {tested}/{total} ({%})

## Elements

| # | Element | Type | Tested? | Test Location | Priority | Needs | Notes |
|---|---------|------|---------|---------------|----------|-------|-------|

## FE Test Status
- **Has E2E smoke test?** {Yes/No}
- **Interactive elements:** {N} total, {M} with FE tests, {K} missing
- **Missing FE tests:** {list}

## Top Untested (by priority)

1. {element} — P{score} — {why}

## Bugs Found During Analysis

| # | Severity | Issue |
|---|----------|-------|
```

## § QA_TRIAGE_REPORT.md

```markdown
# QA Triage Report — {date}

**Trigger:** {post-deploy | manual | scheduled}
**Commits since last run:** {N} ({git log range})
**Test suite:** {N} tests across {layers}

## Summary

| Category | Count |
|----------|-------|
| Regressions | {N} ← FIX THESE |
| Known bugs | {N} |
| Fixed | {N} ← VERIFY THESE |
| Flaky | {N} |
| New failures | {N} |
| Stable pass | {N} |

## Regressions (action required)

| # | Test | File | Was | Now | Likely Cause | Commit |
|---|------|------|-----|-----|-------------|--------|

## Fixed (verify intentional)

| # | Test | File | Bug ID | Was | Now |
|---|------|------|--------|-----|-----|

## Flaky (updated)

| # | Test | File | Flips Total | This Run |
|---|------|------|-------------|----------|

## New Failures (investigate)

| # | Test | File | Result | Notes |
|---|------|------|--------|-------|

## Visual Regressions

| Page | Change Detected | Severity | Notes |
|------|----------------|----------|-------|
```

## § Discovery File (data_flows/discovered-{page}.md)

```markdown
---
source: discovered
validated: false
discovered_by: qa-flows
questions_pending: {N}
created: {date}
updated: {date}
page: {page-slug}
---

# Discovered Flows — {Page Name}

## Page Purpose (assumed)
{One-line business purpose — human confirms or corrects}

## Observed Elements

| # | Element | Type | Behavior Observed | Assumption | Validated? |
|---|---------|------|-------------------|------------|------------|

## Observed Flows

### Flow D1: {name}
**Observation:** {what happened when I clicked/filled/submitted}
**Assumption:** {business-logic interpretation}
**API calls:** {endpoints hit}

## Questions Pending

- [ ] Q1: {question}
  - A) {option}
  - B) {option}
  - C) {option}
  - D) Other

## Changes Since Last Exploration

| Change Type | Element | Before | After | Date |
|-------------|---------|--------|-------|------|

## Notes
{Context, validation behavior, edge cases observed}
```

## § Data Flow File (data_flows/{slug}.md)

```markdown
---
source: human | synthesized | discovered
validated: true | false
discovered_by: user | qa-flows | qa-synthesize
questions_pending: 0
created: {date}
updated: {date}
---

# {Flow Name}

## Summary
{One-line description}

## Preconditions
- User role: {role}
- Required data: {what must exist}
- Starting page: {route}

## Steps

| # | Page | Action | Expected Result | API Call | Assertion |
|---|------|--------|----------------|----------|-----------|

## Business Rules Referenced
- docs/BACKEND-SPEC.md §{N}: {rule name}

## Questions for Human
- [ ] Q1: {question}

## Edge Cases (L4 targets)
- {scenario} → {expected behavior or ???}

## Notes
{Context}
```

## § Data Flows Index

```markdown
# Data Flows Index

> Auto-maintained by /qa-flows and /qa-synthesize.

## Validation Status
- Human-validated: {N} flows
- Synthesized (validated): {N}
- Discovered (pending review): {N}
- Questions pending: {N} total

## Flows

| Flow | Source | Validated | Pages | Rules | Questions | Updated |
|------|--------|-----------|-------|-------|-----------|---------|
```

## § Provenance Rules

| Source | Validated | qa-write behavior |
|--------|-----------|-------------------|
| `human` | `true` | Gold standard — write L3/L4 tests |
| `synthesized` | `true` | Write tests, tag `// derived from synthesized flow` |
| `synthesized` | `false` | L3 only, skip L4 edge cases |
| `discovered` | `true` | Human reviewed — treat like synthesized+validated |
| `discovered` | `false` | Do NOT write tests. Display for review only |

## § Nightshift State

```markdown
# Night Shift State

## Last Run
- Date: {date}
- Tests written: {N}
- Tests passing: {N}
- Tests deleted (broken): {N}
- Flows covered: {list}
- Stopped: {context limit | all done | error}

## Flow Coverage

| Flow | Steps | Tests Written | Tests Passing | Last Run |
|------|-------|---------------|---------------|----------|

## Test Registry

| Test Name | File | Flow | Step | Status | Attempts | Last Run |
|-----------|------|------|------|--------|----------|----------|
```

## § QA_HEALTH.md

```markdown
# QA Health Report — {date}

## Summary

| Page | Elements | Depth | Rules | UX | Bugs | Fresh | **Overall** | **Grade** |
|------|----------|-------|-------|-----|------|-------|-------------|-----------|

**Lowest health pages (prioritize):**
1. {page} — {score}% ({grade}) — {top issue}

**Dimensions with most gaps:**
- {dimension}: {N} pages below 50%
```

## § Business Rules Coverage

```markdown
# Business Rule Coverage

**Source:** docs/BACKEND-SPEC.md
**Last checked:** {date}

## Rules

| # | Rule | Type | Tested? | Test Location | Priority | Notes |
|---|------|------|---------|---------------|----------|-------|

## Coverage Summary

| Metric | Count |
|--------|-------|
| Total rules | {N} |
| Tested | {N} |
| Partial | {N} |
| Untested | {N} |
| **Coverage** | **{%}** |
```

## § API Contracts

```markdown
# API Contract Coverage

**Last checked:** {date}

## Endpoint Status

| # | Method | Path | Documented? | Called by Page? | Status Match? | Notes |
|---|--------|------|-------------|-----------------|---------------|-------|

## Drift Summary

| Metric | Count |
|--------|-------|
| Documented endpoints | {N} |
| Actually called | {N} |
| Undocumented but called | {N} |
| Documented but never called | {N} |
| Status mismatches | {N} |
```

## § Documentation Freshness

```markdown
# Documentation Freshness

**Last checked:** {date}

## Stale Documentation

| # | Doc File | Line/Section | Claim | Current State | Severity |
|---|----------|-------------|-------|---------------|----------|

## Freshness Summary

| Doc File | Claims Checked | Stale | Fresh | Freshness % |
|----------|---------------|-------|-------|-------------|
```

## § Autopilot State

```markdown
# Autopilot State

## Session Info
- **Current Session:** {N}
- **Status:** IN_PROGRESS | HANDOFF
- **Started:** {ISO date}
- **Env:** {Healthy/Partial/Down}

## Cycle Log

| # | Phase | Action | Target | Result | Bugs | Tests | Duration |
|---|-------|--------|--------|--------|------|-------|----------|
| 1 | PLAN | {action} | {target} | {one-line} | {N} | +{N} | ~{N}m |

## Session Thesis
{What we're testing and why — set in Phase 1, may be updated mid-session}

## Bugs Filed

| ID | Title | Severity | Status |
|----|-------|----------|--------|

## Tests Written

| File | Count | Type | Layer | Pass/Fail |
|------|-------|------|-------|-----------|

## Improvement Tracker (cross-session)

| ID | Issue | Found | Status | Sessions Since |
|----|-------|-------|--------|---------------|
| IMP-{N} | {systemic issue} | S{N} | OPEN/FIXED/STABLE | {N} |

## Strategic Metrics

| Metric | This Session | Last 3 Sessions | Trend |
|--------|-------------|-----------------|-------|
| New bugs found | {N} | {N, N, N} | {rising/flat/declining} |
| Surprises | {N} | {N, N, N} | |
| Areas tested | {list} | | |
| Improvements regressed | {N} | | |
| Ceiling areas | {list} | | |

## Handoff Notes — Session {N+1}

{Specific context + recommendations from journal}
```

## § Autopilot Session Journal

```markdown
# Session {N} Journal — {date}

## Thesis
{What we set out to test and why — the hypothesis that drove this session}

## Findings
{What the tests revealed about the system — patterns, not just pass/fail counts}
- {finding 1 — with reasoning}
- {finding 2}

## Surprises
{What contradicted our expectations — these are the most valuable learnings}
- {surprise 1 — expected X, got Y, which suggests Z}

## Model Updates
{How our understanding of the system changed this session}
- {insight about system behavior}
- {insight about testing approach}

## Improvement Tracker Updates
- NEW: {any new systemic issues discovered}
- RESOLVED: {any existing issues fixed}
- FALLBACK: {any previously-fixed improvements that regressed}

## Ceiling Assessment
{Areas where further testing adds little value — be honest}
- {area}: {why it's at ceiling — N sessions, 0 new bugs, adequate coverage}

## Recommendations for Session {N+1}
{Specific, reasoned — not a generic queue}
1. {recommendation — because {reason from this session's findings}}
2. {recommendation}
3. {recommendation}

## Metrics
- Tests written: {N} | Passing: {N}
- Bugs filed: {N} (H:{N} M:{N} L:{N}) | Bugs re-verified: {N}
- New insights: {N} | Surprises: {N}
- Hypothesis validation: {N}/{total} questions answered clearly
```

## § Autopilot Brief (Human-Facing Summary)

The session journal (`reports/.autopilot-journal-s{N}.md`) is the primary artifact. The brief below is a condensed view for quick morning review:

```markdown
# Autopilot Brief — Session {N} — {date}

## TL;DR
{One sentence: what we tested, what we found, what's next}

## Thesis
{What we set out to test and why}

## Key Findings
- {finding 1}
- {finding 2}

## Bugs
| ID | Severity | Title |
|----|----------|-------|

## Surprises
- {anything that contradicted expectations}

## Improvement Durability
- {any regressions on previously-fixed issues, or "All improvements holding"}

## Ceiling Areas
- {areas where further testing adds little value}

## Next Session Should
1. {recommendation with reason}
2. {recommendation}

## Morning Actions
1. Review journal — `reports/.autopilot-journal-s{N}.md`
2. Review bugs — `bugs.md`
3. Continue: `/qa-autopilot` in fresh session
```
