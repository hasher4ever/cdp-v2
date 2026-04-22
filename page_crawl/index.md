# Page Crawl Index — CDP (cdpv2.ssd.uz)

> Base URL: https://cdpv2.ssd.uz
> Auto-updated by /page-crawl, consumed by /qa-crawl and /ux-audit.

## Routes

| Route | Page | Status | Elements | Last Crawled |
|-------|------|--------|----------|--------------|
| `/dashboard` | Dashboard | Done | 30 | 2026-03-30 |
| `/data/clients` | Clients | Done | 20 | 2026-03-30 |
| `/data/clients/{id}` | Client Detail | Done | 13 | 2026-03-30 |
| `/data/events/{id}` | Events | Done (quick) | 16 | 2026-03-30 |
| `/data/scenario` | Scenarios | Done | 13 | 2026-03-30 |
| `/data/scenario/{uuid}` | Scenario Builder | Done | 21 | 2026-03-30 |
| `/data/files` | Files | Done | 5 | 2026-03-30 |
| `/marketing/aggregate` | Aggregates | Done (quick) | 15 | 2026-03-30 |
| `/marketing/segments` | Segments | Done | 16 | 2026-03-30 |
| `/marketing/segments/{uuid}` | Segment Detail | Done | 7 | 2026-03-30 |
| `/marketing/campaigns` | Campaigns | Done | 21 | 2026-03-30 |
| `/marketing/communication` | Communications | Done | 19 | 2026-03-30 |
| `/statistics/field` | Field Statistics | Done | 8 | 2026-03-30 |
| `/auth/sign-in` | Login | Done (quick) | 9 | 2026-03-30 |
| `/auth/sign-up` | Registration | Done (quick) | 3 | 2026-03-30 |

## Uncovered Paths

| Path / Trigger | Discovered From | Notes |
|----------------|----------------|-------|
| `/data/clients/{id}` | Client row click | Dynamic route per customer |
| `/data/events/{typeId}?title={name}` | Events sidebar dropdown | 11 event types |
| `/data/scenario/{uuid}` | Scenario row click | React Flow builder |
| `/marketing/segments/{uuid}` | Segment row click | Detail + chart view |
