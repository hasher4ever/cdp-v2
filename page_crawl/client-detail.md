# Client Detail (`/data/clients/{id}`)

**Last crawled:** 2026-03-30
**Stale after:** 7 days

## Structure

Customer profile page accessed by clicking a row in the Clients table. Header with back button + "Клиент ID: {id}". Three sections: Customer Profile (collapsed by default), Aggregates (all UDAFs with per-customer values), Event History (event types with counts). Standard sidebar nav (see dashboard.md).

## Elements

| # | Element | Type | Label / Text | State | Notes |
|---|---------|------|-------------|-------|-------|
| 1 | Back button | button | Назад | enabled | Returns to client list |
| 2 | Header | text | Клиент ID: 221698 | — | Dynamic per customer |
| 3 | Section: Профиль клиента | text | Профиль клиента (h3) | — | |
| 4 | Creation date | text | Добавлено в систему: 13.03.2026 16:14 | — | |
| 5 | Show more button | button | Показать остальные | enabled | Expands profile fields |
| 6 | Section: Агрегаты | text | Агрегаты (h3) | — | |
| 7 | Aggregate name+value pairs | text | 100+ entries | — | All aggregate values for this customer |
| 8 | SQL injection names in aggregates | text | `'; DROP TABLE...` | — | Rendered as text, not executed |
| 9 | Section: История событий | text | История событий (h3) | — | |
| 10 | Event type: add_to_cart + count | text | add_to_cart: 0 | — | |
| 11 | Event type: login + count | text | login: 0 | — | |
| 12 | Event type: purchase + count | text | purchase: 0 | — | |
| 13 | Event types (8 more) | text | Various | — | 11 total event types |

## Page Health

**Console errors:** 10 errors from `/calculate` endpoints — aggregate calculation API failures
**API calls:** Multiple `/calculate?primaryId={id}` calls return errors

## Routes Discovered

None new.
