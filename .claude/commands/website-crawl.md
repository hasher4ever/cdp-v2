---
name: website-crawl
description: Crawls the live CDP website via Playwright MCP. Navigates one page per invocation, extracts element inventory, checks page health, explores sub-states. Writes cached results to page_crawl/{page}.md for downstream QA/UX skills. Run MANUALLY after deploys or major UI changes — not auto-triggered by qa-next.
---

# Website Crawl — Shared Discovery Base

## Purpose

Crawl one page of a web application, extract its full element inventory, and cache the result for downstream analysis skills (`/qa-crawl`, `/ux-audit`). This skill handles all Playwright interaction so downstream skills never need to navigate or snapshot themselves.

**Output:** `page_crawl/{route-slug}.md` — a cached element inventory + page health report.

## CRITICAL RULES

1. **ONE page per invocation.** Playwright responses are large. Do not crawl multiple pages.
2. **SAVE before navigating away.** Write the page file before any further navigation.
3. **No destructive interactions.** Read-only exploration only — no form submissions, no deletes.
4. **Cap large data.** Table with >10 rows: record column headers + row count + first 3 rows. Dropdown with >20 options: record first 5 + total count. Skip parsing the rest.
5. **Skip repeated structure.** If sidebar/navbar was recorded on a previous page, don't re-document it — just note "Standard nav (see {first-page}.md)".

## File Structure

```
page_crawl/
  index.md              — Route table + crawl status
  login.md              — Per-page element inventory
  dashboard.md
  classes.md
  ...
```

## Authentication

Handle auth proactively:
1. On first run, check for `.env`, `auth.setup.ts`, or similar files to discover credentials and login flow.
2. If navigating to a page redirects to login, re-authenticate immediately, then retry.
3. If no credentials are found, ask the user once and remember for the session.
4. **Auth pages (login/signup) require logged-out state** — crawl them last.

## Setup — First Run

Check if `page_crawl/index.md` exists:
```
Glob: **/page_crawl/index.md
```

**If it exists:** Read it, find the next uncrawled route.

**If not:** Bootstrap:
1. Find the app's base URL from config files, env vars, or ask the user
2. Navigate to the app root, take a snapshot to discover navigation structure
3. Create `page_crawl/` directory
4. Create `page_crawl/index.md` with the template below
5. Proceed to crawl the first page

### index.md Template

```markdown
# Page Crawl Index — [Project Name]

> Base URL: [url]
> Auto-updated by /website-crawl, consumed by /qa-crawl and /ux-audit.

## Routes

| Route | Page | Status | Elements | Last Crawled |
|-------|------|--------|----------|--------------|

## Uncovered Paths

| Path / Trigger | Discovered From | Notes |
|----------------|----------------|-------|
```

### Per-Page File Template (`page_crawl/{route-slug}.md`)

```markdown
# {Page Name} (`{route}`)

**Last crawled:** {date}
**Stale after:** 7 days

## Structure

[1-2 sentence description: layout areas, key sections, navigation context]

## Elements

| # | Element | Type | Label / Text | State | Notes |
|---|---------|------|-------------|-------|-------|

Types: button, link, input, select, table, tab, modal-trigger, badge, icon-action, text, toggle

## Sub-States Explored

| Trigger | Result | Elements Added |
|---------|--------|---------------|

## Page Health

**Console errors:** [list or "None"]
**Console warnings:** [list or "None"]
**API calls on load:**

| Endpoint | Method | Status |
|----------|--------|--------|

## Routes Discovered

[Any links/buttons that lead to pages not yet in the index]
```

### Accessibility Snapshot Cache

After taking the Playwright snapshot (`mcp__playwright__browser_snapshot`), save the raw accessibility tree:

1. Save to: `page_crawl/.cache/{page}_a11y.md` — the raw snapshot output from Playwright MCP
2. This file is the **selector source of truth** for `/qa-write` agents — they read it instead of guessing selectors from the human-readable page_crawl/{page}.md
3. Updated on every crawl (overwritten, not appended)
4. Lives in .cache/ (not committed to git — transient artifact)

**Why:** The human-readable page file says "combobox" but doesn't capture the exact role/name/nesting that Playwright sees. qa-write agents need the raw tree to write correct selectors. Without this, agents guess selectors and produce 30%+ failure rates.

## Procedure

### Step 1: Navigate & Capture

**Save all Playwright output to files** to avoid blowing context with large responses:

