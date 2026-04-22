# CDP Regression Checklist

> Quick pass/fail checklist for manual regression testing. Check each item after verification.

## How to Use

- Run through before each release or after significant backend changes
- Mark each item: PASS / FAIL / BLOCKED / SKIP
- If FAIL: document in `bugs.md` with curl command and expected vs actual
- Estimated full regression time: ~2-3 hours manual

---

## 1. Authentication & Tenant Management

- [ ] **AUTH-01** Sign in with valid credentials → 200, JWT token returned
- [ ] **AUTH-02** Sign in with wrong password → 401 or error message
- [ ] **AUTH-03** Sign in with wrong domain → 401 or error message
- [ ] **AUTH-04** Access protected endpoint without token → 401
- [ ] **AUTH-05** Access protected endpoint with invalid JWT → 401
- [ ] **AUTH-06** Tenant signup creates new tenant → 200, tenant ID returned
- [ ] **AUTH-07** Employee creation for tenant → *(Known BUG-012: returns 500)*
- [ ] **AUTH-08** Tenant info endpoint returns correct schema metadata

---

## 2. Schema Management

### Customer Fields
- [ ] **SCH-01** List customer fields → returns all fields with types and internal names
- [ ] **SCH-02** Create VARCHAR customer field → appears in draft
- [ ] **SCH-03** Create BOOL customer field → appears in draft
- [ ] **SCH-04** Create DOUBLE customer field → appears in draft
- [ ] **SCH-05** Create BIGINT customer field → appears in draft
- [ ] **SCH-06** Create DATE customer field → appears in draft
- [ ] **SCH-07** Validate API name (unique) → 200
- [ ] **SCH-08** Validate API name (duplicate) → error returned
- [ ] **SCH-09** Delete draft field → removed from draft

### Event Types & Fields
- [ ] **SCH-10** Create event type → 200, UUID assigned
- [ ] **SCH-11** Check event type name exists → correct boolean
- [ ] **SCH-12** Add fields to event type (VARCHAR, DOUBLE, BIGINT) → appears in draft
- [ ] **SCH-13** Delete draft event field → removed

### Draft Lifecycle
- [ ] **SCH-14** Draft status shows pending change count
- [ ] **SCH-15** Apply draft → changes go live, fields become queryable
- [ ] **SCH-16** Cancel draft → pending changes discarded
- [ ] **SCH-17** After apply, internal field names (col__xxx) are assigned correctly

---

## 3. Data Ingestion

### Ingest API (Public, No Auth)
- [ ] **ING-01** Ingest customer records → 200, data appears in queries
- [ ] **ING-02** Ingest event records → 200, data appears in queries
- [ ] **ING-03** Ingest duplicate customer (same primary_id) → handled gracefully
- [ ] **ING-04** Ingest event with unknown field → handled gracefully

### File Upload (Authenticated, 3-Step)
- [ ] **ING-05** Init upload → returns objectId
- [ ] **ING-06** Upload binary chunk with objectId → 200
- [ ] **ING-07** Complete upload with field mappings → 200
- [ ] **ING-08** CSV paste endpoint → *(Known BUG-013: returns 500 "implement me")*

---

## 4. Data Queries

### V1 Endpoints
- [ ] **DAT-01** List customers with pagination → correct page/size
- [ ] **DAT-02** Get customer profile by primary ID → all fields present
- [ ] **DAT-03** List events with pagination → correct results
- [ ] **DAT-04** Get event detail by composite ID → *(Known BUG-010: returns 500)*
- [ ] **DAT-05** Data count endpoint → correct customer + event totals

### V2 Endpoints (Undocumented)
- [ ] **DAT-06** V2 customer query with column selection → only requested columns returned
- [ ] **DAT-07** V2 customer query with orderBy ASC → correct sort order
- [ ] **DAT-08** V2 customer query with orderBy DESC → correct sort order
- [ ] **DAT-09** V2 customer query with filter predicate → correct filtered results
- [ ] **DAT-10** V2 customer query pagination + orderBy → no overlapping rows *(Known BUG-008)*
- [ ] **DAT-11** V2 customer query pagination WITHOUT orderBy → *(Known BUG-008: overlapping rows)*
- [ ] **DAT-12** V2 event query → returns event data
- [ ] **DAT-13** V2 query with UDAF columns → aggregate values included

