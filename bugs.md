# CDP Bug Tracker

Bugs discovered during automated testing. Each entry includes reproduction steps and expected vs actual behavior.

**Auth note:** All curls below use a token for tenant `1762934640267`. Get a fresh token when needed:
```bash
curl -s -X POST 'https://cdpv2.ssd.uz/public/api/signin' \
  -H 'Content-Type: application/json' \
  -d '{"username":"shop2025.11.12-13:04:00@cdp.ru","password":"qwerty123","domainName":"1762934640.cdp.com"}'
# Returns: {"jwtToken":"<TOKEN>"}
```

---

## BUG-001: Event autocomplete crashes when `event_type` param is passed

**Severity:** Medium
**Endpoint:** `GET /api/tenant/data/autocomplete/field-values?table=events`
**Status:** Open — UPDATED S16 (endpoint works; schema was not properly documented; requires `table`, `field`, `value` params. `event_type` param still causes 500)

### Setup
```bash
# Step 1: Authenticate
curl -s -X POST 'https://cdpv2.ssd.uz/public/api/signin' \
  -H 'Content-Type: application/json' \
  -d '{"username":"shop2025.11.12-13:04:00@cdp.ru","password":"qwerty123","domainName":"1762934640.cdp.com"}'
# Response: {"jwtToken":"eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."}
```

### Reproduce
```bash
# Autocomplete for events table — returns 500
curl -s 'https://cdpv2.ssd.uz/api/tenant/data/autocomplete/field-values?table=events&field=col__varchar_s50000__11&value=T&event_type=purchase&size=10' \
  -H 'Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJleHAiOjE3NzUxMDIxMDcsInRlbmFudF9pZCI6MTc2MjkzNDY0MDI2NywidXNlcl9pZCI6IjQ4ZDEzNzk3LWIyNTAtNGFmMS1hNzc5LTY4ZmFjYzlmNzU1OCIsInVzZXJfdHlwZSI6Im93bmVyIn0.EBe9m4ij4lqqzyfKF8LFejOyguj0NQdu2-uJXqIhTwE'
```

**Expected:** `200` with `{"list":["Tashkent",...]}` — same as customer autocomplete which works correctly.

**Actual:** `500` with:
```json
{"Debug":"\n[/api.(*server).ListAutocompleteFieldValues at  api.go:1282]>> failed with error: \n[/tenant.ComputeHandle.ListFieldValues at  handle_compute.go:659]>> failed with error: ComputeService: ComputeServiceClientImpl.ListFieldValues failed: \n[/api.(*computeService).ListFieldValues at  rpc-compute-service.go:219]>> failed with error: Error 1054 (42S22): errCode = 2, detailMessage = Unknown column 'event_type' in 'table list'","TraceID":"4ed39478-c199-4fa7-acf8-2adecfe9a5fc"}
```

**Notes:** Customer autocomplete (`table=customers`) works correctly. Only event table fails. The OpenAPI spec defines this endpoint with `table` enum `[customers, events]`, so events should be supported. The error `Unknown column 'event_type' in 'table list'` indicates the query builder is not handling the `event_type` filter correctly for the events table — likely a missing JOIN or alias.

---

## BUG-002: UDAF with RELATIVE time window returns 0 for customers with events

**Severity:** High
**Endpoint:** `POST /api/tenants/udafs/{id}/calculate`
**Status:** Open

### Setup
```bash
# Step 1: Authenticate (use a fresh tenant — shared tenant has separate compute issues)
curl -s -X POST 'https://cdpv2.ssd.uz/public/api/signin' \
  -H 'Content-Type: application/json' \
  -d '{"username":"shop_20260330044249@cdp.test","password":"qwerty123","domainName":"test_20260330044249.cdp.com"}'
# Response: {"jwtToken":"eyJ..."}  — use this as TOKEN below
# Note: tenant was provisioned with schema + 10 customers + 18 purchase events
# Alice (primary_id=9900000001) has 3 purchase events, all ingested today

# Step 2: Create a COUNT UDAF WITHOUT time window (control — works correctly)
curl -X POST 'https://cdpv2.ssd.uz/api/tenants/udafs' \
  -H 'Authorization: Bearer <TOKEN>' \
  -H 'Content-Type: application/json' \
  -d '{"name":"bug002_control_no_tw","aggType":"COUNT","params":[],"filter":{"eventType":{"id":100,"name":"purchase"},"predicate":{"type":"group","group":{"logicalOp":"AND","predicates":[],"negate":false}},"timeWindow":{}},"grouping":{"enable":false}}'
# Response: {"id":"2ed8da8f-...","aggType":"COUNT",...}

# Step 3: Create a COUNT UDAF WITH RELATIVE 365-day time window (bug trigger)
curl -X POST 'https://cdpv2.ssd.uz/api/tenants/udafs' \
  -H 'Authorization: Bearer <TOKEN>' \
  -H 'Content-Type: application/json' \
  -d '{"name":"bug002_relative_365d","aggType":"COUNT","params":[],"filter":{"eventType":{"id":100,"name":"purchase"},"predicate":{"type":"group","group":{"logicalOp":"AND","predicates":[],"negate":false}},"timeWindow":{"from":{"kind":"RELATIVE","relativeDuration":365,"relativeUnit":"DAY"}}},"grouping":{"enable":false}}'
# Response: {"id":"23757d11-...","aggType":"COUNT",...}
```

### Reproduce
```bash
# Control: COUNT without time window for Alice — returns correct value
curl -X POST 'https://cdpv2.ssd.uz/api/tenants/udafs/<CONTROL_ID>/calculate?primaryId=9900000001' \
  -H 'Authorization: Bearer <TOKEN>'
# Response: {"result":{"Result":3}}  ← CORRECT (Alice has 3 purchases)

# Bug: COUNT with RELATIVE 365-day window for Alice — returns 0
curl -X POST 'https://cdpv2.ssd.uz/api/tenants/udafs/<RELATIVE_ID>/calculate?primaryId=9900000001' \
  -H 'Authorization: Bearer <TOKEN>'
# Response: {"result":{"Result":0}}  ← WRONG (same 3 events, all ingested today, within 365 days)

# Retry after 10 seconds — still 0
curl -X POST 'https://cdpv2.ssd.uz/api/tenants/udafs/<RELATIVE_ID>/calculate?primaryId=9900000001' \
  -H 'Authorization: Bearer <TOKEN>'
# Response: {"result":{"Result":0}}  ← still 0, not a timing issue
```

**Expected:** `200` with `{"result":{"Result":3}}` — Alice has 3 purchase events, all ingested today, well within a 365-day window

**Actual:** `200` with `{"result":{"Result":0}}` — the RELATIVE time window filter is excluding all events

**Differential diagnosis (3 test runs on fresh tenants):**
| UDAF Type | Result | Consistent? |
|-----------|--------|-------------|
| SUM/COUNT, no filter, no time window | Correct value | Sometimes null for newly created UDAFs (timing) |
| SUM/COUNT with event filter predicate | Correct value | Sometimes null (timing) |
| COUNT with RELATIVE time window | Always 0 | **YES — consistently wrong across all runs** |
| COUNT with ABSOLUTE past window (2020) | 0 | Correct (no events in 2020) |

**Root cause hypothesis (narrowed 2026-04-02):** The RELATIVE cutoff is computed in the **wrong direction** — `now + N` (future) instead of `now - N` (past). Evidence: a 100-year window (`relativeDuration: 1200, relativeUnit: "MONTH"`) still returns 0 for a customer with 14 confirmed purchase events, ruling out any window-size explanation. The backend computes a future cutoff that no existing event can satisfy, regardless of how large the window is. The bug lives in `udaf_builder.go` around line 47 (referenced in the stack trace) where the RELATIVE bound is resolved to an absolute timestamp.

**Narrowing session findings (shared tenant 1762934640267, 2026-04-02):**
| UDAF Type | Customer 51 Result | Consistent? |
|-----------|---------------------|-------------|
| COUNT, no timeWindow (control) | 14 | YES — correct baseline |
| RELATIVE/MONTH/1 | 0 | YES — wrong |
| RELATIVE/MONTH/12 (1 year) | 0 | YES — wrong |
| RELATIVE/MONTH/1200 (100 years) | 0 | YES — **SMOKING GUN: window size irrelevant** |
| RELATIVE/DAY/365 | 0 | YES — wrong |
| ABSOLUTE 2020-01-01 to 2020-12-31 | 0 | YES — correct (no events in 2020) |

Note: newly created UDAFs (within ~30 min) return 500 "unsupported AggType" on the shared tenant due to a separate materialization/deserialization issue. The pre-existing RELATIVE UDAFs above are ones that survived materialization but compute the wrong value. This confirms two separate bugs: (a) new-UDAF compute materialization failure on shared tenant, and (b) RELATIVE window direction bug affecting all tenants.

**Correct absoluteTime field name (discovered):** The `from`/`to` absolute time field is `absoluteTime` (NOT `absoluteValue`). Payload that works for ABSOLUTE:
```json
{"timeWindow": {"from": {"kind": "ABSOLUTE", "absoluteTime": "2025-01-01T00:00:00Z"}, "to": {"kind": "ABSOLUTE", "absoluteTime": "2027-01-01T00:00:00Z"}}}
```

**Scope:** Affects ALL RELATIVE time window UDAFs universally. The bug is not unit-sensitive (DAY and MONTH both fail), not duration-sensitive (1 to 1200 all fail), and is consistent across shared and fresh tenants. Unfiltered UDAFs and ABSOLUTE time window UDAFs work correctly after materialization.

**Notes:**
- Re-triaged 2026-03-30 from original report which incorrectly claimed all filtered UDAFs fail
- Narrowed 2026-04-02: 100-year window returning 0 definitively proves wrong-direction hypothesis
- On fresh tenants with proper lifecycle (schema → ingest → poll → create UDAF), most UDAFs work
- Other nondeterministic UDAF failures across runs are a materialization timing issue, not a logic bug — newly created UDAFs need recalculation time before `calculate` returns results
- The shared tenant (ID 1762934640267) has a secondary issue: newly created UDAFs (<~30 min old) return 500 with "unsupported AggType, type: " — the compute service receives an empty UDAF struct. Pre-existing UDAFs on the same tenant do compute (return 200) but RELATIVE ones return 0 due to BUG-002. See also BUG-041: some existing UDAFs have permanently corrupt definitions (empty aggType stored in DB) and always return 500 — unrelated to materialization timing.
- Stack trace points to: `udaf_builder.go:47` → `query_builder.go:256` → `rpc-compute-service.go:97`

---

## BUG-003: Segmentation preview with empty name accepted

**Severity:** Low
**Endpoint:** `POST /api/tenants/segmentation/preview`
**Status:** Open

### Setup
```bash
# Step 1: Authenticate
curl -s -X POST 'https://cdpv2.ssd.uz/public/api/signin' \
  -H 'Content-Type: application/json' \
  -d '{"username":"shop2025.11.12-13:04:00@cdp.ru","password":"qwerty123","domainName":"1762934640.cdp.com"}'
# Response: {"jwtToken":"eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."}
```

### Reproduce
```bash
# Preview with empty name — should fail validation
curl -s -X POST 'https://cdpv2.ssd.uz/api/tenants/segmentation/preview' \
  -H 'Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJleHAiOjE3NzUxMDIxMDcsInRlbmFudF9pZCI6MTc2MjkzNDY0MDI2NywidXNlcl9pZCI6IjQ4ZDEzNzk3LWIyNTAtNGFmMS1hNzc5LTY4ZmFjYzlmNzU1OCIsInVzZXJfdHlwZSI6Im93bmVyIn0.EBe9m4ij4lqqzyfKF8LFejOyguj0NQdu2-uJXqIhTwE' \
  -H 'Content-Type: application/json' \
  -d '{"segmentation":{"segments":[{"name":"Segment","customerProfileFilter":{"type":"group","group":{"logicalOp":"AND","negate":false,"predicates":[]}}}],"name":""}}'
```

**Expected:** `400` validation error — name is empty string, `SegmentationCreateReq` schema requires `name` with `minLength: 1`.

**Actual:** `200` with:
```json
{"segments":[{"id":"00f11b92-ef9c-41d0-a0b5-f7a0663d99a2","name":"Segment","numberOfCustomer":342279}]}
```

**Notes:** Preview is read-only so this is low severity, but the SegmentationCreateReq schema requires `name` with `minLength: 1`. Preview should enforce the same validation for consistency.

---

## ~~BUG-004~~: RESOLVED — Column header has 2 buttons: remove (1st) and sort (2nd)

**Status:** Resolved — tester error. The first button removes the column, the second button sorts. Sorting works correctly with format: `{ direction: "ASC", param: { fieldName, kind } }`.

---

## BUG-005: UDAFs created by tests pollute shared tenant column picker

**Severity:** Low (cosmetic / data hygiene)
**Component:** Column picker dialog on `/data/clients`
**Status:** Open

**Observation:** The "Добавить столбцы" (Add columns) dialog shows 100+ UDAF entries from test runs (`cdptest_*`, `biz_*`, `test_udaf_*`) alongside real aggregates. There is no UDAF delete API endpoint in the OpenAPI spec, so test UDAFs cannot be cleaned up.

**Impact:** UI clutter for real users of the shared tenant. Mitigated by using fresh tenant isolation for business tests, but backend tests still create UDAFs on the shared tenant.

**Recommendation:** Add a DELETE endpoint for UDAFs (`DELETE /api/tenants/udafs/{id}`) to allow cleanup.

**Note:** This is a feature request (missing DELETE endpoint), not a behavioral bug. Kept for tracking.

---

## BUG-006: UDAF total_quantity SUM returns null for customers with events

**Severity:** High
**Endpoint:** `POST /api/tenants/udafs/{id}/calculate`
**Status:** Open

### Setup
```bash
# Step 1: Authenticate against a fresh provisioned tenant
curl -s -X POST 'https://cdpv2.ssd.uz/public/api/signin' \
  -H 'Content-Type: application/json' \
  -d '{"username":"shop_20260330044249@cdp.test","password":"qwerty123","domainName":"test_20260330044249.cdp.com"}'
# Response: {"jwtToken":"eyJ..."}  — use this as <TOKEN> below
# Note: tenant was provisioned with schema + 10 customers + 18 purchase events
# Bob (primary_id=9900000005) has 2 purchase events with total_quantity: 2 and 1

# Step 2: Resolve the internal column name for total_quantity
# total_quantity is the 3rd DOUBLE event field → col__double_18_2__2 on a fresh tenant
# Verify via: GET /api/tenants/schema/internal/events/fields/info
# The exact column name varies per tenant — use the schema API to resolve it

# Step 3: Create a SUM UDAF on total_quantity
curl -X POST 'https://cdpv2.ssd.uz/api/tenants/udafs' \
  -H 'Authorization: Bearer <TOKEN>' \
  -H 'Content-Type: application/json' \
  -d '{"name":"bug006_qty_sum","aggType":"SUM","params":[{"fieldName":"col__double_18_2__2"}],"filter":{"eventType":{"id":100,"name":"purchase"},"predicate":{"type":"group","group":{"logicalOp":"AND","predicates":[],"negate":false}},"timeWindow":{}},"grouping":{"enable":false}}'
# Response: {"id":"<UDAF_ID>","aggType":"SUM",...}
# Note: col__double_18_2__2 is total_quantity on the fresh provisioned tenant.
# On your tenant, verify the column name via GET /api/tenants/schema/internal/events/fields/info

# Step 4: Wait ~5-7 minutes for UDAF materialization
```

### Reproduce
```bash
# Calculate SUM(total_quantity) for Bob (primary_id=9900000005)
# Bob has 2 purchase events: total_quantity=2 + total_quantity=1 = 3
curl -X POST 'https://cdpv2.ssd.uz/api/tenants/udafs/<UDAF_ID>/calculate?primaryId=9900000005' \
  -H 'Authorization: Bearer <TOKEN>'
# Expected: {"result":{"Result":3}} — Bob has total_quantity 2+1=3
# Actual: {"result":{"Result":null}} — returns null despite events existing
```

**Expected:** `{"result":{"Result":3}}` — Bob has 2 purchase events with total_quantity 2 and 1
**Actual:** `{"result":{"Result":null}}`

**Notes:** SUM on `total_price` (also DOUBLE, `col__double_18_2__0`) works correctly for the same customer. SUM on `total_quantity` returns null. Frank's total_quantity SUM works (returns 8). This suggests the bug may be data-dependent or related to specific value patterns. Tested across multiple runs on fresh tenants — consistently null for Bob, consistently correct for Frank.

---

## ~~BUG-007~~: RESOLVED — orderBy uses `param` wrapper, not flat `fieldName`

**Status:** Resolved — tester error. Correct format discovered by intercepting FE:
```json
{ "orderBy": [{ "direction": "ASC", "param": { "fieldName": "col__double__0", "kind": "field" } }] }
```
The undocumented format uses `param` object wrapper and uppercase `"ASC"`/`"DESC"`.

---

## BUG-008: V2 API pagination returns overlapping rows without orderBy

**Severity:** Medium
**Endpoint:** `POST /api/v2/tenant/data/customers`
**Status:** Open

### Setup
```bash
# Step 1: Authenticate
curl -s -X POST 'https://cdpv2.ssd.uz/public/api/signin' \
  -H 'Content-Type: application/json' \
  -d '{"username":"shop2025.11.12-13:04:00@cdp.ru","password":"qwerty123","domainName":"1762934640.cdp.com"}'
# Response: {"jwtToken":"eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."} — use as TOKEN below
```

### Reproduce
```bash
# Call A: page 0, size 3, no orderBy
curl -s -X POST 'https://cdpv2.ssd.uz/api/v2/tenant/data/customers' \
  -H 'Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJleHAiOjE3NzUxMDIxMDcsInRlbmFudF9pZCI6MTc2MjkzNDY0MDI2NywidXNlcl9pZCI6IjQ4ZDEzNzk3LWIyNTAtNGFmMS1hNzc5LTY4ZmFjYzlmNzU1OCIsInVzZXJfdHlwZSI6Im93bmVyIn0.EBe9m4ij4lqqzyfKF8LFejOyguj0NQdu2-uJXqIhTwE' \
  -H 'Content-Type: application/json' \
  -d '{"columns":[{"fieldName":"primary_id","kind":"field"}],"orderBy":[],"filter":{},"page":0,"size":3}'
# Response: {"list":[{"primary_id":23},{"primary_id":24},{"primary_id":50}],"totalCount":342279,...}

# Call B: identical request — same page 0, size 3, no orderBy
curl -s -X POST 'https://cdpv2.ssd.uz/api/v2/tenant/data/customers' \
  -H 'Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJleHAiOjE3NzUxMDIxMDcsInRlbmFudF9pZCI6MTc2MjkzNDY0MDI2NywidXNlcl9pZCI6IjQ4ZDEzNzk3LWIyNTAtNGFmMS1hNzc5LTY4ZmFjYzlmNzU1OCIsInVzZXJfdHlwZSI6Im93bmVyIn0.EBe9m4ij4lqqzyfKF8LFejOyguj0NQdu2-uJXqIhTwE' \
  -H 'Content-Type: application/json' \
  -d '{"columns":[{"fieldName":"primary_id","kind":"field"}],"orderBy":[],"filter":{},"page":0,"size":3}'
# Response: {"list":[{"primary_id":2},{"primary_id":3},{"primary_id":6}],"totalCount":342279,...}
# NOTE: Different rows returned for the same request!

# Call C: page 1, size 3 — different order means pages overlap across requests
curl -s -X POST 'https://cdpv2.ssd.uz/api/v2/tenant/data/customers' \
  -H 'Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJleHAiOjE3NzUxMDIxMDcsInRlbmFudF9pZCI6MTc2MjkzNDY0MDI2NywidXNlcl9pZCI6IjQ4ZDEzNzk3LWIyNTAtNGFmMS1hNzc5LTY4ZmFjYzlmNzU1OCIsInVzZXJfdHlwZSI6Im93bmVyIn0.EBe9m4ij4lqqzyfKF8LFejOyguj0NQdu2-uJXqIhTwE' \
  -H 'Content-Type: application/json' \
  -d '{"columns":[{"fieldName":"primary_id","kind":"field"}],"orderBy":[],"filter":{},"page":1,"size":3}'
# Response: {"list":[{"primary_id":17},{"primary_id":31},{"primary_id":34}],"totalCount":342279,...}
```

**Expected:** Two sequential identical requests for page 0 return the same rows; page 0 and page 1 return distinct non-overlapping rows.

**Actual:** Each call returns a different random set — two calls to page 0 returned `[23,24,50]` then `[2,3,6]`. Because the underlying order is random per query, page 0 from one request and page 1 from the next share rows. Pagination is unreliable without an explicit `orderBy`.

