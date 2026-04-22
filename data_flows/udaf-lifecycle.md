# UDAF Lifecycle

## Steps

1. **Prerequisites: Schema + Data Must Exist First** — Ingest data before creating UDAFs. A UDAF created before data arrives materializes on an empty dataset; when new data lands the recalculation timing is unpredictable.
   - Anti-pattern: create UDAF → ingest data → calculate (may return stale 0).
   - Correct order: ingest data → poll until data lands → create UDAF → poll until materialized → calculate.

2. **Create UDAF** — `POST /api/tenants/udafs` — Define a persistent aggregation over event data.
   - Input:
     ```json
     {
       "name": "total_spend",
       "aggType": "SUM",
       "params": [{ "fieldName": "col__double_18_2__0" }],
       "filter": {
         "eventType": { "id": 100, "name": "purchase" },
         "predicate": { "type": "group", "group": { "logicalOp": "AND", "predicates": [], "negate": false } },
         "timeWindow": {}
       },
       "grouping": { "enable": false }
     }
     ```
   - Output: `{ "id": "<uuid>", "aggType": "SUM", ... }`
   - Notes: `params` must use **internal column names** (`col__double_18_2__0`), not logical `apiName`. Empty `timeWindow: {}` means no time restriction.
   - Supported aggTypes: COUNT (params=[]), SUM, AVG, MIN, MAX (params=[{fieldName}])
   - Known bugs: none (creation itself is stable)

3. **Wait for UDAF Materialization** — (no dedicated endpoint; poll calculate) — The backend materializes UDAF values asynchronously across all customers. Typical wait: 5–7 minutes after UDAF creation or after new data ingestion.
   - During recalculation, `calculate` may return `null` or `0` (not yet computed) or `500` (compute service hasn't picked up the UDAF yet).
   - Poll strategy: `POST /api/tenants/udafs/{id}/calculate?primaryId={knownCustomer}` until result is non-null and matches a known expected value (e.g., the probe customer with a known event count).
   - Timing is nondeterministic: the same UDAF may return a correct value on run 1 and `null` on run 2. Flaky `null` = timing, not a bug.
   - Known bugs: **BUG-006** — SUM on `total_quantity` returns `null` consistently for specific customers (Bob) even after long waits, while the same aggType on `total_price` works. Frank's `total_quantity` SUM returns correct values. Likely data-pattern-dependent.

4. **Calculate UDAF for a Customer** — `POST /api/tenants/udafs/{id}/calculate?primaryId={primaryId}` — Retrieve the materialized aggregate value for a specific customer.
   - Input: UDAF ID in path, customer primary_id in query param.
   - Output: `{ "result": <number|null> }` or `{ "result": { "Result": <number> } }` — **inconsistent nesting and casing between tenants/aggTypes**. Always handle both:
     ```typescript
     function udafValue(data: any): number | null {
       if (data.result !== undefined) return data.result;   // lowercase
       if (data.Result !== undefined) return data.Result;   // uppercase (nested)
       return null;
     }
     ```
   - Known bugs: **BUG-002** — UDAF with RELATIVE time window (`from: { kind: "RELATIVE", relativeDuration: 365, relativeUnit: "DAY" }`) consistently returns `{"Result":0}` for customers with events. This is NOT a timing issue (result is `0`, not `null`). The query builder miscalculates the cutoff date. ABSOLUTE time windows work correctly (when within range). Unfiltered UDAFs and event-predicate-filtered UDAFs work correctly.

5. **Use UDAF in Segmentation** — `POST /api/tenants/segmentation/preview` or `POST /api/tenants/segmentation` — Reference a UDAF in a predicate using `kind: "udaf"` and `artifactId`.
   - Input predicate example:
     ```json
     {
       "type": "condition",
       "condition": {
         "param": { "kind": "udaf", "artifactId": "<udaf-id>" },
         "operator": ">",
         "value": { "float64": [100.0], "string": [], "int64": [], "bool": [], "time": [] }
       }
     }
     ```
   - Notes: UDAF must be fully materialized before segmentation predicates referencing it will return correct counts.
   - Known bugs: none (beyond the underlying UDAF bugs above)

---

## Timing Considerations

| Phase | Typical Duration | Polling Strategy |
|-------|-----------------|------------------|
| Schema apply propagation | ~3s | Fixed delay |
| Customer/event data landing | 30s–2min | Poll `GET /api/tenant/data/customers/{id}` |
| UDAF initial materialization | 5–7min | Poll `calculate` for a known customer |
| UDAF re-materialization after new data | 3–7min | Same polling |

Materialization latency varies by aggType and filter complexity. Newly created UDAFs don't all materialize at the same speed.

---

## Critical Path

Minimum steps for a passing UDAF happy-path test:

1. Schema: `POST /api/tenants/schema/customers/fields` + event type + event fields → `POST /api/tenants/schema/draft-schema/apply`, wait 3s
2. Data: `POST /cdp-ingest/ingest/tenant/{id}/async/customers` + events
3. Poll: `GET /api/tenant/data/customers/{primaryId}` until data lands
4. Create: `POST /api/tenants/udafs` with correct internal column names in `params`
5. Poll: `POST /api/tenants/udafs/{id}/calculate?primaryId={knownCustomer}` until non-null
6. Assert: call calculate for target customer, compare to expected value

---

## Edge Cases

- RELATIVE time window (`from.kind: "RELATIVE"`): always returns 0 — confirmed bug (BUG-002). Use ABSOLUTE time windows or no time window as a workaround.
- SUM on certain numeric fields returns null for specific customers (BUG-006): may be data-pattern-dependent (specific values or NULL event fields).
- Shared tenant compute service: ALL UDAF calculations return 500 ("unsupported AggType, type: ") — compute service deserialization corruption on older tenants. Use fresh tenant to test UDAF logic.
- COUNT aggType: `params` must be empty array `[]`, not omitted.
- UDAF delete: no DELETE endpoint exists in the API spec (BUG-005 tracking request). Test-created UDAFs accumulate on shared tenant and pollute the column picker UI.
- Calculating before materialization: returns `null` or `0` — do not interpret as a logic bug without ruling out timing.
- `grouping.enable: false` is required in the payload; omitting it may cause unexpected behavior.
