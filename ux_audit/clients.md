# Clients — UX Findings

**Source:** `page_crawl/clients.md` (crawled 2026-03-30)
**Screenshot:** `page_crawl/clients.png`
**Audited:** 2026-03-30

## Findings

| # | P | Category | Proposition |
|---|---|----------|-------------|
| 1 | **P1** | Accessibility | Add `aria-label` to all column header icon buttons. The sort and remove icons have no accessible name — screen readers announce them as unlabeled buttons. 12 icon buttons across 6 columns (WCAG 4.1.2: Name, Role, Value). |
| 2 | **P2** | Data Display | Display column headers in a readable format. "CUSTOMER PHONE NUMBER", "ISADULT" are raw API field names in all-caps — transform to "Customer Phone Number", "Is Adult" for readability (Nielsen #2: Match between system and real world). |
| 3 | **P2** | Data Display | Show a meaningful representation for boolean values. "isAdult" column shows "1" instead of "Yes"/"True"/"Да" — raw numeric booleans are confusing (Nielsen #2: Match between system and real world). |
| 4 | **P2** | Data Display | Truncate long decimal values. "avg delivery cost" shows "56.388888888888856" — round to 2 decimal places for readability (Nielsen #8: Aesthetic and minimalist design). |
| 5 | **P2** | Feedback & Loading | Add a loading skeleton or spinner while the table data loads. Initial state shows "Всего: 0" with empty table before data arrives — misleading (Nielsen #1: Visibility of system status). |
| 6 | **P3** | Navigation | Add a visual indicator for the currently active page in sidebar. "Клиенты" link is not visually highlighted as the active page (Nielsen #6: Recognition rather than recall). |
| 7 | **P3** | Forms & Validation | Add a label or placeholder to the page size input. The textbox showing "10" has no label — users may not understand it controls rows per page (WCAG 3.3.2: Labels or Instructions). |
| 8 | **P2** | Empty & Error States | Show a friendly empty state when filter results return 0 rows. Currently shows the same table with no rows and "Всего: 0" — add "No customers match your filters" message (Nielsen #9: Help users recognize errors). |

## Global References

See dashboard.md #3 — same unlabeled icon button pattern (promoting to Global after one more occurrence).

## Business Logic Findings

| # | Severity | Finding | Reference |
|---|----------|---------|-----------|
| 1 | High | Pagination is non-deterministic without explicit orderBy. The page uses `POST /api/v2/tenant/data/customers` and the backend returns overlapping rows across pages when no sort is applied. Users browsing without clicking a column header will see duplicate records and miss others. | BUG-008 |
| 2 | Medium | Negative page values crash the customer query API with 500. If a user or browser extension sends `page=-1` (e.g., via back-navigation edge cases or manual URL editing), the server returns 500 instead of clamping to page 0 or returning 400. | BUG-023 |
| 3 | Medium | The "Add Columns" dialog (Добавить столбцы) is polluted with 100+ test-generated UDAF entries (`cdptest_*`, `biz_*`, `test_udaf_*`). No UDAF delete endpoint exists (`DELETE /api/tenants/udafs/{id}` is absent from the OpenAPI spec), so the clutter cannot be cleaned up. Real aggregates are buried and hard to find. | BUG-005 |
| 4 | Medium | Event field autocomplete in the Filters dialog returns 500. When a user opens Фильтры and selects an event-related field, the autocomplete call to `GET /api/tenant/data/autocomplete/field-values?table=events` fails with a 500 error. Customer field autocomplete works; only event fields are broken. | BUG-001 |
