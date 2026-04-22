# Communications (`/marketing/communication`)

**Last crawled:** 2026-03-30
**Stale after:** 7 days

## Structure

List page for communication channels (Коммуникации). Heading + Add button + table with ID/Name/Type/Verified/action columns. No pagination. Standard sidebar nav (see dashboard.md).

## Elements

| # | Element | Type | Label / Text | State | Notes |
|---|---------|------|-------------|-------|-------|
| 1 | Heading | text | Коммуникации | — | |
| 2 | Add button | button | Добавить | enabled | Opens creation dialog |
| 3 | Table | table | 5 cols: ID, Название, Тип, Проверен, action | — | No pagination |
| 4 | Column: ID (UUID) | columnheader | ID | — | |
| 5 | Column: Название (Name) | columnheader | Название | — | |
| 6 | Column: Тип (Type) | columnheader | Тип | — | Values: blackhole, webhook |
| 7 | Column: Проверен (Verified) | columnheader | Проверен | — | Badge: green "ДА" / red "НЕТ" |
| 8 | Action column (three-dot menu) | icon-action | ⋮ | — | Per row |
| 9 | Verified badge "ДА" | badge | ДА | — | Green background |
| 10 | Verified badge "НЕТ" | badge | НЕТ | — | Red background |
| 11 | Data rows | table-rows | ~6+ visible | — | |
| 12 | Creation dialog title | text | Создать коммуникацию | — | Modal heading |
| 13 | Name input | input | Название | — | Placeholder "Введите название" |
| 14 | Kind dropdown | select | Kind | — | Channel type selector |
| 15 | Mappings section | text | Сопоставления | — | Separator + add button |
| 16 | Add mapping button | icon-action | + | — | Adds field mapping |
| 17 | Create button | button | Создать коммуникацию | enabled | |
| 18 | Reset button | button | Сбросить | enabled | |
| 19 | Close dialog (X) | button | — | — | |

## Sub-States Explored

| Trigger | Result | Elements Added |
|---------|--------|---------------|
| Click "Добавить" | Creation dialog with Name, Kind, Mappings, Create/Reset | #12-19 |

## Page Health

**Console errors:** None
**Console warnings:** None

## Routes Discovered

None new.
