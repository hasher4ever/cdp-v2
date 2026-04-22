---
name: ux-audit
description: UX heuristic lens on top of /website-crawl. Evaluates cached element inventory against Nielsen heuristics and WCAG 2.1 AA. Produces prioritized, actionable propositions for designers. Writes reports/UX_AUDIT.md and ux_audit/ per-page files. Run /website-crawl first or let this skill trigger it automatically.
---

# UX Audit — Heuristic Evaluation Lens

## Purpose

Evaluate one page's element inventory (from `/website-crawl` cache) against Nielsen heuristics and WCAG 2.1 AA. This skill reads cached data — it does NOT navigate or snapshot unless the cache is missing.

**Input:** `page_crawl/{page}.md` (auto-triggers `/website-crawl` if missing or stale)
**Output:** `reports/UX_AUDIT.md` (index) + `ux_audit/{page}.md` (per-page findings)

**Canonical paths (see CLAUDE.md "Canonical Skill Output Paths"):** Always write to `reports/UX_AUDIT.md` and `ux_audit/` at root. Never write to `UX_AUDIT.md` at root, `to_do/ux_audit.md` — that is a legacy location.

**Audience:** Designers and product owners. Every proposition is actionable, specific, and cites the standard it violates.

## CRITICAL RULES

1. **ONE page per invocation.**
2. **Never navigate with Playwright directly.** If the page cache is missing or stale, run `/website-crawl` first.
3. **Framework-agnostic.** Describe WHAT is wrong and WHAT the fix should achieve, never HOW to code it.
4. **Standards-backed.** Every P1/P2 finding must cite the heuristic or WCAG criterion.
5. **Only write categories with findings.** Do not write "No issues found" sections — skip them entirely.
6. **Promote to global after 2 occurrences.** If you see the same issue pattern on 2+ pages, move it to Global Issues and reference it from per-page files.

## Severity Levels

| Priority | Definition |
|----------|-----------|
| **P1** | Usability blocker, data-loss risk, WCAG A/AA violation, trust defect |
| **P2** | Friction, confusion, missing feedback, inefficiency |
| **P3** | Polish, delight, power-user efficiency |

## Evaluation Categories

Evaluate against these — but only document categories that have findings:

1. **Navigation & Wayfinding** — Nielsen #3, #6
2. **Forms & Validation** — Nielsen #5, #9; WCAG 1.3.1, 3.3.2
3. **Feedback & Loading States** — Nielsen #1, #5
4. **Accessibility** — WCAG 2.1 AA (contrast, keyboard, labels, roles, focus)
5. **Data Display** — Nielsen #7, #8
6. **Empty & Error States** — Nielsen #9
7. **Visual Hierarchy & Layout** — Nielsen #8, Gestalt principles
8. **Consistency & Standards** — Nielsen #4

## File Structure

```
UX_AUDIT.md                       — Index: route table + global issues + summary
ux_audit/
  login.md                        — Per-page findings
  dashboard.md
  ...
page_crawl/                       — Shared cache (written by /website-crawl)
  index.md
  dashboard.md
  ...
```

## Setup — First Run

Check if `reports/UX_AUDIT.md` exists. If not:

1. Read `page_crawl/index.md` for the route list (if it exists). Otherwise, discover routes via `/website-crawl`.
2. Create `ux_audit/` directory
3. Create `reports/UX_AUDIT.md` with the template below

### UX_AUDIT.md Template

```markdown
# UX Audit — [Project Name]

> Consumed from /website-crawl cache. Updated by /ux-audit.
> Audience: Designers & product owners.

## Routes

| Route | Page | Status | P1 | P2 | P3 | Last Audited |
|-------|------|--------|----|----|----|-------------|

## Global Issues

[Issues recurring on 2+ pages — documented once, referenced from per-page files]

| # | P | Finding |
|---|---|---------|

## Summary

| Priority | Count | Focus Area |
|----------|-------|------------|
| P1 | 0 | |
| P2 | 0 | |
| P3 | 0 | |
```

### Per-Page Template (`ux_audit/{page}.md`)

