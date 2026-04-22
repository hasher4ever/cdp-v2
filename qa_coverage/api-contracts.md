# API Contract Coverage

**Last checked:** 2026-03-30

**Sources:**
- `docs/API-REFERENCE.md` — 83 documented endpoints (including undocumented section)
- `CLAUDE.md` — undocumented endpoint list
- `openapi/clustermeta.yaml` + `openapi/ingest.yaml` — OpenAPI specs
- `page_crawl/.cache/dashboard_network.md`, `clients_network.md`, `campaigns_network.md` — live network captures
- `tests_backend/*.test.ts` + `tests_business/*.test.ts` — all test files

---

## Endpoint Status

| # | Method | Path | Documented? | Tested? | Page Observed? | Notes |
|---|--------|------|-------------|---------|----------------|-------|
| 1 | POST | `/public/api/signin` | Yes | Yes | Yes (dashboard, clients, campaigns) | Core auth — works |
| 2 | POST | `/public/api/signup` | Yes | Yes (signup.test.ts + tenant-provisioner) | No | Works in tests |
| 3 | POST | `/api/tenant/employee` | Yes | Yes | No | **BUG-012: always 500** |
| 4 | GET | `/api/tenants/info` | Yes | Yes | Yes (dashboard, clients, campaigns) | Works |
| 5 | GET | `/api/tenants/schema/customers/fields` | Yes | Yes | Yes (clients page) | Works |
| 6 | POST | `/api/tenants/schema/customers/fields` | Yes | Yes | No | Works |
| 7 | PUT | `/api/tenants/schema/customers/fields` | Yes | Yes | No | Works |
| 8 | DELETE | `/api/tenants/schema/customers/fields` | Yes | Yes | No | Works (draft fields only) |
| 9 | POST | `/api/tenants/schema/customers/validate-api-name` | Yes | Yes | No | Works |
| 10 | GET | `/api/tenants/schema/event-types` | Yes | Yes | No | Works |
| 11 | POST | `/api/tenants/schema/event-types` | Yes | Yes | No | Works |
| 12 | GET | `/api/tenants/schema/event-types/get-by-id` | Yes | Yes | No | Works |
| 13 | PUT | `/api/tenants/schema/event-types` | Yes | **No** | No | **UNTESTED — no PUT test exists for event types** |
| 14 | DELETE | `/api/tenants/schema/event-types` | Yes | Yes | No | Works |
| 15 | GET | `/api/tenants/schema/event-types-name-exists` | Yes (as GET) | Yes (as POST) | No | **METHOD DRIFT: doc says GET, tests call POST — one is wrong** |
| 16 | GET | `/api/tenants/schema/events/fields/{eventTypeId}` | Yes | Yes | No | Works |
| 17 | POST | `/api/tenants/schema/events/fields/{eventTypeId}` | Yes | Yes | No | Works |
| 18 | PUT | `/api/tenants/schema/events/fields/{eventTypeId}` | Yes | Yes | No | Works |
| 19 | DELETE | `/api/tenants/schema/events/fields/{eventTypeId}` | Yes | Yes | No | Works |
| 20 | POST | `/api/tenants/schema/events/validate-api-name/{eventTypeId}` | Yes | **No** | No | **UNTESTED** |
| 21 | GET | `/api/tenants/schema/draft-schema/status` | Yes | Yes | Yes (dashboard, clients) | Works |
| 22 | POST | `/api/tenants/schema/draft-schema/apply` | Yes | Yes | No | Works |
| 23 | DELETE | `/api/tenants/schema/draft-schema/cancel` | Yes | Yes | No | Works |
| 24 | GET | `/api/tenants/schema/internal/customers/fields/info` | Yes | Yes | No | Works |
| 25 | GET | `/api/tenants/schema/internal/events/fields/info` | Yes | Yes | No | Works |
| 26 | POST | `/cdp-ingest/ingest/tenant/{tenantId}/async/customers` | Yes | Yes (ingest.ts helper) | No | Works |
| 27 | POST | `/cdp-ingest/ingest/tenant/{tenantId}/async/events` | Yes | Yes (ingest.ts helper) | No | Works |
| 28 | POST | `/api/file/upload/init` | Yes | Yes | No | Works |
| 29 | POST | `/api/file/upload/part` | Yes | Yes (via raw fetch) | No | Works (no api client wrapper used — uses raw fetch) |
| 30 | POST | `/api/file/upload/complete` | Yes | Yes | No | Works |
| 31 | POST | `/api/tenants/data/file/keys` | Yes | Yes | No | **BUG-013: returns 500 "implement me"** |
| 32 | POST | `/api/tenant/data/customers` | Yes | No (tests use v2) | No | Works; **BUG-023: page=-1 returns 500** |
| 33 | GET | `/api/tenant/data/customers/{primaryId}` | Yes | Yes | No | Works (404 for non-existent) |
| 34 | POST | `/api/tenant/data/events` | Yes | **No** | No | **UNTESTED — v2 events endpoint is tested instead** |
| 35 | GET | `/api/tenant/data/events/{compositeId}` | Yes | Yes | No | **BUG-010: always 500** |
| 36 | GET | `/api/tenant/data/count` | Yes | Yes | Yes (dashboard, clients, campaigns) | Works |
| 37 | GET | `/api/tenant/data/event-types/count` | Yes | Yes | Yes (dashboard, clients, campaigns) | Works |
| 38 | POST | `/api/v2/tenant/data/customers` | Yes (undocumented section) | Yes | Yes (clients page) | Works; **BUG-008: pagination overlaps without orderBy** |
| 39 | POST | `/api/v2/tenant/data/events` | Yes (undocumented section) | Yes | No | Works |
| 40 | GET | `/api/tenant/data/autocomplete/field-values` | Yes | Yes | No | **BUG-001: table=events returns 500; table=customers works** |
| 41 | GET | `/api/tenant/data/reports/field-values` | Yes | Yes | No | Works |
| 42 | GET | `/api/tenants/udafs` | Yes | Yes | No | Works |
| 43 | POST | `/api/tenants/udafs` | Yes | Yes | No | Works; **BUG-022: accepts empty name; BUG-026: wrong 409 on missing params** |
| 44 | GET | `/api/tenants/udafs/{udafId}` | Yes | Yes | No | Works |
| 45 | GET | `/api/tenants/udafs/types` | Yes | Yes | Yes (clients page) | Works |
| 46 | POST | `/api/tenants/udafs/{udafId}/calculate` | Yes | Yes | No | Works; **BUG-002: RELATIVE time window always 0; BUG-006: some SUM nulls; BUG-027: non-existent customer returns 500** |
| 47 | PUT | `/api/tenants/udafs/{udafId}` | **No** | Yes | No | **UNDOCUMENTED + BUG-025: always returns 400** |
| 48 | DELETE | `/api/tenants/udafs/{udafId}` | **No** | Yes | No | **UNDOCUMENTED — BUG-005 noted no delete exists, but tests do call it** |
| 49 | GET | `/api/tenants/segmentation` | Yes | Yes | No | Works |
| 50 | POST | `/api/tenants/segmentation` | Yes | Yes | No | Works; **BUG-019: accepts empty name; BUG-020: accepts empty segments; BUG-021: stores XSS** |
| 51 | GET | `/api/tenants/segmentation/{id}` | Yes | Yes | No | Works |
| 52 | PUT | `/api/tenants/segmentation/{id}` | Yes | Yes | No | Works |
| 53 | DELETE | `/api/tenants/segmentation/{id}` | Yes | Yes | No | **BUG-009: returns 400** |
| 54 | POST | `/api/tenants/segmentation/preview` | Yes | Yes | No | Works; **BUG-003: accepts empty name** |
| 55 | GET | `/api/tenants/campaign` | Yes | Yes | Yes (campaigns page) | Works |
| 56 | POST | `/api/tenants/campaign` | Yes | Yes | No | Works |
| 57 | GET | `/api/tenants/campaign/{id}` | Yes | Yes | No | Works |
| 58 | PUT | `/api/tenants/campaign/{id}` | Yes | Yes | No | Works |
| 59 | DELETE | `/api/tenants/campaign/{id}` | Yes | Yes | No | Works (unlike other DELETEs) |
| 60 | POST | `/api/tenants/campaign/compute/preview` | Yes | Yes | No | Works |
| 61 | POST | `/api/tenants/campaign/compute/send` | Yes | Yes | No | Works |
| 62 | GET | `/api/tenants/commchan` | Yes | Yes | No | Works |
| 63 | POST | `/api/tenants/commchan` | Yes | Yes | No | Works |
| 64 | GET | `/api/tenants/commchan/{id}` | Yes | Yes | No | Works |
| 65 | PUT | `/api/tenants/commchan/{id}` | Yes | Yes | No | **BUG-011: returns 400** |
| 66 | DELETE | `/api/tenants/commchan/{id}` | Yes | Yes | No | **BUG-009: returns 400** |
| 67 | POST | `/api/tenants/commchan/validate` | Yes | Yes | No | Works |
| 68 | POST | `/api/tenants/commchan/{id}/verify` | Yes | Yes | No | Works |
| 69 | GET | `/api/tenant/template` | Yes | Yes | No | Works |
| 70 | POST | `/api/tenant/template` | Yes | Yes | No | Works |
| 71 | GET | `/api/tenant/template/{id}` | Yes | Yes | No | Works |
| 72 | PUT | `/api/tenant/template/{id}` | Yes | Yes | No | Works |
| 73 | DELETE | `/api/tenant/template/{id}` | Yes | Yes | No | **BUG-009: returns 400** |
| 74 | GET | `/api/tenant/scenario/crud` | Yes (undocumented section) | Yes | No | Works |
| 75 | POST | `/api/tenant/scenario/crud` | Yes (undocumented section) | Yes | No | Works; **BUG-014: accepts whitespace name; BUG-015: stores XSS; BUG-030: accepts empty name** |
| 76 | GET | `/api/tenant/scenario/crud/get-by-id` | Yes (undocumented section) | Yes | No | Works |
| 77 | POST | `/api/tenant/scenario/crud/save-changes` | Yes (undocumented section) | Yes | No | **BUG-017: always 500** |
| 78 | DELETE | `/api/tenant/scenario/crud` | **No** | Yes | No | **UNDOCUMENTED — tested with query param `scenario_id`** |
| 79 | POST | `/api/tenant/scenario/node/crud` | Yes (undocumented section) | Yes | No | Works; **BUG-016: accepts negative durationMin** |
| 80 | POST | `/api/tenant/scenario/edge/crud` | Yes (undocumented section) | Yes | No | Works; **BUG-018: accepts non-existent node IDs** |
| 81 | GET | `/api/tenant/ui/settings` | Yes | Yes | No | Works |
| 82 | POST | `/api/tenant/ui/settings` | Yes | Yes | No | Works; **BUG-024: very long key returns 500** |
| 83 | GET | `/api/tenant/ui/settings/by-key` | Yes | Yes | Yes (clients page) | Works |
| 84 | GET | `/api/tenant/specific-fields` | Yes | Yes | No | Works |
| 85 | PUT | `/api/tenant/specific-fields` | Yes | Yes | No | Works |

