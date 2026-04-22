# Segment Detail (`/marketing/segments/{uuid}`)

**Last crawled:** 2026-03-30
**Stale after:** 7 days

## Structure

Read-only segment detail page. Header "Сегментация ID: {uuid}", name display, bar chart showing customer counts per segment, tab per segment with predicate summary. No edit/delete controls visible.

## Elements

| # | Element | Type | Label / Text | State | Notes |
|---|---------|------|-------------|-------|-------|
| 1 | Header | text | Сегментация ID: {uuid} | — | |
| 2 | Name display | text | Название: {name} | — | Read-only |
| 3 | Chart heading | text | Сегменты: количество клиентов | — | |
| 4 | Bar chart | application | Axis 0-360000 | — | Customer count visualization |
| 5 | Segment tab | tab | Segment A Updated | selected | Per-segment tab |
| 6 | Predicate summary | text | Группа AND | — | Read-only predicate view |
| 7 | **CRASH on null predicate** | — | — | — | BUG-028: TypeError when segment has no predicate |

## Page Health

**Console errors:** 4 errors when loading segment with null predicate (BUG-028)