### Autocomplete
- [ ] **DAT-14** Customer field autocomplete (gender) → returns distinct values
- [ ] **DAT-15** Customer field autocomplete (city) → returns distinct values
- [ ] **DAT-16** Event field autocomplete → *(Known BUG-001: returns 500)*
- [ ] **DAT-17** Autocomplete partial match → filters correctly
- [ ] **DAT-18** Autocomplete respects size limit

---

## 5. UDAFs (Aggregates)

- [ ] **UDF-01** List UDAFs → returns all with types
- [ ] **UDF-02** Create SUM UDAF on total_price → 200
- [ ] **UDF-03** Create COUNT UDAF → 200
- [ ] **UDF-04** Create AVG UDAF → 200
- [ ] **UDF-05** Create MIN UDAF → 200
- [ ] **UDF-06** Create MAX UDAF → 200
- [ ] **UDF-07** Calculate UDAF for specific customer → correct value
- [ ] **UDF-08** SUM on total_quantity → *(Known BUG-006: returns null)*
- [ ] **UDF-09** UDAF with event filter predicate → *(Known BUG-002: returns null/0)*
- [ ] **UDF-10** UDAF with time window (RELATIVE) → values within window only
- [ ] **UDF-11** Get UDAF by ID → correct definition returned
- [ ] **UDF-12** UDAF types endpoint → lists names with aggregation types

---

## 6. Segmentation

### CRUD
- [ ] **SEG-01** Create segmentation with predicate → 200, ID returned
- [ ] **SEG-02** List segmentations with pagination → correct results
- [ ] **SEG-03** Get segmentation by ID → full predicate definition
- [ ] **SEG-04** Update segmentation → changes persisted
- [ ] **SEG-05** Delete segmentation → *(Known BUG-009: returns 400)*

### Preview & Logic
- [ ] **SEG-06** Preview: gender = female → count = 4
- [ ] **SEG-07** Preview: gender = male → count = 5
- [ ] **SEG-08** Preview: is_adult = true → count = 8
- [ ] **SEG-09** Preview: is_adult = false (minors) → count = 2
- [ ] **SEG-10** Preview: income > 100000 → count = 3 (Bob, Dave, Frank)
- [ ] **SEG-11** Preview: is_subscribed = true → count = 6
- [ ] **SEG-12** Preview: gender != "female" → count = 6
- [ ] **SEG-13** Preview: gender IN ["female", "other"] → count = 5
- [ ] **SEG-14** Preview: gender IS NOT NULL → count = 10
- [ ] **SEG-15** Preview: AND(female, adult) → correct intersection
- [ ] **SEG-16** Preview: OR(female, subscribed) → correct union
- [ ] **SEG-17** Preview: nested AND/OR groups → correct count
- [ ] **SEG-18** Preview: NEGATE group → correct inverse count
- [ ] **SEG-19** Preview: empty name accepted → *(Known BUG-003)*

---

## 7. Campaigns

- [ ] **CMP-01** List campaigns with pagination → correct results
- [ ] **CMP-02** Create campaign with segmentation + channel + template → 200
- [ ] **CMP-03** Get campaign by ID → full config returned
- [ ] **CMP-04** Update campaign → changes persisted
- [ ] **CMP-05** Delete campaign → *(Known BUG-009: returns 400 for some)*
- [ ] **CMP-06** Preview campaign reach → correct customer count matching segment
- [ ] **CMP-07** Send campaign → fires to channel (verify in blackhole/webhook)
- [ ] **CMP-08** Campaign with broken channel reference → handled gracefully

---

## 8. Communication Channels

