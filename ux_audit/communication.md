# Communications — UX Findings

**Source:** `page_crawl/communication.md` (crawled 2026-03-30)
**Screenshot:** `page_crawl/communication.png`
**Audited:** 2026-03-30

## Findings

| # | P | Category | Proposition |
|---|---|----------|-------------|
| 1 | **P2** | Consistency | Translate "Kind" label to Russian. All other labels are in Russian but this dropdown label is in English — inconsistent with the locale (Nielsen #4: Consistency and standards). |
| 2 | **P2** | Data Display | Replace "blackhole" type label with a user-friendly name. "blackhole" is a technical internal term — use "Тестовый" (Test) or "Заглушка" (Stub) for end users (Nielsen #2: Match between system and real world). |
| 3 | **P3** | Data Display | Truncate UUID column. Same issue as campaigns — full UUIDs waste table space (Nielsen #8: Aesthetic and minimalist design). |
| 4 | **P3** | Forms & Validation | Add a label or description to the "Сопоставления" (Mappings) section. The section has a heading and an add button but no explanation of what mappings are for — new users need context (Nielsen #10: Help and documentation). |

## Global References

See G.1 — unlabeled icon buttons (three-dot menus, add mapping button).

## Business Logic Findings

| # | Severity | Finding | Reference |
|---|----------|---------|-----------|
| BL.1 | Medium | Channel update (PUT) is broken — BUG-011 returns 400. Users can create channels but not edit them. | bugs.md BUG-011 |