**Notes:** The root cause is SQL-level non-determinism: without `ORDER BY`, the database engine returns rows in arbitrary scan order. This makes cursor-based pagination broken. The FE always saves sort state in UI settings, so in practice users always have a sort applied — but the backend should enforce a stable default order (e.g., `ORDER BY primary_id ASC`) when no `orderBy` is specified.

---

## BUG-009: DELETE endpoints return 400 for segmentation, commchan, template

**Severity:** Medium
**Endpoints:**
- `DELETE /api/tenants/segmentation/{id}` → 400
- `DELETE /api/tenants/commchan/{id}` → 400
- `DELETE /api/tenant/template/{id}` → 400

**Status:** Open

### Setup
```bash
# Step 1: Authenticate
curl -s -X POST 'https://cdpv2.ssd.uz/public/api/signin' \
  -H 'Content-Type: application/json' \
  -d '{"username":"shop2025.11.12-13:04:00@cdp.ru","password":"qwerty123","domainName":"1762934640.cdp.com"}'
# Response: {"jwtToken":"eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."} — use as TOKEN below

# Step 2a: Create a segmentation
curl -s -X POST 'https://cdpv2.ssd.uz/api/tenants/segmentation' \
  -H 'Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJleHAiOjE3NzUxMDIxMDcsInRlbmFudF9pZCI6MTc2MjkzNDY0MDI2NywidXNlcl9pZCI6IjQ4ZDEzNzk3LWIyNTAtNGFmMS1hNzc5LTY4ZmFjYzlmNzU1OCIsInVzZXJfdHlwZSI6Im93bmVyIn0.EBe9m4ij4lqqzyfKF8LFejOyguj0NQdu2-uJXqIhTwE' \
  -H 'Content-Type: application/json' \
  -d '{"name":"bug009_delete_test","segments":[{"name":"All","customerProfileFilter":{"type":"group","group":{"logicalOp":"AND","predicates":[],"negate":false}}}]}'
# Response: {"createdAt":"2026-03-31T20:50:11.39945Z","id":"7cfca0ec-9808-4b0a-8b52-0bbd0cce2948","name":"bug009_delete_test",...}

# Step 2b: Create a commchan
curl -s -X POST 'https://cdpv2.ssd.uz/api/tenants/commchan' \
  -H 'Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJleHAiOjE3NzUxMDIxMDcsInRlbmFudF9pZCI6MTc2MjkzNDY0MDI2NywidXNlcl9pZCI6IjQ4ZDEzNzk3LWIyNTAtNGFmMS1hNzc5LTY4ZmFjYzlmNzU1OCIsInVzZXJfdHlwZSI6Im93bmVyIn0.EBe9m4ij4lqqzyfKF8LFejOyguj0NQdu2-uJXqIhTwE' \
  -H 'Content-Type: application/json' \
  -d '{"name":"bug009_commchan_delete","kind":"blackhole","mappings":{},"chanconf":{}}'
# Response: {"chanconf":{},"createdAt":"2026-03-31T20:52:49.412737Z","id":"7050e3ff-fc6d-486f-9144-fc4062cc2daf","kind":"blackhole",...}

# Step 2c: Create a template
curl -s -X POST 'https://cdpv2.ssd.uz/api/tenant/template' \
  -H 'Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJleHAiOjE3NzUxMDIxMDcsInRlbmFudF9pZCI6MTc2MjkzNDY0MDI2NywidXNlcl9pZCI6IjQ4ZDEzNzk3LWIyNTAtNGFmMS1hNzc5LTY4ZmFjYzlmNzU1OCIsInVzZXJfdHlwZSI6Im93bmVyIn0.EBe9m4ij4lqqzyfKF8LFejOyguj0NQdu2-uJXqIhTwE' \
  -H 'Content-Type: application/json' \
  -d '{"name":"bug009_delete_test","subject":"Bug009 Delete Test","content_type":"html","content":"<p>Test</p>","variables":{}}'
# Response: {"id":"c2aa93b5-95fb-408a-8b3b-cb26cefd59df"}
```

### Reproduce
```bash
# Attempt DELETE on segmentation — returns 400
curl -s -X DELETE 'https://cdpv2.ssd.uz/api/tenants/segmentation/7cfca0ec-9808-4b0a-8b52-0bbd0cce2948' \
  -H 'Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJleHAiOjE3NzUxMDIxMDcsInRlbmFudF9pZCI6MTc2MjkzNDY0MDI2NywidXNlcl9pZCI6IjQ4ZDEzNzk3LWIyNTAtNGFmMS1hNzc5LTY4ZmFjYzlmNzU1OCIsInVzZXJfdHlwZSI6Im93bmVyIn0.EBe9m4ij4lqqzyfKF8LFejOyguj0NQdu2-uJXqIhTwE'
# Expected: 200 or 204
# Actual: {"error":"method not allowed"} — HTTP 400

# Attempt DELETE on commchan — returns 400
curl -s -X DELETE 'https://cdpv2.ssd.uz/api/tenants/commchan/7050e3ff-fc6d-486f-9144-fc4062cc2daf' \
  -H 'Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJleHAiOjE3NzUxMDIxMDcsInRlbmFudF9pZCI6MTc2MjkzNDY0MDI2NywidXNlcl9pZCI6IjQ4ZDEzNzk3LWIyNTAtNGFmMS1hNzc5LTY4ZmFjYzlmNzU1OCIsInVzZXJfdHlwZSI6Im93bmVyIn0.EBe9m4ij4lqqzyfKF8LFejOyguj0NQdu2-uJXqIhTwE'
# Expected: 200 or 204
# Actual: {"error":"method not allowed"} — HTTP 400

# Attempt DELETE on template — returns 400
curl -s -X DELETE 'https://cdpv2.ssd.uz/api/tenant/template/c2aa93b5-95fb-408a-8b3b-cb26cefd59df' \
  -H 'Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJleHAiOjE3NzUxMDIxMDcsInRlbmFudF9pZCI6MTc2MjkzNDY0MDI2NywidXNlcl9pZCI6IjQ4ZDEzNzk3LWIyNTAtNGFmMS1hNzc5LTY4ZmFjYzlmNzU1OCIsInVzZXJfdHlwZSI6Im93bmVyIn0.EBe9m4ij4lqqzyfKF8LFejOyguj0NQdu2-uJXqIhTwE'
# Expected: 200 or 204
# Actual: {"error":"method not allowed"} — HTTP 400
```

**Expected:** `200` or `204` — resource deleted successfully.

**Actual:** `400` with `{"error":"method not allowed"}` — all three entity types return the same error, indicating DELETE is not routed for these endpoints.

**Notes:** The OpenAPI spec does not define DELETE endpoints for these resources. DELETE for campaign works (returns 200). DELETE for schema draft fields works. This suggests these entities may intentionally not support deletion, or the endpoints aren't implemented yet. The spec should document this limitation.

---

## BUG-010: Event detail endpoint returns 500

**Severity:** Medium
**Endpoint:** `GET /api/tenant/data/events/{eventCompositeId}`
**Status:** Open

### Setup
```bash
# Step 1: Authenticate
curl -s -X POST 'https://cdpv2.ssd.uz/public/api/signin' \
  -H 'Content-Type: application/json' \
  -d '{"username":"shop2025.11.12-13:04:00@cdp.ru","password":"qwerty123","domainName":"1762934640.cdp.com"}'
# Response: {"jwtToken":"eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."}
```

### Reproduce
```bash
# Attempt to get event detail with composite ID format {eventTypeId}_{cdpEventId}
curl -s 'https://cdpv2.ssd.uz/api/tenant/data/events/100_12345' \
  -H 'Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJleHAiOjE3NzUxMDIxMDcsInRlbmFudF9pZCI6MTc2MjkzNDY0MDI2NywidXNlcl9pZCI6IjQ4ZDEzNzk3LWIyNTAtNGFmMS1hNzc5LTY4ZmFjYzlmNzU1OCIsInVzZXJfdHlwZSI6Im93bmVyIn0.EBe9m4ij4lqqzyfKF8LFejOyguj0NQdu2-uJXqIhTwE'
```

**Expected:** `200` with event fields and schema, or `404` for non-existent event.

**Actual:** `500` with:
```json
{"Debug":"\n[/api.(*server).GetEventProfile at  api.go:1236]>> failed with error: \n[/tenant.ComputeHandle.GetEventDetails at  handle_compute.go:789]>> failed with error: \n[/tenant.GetEventParams at  handle_compute.go:920]>> base64 decode error: illegal base64 data at input byte 3","TraceID":"082ca253-a9df-41fa-81ab-d3ef9f8f5f45"}
```

**Notes:** The composite ID format is not documented. The error `base64 decode error` indicates the endpoint expects a base64-encoded composite ID, not a plain `{eventTypeId}_{cdpEventId}` format. The OpenAPI path parameter name is `eventCompositeId` — the actual encoding format is undiscovered. Also: even if the format is wrong, a non-existent event should return 404, not 500.

**2026-04-03 update (S9):** Composite ID format discovered. IDs are base64-encoded JSON arrays: `[eventTypeId, eventId, customerId]`. The field name in event list response is `event_composite_id`. Confirmed:
- Invalid format ID (plaintext or underscore) → **500** (still wrong, should be 400)
- Non-existent but valid base64 ID → **200** with `{"fields": null, "schema": {...}}` (still wrong, should be 404)
- Both behaviors confirmed by regression guard in `tests_backend/event-detail.test.ts` (10/10 passing)

---

## BUG-011: PUT /api/tenants/commchan/{id} returns 400

**Severity:** Medium
**Endpoint:** `PUT /api/tenants/commchan/{id}`
**Status:** Open

### Setup
```bash
# Step 1: Authenticate
curl -s -X POST 'https://cdpv2.ssd.uz/public/api/signin' \
  -H 'Content-Type: application/json' \
  -d '{"username":"shop2025.11.12-13:04:00@cdp.ru","password":"qwerty123","domainName":"1762934640.cdp.com"}'
# Response: {"jwtToken":"eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."} — use as TOKEN below

# Step 2: Create a commchan
curl -s -X POST 'https://cdpv2.ssd.uz/api/tenants/commchan' \
  -H 'Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJleHAiOjE3NzUxMDIxMDcsInRlbmFudF9pZCI6MTc2MjkzNDY0MDI2NywidXNlcl9pZCI6IjQ4ZDEzNzk3LWIyNTAtNGFmMS1hNzc5LTY4ZmFjYzlmNzU1OCIsInVzZXJfdHlwZSI6Im93bmVyIn0.EBe9m4ij4lqqzyfKF8LFejOyguj0NQdu2-uJXqIhTwE' \
  -H 'Content-Type: application/json' \
  -d '{"name":"bug011_put_test_original","kind":"blackhole","mappings":{},"chanconf":{}}'
# Response: {"chanconf":{},"createdAt":"2026-03-31T20:54:13.672961Z","id":"67390695-b9c9-4eff-9d9c-8ab257b046f8","kind":"blackhole","mappings":{},"name":"bug011_put_test_original","updatedAt":"2026-03-31T20:54:13.672961Z","verified":false}
```

### Reproduce
```bash
# Attempt PUT update — same body with changed name
curl -s -X PUT 'https://cdpv2.ssd.uz/api/tenants/commchan/67390695-b9c9-4eff-9d9c-8ab257b046f8' \
  -H 'Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJleHAiOjE3NzUxMDIxMDcsInRlbmFudF9pZCI6MTc2MjkzNDY0MDI2NywidXNlcl9pZCI6IjQ4ZDEzNzk3LWIyNTAtNGFmMS1hNzc5LTY4ZmFjYzlmNzU1OCIsInVzZXJfdHlwZSI6Im93bmVyIn0.EBe9m4ij4lqqzyfKF8LFejOyguj0NQdu2-uJXqIhTwE' \
  -H 'Content-Type: application/json' \
  -d '{"name":"bug011_put_test_updated","kind":"blackhole","mappings":{},"chanconf":{}}'
# Expected: 200 or 204 — name updated to "bug011_put_test_updated"
# Actual: {"error":"method not allowed"} — HTTP 400
```

**Expected:** `200` or `204` — commchan name updated successfully.

**Actual:** `400` with `{"error":"method not allowed"}` — the PUT method is not routed for this endpoint.

**Notes:** The request body matches the CommChanReq schema (same fields accepted by POST). The error message "method not allowed" is consistent with BUG-009 — the route simply doesn't handle PUT. The OpenAPI spec lists PUT for commchan; the implementation is missing or misconfigured.

---

## BUG-012: Employee creation returns 500

**Severity:** High
**Endpoint:** `POST /api/tenant/employee`
**Status:** Open — UPDATED S21: endpoint now has OpenAPI schema {username, password, firstName, lastName}, still crashes 500 on correct payload

### Setup
```bash
# Step 1: Authenticate
curl -s -X POST 'https://cdpv2.ssd.uz/public/api/signin' \
  -H 'Content-Type: application/json' \
  -d '{"username":"shop2025.11.12-13:04:00@cdp.ru","password":"qwerty123","domainName":"1762934640.cdp.com"}'
# Response: {"jwtToken":"eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."}
```

### Reproduce
```bash
# Attempt to create an employee account
curl -s -X POST 'https://cdpv2.ssd.uz/api/tenant/employee' \
  -H 'Authorization: Bearer <TOKEN>' \
  -H 'X-Tenant-Id: 1762934640267' \
  -H 'Content-Type: application/json' \
  -d '{"username":"employee_bug012@cdp.test","password":"employee123","firstName":"Employee","lastName":"Test"}'
```

**Expected:** `200` with `{"userID": "<uuid>"}` — employee account created.

**Actual:** `500` with:
```json
{"debug":"GetTenantEmployeeByTenant requies ctx tenantId","error":"internal server error"}
```

**Notes:** The error message `GetTenantEmployeeByTenant requies ctx tenantId` (note typo: "requies") indicates the tenant ID is not being injected into the request context for this endpoint. The handler reads tenantId from context but the middleware is not setting it, or the route is mounted without the tenant middleware. This is a routing/middleware configuration bug.

**Additional findings (2026-04-02):** Deeper investigation reveals the employee API is almost entirely unimplemented:
- `GET /api/tenant/employee` — returns `400 "method not allowed"` (no list route)
- `GET/PUT/DELETE /api/tenant/employee/{id}` — returns `404 "no matching operation"` (completely unrouted)
- Only `POST /api/tenant/employee` exists in OpenAPI spec, but it returns 500
- The entire Employee CRUD API is incomplete — only the create endpoint exists in spec, and it's broken

---

## BUG-013: CSV paste/send endpoint not implemented

**Severity:** High
**Endpoint:** `POST /api/tenants/data/file/keys`
**Status:** Open — endpoint returns "implement me"

### Setup
```bash
# Step 1: Authenticate
curl -s -X POST 'https://cdpv2.ssd.uz/public/api/signin' \
  -H 'Content-Type: application/json' \
  -d '{"username":"shop2025.11.12-13:04:00@cdp.ru","password":"qwerty123","domainName":"1762934640.cdp.com"}'
# Response: {"jwtToken":"eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."}
```

### Reproduce
```bash
# Attempt CSV paste-and-send — endpoint stub
curl -s -X POST 'https://cdpv2.ssd.uz/api/tenants/data/file/keys' \
  -H 'Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJleHAiOjE3NzUxMDIxMDcsInRlbmFudF9pZCI6MTc2MjkzNDY0MDI2NywidXNlcl9pZCI6IjQ4ZDEzNzk3LWIyNTAtNGFmMS1hNzc5LTY4ZmFjYzlmNzU1OCIsInVzZXJfdHlwZSI6Im93bmVyIn0.EBe9m4ij4lqqzyfKF8LFejOyguj0NQdu2-uJXqIhTwE' \
  -H 'Content-Type: application/json' \
  -d '{"isCustomer":true,"objectId":"","body":"primary_id,first_name,last_name\n99999501,PasteTest,User1\n99999502,PasteTest,User2"}'
```

**Expected:** `200` with ingest results (similar to `/cdp-ingest/ingest/tenant/{id}/async/customers`).

**Actual:** `500` with:
```json
{"Debug":"invalid UUID length: 0","TraceID":"1736d721-ae83-4b3a-9e3c-aa336d77137b"}
```

**Notes:** The error `invalid UUID length: 0` is thrown because `objectId` is an empty string. The original bug report (with correct implementation check) showed `{"debug":"implement me","error":"internal server error"}` — the handler is a stub. This endpoint is called by the "Отправить данные" (Send data) button on the `/data/files` page. The button is visible and clickable in the UI, but the backend handler is a stub. Users who try to paste CSV data and send it will see an error.

---

## BUG-014: Scenario accepts whitespace-only name

**Severity:** Low
**Endpoint:** `POST /api/tenant/scenario/crud`
**Status:** Open

### Setup
```bash
# Step 1: Authenticate
curl -s -X POST 'https://cdpv2.ssd.uz/public/api/signin' \
  -H 'Content-Type: application/json' \
  -d '{"username":"shop2025.11.12-13:04:00@cdp.ru","password":"qwerty123","domainName":"1762934640.cdp.com"}'
# Response: {"jwtToken":"eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."}
```

### Reproduce
```bash
# Create scenario with whitespace-only name — should be rejected
curl -s -X POST 'https://cdpv2.ssd.uz/api/tenant/scenario/crud' \
  -H 'Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJleHAiOjE3NzUxMDIxMDcsInRlbmFudF9pZCI6MTc2MjkzNDY0MDI2NywidXNlcl9pZCI6IjQ4ZDEzNzk3LWIyNTAtNGFmMS1hNzc5LTY4ZmFjYzlmNzU1OCIsInVzZXJfdHlwZSI6Im93bmVyIn0.EBe9m4ij4lqqzyfKF8LFejOyguj0NQdu2-uJXqIhTwE' \
  -H 'Content-Type: application/json' \
  -d '{"name":"   "}'
```

**Expected:** `400` — whitespace-only name is invalid.

**Actual:** `200` with:
```json
{"id":"afb1cced-8e90-4e2a-a1ac-ecddd0c7924e","name":"   "}
```

---

## BUG-015: Scenario name accepts HTML/XSS payloads without sanitization

**Severity:** Medium (potential stored XSS)
**Endpoint:** `POST /api/tenant/scenario/crud`
**Status:** Open

### Setup
```bash
# Step 1: Authenticate
curl -s -X POST 'https://cdpv2.ssd.uz/public/api/signin' \
  -H 'Content-Type: application/json' \
  -d '{"username":"shop2025.11.12-13:04:00@cdp.ru","password":"qwerty123","domainName":"1762934640.cdp.com"}'
# Response: {"jwtToken":"eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."}
```

### Reproduce
```bash
# Create scenario with XSS payload in name — should be rejected or sanitized
curl -s -X POST 'https://cdpv2.ssd.uz/api/tenant/scenario/crud' \
  -H 'Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJleHAiOjE3NzUxMDIxMDcsInRlbmFudF9pZCI6MTc2MjkzNDY0MDI2NywidXNlcl9pZCI6IjQ4ZDEzNzk3LWIyNTAtNGFmMS1hNzc5LTY4ZmFjYzlmNzU1OCIsInVzZXJfdHlwZSI6Im93bmVyIn0.EBe9m4ij4lqqzyfKF8LFejOyguj0NQdu2-uJXqIhTwE' \
  -H 'Content-Type: application/json' \
  -d '{"name":"<script>alert(1)</script>"}'
```

**Expected:** `400` or sanitized name (e.g., `&lt;script&gt;alert(1)&lt;/script&gt;`).

**Actual:** `200` — XSS payload stored as-is:
```json
{"id":"8f1dca26-9001-45ab-bd4a-8edc3290d642","name":"\u003cscript\u003ealert(1)\u003c/script\u003e"}
```

**Notes:** Go's JSON encoder HTML-escapes `<>` to `\u003c\u003e` in the JSON response, so the response looks escaped. However the raw string is stored unescaped in the database. If the frontend renders the name as innerHTML (or in a context that unescapes), this executes. Verify frontend rendering — if React uses `dangerouslySetInnerHTML` or template literals, this is live XSS.

---

## BUG-016: Scenario wait node accepts 0 and negative durations

**Severity:** Medium
**Endpoint:** `POST /api/tenant/scenario/node/crud`
**Status:** Open

### Setup
```bash
# Step 1: Authenticate
curl -s -X POST 'https://cdpv2.ssd.uz/public/api/signin' \
  -H 'Content-Type: application/json' \
  -d '{"username":"shop2025.11.12-13:04:00@cdp.ru","password":"qwerty123","domainName":"1762934640.cdp.com"}'
# Response: {"jwtToken":"eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."}

# Step 2: Create a scenario to hold the node
curl -s -X POST 'https://cdpv2.ssd.uz/api/tenant/scenario/crud' \
  -H 'Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJleHAiOjE3NzUxMDIxMDcsInRlbmFudF9pZCI6MTc2MjkzNDY0MDI2NywidXNlcl9pZCI6IjQ4ZDEzNzk3LWIyNTAtNGFmMS1hNzc5LTY4ZmFjYzlmNzU1OCIsInVzZXJfdHlwZSI6Im93bmVyIn0.EBe9m4ij4lqqzyfKF8LFejOyguj0NQdu2-uJXqIhTwE' \
  -H 'Content-Type: application/json' \
  -d '{"name":"bug016_wait_node_test"}'
# Response: {"id":"95d0c7f6-5bae-4a2d-bef3-a8d9ca08901f","name":"bug016_wait_node_test"}
```

