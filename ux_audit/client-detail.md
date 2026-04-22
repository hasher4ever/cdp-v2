# Client Detail — UX Findings

**Source:** `page_crawl/client-detail.md` (crawled 2026-03-30)
**Audited:** 2026-03-30

## Findings

| # | P | Category | Proposition |
|---|---|----------|-------------|
| 1 | **P1** | Feedback & Loading | Suppress or handle aggregate calculation errors gracefully. 10 console errors from `/calculate` endpoints fire on page load — these likely cause missing data in the Aggregates section. Show "Calculation unavailable" per failed aggregate instead of silently showing 0 (Nielsen #9: Help users recognize errors). |
| 2 | **P2** | Data Display | Collapse or paginate the Aggregates section. 100+ aggregate entries flood the page — most show "0". Group by category, hide zero-value aggregates, or add a search/filter (Nielsen #8: Aesthetic and minimalist design). |
| 3 | **P2** | Data Display | Show customer profile fields by default. The "Показать остальные" (Show more) button hides all profile fields behind a click — the primary data a user visits this page for is hidden (Nielsen #6: Recognition rather than recall). |
| 4 | **P2** | Navigation | Add breadcrumb navigation. Header says "Клиент ID: 221698" but there's no breadcrumb like "Клиенты > 221698" to provide context or quick return (Nielsen #3: User control and freedom). |
| 5 | **P3** | Data Display | Show customer name in the header instead of just ID. "Клиент ID: 221698" is meaningless — show "Maria Jones (ID: 221698)" if name fields exist (Nielsen #2: Match between system and real world). |

## Global References

See G.1 — unlabeled icon buttons.

## Business Logic Findings

| # | Severity | Finding | Reference |
|---|----------|---------|-----------|
| BL.1 | High | 10 aggregate /calculate API errors on page load — likely related to BUG-027 | bugs.md BUG-027 |
| BL.2 | Medium | SQL injection test names visible as aggregate labels — tenant data pollution from test runs | Prior crawl observation |
