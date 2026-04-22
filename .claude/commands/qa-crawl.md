---
name: qa-crawl
description: Test coverage lens on top of /website-crawl. Cross-references the cached element inventory against existing test/spec files to identify untested elements. Writes reports/QA_COVERAGE.md and qa_coverage/ per-page files. Run /website-crawl first to populate the page_crawl/ cache.
---

# QA Crawl — Test Coverage Lens

## Purpose

Analyze one page's element inventory (from `/website-crawl` cache) and cross-reference against existing test files to identify coverage gaps. Discovery only — does NOT write tests.

**Input:** `page_crawl/{page}.md` (must exist)
**Output:** `reports/QA_COVERAGE.md` (index) + `qa_coverage/{page}.md` (per-page coverage)

**Canonical paths:** Always write to `reports/QA_COVERAGE.md` and `qa_coverage/`. Never use root, `tests/`, or `to_do/` — those are legacy.

## Model Tiering

| Task | Model |
|------|-------|
| Per-page element coverage scan | **Sonnet** |
| Extension scans (`--api`, `--rules`, `--docs`) | See below |

## Critical Rules

1. **ONE page per invocation.**
2. **Never navigate with Playwright.** Never auto-trigger `/website-crawl`. See Cache Policy.
3. **Do NOT write tests.** Discovery only.
4. **Preserve UX audit data.** Reference `reports/UX_AUDIT.md` findings in Notes column — don't duplicate.

## Cache Policy

Check for `page_crawl/{page}.md`:

| State | Action |
|-------|--------|
| Fresh (<7 days) | Use silently |
| Stale (>7 days) | WARN, continue with stale data |
| Missing | ERROR + STOP — user must run `/website-crawl` manually |

Check freshness via the `Last crawled` date in the file header. **Never auto-trigger `/website-crawl`.**

## Depth Check

After loading cache, check the header:
- **`Quick scan: true`** — shallow cache. Note in report: "Based on quick scan — run `/website-crawl {page}` for full coverage."
- **Escalation:** If >30% untested AND page has form submits/destructive actions, write `Escalate: true` to the page file header.

## File Structure

```
reports/QA_COVERAGE.md            — Index: route coverage table + summary
qa_coverage/
  {page}.md                       — Per-page: element table with Tested?/Priority columns
  .test-index.md                  — Cached spec file index
  .summary.json                   — Machine-readable summary
page_crawl/                       — Shared cache (from /website-crawl)
```

## Setup — First Run

If `reports/QA_COVERAGE.md` doesn't exist:

1. Read `page_crawl/index.md` for route list. If missing, ERROR + STOP.
2. Scan test directories: `tests/`, `e2e/`, `spec/`, `__tests__/`, `playwright.config.*`
3. Build spec index: which page each spec covers, test count
4. Create `reports/QA_COVERAGE.md` and `qa_coverage/` directory

Templates: See `references/qa-output-templates.md` § QA_COVERAGE.md and § Per-Page Coverage.

## Procedure

### Step 1: Load Cache

Read `page_crawl/{route-slug}.md`. Apply Cache Policy — if missing, STOP; if stale, WARN and continue.

### Step 2: Load Spec Files

**First run — build test index:**
1. Scan all test directories
2. For each spec: extract page routes, selectors/text asserted, roles/aria-labels queried
3. Write index to `qa_coverage/.test-index.md`

**Subsequent runs — reuse index:** Read `.test-index.md`, filter to current page's route, read only matching specs. Rebuild index if any spec file is newer than `.test-index.md`.

**Match each element** against test files. Mark as: **Yes** (covered), **Partial** (exists but incomplete), **No** (uncovered).

### Step 3: Score Priority

Assign 0-10 to each untested element:

| Condition | Points |
|-----------|--------|
| Form submit / destructive action | +3 |
| Navigation to another route | +2 |
| Inline edit / toggle / combobox | +2 |
| Data display (table, KPI, badge) | +1 |
| Known bug (from page health) | +1 |
| Missing accessibility | +1 |
| Decorative only | +0 |

### Step 4: Cross-Reference UX Audit

If `reports/UX_AUDIT.md` exists, add "UX P1: {finding}" notes for relevant elements.

### Step 4.5: Classify Test Layer

Add a **Needs** column:

| Element Type | Needs |
|-------------|-------|
| Visible element, label, layout | **FE** (smoke) |
| Button, link, toggle, combobox | **FE** (interaction) |
| Form submit -> API call | **FE + BE** |
| API-only (no UI surface) | **BE** only |
| Data display (table cell, KPI) | **FE** (render check) |

Add **FE Test Status** summary at bottom of per-page file:
```
## FE Test Status
- Has E2E smoke test? {Yes/No}
- Interactive elements: {N} total, {M} tested, {K} missing
- Missing FE tests: {list}
```

### Step 5: Write Results

Write `qa_coverage/{page}.md`: element table (Tested?/Priority/Needs/Notes), FE Test Status, top 10 untested by priority, bugs found. Template: See `references/qa-output-templates.md` § Per-Page Coverage.

Update `reports/QA_COVERAGE.md`: routes table + recalculate coverage summary.

Write/update `qa_coverage/.summary.json`:

```json
{
  "generated": "{ISO date}",
  "pages": {
    "{route}": {
      "elements": 0, "tested": 0, "coverage": 0,
      "feSmoke": false, "feInteractive": 0,
      "feInteractiveTested": 0, "feGaps": []
    }
  },
  "totals": { "elements": 0, "tested": 0, "coverage": 0 }
}
```

### Step 6: Report

```
## QA Coverage: {Page Name}

- Elements: {N} (from crawl cache, {date})
- Tested: {Y} ({%})
- Untested: {W}
- Top priority gaps:
  1. {element} — P{score}
  2. {element} — P{score}
  3. {element} — P{score}

### What's Next?
1. `/qa-write {page}` — write tests for gaps found above
2. `/ux-audit {page}` — run UX audit in parallel if not done
3. `/qa-crawl {next page}` — analyze the next page
```

### Extension Scans

For API drift (`--api`), business rule coverage (`--rules`), and documentation freshness (`--docs`): see `references/qa-crawl-extensions.md`.

## After All Pages

When all routes are checked:
1. Generate global priority list: all untested elements across pages, sorted by priority, grouped by spec file
2. Propose test-writing plan with effort estimates
3. Run extension scans (`--api`, `--rules`, `--docs`) per `references/qa-crawl-extensions.md`

## Output Verification

After writing output files:
1. Glob each file — confirm it exists at the canonical path
2. If a file exists at a legacy path too, warn: "Stale copy at {legacy} — consider deleting"
3. If a written file is NOT at the canonical path, error: "Output missing at {path} — write failed"
