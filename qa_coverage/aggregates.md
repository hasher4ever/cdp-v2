# Aggregates — Test Coverage

**Source:** `page_crawl/aggregates.md` (crawled 2026-03-30)
**Spec:** tests_e2e/specs/aggregates.spec.ts (35 tests)
**Coverage:** 15/15 (100%)

## Elements

| # | Element | Type | Tested? | Test Location | Priority | Notes |
|---|---------|------|---------|---------------|----------|-------|
| 1 | Heading "Агрегаты" | text | Yes | aggregates.spec.ts:L11, L139 | 0 | |
| 2 | Add button | button | Yes | aggregates.spec.ts:L15, L143 | 0 | |
| 3 | Table | table | Yes | aggregates.spec.ts:L22-32, L149-161 | 1 | ID + Название cols verified |
| 4 | No pagination | — | Yes | aggregates.spec.ts:L163 | 2 | Asserts absence of pagination |
| 5 | Empty name rows | text | Yes | aggregates.spec.ts:L443 (BUG-022) | 2 | BUG-022 confirmed: 10 rows |
| 6 | Dialog: Name | input | Yes | aggregates.spec.ts:L48, L183 | 0 | |
| 7 | Dialog: Time window | button | Yes | aggregates.spec.ts:L190 | 4 | Scoped to dialog, first() |
| 8 | Dialog: Function | select | Yes | aggregates.spec.ts:L196 | 3 | Label presence; custom dropdown (no combobox role) |
| 9 | Dialog: Event Type | select | Yes | aggregates.spec.ts:L53-65, L203 | 3 | Label verified |
| 10 | Dialog: Fields | select | Yes | aggregates.spec.ts:L209 | 3 | Disabled state asserted |
| 11 | Dialog: Grouping switch | toggle | Yes | aggregates.spec.ts:L223 | 4 | Full Russian label checked |
| 12 | Dialog: Info icon | icon-action | Yes | aggregates.spec.ts:L468 | 1 | Verified visible near grouping switch |
| 13 | Dialog: Event filter | — | Yes | aggregates.spec.ts:L229 | 4 | Section label visible |
| 14 | Dialog: Create | button | Yes | aggregates.spec.ts:L107, L235 | 0 | |
| 15 | Dialog: Reset | button | Yes | aggregates.spec.ts:L241 | 2 | |

## Top Untested (by priority)

All elements now covered.

## Notes

- L1 Smoke (5 tests) and L2 Interaction (11 tests) added 2026-03-29 via `/qa-write L1+L2`
- L3 Data Flow (5 tests) and L4 Edge Cases (7 tests) added 2026-03-30
- Function dropdown uses a custom component without `combobox` ARIA role — label-based assertion used
- Time window button: strict mode requires `.first()` (button + inner `<p>` both match by text)
- IDs are UUIDs (not numeric integers)
- Fields dropdown requires BOTH Function AND Event Type selected to become enabled
- BUG-022 confirmed: 10 rows with empty Название
