# Communications — Test Coverage

**Source:** `page_crawl/communication.md` (crawled 2026-03-30)
**Spec:** tests_e2e/specs/communications.spec.ts (19 tests)
**Coverage:** 17/19 (89%)

## Elements

| # | Element | Type | Tested? | Test Location | Priority | Notes |
|---|---------|------|---------|---------------|----------|-------|
| 1 | Heading "Коммуникации" | text | Yes | communications.spec.ts:L11,L233 | 0 | Rendered as paragraph, not heading |
| 2 | Add button | button | Yes | communications.spec.ts:L15,L233 | 0 | |
| 3 | Table | table | Yes | communications.spec.ts:L22-32,L202 | 0 | Column headers verified |
| 4 | Column: ID | columnheader | Yes | communications.spec.ts:L209 | 0 | |
| 5 | Column: Название | columnheader | Yes | communications.spec.ts:L212 | 0 | |
| 6 | Column: Тип | columnheader | Yes | communications.spec.ts:L215 | 0 | Types asserted (blackhole/webhook) |
| 7 | Column: Проверен (Verified) | columnheader | Yes | communications.spec.ts:L218 | 0 | |
| 8 | Three-dot menu | icon-action | Yes | communications.spec.ts:L288 | 0 | Opens context menu/popover |
| 9 | Verified "Да" badge | badge | Yes | communications.spec.ts:L343 | 0 | Title case "Да" not all-caps |
| 10 | Verified "Нет" badge | badge | Yes | communications.spec.ts:L343 | 0 | Title case "Нет" not all-caps |
| 11 | Data rows | table-rows | Yes | communications.spec.ts:L222 | 0 | At least 1 data row |
| 12 | Dialog: Name input | input | Yes | communications.spec.ts:L68-71,L267 | 0 | |
| 13 | Dialog: Kind dropdown | select | Yes | communications.spec.ts:L76-88,L274 | 0 | |
| 14 | Dialog: Mappings section | text | Yes | communications.spec.ts:L277 | 0 | "Сопоставления" label verified |
| 15 | Dialog: Add mapping button | icon-action | Yes | communications.spec.ts (@generated L2) | 0 | Appends rows to Сопоставления table |
| 16 | Dialog: Dynamic config fields | input | Yes | communications.spec.ts (@generated L2) | 0 | Verified per-Kind: Webhook/Email SMTP2GO/Blackhole |
| 17 | Create button | button | Yes | communications.spec.ts:L125-133,L280 | 0 | |
| 18 | Reset button | button | Yes | communications.spec.ts:L411 | 0 | Clears form fields |
| 19 | Close dialog | button | Yes | communications.spec.ts:L319 | 0 | Escape key closes dialog |

## Top Untested (by priority)

_None — all elements covered as of 2026-04-14_

## Tests by Level

| Level | Tests | Status |
|-------|-------|--------|
| L1 Smoke | 3 (column headers, data rows, title+button) | 3/3 pass |
| L2 Interaction | 3 (dialog open, three-dot menu, Escape close) | 3/3 pass |
| L3 Data Flow | 2 (verified badges, channel types) | 2/2 pass |
| L4 Edge Cases | 2 (Kind English label UX, Reset clears form) | 2/2 pass |

## Bugs & UX Findings Confirmed by Tests

| # | Severity | Issue |
|---|----------|-------|
| 1 | Medium | BUG-011: PUT update for communication channels returns 400 (from bugs.md) — not tested per rules |
| 2 | Low | "Kind" label is in English while rest of UI is Russian — confirmed by L4 test |
| 3 | Info | Verified badges use "Да"/"Нет" (title case), not "ДА"/"НЕТ" as documented in crawl — corrected in tests |
| 4 | Info | Page title "Коммуникации" is rendered as `<p>` not `<h1>`/`<h2>` — semantic HTML concern |
