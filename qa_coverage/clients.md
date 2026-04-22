# Clients — Test Coverage

**Source:** `page_crawl/clients.md` (crawled 2026-03-30)
**Spec:** tests_e2e/specs/clients.spec.ts (35 tests)
**Coverage:** 20/20 (100%)
**Last updated:** 2026-03-30 (Run 15)

## Elements

| # | Element | Type | Tested? | Test Location | Priority | Notes |
|---|---------|------|---------|---------------|----------|-------|
| 1 | Heading "Клиенты" | text | Yes | clients.spec.ts:L10 | 0 | |
| 2 | Reset Filters button | button | Yes | clients.spec.ts:L23 | 0 | |
| 3 | Filters button | button | Yes | clients.spec.ts:L17 | 0 | |
| 4 | Add Columns button | button | Yes | clients.spec.ts:L20 | 0 | |
| 5 | Data table | table | Yes | clients.spec.ts:L12 | 0 | |
| 6 | Column headers (specific names) | columnheader | Yes | clients.spec.ts:L557-634 | 0 | phone, email, isAdult, avg delivery cost, sum purchase, ≥6 headers |
| 7 | Sort/remove icons per column | icon-action | Yes | clients.spec.ts:L4 sort+remove | 0 | Each header has 2 buttons: [0]=remove, [1]=sort |
| 8 | Data rows (10 per page) | table-rows | Yes | clients.spec.ts:L32-39 | 0 | |
| 9 | Null "-" display | text | Yes | clients.spec.ts:L639 | 0 | |
| 10 | Total count "342279" | text | Yes | clients.spec.ts:L28 | 0 | |
| 11 | Page buttons (numbered) | button | Yes | clients.spec.ts:L654-669 | 0 | Page 1 button visible on load |
| 12 | Previous page (disabled) | button | Yes | clients.spec.ts:L671 | 0 | Disabled state confirmed on page 1 |
| 13 | Next page button | button | Yes | clients.spec.ts:L3 pagination+L4 prev button | 0 | Tested via page 2 navigation and prev-button enable check |
| 14 | Page size input | input | Yes | clients.spec.ts:L694 | 0 | Default value "10" confirmed |
| 15 | Row click → detail | link | Yes | clients.spec.ts:L211-245 | 0 | |
| 16 | Filter dialog: predicate builder | modal | Yes | clients.spec.ts:L712-804 | 0 | НЕ switch, И/ИЛИ, Добавить условие/группу, condition row appears |
| 17 | Filter: НЕ/И/ИЛИ controls | toggle+radio | Yes | clients.spec.ts:L725-752 | 0 | НЕ=switch, И=radio, ИЛИ=SegmentedControl label |
| 18 | Filter: Add condition/group | button | Yes | clients.spec.ts:L754-782 | 0 | Both buttons tested, condition row verified |
| 19 | Column selector: field toggles | modal | Yes | clients.spec.ts:L3 column selector | 0 | Uses clickable div items in dialog, not checkboxes |
| 20 | Column selector: Save/Reset | button | Yes | clients.spec.ts:L825-838 | 0 | Both Сохранить and Сбросить visible |

## Top Untested (by priority)

(All elements now tested at L1-L4.)

## Bugs Found During Analysis

| # | Severity | Issue |
|---|----------|-------|
| — | Low | Mantine SegmentedControl hides native radio inputs — must assert visible label, not input element |
| — | Low | Mantine Popover filter dialog ignores Escape key; closes only via Сохранить or Вернуть buttons |