### Reproduce
```bash
# Create wait node with negative durationMin — should be rejected
curl -s -X POST 'https://cdpv2.ssd.uz/api/tenant/scenario/node/crud' \
  -H 'Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJleHAiOjE3NzUxMDIxMDcsInRlbmFudF9pZCI6MTc2MjkzNDY0MDI2NywidXNlcl9pZCI6IjQ4ZDEzNzk3LWIyNTAtNGFmMS1hNzc5LTY4ZmFjYzlmNzU1OCIsInVzZXJfdHlwZSI6Im93bmVyIn0.EBe9m4ij4lqqzyfKF8LFejOyguj0NQdu2-uJXqIhTwE' \
  -H 'Content-Type: application/json' \
  -d '{"scenarioId":"95d0c7f6-5bae-4a2d-bef3-a8d9ca08901f","nodeType":"node_wait","title":"bad wait","waitNode":{"waitNodeType":"static_wait","staticValue":{"durationMin":-5}},"uiConfig":{"position":{"x":0,"y":0},"type":"static_wait"}}'
```

**Expected:** `400` — negative duration is invalid; a wait of -5 minutes is meaningless.

**Actual:** `200` — node created with `durationMin: -5`:
```json
{"graph":{"edges":[],"nodes":[{"nodeId":"275851740350259200","nodeType":"node_wait","scenarioId":"95d0c7f6-5bae-4a2d-bef3-a8d9ca08901f","title":"bad wait","uiConfig":{"position":{"x":0,"y":0},"type":"static_wait"},"waitNode":{"staticValue":{"durationMin":-5},"waitNodeType":"static_wait"}}],...},"nodeId":275851740350259200}
```

**Also accepts:** `durationMin: 0` (zero-wait is logically meaningless)

---

## BUG-017: Scenario save returns 500

**Severity:** High
**Endpoint:** `POST /api/tenant/scenario/crud/save-changes?scenario_id={id}`
**Status:** FIXED — consistently returns 204 as of 2026-04-02. Verified in scenario-execution.test.ts (step 12 passes on fresh tenant).

### Setup
```bash
# Step 1: Authenticate
curl -s -X POST 'https://cdpv2.ssd.uz/public/api/signin' \
  -H 'Content-Type: application/json' \
  -d '{"username":"shop2025.11.12-13:04:00@cdp.ru","password":"qwerty123","domainName":"1762934640.cdp.com"}'
# Response: {"jwtToken":"eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."}

# Step 2: Create a scenario
curl -s -X POST 'https://cdpv2.ssd.uz/api/tenant/scenario/crud' \
  -H 'Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJleHAiOjE3NzUxMDIxMDcsInRlbmFudF9pZCI6MTc2MjkzNDY0MDI2NywidXNlcl9pZCI6IjQ4ZDEzNzk3LWIyNTAtNGFmMS1hNzc5LTY4ZmFjYzlmNzU1OCIsInVzZXJfdHlwZSI6Im93bmVyIn0.EBe9m4ij4lqqzyfKF8LFejOyguj0NQdu2-uJXqIhTwE' \
  -H 'Content-Type: application/json' \
  -d '{"name":"bug017_save_test"}'
# Response: {"id":"b290d1f8-6a05-4fb2-b601-b1d43427e684","name":"bug017_save_test"}

# Step 3: Add a wait node (trigger node creation returns 409 "trigger node is required" if trigger already present)
curl -s -X POST 'https://cdpv2.ssd.uz/api/tenant/scenario/node/crud' \
  -H 'Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJleHAiOjE3NzUxMDIxMDcsInRlbmFudF9pZCI6MTc2MjkzNDY0MDI2NywidXNlcl9pZCI6IjQ4ZDEzNzk3LWIyNTAtNGFmMS1hNzc5LTY4ZmFjYzlmNzU1OCIsInVzZXJfdHlwZSI6Im93bmVyIn0.EBe9m4ij4lqqzyfKF8LFejOyguj0NQdu2-uJXqIhTwE' \
  -H 'Content-Type: application/json' \
  -d '{"scenarioId":"b290d1f8-6a05-4fb2-b601-b1d43427e684","nodeType":"node_wait","title":"Wait","waitNode":{"waitNodeType":"static_wait","staticValue":{"durationMin":5}},"uiConfig":{"position":{"x":200,"y":0},"type":"static_wait"}}'
# Response: {"nodeId":275851868809207808,...}
```

### Reproduce
```bash
# Save the scenario — was returning 500 in earlier runs
curl -s -X POST 'https://cdpv2.ssd.uz/api/tenant/scenario/crud/save-changes?scenario_id=b290d1f8-6a05-4fb2-b601-b1d43427e684' \
  -H 'Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJleHAiOjE3NzUxMDIxMDcsInRlbmFudF9pZCI6MTc2MjkzNDY0MDI2NywidXNlcl9pZCI6IjQ4ZDEzNzk3LWIyNTAtNGFmMS1hNzc5LTY4ZmFjYzlmNzU1OCIsInVzZXJfdHlwZSI6Im93bmVyIn0.EBe9m4ij4lqqzyfKF8LFejOyguj0NQdu2-uJXqIhTwE' \
  -H 'Content-Type: application/json'
```

**Expected:** `204` — scenario saved.

**Actual (original):** `500` Internal Server Error — occurs on scenarios with trigger + wait nodes and edges. Empty scenarios return `409` (conflict). Latest re-test on 2026-04-01 returned `204`. Needs further investigation to determine trigger conditions for the 500.

---

## BUG-018: Scenario edge accepts non-existent node IDs

**Severity:** Medium
**Endpoint:** `POST /api/tenant/scenario/edge/crud`
**Status:** Open

### Setup
```bash
# Step 1: Authenticate
curl -s -X POST 'https://cdpv2.ssd.uz/public/api/signin' \
  -H 'Content-Type: application/json' \
  -d '{"username":"shop2025.11.12-13:04:00@cdp.ru","password":"qwerty123","domainName":"1762934640.cdp.com"}'
# Response: {"jwtToken":"eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."}

# Step 2: Create a scenario
curl -s -X POST 'https://cdpv2.ssd.uz/api/tenant/scenario/crud' \
  -H 'Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJleHAiOjE3NzUxMDIxMDcsInRlbmFudF9pZCI6MTc2MjkzNDY0MDI2NywidXNlcl9pZCI6IjQ4ZDEzNzk3LWIyNTAtNGFmMS1hNzc5LTY4ZmFjYzlmNzU1OCIsInVzZXJfdHlwZSI6Im93bmVyIn0.EBe9m4ij4lqqzyfKF8LFejOyguj0NQdu2-uJXqIhTwE' \
  -H 'Content-Type: application/json' \
  -d '{"name":"bug018_edge_test"}'
# Response: {"id":"19bf495d-543d-42ae-a22a-d7b7a695664e","name":"bug018_edge_test"}
```

### Reproduce
```bash
# Create edge pointing to node IDs that don't exist in this scenario
curl -s -X POST 'https://cdpv2.ssd.uz/api/tenant/scenario/edge/crud' \
  -H 'Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJleHAiOjE3NzUxMDIxMDcsInRlbmFudF9pZCI6MTc2MjkzNDY0MDI2NywidXNlcl9pZCI6IjQ4ZDEzNzk3LWIyNTAtNGFmMS1hNzc5LTY4ZmFjYzlmNzU1OCIsInVzZXJfdHlwZSI6Im93bmVyIn0.EBe9m4ij4lqqzyfKF8LFejOyguj0NQdu2-uJXqIhTwE' \
  -H 'Content-Type: application/json' \
  -d '{"scenarioId":"19bf495d-543d-42ae-a22a-d7b7a695664e","edgeType":"link_next_node","fromNodeId":"999999999999","toNodeId":"999999999998","uiConfig":{"edge_key":"test"}}'
```

**Expected:** `400` — `fromNodeId` and `toNodeId` `999999999999`/`999999999998` don't exist in this scenario.

**Actual:** `200` — edge created with dangling references:
```json
{"edges":[{"edgeType":"link_next_node","fromNodeId":"999999999999","scenarioId":"19bf495d-543d-42ae-a22a-d7b7a695664e","toNodeId":"999999999998","uiConfig":{"edge_key":"test"}}],"nodes":[],"scenario":{...}}
```

**Notes:** Edges can be created pointing to node IDs that don't exist in the scenario. This creates invalid graph state that may cause issues when the scenario is executed or saved.

---

## BUG-019: Segmentation accepts empty name

**Severity:** Low
**Endpoint:** `POST /api/tenants/segmentation`
**Status:** Open

### Setup
```bash
# Step 1: Authenticate
curl -s -X POST 'https://cdpv2.ssd.uz/public/api/signin' \
  -H 'Content-Type: application/json' \
  -d '{"username":"shop2025.11.12-13:04:00@cdp.ru","password":"qwerty123","domainName":"1762934640.cdp.com"}'
# Response: {"jwtToken":"eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."}
```

### Reproduce
```bash
# Create segmentation with empty name — should be rejected
curl -s -X POST 'https://cdpv2.ssd.uz/api/tenants/segmentation' \
  -H 'Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJleHAiOjE3NzUxMDIxMDcsInRlbmFudF9pZCI6MTc2MjkzNDY0MDI2NywidXNlcl9pZCI6IjQ4ZDEzNzk3LWIyNTAtNGFmMS1hNzc5LTY4ZmFjYzlmNzU1OCIsInVzZXJfdHlwZSI6Im93bmVyIn0.EBe9m4ij4lqqzyfKF8LFejOyguj0NQdu2-uJXqIhTwE' \
  -H 'Content-Type: application/json' \
  -d '{"name":"","segments":[{"name":"A","customerProfileFilter":{"type":"group","group":{"logicalOp":"AND","predicates":[],"negate":false}}}]}'
```

**Expected:** `400` — empty name should be rejected per schema `minLength: 1`.

**Actual:** `200` — segmentation created with empty string name:
```json
{"createdAt":"2026-04-01T03:56:24.545525Z","id":"2b112878-2f43-4374-9b81-d2a9951a981f","name":"","segments":[...],"updatedAt":"2026-04-01T03:56:24.545525Z"}
```

---

## BUG-020: Segmentation accepts empty segments array

**Severity:** Medium
**Endpoint:** `POST /api/tenants/segmentation`
**Status:** Open

### Setup
```bash
# Step 1: Authenticate
curl -s -X POST 'https://cdpv2.ssd.uz/public/api/signin' \
  -H 'Content-Type: application/json' \
  -d '{"username":"shop2025.11.12-13:04:00@cdp.ru","password":"qwerty123","domainName":"1762934640.cdp.com"}'
# Response: {"jwtToken":"eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."}
```

### Reproduce
```bash
# Create segmentation with zero segments — should be rejected
curl -s -X POST 'https://cdpv2.ssd.uz/api/tenants/segmentation' \
  -H 'Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJleHAiOjE3NzUxMDIxMDcsInRlbmFudF9pZCI6MTc2MjkzNDY0MDI2NywidXNlcl9pZCI6IjQ4ZDEzNzk3LWIyNTAtNGFmMS1hNzc5LTY4ZmFjYzlmNzU1OCIsInVzZXJfdHlwZSI6Im93bmVyIn0.EBe9m4ij4lqqzyfKF8LFejOyguj0NQdu2-uJXqIhTwE' \
  -H 'Content-Type: application/json' \
  -d '{"name":"bug020_empty_segs_test","segments":[]}'
```

**Expected:** `400` — a segmentation with no segments is useless and should be rejected.

**Actual:** `200` — creates segmentation with zero segments (`null` in response):
```json
{"createdAt":"2026-04-01T03:56:24.630127Z","id":"1fb41260-5876-40ca-aef9-3a0a059b70c8","name":"bug020_empty_segs_test","segments":null,"updatedAt":"2026-04-01T03:56:24.630127Z"}
```

---

## BUG-021: Stored XSS in segmentation name

**Severity:** High (security)
**Endpoint:** `POST /api/tenants/segmentation`
**Status:** Open

### Setup
```bash
# Step 1: Authenticate
curl -s -X POST 'https://cdpv2.ssd.uz/public/api/signin' \
  -H 'Content-Type: application/json' \
  -d '{"username":"shop2025.11.12-13:04:00@cdp.ru","password":"qwerty123","domainName":"1762934640.cdp.com"}'
# Response: {"jwtToken":"eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."}
```

### Reproduce
```bash
# Create segmentation with XSS payload in name
curl -s -X POST 'https://cdpv2.ssd.uz/api/tenants/segmentation' \
  -H 'Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJleHAiOjE3NzUxMDIxMDcsInRlbmFudF9pZCI6MTc2MjkzNDY0MDI2NywidXNlcl9pZCI6IjQ4ZDEzNzk3LWIyNTAtNGFmMS1hNzc5LTY4ZmFjYzlmNzU1OCIsInVzZXJfdHlwZSI6Im93bmVyIn0.EBe9m4ij4lqqzyfKF8LFejOyguj0NQdu2-uJXqIhTwE' \
  -H 'Content-Type: application/json' \
  -d '{"name":"<script>alert(1)</script>","segments":[{"name":"A","customerProfileFilter":{"type":"group","group":{"logicalOp":"AND","predicates":[],"negate":false}}}]}'
```

**Expected:** `400` or sanitized name.

**Actual:** `200` — XSS payload stored as-is:
```json
{"createdAt":"2026-04-01T03:56:38.411505Z","id":"ea3e7cbc-229c-42fc-a69b-b23e8ee48767","name":"\u003cscript\u003ealert(1)\u003c/script\u003e","segments":[...],"updatedAt":"2026-04-01T03:56:38.411505Z"}
```

**Notes:** Same class of bug as BUG-015 (scenario XSS). Go's JSON encoder HTML-escapes in the response (`\u003c`/`\u003e`), but the raw `<script>alert(1)</script>` is stored in the database. Affects segmentation list page where names are rendered. If the frontend renders via innerHTML or equivalent, this is live XSS.

---

## BUG-022: UDAF accepts empty name

**Severity:** Low
**Endpoint:** `POST /api/tenants/udafs`
**Status:** Open

### Setup
```bash
# Step 1: Authenticate
curl -s -X POST 'https://cdpv2.ssd.uz/public/api/signin' \
  -H 'Content-Type: application/json' \
  -d '{"username":"shop2025.11.12-13:04:00@cdp.ru","password":"qwerty123","domainName":"1762934640.cdp.com"}'
# Response: {"jwtToken":"eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."}
```

### Reproduce
```bash
# Create UDAF with empty name — should be rejected
curl -s -X POST 'https://cdpv2.ssd.uz/api/tenants/udafs' \
  -H 'Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJleHAiOjE3NzUxMDIxMDcsInRlbmFudF9pZCI6MTc2MjkzNDY0MDI2NywidXNlcl9pZCI6IjQ4ZDEzNzk3LWIyNTAtNGFmMS1hNzc5LTY4ZmFjYzlmNzU1OCIsInVzZXJfdHlwZSI6Im93bmVyIn0.EBe9m4ij4lqqzyfKF8LFejOyguj0NQdu2-uJXqIhTwE' \
  -H 'Content-Type: application/json' \
  -d '{"name":"","aggType":"COUNT","params":[],"filter":{"eventType":{"id":100,"name":"purchase"},"predicate":{"type":"group","group":{"logicalOp":"AND","predicates":[],"negate":false}},"timeWindow":{}},"grouping":{"enable":false}}'
```

**Expected:** `400` — empty name.

**Actual:** `200` — UDAF created with empty name:
```json
{"aggType":"COUNT","createdAt":"2026-04-01T03:56:38.493736Z","filter":{...},"grouping":{"enable":false},"id":"2a34e948-68a4-49fc-829a-b82a81c97806","name":"","params":[],...}
```

---

## BUG-023: Negative page number causes 500 on customer data query

**Severity:** Medium
**Endpoint:** `POST /api/tenant/data/customers`
**Status:** Open

### Setup
```bash
# Step 1: Authenticate
curl -s -X POST 'https://cdpv2.ssd.uz/public/api/signin' \
  -H 'Content-Type: application/json' \
  -d '{"username":"shop2025.11.12-13:04:00@cdp.ru","password":"qwerty123","domainName":"1762934640.cdp.com"}'
# Response: {"jwtToken":"eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."}
```

### Reproduce
```bash
# Query customers with negative page number — should be rejected, not crash
curl -s -X POST 'https://cdpv2.ssd.uz/api/tenant/data/customers?page=-1&size=10' \
  -H 'Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJleHAiOjE3NzUxMDIxMDcsInRlbmFudF9pZCI6MTc2MjkzNDY0MDI2NywidXNlcl9pZCI6IjQ4ZDEzNzk3LWIyNTAtNGFmMS1hNzc5LTY4ZmFjYzlmNzU1OCIsInVzZXJfdHlwZSI6Im93bmVyIn0.EBe9m4ij4lqqzyfKF8LFejOyguj0NQdu2-uJXqIhTwE' \
  -H 'Content-Type: application/json' \
  -d '{"fieldNames":["primary_id"]}'
```

**Expected:** `400` (invalid page) or `200` (treat as page 0).

**Actual:** `500` with:
```json
{"Debug":"\n[/api.(*server).PageCustomersData at  api.go:1154]>> failed with error: \n[/tenant.ComputeHandle.PageCustomers at  handle_compute.go:270]>> failed with error: ComputeService: ComputeServiceClientImpl.PageCustomers failed: Page >= 0 is required (trace_id: b59ebb16-44f6-4400-be0d-fd02b8b0d8de)","TraceID":"b1e6ec8e-9b0a-44d2-a435-4b549b66c83c"}
```

**Notes:** The compute service correctly validates `Page >= 0 is required` but the API layer propagates this as an unhandled 500 instead of translating it to a 400. The compute service error message should be caught and returned as a 400.

---

## BUG-024: Very long UI settings key causes 500

**Severity:** Medium
**Endpoint:** `POST /api/tenants/ui-settings`
**Status:** Open — UPDATED S25 (path corrected: was /api/tenant/ui/settings)

### Setup
```bash
# Step 1: Authenticate
curl -s -X POST 'https://cdpv2.ssd.uz/public/api/signin' \
  -H 'Content-Type: application/json' \
  -d '{"username":"shop2025.11.12-13:04:00@cdp.ru","password":"qwerty123","domainName":"1762934640.cdp.com"}'
# Response: {"jwtToken":"eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."}
```

### Reproduce
```bash
# POST UI settings with a 5000-character key — crashes with DB error instead of 400
# The key below is exactly 5000 'k' characters
curl -s -X POST 'https://cdpv2.ssd.uz/api/tenants/ui-settings' \
  -H 'Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJleHAiOjE3NzUxMDIxMDcsInRlbmFudF9pZCI6MTc2MjkzNDY0MDI2NywidXNlcl9pZCI6IjQ4ZDEzNzk3LWIyNTAtNGFmMS1hNzc5LTY4ZmFjYzlmNzU1OCIsInVzZXJfdHlwZSI6Im93bmVyIn0.EBe9m4ij4lqqzyfKF8LFejOyguj0NQdu2-uJXqIhTwE' \
  -H 'Content-Type: application/json' \
  -d "{\"key\":\"$(python3 -c "print('k'*5000")\",\"data\":{\"test\":true}}"
```

**Expected:** `400` — key too long, validate before insert.

**Actual:** `500` with:
```json
{"Debug":"\n[/api.(*server).PostUISettings at  api.go:1296]>> failed with error: ERROR: value too long for type character varying(255) (SQLSTATE 22001)","TraceID":"f8ac7664-6876-4e8b-927c-758bd8819e05"}
```

**Notes:** The database column is `character varying(255)` but the API has no length validation. A 5000-char key hits the DB constraint which surfaces as an unhandled 500. Should validate `len(key) <= 255` (or the actual limit) at the API layer and return 400.

**Copy-paste friendly version (key generated inline):**
```bash
curl -s -X POST 'https://cdpv2.ssd.uz/api/tenants/ui-settings' \
  -H 'Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJleHAiOjE3NzUxMDIxMDcsInRlbmFudF9pZCI6MTc2MjkzNDY0MDI2NywidXNlcl9pZCI6IjQ4ZDEzNzk3LWIyNTAtNGFmMS1hNzc5LTY4ZmFjYzlmNzU1OCIsInVzZXJfdHlwZSI6Im93bmVyIn0.EBe9m4ij4lqqzyfKF8LFejOyguj0NQdu2-uJXqIhTwE' \
  -H 'Content-Type: application/json' \
  -d '{"key":"kkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkk","data":{"test":true}}'
# key above is 300 'k' characters — exceeds the 255-char DB limit
# Response: {"Debug":"...ERROR: value too long for type character varying(255)...","TraceID":"..."}
# HTTP 500
```

