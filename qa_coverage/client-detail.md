# Client Detail — Test Coverage

**Source:** `page_crawl/client-detail.md` (crawled 2026-03-30)
**Spec:** tests_e2e/specs/clients.spec.ts
**Coverage:** 12/13 (92%)

## Elements

| # | Element | Type | Tested? | Test Location | Priority | Notes |
|---|---------|------|---------|---------------|----------|-------|
| 1 | Back button | button | Yes | clients.spec.ts L305, L354 | 3 | L1 visibility + L2 click returns to list |
| 2 | Header "Клиент ID: {id}" | text | Yes | clients.spec.ts L276 | 1 | L1 smoke |
| 3 | Section: Профиль клиента | text | Yes | clients.spec.ts L283 | 2 | L1 heading check |
| 4 | Creation date | text | Yes | clients.spec.ts L311 | 1 | L1 "Добавлено в систему" visible |
| 5 | Show more button | button | Yes | clients.spec.ts L326 | 4 | L2 click expand |
| 6 | Section: Агрегаты | text | Yes | clients.spec.ts L291 | 2 | L1 heading + L3 data + L4 resilience |
| 7 | Aggregate name+value pairs | text | Yes | clients.spec.ts L374 | 3 | L3 content check |
| 8 | SQL injection names in aggregates | text | No | — | 1 | Rendered as text — would need specific tenant data |
| 9 | Section: История событий | text | Yes | clients.spec.ts L297 | 2 | L1 heading |
| 10 | Event type counts (11 types) | text | Yes | clients.spec.ts L400, L431 | 3 | L3 event types + counts |
| 11 | 10 console errors (/calculate) | — | Yes | clients.spec.ts L452, L486 | 5 | L4 resilience + L4 bug documenter (BUG-027) |
| 12 | Row click navigation | link | Yes | clients.spec.ts L211 | 0 | Original test |
| 13 | Profile field expansion | — | Yes | clients.spec.ts L326 | 4 | L2 button state changes after expand |

## Test Summary

| Level | Tests | Pass | Fail | Notes |
|-------|-------|------|------|-------|
| L1 Smoke | 6 | 6 | 0 | All sections, heading, back button, date |
| L2 Interaction | 2 | 2 | 0 | Expand profile, back navigation |
| L3 Data Flow | 3 | 3 | 0 | Aggregates content, event types, counts |
| L4 Edge Cases | 3 | 2 | 1 | BUG-027 documenter fails as expected |

## Bugs Found During Analysis

| # | Severity | Issue | Status |
|---|----------|-------|--------|
| 1 | High | 5 console errors from `/calculate` API endpoints on page load (500s) | Confirmed by L4 test — BUG-027 |
| 2 | Medium | BUG-027: UDAF calculate with non-existent customer returns 500 | Already in bugs.md |

## Top Untested (by priority)

1. **SQL injection names in aggregates** (#8) — P1 — Needs specific test data to verify XSS safety
