# Aggregates (`/marketing/aggregate`)

**Last crawled:** 2026-03-30
**Stale after:** 7 days
**Quick scan:** true | Similar to: segments.md

## Structure

List page for UDAFs (aggregates). Heading + Add button + table (ID, Name). No pagination — all loaded at once. No action buttons per row. Creation dialog has Name, time window, Function/Event Type/Fields dropdowns, grouping switch, optional event filter with predicate builder. Standard sidebar nav (see dashboard.md).

## Elements

| # | Element | Type | Label / Text | State | Notes |
|---|---------|------|-------------|-------|-------|
| 1 | Heading | text | Агрегаты | — | |
| 2 | Add button | button | Добавить | enabled | |
| 3 | Table | table | 2 cols: ID, Название | — | No pagination, no action column |
| 4 | Data rows | table-rows | 100+ | — | Massive list, no pagination |
| 5 | Rows with empty names | text | — | — | BUG-022 confirmed |
| 6 | Dialog: Name input | input | Название агрегата | — | |
| 7 | Dialog: Time window button | button | За всё время | — | Time range selector |
| 8 | Dialog: Function dropdown | select | Функция | — | SUM/COUNT/AVG/MIN/MAX |
| 9 | Dialog: Event Type dropdown | select | Тип события | — | |
| 10 | Dialog: Fields dropdown | select | Поля | disabled | Until event type selected |
| 11 | Dialog: Grouping switch | toggle | Группировать события перед применением фильтра | — | Unique to aggregates |
| 12 | Dialog: Info icon | icon-action | — | — | Next to grouping switch |
| 13 | Dialog: Event filter (predicate builder) | — | Фильтр событий (необязательно) | — | Optional section, same as segments |
| 14 | Dialog: Create button | button | Создать агрегат | — | |
| 15 | Dialog: Reset button | button | Сбросить | — | |

## Page Health

**Console errors:** None
