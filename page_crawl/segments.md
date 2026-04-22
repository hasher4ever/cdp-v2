# Segments (`/marketing/segments`)

**Last crawled:** 2026-03-30
**Stale after:** 7 days

## Structure

List page for segmentation rules. Heading + Add button + table (ID, Name, action column with icon button). Pagination at bottom (149 total, 10 per page). Creation dialog has name input, multi-segment tabs, predicate builder, Preview/Save/Reset. Standard sidebar nav (see dashboard.md).

## Elements

| # | Element | Type | Label / Text | State | Notes |
|---|---------|------|-------------|-------|-------|
| 1 | Heading | text | Сегментация | — | |
| 2 | Add button | button | Добавить | enabled | |
| 3 | Table | table | 3 cols: ID, Название, action | — | |
| 4 | Action button per row | icon-action | — | — | Unknown purpose (likely delete) |
| 5 | Row with empty name | text | — | — | BUG-003 confirmed |
| 6 | XSS payload in name | text | `<script>alert...` | — | Rendered as text |
| 7 | Total count | text | Всего: 149 | — | |
| 8 | Pagination | button | 1-5...15 | — | |
| 9 | Page size input | input | 10 | — | |
| 10 | Dialog: Название сегментации | input | — | — | Placeholder "Введите значение" |
| 11 | Dialog: Tab "≡ Segment" | tab | selected | — | Default segment tab |
| 12 | Dialog: "+" add tab | button | + | — | Multi-segment support |
| 13 | Dialog: Predicate builder | — | NOT/AND/OR, conditions, groups | — | Same as clients filter |
| 14 | Dialog: Предпросмотр (Preview) | button | — | enabled | Preview segment count |
| 15 | Dialog: Добавить сегментацию (Save) | button | — | enabled | |
| 16 | Dialog: Сбросить (Reset) | button | — | enabled | |

## Page Health

**Console errors:** None

## Routes Discovered

- `/marketing/segments/{uuid}` — segment detail (click row)
