# Field Statistics — Test Coverage

**Source:** `page_crawl/statistics.md` (crawled 2026-03-30)
**Spec:** tests_e2e/specs/statistics.spec.ts (29 tests total: 10 pre-existing + 2 @generated L1+L2 + 6 @generated L3 + 7 @generated L4; 2 pre-existing failures)
**Coverage:** 8/8 (100%)

## Elements

| # | Element | Type | Tested? | Test Location | Priority | Notes |
|---|---------|------|---------|---------------|----------|-------|
| 1 | Heading "Статистика полей" | text | Yes | statistics.spec.ts:L10, L627 | 0 | |
| 2 | Tab: Customer Schema | tab | Yes | statistics.spec.ts:L14,L35, L411 | 0 | Default active + aria-selected + heading update |
| 3 | Tab: Event Schema | tab | Yes | statistics.spec.ts:L17,L140, L411 | 0 | Switch + content check + heading update |
| 4 | Section heading (h4) | text | Yes | statistics.spec.ts:L403 | 0 | L3: changes to "Поля схемы событий" on event tab |
| 5 | Total count | text | Yes | statistics.spec.ts:L205,L234, L320,L345 | 1 | L3: exact values for Gender=3, isAdult=2 |
| 6 | Field selector | select | Yes | statistics.spec.ts:L23,L51, L320,L424 | 0 | Click + option visibility + event tab gating |
| 7 | Empty state message | text | Yes | statistics.spec.ts:L29, L540,L575,L639 | 0 | L4: reappears after tab switch; survives ?page=1 URL |
| 8 | Data visualization (value+count list) | custom list | Yes | statistics.spec.ts:L320,L345,L371 | 0 | L3: male/female/male1 values; field switching replaces data |
| 9 | Pagination | pagination | Yes | statistics.spec.ts:L453,L484 | 1 | L3: URL becomes ?page=1, page 2 shows different rows |
| 10 | Event type selector | select | Yes | statistics.spec.ts:L234, L424,L654 | 0 | L3: gates field selector; L4: 11 event types confirmed |

## Top Untested (by priority)

_All elements covered._

## L3 Data Flow Tests (new — @generated)

| Test | What it verifies |
|------|-----------------|
| Gender field shows 3 distinct values | Distribution data: male=171718, female=170560, male1=1; total=3 |
| isAdult field shows 2 distinct values | Distribution data: 1=132159, 0=1; total=2 |
| Switching field replaces distribution | Gender → isAdult: old values gone, new values appear |
| Section heading updates when switching tabs | h4 changes between "Поля схемы клиента" and "Поля схемы событий" |
| Event field selector gates on event type | 0 options before event type; 30 options after selecting "purchase" |
| Pagination appears for large datasets | Customer Primary ID (purchase): 55,209 values → ?page=1 URL, pagination buttons visible |
| Pagination page 2 differs from page 1 | Page 2 URL = ?page=2; first row value differs from page 1 |

## L4 Edge Case Tests (new — @generated)

| Test | What it verifies |
|------|-----------------|
| No console errors on load + field select | Zero JS errors during normal usage |
| Tab switch resets field + shows empty state | Selector clears, total→0, empty state reappears |
| Returning to customer tab also resets | State not preserved when switching back |
| Duplicate "Customers yearly income" (BUG-031) | Documents 2 identical entries in dropdown |
| Rapid tab switching (6 switches) | No crash, heading/tab/empty-state all correct |
| Direct ?page=1 URL without field | Empty state shown gracefully, not an error |
| 11 event types in event type selector | Exact count; contains purchase/login/add_to_cart |

## Bugs Found During Analysis

| # | Severity | Issue |
|---|----------|-------|
| BUG-031 | Low | Duplicate "Customers yearly income" entry in customer field selector dropdown |
