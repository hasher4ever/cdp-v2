# Segments — UX Findings

**Source:** `page_crawl/segments.md` (crawled 2026-03-30)
**Audited:** 2026-03-30

## Findings

| # | P | Category | Proposition |
|---|---|----------|-------------|
| 1 | **P2** | Forms & Validation | Validate segment name on the frontend. BUG-003: empty names accepted. Add required-field validation with visual error message (Nielsen #5: Error prevention). |
| 2 | **P2** | Data Display | Clarify the action button purpose. Each row has an unlabeled icon button — users can't tell what it does without clicking (Nielsen #6: Recognition rather than recall). Add a tooltip or use a recognizable icon (trash, edit). |
| 3 | **P3** | Data Display | Truncate UUID column — same global pattern as campaigns, communications, aggregates. |

## Global References

See G.1 — unlabeled icon buttons.

## Business Logic Findings

| # | Severity | Finding | Reference |
|---|----------|---------|-----------|
| BL.1 | Medium | BUG-003: Empty segment names accepted by backend | bugs.md BUG-003 |
| BL.2 | Medium | BUG-020: Empty segments array accepted — segments with no conditions can be created | bugs.md BUG-020 |
