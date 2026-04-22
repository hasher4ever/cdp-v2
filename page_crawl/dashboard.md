# Dashboard (`/dashboard`)

**Last crawled:** 2026-03-30
**Stale after:** 7 days

## Structure

Admin dashboard with sidebar navigation (12 items across 3 sections: Данные, Маркетинг, Аналитика) and a 5-tab content area. Default tab shows tenant infrastructure status. Other tabs manage customer/event schema fields and templates.

## Elements

| # | Element | Type | Label / Text | State | Notes |
|---|---------|------|-------------|-------|-------|
| 1 | Dashboard link | link | Панель управления | — | Sidebar top |
| 2 | Clients link | link | Клиенты 342279 | — | Shows live count badge |
| 3 | Events dropdown | button | События 66245 | — | Opens event type dialog |
| 4 | Scenarios link | link | Сценарий | — | |
| 5 | Files link | link | Файлы | — | |
| 6 | Aggregates link | link | Агрегаты | — | |
| 7 | Segments link | link | Сегменты | — | |
| 8 | Campaigns link | link | Рассылки | — | |
| 9 | Communications link | link | Коммуникации | — | |
| 10 | Field Stats link | link | Статистика полей | — | |
| 11 | Tenant ID | text | cdp_1762934640267 | — | Sidebar bottom |
| 12 | Tab: Tenant Artifacts | tab | Артефакты арендатора | selected | Default tab |
| 13 | Tab: Customer Schema | tab | Поля схемы клиента | — | |
| 14 | Tab: Event Schema | tab | Поля схемы событий | — | |
| 15 | Tab: Field Mappings | tab | Конкретные сопоставления полей | — | |
| 16 | Tab: Create Template | tab | Создать шаблон | — | |
| 17 | DB name + copy | text+icon-action | База данных: cdp_1762934640267 | — | Green check icon |
| 18 | isReady status | text | isReady: true | — | No copy button |
| 19 | Customer loading job + copy | text+icon-action | Загрузка клиентов | — | Green check |
| 20 | Event loading job + copy | text+icon-action | Загрузка событий | — | Green check |
| 21 | Customer table + copy | text+icon-action | Таблица клиентов: customers | — | Green check |
| 22 | Event table + copy | text+icon-action | Таблица событий: events | — | Green check |
| 23 | Tenant ID value | text | ID арендатора: 1762934640267 | — | No copy button |
| 24 | Customer topic + copy | text+icon-action | Топик клиентов | — | Green check |
| 25 | Event topic + copy | text+icon-action | Топик событий | — | Green check |
| 26 | Apply drafts button | button | Применить черновики | disabled | Schema tab only |
| 27 | Cancel drafts button | button | Отменить черновики | disabled | Schema tab only |
| 28 | Add field button | button | Добавить | enabled | Schema tab only |
| 29 | Schema table | table | 5 cols: Название, API имя, Тип данных, Множественное значение, Доступ | — | 19 rows (2 system, 17 custom) |
| 30 | Edit field button (per row) | icon-action | — | disabled for system fields | Pencil icon |

## Sub-States Explored

| Trigger | Result | Elements Added |
|---------|--------|---------------|
| Click Tab 2 "Поля схемы клиента" | Schema field table with 19 rows, draft management buttons, Add button | #26-30 |

## Page Health

**Console errors:** None
**Console warnings:** None
**API calls on load:**

| Endpoint | Method | Status |
|----------|--------|--------|
| /public/api/signin | POST | 200 |
| /api/tenant/data/count | GET | 200 |
| /api/tenant/data/event-types/count | GET | 200 |
| /api/tenants/info | GET | 200 |
| /api/tenants/schema/draft-schema/status | GET | 200 |

## Routes Discovered

None — all sidebar routes already in index.