---

## BUG-025: UDAF PUT update returns 400

**Severity:** Medium
**Endpoint:** `PUT /api/tenants/udafs/{id}`
**Status:** Open

### Setup
```bash
# Step 1: Authenticate
curl -s -X POST 'https://cdpv2.ssd.uz/public/api/signin' \
  -H 'Content-Type: application/json' \
  -d '{"username":"shop2025.11.12-13:04:00@cdp.ru","password":"qwerty123","domainName":"1762934640.cdp.com"}'
# Response: {"jwtToken":"eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."}

# Step 2: Create a COUNT UDAF to update later
curl -s -X POST 'https://cdpv2.ssd.uz/api/tenants/udafs' \
  -H 'Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJleHAiOjE3NzUxMDIxMDcsInRlbmFudF9pZCI6MTc2MjkzNDY0MDI2NywidXNlcl9pZCI6IjQ4ZDEzNzk3LWIyNTAtNGFmMS1hNzc5LTY4ZmFjYzlmNzU1OCIsInVzZXJfdHlwZSI6Im93bmVyIn0.EBe9m4ij4lqqzyfKF8LFejOyguj0NQdu2-uJXqIhTwE' \
  -H 'Content-Type: application/json' \
  -d '{"name":"bug025_original_name","aggType":"COUNT","params":[],"filter":{"eventType":{"id":100,"name":"purchase"},"predicate":{"type":"group","group":{"logicalOp":"AND","predicates":[],"negate":false}},"timeWindow":{}},"grouping":{"enable":false}}'
# Response: {"id":"9c663d57-1dcc-47b0-8b78-5cafc79f0f70","name":"bug025_original_name","aggType":"COUNT",...}
```

### Reproduce
```bash
# Attempt to update the UDAF name via PUT
curl -s -X PUT 'https://cdpv2.ssd.uz/api/tenants/udafs/9c663d57-1dcc-47b0-8b78-5cafc79f0f70' \
  -H 'Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJleHAiOjE3NzUxMDIxMDcsInRlbmFudF9pZCI6MTc2MjkzNDY0MDI2NywidXNlcl9pZCI6IjQ4ZDEzNzk3LWIyNTAtNGFmMS1hNzc5LTY4ZmFjYzlmNzU1OCIsInVzZXJfdHlwZSI6Im93bmVyIn0.EBe9m4ij4lqqzyfKF8LFejOyguj0NQdu2-uJXqIhTwE' \
  -H 'Content-Type: application/json' \
  -d '{"name":"bug025_updated_name","aggType":"COUNT","params":[],"filter":{"eventType":{"id":100,"name":"purchase"},"predicate":{"type":"group","group":{"logicalOp":"AND","predicates":[],"negate":false}},"timeWindow":{}},"grouping":{"enable":false}}'
```

**Expected:** `200` or `204` — name updated to `"bug025_updated_name"`.

**Actual:** `400` with:
```json
{"error":"method not allowed"}
```

**Notes:** Same payload format as POST (create) but PUT always returns 400. May need a different request format, or UDAF updates aren't implemented. The OpenAPI spec should clarify if UDAF updates are supported.

---

## BUG-026: Non-COUNT UDAF types return 409 without explicit params

**Severity:** Medium
**Endpoint:** `POST /api/tenants/udafs`
**Status:** Open

### Setup
```bash
# Step 1: Authenticate
curl -s -X POST 'https://cdpv2.ssd.uz/public/api/signin' \
  -H 'Content-Type: application/json' \
  -d '{"username":"shop2025.11.12-13:04:00@cdp.ru","password":"qwerty123","domainName":"1762934640.cdp.com"}'
# Response: {"jwtToken":"eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."}
```

### Reproduce
```bash
# Create SUM UDAF without specifying a field in params — returns 409 instead of 400
curl -s -X POST 'https://cdpv2.ssd.uz/api/tenants/udafs' \
  -H 'Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJleHAiOjE3NzUxMDIxMDcsInRlbmFudF9pZCI6MTc2MjkzNDY0MDI2NywidXNlcl9pZCI6IjQ4ZDEzNzk3LWIyNTAtNGFmMS1hNzc5LTY4ZmFjYzlmNzU1OCIsInVzZXJfdHlwZSI6Im93bmVyIn0.EBe9m4ij4lqqzyfKF8LFejOyguj0NQdu2-uJXqIhTwE' \
  -H 'Content-Type: application/json' \
  -d '{"name":"bug026_sum_empty_params","aggType":"SUM","params":[],"filter":{"eventType":{"id":100,"name":"purchase"},"predicate":{"type":"group","group":{"logicalOp":"AND","predicates":[],"negate":false}},"timeWindow":{}},"grouping":{"enable":false}}'
```

**Expected:** `400` with a clear message like "params required for SUM/AVG/MIN/MAX".

**Actual:** `409` with:
```json
{"code":27,"data":{"message":"UDAF params mismatch"},"description":"udaf body is not valid"}
```

**Notes:** SUM, AVG, MIN, MAX require a `params` array with the field to aggregate. When `params` is empty, the API returns `409 Conflict` instead of `400 Bad Request` — wrong HTTP status for a validation error. The error message `UDAF params mismatch` is also cryptic; it should say "aggType SUM requires at least one field in params". COUNT works fine without params.

---

## BUG-027: UDAF calculate with non-existent customer returns 500

**Severity:** Medium
**Endpoint:** `POST /api/tenants/udafs/{id}/calculate?primaryId=X`
**Status:** Open

### Reproduce
```bash
# Step 1: Get any existing UDAF ID
curl -s 'https://cdpv2.ssd.uz/api/tenants/udafs' \
  -H 'Authorization: Bearer {TOKEN}'
# Pick any UDAF ID from the response

# Step 2: Calculate for a customer ID that was never ingested
curl -X POST 'https://cdpv2.ssd.uz/api/tenants/udafs/{UDAF_ID}/calculate?primaryId=0000000000' \
  -H 'Authorization: Bearer {TOKEN}'
```

**Expected:** `200` with `{"result": null}` or `{"result": 0}`, or `404` — customer doesn't exist, return graceful null/zero result.

**Actual:** `500 Internal Server Error`

**Notes:** Calculating a UDAF for a customer that doesn't exist should return null/0, not crash. This is triggered by any primaryId that was never ingested into the tenant.

---

## BUG-028: Segment detail page crashes when segment has null predicate

**Severity:** High
**Endpoint:** `GET /marketing/segments/{uuid}` (frontend route)
**Status:** Open

### Setup
```bash
# Step 1: Authenticate
curl -s -X POST 'https://cdpv2.ssd.uz/public/api/signin' \
  -H 'Content-Type: application/json' \
  -d '{"username":"shop2025.11.12-13:04:00@cdp.ru","password":"qwerty123","domainName":"1762934640.cdp.com"}'
# Response: {"jwtToken":"<TOKEN>"}

# Step 2: Create a segmentation with empty segments array (BUG-020 allows this)
curl -X POST 'https://cdpv2.ssd.uz/api/tenants/segmentation' \
  -H 'Authorization: Bearer <TOKEN>' \
  -H 'Content-Type: application/json' \
  -d '{"name":"bug028_null_predicate","segments":[]}'
# Response: {"id":"<SEG_UUID>","name":"bug028_null_predicate","segments":[]}
```

### Reproduce
```bash
# Open the segment detail page in the browser:
# https://cdpv2.ssd.uz/marketing/segments/<SEG_UUID>
# (navigate to the segment created above)
```

**Expected:** Segment detail page loads and displays the segment with empty predicate state or a "no conditions" placeholder.

**Actual:** Page crashes with a TypeError — the React component tries to iterate over predicate conditions without null-checking, causing an unhandled exception that crashes the page.

**Notes:** The frontend does not guard against null predicate data when rendering the segment detail view. Any segment created without predicates (via API or via BUG-020 which allows empty segments arrays) will crash the detail page. This is a data-dependent crash that blocks viewing specific segments. Related to BUG-020 which allows creating the invalid data in the first place.

---

## ~~BUG-029~~: DUPLICATE of BUG-017 — RESOLVED

**Original title:** Scenario save-changes returns 500
**Status:** RESOLVED — same bug as BUG-017 ("Scenario save returns 500"), which was fixed in Session 6 (2026-04-02).

See BUG-017 for full reproduction steps and fix confirmation.

---

## BUG-030: Scenario builder accepts empty name without validation

**Severity:** Medium
**Endpoint:** `POST /api/tenant/scenario/crud`
**Status:** **FIXED S16** — empty name now correctly rejected with 400

### Reproduce
```bash
# Step 1: Authenticate
curl -s -X POST 'https://cdpv2.ssd.uz/public/api/signin' \
  -H 'Content-Type: application/json' \
  -d '{"username":"shop2025.11.12-13:04:00@cdp.ru","password":"qwerty123","domainName":"1762934640.cdp.com"}'
# Response: {"jwtToken":"<TOKEN>"}

# Step 2: Create scenario with empty name — no validation rejects it
curl -X POST 'https://cdpv2.ssd.uz/api/tenant/scenario/crud' \
  -H 'Authorization: Bearer <TOKEN>' \
  -H 'Content-Type: application/json' \
  -d '{"name":""}'
# Response: {"id":"<UUID>","name":""}
```

**Expected:** `400` — empty name should be rejected with a validation error.

**Actual:** `200` with `{"id":"<UUID>","name":""}` — scenario with empty name is created successfully.

**Notes:** This is the API-level manifestation of the same validation gap as BUG-014 (scenario accepts whitespace-only names). Both client-side and server-side validation are missing for scenario names. An empty-named scenario is confusing in the builder UI as it appears as an untitled entry with no way to distinguish it.

---

## BUG-031: Duplicate "Customers yearly income" entry in customer field dropdown

**Severity:** Low
**Endpoint:** `GET /api/tenants/schema/customers/fields`
**Status:** Open

### Reproduce
```bash
# Step 1: Authenticate
curl -s -X POST 'https://cdpv2.ssd.uz/public/api/signin' \
  -H 'Content-Type: application/json' \
  -d '{"username":"shop2025.11.12-13:04:00@cdp.ru","password":"qwerty123","domainName":"1762934640.cdp.com"}'
# Response: {"jwtToken":"<TOKEN>"}

# Step 2: Fetch customer schema fields and check for duplicate displayNames
curl -s 'https://cdpv2.ssd.uz/api/tenants/schema/customers/fields' \
  -H 'Authorization: Bearer <TOKEN>'
# Look for two entries with displayName "Customers yearly income" (or similar)
```

**Expected:** Each field name appears exactly once in the customer field dropdown on `/statistics/field`.

**Actual:** "Customers yearly income" appears twice in the dropdown on the `/statistics/field` page. Both entries return data but cannot be distinguished by users. Confirmed by inspecting `GET /api/tenants/schema/customers/fields` for duplicate `displayName` values.

**Notes:** Discovered via E2E test on 2026-03-30. The duplicate entry does not cause a crash — both options return data — but it is confusing in the UI. The root cause is likely a duplicate schema field definition in the shared tenant configuration. The duplicate `displayName` in the schema response maps to two different `col__*` internal names.

---

## BUG-032: Blackhole/webhook channels reject campaign send with "invalid column mappings"

**Severity:** High
**Endpoint:** `POST /api/tenants/campaign/compute/send?id={campaignId}`
**Status:** Open

### Setup
```bash
# Step 1: Authenticate
curl -s -X POST 'https://cdpv2.ssd.uz/public/api/signin' \
  -H 'Content-Type: application/json' \
  -d '{"username":"shop2025.11.12-13:04:00@cdp.ru","password":"qwerty123","domainName":"1762934640.cdp.com"}'
# Response: {"jwtToken":"<TOKEN>"}

# Step 2: Ensure specific-fields are configured
curl -s -X PUT 'https://cdpv2.ssd.uz/api/tenant/specific-fields' \
  -H 'Authorization: Bearer <TOKEN>' \
  -H 'Content-Type: application/json' \
  -d '{"field_type":"email","field_name":"col__varchar_s50000__5"}'
# Response: {"id":"..."}

# Step 3: Create blackhole commchan WITH email mapping
curl -s -X POST 'https://cdpv2.ssd.uz/api/tenants/commchan' \
  -H 'Authorization: Bearer <TOKEN>' \
  -H 'Content-Type: application/json' \
  -d '{"name":"bug032_chan","kind":"blackhole","mappings":{"email":"col__varchar_s50000__5"},"chanconf":{}}'
# Response: {"id":"<CHAN_ID>", ...}

# Step 4: Verify channel
curl -s -X POST 'https://cdpv2.ssd.uz/api/tenants/commchan/<CHAN_ID>/verify' \
  -H 'Authorization: Bearer <TOKEN>' \
  -H 'Content-Type: application/json'
# Response: {"message":"","verified":true}

# Step 5: Create template with variables
curl -s -X POST 'https://cdpv2.ssd.uz/api/tenant/template' \
  -H 'Authorization: Bearer <TOKEN>' \
  -H 'Content-Type: application/json' \
  -d '{"content_type":"html","name":"bug032_template","subject":"Hello {{.first_name}}","content":"<p>Hello {{.first_name}}</p>","variables":{"first_name":"col__varchar_s50000__4"}}'
# Response: {"id":"<TMPL_ID>"}

# Step 6: Create campaign
curl -s -X POST 'https://cdpv2.ssd.uz/api/tenants/campaign' \
  -H 'Authorization: Bearer <TOKEN>' \
  -H 'Content-Type: application/json' \
  -d '{"name":"bug032_campaign","commChanId":"<CHAN_ID>","templateId":"<TMPL_ID>","includeSegment":["c3db3c3a-e50c-4118-8134-1f94618fb4ad"],"excludeSegment":[]}'
# Response: {"id":"<CAMP_ID>", ...}
```

### Reproduce
```bash
# Blackhole channel send
curl -s -X POST 'https://cdpv2.ssd.uz/api/tenants/campaign/compute/send?id=a5df52c1-5c6e-403b-affe-91b47788f65c' \
  -H 'Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJleHAiOjE3NzUyMDIwMDMsInRlbmFudF9pZCI6MTc2MjkzNDY0MDI2NywidXNlcl9pZCI6IjQ4ZDEzNzk3LWIyNTAtNGFmMS1hNzc5LTY4ZmFjYzlmNzU1OCIsInVzZXJfdHlwZSI6Im93bmVyIn0.3Ung5nuWYh5Io6ce-ZSxTQleC0L33ZLfpZiNpYLO8VM' \
  -H 'Content-Type: application/json'
```

**Expected:** `204` — campaign send should be accepted. Blackhole channels are documented as consuming messages without external delivery, which should work for testing campaigns.

**Actual:** `409` — full response: `{"code":16,"data":{"err":{"Code":31,"Message":"invalid column mappings","Data":null},"msg":"DomainError(31, invalid column mappings)"},"description":"segmentation failed to send"}`

**Notes:** Tested exhaustively with multiple mapping configurations on blackhole channels:
- `mappings: {}` → "invalid column mappings"
- `mappings: {"email": "col__varchar_s50000__5"}` → "invalid column mappings"
- `mappings: {"email": "col__varchar_s50000__5", "phone": "col__bigint__1"}` → "invalid column mappings"

Also fails with `kind: "webhook"` channels regardless of mappings. Only `kind: "email_smtp2go_api"` passes the column mapping validation step (but may fail later on template rendering). This suggests the backend validation for campaign send specifically requires an email-type channel and does not support blackhole/webhook channel types for campaign sends, despite blackhole being designed for exactly this testing use case. Identified in campaign-send.test.ts step 8.

**2026-04-03 re-verification (S9):** Scope has ESCALATED. Scenario action node creation (`POST /api/tenant/scenario/node/crud` with `nodeType: "node_action"`) now crashes with `500 {"debug":"invalid memory address or nil pointer dereference","error":"internal server error"}` for ALL commchan types (blackhole AND webhook). This is no longer just a campaign-send validation issue — action nodes universally crash the backend. Tested with blackhole commchan, webhook commchan, and multiple actionType values (email, webhook) — all produce identical nil pointer panic.

---

## BUG-033: Scenario DELETE endpoint returns 400 "method not allowed" — delete is not implemented

**Severity:** High
**Endpoint:** `DELETE /api/tenant/scenario/crud`
**Status:** Open

### Setup
```bash
# Step 1: Authenticate
curl -s -X POST 'https://cdpv2.ssd.uz/public/api/signin' \
  -H 'Content-Type: application/json' \
  -d '{"username":"shop2025.11.12-13:04:00@cdp.ru","password":"qwerty123","domainName":"1762934640.cdp.com"}'
# Response: {"jwtToken":"<TOKEN>", ...}

# Step 2: Create a scenario to delete
curl -s -X POST 'https://cdpv2.ssd.uz/api/tenant/scenario/crud' \
  -H 'Content-Type: application/json' \
  -H 'Authorization: Bearer <TOKEN>' \
  -d '{"name":"TEST_bug_repro_del"}'
# Response: {"id":"494cf6af-0b79-44d8-a649-6a950d28439d","name":"TEST_bug_repro_del"}
```

### Reproduce
```bash
# Attempt to delete a scenario by ID
curl -s -X DELETE 'https://cdpv2.ssd.uz/api/tenant/scenario/crud?scenario_id=494cf6af-0b79-44d8-a649-6a950d28439d' \
  -H 'Authorization: Bearer <TOKEN>'
```

**Expected:** `200` or `204` — scenario is deleted, subsequent GET returns 404/409.
**Actual:** `400` — full response: `{"error":"method not allowed"}`

**Notes:** All DELETE variants were tested:
- `DELETE /api/tenant/scenario/crud?scenario_id=<id>` → 400
- `DELETE /api/tenant/scenario/crud` with JSON body `{"scenario_id":"<id>"}` → 400
- `DELETE /api/tenant/scenario/crud` with JSON body `{"scenarioId":"<id>"}` → 400
- `DELETE /api/tenant/scenario/crud` with JSON body `{"id":"<id>"}` → 400
- `POST /api/tenant/scenario/delete` → 404
- `POST /api/tenant/scenario/crud/delete` → 404

The DELETE HTTP method is not registered on this endpoint at all. Scenarios accumulate indefinitely with no way to remove them — the shared tenant has 576+ scenarios. Cascade behavior (whether nodes are deleted with the scenario) cannot be tested until this is implemented.

---

## BUG-034: Scenario get-by-id returns empty status "" but list returns "NEW" for same scenario

**Severity:** Medium
**Endpoint:** `GET /api/tenant/scenario/crud/get-by-id`
**Status:** Open

### Setup
```bash
# Step 1: Authenticate
curl -s -X POST 'https://cdpv2.ssd.uz/public/api/signin' \
  -H 'Content-Type: application/json' \
  -d '{"username":"shop2025.11.12-13:04:00@cdp.ru","password":"qwerty123","domainName":"1762934640.cdp.com"}'
# Response: {"jwtToken":"<TOKEN>", ...}

# Step 2: Create a scenario
curl -s -X POST 'https://cdpv2.ssd.uz/api/tenant/scenario/crud' \
  -H 'Content-Type: application/json' \
  -H 'Authorization: Bearer <TOKEN>' \
  -d '{"name":"TEST_bug_status_mismatch"}'
# Response: {"id":"9f46fa3a-8713-4201-aa0d-5c077974f44e","name":"TEST_bug_status_mismatch"}
```

### Reproduce
```bash
# Check status via list endpoint
curl -s -X GET 'https://cdpv2.ssd.uz/api/tenant/scenario/crud?page=0&size=2' \
  -H 'Authorization: Bearer <TOKEN>'
# Response contains: {"id":"9f46fa3a-8713-4201-aa0d-5c077974f44e","name":"TEST_bug_status_mismatch","status":"NEW","createdAt":"..."}

# Check status via get-by-id endpoint for the SAME scenario
curl -s -X GET 'https://cdpv2.ssd.uz/api/tenant/scenario/crud/get-by-id?scenario_id=9f46fa3a-8713-4201-aa0d-5c077974f44e' \
  -H 'Authorization: Bearer <TOKEN>'
```

**Expected:** `{"scenario": {"id": "9f46fa3a-...", "status": "NEW", ...}, "nodes": [], "edges": []}`
**Actual:** `{"scenario": {"id": "9f46fa3a-...", "status": "", "createdAt": "...", "name": "TEST_bug_status_mismatch"}, "nodes": [], "edges": []}` — status is empty string `""`

