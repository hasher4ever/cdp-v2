# Events (`/data/events/{id}`)

**Last crawled:** 2026-03-30
**Stale after:** 7 days
**Quick scan:** true | Similar to: clients.md

## Structure

Data table page for events, accessed via sidebar Events dropdown (11 event types). Same layout as Clients: heading + filter/column buttons + data table + pagination. Standard sidebar nav (see dashboard.md).

## Elements

| # | Element | Type | Label / Text | State | Notes |
|---|---------|------|-------------|-------|-------|
| 1 | Heading | text | События purchase | — | Dynamic: includes event type name |
| 2 | Reset Filters button | button | Сбросить фильтры | enabled | Same as clients |
| 3 | Filters button | button | Фильтры | enabled | Opens filter dialog |
| 4 | Add Columns button | button | Добавить столбцы | enabled | Opens column selector |
| 5 | Data table | table | 4 columns | — | Customer Primary ID, Event ID, Event Type, Event Created At CDP |
| 6 | Column: Customer Primary ID | columnheader | — | — | Only 1 sort button (others have 2) — inconsistency |
| 7 | Column: Event ID | columnheader | — | — | 2 icon buttons |
| 8 | Column: Event Type | columnheader | — | — | 2 icon buttons |
| 9 | Column: Event Created At CDP | columnheader | — | — | 2 icon buttons |
| 10 | Data rows | table-rows | 10 per page | — | Alternating empty rows (expandable detail) |
| 11 | Row expand → customer timeline | modal-trigger | — | — | Click row shows timestamps + "Показать ещё 10" |
| 12 | "Показать ещё 10" lazy load | button | Показать ещё 10 | — | Inside expanded row |
| 13 | Total count | text | Всего: 61516 | — | |
| 14 | Pagination | button | 1-5...6152 | — | Same as clients |
| 15 | Page size input | input | 10 | — | |
| 16 | Events sidebar dropdown | modal-trigger | События 66245 | — | Dialog with 11 event types + counts |

## Sub-States Explored

| Trigger | Result | Elements Added |
|---------|--------|---------------|
| (From prior session) Row click | Expands to show customer event timestamps with lazy load | #11, #12 |

## Page Health

**Console errors:** None (from prior crawl session)
**Console warnings:** None

## Routes Discovered

- 11 event type routes: `/data/events/100?title=purchase` through `/data/events/108?title=test_event`
