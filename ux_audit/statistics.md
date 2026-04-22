# Field Statistics — UX Findings

**Source:** `page_crawl/statistics.md` (crawled 2026-03-30)
**Screenshot:** `page_crawl/statistics.png`
**Audited:** 2026-03-30

## Findings

| # | P | Category | Proposition |
|---|---|----------|-------------|
| 1 | **P3** | Empty & Error States | Improve the empty state to be more inviting. "Выберите поле для просмотра значений" is functional but plain — add an illustration or example of what data will appear to set expectations (Nielsen #10: Help and documentation). |
| 2 | **P3** | Data Display | Show field count in the dropdown label. Currently "Выберите поле" gives no indication of how many fields are available — "Выберите поле (19)" would help orientation (Nielsen #1: Visibility of system status). |

## Global References

None specific to this page.

## Business Logic Findings

| # | Severity | Bug Ref | Finding |
|---|----------|---------|---------|
| BL-1 | Medium | BUG-001 | Switching to the "Поля схемы событий" (Event Schema) tab and selecting a field triggers an autocomplete/value-distribution call against the events table. BUG-001 confirms that `GET /api/tenant/data/autocomplete/field-values?table=events` returns 500. If field statistics for event fields use the same endpoint, the event schema tab will display no data or an error for every field selected. The customer schema tab (table=customers) is unaffected. |
| BL-2 | Low | — | The "Всего: 0" counter is visible before any field is selected. Showing zero before data is loaded implies there are genuinely zero records, which is misleading — the counter should either be hidden or show "—" until a field is selected and the API responds. |
| BL-3 | Low | — | The field selector lists schema fields including dynamically named columns (e.g., `col__varchar_s50000__11`). Per CLAUDE.md, these internal column names are used in API calls but should not be exposed to users. If the dropdown shows raw column identifiers rather than display names, users will be unable to identify what field they are viewing. This is a data mapping concern: the UI should show the human-readable field label, not the storage column name. |