**Notes:** The list endpoint (`GET /api/tenant/scenario/crud`) correctly populates `status: "NEW"` on all scenarios. The get-by-id endpoint (`GET /api/tenant/scenario/crud/get-by-id`) returns `status: ""` (empty string) for the same scenario. This inconsistency means clients fetching a single scenario by ID cannot determine its lifecycle state. The create response also omits the status field entirely (returns only `id` and `name`).

---

## BUG-035: Scenario get-by-id returns 409 (not 404) for non-existent scenario ID

**Severity:** Low
**Endpoint:** `GET /api/tenant/scenario/crud/get-by-id`
**Status:** Open

### Setup
```bash
# No setup needed — use a guaranteed non-existent UUID
```

### Reproduce
```bash
curl -s -X GET 'https://cdpv2.ssd.uz/api/tenant/scenario/crud/get-by-id?scenario_id=00000000-0000-0000-0000-000000000000' \
  -H 'Authorization: Bearer <TOKEN>'
```

**Expected:** `404` — standard HTTP semantics for a resource that does not exist.
**Actual:** `409` — full response: `{"code":45,"data":null,"description":"scenario not found"}`

---

## BUG-036: PUT and DELETE on non-existent commchan/template IDs return 400 instead of 404

**Severity:** Low
**Endpoint:** `PUT /api/tenants/commchan/{id}`, `DELETE /api/tenants/commchan/{id}`, `DELETE /api/tenant/template/{id}`
**Status:** Open

> **Note:** This bug was incorrectly numbered BUG-027 in dashboards generated between 2026-03-31 and 2026-04-02. The correct ID is BUG-036. BUG-027 is permanently reserved for "UDAF calculate with non-existent customer returns 500" (filed 2026-03-30).

### Setup
```bash
# Authenticate
curl -s -X POST 'https://cdpv2.ssd.uz/public/api/signin' \
  -H 'Content-Type: application/json' \
  -d '{"username":"shop2025.11.12-13:04:00@cdp.ru","password":"qwerty123","domainName":"1762934640.cdp.com"}'
# Response: {"jwtToken":"<TOKEN>"}
```

### Reproduce
```bash
# PUT on non-existent commchan
curl -s -X PUT 'https://cdpv2.ssd.uz/api/tenants/commchan/00000000-0000-0000-0000-000000000000' \
  -H 'Authorization: Bearer <TOKEN>' \
  -H 'Content-Type: application/json' \
  -d '{"name":"ghost","kind":"blackhole","mappings":{},"chanconf":{}}'
# Returns: {"error":"method not allowed"} — HTTP 400

# DELETE on non-existent commchan
curl -s -X DELETE 'https://cdpv2.ssd.uz/api/tenants/commchan/00000000-0000-0000-0000-000000000000' \
  -H 'Authorization: Bearer <TOKEN>'
# Returns: {"error":"method not allowed"} — HTTP 400

# DELETE on non-existent template
curl -s -X DELETE 'https://cdpv2.ssd.uz/api/tenant/template/00000000-0000-0000-0000-000000000000' \
  -H 'Authorization: Bearer <TOKEN>'
# Returns: {"error":"method not allowed"} — HTTP 400
```

**Expected:** `404` — ID does not exist, resource not found.

**Actual:** `400` with `{"error":"method not allowed"}` — the router does not handle PUT/DELETE for these paths at all (same root cause as BUG-009 and BUG-011), so it returns "method not allowed" instead of routing to a handler that could return 404.

**Notes:** The 400 vs 404 distinction matters because callers cannot distinguish "this method is not allowed on this resource type" from "this specific resource does not exist." Both cases are conflated into the same error response. GET on a non-existent ID correctly returns 404 for commchan and template — the 404 logic exists but can't be reached for PUT/DELETE because the routes aren't registered.

**Notes:** HTTP 409 (Conflict) is semantically incorrect for a missing resource. 404 (Not Found) is the correct status code. This also makes it impossible to distinguish "scenario exists but in a conflicting state" from "scenario does not exist" in client error handling.

---

## BUG-037: Template list returns oldest-first with no default sort control

> **Note:** This bug was incorrectly filed as BUG-028 between 2026-04-01 and 2026-04-03. The correct ID is BUG-037. BUG-028 is permanently reserved for "Segment detail page crashes when segment has null predicate" (filed 2026-03-30).

**Severity:** Low
**Endpoint:** `GET /api/tenant/template`
**Status:** Open

### Setup
```bash
# Authenticate
curl -s -X POST 'https://cdpv2.ssd.uz/public/api/signin' \
  -H 'Content-Type: application/json' \
  -d '{"username":"shop2025.11.12-13:04:00@cdp.ru","password":"qwerty123","domainName":"1762934640.cdp.com"}'
# Response: {"jwtToken":"<TOKEN>"}

# Create a new template
curl -s -X POST 'https://cdpv2.ssd.uz/api/tenant/template' \
  -H 'Authorization: Bearer <TOKEN>' \
  -H 'Content-Type: application/json' \
  -d '{"content_type":"text","name":"bug037_list_test","subject":"BUG-037 Test","content":"Hello","variables":{}}'
# Response: {"id":"<TMPL_ID>"}
```

### Reproduce
```bash
# List templates — page 0 does NOT contain the newest template
curl -s 'https://cdpv2.ssd.uz/api/tenant/template?page=0&size=10' \
  -H 'Authorization: Bearer <TOKEN>'
```

**Expected:** `{"list": [...], "totalCount": N}` — the newly created template should appear on page 0 (most recently created first, DESC order).

**Actual:** Page 0 returns the 10 oldest templates. The newly created template only appears on the last page. Default sort is creation-time ASC (oldest first), which is counterintuitive for a list endpoint — users expect to see the most recent entries first. No sort parameter is exposed.

**Notes:** Compare with segmentation list which also uses oldest-first ordering. This is a UX issue across multiple list endpoints — the API lacks a `sortBy`/`sortDir` query parameter, and the hardcoded sort direction is wrong for a typical admin UI.

---

## BUG-038: Segmentation preview returns 0 for all field-type filters on fresh tenants

> **Note:** This bug was incorrectly filed as BUG-029 between 2026-04-01 and 2026-04-03. The correct ID is BUG-038. BUG-029 is permanently reserved for "Scenario save-changes returns 500" (duplicate of BUG-017, filed 2026-03-30).

**Severity:** High
**Endpoint:** `POST /api/tenants/segmentation/preview`
**Status:** FIXED (verified 2026-04-01)

### Description

On fresh tenants provisioned via signup, segmentation preview returned `numberOfCustomer: 0` for all customer field-type filters (VARCHAR, BIGINT, DOUBLE, BOOL, DATE) even after data ingestion was confirmed and UDAF probe showed materialization complete.

### Reproduce (historical — now returns correct counts)
```bash
# Step 1: Sign in to fresh tenant
curl -X POST 'https://cdpv2.ssd.uz/public/api/signin' \
  -H 'Content-Type: application/json' \
  -d '{"username":"test_user@cdp.ru","password":"qwerty123","domainName":"test_tenant.cdp.com"}'
# Response: {"jwtToken":"<token>"}

# Step 2: Preview segment filtering gender = "female" (expected: 4)
curl -X POST 'https://cdpv2.ssd.uz/api/tenants/segmentation/preview' \
  -H 'Content-Type: application/json' \
  -H 'Authorization: Bearer <token>' \
  -d '{"segmentation":{"name":"test","segments":[{"name":"S","customerProfileFilter":{"type":"group","group":{"logicalOp":"AND","negate":false,"predicates":[{"type":"condition","condition":{"param":{"kind":"field","fieldName":"col__varchar_s50000__3"},"operator":"=","value":{"string":["female"],"time":[],"float64":[],"int64":[],"bool":[]}}}]}}}]}}'
```

**Expected:** `numberOfCustomer: 4` (Alice, Carol, Grace, Hana are female)
**Actual (was):** `numberOfCustomer: 0` — consistently across all field types on fresh tenants
**Actual (now):** `numberOfCustomer: 4` — correctly returns filtered count

**Notes:** First identified in Session 1 (2026-04-01). Verified fixed in Session 4 across 3 separate fresh tenant provisions. All 17 field-type operator tests now pass. Root cause was likely a backend fix to the segmentation query builder's handling of newly provisioned tenant schemas.

---

## BUG-039: Scenario not visible in list after save-changes

> **Note:** This bug was incorrectly filed as BUG-030 between 2026-04-02 and 2026-04-03. The correct ID is BUG-039. BUG-030 is permanently reserved for "Scenario builder accepts empty name without validation" (filed 2026-03-30).

**Severity:** Medium
**Endpoint:** `GET /api/tenant/scenario/crud`
**Status:** Open

### Description

After creating a scenario, adding nodes/edges, and calling `save-changes` (which returns 204), the scenario does NOT appear in the `GET /api/tenant/scenario/crud` list. The scenario can be fetched by ID via `get-by-id`, but its `status` field remains `""` (empty). The list endpoint only returns scenarios with `status: "NEW"`. Save-changes does not update the scenario status, making saved scenarios invisible in the management view.

### Setup

```bash
# Step 1: Authenticate
curl -s -X POST 'https://cdpv2.ssd.uz/public/api/signin' \
  -H 'Content-Type: application/json' \
  -d '{"username":"shop2025.11.12-13:04:00@cdp.ru","password":"qwerty123","domainName":"1762934640.cdp.com"}'
# Response: {"jwtToken":"<TOKEN>"}

# Step 2: Create scenario
curl -X POST 'https://cdpv2.ssd.uz/api/tenant/scenario/crud' \
  -H 'Content-Type: application/json' \
  -H 'Authorization: Bearer <TOKEN>' \
  -d '{"name":"bug_039_repro"}'
# Response: {"id":"<SCENARIO_ID>","name":"bug_039_repro"}

# Step 3: Add trigger node
curl -X POST 'https://cdpv2.ssd.uz/api/tenant/scenario/node/crud' \
  -H 'Content-Type: application/json' \
  -H 'Authorization: Bearer <TOKEN>' \
  -d '{"scenarioId":"<SCENARIO_ID>","nodeType":"node_trigger","title":"Start","triggetNode":{"triggerType":"trigger_now"},"uiConfig":{"position":{"x":0,"y":0},"type":"trigger_now"}}'
# Response: {"nodeId":...}
```

### Reproduce

```bash
# Step 4: Save-changes
curl -X POST 'https://cdpv2.ssd.uz/api/tenant/scenario/crud/save-changes?scenario_id=<SCENARIO_ID>' \
  -H 'Authorization: Bearer <TOKEN>'
# Response: 204 No Content (success)

# Step 5: Check status by ID
curl 'https://cdpv2.ssd.uz/api/tenant/scenario/crud/get-by-id?scenario_id=<SCENARIO_ID>' \
  -H 'Authorization: Bearer <TOKEN>'
# Response: {"scenario": {"id":"<SCENARIO_ID>", "status": ""}, ...}
# Note: status is "" (empty), not "NEW"

# Step 6: Check scenario list
curl 'https://cdpv2.ssd.uz/api/tenant/scenario/crud?page=1&size=50' \
  -H 'Authorization: Bearer <TOKEN>'
# Response: {"list":[...scenarios with status "NEW"...], "totalCount": N}
```

**Expected:** After `save-changes` returns 204, the scenario should appear in the list with `status: "NEW"` — scenario is saved and ready to manage.

**Actual:** `status` remains `""` after save-changes; scenario does NOT appear in the `GET /api/tenant/scenario/crud` list. The totalCount increases (confirming the scenario exists), but it never appears in list results because the list filters to `status != ""`. The scenario can only be accessed by ID.

**Notes:** All 529+ existing scenarios in the shared tenant have `status: "NEW"` — these were presumably created via the frontend which may call an additional status-update endpoint that the API spec doesn't expose. No such endpoint has been discovered. Identified via scenario-execution.test.ts step 14 (consistently fails across fresh tenant runs).

---

## BUG-040: Campaign preview returns 500/EOF on fresh and shared tenants

> **Note:** This bug was incorrectly filed as BUG-031 between 2026-04-02 and 2026-04-03. The correct ID is BUG-040. BUG-031 is permanently reserved for "Duplicate 'Customers yearly income' entry in customer field dropdown" (filed 2026-03-30).

**Severity:** Critical (escalated S13)
**Endpoint:** `POST /api/tenants/campaign/compute/preview?id={campaignId}`
**Status:** ESCALATED S13 — Campaign path changed to `/campaign` (singular). Entire campaign subsystem now crashes: GET by ID → nil pointer dereference, CREATE → nil pointer dereference, preview → still broken. See BUG-050 for CRUD crash details.

### Setup
```bash
# Step 1: Authenticate
curl -s -X POST 'https://cdpv2.ssd.uz/public/api/signin' \
  -H 'Content-Type: application/json' \
  -d '{"username":"shop2025.11.12-13:04:00@cdp.ru","password":"qwerty123","domainName":"1762934640.cdp.com"}'
# Response: {"jwtToken":"<TOKEN>"}

# Step 2: Create blackhole commchan
curl -s -X POST 'https://cdpv2.ssd.uz/api/tenants/commchan' \
  -H 'Authorization: Bearer <TOKEN>' \
  -H 'Content-Type: application/json' \
  -d '{"name":"bug040_chan","kind":"blackhole","mappings":{"email":"col__varchar_s50000__5"},"chanconf":{}}'
# Response: {"id":"<CHAN_ID>", ...}

# Step 3: Verify channel
curl -s -X POST 'https://cdpv2.ssd.uz/api/tenants/commchan/<CHAN_ID>/verify' \
  -H 'Authorization: Bearer <TOKEN>' \
  -H 'Content-Type: application/json'
# Response: {"message":"","verified":true}

# Step 4: Create template
curl -s -X POST 'https://cdpv2.ssd.uz/api/tenant/template' \
  -H 'Authorization: Bearer <TOKEN>' \
  -H 'Content-Type: application/json' \
  -d '{"content_type":"html","name":"bug040_template","subject":"Test","content":"<p>Hello</p>","variables":{}}'
# Response: {"id":"<TMPL_ID>"}

# Step 5: Create campaign using an existing segmentation on shared tenant
curl -s -X POST 'https://cdpv2.ssd.uz/api/tenants/campaign' \
  -H 'Authorization: Bearer <TOKEN>' \
  -H 'Content-Type: application/json' \
  -d '{"name":"bug040_campaign","commChanId":"<CHAN_ID>","templateId":"<TMPL_ID>","includeSegment":["c3db3c3a-e50c-4118-8134-1f94618fb4ad"],"excludeSegment":[]}'
# Response: {"id":"<CAMP_ID>", ...}
```

### Reproduce
```bash
curl -s -X POST 'https://cdpv2.ssd.uz/api/tenants/campaign/compute/preview?id=<CAMP_ID>' \
  -H 'Authorization: Bearer <TOKEN>' \
  -H 'Content-Type: application/json'
```

**Expected:** `200` with `{"numberOfCustomer": N}` — campaign preview should return the count of targeted customers.

**Actual:** `500` — full response: `{"Debug":"EOF","TraceID":"42c582a7-af38-4285-af85-9cdbc32145bd"}`. The compute service returns an internal error for all campaign previews, regardless of channel type or tenant.

**Notes:** Affects both fresh provisioned tenants and the shared tenant. Tested with blackhole, webhook, and email_smtp2go_api channel types — all return 500/EOF on preview. This appears to be a compute service issue, not related to campaign configuration. Identified in campaign-send.test.ts and campaign-logic.test.ts (both guard with `if (status === 500) return;`).

---

## BUG-041: Some UDAFs on shared tenant have corrupt definitions in the database (empty aggType)

**Severity:** Medium
**Endpoint:** `POST /api/tenants/udafs/{udafId}/calculate`, `GET /api/tenants/udafs/{udafId}`
**Status:** Open

**Root cause (clarified 2026-04-03):** The initial filing incorrectly concluded the calculate endpoint was broken. Investigation revealed the UDAF used as a test probe (`1be98b63-a6af-4f5f-a01a-3df77c502ddf`) has a corrupt stored definition — its `aggType` is empty string and all fields are nil. The endpoint correctly rejects it. The calculate endpoint itself is functional (confirmed: `40ed934f-eed0-43ef-9a17-fd25501ae7af` returns 200).

The actual bug: one or more UDAFs on the shared tenant were persisted with an empty `aggType` and nil fields. This may result from a schema migration, a race condition during creation, or an old API version. Such UDAFs cannot be calculated and are permanently broken — `GET` returns them as valid objects but `calculate` always returns 500.

### Setup
```bash
TOKEN=$(curl -s -X POST 'https://cdpv2.ssd.uz/public/api/signin' \
  -H 'Content-Type: application/json' \
  -d '{"username":"shop2025.11.12-13:04:00@cdp.ru","password":"qwerty123","domainName":"1762934640.cdp.com"}' \
  | grep -o '"jwtToken":"[^"]*"' | cut -d'"' -f4)
```

### Reproduce

```bash
# Step 1: GET the corrupt UDAF — it appears valid in the list response
curl -s 'https://cdpv2.ssd.uz/api/tenants/udafs/1be98b63-a6af-4f5f-a01a-3df77c502ddf' \
  -H "Authorization: Bearer $TOKEN"
# Response includes the UDAF but aggType will be "" (empty string)

# Step 2: calculate on the corrupt UDAF — always 500
curl -s -X POST 'https://cdpv2.ssd.uz/api/tenants/udafs/1be98b63-a6af-4f5f-a01a-3df77c502ddf/calculate?primaryId=9369596935' \
  -H 'Content-Type: application/json' \
  -H "Authorization: Bearer $TOKEN"
```

**Expected (Step 1):** `GET` should either return a valid UDAF with non-empty `aggType`, or return 404/422 if the definition is corrupt.

**Actual (Step 1):** Returns 200 with what appears to be a valid UDAF object — no indication the definition is broken.

**Expected (Step 2):** The API should detect the corrupt definition at read-time and return 422 with a clear error ("UDAF definition is corrupt, please recreate").

**Actual (Step 2):** `500` with:
```json
{
  "Debug": "\n[/api.(*server).CalculateUdaf at  api.go:863]>>  failed with error: \n[/tenant.ComputeHandle.CalculateUDAF at  handle_compute.go:872]>>  failed with error: ComputeService: ComputeServiceClientImpl.CalculateUDAF failed: \n[/api.(*computeService).CalculateUDAF at  rpc-compute-service.go:97]>>  failed with error: \n[/svc.(*qbimpl).CalculateUDAF at  query_builder.go:256]>>  failed with error: \n[/querybuilder.(*UDAFQueryBuilder).Build at  udaf_builder.go:47]>>  Provided UDAF is not valid, udaf: { [] {{ <nil> <nil>} {<nil> <nil>} 0}  }, error: unsupported AggType, type: ",
  "TraceID": "ec06d415-1a4b-4c59-bc72-a64886b4f473"
}
```

Stack: `udaf_builder.go:47` — same as BUG-002's secondary issue. The compute service receives an empty UDAF struct because it was never properly stored.

**Known working UDAF for comparison:**
```bash
# This UDAF has a valid definition and calculates correctly
curl -s -X POST 'https://cdpv2.ssd.uz/api/tenants/udafs/40ed934f-eed0-43ef-9a17-fd25501ae7af/calculate?primaryId=13' \
  -H 'Content-Type: application/json' \
  -H "Authorization: Bearer $TOKEN"
# Returns 200
```

**Notes:**
- Initially misfiled as "endpoint broken" — corrected after observing that a different UDAF (`40ed934f`) returns 200
- The corrupt UDAF `1be98b63` was created by test automation at some point and stored with empty aggType — exact creation path unknown
- `GET /api/tenants/udafs/{id}` should validate and surface corrupt definitions rather than returning 200
- `npm run test:udaf:diagnostic` control check now validates `aggType` before using a UDAF as a probe, preventing false "broken" verdicts
- Related to BUG-002 secondary issue (same stack trace: `udaf_builder.go:47`) but different cause: BUG-002 is about newly created UDAFs that haven't materialized yet; BUG-041 is about permanently corrupt definitions

---

## BUG-042: Events list pagination broken — pageSize ignored, page 2 returns same rows as page 1

**Severity:** Medium
**Endpoint:** `POST /api/tenant/data/events?event_type_id=100`
**Status:** Open — filed S9

### Setup
```bash
# Step 1: Authenticate
curl -s -X POST 'https://cdpv2.ssd.uz/public/api/signin' \
  -H 'Content-Type: application/json' \
  -d '{"username":"shop2025.11.12-13:04:00@cdp.ru","password":"qwerty123","domainName":"1762934640.cdp.com"}'
# Response: {"jwtToken":"<TOKEN>"}
```

