# Field Statistics (`/statistics/field`)

**Last crawled:** 2026-03-30
**Stale after:** 7 days

## Structure

Analytics page for viewing field value distributions. Heading + 2 tabs (Customer Schema / Event Schema) + field selector dropdown + data visualization area. Empty state shows "Выберите поле для просмотра значений". Standard sidebar nav (see dashboard.md).

## Elements

| # | Element | Type | Label / Text | State | Notes |
|---|---------|------|-------------|-------|-------|
| 1 | Heading | text | Статистика полей | — | |
| 2 | Tab: Customer Schema | tab | Поля схемы клиента | selected | Default |
| 3 | Tab: Event Schema | tab | Поля схемы событий | — | |
| 4 | Section heading | text | Поля схемы клиента (h4) | — | Inside content area |
| 5 | Total count | text | Всего: 0 | — | Shows count after field selected |
| 6 | Field selector dropdown | select | Выберите поле | — | Lists schema fields as options |
| 7 | Empty state message | text | Выберите поле для просмотра значений | — | Shown before field selection |
| 8 | Data visualization area | — | — | hidden | Appears after field selection (table/chart) |

## Sub-States Explored

| Trigger | Result | Elements Added |
|---------|--------|---------------|
| (From prior session) Select gender field | Data table with value distribution (female/male/other) | #8 |
| (From prior session) Switch to Event Schema tab | Same layout, event fields in dropdown | — |

## Page Health

**Console errors:** None
**Console warnings:** None

## Routes Discovered

None.