```
browser_navigate → baseURL + route
browser_take_screenshot → filename: "page_crawl/{route-slug}.png"
browser_snapshot → filename: "page_crawl/.cache/{route-slug}_snapshot.md"
browser_console_messages → filename: "page_crawl/.cache/{route-slug}_console.md", level: "error"
browser_network_requests → filename: "page_crawl/.cache/{route-slug}_network.md", includeStatic: false
```

**Screenshot:** Saved alongside the page file (not in `.cache/`). Used by `/ux-audit` as visual evidence for designers.

Then **selectively read** only what you need:
```
Read: page_crawl/.cache/{route-slug}_snapshot.md (limit: 150)   # scan first 150 lines
Read: page_crawl/.cache/{route-slug}_console.md                  # errors only, usually small
Read: page_crawl/.cache/{route-slug}_network.md                  # small without static
```

If the snapshot is larger than 150 lines, read in chunks (`offset`/`limit`) — scan for the main content area and skip repeated sidebar/nav already documented.

If redirected to auth, handle per Authentication section above.

**Sub-state snapshots** also save to file:
```
browser_snapshot → filename: "page_crawl/.cache/{route-slug}_tab2.md"
```

This keeps the conversation context lean regardless of page complexity.

### Step 2: Extract Elements

Parse the snapshot file. For each interactive or meaningful element, record:
- **#** — sequential number
- **Element** — human description ("Save button", "Email input", "Status filter: Active")
- **Type** — one of: button, link, input, select, table, tab, modal-trigger, badge, icon-action, text, toggle
- **Label / Text** — the visible label, placeholder, or aria-label. Note if MISSING.
- **State** — enabled/disabled, checked/unchecked, expanded/collapsed, or "—"
- **Notes** — missing aria-label, missing role, untranslated text, or other observations

**Skip recording:** purely decorative elements, repeated nav items already documented, individual table data rows.

### Step 3: Check Page Health

Read the saved console and network files:
```
Read: page_crawl/.cache/{route-slug}_console.md   # already filtered to errors
Read: page_crawl/.cache/{route-slug}_network.md    # already excludes static
```

Record in the Page Health section.

### Step 4: Explore Sub-States (selective)

Only explore sub-states likely to reveal NEW element patterns. **Always save snapshots to files:**

- **First modal on this page** — open, `browser_snapshot → filename: ".cache/{slug}_modal.md"`, close. Skip if identical pattern to a modal already documented on another page.
- **Tabs** — click each, snapshot to file. But if tab content is structurally identical (same table, different filter), note "Same structure as {tab}" after the first.
- **Expandable sections** — expand one, note the pattern, skip the rest if identical.
- **Dropdowns** — open, record options (capped at 5 + total), close.

After EACH sub-state, read the saved snapshot file and append new elements to the Elements table. Note the trigger in Sub-States Explored.

### Step 5: Record Discovered Routes

Any links, buttons, or navigation targets that point to pages NOT in `page_crawl/index.md` — add to the Routes Discovered section and to the index's Uncovered Paths table.

### Step 6: Save

Write `page_crawl/{route-slug}.md` with all sections populated.

Update `page_crawl/index.md`:
- Routes table: update status to "Done", element count, date
- Add any new routes from Routes Discovered

### Step 7: Report

```
## Crawl Complete: {Page Name}

- Elements: {N}
- Sub-states explored: {N}
- Console errors: {N}
- New routes discovered: [list]
- Missing labels: {N} elements

### What's Next?
1. **`/qa-crawl {page}`** — find test coverage gaps for this page *(recommended — turns crawl data into actionable gaps)*
2. **`/ux-audit {page}`** — evaluate UX heuristics and accessibility *(if UX review is the priority)*
3. **`/website-crawl {next page}`** — crawl the next uncrawled page *(if more pages need discovery first)*
```

## Re-Crawl

When a page file already exists and is older than 7 days (or user requests re-crawl):
1. Read existing file
2. **Preserve previous screenshot:** copy `page_crawl/{page}.png` → `page_crawl/.cache/{page}_prev.png` (used by `/qa-triage` for visual regression diffing)
3. Re-navigate and re-snapshot
4. Diff elements: mark [NEW], [REMOVED], [CHANGED]
5. Preserve downstream annotations (Tested?, Priority, UX findings) — only update the base element data
6. Update "Last crawled" date

## Quick-Scan Mode (DEFAULT)

**All pages start in quick-scan mode.** This is the default to minimize tool calls and maximize pages-per-run. Only escalate to full crawl when there's a reason.