### Reproduce
```bash
# Page 1, pageSize 3
curl -s -X POST 'https://cdpv2.ssd.uz/api/tenant/data/events?event_type_id=100' \
  -H 'Authorization: Bearer <TOKEN>' \
  -H 'Content-Type: application/json' \
  -d '{"page":1,"pageSize":3,"fieldNames":["event_type"]}'
# Returns 10 rows (ignores pageSize=3)

# Page 2, pageSize 3
curl -s -X POST 'https://cdpv2.ssd.uz/api/tenant/data/events?event_type_id=100' \
  -H 'Authorization: Bearer <TOKEN>' \
  -H 'Content-Type: application/json' \
  -d '{"page":2,"pageSize":3,"fieldNames":["event_type"]}'
# Returns identical rows to page 1
```

**Expected:** `pageSize=3` returns 3 rows. Page 2 returns different rows than page 1.

**Actual:** `pageSize` is ignored (always returns 10 rows). Page 2 returns identical event composite IDs to page 1. Pagination is non-functional.

**Notes:** Discovered during event-detail test writing (S9). Similar to BUG-008 (customer V2 pagination non-deterministic without orderBy), but this affects the events list endpoint specifically, and the issue is more severe — page parameter is entirely ignored. Filed S9, regression guard in `tests_backend/event-detail.test.ts`.

---

## BUG-043: Segmentation preview permanently locked — returns 409 for all requests (REGRESSED S13, RE-FIXED S20)

**Severity:** High
**Endpoint:** `POST /api/tenants/segmentation/preview`
**Status:** RE-FIXED S20 — Deep probe on 2026-04-09 confirmed endpoint returns 200 with correct counts (347,975 customers). Lock is cleared. Concurrent requests (3 parallel) all return 200 — no race condition. The 409 only triggers when sending `{ segmentationId: ... }` without the `segmentation` wrapper (wrong schema). Root cause: the 409 was schema-triggered, not a stuck process lock.

### Setup
```bash
# Step 1: Authenticate
curl -s -X POST 'https://cdpv2.ssd.uz/public/api/signin' \
  -H 'Content-Type: application/json' \
  -d '{"username":"shop2025.11.12-13:04:00@cdp.ru","password":"qwerty123","domainName":"1762934640.cdp.com"}'
# Response: {"jwtToken":"<TOKEN>"}
```

### Reproduce
```bash
# Any segmentation preview request returns 409 conflict
curl -s -X POST 'https://cdpv2.ssd.uz/api/tenants/segmentation/preview' \
  -H 'Authorization: Bearer <TOKEN>' \
  -H 'Content-Type: application/json' \
  -d '{"combinator":"or","predicates":[]}'
# Returns: {"code":13,"data":null,"description":"segmentation preview conflict"}

# Even empty predicates (which should return total customer count) fail
curl -s -X POST 'https://cdpv2.ssd.uz/api/tenants/segmentation/preview' \
  -H 'Authorization: Bearer <TOKEN>' \
  -H 'Content-Type: application/json' \
  -d '{"combinator":"and","predicates":[{"type":"field","field":"primary_id","operator":">","value":"0"}]}'
# Same 409 response
```

**Expected:** `200` with `{"count": N}` — preview should compute and return the customer count matching the predicate.

**Actual:** `409` with `{"code":13,"data":null,"description":"segmentation preview conflict"}` for ALL requests regardless of payload, timing, or delay between requests. The per-tenant preview computation lock is permanently stuck.

**Notes:** The backend uses a per-tenant mutex/lock for segmentation preview computation. A previous preview request appears to have gotten stuck mid-execution without releasing the lock. There is no timeout or cleanup mechanism — the lock persists indefinitely. Tested with delays of 0s, 2s, 5s, 10s between requests — all 409. This is a regression from BUG-038 (which was marked FIXED in S8). The entire segmentation preview feature is non-functional on the shared tenant until backend restart or manual lock cleanup. Filed S10; regression guard in `tests_backend/segmentation-preview-correctness.test.ts`.

---

## BUG-044: Template DELETE endpoint not implemented — returns 400

**Severity:** Medium
**Endpoint:** `DELETE /api/tenant/template`
**Status:** RE-OPENED S19 — Templates endpoint returned S18. DELETE still not implemented. Path updated S25 (was /api/tenant/template/crud).

### Reproduce
```bash
curl -s -X POST 'https://cdpv2.ssd.uz/public/api/signin' \
  -H 'Content-Type: application/json' \
  -d '{"username":"shop2025.11.12-13:04:00@cdp.ru","password":"qwerty123","domainName":"1762934640.cdp.com"}'

# Create a template first
curl -s -X POST 'https://cdpv2.ssd.uz/api/tenant/template' \
  -H 'Authorization: Bearer <TOKEN>' \
  -H 'Content-Type: application/json' \
  -d '{"template_name":"to_delete","content_type":"text/html","content":"<p>test</p>","variables":[]}'
# Returns: {"id":"<UUID>", ...}

# DELETE — fails
curl -s -X DELETE 'https://cdpv2.ssd.uz/api/tenant/template' \
  -H 'Authorization: Bearer <TOKEN>' \
  -H 'Content-Type: application/json' \
  -d '{"id":"<UUID>"}'
# Returns: {"error":"method not allowed"} HTTP 400
```

**Expected:** `200` or `204` — template deleted.

**Actual:** `400` with `{"error":"method not allowed"}`. Same pattern as scenario DELETE (BUG-033) and commchan DELETE.

**Notes:** DELETE is unimplemented for templates, scenarios, and commchans — a systemic pattern across the entire API. Filed S10.

---

## BUG-045: Template CREATE with empty content crashes with 500

**Severity:** Medium
**Endpoint:** `POST /api/tenant/template`
**Status:** RE-OPENED S18 — Templates endpoint returned S18. Empty content still causes 500. Path updated S25 (was /api/tenant/template/crud).

### Reproduce
```bash
curl -s -X POST 'https://cdpv2.ssd.uz/api/tenant/template' \
  -H 'Authorization: Bearer <TOKEN>' \
  -H 'Content-Type: application/json' \
  -d '{"template_name":"empty_body","content_type":"text/html","content":"","variables":[]}'
# Returns: 500 Internal Server Error
```

**Expected:** `400` — empty content should be rejected with a validation error.

**Actual:** `500` — server crashes. The backend doesn't validate empty content before processing.

**Notes:** Empty template_name is accepted (200), but empty content causes a crash. Filed S10.

---

## BUG-046: UDAF RELATIVE timeWindow silently stored as empty object

**Severity:** High
**Endpoint:** `POST /api/tenants/udafs` + `GET /api/tenants/udafs/{id}`
**Status:** PARTIALLY FIXED (S12) — New RELATIVE UDAFs now persist correctly (verified round-trip). Old UDAFs created before the fix still show `timeWindow: {}` (non-retroactive). ABSOLUTE timeWindow also works now — uses `absoluteTime` field name.
**Status:** Open — filed S11

### Reproduce
```bash
# Create a SUM UDAF with RELATIVE 30-day window
curl -s -X POST 'https://cdpv2.ssd.uz/api/tenants/udafs' \
  -H 'Authorization: Bearer <TOKEN>' \
  -H 'Content-Type: application/json' \
  -d '{"name":"test_rel_probe","aggType":"SUM","params":[{"displayName":"Total Price","fieldName":"col__double__0","mfieldId":"c9fc80bc-dad2-49bb-a158-9009a2c27b9d"}],"filter":{"eventType":{"id":100,"name":"purchase"},"predicate":{"type":"group","group":{"logicalOp":"AND","predicates":[],"negate":false}},"timeWindow":{"type":"RELATIVE","days":30}},"grouping":{"enable":false}}'
# Returns 200 with id

# GET the created UDAF
curl -s 'https://cdpv2.ssd.uz/api/tenants/udafs/<id>' -H 'Authorization: Bearer <TOKEN>'
# Returns: filter.timeWindow = {} (empty object, not {"type":"RELATIVE","days":30})
```

**Expected:** `GET` returns `filter.timeWindow` as `{"type":"RELATIVE","days":30}`.

**Actual:** `filter.timeWindow` is stored as `{}`. The RELATIVE configuration is silently discarded. This is **silent data corruption** — API returns 200, no error, but the configuration is lost.

**Impact:** This likely explains BUG-002 behavior. If RELATIVE windows are never stored, compute treats all UDAFs as ALL_TIME, which would produce different values than expected. The root cause may be in the serialization layer rather than udaf_builder.go cutoff direction as previously hypothesized.

**Notes:** Filed S11. Needs investigation: does this affect ABSOLUTE timeWindow too? Does it happen on PUT (update) as well?

---

## BUG-047: UDAF CREATE with non-UUID mfieldId crashes with 500

**Severity:** Medium
**Endpoint:** `POST /api/tenants/udafs`
**Status:** Open — filed S11

### Reproduce
```bash
curl -s -X POST 'https://cdpv2.ssd.uz/api/tenants/udafs' \
  -H 'Authorization: Bearer <TOKEN>' \
  -H 'Content-Type: application/json' \
  -d '{"name":"test_bad_mfield","aggType":"SUM","params":[{"displayName":"Fake","fieldName":"col__double__0","mfieldId":"not-a-uuid"}],"filter":{"eventType":{"id":100,"name":"purchase"},"predicate":{"type":"group","group":{"logicalOp":"AND","predicates":[],"negate":false}},"timeWindow":{}},"grouping":{"enable":false}}'
# Returns: 500 Internal Server Error
```

**Expected:** `400` or `409` — invalid UUID format should be caught by validation.

**Actual:** `500` — backend crashes trying to parse "not-a-uuid" as UUID. A zero-UUID (00000000-0000-0000-0000-000000000000) is accepted without error (IMP-10 pattern).

**Notes:** Filed S11. Part of the systemic zero-validation pattern (IMP-10).

---

## BUG-048: Webhook commchan stores credentials in URL as plaintext

**Severity:** Low (internal ERP, but worth documenting)
**Endpoint:** `POST /api/tenants/commchan` + `GET /api/tenants/commchan/{id}`
**Status:** Open — filed S11

### Reproduce
```bash
# Create webhook with embedded credentials
curl -s -X POST 'https://cdpv2.ssd.uz/api/tenants/commchan' \
  -H 'Authorization: Bearer <TOKEN>' \
  -H 'Content-Type: application/json' \
  -d '{"name":"cred_test","kind":"webhook","chanconf":{"url":"http://user:secret@10.0.0.1/hook","method":"POST","batch_size":"250"},"mappings":{}}'
# Returns 200 with full chanconf visible

# GET by ID
curl -s 'https://cdpv2.ssd.uz/api/tenants/commchan/<id>' -H 'Authorization: Bearer <TOKEN>'
# Returns: chanconf.url = "http://user:secret@10.0.0.1/hook" — credentials in plaintext
```

**Expected:** Either reject URLs with embedded credentials, or strip/mask them in GET responses.

**Actual:** Credentials stored as-is and returned verbatim via API. Also accepts ftp:// URLs and localhost URLs (SSRF potential).

**Notes:** Filed S11. Low severity for internal ERP. Also documented: ftp:// accepted, localhost SSRF possible.

---

## BUG-049: UDAF calculate universally broken — "unsupported AggType" for ALL UDAFs

**Severity:** Critical
**Endpoint:** `POST /api/tenants/udafs/{id}/calculate?primaryId={N}`
**Status:** RESOLVED S27 — Fully fixed as of 2026-04-13. S27 characterization probed 15 UDAFs across all shapes (COUNT/SUM/AVG/MIN/MAX, RELATIVE/ABSOLUTE/no time window, grouped/ungrouped, old S15-era and new S23-era). All return HTTP 200. Only nonexistent UUIDs produce the "unsupported AggType" 500 (empty struct to compute service — expected behavior). Previous history: REGRESSED S20 (was partially fixed S15-S19), universally broken S13-S14.

### Reproduce
```bash
# Step 1: List UDAFs and pick any ID
curl -s 'https://cdpv2.ssd.uz/api/tenants/udafs?page=1&size=1' \
  -H 'Authorization: Bearer <TOKEN>'
# Pick any UDAF ID — ALL fail

# Step 2: Calculate
curl -s -X POST 'https://cdpv2.ssd.uz/api/tenants/udafs/<UDAF_ID>/calculate?primaryId=1' \
  -H 'Authorization: Bearer <TOKEN>' \
  -H 'Content-Type: application/json' -d '{}'
```

**Expected:** `200` with calculated UDAF value for the given customer.

**Actual:** `500` with:
```json
{"Debug":"...[/querybuilder.(*UDAFQueryBuilder).Build at  udaf_builder.go:47]>> Provided UDAF is not valid, udaf: { [] {{ <nil> <nil>} {<nil> <nil>} 0}  }, error: unsupported AggType, type: ","TraceID":"..."}
```

**Root cause:** The compute service receives an empty UDAF struct (aggType is empty string). The API stores `aggType: "COUNT"` correctly (verified via GET), but the compute service's struct deserialization appears broken. Likely related to the `udafType` → `aggType` field rename — the API layer was updated but the compute query builder still reads the old field name.

**Impact:** ALL UDAF-dependent features are broken: UDAF calculate, any segmentation preview with UDAF predicates, campaign targeting with UDAFs.

**Notes:** This is a regression — UDAF calculate worked in S11. ~~Tested with both old and newly created UDAFs. Affects all aggTypes.~~ **UPDATE S15:** Partially fixed. A small subset of pre-existing UDAFs (e.g. `75185a40-...` created ~19:49 UTC) now return 200 with correct results. Newly created UDAFs still fail. Likely: compute service was updated to handle new field format but only for UDAFs already materialized in its cache.

---

## BUG-050: Campaign GET/CREATE crashes with nil pointer dereference

**Severity:** Critical
**Endpoint:** `GET /api/tenants/campaign/{id}`, `POST /api/tenants/campaign`
**Status:** RESOLVED S28 — Campaign GET by ID returns 200 with full payload (commChan, includeSegment, template all populated). CREATE returns 200 when prerequisites are valid (verified commchan + segmentation with real inner segments + template). The nil pointer crash has been patched; what S22-S27 observed as crashes were in fact precondition failures (unverified commchan → 409, missing inner segment IDs → 409). Reproduction curl from S28: `POST /api/tenants/campaign` with `{name, templateId, commChanId, includeSegment:[innerSegId], excludeSegment:[]}` → 200. `GET /api/tenants/campaign/{id}` → 200. Campaign SEND still returns 409 "invalid column mappings" (BUG-031 territory — requires specific-fields configuration, blocked by BUG-076).

### Reproduce
```bash
# GET by ID — crashes
curl -s 'https://cdpv2.ssd.uz/api/tenants/campaign/93f9924f-5599-4ae5-bf38-faa00e1a2a35' \
  -H 'Authorization: Bearer <TOKEN>'
# Returns: {"debug":"invalid memory address or nil pointer dereference","error":"internal server error"}

# CREATE with valid payload — also crashes
# First get a commchan ID and create a segmentation with inner segment ID
curl -s -X POST 'https://cdpv2.ssd.uz/api/tenants/campaign' \
  -H 'Authorization: Bearer <TOKEN>' \
  -H 'Content-Type: application/json' \
  -d '{"name":"test","commChanId":"f91eccdc-f18e-4e7f-bbfa-aeef6b060d4a","includeSegment":["<inner_segment_id>"],"excludeSegment":[]}'
# Returns: {"debug":"invalid memory address or nil pointer dereference","error":"internal server error"}
```

**Expected:** `200` with campaign detail / created campaign.

**Actual:** `500` — nil pointer dereference in campaign handler.

**Notes:** Campaign list (`GET /api/tenants/campaign`) works. Path changed from `/campaigns` (plural) to `/campaign` (singular). The schema also changed: now requires `commChanId`, `includeSegment` (array of inner segment IDs), `excludeSegment` (array). But even with correct payload, CREATE crashes. Escalation of BUG-040 — the entire campaign subsystem is now broken at CRUD level, not just preview.

---

## BUG-051: Customer/Events list endpoints changed from GET to POST (breaking change)

**Severity:** Medium (API contract change)
**Endpoints:** `POST /api/tenant/data/customers`, `POST /api/tenant/data/events`
**Status:** Open — filed S13 (breaking API change, not a bug per se)

### Details
```bash
# OLD (broken):
curl -s 'https://cdpv2.ssd.uz/api/tenant/data/customers?size=1&page=1' \
  -H 'Authorization: Bearer <TOKEN>'
# Returns: 400 {"error":"method not allowed"}

# NEW (works):
curl -s -X POST 'https://cdpv2.ssd.uz/api/tenant/data/customers?size=1&page=1' \
  -H 'Authorization: Bearer <TOKEN>' \
  -H 'Content-Type: application/json' \
  -d '{"fieldNames":["col__varchar_s50000__0"]}'
# Returns: 200 {"list":[...],"schema":{...},"totalCount":344624}

# Events also requires event_type_id:
curl -s -X POST 'https://cdpv2.ssd.uz/api/tenant/data/events?size=1&page=1&event_type_id=100' \
  -H 'Authorization: Bearer <TOKEN>' \
  -H 'Content-Type: application/json' \
  -d '{"fieldNames":["col__varchar_s50000__0"]}'
```

**Notes:** Customer field names changed from friendly (`customer_name_first`) to internal column format (`col__varchar_s50000__0`). Response key is `primary_id` (with underscore). This is an intentional API restructuring — documenting for test maintenance.

---

## BUG-052: Schema fields stuck in `field_not_ready` — no cleanup path

**Severity:** High
**Endpoints:** `GET /api/tenants/schema/customers/fields` (symptom), `DELETE /api/tenants/schema/draft-schema/cancel` (no-op for this state), `POST /api/tenants/schema/draft-schema/apply` (blocked)
**Status:** Open — filed S14. **DIAGNOSIS REVISED S30/S31.** Originally thought to be cancellable drafts stuck; actually `field_not_ready` orphans in the field lifecycle with no cleanup API.

### Revised understanding (S30-C3)
The counter returned by `draft-schema/status` (currently `numberOfChanges: 59`) does **not** represent cancellable drafts. Enumerating `/api/tenants/schema/customers/fields` reveals:
- 83 fields with `status: field_ready`
- **60 fields with `status: field_not_ready`** — almost exactly matches the 59 counter

These are schema fields that historical test suites CREATEd but which never advanced from `field_not_ready` to `field_ready`. `draft-schema/cancel` returns 200 because it has no *true* drafts to cancel — the 60 not_ready fields are beyond the cancel path's reach. `draft-schema/apply` returns 409 because these field-lifecycle orphans block new plan completion.

### Details
```bash
# The status counter
curl -s 'https://cdpv2.ssd.uz/api/tenants/schema/draft-schema/status' \
  -H 'Authorization: Bearer <TOKEN>'
# → {"numberOfChanges":59}

# The underlying reality: enumerate fields
curl -s 'https://cdpv2.ssd.uz/api/tenants/schema/customers/fields?size=200' \
  -H 'Authorization: Bearer <TOKEN>' \
  | jq '.list | group_by(.status) | map({status: .[0].status, count: length})'
# → [{"status":"field_not_ready","count":60},{"status":"field_ready","count":83}]

# Cancel: 200 but no effect (nothing for it to cancel — no true drafts)
curl -s -X DELETE 'https://cdpv2.ssd.uz/api/tenants/schema/draft-schema/cancel' \
  -H 'Authorization: Bearer <TOKEN>'
# → 200 (counter stays at 59)

# Apply: blocked
curl -s -X POST 'https://cdpv2.ssd.uz/api/tenants/schema/draft-schema/apply' \
  -H 'Authorization: Bearer <TOKEN>'
# → 409 {"code":5,"description":"uncompleted plans exists"}

# No /draft-schema/list endpoint exists (all 3 variants 404).
```

```bash
# Check status — shows 2 stuck changes
curl -s 'https://cdpv2.ssd.uz/api/tenants/schema/draft-schema/status' \
  -H 'Authorization: Bearer <TOKEN>' -H 'X-Tenant-Id: 1762934640267'
# Returns: {"numberOfChanges":2}

# Cancel returns 200 but doesn't actually clear:
curl -s -X DELETE 'https://cdpv2.ssd.uz/api/tenants/schema/draft-schema/cancel' \
  -H 'Authorization: Bearer <TOKEN>' -H 'X-Tenant-Id: 1762934640267'
# Returns: 200 (but numberOfChanges stays at 2)

# Apply fails with 409:
curl -s -X POST 'https://cdpv2.ssd.uz/api/tenants/schema/draft-schema/apply' \
  -H 'Authorization: Bearer <TOKEN>' -H 'X-Tenant-Id: 1762934640267'
# Returns: 409 {"code":5,"data":null,"description":"uncompleted plans exists"}

# POST cancel also broken (was POST, now DELETE):
curl -s -X POST 'https://cdpv2.ssd.uz/api/tenants/schema/draft-schema/cancel' \
  -H 'Authorization: Bearer <TOKEN>' -H 'X-Tenant-Id: 1762934640267'
# Returns: 400 {"error":"method not allowed"}
```