```markdown
# {Page Name} — UX Findings

**Source:** `page_crawl/{page}.md` (crawled {date})
**Screenshot:** `page_crawl/{page}.png`
**Audited:** {date}

## Findings

| # | P | Category | Proposition |
|---|---|----------|-------------|

## Global References

[List any Global Issues that apply to this page: "See G.1, G.3"]
```

## Procedure

### Step 1: Load Cache

```
Read: page_crawl/{route-slug}.md
```

**Staleness:** If file doesn't exist or `Last crawled` is older than 7 days, announce and run `/website-crawl` first.

**Quick scan flag:** If the page file has `Quick scan: true`, the cache has no sub-state data (modals, tabs, expanded sections). Evaluate what's there but note in the report: "Based on quick scan — modal/tab UX not evaluated. Run `/website-crawl {page}` for full audit."

**Escalation:** If the page has P1 findings that likely involve hidden sub-states (modal forms, tab content, expandable details) that couldn't be evaluated due to quick scan, write `Escalate: true` to the page file header. The next `/website-crawl` invocation will do a full crawl automatically.

**Screenshot:** Reference `page_crawl/{route-slug}.png` in the per-page finding file as visual evidence for designers.

### Step 2: Evaluate

Walk through the cached element inventory. For each element and the page as a whole, check against all 8 categories. Draft findings using this format:

```
| {n} | **P{1-3}** | {Category} | {Actionable imperative sentence}. {Standard citation}. |
```

**Good:** "Add `aria-label` to the Save icon button. Screen readers announce it as 'button' with no context (WCAG 4.1.2: Name, Role, Value)."

**Bad:** "Consider improving this." / "Add `onClick={...}` handler."

Use the crawl's Notes column as hints — elements already flagged as "missing aria-label" or "untranslated" are likely P1/P2 findings.

### Step 3: Check for Cross-Cutting Patterns

Read existing `ux_audit/` page files (headers only — don't re-read full findings). If the current page has an issue that matches a pattern from a previous page:
- If a Global Issue already exists: reference it ("See G.{n}") instead of duplicating
- If this is the 2nd occurrence: create a new Global Issue, move both instances there

### Step 4: Cross-Reference QA Coverage

If `reports/QA_COVERAGE.md` exists, check for this page. Elements marked "Untested" with high priority are worth noting — untested + UX-broken is higher risk.

### Step 5: Write Results

Write `ux_audit/{page}.md` with findings table and global references.

Update `reports/UX_AUDIT.md`:
- Routes table: status, P1/P2/P3 counts, date
- Global Issues: add new cross-cutting findings
- Summary: recalculate totals

### Step 6: Report

```
## UX Audit: {Page Name}

- P1: {X} | P2: {Y} | P3: {Z}
- Top issues: [top 3 P1s]
- Global patterns: [new or referenced]

### What's Next?
1. **`/qa-write {page}`** — write tests targeting the P1 UX issues found *(recommended — P1 findings need test coverage)*
2. **`/ux-audit {next page}`** — audit the next page *(if more pages need UX review)*
3. **`/qa-crawl {page}`** — check test coverage if not done yet *(pairs well — UX findings inform test priority)*
```

## After All Pages

1. Finalize Global Issues section
2. Write sequencing recommendation:
   - Sprint 1: P1 items (accessibility, blockers)
   - Sprint 2-3: P2 grouped by theme (i18n, empty states, loading)
   - Backlog: P3 polish
3. Offer to generate tickets from P1/P2 findings

## Quick-Scan Mode

When >5 pages remain and the current page is structurally similar to an already-audited page:
1. Read the cache
2. Check only for NEW issue patterns not already captured in Global Issues
3. Reference applicable globals: "See G.1, G.2, G.4"
4. Only document findings unique to this page
5. Note "Quick scan — similar to {page}" in the page file

## Output Verification

After writing output files, verify they landed at the canonical paths:

1. Glob for each file you wrote — confirm it exists at the expected path
2. If a file exists at a legacy path too (see CLAUDE.md "Legacy locations"), warn: "Stale copy at {legacy} — consider deleting it"
3. If a file you wrote is NOT found at the canonical path, error: "Output missing at {path} — write failed"