- [ ] **COM-01** Create email channel → 200
- [ ] **COM-02** Create webhook channel → 200
- [ ] **COM-03** Verify channel → verified status updated
- [ ] **COM-04** List channels (verified filter) → correct filtering
- [ ] **COM-05** Get channel by ID → full config
- [ ] **COM-06** Update channel → *(Known BUG-011: PUT returns 400)*
- [ ] **COM-07** Delete channel → *(Known BUG-009: returns 400)*

---

## 9. Templates

- [ ] **TPL-01** Create text template → 200
- [ ] **TPL-02** Create HTML template → 200
- [ ] **TPL-03** Create JSON template → 200
- [ ] **TPL-04** Create template with variables → variables stored
- [ ] **TPL-05** Get template by ID → full content
- [ ] **TPL-06** Update template → changes persisted
- [ ] **TPL-07** Delete template → *(Known BUG-009: returns 400)*
- [ ] **TPL-08** List templates with pagination → correct results

---

## 10. Scenario Builder

### CRUD
- [ ] **SCN-01** Create scenario → 200, ID returned
- [ ] **SCN-02** List scenarios with pagination → correct results
- [ ] **SCN-03** Get scenario by ID with nodes/edges → full graph returned
- [ ] **SCN-04** Save scenario changes → *(Known BUG-017: returns 500)*

### Nodes
- [ ] **SCN-05** Create trigger_now node → valid response
- [ ] **SCN-06** Create trigger_on_date node → valid response
- [ ] **SCN-07** Create trigger_on_event node → valid response
- [ ] **SCN-08** Create static_wait node → valid response
- [ ] **SCN-09** Create branch node with predicate → valid response
- [ ] **SCN-10** Create email action node → valid response
- [ ] **SCN-11** Create webhook action node → valid response

### Edges
- [ ] **SCN-12** Create link_next_node edge → valid response
- [ ] **SCN-13** Create link_yes_branch edge → valid response
- [ ] **SCN-14** Create link_no_branch edge → valid response
- [ ] **SCN-15** Edge with non-existent node IDs → *(Known BUG-018: accepted)*

### Validation
- [ ] **SCN-16** Scenario with whitespace-only name → *(Known BUG-014: accepted)*
- [ ] **SCN-17** Scenario with HTML/XSS in name → *(Known BUG-015: stored as-is)*
- [ ] **SCN-18** Wait node with 0 duration → *(Known BUG-016: accepted)*
- [ ] **SCN-19** Wait node with negative duration → *(Known BUG-016: accepted)*

---

## 11. UI Settings

- [ ] **UIS-01** Save field mapping (email) → persisted
- [ ] **UIS-02** Save field mapping (phone) → persisted
- [ ] **UIS-03** Save grid column visibility → persisted
- [ ] **UIS-04** Get setting by key → correct value
- [ ] **UIS-05** List all settings → all saved settings present

---

## 12. UI (E2E Browser)

- [ ] **E2E-01** Login page loads, fields visible
- [ ] **E2E-02** Login with valid credentials → redirected to dashboard
- [ ] **E2E-03** Dashboard shows key metrics
- [ ] **E2E-04** Navigate to Clients page → customer table loads
- [ ] **E2E-05** Navigate to Events page → events table loads
- [ ] **E2E-06** Navigate to Segments page → segment list loads
- [ ] **E2E-07** Navigate to Campaigns page → campaign list loads
- [ ] **E2E-08** Navigate to Communications page → channel list loads
- [ ] **E2E-09** Navigate to Scenarios page → scenario list loads
- [ ] **E2E-10** Navigate to Statistics page → metrics displayed
- [ ] **E2E-11** Navigate to Aggregates page → UDAF list loads
- [ ] **E2E-12** Logout → redirected to login page
- [ ] **E2E-13** Breadcrumb navigation works correctly

---

## 13. Cross-Feature Workflows (E2E Business Logic)

> These checks verify that features work correctly **together**, not just in isolation.
> They mirror the automated tests in `tests_business/full-workflow.test.ts`.