---

## Drift Analysis

### METHOD DRIFT (documented method ≠ method used in tests)

| Endpoint | Documented Method | Tested Method | Risk |
|----------|------------------|---------------|------|
| `/api/tenants/schema/event-types-name-exists` | GET (query param `?name=X`) | POST (body) | Medium — one implementation is wrong; tests may be passing against wrong behavior |

### UNDOCUMENTED ENDPOINTS (tested but not in API-REFERENCE.md)

| # | Method | Path | Notes |
|---|--------|------|-------|
| 1 | PUT | `/api/tenants/udafs/{id}` | Tested in `udafs-crud.test.ts` — **BUG-025: always returns 400** |
| 2 | DELETE | `/api/tenants/udafs/{id}` | Tested in `crud-delete.test.ts` — BUG-005 notes no delete endpoint exists; API-REFERENCE.md omits it |
| 3 | DELETE | `/api/tenant/scenario/crud` | Tested in `scenario-lifecycle.test.ts` with `?scenario_id=` query param — not listed in scenarios section |

### DOCUMENTED BUT NEVER TESTED

| # | Method | Path | Section | Risk |
|---|--------|------|---------|------|
| 1 | PUT | `/api/tenants/schema/event-types` | Schema — Event Types | Medium — update path untested |
| 2 | POST | `/api/tenants/schema/events/validate-api-name/{eventTypeId}` | Schema — Event Fields | Low — validate-api-name for customer fields IS tested |
| 3 | POST | `/api/tenant/data/events` | Data Queries V1 | High — V1 events query entirely untested (v2 is tested instead); v1 may have different behavior/bugs |

