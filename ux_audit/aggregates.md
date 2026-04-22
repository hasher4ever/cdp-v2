# Aggregates — UX Findings

**Source:** `page_crawl/aggregates.md` (crawled 2026-03-30)
**Audited:** 2026-03-30

## Findings

| # | P | Category | Proposition |
|---|---|----------|-------------|
| 1 | **P2** | Data Display | Add pagination or virtual scroll. All aggregates load in a single table (100+ rows) — this will degrade as data grows (Nielsen #7: Flexibility and efficiency). |
| 2 | **P2** | Forms & Validation | Explain the "Группировать события" switch. This toggle has no tooltip or help text explaining what grouping does — add an info popover (Nielsen #10: Help and documentation). |
| 3 | **P2** | Forms & Validation | Clarify "За всё время" time window. The button exists but users may not know they can change it or what the alternatives are — make it a dropdown with visible options (Nielsen #6: Recognition rather than recall). |
| 4 | **P3** | Data Display | Truncate UUID column — same as campaigns and communications. |
| 5 | **P3** | Consistency | Add an action column (edit/delete). Segments and campaigns have action menus per row, but aggregates do not — inconsistent CRUD pattern across marketing features (Nielsen #4: Consistency and standards). |

## Global References

See G.1 — unlabeled icon buttons.

## Business Logic Findings

| # | Severity | Finding | Reference |
|---|----------|---------|-----------|
| BL.1 | Medium | BUG-022: Empty aggregate names accepted by backend | bugs.md BUG-022 |
| BL.2 | High | BUG-002: UDAFs with event filter predicates return null/0 for valid data | bugs.md BUG-002 |
| BL.3 | Medium | BUG-025: UDAF PUT update returns 400 — editing is broken | bugs.md BUG-025 |
