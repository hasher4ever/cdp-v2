# Segments — Test Coverage

**Source:** `page_crawl/segments.md` (crawled 2026-03-30)
**Spec:** tests_e2e/specs/segments.spec.ts (24 tests)
**Coverage:** 16/16 (100%)

## Elements

| # | Element | Type | Tested? | Test Location | Priority | Notes |
|---|---------|------|---------|---------------|----------|-------|
| 1 | Heading "Сегментация" | text | Yes | segments.spec.ts:L12 | 0 | |
| 2 | Add button | button | Yes | segments.spec.ts:L16 | 0 | |
| 3 | Table | table | Yes | L1 Smoke: L508 | 1 | ID + Название columns asserted |
| 4 | Action button per row | icon-action | Yes | L4: action button in last column | 4 | Confirmed visible in each row |
| 5 | Empty name row | text | Yes | L4: BUG-003 empty Название | 2 | BUG-003 confirmed: 1 empty row |
| 6 | XSS payload in name | text | Yes | L4: XSS renders as text | 1 | Verified no script execution |
| 7 | Total count "149" | text | Yes | L1 Smoke: L525 | 0 | "Всего: N" pattern |
| 8 | Pagination | button | Yes | L1 Smoke: L531 | 2 | Buttons "1", "2" asserted |
| 9 | Page size | input | Yes | L1 Smoke: L538 | 2 | Textbox, value > 0 |
| 10 | Dialog: Name input | input | Yes | segments.spec.ts:L46 | 0 | |
| 11 | Dialog: Segment tab | tab | Yes | L2 Interaction: L571 | 3 | "≡ Segment" tab selected |
| 12 | Dialog: "+" add tab | button | Yes | L2 Interaction: L581 | 4 | button "+" visible |
| 13 | Dialog: Predicate builder | — | Yes | L2 Interaction: L591–L633 | 5 | NOT label, И/ИЛИ, Добавить условие/группу, condition row Поле/Оператор |
| 14 | Dialog: Preview | button | Yes | L2 Interaction: L637 | 3 | Предпросмотр button asserted |
| 15 | Dialog: Save | button | Yes | L2 Interaction: L637 | 0 | Добавить сегментацию button |
| 16 | Dialog: Reset | button | Yes | L2 Interaction: L637 | 2 | Сбросить button asserted |

## Top Untested (by priority)

1. **Action button per row** (#4) — P4 — Purpose unknown (likely delete); no click test
2. **Empty name row** (#5) — P2 — BUG-003: empty segment names accepted by API
3. **XSS payload in name** (#6) — P1 — Rendered as text; no assertion that script does not execute

## Generated Tests

| Block | Tests | Result |
|-------|-------|--------|
| Segments List — L1 Smoke | 5 | 5/5 pass |
| Segments List — L2 Interaction | 10 | 10/10 pass |
| Segments List — L3 Data Flow | 6 | 6/6 pass |
| Segments List — L4 Edge Cases | 7 | 6/7 pass (BUG-003 expected fail) |