### DOCUMENTED BUT NEVER OBSERVED IN PAGE CRAWLS

The following endpoints are documented and tested but were never captured in the 3 page crawl network logs (dashboard, clients, campaigns). This may indicate the pages don't use them or the crawls didn't reach those UI states.

- All schema management endpoints
- All CRUD endpoints (create/edit forms not triggered during crawl)
- UDAFs calculate
- Segmentation CRUD
- Template CRUD
- Scenario builder
- File upload
- Ingest API

**Pages with network coverage:** Only 3 pages crawled (dashboard, clients, campaigns). Major surfaces (settings, statistics, segments, scenarios, templates, commchan) have no network captures.

---

## Bug-to-Endpoint Cross-Reference

| Bug | Severity | Endpoint | Status Code Issue |
|-----|----------|----------|-------------------|
| BUG-001 | Medium | GET `/api/tenant/data/autocomplete/field-values?table=events` | Returns 500, expects 200 |
| BUG-002 | High | POST `/api/tenants/udafs/{id}/calculate` | Returns 200 with wrong value (0 instead of count) |
| BUG-003 | Low | POST `/api/tenants/segmentation/preview` | Returns 200 for invalid input (empty name) |
| BUG-005 | Low | N/A (missing DELETE `/api/tenants/udafs/{id}`) | Feature gap — no delete endpoint |
| BUG-006 | High | POST `/api/tenants/udafs/{id}/calculate` | Returns 200 with null instead of computed value |
| BUG-008 | Medium | POST `/api/v2/tenant/data/customers` | Returns 200 with overlapping pages without orderBy |
| BUG-009 | Medium | DELETE `/api/tenants/segmentation/{id}`, `/api/tenants/commchan/{id}`, `/api/tenant/template/{id}` | Returns 400, expects 200 |
| BUG-010 | Medium | GET `/api/tenant/data/events/{compositeId}` | Returns 500, expects 200 or 404 |
| BUG-011 | Medium | PUT `/api/tenants/commchan/{id}` | Returns 400, expects 200 |
| BUG-012 | High | POST `/api/tenant/employee` | Returns 500, expects 200 |
| BUG-013 | High | POST `/api/tenants/data/file/keys` | Returns 500 "implement me" |
| BUG-014 | Low | POST `/api/tenant/scenario/crud` | Returns 200 for whitespace-only name |
| BUG-015 | Medium | POST `/api/tenant/scenario/crud` | Returns 200 with XSS payload stored |
| BUG-016 | Medium | POST `/api/tenant/scenario/node/crud` | Returns 200 for negative durationMin |
| BUG-017 | High | POST `/api/tenant/scenario/crud/save-changes` | Returns 500, expects 204 |
| BUG-018 | Medium | POST `/api/tenant/scenario/edge/crud` | Returns 200 for dangling node references |
| BUG-019 | Low | POST `/api/tenants/segmentation` | Returns 200 for empty name |
| BUG-020 | Medium | POST `/api/tenants/segmentation` | Returns 200 for empty segments array |
| BUG-021 | High | POST `/api/tenants/segmentation` | Returns 200 with XSS payload stored |
| BUG-022 | Low | POST `/api/tenants/udafs` | Returns 200 for empty name |
| BUG-023 | Medium | POST `/api/tenant/data/customers` | Returns 500 for page=-1 (expects 400 or graceful) |
| BUG-024 | Medium | POST `/api/tenant/ui/settings` | Returns 500 for oversized key |
| BUG-025 | Medium | PUT `/api/tenants/udafs/{id}` | Returns 400, expects 200 |
| BUG-026 | Medium | POST `/api/tenants/udafs` | Returns 409 for missing params (expects 400) |
| BUG-027 | Medium | POST `/api/tenants/udafs/{id}/calculate` | Returns 500 for non-existent customer |
| BUG-031 | Low | GET `/api/tenants/schema/customers/fields` | Returns duplicate entries for same displayName |