**Impact:** All schema lifecycle tests that expect `numberOfChanges == 0` fail. 9 test failures in schema-lifecycle.test.ts and schema-apply-verify.test.ts are caused by this stuck state. Also blocks new legitimate schema changes from ever applying.

**Root cause hypothesis (S30):**
The schema apply pipeline leaves fields in `field_not_ready` when the apply step partially fails or times out. No cleanup API exists for this state — `/draft-schema/cancel` only operates on true draft rows, not on orphan not_ready fields. Tests that CREATE schema fields and then the apply step fails for any reason accumulate these orphans permanently.

**Fix suggestion:**
1. Add an admin endpoint to purge `field_not_ready` fields (e.g., `DELETE /api/tenants/schema/customers/fields?status=field_not_ready`).
2. Or: make `/draft-schema/cancel` operate transitively — also purge orphan not_ready fields.
3. Make `/apply` idempotent on partial failure — either complete fully or roll back to pre-apply state so no orphans accumulate.

**Notes:**
- Diagnosis revised S30-C3: this is NOT a cancellable-draft bug (cancel no-op is correct for this state).
- IMP-53 (S29 draft-cancel no-op) merged into this bug — same root cause, different symptom framing.
- Counter drift (2 → 59) across sessions confirms orphans accumulate over time with each failed apply.
- Original filing S14; revised S30/S31.
- Ask devs: admin endpoint for purging `field_not_ready` OR is DB-level cleanup required?

---

## BUG-053: UDAF path renamed from singular to plural (breaking change)

**Severity:** Medium (API contract change)
**Endpoints:** `/api/tenants/udafs` (was `/api/tenants/udaf`)
**Status:** Open — filed S14

### Details
```bash
# OLD (broken):
curl -s 'https://cdpv2.ssd.uz/api/tenants/udaf' \
  -H 'Authorization: Bearer <TOKEN>' -H 'X-Tenant-Id: 1762934640267'
# Returns: 404 {"error":"no matching operation was found"}

# NEW (works):
curl -s 'https://cdpv2.ssd.uz/api/tenants/udafs' \
  -H 'Authorization: Bearer <TOKEN>' -H 'X-Tenant-Id: 1762934640267'
# Returns: 200 {"items":[...]}
```

**Additional contract changes:**
- List response changed from bare array to `{items:[...]}`
- CREATE schema changed: `eventType.id` (number) replaces `eventTypeId` (string)
- Calculate moved from `POST /api/tenants/udaf/calculate` (body: `{udafId}`) to `POST /api/tenants/udafs/{id}/calculate?primaryId=N` (RESTful)
- No totalCount in list response

**Notes:** Tests already updated to use new paths. Documenting for changelog tracking.

---

## BUG-054: Scenario GET/PUT/DELETE by ID broken — only list+create work

**Severity:** High
**Endpoints:** `GET/PUT/DELETE /api/tenant/scenario/crud/{id}`
**Status:** Open — filed S14 (regression from S7 when GET by ID worked via query param)

### Details
```bash
# List works:
curl -s 'https://cdpv2.ssd.uz/api/tenant/scenario/crud?page=0&size=1' \
  -H 'Authorization: Bearer <TOKEN>' -H 'X-Tenant-Id: 1762934640267'
# Returns: 200 {"list":[...],"totalCount":N}

# Create works:
curl -s -X POST 'https://cdpv2.ssd.uz/api/tenant/scenario/crud' \
  -H 'Authorization: Bearer <TOKEN>' -H 'X-Tenant-Id: 1762934640267' \
  -H 'Content-Type: application/json' -d '{"name":"test"}'
# Returns: 200 {"id":"...","name":"test"}

# GET by ID (RESTful) BROKEN:
curl -s 'https://cdpv2.ssd.uz/api/tenant/scenario/crud/<UUID>' \
  -H 'Authorization: Bearer <TOKEN>' -H 'X-Tenant-Id: 1762934640267'
# Returns: 404 {"error":"no matching operation was found"}

# GET by ID (query param) STILL WORKS:
curl -s 'https://cdpv2.ssd.uz/api/tenant/scenario/crud/get-by-id?scenario_id=<UUID>' \
  -H 'Authorization: Bearer <TOKEN>' -H 'X-Tenant-Id: 1762934640267'
# Returns: 200 {"scenario":{...},"nodes":[],"edges":[]}
```

**Notes:** The RESTful `/{id}` pattern was never the canonical path — the query-param style `/get-by-id?scenario_id=` still works. The OpenAPI filter rejects the RESTful path. PUT and DELETE by ID are genuinely unimplemented (BUG-033 for DELETE was already filed). This bug documents the full scope.

---

## BUG-055: CommChan verify endpoint removed — returns 400 method not allowed

**Severity:** Medium
**Found:** Session 15 (2026-04-07)
**Status:** Open

**Description:** `POST /api/tenants/commchan/verify` now returns 400 "method not allowed". Was functional in S11 (used to verify commchan connectivity). No replacement endpoint found.

**Reproduction:**

```bash
curl -sk -X POST "$BASE/api/tenants/commchan/verify" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"commChanId":"f91eccdc-f18e-4e7f-bbfa-aeef6b060d4a"}'
# Expected: 200 + verification result
# Actual:   400 {"error":"method not allowed"}
```

**Notes:** Part of the ongoing API restructuring. The verify endpoint may have been merged or removed entirely. CommChan list and GET-by-id still work. CREATE works with new schema.

---

## BUG-056: CommChan CREATE rejects old schema — requires chanconf + mappings

**Severity:** Medium
**Found:** Session 15 (2026-04-07)
**Status:** Open

**Description:** `POST /api/tenants/commchan` now requires `chanconf` and `mappings` fields in the request body. The old schema `{name, kind}` is rejected by OpenAPI validation. This is a breaking API change.

**Reproduction:**

```bash
# Old schema (FAILS):
curl -sk -X POST "$BASE/api/tenants/commchan" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"name":"test","kind":"blackhole"}'
# Actual: 400 "doesn't match schema #/components/schemas/..."

# New schema (WORKS):
curl -sk -X POST "$BASE/api/tenants/commchan" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"name":"test","kind":"blackhole","chanconf":{},"mappings":{}}'
# Returns: 200 + created channel object
```

**Notes:** For webhook kind, `chanconf` should contain `{url, method, batch_size}`. For blackhole, empty `{}` works. The `mappings` field accepts `{}`.

---

## BUG-057: Predicate group schema changed `operator` → `logicalOp` (breaking change)

**Severity:** Medium
**Endpoint:** All endpoints accepting predicate groups (UDAF CREATE, Segmentation CREATE)
**Status:** Open — filed S15 (API contract change)
**Found:** 2026-04-07

### Reproduce
```bash
# Old schema (BROKEN):
curl -sk -X POST "$BASE/api/tenants/udafs" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"name":"test","aggType":"COUNT","params":[],"filter":{"eventType":{"id":100},"predicate":{"type":"group","group":{"operator":"AND","predicates":[]}},"timeWindow":{}},"grouping":{"enable":false}}'
# Actual: 400 "property "logicalOp" is missing"

# New schema (WORKS):
# Change "operator" to "logicalOp" in predicate.group
```

**Expected:** `operator` field accepted (backward compatible).
**Actual:** 400 validation error — field renamed to `logicalOp`.

**Notes:** Part of ongoing RESTful migration (IMP-22). Affects UDAF and segmentation creates. Also adds `negate: false` to group responses.

---

## BUG-058: Campaign CREATE schema expanded — requires commChanId, includeSegment, excludeSegment

**Severity:** Medium
**Endpoint:** `POST /api/tenants/campaign`
**Status:** Open — filed S15 (API contract change). Campaign still crashes (BUG-050) even with correct schema.
**Found:** 2026-04-07

### Reproduce
```bash
# Old schema (BROKEN):
curl -sk -X POST "$BASE/api/tenants/campaign" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"name":"test","segmentationId":"UUID"}'
# Actual: 400 "property "commChanId" is missing"

# New required fields: commChanId (string), includeSegment (array), excludeSegment (array)
# Even with all required fields, CREATE still crashes with nil pointer (BUG-050)
```

**Notes:** Schema got stricter but backend still crashes before processing. BUG-050 remains the blocking issue.

---

## BUG-059: Scenario node titles silently dropped — stored as empty string

**Severity:** Medium
**Endpoint:** `POST /api/tenant/scenario/node/crud` + `PUT /api/tenant/scenario/crud/save-changes`
**Status:** Open — filed S16
**Found:** 2026-04-07

### Reproduce
```bash
# Step 1: Create scenario
curl -s -X POST "$BASE/api/tenant/scenario/crud" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"name":"bug059_test_'$(date +%s)'"}'
# Returns: {"id":"<SCENARIO_ID>", ...}

# Step 2: Add a trigger node with title
curl -s -X POST "$BASE/api/tenant/scenario/node/crud" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"scenarioId":"<SCENARIO_ID>","nodeType":"node_trigger","title":"My Trigger Title","positionX":100,"positionY":200}'
# Returns: node with title

# Step 3: Save changes
curl -s -X PUT "$BASE/api/tenant/scenario/crud/save-changes" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"scenarioId":"<SCENARIO_ID>"}'

# Step 4: Retrieve scenario
curl -s "$BASE/api/tenant/scenario/crud/get-by-id?scenario_id=<SCENARIO_ID>" \
  -H "Authorization: Bearer $TOKEN"
# Node title is "" (empty string), not "My Trigger Title"
```

**Expected:** Node title should persist as "My Trigger Title"
**Actual:** Node title stored as empty string ""

**Notes:** Titles sent on node creation are silently dropped. This is a data loss issue — the UI may set titles that are never persisted.

---

## BUG-060: Scenario save-changes with edges takes ~30s (severe perf degradation)

**Severity:** Medium
**Endpoint:** `PUT /api/tenant/scenario/crud/save-changes`
**Status:** Open — filed S16
**Found:** 2026-04-07

### Reproduce
```bash
# Create scenario with 2 nodes, add an edge between them
# Save-changes with nodes only: ~50ms
# Save-changes after adding edge: ~30s

# The performance degradation appears to be triggered by the edge connection.
# Node-only saves are fast; edge saves are 600x slower.
```

**Expected:** Save-changes should complete in <1s regardless of edge count
**Actual:** ~30s response time when edges are present

**Notes:** Could be a graph traversal or validation issue triggered by edge connections. Not a functional bug but may cause timeouts in production use.

---

## BUG-061: CommChan webhook requires undocumented `method` field in chanconf

**Severity:** Medium
**Endpoint:** `POST /api/tenants/commchan`
**Status:** Open — filed S16
**Found:** 2026-04-07

### Reproduce
```bash
# Without method field — fails with generic 409
curl -s -X POST "$BASE/api/tenants/commchan" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"kind":"webhook","name":"test","chanconf":{"url":"http://example.com","batch_size":"10"},"mappings":{}}'
# Actual: 409 "not valid" — no indication that method is missing

# With method field — works
curl -s -X POST "$BASE/api/tenants/commchan" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"kind":"webhook","name":"test","chanconf":{"url":"http://example.com","batch_size":"10","method":"POST"},"mappings":{}}'
# Actual: 200
```

**Expected:** Either (a) `method` should be documented as required, or (b) the 409 error should specify which field is missing
**Actual:** Generic 409 with no field-level error detail

**Notes:** `method` is silently required for webhook kind. Valid values likely include "POST", "GET", etc. The 409 error message gives no hint about the missing field, making debugging difficult.

---

## ~~BUG-062~~: RETRACTED — Autocomplete schema was not properly documented

**Status:** RETRACTED S16 — Not a bug. The autocomplete endpoint works correctly with `table`, `field`, `value` params. Our earlier documentation used wrong param names (`field_name` instead of `field`). Endpoint is fully functional.

---

## BUG-063: Emoji characters stored as "????" (mojibake) in scenario and segmentation names

**Severity:** Medium
**Endpoint:** `POST /api/tenant/scenario/crud`, `POST /api/tenants/segmentation`
**Status:** Open — filed S17
**Root cause:** Database charset is `utf8` (3-byte) not `utf8mb4` (4-byte), silently truncating 4-byte Unicode codepoints.

**Reproduce:**
```bash
# Scenario with emoji name
curl -s -X POST 'https://cdpv2.ssd.uz/api/tenant/scenario/crud' \
  -H 'Authorization: Bearer <TOKEN>' \
  -H 'Content-Type: application/json' \
  -d '{"name":"🎯🔥"}'
# Returns: {"id":"...","name":"????"}
```

**Expected:** Emoji characters stored and returned correctly (e.g., `"🎯🔥"`)
**Actual:** Emojis replaced with `"????"` — data loss

**Notes:** Affects at least scenarios and segmentations. Likely any text column. Single infrastructure fix (change charset to utf8mb4) would resolve everywhere.

---

## BUG-064: BUG-030 fix incomplete — whitespace-only scenario names accepted

**Severity:** Low
**Endpoint:** `POST /api/tenant/scenario/crud`
**Status:** Open — filed S17

**Reproduce:**
```bash
curl -s -X POST 'https://cdpv2.ssd.uz/api/tenant/scenario/crud' \
  -H 'Authorization: Bearer <TOKEN>' \
  -H 'Content-Type: application/json' \
  -d '{"name":"   "}'
# Returns: 200 {"id":"...","name":"   "}
```

**Expected:** Whitespace-only names rejected (400) — same as empty string
**Actual:** Accepted (200) because validation only checks `len >= 3`, not content

**Notes:** The BUG-030 fix added a minimum length check but not a whitespace trim or content validation. Tab-only and single-space names are rejected (< 3 chars), but 3+ spaces pass.

---

## BUG-065: File upload accepts negative/zero sizeBytes and any file extension

**Severity:** Low (internal ERP)
**Endpoint:** `POST /api/file/upload/init`
**Status:** Open — filed S17

**Reproduce:**
```bash
# Negative sizeBytes
curl -s -X POST 'https://cdpv2.ssd.uz/api/file/upload/init' \
  -H 'Authorization: Bearer <TOKEN>' \
  -H 'Content-Type: application/json' \
  -d '{"fileName":"test.csv","fileExtension":"csv","sizeBytes":-1,"tag":"uploads"}'
# Returns: 200 {"objectId":"..."}

# .exe extension
curl -s -X POST 'https://cdpv2.ssd.uz/api/file/upload/init' \
  -H 'Authorization: Bearer <TOKEN>' \
  -H 'Content-Type: application/json' \
  -d '{"fileName":"malware.exe","fileExtension":"exe","sizeBytes":100,"tag":"uploads"}'
# Returns: 200 {"objectId":"..."}
```

**Expected:** Negative sizeBytes rejected; dangerous extensions (.exe) filtered
**Actual:** Both accepted without validation

---

## BUG-066: Customer ingest accepts boolean and string primary_id via silent coercion

**Severity:** Low
**Endpoint:** `POST /cdp-ingest/ingest/tenant/{tenantId}/async/customers`
**Status:** Open — filed S17

**Reproduce:**
```bash
TENANT_ID=1762934640267
# Boolean primary_id
curl -s -X POST "https://cdpv2.ssd.uz/cdp-ingest/ingest/tenant/$TENANT_ID/async/customers" \
  -H 'Content-Type: application/json' \
  -d '[{"primary_id":true}]'
# Returns: {"accepted":1,...} — true → 1

# String primary_id
curl -s -X POST "https://cdpv2.ssd.uz/cdp-ingest/ingest/tenant/$TENANT_ID/async/customers" \
  -H 'Content-Type: application/json' \
  -d '[{"primary_id":"99999999999"}]'
# Returns: {"accepted":1,...}
```

**Expected:** Non-integer primary_id rejected with type error
**Actual:** Silently coerced — boolean `true` → `1`, strings → parsed integer

---

## BUG-067: Template CREATE uses `name` but GET/LIST returns `template_name` — naming inconsistency

**Severity:** Low
**Endpoints:** `POST /api/tenant/template` (create), `GET /api/tenant/template/{id}` (read)
**Status:** Open — filed S19

### Reproduce
```bash
# Create with 'name'
curl -s -X POST 'https://cdpv2.ssd.uz/api/tenant/template' \
  -H "Authorization: Bearer $TOKEN" \
  -H 'Content-Type: application/json' \
  -d '{"name":"test_naming","subject":"s","content_type":"html","content":"<p>x</p>","variables":{}}'
# Returns: {"id":"<UUID>"}

# GET back
curl -s "https://cdpv2.ssd.uz/api/tenant/template/<UUID>" \
  -H "Authorization: Bearer $TOKEN"
# Returns: {"template_name":"test_naming",...} — note: 'template_name' not 'name'

# CREATE with old field 'template_name' → rejected
curl -s -X POST 'https://cdpv2.ssd.uz/api/tenant/template' \
  -H "Authorization: Bearer $TOKEN" \
  -H 'Content-Type: application/json' \
  -d '{"template_name":"test","subject":"s","content_type":"html","content":"<p>x</p>","variables":{}}'
# Returns: 400 — property "name" is missing
```

**Expected:** Same field name in request and response
**Actual:** CREATE requires `name`, but GET/LIST return `template_name`

---

## BUG-068: Scenario GET-by-id returns empty status while list returns "NEW"

**Severity:** Medium
**Endpoints:** `GET /api/tenant/scenario/crud/get-by-id`, `GET /api/tenant/scenario/crud` (list)
**Status:** DUPLICATE of BUG-034 — same root cause (status field inconsistency between list and get-by-id). Marked S25.

### Reproduce
```bash
# Create scenario
curl -s -X POST 'https://cdpv2.ssd.uz/api/tenant/scenario/crud' \
  -H "Authorization: Bearer $TOKEN" \
  -H 'Content-Type: application/json' \
  -d '{"name":"test_status_check"}'

# List → status is "NEW"
curl -s 'https://cdpv2.ssd.uz/api/tenant/scenario/crud' \
  -H "Authorization: Bearer $TOKEN"
# {"list":[{"id":"<UUID>","name":"test_status_check","status":"NEW",...}]}

# GET-by-id → status is ""
curl -s 'https://cdpv2.ssd.uz/api/tenant/scenario/crud/get-by-id?scenario_id=<UUID>' \
  -H "Authorization: Bearer $TOKEN"
# {"scenario":{"status":""},...}
```

**Expected:** GET-by-id should return `status: "NEW"` (same as list)
**Actual:** GET-by-id returns `status: ""` (empty string)

---

## BUG-069: Campaign and Template lists have no pagination — only return 10 oldest items

**Severity:** Medium
**Endpoints:** `GET /api/tenants/campaign`, `GET /api/tenant/template`
**Status:** Open — filed S19

### Reproduce
```bash
# Campaign list
curl -s 'https://cdpv2.ssd.uz/api/tenants/campaign' \
  -H "Authorization: Bearer $TOKEN"
# Returns 10 items, oldest first, newly created campaigns don't appear

# Template list  
curl -s 'https://cdpv2.ssd.uz/api/tenant/template' \
  -H "Authorization: Bearer $TOKEN"
# Returns 10 items, no size/page params accepted
```

**Expected:** Pagination support (size/page) and newest-first sort, or at minimum return all items
**Actual:** Fixed 10 items, oldest-first sort, no pagination control. New items invisible in list.
**Notes:** Similar to existing BUG-037 (template sort). Affects campaign testing — can't verify new campaign appears in list.

---

## BUG-050 UPDATE (S19): templateId is required — nil pointer without it

**Additional finding (S19):** Campaign CREATE crashes with nil pointer dereference specifically when `templateId` is omitted from the request body. With `templateId` provided, CREATE succeeds and returns full campaign object. The OpenAPI schema does not mark `templateId` as required.

```bash
# CRASHES (no templateId)
curl -s -X POST 'https://cdpv2.ssd.uz/api/tenants/campaign' \
  -H "Authorization: Bearer $TOKEN" \
  -H 'Content-Type: application/json' \
  -d '{"name":"test","commChanId":"<UUID>","includeSegment":["<inner-seg-UUID>"],"excludeSegment":[]}'
# Returns: 500 {"debug":"invalid memory address or nil pointer dereference"}

# WORKS (with templateId)
curl -s -X POST 'https://cdpv2.ssd.uz/api/tenants/campaign' \
  -H "Authorization: Bearer $TOKEN" \
  -H 'Content-Type: application/json' \
  -d '{"name":"test","commChanId":"<UUID>","templateId":"<template-UUID>","includeSegment":["<inner-seg-UUID>"],"excludeSegment":[]}'
# Returns: 200 {full campaign object}
```

---

## BUG-044 UPDATE (S19): Template DELETE still broken — templates are back

