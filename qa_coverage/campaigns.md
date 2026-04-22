# Campaigns — Test Coverage

**Source:** `page_crawl/campaigns.md` (crawled 2026-03-30)
**Spec:** tests_e2e/specs/campaigns.spec.ts (27 tests)
**Coverage:** 21/21 (100%)

## Elements

| # | Element | Type | Tested? | Test Location | Priority | Notes |
|---|---------|------|---------|---------------|----------|-------|
| 1 | Heading "Рассылки" | text | Yes | campaigns.spec.ts:L11, L183 | 0 | |
| 2 | Add button | button | Yes | campaigns.spec.ts:L15, L187 | 0 | |
| 3 | Table | table | Yes | campaigns.spec.ts:L22-32, L209 | 0 | |
| 4 | Column: ID | columnheader | Yes | campaigns.spec.ts:L193 | 0 | L1 smoke |
| 5 | Column: Название | columnheader | Yes | campaigns.spec.ts:L201 | 0 | L1 smoke |
| 6 | Action column | columnheader | Yes | campaigns.spec.ts:L220 | 0 | Column headers count check |
| 7 | Data rows | table-rows | Yes | campaigns.spec.ts:L209, L384 | 0 | Row count asserted |
| 8 | Three-dot menu | icon-action | Yes | campaigns.spec.ts:L311 | 0 | L2 interaction |
| 9 | Edit action | button | Yes | campaigns.spec.ts:L311, L398 | 0 | Opens edit form, L3 data flow |
| 10 | Dialog: Name input | input | Yes | campaigns.spec.ts:L46-50, L238 | 0 | |
| 11 | Dialog: Channel dropdown | select | Yes | campaigns.spec.ts:L53-78, L238 | 0 | |
| 12 | Dialog: Template dropdown | select | Yes | campaigns.spec.ts:L94-103, L238 | 0 | |
| 13 | Dialog: Include segmentation | select | Yes | campaigns.spec.ts:L81-92, L238 | 0 | |
| 14 | Dialog: Include segments | select | Yes | campaigns.spec.ts:L338, L487 | 0 | Disabled placeholder verified |
| 15 | Dialog: Exclude segmentation | select | Yes | campaigns.spec.ts:L238 | 0 | Visible in dialog |
| 16 | Dialog: Exclude segments | select | Yes | campaigns.spec.ts:L238, L338 | 0 | Disabled placeholder verified |
| 17 | Preview button (disabled) | button | Yes | campaigns.spec.ts:L440 | 0 | Disabled state verified (L4) |
| 18 | Create button | button | Yes | campaigns.spec.ts:L105-113, L282 | 0 | |
| 19 | Reset button | button | Yes | campaigns.spec.ts:L282, L451 | 0 | Clears form (L4) |
| 20 | Close dialog | button | Yes | campaigns.spec.ts:L299 | 0 | Escape key closes (L2) |
| 21 | No pagination | — | Yes | campaigns.spec.ts:L368 | 0 | No page controls verified (L3) |

## Top Untested (by priority)

None — all elements covered.

## Tests by Level

| Level | Count | Description |
|-------|-------|-------------|
| L1 — Smoke | 6 | Heading, Add button, column headers, data rows, column count |
| L2 — Interaction | 5 | Dialog fields, dialog buttons, Escape close, three-dot menu, disabled placeholder |
| L3 — Data Flow | 3 | No pagination, row count, edit form via menu |
| L4 — Edge Cases | 4 | Preview disabled, Reset clears form, required asterisks, disabled segments |

## Bugs Found During Analysis

| # | Severity | Issue |
|---|----------|-------|
| — | — | No pagination — all campaigns loaded at once (performance concern) |
