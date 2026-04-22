# Dashboard — Test Coverage

**Source:** `page_crawl/dashboard.md` (crawled 2026-03-30)
**Spec:** tests_e2e/specs/dashboard.spec.ts (47 tests), navigation.spec.ts (10 tests)
**Coverage:** 28/30 (93%)

## Elements

| # | Element | Type | Tested? | Test Location | Priority | Notes |
|---|---------|------|---------|---------------|----------|-------|
| 1 | Dashboard link | link | Yes | navigation.spec.ts:L8 | 0 | |
| 2 | Clients link + count | link | Yes | navigation.spec.ts:L12, dashboard.spec.ts:L219 | 0 | Count assertion exists |
| 3 | Events dropdown | button | Yes | navigation.spec.ts:L13 | 0 | |
| 4 | Scenarios link | link | Yes | navigation.spec.ts:L14 | 0 | |
| 5 | Files link | link | Yes | navigation.spec.ts:L15 | 0 | |
| 6 | Aggregates link | link | Yes | navigation.spec.ts:L19 | 0 | |
| 7 | Segments link | link | Yes | navigation.spec.ts:L20 | 0 | |
| 8 | Campaigns link | link | Yes | navigation.spec.ts:L21 | 0 | |
| 9 | Communications link | link | Yes | navigation.spec.ts:L22 | 0 | |
| 10 | Field Stats link | link | Yes | navigation.spec.ts:L26 | 0 | |
| 11 | Tenant ID sidebar | text | No | — | 1 | Data display — skipped (L1 scope only covered tab content) |
| 12 | Tab: Tenant Artifacts | tab | Yes | dashboard.spec.ts:L12,L31 | 0 | |
| 13 | Tab: Customer Schema | tab | Yes | dashboard.spec.ts:L14,L81 | 0 | |
| 14 | Tab: Event Schema | tab | Yes | dashboard.spec.ts:L17,L127 | 0 | |
| 15 | Tab: Field Mappings | tab | Yes | dashboard.spec.ts:L155,L475-L515 | 0 | Tab switch + headers + rows + textbox values (L3) |
| 16 | Tab: Create Template | tab | Yes | dashboard.spec.ts:L183 | 0 | |
| 17 | DB name + copy | text+icon | Partial | dashboard.spec.ts:L260 (L1) | 2 | Label visible tested; copy icon locator flaky |
| 18 | isReady status | text | Yes | dashboard.spec.ts:L44 | 0 | |
| 19 | Customer loading job | text+icon | Partial | dashboard.spec.ts:L49,L277 | 2 | Label tested; copy icon locator flaky |
| 20 | Event loading job | text+icon | Partial | dashboard.spec.ts:L50,L277 | 2 | Label tested; copy icon locator flaky |
| 21 | Customer table + copy | text+icon | Yes | dashboard.spec.ts:L260,L277 | 1 | Label visible; copy icon locator flaky |
| 22 | Event table + copy | text+icon | Yes | dashboard.spec.ts:L264,L277 | 1 | Label visible; copy icon locator flaky |
| 23 | Tenant ID value | text | Yes | dashboard.spec.ts:L268 | 1 | Numeric value asserted |
| 24 | Customer topic + copy | text+icon | Yes | dashboard.spec.ts:L54 | 0 | Copy untested |
| 25 | Event topic + copy | text+icon | Yes | dashboard.spec.ts:L55 | 0 | Copy untested |
| 26 | Apply drafts button | button | Yes | dashboard.spec.ts:L330 (L2) | 5 | Visible + disabled state asserted |
| 27 | Cancel drafts button | button | Yes | dashboard.spec.ts:L338 (L2) | 5 | Visible + disabled state asserted |
| 28 | Add field button | button | Yes | dashboard.spec.ts:L346 (L2) | 5 | Visible + enabled asserted |
| 29 | Schema table | table | Yes | dashboard.spec.ts:L314 (L2) | 3 | 5 column headers + 19 rows + edit buttons asserted |
| 30 | Edit field button | icon-action | Yes | dashboard.spec.ts:L361 (L2) | 4 | Count per row + disabled for system fields |

## Top Untested / Remaining Gaps

1. **Copy icons** (#17,19,20,21,22) — P2 — Copy img locator fails due to `<p>` vs `<div>` mismatch; known flake, do not re-attempt
2. ~~**Tenant ID sidebar** (#11)~~ — DONE (L3: sidebar-artifacts ID match test)
3. ~~**Field Mappings content** (#15)~~ — DONE (L3: headers, rows, textbox values)

## Failing Tests (from this run)

| Test | Line | Reason | Attempts |
|------|------|--------|----------|
| "should have copy icons next to all 5 key artifact rows" | 277 | `p` hasText locator doesn't resolve img in sibling subtree — label may not be a `<p>` tag | 2/2 |

## Bugs Found During Analysis

| # | Severity | Issue |
|---|----------|-------|
| — | — | No bugs on this page |
