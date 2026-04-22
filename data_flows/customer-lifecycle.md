# Customer Data Lifecycle

## Steps

1. **Create Customer Fields** — `POST /api/tenants/schema/customers/fields` — Declare each customer field (VARCHAR, BIGINT, DOUBLE, BOOL, DATE, DATETIME, JSON). Changes go into draft state; not yet live.
   - Input: `{ "name": "gender", "type": "VARCHAR", "accessLevel": "field_optional" }`
   - Output: Field entry with auto-generated internal column name (e.g., `col__varchar_s50000__0`)
   - Known bugs: none

2. **Create Event Type** — `POST /api/tenants/schema/event-types` — Register an event type (e.g., "purchase"). Required before event fields can be declared.
   - Input: `{ "name": "purchase" }`
   - Output: `{ "id": 100, "name": "purchase" }`
   - Known bugs: none

3. **Create Event Fields** — `POST /api/tenants/schema/events/fields/{eventTypeId}` — Declare fields for the event type (e.g., `total_price`, `city`).
   - Input: `{ "name": "total_price", "type": "DOUBLE" }`
   - Output: Field entry with internal column name (e.g., `col__double_18_2__0`)
   - Known bugs: none

4. **Apply Draft Schema** — `POST /api/tenants/schema/draft-schema/apply` — Atomically commits all pending field/event-type changes. Multiple additions can be batched into a single apply.
   - Input: (no body)
   - Output: `200 OK` — all drafted changes go live
   - Notes: Adding a field that already exists returns `409 Conflict` (not an error). Applying with no pending changes returns `200` with no effect.
   - Wait: ~3 seconds propagation delay before fields are usable.
   - Known bugs: none

5. **Ingest Customers** — `POST /cdp-ingest/ingest/tenant/{tenantId}/async/customers` — Stream customer records. No auth required (public endpoint).
   - Input: Array of customer objects; field names use logical `apiName` (e.g., `"gender": "female"`), not internal column names.
   - Output: `{ "accepted": N, "rejected": M, "ignoredFields": [...] }` — unknown fields are silently dropped.
   - Notes: Duplicate `primary_id` uses last-write-wins (upsert). Response is immediate; data is NOT queryable yet.
   - Pipeline: Ingest API → Message Queue → Async Processor → Data Store
   - Known bugs: none

6. **Ingest Events** — `POST /cdp-ingest/ingest/tenant/{tenantId}/async/events` — Stream event records linked to customers via `primary_id`.
   - Input: Array of event objects including `primary_id`, `event_type`, and event fields by `apiName`.
   - Output: `{ "accepted": N, "rejected": M }` — events for non-existent customers may create orphaned records.
   - Wait: 30s–2min for data to land and become queryable. Poll `GET /api/tenant/data/customers/{primaryId}`.
   - Known bugs: none

7. **Bulk File Upload (alternative ingest)** — `POST /api/file/upload/init` → `POST /api/file/upload/part` → `POST /api/file/upload/complete` — Three-step authenticated chunked upload for historical bulk data.
   - Step 1 init: returns `objectId`
   - Step 2 part: binary chunk `Content-Type: application/octet-stream`
   - Step 3 complete: finalize with field mappings
   - Known bugs: `POST /api/tenants/data/file/keys` (CSV paste endpoint) returns 500 — NOT IMPLEMENTED.

8. **Query Customers (v1)** — `POST /api/tenant/data/customers` — Query customer records using internal column names in filters, column selection, and ordering.
   - Input: `{ "columns": [...], "orderBy": [...], "filter": { "type": "group", "group": {...} } }`
   - Notes: All `fieldName` values in queries must be internal column names (`col__xxx`), not logical `apiName`.
   - Known bugs: none

9. **Query Events (v2)** — `POST /api/v2/tenant/data/events` — Undocumented v2 endpoint for event data queries.
   - Input: Same predicate structure as v1; `orderBy` uses `{ "direction": "ASC", "param": { "fieldName": "col__double__0", "kind": "field" } }` format.
   - Known bugs: none

10. **Autocomplete Field Values** — `GET /api/tenant/data/autocomplete/field-values?table={customers|events}&field={col}&value={prefix}` — Type-ahead suggestions for filter values.
    - Known bugs: **BUG-001** — `table=events` consistently returns 500. `table=customers` works correctly.

11. **Segmentation Preview** — `POST /api/tenants/segmentation/preview` — Count customers matching a predicate without persisting the segment.
    - Input: `{ "segmentation": { "name": "...", "segments": [{ "name": "...", "customerProfileFilter": { "type": "group", "group": {...} } }] } }`
    - Output: `{ "segments": [{ "count": N }] }`
    - Known bugs: **BUG-003** — Preview accepts empty `name` (should return validation error).

12. **Save Segment** — `POST /api/tenants/segmentation` — Persist a segmentation definition. Predicates can reference customer fields (`kind: "field"`) or UDAF results (`kind: "udaf"`).
    - Input: Same structure as preview.
    - Output: `{ "id": "...", "name": "..." }`
    - Known bugs: none

---

## Critical Path

Minimum steps for a passing happy-path test:

1. `POST /api/tenants/schema/customers/fields` — declare fields
2. `POST /api/tenants/schema/event-types` — declare event type
3. `POST /api/tenants/schema/events/fields/{id}` — declare event fields
4. `POST /api/tenants/schema/draft-schema/apply` — apply, wait ~3s
5. `POST /cdp-ingest/ingest/tenant/{id}/async/customers` — ingest customers
6. Poll `GET /api/tenant/data/customers/{primaryId}` until record appears (~30s–2min)
7. `POST /api/tenant/data/customers` — query and assert

---

## Edge Cases

- Ingesting a field not in the schema: field is silently dropped (listed in `ignoredFields`). Customer record is still accepted.
- Applying draft with no pending changes: returns `200` with no effect (idempotent).
- Duplicate `primary_id` on ingest: last-write-wins; no error raised.
- `POST /api/tenants/schema/customers/fields` for a field that already exists: `409 Conflict` returned but is non-fatal.
- Internal column names vary per tenant: a fresh tenant's first VARCHAR field may be `col__varchar_255__0` while the shared tenant's is `col__varchar_s50000__0`. Never hardcode column names — resolve via schema API.
- Event for non-existent customer: behavior is undefined; may create orphaned event record.
- Querying immediately after ingest: data may not have landed yet (async pipeline). Always poll before asserting.
- Schema cancel: `DELETE /api/tenants/schema/draft-schema/cancel` discards all pending draft changes.
- File upload endpoint `POST /api/tenants/data/file/keys` (CSV paste) returns 500 — not implemented.