---

## Drift Summary

| Metric | Count |
|--------|-------|
| Total documented endpoints (API-REFERENCE.md) | 83 |
| Endpoints actually tested | 80 |
| Undocumented endpoints discovered in tests | 3 |
| Documented endpoints never tested | 3 |
| Method drift (documented method ≠ tested method) | 1 |
| Status code bugs (from bugs.md, open) | 26 |
| Pages with network coverage | 3 of ~12+ |
| Endpoints observed in page crawls | 12 |

---

## Priority Gaps

### High Priority (fix or test immediately)

1. **`POST /api/tenant/data/events` (V1)** — documented, never tested. V1 and V2 event queries may have different behavior. Given BUG-010 (event detail 500), the V1 events list may also be broken.

2. **`GET /api/tenants/schema/event-types-name-exists` method drift** — API-REFERENCE.md says GET with `?name=X` query param. Tests call it as POST. The OpenAPI spec must be checked to determine which is correct. One of them is lying.

3. **`PUT /api/tenants/schema/event-types`** — update path for event types never tested. Given that PUT for commchan returns 400 (BUG-011) and PUT for UDAFs returns 400 (BUG-025), there may be a systemic issue with PUT endpoints.

4. **Missing UDAF DELETE and scenario DELETE in docs** — Tests call these, they work (or fail), but there's no documentation. BUG-005 even says "no delete endpoint" while a test actually calls it. The docs and bug tracker are inconsistent.

5. **Page crawl coverage is severely limited** — Only 3 pages crawled. Settings, statistics, segments, scenario builder, templates, commchan, and file upload pages have zero network captures. The `clients_network.md` captured the v2 customers endpoint which confirms the undocumented v2 API is the real production path for the clients page.