### Happy Path: Full CDP User Journey
- [ ] **WF-01** Schema → Ingest → Query: Apply schema, ingest 10 customers + 18 events, verify `data/count` returns correct totals
- [ ] **WF-02** Ingest → Customer Profile: Query each customer by primary_id, all field values match ingested data
- [ ] **WF-03** Ingest → Data Filter: V2 query with filter (gender=female AND is_adult=true) → count = 3
- [ ] **WF-04** UDAF on Ingested Data: Create SUM(total_price) → wait for recalc → calculate for Alice → $400.00
- [ ] **WF-05** Segmentation on Ingested Data: Create adults segment → preview → count = 8
- [ ] **WF-06** Campaign E2E: Channel → Verify → Template → Segment → Campaign → Preview reach = 8
- [ ] **WF-07** File Upload after Ingest: Init → Part → Complete → no errors (data coexists with API-ingested data)

### UDAF + Segmentation Integration
- [ ] **WF-08** UDAF-Based Segment: Create SUM UDAF → segment by UDAF value > 1000 → count = 3 (Bob, Dave, Frank)
- [ ] **WF-09** UDAF with Event Filter + Segment: Create filtered UDAF (city=Tashkent) → use in segment *(Known: BUG-002 blocks this)*
- [ ] **WF-10** V2 Query with UDAF Column: Request UDAF as column in V2 customer query → values present

### Scenario Builder Integration
- [ ] **WF-11** Full Scenario Graph: Create scenario → trigger → wait → branch → email action + webhook action → 4 edges → get-by-id returns complete graph
- [ ] **WF-12** Scenario Save: Save complete scenario *(Known BUG-017: returns 500)*
- [ ] **WF-13** Scenario with Segmentation Predicate: Branch node uses same predicate model as segmentation → accepted

### Schema Lifecycle Integration
- [ ] **WF-14** Schema Change → Re-Ingest: Add new field → apply → ingest customer with new field → query returns new field value
- [ ] **WF-15** Draft Cancel Doesn't Affect Live: Create draft field → cancel → existing data and queries unaffected
- [ ] **WF-16** Event Type Addition: Create new event type → apply → ingest events of new type → event count increases

### Data Consistency
- [ ] **WF-17** V1 vs V2 Count Match: `GET /api/tenant/data/count` total matches V2 query with no filter
- [ ] **WF-18** Autocomplete After Ingest: Customer field autocomplete returns values from ingested data (e.g., gender → female, male, other)
- [ ] **WF-19** Pagination Consistency: V2 query page 1 + page 2 (with orderBy) covers all rows, no duplicates *(Known: BUG-008 without orderBy)*

### Negative / Edge Workflow Cases
- [ ] **WF-20** Campaign with Broken References: Campaign referencing deleted segment/channel → handled gracefully
- [ ] **WF-21** UDAF on Zero-Event Customer: Calculate UDAF for Eve (no events) → returns 0 or null, not error
- [ ] **WF-22** Ingest Edge Cases in Workflow: Ingest event with missing primary_id mid-workflow → other data unaffected

---

## Summary

| Section | Total Checks | Known Bugs Affecting |
|---------|-------------|---------------------|
| Authentication | 8 | BUG-012 |
| Schema | 17 | — |
| Ingestion | 8 | BUG-013 |
| Data Queries | 18 | BUG-001, BUG-008, BUG-010 |
| UDAFs | 12 | BUG-002, BUG-006 |
| Segmentation | 19 | BUG-003, BUG-009 |
| Campaigns | 8 | BUG-009 |
| Comm Channels | 7 | BUG-009, BUG-011 |
| Templates | 8 | BUG-009 |
| Scenarios | 19 | BUG-014–018 |
| UI Settings | 5 | — |
| UI (E2E) | 13 | — |
| **Workflows** | **22** | BUG-002, BUG-008, BUG-017 |
| **TOTAL** | **164** | **18 bugs** |
