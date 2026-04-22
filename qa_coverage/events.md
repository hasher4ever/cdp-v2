# Events — Test Coverage

**Source:** `page_crawl/events.md` (crawled 2026-03-30)
**Spec:** tests_e2e/specs/events.spec.ts (32 tests)
**Coverage:** 16/16 (100%)

## Elements

| # | Element | Type | Tested? | Test Location | Priority | Notes |
|---|---------|------|---------|---------------|----------|-------|
| 1 | Heading "События purchase" | text | Yes | events.spec.ts L1:heading | 0 | Dynamic title asserted |
| 2 | Reset Filters | button | Yes | events.spec.ts:L136, L4:reset | 0 | Reset returns to original state (L4) |
| 3 | Filters button | button | Yes | events.spec.ts:L89, L3:filter | 0 | Opens filter panel, contains combobox controls (L3) |
| 4 | Add Columns | button | Yes | events.spec.ts:L93, L4:column | 0 | Opens dialog, lists fields, adds column on click (L4) |
| 5 | Data table | table | Yes | events.spec.ts:L72 | 0 | |
| 6 | Column headers (specific names) | columnheader | Yes | events.spec.ts L1:column headers | 0 | All 4 specific names asserted |
| 7 | Column icon inconsistency (1 vs 2 buttons) | icon-action | Yes | events.spec.ts L2:inconsistency | 0 | Asserts Customer Primary ID < other headers |
| 8 | Data rows | table-rows | Yes | events.spec.ts:L76 | 0 | |
| 9 | Row expand → timeline | modal-trigger | Yes | events.spec.ts L2:row expand | 0 | Asserts expand increases rows or shows "Показать ещё" |
| 10 | "Показать ещё 10" lazy load | button | Yes | events.spec.ts L3:show more | 0 | Click loads additional rows in expanded timeline (L3) |
| 11 | Total count | text | Yes | events.spec.ts:L98 | 0 | |
| 12 | Pagination buttons | button | Yes | events.spec.ts L1:pagination, L3:pagination | 0 | Page 2 loads different data (L3), rapid clicks don't crash (L4) |
| 13 | Page size input | input | Yes | events.spec.ts L1:page size, L3:page size, L4:options | 0 | Mantine Select with numeric options; changing size updates rows (L3) |
| 14 | Events dropdown (11 types) | modal-trigger | Yes | events.spec.ts:L6 | 0 | |
| 15 | Individual event types (10 of 11) | link | Yes | events.spec.ts L2:11 types, L3:switch type | 0 | Switching type changes heading and data (L3) |
| 16 | Filter dialog | modal | Yes | events.spec.ts:L123, L3:filter controls | 0 | Opens with combobox/textbox controls (L3) |

## Top Untested (by priority)

None — all elements covered at L1-L4.

## Bugs Found During Analysis

| # | Severity | Issue |
|---|----------|-------|
| 1 | Low | Customer Primary ID column has 1 icon button while other columns have 2 — UI inconsistency (confirmed by L2 test) |
