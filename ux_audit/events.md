# Events — UX Findings

**Source:** `page_crawl/events.md` (crawled 2026-03-30)
**Screenshot:** N/A (quick scan)
**Audited:** 2026-03-30
**Based on quick scan — modal/tab UX not evaluated. Run `/page-crawl events` for full audit.**

## Findings

| # | P | Category | Proposition |
|---|---|----------|-------------|
| 1 | **P2** | Data Display | Show the Event Type as a human name instead of numeric ID. Column shows "100" instead of "purchase" — users must cross-reference mentally (Nielsen #2: Match between system and real world). |
| 2 | **P2** | Data Display | Format Event ID to be copiable or truncated. 18-digit IDs like "235287929730109470" overflow cells and are hard to read — consider monospace font or copy-on-click (Nielsen #7: Flexibility and efficiency). |
| 3 | **P2** | Consistency | Align sort/filter button count across columns. Customer Primary ID has 1 icon button while Event ID, Event Type, Event Created At CDP each have 2 — inconsistent control placement confuses column interaction expectations (Nielsen #4: Consistency and standards). |
| 4 | **P3** | Feedback & Loading | Provide visual cue that rows are expandable. Users must click to discover the timeline expand — add a chevron icon or "expandable" affordance to each row (Nielsen #6: Recognition rather than recall). |

## Global References

See G.1 — unlabeled icon buttons (8 icon buttons across 4 column headers).

## Business Logic Findings

| # | Severity | Finding | Reference |
|---|----------|---------|-----------|
| 1 | High | The event detail API endpoint always returns 500. When a row is expanded to show the customer event timeline, the underlying `GET /api/tenant/data/events/{eventCompositeId}` endpoint crashes with a 500 error. The composite ID format (`{eventTypeId}_{cdpEventId}`) is undocumented, and the endpoint also returns 500 for non-existent IDs instead of 404. Any functionality depending on fetching a single event record is broken. | BUG-010 |
| 2 | Medium | Event field autocomplete in the Filters dialog returns 500. When a user opens Фильтры on the events page and types a value to filter by a string field, `GET /api/tenant/data/autocomplete/field-values?table=events` returns 500. The OpenAPI spec lists `events` as a valid `table` enum value, so this is a backend regression. Users cannot filter events by string field values using autocomplete suggestions. | BUG-001 |
| 3 | Low | Customer Primary ID column is missing the "remove column" button that all other columns have. Every other column header has 2 icon buttons (remove + sort); Customer Primary ID has only 1 (sort only). This makes the primary key column non-removable, which may be intentional — but there is no visual distinction or tooltip to communicate this, leaving users confused about the inconsistency. | page_crawl/events.md #6 |
