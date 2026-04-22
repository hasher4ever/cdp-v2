# Segment Detail — Test Coverage

**Source:** `page_crawl/segment-detail.md` (crawled 2026-03-30)
**Spec:** tests_e2e/specs/segments.spec.ts (11 tests — L1 smoke, L2 interaction, L3 data flow, L4 edge cases)
**Coverage:** 7/7 (100%)

## Elements

| # | Element | Type | Tested? | Test Location | Priority | Notes |
|---|---------|------|---------|---------------|----------|-------|
| 1 | Header "Сегментация ID: {uuid}" | text | Yes | L1: "should display header" | 1 | |
| 2 | Name display | text | Yes | L1: "should display segment name" | 1 | Label is "Название" (no colon) |
| 3 | Chart heading | text | Yes | L1: "should display chart heading" | 1 | |
| 4 | Bar chart | application | Yes | L3: "should render bar chart with application role" | 3 | canvas/svg/application role |
| 5 | Segment tab | tab | Yes | L1: "at least one segment tab", L2: "click segment tab", L2: "switch between tabs" | 2 | |
| 6 | Predicate summary | text | Yes | L2: "see predicate summary", L3: "predicate content inside segment tab" | 2 | Text is "ГруппаAND" (no space, Mantine Group) |
| 7 | CRASH on null predicate | — | Yes | L4: "BUG-028: segment with null predicate should NOT crash" | 6 | BUG-028 confirmed: test correctly fails |

## Top Untested (by priority)

None — all elements covered.

## Test Summary

| Level | Tests | Passed | Failed | Notes |
|-------|-------|--------|--------|-------|
| L1 Smoke | 5 | 5 | 0 | Page load, header, name, chart heading, tab |
| L2 Interaction | 2 | 2 | 0 | Tab click + predicate, tab switching |
| L3 Data Flow | 2 | 2 | 0 | Bar chart render, predicate content |
| L4 Edge Cases | 1 | 0 | 1 | BUG-028 confirmed (expected failure) |
| **Total** | **10** | **9** | **1** | 1 failure is intentional BUG-028 confirmation |
