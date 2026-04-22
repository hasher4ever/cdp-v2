# Scenarios — UX Findings

**Source:** `page_crawl/scenarios.md` (crawled 2026-03-30)
**Audited:** 2026-03-30

## Findings

| # | P | Category | Proposition |
|---|---|----------|-------------|
| 1 | **P2** | Data Display | Format the "Создано" (Created) column as a human-readable date. Currently shows raw ISO 8601: "2026-03-29T10:36:49.047819Z" — display as "29.03.2026 10:36" to match the locale (Nielsen #2: Match between system and real world). |
| 2 | **P2** | Forms & Validation | Validate scenario name on the frontend. BUG-014: whitespace-only names are accepted. BUG-015: XSS payloads stored as-is. Add client-side trimming and sanitization (Nielsen #5: Error prevention). |
| 3 | **P3** | Data Display | Add a "No scenarios" empty state when the list is empty. Currently shows a table with headers and no rows — add a CTA like "Create your first scenario" (Nielsen #9: Help users recognize, diagnose, and recover from errors). |

## Global References

See G.1 — unlabeled icon buttons.

## Business Logic Findings

| # | Severity | Finding | Reference |
|---|----------|---------|-----------|
| BL.1 | Medium | BUG-014: Whitespace-only scenario names accepted by backend | bugs.md BUG-014 |
| BL.2 | Low | BUG-015: XSS payloads stored in scenario names without sanitization | bugs.md BUG-015 |
