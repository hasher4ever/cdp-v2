# CDP Backend Specification — Data Lifecycle & Testing Contract

> How the CDP backend actually processes data, and how tests must interact with it.

## Table of Contents

- [Core Principle: Schema Before Data](#core-principle-schema-before-data)
- [The Full Data Lifecycle](#the-full-data-lifecycle)
- [Schema Layer](#schema-layer)
- [Ingestion Layer](#ingestion-layer)
- [Aggregation Layer (UDAFs)](#aggregation-layer-udafs)
- [Query Layer](#query-layer)
- [Testing Contract](#testing-contract)
- [Anti-Patterns](#anti-patterns)

---

## Core Principle: Schema Before Data

The CDP backend does **not** auto-discover fields from ingested data. The schema must be explicitly declared and approved before data referencing those fields can land in the system.

```
Schema Declaration → Draft Apply → Data Ingestion → Async Processing → Queryable State
```

If you ingest a customer with `loyalty_tier: "gold"` but no `loyalty_tier` field exists in the schema, the field is silently dropped (listed in `ignoredFields` response). The customer record is still accepted — only the unknown field is discarded.

---

## The Full Data Lifecycle

### Phase 1: Schema Setup

```
1. Create customer fields        POST /api/tenants/schema/customers/fields
2. Create event type              POST /api/tenants/schema/event-types
3. Create event fields            POST /api/tenants/schema/events/fields/{eventTypeId}
4. Apply draft                    POST /api/tenants/schema/draft-schema/apply
5. Wait for schema propagation    (~3 seconds)
```

Fields go through a lifecycle: **draft → applied → ready**. Until the draft is applied, no data can be ingested against those fields. Multiple field additions can be batched into a single draft apply.

Each field gets an auto-generated internal column name (e.g., `col__varchar_s50000__0`) that is the actual storage identifier. The logical `apiName` (e.g., `gender`) is what you use for ingestion. The `fieldName` / column name is what you use for filters, predicates, and queries.

### Phase 2: Data Ingestion

```
6. Ingest customers               POST /cdp-ingest/ingest/tenant/{tenantId}/async/customers
7. Ingest events                  POST /cdp-ingest/ingest/tenant/{tenantId}/async/events
8. Wait for data landing          Poll GET /api/tenant/data/customers/{primaryId} (~1-2 min)
```

Ingestion is **asynchronous**. The ingest endpoint returns immediately with accepted/rejected counts, but data is not queryable until the async pipeline processes it. Events are linked to customers via `primary_id`.

### Phase 3: Aggregation (UDAFs)

```
9. Create UDAF definitions        POST /api/tenants/udafs
10. Wait for UDAF recalculation   Poll calculate endpoint (~5-7 min)
11. Calculate per customer        POST /api/tenants/udafs/{id}/calculate?primaryId=X
```

UDAFs are **materialized aggregations** — they are precomputed asynchronously, not calculated on-the-fly. After data ingestion or UDAF creation, the system requires time to build/rebuild the materialized views. A newly created UDAF will return `null`/`0`/`500` until recalculation completes.

### Phase 4: Query & Segmentation

```
12. Query customer data           POST /api/tenant/data/customers
13. Query event data              POST /api/v2/tenant/data/events
14. Segmentation preview          POST /api/tenants/segmentation/preview
15. Segmentation create           POST /api/tenants/segmentation
```

Segmentation predicates can reference both customer fields (`kind: "field"`) and UDAF results (`kind: "udaf"`). The segment preview counts are computed at preview time — they reflect the current state of the materialized data.

---

## Schema Layer

### Field Types

| Data Type | Column Pattern | Example | Notes |
|-----------|---------------|---------|-------|
| VARCHAR | `col__varchar_s50000__N` or `col__varchar_255__N` | `col__varchar_s50000__0` | Size varies by tenant config |
| BIGINT | `col__bigint_0__N` or `col__bigint__N` | `col__bigint_0__0` | |
| DOUBLE | `col__double_18_2__N` or `col__double__N` | `col__double_18_2__0` | Precision varies |
| BOOL | `col__bool_0__N` or `col__bool__N` | `col__bool_0__0` | |
| DATE | `col__date_0__N` or `col__date__N` | `col__date_0__0` | |
| DATETIME | `col__datetime__N` | `col__datetime__0` | |
| JSON | `col__json__N` | `col__json__0` | |

**The column naming pattern varies between tenants.** The `__N` suffix is a sequential counter per data type. A fresh tenant's first VARCHAR field might be `col__varchar_255__0`; the shared tenant's equivalent might be `col__varchar_s50000__0`. Tests must never hardcode column names — always resolve them from the schema API.

### Field Access Levels

| Access | Meaning |
|--------|---------|
| `field_required` | Must be present in every ingested record |
| `field_optional` | May be missing from ingested records |
| `field_system` | System-managed, not user-editable |

### Draft Apply Semantics

- Adding a field that already exists returns `409 Conflict` — not an error
- Applying when no changes exist returns `200` with no effect
- Apply is atomic — all pending changes are committed together
- After apply, a short propagation delay (~3s) is needed before the fields are usable
- Draft can be cancelled: `DELETE /api/tenants/schema/draft-schema/cancel`

---

## Ingestion Layer

### Customer Ingestion

```
POST /cdp-ingest/ingest/tenant/{tenantId}/async/customers
Content-Type: application/json
(No auth required — public endpoint)

[
  { "primary_id": 9900000001, "first_name": "Alice", "gender": "female", ... },
  { "primary_id": 9900000002, "first_name": "Bob", ... }
]
```

- `primary_id` is mandatory and unique — it is the customer identity
- Field names in the payload must match the `apiName` from the schema (not the internal column name)
- Unknown fields are silently ignored (listed in `ignoredFields`)
- Duplicate `primary_id` records: last-write-wins (upsert behavior)
- Response includes per-record `accepted`/`rejected` status

### Event Ingestion

```
POST /cdp-ingest/ingest/tenant/{tenantId}/async/events
Content-Type: application/json

[
  { "primary_id": 9900000001, "event_type": "purchase", "total_price": 150.00, ... }
]
```

- `primary_id` links the event to a customer
- `event_type` must match an existing, applied event type name
- Event fields must match the `apiName` from the event type's schema
- Events for non-existent customers: behavior is undefined (may create orphaned events)

### Async Processing Pipeline

```
Ingest API (sync) → Message Queue → Async Processor → Data Store → Queryable
                                                     → UDAF Recalculation
```

The time from ingestion to queryability depends on system load. Typical timing:
- Customer data landing: 30s–2min
- Event data landing: 30s–2min
- UDAF recalculation after new data: 3–7min

---

## Aggregation Layer (UDAFs)

### UDAF Definition

A UDAF is a persistent aggregation definition that the system materializes across all customers:

```json
{
  "name": "total_spend",
  "aggType": "SUM",
  "params": [{ "fieldName": "col__double_18_2__0" }],
  "filter": {
    "eventType": { "id": 100, "name": "purchase" },
    "predicate": { "type": "group", "group": { "logicalOp": "AND", "predicates": [...], "negate": false } },
    "timeWindow": { "from": { "kind": "RELATIVE", "relativeDuration": 365, "relativeUnit": "DAY" } }
  },
  "grouping": { "enable": false }
}
```

### Aggregation Types

| Type | Params Required | Meaning |
|------|----------------|---------|
| COUNT | No (empty `[]`) | Count of matching events |
| SUM | Yes — field to sum | Sum of a numeric field |
| AVG | Yes — field to average | Average of a numeric field |
| MIN | Yes — field | Minimum value |
| MAX | Yes — field | Maximum value |

### Filter Components

1. **Event Type** — which event type to aggregate over (required)
2. **Predicate** — optional filter on event fields (e.g., only Samarkand deliveries)
3. **Time Window** — optional date range (RELATIVE: "last N days" or ABSOLUTE: fixed dates)

### UDAF Recalculation

UDAFs are NOT calculated on-the-fly. The backend runs a background process that materializes UDAF values for every customer. After:
- Creating a new UDAF → recalculation needed (~5-7min)
- Ingesting new data → recalculation needed for affected UDAFs

During recalculation, `calculate` may return:
- `null` or `0` — not yet computed
- `500` — compute service hasn't picked up the UDAF yet
- Correct value — recalculation complete

### Materialization Timing Is Nondeterministic

Newly created UDAFs do not all materialize at the same speed. In repeated test runs:
- The **same** UDAF may return a correct value on run 1 and `null` on run 2
- Different aggTypes/filter configs have different materialization latencies
- The global-setup probe UDAF works reliably because it is created early and has time

**Consequence for testing:** A UDAF returning `null` on a single run does **not** mean the compute logic is broken — it may simply not have materialized yet. Run 2-3 times. Only **consistently wrong results** (same wrong value every run, not null) indicate a real compute bug. Flaky `null` results indicate a timing issue in the test, not a backend defect.

### Known Bug: RELATIVE Time Windows (BUG-002)

UDAFs with RELATIVE time windows (`from: { kind: "RELATIVE", relativeDuration: 365, relativeUnit: "DAY" }`) consistently return `{"Result":0}` even for customers with events ingested within the window. This is NOT a timing issue — the result is `0` (a computed answer), not `null` (not yet computed). The query builder appears to miscalculate the time boundary. See `bugs.md` BUG-002.

### Calculate Endpoint

```
POST /api/tenants/udafs/{id}/calculate?primaryId=X
```

Returns `{ "result": <number|null> }` (or `{ "result": { "Result": <number> } }` — inconsistent nesting and casing).

---

## Query Layer

### Internal Column Names in Queries

All query filters, sort orders, and column selections use **internal column names** (`col__xxx`), not logical names:

```json
{
  "columns": [{ "fieldName": "col__varchar_s50000__0", "kind": "field" }],
  "orderBy": [{ "direction": "ASC", "param": { "fieldName": "col__double__0", "kind": "field" } }],
  "filter": {
    "type": "group",
    "group": {
      "logicalOp": "AND",
      "predicates": [{
        "type": "condition",
        "condition": {
          "param": { "kind": "field", "fieldName": "col__varchar_s50000__0" },
          "operator": "=",
          "value": { "string": ["female"], "float64": [], "int64": [], "bool": [], "time": [] }
        }
      }]
    }
  }
}
```

### Predicate Structure

Predicates are recursive trees:

```
Group (AND/OR, negate?)
  ├── Condition (field operator value)
  ├── Condition (field operator value)
  └── Group (AND/OR, negate?)
       ├── Condition
       └── Condition
```

Two param kinds exist:
- `kind: "field"` + `fieldName` — references a customer/event column
- `kind: "udaf"` + `artifactId` — references a UDAF by ID

---

## Testing Contract

### Rule 1: Each Test Owns Its Schema

Tests must **not assume** they are running against an empty database. The shared tenant and even freshly provisioned tenants may contain leftover data from previous runs or other parallel tests.

**Correct approach:**
1. Create unique customer fields and/or event fields for the test
2. Apply the draft
3. Ingest data with those specific fields populated
4. Create UDAFs referencing those specific fields
5. Assert against the data you ingested

**Why:** Column names are auto-generated and tenant-specific. A `gender` field on tenant A might be `col__varchar_255__3` while on tenant B it's `col__varchar_s50000__0`. The field map abstraction (`custField()`, `evtField()`) handles this.

### Rule 2: Isolate by Data, Not by Tenant

Creating a fresh tenant per test is expensive (~70s). Instead, tests should isolate by using **unique identifiers** in their data:

- Use `TEST_TAG` prefixed names for entities (UDAFs, segments, campaigns)
- Use primary IDs from a reserved range (`9_900_000_001–9_900_000_010`)
- Use unique field values that won't collide with other test data

When a test creates a UDAF, it should calculate against a customer **it knows has specific event data** — not rely on the absence of other events.

### Rule 3: Wait for Async Readiness

Never assert immediately after ingestion or UDAF creation. The system requires time to:

| Operation | Wait Strategy | Typical Time |
|-----------|--------------|-------------|
| Schema apply | Fixed delay | ~3s |
| Customer data landing | Poll `GET /customers/{primaryId}` | 30s–2min |
| Event data landing | Poll customer or event query | 30s–2min |
| UDAF recalculation | Poll `calculate` for known customer | 3–7min |

### Rule 4: Assert Business Logic, Not HTTP Contracts

Business logic tests should verify **domain correctness**:

| Good Assertion | Bad Assertion |
|---------------|--------------|
| "Alice has 3 purchases → COUNT = 3" | "POST /api/tenants/udafs returns 200" |
| "SUM(total_price) for Dave = 2000 (4x500)" | "Response body has property 'result'" |
| "Segment 'adults' has 8 members" | "Preview returns array with length > 0" |
| "Filtered COUNT where city=Tashkent for Dave = 4" | "Filter predicate is accepted by API" |

HTTP contract testing belongs in the backend API test layer, not in business logic tests.

### Rule 5: UDAFs Reference Column Names, Not API Names

When creating a UDAF with a `params` field or filter predicate, use the **internal column name** (from the field map), not the logical `apiName`:

```typescript
// Correct — uses resolved column name
params: [{ fieldName: evtField("total_price") }]  // → "col__double_18_2__0"

// Wrong — apiName doesn't work in UDAF params
params: [{ fieldName: "total_price" }]  // ✗ compute service won't recognize this
```

### Rule 6: Handle Both Result Formats

The calculate endpoint returns results in inconsistent casing:

```typescript
function udafValue(data: any): number | null {
  if (data.result !== undefined) return data.result;     // lowercase
  if (data.Result !== undefined) return data.Result;     // uppercase
  return null;
}
```

---

## Bug Triage Methodology

When investigating a suspected backend bug, follow this sequence to avoid wasted effort:

### Step 1: Reproduce on a fresh tenant

Run the relevant business test suite (`npm run test:business`). It provisions a clean tenant with proper lifecycle. **Do not** start with the shared tenant — it may have unrelated issues (e.g., compute service corruption) that mask or amplify the real bug.

### Step 2: Run 2-3 times to separate flaky from consistent

| Pattern | Diagnosis |
|---------|-----------|
| Fails every run with same wrong value (e.g., always 0) | **Real bug** — compute logic is wrong |
| Fails some runs with `null`, passes others | **Timing** — UDAF not yet materialized, test needs polling |
| Fails on shared tenant, passes on fresh tenant | **Tenant-specific** — likely data corruption or stale compute state |
| Returns 500 on shared tenant only | **Compute service issue** — not a UDAF logic bug |

### Step 3: Isolate the variable

Once you have a consistent failure, create a **control** (same UDAF without the suspected problematic feature) and a **test** (with the feature). Example from BUG-002:
- Control: COUNT UDAF, no time window → returns 3 (correct)
- Test: COUNT UDAF, RELATIVE 365d window → returns 0 (wrong)
- Conclusion: the RELATIVE time window is the problem, not COUNT or the data

### Step 4: Document with actual curls from the fresh tenant

Only after confirming the scope, write the bug entry with reproduction curls. Use the fresh tenant's credentials (they'll expire, but the pattern is what matters).

---

## Anti-Patterns

### 1. Hardcoding Column Names

```typescript
// WRONG — breaks on different tenants
params: [{ fieldName: "col__double__0" }]

// RIGHT — resolved from schema
params: [{ fieldName: evtField("total_price") }]
```

### 2. Assuming Empty Database

```typescript
// WRONG — other test data may exist
expect(totalCustomerCount).toBe(10);

// RIGHT — assert against specific known records
expect(udafValue(aliceCalc)).toBe(3);  // Alice has exactly 3 events we ingested
```

### 3. Testing Immediately After Ingest

```typescript
// WRONG — data hasn't landed yet
await ingestCustomers(data);
const result = await queryCustomers();  // may be empty

// RIGHT — poll until ready
await ingestCustomers(data);
await pollUntilDataLands(alice.primary_id);
const result = await queryCustomers();
```

### 4. Creating UDAFs Before Data Exists

```typescript
// WRONG — UDAF materializes on empty data, then new data arrives
// but recalculation timing is unpredictable
const udaf = await createUdaf(...);
await ingestEvents(data);
await calculateUdaf(udaf.id, alice.primary_id);  // still 0?

// RIGHT — ingest first, wait for landing, then create UDAF
await ingestEvents(data);
await pollUntilDataLands(alice.primary_id);
const udaf = await createUdaf(...);
await pollUntilUdafReady(udaf.id, alice.primary_id);
const result = await calculateUdaf(udaf.id, alice.primary_id);
```

### 5. Bruteforcing Endpoints Instead of Testing Business Logic

```typescript
// WRONG — tests HTTP mechanics, not domain logic
it("should return 200", async () => {
  const { status } = await post("/api/tenants/udafs", payload);
  expect(status).toBe(200);
});

// RIGHT — tests that the aggregation computes correctly
it("SUM total_price for Dave = 2000 (500 x 4 purchases)", async () => {
  const udaf = await createSumUdaf("total_price", "purchase");
  await pollUntilUdafReady(udaf.id, dave.primary_id);
  const result = await calculateUdaf(udaf.id, dave.primary_id);
  expect(result).toBeCloseTo(2000, 0);
});
```

### 6. Not Owning Your Test Data End-to-End

```typescript
// WRONG — relies on pre-existing data from some other source
it("should count purchases", async () => {
  const udaf = await createCountUdaf("purchase");
  const result = await calculateUdaf(udaf.id, "9900000005");
  expect(result).toBe(2);  // who is 9900000005? what if data changed?
});

// RIGHT — test controls the full chain
it("should count purchases for a customer we set up", async () => {
  // Schema: we created the "purchase" event type + fields
  // Data: we ingested Bob with exactly 2 purchase events
  // UDAF: we created the COUNT UDAF on our event type
  // Assert: Bob's count must be 2 because WE put exactly 2 events in
  const result = await calculateUdaf(countUdaf.id, bob.primary_id);
  expect(result).toBe(EXPECTED.bobPurchases);  // 2 — from test-data.ts
});
```

---

## Sequence Diagram: Full UDAF Test Lifecycle

```
Test Setup (globalSetup)
│
├─ 1. signUp()                         → Fresh tenant
├─ 2. addCustomerFields([...])          → draft fields
├─ 3. addEventType("purchase")          → draft event type
├─ 4. addEventFields(purchaseId, [...]) → draft event fields
├─ 5. applyDraft()                      → schema live
├─ 6. readFieldMaps()                   → { "gender" → "col__varchar__0", ... }
├─ 7. ingestCustomers(CUSTOMERS)        → 10 accepted
├─ 8. ingestEvents(EVENTS)              → 18 accepted
├─ 9. pollUntilDataLands(alice.pid)     → data queryable
├─ 10. createProbeUdaf()                → COUNT on purchase
├─ 11. pollUntilUdafReady(probe, alice) → result > 0
│
Test Execution
│
├─ UDAF Test: "SUM total_price for Dave = 2000"
│   ├─ createUdaf({ aggType: "SUM", params: [evtField("total_price")], ... })
│   ├─ calculate(udafId, dave.primary_id)
│   └─ assert result ≈ 2000
│
├─ UDAF Test: "COUNT where city=Samarkand for Bob = 2"
│   ├─ createUdaf({ aggType: "COUNT", predicate: city="Samarkand", ... })
│   ├─ calculate(udafId, bob.primary_id)
│   └─ assert result = 2
│
└─ Segmentation Test: "adults segment has 8 members"
    ├─ preview({ predicates: [custField("is_adult") = true] })
    └─ assert count = 8
```
