# Segment Detail — UX Findings

**Source:** `page_crawl/segment-detail.md` (crawled 2026-03-30)
**Audited:** 2026-03-30

## Findings

| # | P | Category | Proposition |
|---|---|----------|-------------|
| 1 | **P1** | Empty & Error States | Add error boundary for null predicate segments. BUG-028: the page crashes with "Unexpected Application Error" when a segment has no predicate. Add a graceful fallback: "This segment has no conditions defined" with a link back to the list (Nielsen #9: Help users recover from errors). |
| 2 | **P2** | Navigation | Add edit/delete controls. The detail page is read-only — users must return to the list to edit. Add an "Edit" button that opens the predicate builder, and a "Delete" button with confirmation (Nielsen #3: User control and freedom). |
| 3 | **P2** | Navigation | Add breadcrumb or back button. No explicit way to return to the segments list — users must use sidebar (Nielsen #3: User control and freedom). |

## Global References

None specific.

## Business Logic Findings

| # | Severity | Finding | Reference |
|---|----------|---------|-----------|
| BL.1 | **High** | BUG-028: Page crashes with TypeError when segment has null predicate | bugs.md BUG-028 |
| BL.2 | Medium | BUG-020: Segments can be created with empty conditions — these then crash the detail view | bugs.md BUG-020 → BUG-028 chain |
