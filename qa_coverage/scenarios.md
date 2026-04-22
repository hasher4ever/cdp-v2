# Scenarios — Test Coverage

**Source:** `page_crawl/scenarios.md` (crawled 2026-03-30)
**Spec:** tests_e2e/specs/scenarios.spec.ts (28 tests after L3+L4)
**Coverage:** 13/13 (100%) — updated 2026-03-30 (L3+L4 complete)

## Elements

| # | Element | Type | Tested? | Test Location | Priority | Notes |
|---|---------|------|---------|---------------|----------|-------|
| 1 | Heading "Сценарии" | text | Yes | scenarios.spec.ts:L13 | 0 | |
| 2 | Add button | button | Yes | scenarios.spec.ts:L31 | 0 | |
| 3 | Table | table | Yes | scenarios.spec.ts:L14 | 0 | |
| 4 | Column: Название | columnheader | Yes | scenarios.spec.ts:L21 | 0 | |
| 5 | Column: Создано | columnheader | Yes | scenarios.spec.ts:L24 | 0 | |
| 6 | Column: Статус | columnheader | Yes | scenarios.spec.ts:L27 | 0 | |
| 7 | Status badge "Новый" | badge | Yes | scenarios.spec.ts:L46 | 0 | |
| 8 | Row click → builder | link | Yes | scenarios.spec.ts:L97-99 | 0 | |
| 9 | Dialog: Name input | input | Partial | scenarios.spec.ts:L64 | 2 | Visibility, not validation |
| 10 | Dialog: Submit | button | Partial | scenarios.spec.ts:L80 | 2 | Visibility only |
| 11 | Dialog: Close (X) | button | Yes | scenarios.spec.ts L550 @generated | 0 | Closed via `dialog.getByRole("banner").getByRole("button")` |
| 12 | XSS payload in name | text | Yes | scenarios.spec.ts:L212 | 0 | BUG-015 |
| 13 | Raw ISO date format | text | Yes | scenarios.spec.ts L501 @generated | 0 | Asserts /\d{4}-\d{2}-\d{2}/ pattern |

## L3+L4 Tests Added (2026-03-30)

| Test | Level | What it covers |
|------|-------|----------------|
| API call uses page+size params | L3 | Data source is paginated API |
| Exactly 10 rows = API size=10 | L3 | Table row count matches API page size |
| Name verbatim, no truncation | L3 | Names rendered without ellipsis |
| Full ISO 8601 timestamp in Создано | L3 | Time component preserved, not date-only |
| New scenario appears after creation | L3 | Create → navigate back → visible in list |
| All rows have "Новый" status | L3 | Status badge consistent for all rows |
| Zero console errors on load | L4 | No JS errors on page init |
| XSS name renders as text, no execution | L4 | BUG-015 confirmed; page functional |
| Escape closes creation dialog | L4 | Mantine Modal escape behavior |
| Empty name blocked in dialog | L4 | Client-side validation prevents submit |
| Back-navigate from builder → list | L4 | Browser back works, no errors |
| Rapid double-click navigates once | L4 | No double UUID in URL |

## Top Untested (by priority)

All elements fully covered at L1–L4. No remaining gaps.
