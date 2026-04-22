# Campaigns (`/marketing/campaigns`)

**Last crawled:** 2026-03-30
**Stale after:** 7 days

## Structure

List page for email campaigns (Рассылки). Heading + Add button + table with ID/Name/action columns. No pagination — all campaigns loaded at once (similar to aggregates). Standard sidebar nav (see dashboard.md).

## Elements

| # | Element | Type | Label / Text | State | Notes |
|---|---------|------|-------------|-------|-------|
| 1 | Heading | text | Рассылки | — | |
| 2 | Add button | button | Добавить | enabled | Opens creation dialog |
| 3 | Table | table | 3 cols: ID, Название, action | — | No pagination |
| 4 | Column: ID (UUID) | columnheader | ID | — | |
| 5 | Column: Название (Name) | columnheader | Название | — | |
| 6 | Action column (three-dot menu) | columnheader | — | — | Unnamed column |
| 7 | Data rows | table-rows | ~60+ | — | Row cells clickable |
| 8 | Three-dot menu per row | icon-action | ⋮ | — | Opens context menu |
| 9 | Context menu: Редактировать (Edit) | button | Редактировать | — | Only option in menu, no Delete |
| 10 | Creation dialog title | text | Создать рассылку | — | Modal heading |
| 11 | Name input | input | Название кампании * | — | Required, placeholder "Введите название рассылки" |
| 12 | Channel dropdown | select | Канал коммуникации * | — | Required, placeholder "Выберите канал" |
| 13 | Template dropdown | select | Шаблон * | — | Required, placeholder "Выберите шаблон" |
| 14 | Include: Segmentation dropdown | select | Сегментация * | — | Required |
| 15 | Include: Segments dropdown | select | Включить сегменты | disabled | "Сначала выберите канал коммуникации" |
| 16 | Exclude: Segmentation dropdown | select | Сегментация | — | Optional exclusion |
| 17 | Exclude: Segments dropdown | select | Исключить сегменты | disabled | "Сначала выберите канал коммуникации" |
| 18 | Preview button | button | Предпросмотр | disabled | Disabled until form complete |
| 19 | Create button | button | Создать рассылку | enabled | |
| 20 | Reset button | button | Сбросить | enabled | |
| 21 | Close dialog (X) | button | — | — | |

## Sub-States Explored

| Trigger | Result | Elements Added |
|---------|--------|---------------|
| Click "Добавить" | Creation dialog with 7 form fields, Preview/Create/Reset | #10-21 |
| Click three-dot menu | Context menu with "Редактировать" only | #9 |

## Page Health

**Console errors:** None
**Console warnings:** None
**API calls on load:**

| Endpoint | Method | Status |
|----------|--------|--------|
| /api/tenants/campaign?page=0&size=100 | GET | 200 |

## Routes Discovered

None new.
