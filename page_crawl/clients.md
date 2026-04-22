# Clients (`/data/clients`)

**Last crawled:** 2026-03-30
**Stale after:** 7 days

## Structure

Data table page showing all customers. Header with "Клиенты" heading, 3 control buttons (Reset Filters, Filters, Add Columns), data table with sort/remove icons per column, pagination at bottom. Standard sidebar nav (see dashboard.md).

## Elements

| # | Element | Type | Label / Text | State | Notes |
|---|---------|------|-------------|-------|-------|
| 1 | Heading | text | Клиенты | — | |
| 2 | Reset Filters button | button | Сбросить фильтры | enabled | |
| 3 | Filters button | button | Фильтры | enabled | Opens filter dialog |
| 4 | Add Columns button | button | Добавить столбцы | enabled | Opens column selector dialog |
| 5 | Data table | table | 6 columns | — | phone, email, isAdult, avg delivery cost, sum purchase 1, sum purchase 2 |
| 6 | Column: Customer phone number | columnheader | — | — | Has sort icon only (1 button) |
| 7 | Column: email | columnheader | — | — | Has remove + sort icons (2 buttons) |
| 8 | Column: isAdult | columnheader | — | — | Has remove + sort icons |
| 9 | Column: avg delivery cost for purchase | columnheader | — | — | Has remove + sort icons |
| 10 | Column: sum purchase 1 | columnheader | — | — | Has remove + sort icons |
| 11 | Column: sum purchase 2 | columnheader | — | — | Has remove + sort icons |
| 12 | Data rows | table-rows | 10 per page | — | Cells clickable → client detail |
| 13 | Null values | text | "-" | — | Displayed for missing data |
| 14 | Total count | text | Всего: 342279 | — | |
| 15 | Page buttons | button | 1, 2, 3... 34228 | — | Numbered pagination |
| 16 | Previous page | button | — | disabled | On first page |
| 17 | Next page | button | → | enabled | |
| 18 | Page size input | input | 10 | — | Editable textbox |
| 19 | Filter dialog | modal-trigger | Фильтры | — | Predicate builder: NOT switch, AND/OR radio, Add condition, Add group |
| 20 | Column selector dialog | modal-trigger | Добавить столбцы | — | "6 столбцов, макс 10", Поля + Агрегаты groups, Reset/Save |

## Sub-States Explored

| Trigger | Result | Elements Added |
|---------|--------|---------------|
| (From prior crawl session) Filter dialog | Predicate builder with Field/Operator dropdowns, 19 fields + 100+ aggregates | #19 |
| (From prior crawl session) Column selector | 2 groups: Поля (15 fields), Агрегаты (100+), clickable items not checkboxes | #20 |

## Page Health

**Console errors:** None
**Console warnings:** None
**API calls on load:**

| Endpoint | Method | Status |
|----------|--------|--------|
| /api/tenant/data/count | GET | 200 |
| /api/tenant/data/event-types/count | GET | 200 |
| /api/tenants/info | GET | 200 |
| /api/tenant/ui/settings/by-key?key=data/clients-columns | GET | 200 |
| /api/tenants/schema/customers/fields | GET | 200 |
| /api/tenants/udafs/types | GET | 200 |
| /api/v2/tenant/data/customers | POST | 200 |

## Routes Discovered

- `/data/clients/{id}` — clicking any data row navigates to client detail