**Status change:** Was marked MOOT (S13) when templates were 404. Templates returned in S18. DELETE still returns 400 "method not allowed" — un-mooting this bug.

**Notes:** Combined with negative/zero primary_id acceptance, there is no input validation on the primary key of customer records.

---

## BUG-070: Segmentation preview — `is_null` / `is_not_null` operators return 400

**Severity:** Medium
**Endpoint:** `POST /api/tenants/segmentation/preview`
**Status:** Open — filed S20

### Reproduce
```bash
curl -s -X POST 'https://cdpv2.ssd.uz/api/tenants/segmentation/preview' \
  -H "Authorization: Bearer $TOKEN" \
  -H 'Content-Type: application/json' \
  -d '{"segmentation":{"name":"test","segments":[{"name":"NullCheck","customerProfileFilter":{"type":"group","group":{"logicalOp":"AND","predicates":[{"type":"condition","condition":{"param":{"kind":"field","fieldName":"col__varchar_s50000__1"},"operator":"is_null","value":{"string":[],"int64":[],"float64":[],"bool":[],"time":[]}}}]}}}]}}'
```

### Expected
HTTP 200 with count of customers where the field is NULL.

### Actual
HTTP 400 — null filtering is completely unsupported in segmentation preview.

### Impact
Cannot build segments based on missing/present data. The `is_null` and `is_not_null` operators both fail with 400.

---

## BUG-071: Multi-segment preview returns 0 for all filtered segments after the first

**Severity:** High
**Endpoint:** `POST /api/tenants/segmentation/preview`
**Status:** Open — filed S20

### Reproduce
```bash
curl -s -X POST 'https://cdpv2.ssd.uz/api/tenants/segmentation/preview' \
  -H "Authorization: Bearer $TOKEN" \
  -H 'Content-Type: application/json' \
  -d '{"segmentation":{"name":"multi","segments":[{"name":"All","customerProfileFilter":{"type":"group","group":{"logicalOp":"AND","predicates":[]}}},{"name":"Female","customerProfileFilter":{"type":"group","group":{"logicalOp":"AND","predicates":[{"type":"condition","condition":{"param":{"kind":"field","fieldName":"col__varchar_s50000__2"},"operator":"=","value":{"string":["female"],"int64":[],"float64":[],"bool":[],"time":[]}}}]}}}]}}'
```

### Expected
- Segment "All" → ~347,975
- Segment "Female" → ~171,647 (known female count)

### Actual
- Segment "All" → 347,975 ✓
- Segment "Female" → 0 ✗

Only the first segment with an empty predicate returns a correct count. All subsequent segments with actual filters return 0. If the first segment itself has a filter, it works correctly — the bug is specifically that segments after the first lose their filter results.

### Impact
Multi-segment comparisons (A/B testing, overlap analysis) are completely broken. This affects any business test that uses multiple segments in a single preview request.

---

## BUG-072: Segmentation preview `contains` operator returns 400

**Severity:** Low
**Endpoint:** `POST /api/tenants/segmentation/preview`
**Status:** Open — filed S20

### Reproduce
```bash
curl -s -X POST 'https://cdpv2.ssd.uz/api/tenants/segmentation/preview' \
  -H "Authorization: Bearer $TOKEN" \
  -H 'Content-Type: application/json' \
  -d '{"segmentation":{"name":"test","segments":[{"name":"Contains","customerProfileFilter":{"type":"group","group":{"logicalOp":"AND","predicates":[{"type":"condition","condition":{"param":{"kind":"field","fieldName":"col__varchar_s50000__2"},"operator":"contains","value":{"string":["fem"],"int64":[],"float64":[],"bool":[],"time":[]}}}]}}}]}}'
```

### Expected
HTTP 200 with count of customers where gender contains "fem".

### Actual
HTTP 400 — `contains` operator is not supported in segmentation preview.

### Impact
Low — partial string matching may not be a business requirement. However, the operator exists in the frontend UI.

---

## BUG-073: Scenario accepts self-referencing edges (infinite loop risk)

- **Filed:** Session 21 (2026-04-09)
- **Severity:** Medium
- **Status:** Open

### Steps to Reproduce
```bash
# 1. Create scenario
SCEN=$(curl -s -X POST 'https://cdpv2.ssd.uz/api/tenant/scenario/crud' \
  -H 'Authorization: Bearer <TOKEN>' -H 'X-Tenant-Id: 1762934640267' \
  -H 'Content-Type: application/json' \
  -d '{"name":"self_ref_test"}')
SCEN_ID=$(echo $SCEN | grep -o '"id":"[^"]*"' | cut -d'"' -f4)

# 2. Save with self-referencing edge (fromNodeId = toNodeId)
curl -s -X POST 'https://cdpv2.ssd.uz/api/tenant/scenario/crud/save-changes' \
  -H 'Authorization: Bearer <TOKEN>' -H 'X-Tenant-Id: 1762934640267' \
  -H 'Content-Type: application/json' \
  -d "{\"scenarioId\":\"$SCEN_ID\",\"nodes\":[{\"nodeId\":\"node1\",\"nodeType\":\"node_trigger\",\"position\":{\"x\":0,\"y\":0}}],\"edges\":[{\"edgeId\":\"selfref\",\"fromNodeId\":\"node1\",\"toNodeId\":\"node1\"}]}"
# Returns 204 — edge accepted and persisted
```

### Expected
Self-referencing edges should be rejected (400) — a node pointing to itself creates an infinite loop in scenario execution.

### Actual
HTTP 204 — self-referencing edge is accepted and persisted. Retrieving the scenario via GET confirms the edge is stored.

### Impact
Medium — self-referencing edges could cause infinite loops when scenarios are executed, consuming compute resources or hanging the system. No input validation for graph cycles.

---

## BUG-074: File upload part endpoint moved objectId from query param to X-Object-Id header

- **Filed:** Session 21 (2026-04-09)
- **Severity:** Low (breaking API change)
- **Status:** Open

### Steps to Reproduce
```bash
# Init upload
OBJ_ID=$(curl -s -X POST 'https://cdpv2.ssd.uz/api/file/upload/init' \
  -H 'Authorization: Bearer <TOKEN>' -H 'X-Tenant-Id: 1762934640267' \
  -H 'Content-Type: application/json' \
  -d '{"fileName":"test.csv","fileExtension":"csv","sizeBytes":50,"tag":"imports"}' | grep -o '"objectId":"[^"]*"' | cut -d'"' -f4)

# Old way (query param) — now fails
curl -s 'https://cdpv2.ssd.uz/api/file/upload/part?objectId='$OBJ_ID \
  -H 'Authorization: Bearer <TOKEN>' -H 'Content-Type: application/octet-stream' \
  --data-binary 'test data'
# Returns 400: "Header parameter X-Object-Id is required"

# New way (header) — works
curl -s 'https://cdpv2.ssd.uz/api/file/upload/part' \
  -H 'Authorization: Bearer <TOKEN>' -H 'Content-Type: application/octet-stream' \
  -H 'X-Object-Id: '$OBJ_ID --data-binary 'test data'
# Returns 200: {"status":"success"}
```

### Expected
API changes should be versioned and documented. Query param approach should continue to work for backward compatibility.

### Actual
Breaking change — objectId parameter moved from query string to X-Object-Id header with no migration period.

### Impact
Low — internal API, but any existing integrations using the old query-param approach will break silently.

---

## BUG-075: UDAF grouping missing `take` field crashes server (500 instead of 400)

**Severity:** Medium
**Endpoint:** `POST /api/tenants/udafs`
**Status:** Open — filed S23
**Found:** Session 23 — UDAF grouping schema discovery

### Context
UDAF CREATE with `grouping.enable=true` requires a `take` field (enum: "FIRST" or "LAST"). The OpenAPI schema validates `take` values when present but does NOT enforce `take` as required when `enable=true`. Missing `take` passes OpenAPI validation and reaches the Go handler, which crashes with nil dereference.

### Steps to Reproduce
```bash
# Create UDAF with grouping enabled but missing `take` — should be 400, actual 500
curl -s -X POST 'https://cdpv2.ssd.uz/api/tenants/udafs' \
  -H 'Authorization: Bearer <TOKEN>' -H 'Content-Type: application/json' \
  -d '{
    "name":"bug075_probe",
    "aggType":"SUM",
    "filter":{"eventType":{"id":100},"predicate":{"type":"group","group":{"logicalOp":"AND","negate":false,"predicates":[]}},"timeWindow":{"type":"ABSOLUTE","absoluteTime":"2025-01-01T00:00:00Z"}},
    "grouping":{"enable":true,"field":{"fieldName":"col__varchar_s50000__0","displayName":"First Name","mfieldId":"00000000-0000-0000-0000-000000000002"}},
    "params":[{"fieldName":"col__bigint__1","displayName":"Phone","mfieldId":"00000000-0000-0000-0000-000000000001"}]
  }'
# Returns: {"debug":"groupping option take is nil but enabled","error":"internal server error"} 500
```

### Expected
400 with validation error: "take is required when grouping is enabled". OpenAPI schema should mark `take` as required when `enable=true`, or backend should validate before dereferencing.

### Actual
500 Internal Server Error. Error message: `"groupping option take is nil but enabled"` (note: typo "groupping" in error). The server crashes because `take` is nil but the code tries to use it.

### Working payload (with take)
```bash
curl -s -X POST 'https://cdpv2.ssd.uz/api/tenants/udafs' \
  -H 'Authorization: Bearer <TOKEN>' -H 'Content-Type: application/json' \
  -d '{
    "name":"bug075_working",
    "aggType":"SUM",
    "filter":{"eventType":{"id":100},"predicate":{"type":"group","group":{"logicalOp":"AND","negate":false,"predicates":[]}},"timeWindow":{"type":"ABSOLUTE","absoluteTime":"2025-01-01T00:00:00Z"}},
    "grouping":{"enable":true,"field":{"fieldName":"col__varchar_s50000__0","displayName":"First Name","mfieldId":"00000000-0000-0000-0000-000000000002"},"take":"LAST"},
    "params":[{"fieldName":"col__bigint__1","displayName":"Phone","mfieldId":"00000000-0000-0000-0000-000000000001"}]
  }'
# Returns 200 with UDAF ID
```

### Impact
Medium — OpenAPI validation gap causes server crash. Any UI flow that constructs a grouping UDAF without selecting FIRST/LAST will trigger 500.

### Notes
- UDAF grouping schema: `{enable: bool, field: {fieldName, displayName, mfieldId}, take: "FIRST"|"LAST"}`
- `take` valid values: "FIRST", "LAST" — validated by OpenAPI when present
- Server error contains typo: "groupping" instead of "grouping"

---

## BUG-076: Specific-fields PUT causes full API server deadlock (Critical)

**Severity:** Critical
**Endpoint:** `PUT /api/tenant/specific-fields`
**Status:** Open — filed S23
**Found:** Session 23 — specific-fields lifecycle testing

### Context
During S23 env check, a series of `PUT /api/tenant/specific-fields` calls were made (email mapping, phone mapping, repeated PUT for existing field_type). After these calls, the entire Go backend became unresponsive — all endpoints (GET and POST) timed out. Only nginx-served static content (the SPA) continued to work. The server did not recover within 10+ minutes.

### Steps to Reproduce
```bash
# Step 1: PUT specific-fields with existing field_type (email already configured)
curl -s -X PUT 'https://cdpv2.ssd.uz/api/tenant/specific-fields' \
  -H 'Authorization: Bearer <TOKEN>' -H 'Content-Type: application/json' \
  -d '{"field_type":"email","field_api_name":"email","field_display_name":"email","field_name":"col__varchar_s50000__5"}'
# May return 409 or hang

# Step 2: Verify server is deadlocked — ALL endpoints hang
curl -s -m 10 -X POST 'https://cdpv2.ssd.uz/public/api/signin' \
  -H 'Content-Type: application/json' \
  -d '{"username":"shop2025.11.12-13:04:00@cdp.ru","password":"qwerty123","domainName":"1762934640.cdp.com"}'
# Timeout — zero bytes received

curl -s -m 10 'https://cdpv2.ssd.uz/api/tenants/udafs' \
  -H 'Authorization: Bearer <TOKEN>'
# Timeout — zero bytes received

# Step 3: Frontend loads (served by nginx, not Go)
curl -s -m 10 'https://cdpv2.ssd.uz/'
# Returns HTML — nginx serves SPA fine
```

### Expected
PUT for already-existing field_type should return 409 Conflict quickly. Server should remain responsive.

### Actual
PUT may hang or return 409, but afterwards the ENTIRE Go backend becomes deadlocked. All API endpoints (auth, UDAF, segmentation, campaign, etc.) time out. Only nginx-served static content continues to work. Server does not self-recover within 10+ minutes.

### Root Cause Hypothesis
Database-level row lock or transaction deadlock in the specific-fields handler. The PUT handler likely:
1. Opens a transaction
2. Attempts to acquire a row lock on the field_type record
3. Deadlocks (perhaps with itself on concurrent requests, or with a read lock from GET)
4. The deadlocked goroutine holds a connection pool slot, and/or the Go HTTP server's goroutines are exhausted

### Impact
**Critical** — a single PUT request to specific-fields can take down the entire API. This is a denial-of-service condition. Any user action in the UI that triggers a specific-fields update while the field already exists could crash the entire system.

### Reproduction confidence
High — reproduced in S23 with a single sequence of 3 PUT calls. Server remained down for 10+ minutes.

### Notes
- This bug was discovered by the test suite, NOT by manual testing
- The deadlock was triggered by: PUT email (201) → PUT phone (201 or 409) → PUT email again (409 expected, hang actual)
- The test code for specific-fields now uses AbortController with 8s timeout to avoid test suite hang

---

## BUG-077: Invalid UDAF (grouping=enabled, take=nil) poisons entire /udafs/types listing

**Severity:** High (single corrupt row breaks a cross-cutting endpoint, cascading 19+ business test failures)
**Endpoint:** `GET /api/tenants/udafs/types`, `GET /api/tenants/udafs/{poisonId}`
**Status:** Open — filed S28

### Reproduce
```bash
TOKEN=$(curl -s -X POST https://cdpv2.ssd.uz/public/api/signin \
  -H "Content-Type: application/json" \
  -d '{"username":"<u>","password":"<p>","domainName":"<d>"}' \
  | grep -o '"jwtToken":"[^"]*"' | cut -d'"' -f4)

# Create a UDAF with grouping enabled but no take field
# (exercised by our own test suite S23 as the `s23_group_*_no_take` negative case)

# Trigger: types endpoint fails
curl -s 'https://cdpv2.ssd.uz/api/tenants/udafs/types' -H "Authorization: Bearer $TOKEN"
# → 500
# {"Debug":".. SchemaProviderImpl: cannot provide schema for invalid udaf, validatition error: field not found within scheme: udaf groupping option take invalid, udafID: 59e826a4-..."}

# Trigger: GET by id also fails
curl -s 'https://cdpv2.ssd.uz/api/tenants/udafs/59e826a4-3988-4c57-9a55-22db1a5ed7e6' -H "Authorization: Bearer $TOKEN"
# → 500
# {"debug":"groupping option take is nil but enabled","error":"internal server error"}
```

### Expected
- CREATE of a UDAF with `grouping.enable=true` and no `grouping.take` should be rejected at write time (400), not accepted and then crash on read.
- `/udafs/types` should either (a) skip invalid rows with a warning, or (b) never allow invalid rows to persist.

### Actual
- CREATE accepted the invalid shape (historic — S23 tests still produced 200 on this payload).
- Read paths now crash 500, poisoning the global `/types` listing.

### Impact
- Business suite regressed S20→S27 from 68.6% to 55.3% (−13 pts). The primary cascade is this 500 on `/udafs/types`, which 19 business tests depend on (segmentation-udaf, campaign-udaf-preview, scenario-creation).
- Any tenant that ever accepted this shape is stuck until the row is purged manually.

### Root cause hypothesis
- Writer-side validator for UDAF shape was tightened AFTER existing rows with the invalid shape had already been persisted. Reader-side validator rejects them but does not skip; it propagates the error up through the entire listing.

### Fix suggestion
- Reader-side: on validation error for a single UDAF, log + skip, return the remaining valid UDAFs.
- Writer-side: verify rejection of `{grouping:{enable:true}}` without `take`.
- Data repair: backfill `take=LAST` or `grouping.enable=false` on existing invalid rows.

### Notes
- Discovered during S28 root-cause investigation of the S27 business regression.
- The poison row `59e826a4-3988-4c57-9a55-22db1a5ed7e6` (name: `s23_group_1776064311430_no_take`) was created by our own test suite — a negative-case test that the backend accepted. Our test was correct to try it; the bug is that the backend accepted it.
- DELETE of the poison row on the shared tenant requires explicit user authorization (destructive on shared state).

## BUG-078: Fresh UDAFs do not materialize on compute side — empty-struct hydration desync

**Severity:** Critical (root cause candidate for IMP-1; drives the majority of business-suite UDAF-dependent failures; S27 "restart fix" was scope-bounded to UDAFs present at restart time, NOT new creates)
**Endpoint:** `POST /api/tenants/udafs/{id}/calculate?primaryId={pid}`
**Status:** Open — filed S31, durability re-confirmed S32 @ 60s/180s/300s. **Dev-facing reproducer:** `reports/BUG-078-repro.md` (updated S32 schema: `filter.eventType.id` + `filter.timeWindow:{}` inside filter, not at top level). S31 reproducer payload below is obsolete post-schema-change.

### Reproduce
```bash
TOKEN=$(curl -s -X POST https://cdpv2.ssd.uz/public/api/signin \
  -H "Content-Type: application/json" \
  -d '{"username":"<u>","password":"<p>","domainName":"<d>"}' \
  | grep -o '"jwtToken":"[^"]*"' | cut -d'"' -f4)

# Create a valid ALL_TIME COUNT UDAF (clean schema — NOT the BUG-077 shape)
curl -s -X POST https://cdpv2.ssd.uz/api/tenants/udafs \
  -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
  -d '{"name":"bug078_probe","aggType":"COUNT","timeWindow":{"from":{"kind":"ALL_TIME"}},"grouping":{"enable":false},"target":{"type":"event","eventTypeId":1}}'
# → 200 {"id":"<newId>"}

# Immediately POST calculate for any customer
curl -s -X POST "https://cdpv2.ssd.uz/api/tenants/udafs/<newId>/calculate?primaryId=<pid>" \
  -H "Authorization: Bearer $TOKEN"
# → 500
# udaf_builder.go:47 Build: Provided UDAF is not valid,
# udaf: { [] {{<nil><nil>} {<nil><nil>} 0} },
# error: unsupported AggType, type:
```

### Observation (S30)
- Polled at t = 1,3,5,8,12,18,25,35,50,70,90s. **0/11 calls succeeded.**
- Compute service sees an empty struct (`AggType` blank, `type` empty, params empty) despite the API-side store holding the correct full definition (GET-by-id returns the right shape).
- **Control:** A UDAF created 15 minutes earlier in the same session by the business test suite's init path (same schema, same tenant) responds 200 on calculate. Delta = timing + creator path.

### Expected
- After CREATE returns 200, the UDAF should be materialized on the compute side within a bounded time (spec: <10s). Subsequent `/calculate` should return 200 with a `Result`.

### Actual
- Fresh ad-hoc creates never materialize (observed window: 90s). Compute worker's hydration step either doesn't fire for these creates or silently drops them.

### Root cause hypothesis
- API-tier persistence and compute-tier materialization worker are decoupled. There is a hidden step (possibly worker-side cache warm-up, event bus notification, or schema-provider refresh) that is reliably triggered by the business-suite's init path but NOT by a bare `POST /udafs` call.
- S27's apparent fix was restart-induced warm state: UDAFs that existed at restart time got rehydrated en masse, masking the per-create materialization bug.

### Impact
- All business tests that CREATE a UDAF and immediately calculate fail with 500.
- Mid-session new UDAFs are functionally write-only until some opaque trigger rehydrates them.
- Root cause candidate for IMP-1 (UDAF compute unreliable) — reframes IMP-1 from "generic flakiness" to "per-create materialization desync".

### Fix suggestion
- Investigate compute service's UDAF-load path: what event/signal does it listen for on CREATE? Is the signal emitted synchronously with the API-tier write?
- Add a materialization health check in the CREATE response path — either block until materialized or surface a `materializing` status.
- Alternatively: on `/calculate`, if compute sees empty struct for a UDAF that exists in the API store, have it fetch-and-hydrate on demand instead of 500.

### Notes
- Source: S30-C2 timing probe on fresh UDAF `f7c73a20-...`.
- Reopens IMP-18/IMP-27 (previously marked resolved S27 — scope was narrow).
- Sibling of IMP-1 (NARROWED root cause candidate as of S30).