### Quick-scan procedure (~3 tool calls):
1. Navigate and snapshot — no sub-state exploration
2. Record elements from snapshot only
3. Set `Quick scan: true` in the page file header
4. Skip modals, tabs, expandables, dropdowns

### Escalate to full crawl when:
- **User explicitly requests:** `/website-crawl --full {page}`
- **Downstream flags gaps:** qa-crawl or ux-audit reports "coverage uncertain — quick scan insufficient" → next run auto-escalates
- **Page is a primary workflow:** login, main dashboard, or entity detail pages (forms-heavy, high interaction density) — these warrant full crawl on first visit
- **Re-crawl after escalation request:** If `page_crawl/{page}.md` has `Escalate: true` (set by downstream skills), automatically do a full crawl

### Full crawl procedure (~8 tool calls):
1. Navigate, snapshot, screenshot, console, network
2. Explore sub-states: modals, tabs, expandables, dropdowns
3. Set `Quick scan: false` in the page file header

**Downstream skills** (`/qa-crawl`, `/ux-audit`) check the `Quick scan` flag. If set, they know the cache is shallow. They may request escalation by writing `Escalate: true` to the page file header — the next `/website-crawl` invocation picks this up automatically.

## Performance Metrics

Record timing and size metrics for every page. These feed into `/ux-audit` (performance is a UX issue) and help identify pages that need optimization.

### What to capture

During Step 1 (Navigate & Capture), record:

| Metric | How to capture | Threshold |
|--------|---------------|-----------|
| **Page load time** | Time from `browser_navigate` start to `networkidle` | Flag if >3s |
| **Largest API call** | From network requests file: slowest non-static request | Flag if >2s |
| **Failed API calls** | Count of 4xx/5xx responses in network file | Flag if >0 |
| **DOM size** | Line count of snapshot file (proxy for DOM complexity) | Flag if >500 lines |
| **Total API calls on load** | Count of requests in network file | Flag if >20 |

### Add to page file

Add a **Performance** section to each `page_crawl/{page}.md`:

```markdown
## Performance

| Metric | Value | Status |
|--------|-------|--------|
| Page load | {N}ms | {OK / SLOW} |
| Slowest API | {endpoint} {N}ms | {OK / SLOW} |
| Failed APIs | {N} | {OK / FAIL} |
| DOM lines | {N} | {OK / HEAVY} |
| API calls on load | {N} | {OK / EXCESSIVE} |
```

Pages flagged SLOW/HEAVY/EXCESSIVE get noted in the index with a ⚠ marker.

### This is NOT load testing

This measures single-user page load performance only. It catches: unoptimized queries, missing pagination, N+1 API calls, heavy DOM rendering. It does not catch: concurrent user issues, memory leaks, or server-side bottlenecks under load.

## Cross-Browser Mode (optional, explicit only)

**Only runs when explicitly requested:** `/website-crawl --browsers /dashboard`

Default crawling uses Chromium only. Cross-browser mode re-crawls a page in multiple browsers to catch rendering and behavior differences.

### Procedure

1. Read the existing `page_crawl/{page}.md` (must exist — run default crawl first)
2. For each additional browser (Firefox, WebKit/Safari):
   - Navigate to the same page
   - Take screenshot: `page_crawl/{page}-{browser}.png`
   - Take snapshot, save to cache
   - Compare element inventory against Chromium baseline
   - Record differences only (missing elements, different states, layout shifts)
3. Append a **Cross-Browser** section to the page file:

```markdown
## Cross-Browser

| Browser | Elements Match | Differences |
|---------|---------------|-------------|
| Firefox | {N}/{total} | {list of diffs or "None"} |
| WebKit | {N}/{total} | {list of diffs or "None"} |
```

### When NOT to use

- Internal tools where everyone uses Chrome → skip
- First-pass auditing → skip, do Chromium-only first
- Quick-scan mode → never combines with cross-browser

## Housekeeping

**`.cache/` is transient.** Raw snapshot, console, and network files are intermediate artifacts — large and not human-readable. On first run, add `page_crawl/.cache/` to the project's `.gitignore` (or create one if missing). Only the processed `page_crawl/{page}.md` files and screenshots are committed.

**Migration from legacy single-file format:** If a legacy `QA_COVERAGE.md` exists with inline element tables (pre-cache format), that data is stale and incompatible with the new layered architecture. Start fresh with `/website-crawl`. Rename the old file to `QA_COVERAGE_v1.md` for reference.

## Staleness

Each page file has `Last crawled: {date}` and `Stale after: 7 days`. Downstream skills check this before reusing. If stale, they trigger a re-crawl automatically.

