# Scenarios (`/data/scenario`)

**Last crawled:** 2026-03-30
**Stale after:** 7 days

## Structure

List page for automation scenarios. Heading + Add button + table (Name, Created, Status). Clicking "Добавить" opens a name-only creation modal. Clicking a row navigates to the visual builder. Standard sidebar nav (see dashboard.md).

## Elements

| # | Element | Type | Label / Text | State | Notes |
|---|---------|------|-------------|-------|-------|
| 1 | Heading | text | Сценарии | — | |
| 2 | Add button | button | Добавить | enabled | Opens creation modal |
| 3 | Table | table | 3 cols: Название, Создано, Статус | — | No pagination |
| 4 | Column: Название (Name) | columnheader | Название | — | |
| 5 | Column: Создано (Created) | columnheader | Создано | — | Raw ISO 8601 dates |
| 6 | Column: Статус (Status) | columnheader | Статус | — | Badge: "Новый" (New) |
| 7 | Status badge "Новый" | badge | Новый | — | |
| 8 | Row click → builder | link | — | — | Navigates to /data/scenario/{uuid} |
| 9 | Creation dialog title | text | Создать сценарий | — | |
| 10 | Name input | input | Название | — | Placeholder "Введите название" |
| 11 | Submit button | button | Добавить | — | Inside modal |
| 12 | Close dialog (X) | button | — | — | |
| 13 | XSS payload in name | text | `<script>alert("xss")</script>` | — | BUG-015: stored as-is, rendered as text |

## Page Health

**Console errors:** None

## Routes Discovered

- `/data/scenario/{uuid}` — scenario builder (React Flow)
