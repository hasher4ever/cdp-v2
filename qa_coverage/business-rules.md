# Business Rule Coverage

**Source:** CLAUDE.md, docs/BACKEND-SPEC.md, docs/QA-HANDBOOK.md, tests_business/test-data.ts
**Last checked:** 2026-03-30

## Rules

| # | Rule | Type | Tested? | Test Location | Priority | Notes |
|---|------|------|---------|---------------|----------|-------|
| BR.01 | Schema field goes through draft -> applied -> ready lifecycle | State transition | Tested | tests_business/schema-lifecycle.test.ts, tests_business/schema-apply-verify.test.ts | 3 | Full lifecycle: create draft, verify pending, apply, verify live |
| BR.02 | Draft field visible with exclude_draft=false, hidden with exclude_draft=true | State transition | Tested | tests_business/schema-lifecycle.test.ts, tests_business/schema-apply-verify.test.ts | 3 | Both customer and event fields tested |
| BR.03 | Draft cancel discards all pending changes, numberOfChanges returns to 0 | State transition | Tested | tests_business/schema-lifecycle.test.ts, tests_business/schema-apply-verify.test.ts | 3 | |
| BR.04 | Apply is atomic -- all pending changes committed together | State transition | Partial | tests_business/schema-apply-verify.test.ts | 6 | Implicitly tested via multi-field apply, no explicit atomicity failure test |
| BR.05 | Adding existing field returns 409 Conflict | Validation | Untested | -- | 2 | Documented in BACKEND-SPEC but no test verifies 409 on duplicate field |
| BR.06 | Applying with no changes returns 200 with no effect | Validation | Untested | -- | 2 | Documented but not tested |
| BR.07 | After apply, ~3s propagation delay before fields usable | Side effect | Partial | tests_business/global-setup.ts (implicit delay) | 4 | Delay exists in setup, but no test asserts field unusable before propagation |
| BR.08 | Column names auto-generated per type (col__varchar__N, col__double__N etc.) | Data integrity | Tested | tests_business/tenant-context.ts, tests_business/schema-apply-verify.test.ts | 3 | Field map resolution validates this |
| BR.09 | Column naming varies between tenants -- must never hardcode | Data integrity | Tested | tests_business/tenant-context.ts (custField/evtField) | 3 | Architecture ensures dynamic resolution |
| BR.10 | Customer ingestion: primary_id mandatory, unique, upsert on duplicate | Data integrity | Tested | tests_business/event-detail-and-ingest.test.ts | 6 | Tests reject without primary_id; accept with only primary_id; no upsert test |
| BR.11 | Ingestion: unknown fields silently dropped, listed in ignoredFields | Side effect | Tested | tests_business/event-detail-and-ingest.test.ts | 5 | Verifies ignoredFields contains unknown field names |
| BR.12 | Customer ingestion: field names must match apiName, not internal column | Data integrity | Tested | tests_business/data-filtering.test.ts | 3 | Implicitly -- data ingested via apiName is queryable |
| BR.13 | Event ingestion: primary_id links event to customer | Data integrity | Tested | tests_business/data-filtering.test.ts | 3 | Alice (P+0) has 3 events verified |
| BR.14 | Event ingestion: event_type must match existing applied type | Validation | Partial | tests_business/event-detail-and-ingest.test.ts | 5 | Tests reject event without event_type, but no test with invalid event_type name |
| BR.15 | Event ingestion: event without primary_id rejected | Validation | Tested | tests_business/event-detail-and-ingest.test.ts | 2 | |
| BR.16 | Event ingestion: event without event_type rejected | Validation | Tested | tests_business/event-detail-and-ingest.test.ts | 2 | |
| BR.17 | Ingestion is async: data not queryable until pipeline processes it | Side effect | Tested | tests_business/global-setup.ts (polling) | 6 | globalSetup polls until data lands |
| BR.18 | UDAF SUM(total_price) for Dave = 2000 (4 x 500) | Calculation | Tested | tests_business/udaf-logic.test.ts, tests_business/udaf-field-types.test.ts | 3 | |
| BR.19 | UDAF SUM(total_price) for Alice = 400 (150+200+50) | Calculation | Tested | tests_business/udaf-field-types.test.ts | 3 | |
| BR.20 | UDAF AVG(total_price) for Alice = 133.33 (400/3) | Calculation | Tested | tests_business/udaf-field-types.test.ts | 3 | |
| BR.21 | UDAF MIN(total_price) for Alice = 50 | Calculation | Tested | tests_business/udaf-field-types.test.ts | 3 | |
| BR.22 | UDAF MAX(total_price) for Bob = 999.99 | Calculation | Tested | tests_business/udaf-field-types.test.ts | 3 | |
| BR.23 | UDAF COUNT for Alice = 3 purchases | Calculation | Tested | tests_business/udaf-field-types.test.ts | 3 | |
| BR.24 | UDAF COUNT for Eve = 0 (no events) | Calculation | Tested | tests_business/udaf-logic.test.ts, tests_business/udaf-field-types.test.ts | 3 | |
| BR.25 | UDAF SUM/AVG/COUNT for customer with 0 events returns null/0 | Calculation | Tested | tests_business/udaf-field-types.test.ts | 3 | Eve tested for SUM, COUNT, AVG |
| BR.26 | UDAF SUM(delivery_cost) for Dave = 45 (0+15+20+10) | Calculation | Tested | tests_business/udaf-field-types.test.ts | 3 | |
| BR.27 | UDAF MIN(delivery_cost) for Dave = 0 | Calculation | Tested | tests_business/udaf-field-types.test.ts | 3 | |
| BR.28 | UDAF MAX(delivery_cost) for Frank = 30 | Calculation | Tested | tests_business/udaf-field-types.test.ts | 3 | |
| BR.29 | UDAF SUM(total_quantity) for Bob = 3 (2+1) | Calculation | Tested | tests_business/udaf-field-types.test.ts | 5 | BUG-006: returns null for Bob consistently |
| BR.30 | UDAF SUM(total_quantity) for Frank = 8 (5+2+1) | Calculation | Tested | tests_business/udaf-field-types.test.ts | 5 | Works for Frank but not Bob per BUG-006 |
| BR.31 | UDAF with event filter (delivery_city = Tashkent) SUM for Dave = 2000 | Calculation | Tested | tests_business/udaf-logic.test.ts | 3 | |
| BR.32 | UDAF with event filter (delivery_city = Samarkand) COUNT for Bob = 2 | Calculation | Tested | tests_business/udaf-field-types.test.ts | 3 | |
| BR.33 | UDAF with combined AND filter (city=Tashkent AND payment=card) COUNT for Dave = 3 | Calculation | Tested | tests_business/udaf-field-types.test.ts | 3 | |
| BR.34 | UDAF with numeric > filter (total_price > 400) SUM for Dave = 2000 | Calculation | Tested | tests_business/udaf-field-types.test.ts | 3 | |
| BR.35 | UDAF with RELATIVE time window (365 day) COUNT for Alice = 3 | Calculation | Tested | tests_business/udaf-logic.test.ts, tests_business/udaf-field-types.test.ts | 5 | BUG-002: consistently returns 0 |
| BR.36 | UDAF with ABSOLUTE past time window (2020) returns 0 | Calculation | Tested | tests_business/udaf-field-types.test.ts | 3 | |
| BR.37 | UDAF materialization is async -- not instant after creation | Side effect | Tested | tests_business/global-setup.ts (probe UDAF polling) | 6 | |
| BR.38 | UDAF calculate returns inconsistent casing: result vs Result | Data integrity | Tested | tests_business/udaf-logic.test.ts (udafValue helper) | 3 | Helper handles both formats |
| BR.39 | UDAF params must use internal column names, not apiNames | Data integrity | Tested | all udaf tests use evtField() resolver | 3 | |
| BR.40 | UDAF requires params for SUM/AVG/MIN/MAX but not COUNT | Validation | Tested | tests_backend/input-validation.test.ts | 4 | BUG-026: returns 409 instead of 400 |
| BR.41 | UDAF with non-existent event type should fail | Validation | Tested | tests_backend/input-validation.test.ts | 2 | |
| BR.42 | UDAF with invalid aggType should fail | Validation | Tested | tests_backend/input-validation.test.ts | 2 | |
| BR.43 | UDAF empty name accepted (BUG-022) | Validation | Tested | tests_backend/input-validation.test.ts | 4 | Test documents the bug |
| BR.44 | UDAF PUT update returns 400 (BUG-025) | Validation | Untested | -- | 4 | Documented in bugs.md but no test file verifies PUT /api/tenants/udafs/{id} |
| BR.45 | UDAF calculate for non-existent customer returns 500 (BUG-027) | Boundary | Untested | -- | 3 | Documented in bugs.md but no test |
| BR.46 | Segmentation: gender = female -> 4 | Calculation | Tested | tests_business/segmentation-field-types.test.ts | 3 | |
| BR.47 | Segmentation: gender != female -> 6 (5 male + 1 other) | Calculation | Tested | tests_business/segmentation-field-types.test.ts | 3 | |
| BR.48 | Segmentation: gender IN [male, other] -> 6 | Calculation | Tested | tests_business/segmentation-field-types.test.ts | 3 | |
| BR.49 | Segmentation: is_adult = true -> 8 | Calculation | Tested | tests_business/segmentation-field-types.test.ts | 3 | |
| BR.50 | Segmentation: is_adult = false -> 2 | Calculation | Tested | tests_business/segmentation-field-types.test.ts | 3 | |
| BR.51 | Segmentation: income > 100000 -> 3 | Calculation | Tested | tests_business/segmentation-field-types.test.ts | 3 | |
| BR.52 | Segmentation: income = 0 -> 3 | Calculation | Tested | tests_business/segmentation-field-types.test.ts | 3 | |
| BR.53 | Segmentation: age > 50 -> 2 (Dave, Frank) | Calculation | Tested | tests_business/segmentation-field-types.test.ts | 3 | |
| BR.54 | Segmentation: age >= 25 AND <= 35 -> 5 | Calculation | Tested | tests_business/segmentation-field-types.test.ts | 3 | |
| BR.55 | Segmentation: birthdate > 2000-01-01 -> 4 | Calculation | Tested | tests_business/segmentation-field-types.test.ts | 3 | |
| BR.56 | Segmentation: "is not null" on gender -> 10 | Calculation | Tested | tests_business/segmentation-field-types.test.ts | 3 | |
| BR.57 | Segmentation: nested AND > OR group: adult AND (female OR income>100K) -> 6 | Calculation | Tested | tests_business/segmentation-complex.test.ts | 3 | |
| BR.58 | Segmentation: nested OR > AND groups: (fem+sub) OR (male+>100K) -> 6 | Calculation | Tested | tests_business/segmentation-complex.test.ts | 3 | |
| BR.59 | Segmentation: triple nested groups -> 4 | Calculation | Tested | tests_business/segmentation-complex.test.ts | 3 | |
| BR.60 | Segmentation: NEGATE on nested group NOT(male AND income>100K) -> 7 | Calculation | Tested | tests_business/segmentation-complex.test.ts | 3 | |
| BR.61 | Segmentation: multi-segment (3 segments: High/Mid/Zero income) | Calculation | Tested | tests_business/segmentation-complex.test.ts | 3 | |
| BR.62 | Segmentation: impossible condition -> 0 | Calculation | Tested | tests_business/segmentation-complex.test.ts | 3 | |
| BR.63 | Segmentation: empty predicate -> all customers (10) | Calculation | Tested | tests_business/segmentation-complex.test.ts | 3 | |
| BR.64 | Segmentation with UDAF predicate: COUNT > 0 -> 8 customers with events | Calculation | Tested | tests_business/segmentation-udaf.test.ts | 6 | Cross-entity: UDAF + segmentation |
| BR.65 | Segmentation with UDAF: COUNT = 0 -> 2 (Eve, Jun) | Calculation | Tested | tests_business/segmentation-udaf.test.ts | 6 | |
| BR.66 | Segmentation with UDAF: COUNT >= 3 -> 3 (Alice, Dave, Frank) | Calculation | Tested | tests_business/segmentation-udaf.test.ts | 6 | |
| BR.67 | Segmentation with UDAF: SUM total_price > 1000 -> 3 | Calculation | Tested | tests_business/segmentation-udaf.test.ts | 6 | |
| BR.68 | Segmentation: combined customer field + UDAF predicate (female AND COUNT > 0) -> 3 | Calculation | Tested | tests_business/segmentation-udaf.test.ts | 6 | |
| BR.69 | Segmentation: OR with UDAF (female OR COUNT > 3) -> 5 | Calculation | Tested | tests_business/segmentation-udaf.test.ts | 6 | |
| BR.70 | Segmentation empty name accepted (BUG-019) | Validation | Tested | tests_backend/input-validation.test.ts | 4 | Test documents bug |
| BR.71 | Segmentation empty segments array accepted (BUG-020) | Validation | Tested | tests_backend/input-validation.test.ts | 4 | Test documents bug |
| BR.72 | Segmentation stored XSS in name (BUG-021) | Validation | Tested | tests_backend/input-validation.test.ts | 4 | Test documents bug |
| BR.73 | Segmentation preview with empty name accepted (BUG-003) | Validation | Untested | -- | 2 | Documented in bugs.md, no dedicated test |
| BR.74 | Segment detail page crashes on null predicate (BUG-028) | Side effect | Untested | -- | 5 | High severity: app crash. Documented in bugs.md |
| BR.75 | V2 orderBy format: { direction: "ASC", param: { fieldName, kind } } | Data integrity | Tested | tests_business/v2-data-query.test.ts | 3 | |
| BR.76 | V2 sort by income ASC orders correctly | Calculation | Tested | tests_business/v2-data-query.test.ts | 3 | |
| BR.77 | V2 sort by income DESC orders correctly | Calculation | Tested | tests_business/v2-data-query.test.ts | 3 | |
| BR.78 | V2 multi-column sort (gender ASC then income DESC) | Calculation | Tested | tests_business/pagination-edge-cases.test.ts | 3 | |
| BR.79 | V2 pagination: page 0 and page 1 return different rows (with orderBy) | Boundary | Tested | tests_business/v2-data-query.test.ts | 4 | |
| BR.80 | V2 pagination: all pages cover all customers (10) | Boundary | Tested | tests_business/v2-data-query.test.ts | 4 | |
| BR.81 | V2 pagination without orderBy: overlapping rows (BUG-008) | Boundary | Partial | tests_business/v2-data-query.test.ts | 3 | Test uses orderBy to avoid bug; no test that explicitly asserts BUG-008 |
| BR.82 | V2 UDAF as column: rows contain UDAF values keyed by udafId | Side effect | Tested | tests_business/v2-data-query.test.ts | 6 | Cross-entity |
| BR.83 | V2 events: filter by delivery_city = Tashkent -> 9 | Calculation | Tested | tests_business/v2-events-query.test.ts | 3 | |
| BR.84 | V2 events: filter by delivery_city = Samarkand -> 5 | Calculation | Tested | tests_business/v2-events-query.test.ts | 3 | |
| BR.85 | V2 events: filter by delivery_city = Bukhara -> 4 | Calculation | Tested | tests_business/v2-events-query.test.ts | 3 | |
| BR.86 | V2 events: payment_type = card -> 12 | Calculation | Tested | tests_business/v2-events-query.test.ts | 3 | |
| BR.87 | V2 events: payment_type = cash -> 6 | Calculation | Tested | tests_business/v2-events-query.test.ts | 3 | |
| BR.88 | V2 events: total_price >= 500 -> 7 | Calculation | Tested | tests_business/v2-events-query.test.ts | 3 | |
| BR.89 | V2 events: combined city=Tashkent AND payment=card -> 6 | Calculation | Tested | tests_business/v2-events-query.test.ts | 3 | |
| BR.90 | V2 events: purchase_status = pending -> 2 | Calculation | Tested | tests_business/v2-events-query.test.ts | 3 | |
| BR.91 | V2 events: sort by total_price ASC/DESC | Calculation | Tested | tests_business/v2-events-query.test.ts | 3 | |
| BR.92 | Negative page number causes 500 (BUG-023) | Boundary | Tested | tests_backend/input-validation.test.ts | 3 | Test documents the 500 |
| BR.93 | Page beyond data returns empty list | Boundary | Tested | tests_business/pagination-edge-cases.test.ts | 1 | |
| BR.94 | Size=0 returns empty or 400 | Boundary | Tested | tests_business/pagination-edge-cases.test.ts | 1 | |
| BR.95 | Size larger than total returns all records | Boundary | Tested | tests_business/pagination-edge-cases.test.ts | 1 | |
| BR.96 | Sort by every field type (VARCHAR, BIGINT, DOUBLE, BOOL, DATE) ASC+DESC | Boundary | Tested | tests_business/pagination-edge-cases.test.ts | 1 | |
| BR.97 | Autocomplete: customer VARCHAR field prefix match | Side effect | Tested | tests_business/autocomplete.test.ts | 3 | |
| BR.98 | Autocomplete: event VARCHAR field returns cities | Side effect | Tested | tests_business/autocomplete.test.ts | 5 | BUG-001: event autocomplete returns 500 on shared tenant |
| BR.99 | Autocomplete: respects size limit | Boundary | Tested | tests_business/autocomplete.test.ts | 1 | |
| BR.100 | Autocomplete: non-matching prefix returns empty | Boundary | Tested | tests_business/autocomplete.test.ts | 1 | |
| BR.101 | Customer data verification: all 10 customers queryable | Data integrity | Tested | tests_business/data-filtering.test.ts | 3 | |
| BR.102 | Customer data: Alice field values match ingested data | Data integrity | Tested | tests_business/data-filtering.test.ts | 3 | |
| BR.103 | Event data: Alice has 3 events, Eve has 0, Dave has 4 | Data integrity | Tested | tests_business/data-filtering.test.ts | 3 | |
| BR.104 | Total customer count = 10 in fresh tenant | Data integrity | Tested | tests_business/data-filtering.test.ts | 3 | |
| BR.105 | Total purchase event count = 18 | Data integrity | Tested | tests_business/data-filtering.test.ts | 3 | |
| BR.106 | Field reports: gender value distribution correct (female=4) | Calculation | Tested | tests_business/v2-data-query.test.ts | 3 | |
| BR.107 | Field reports: sort by count ASC/DESC, sort by value | Calculation | Tested | tests_business/v2-data-query.test.ts, tests_business/pagination-edge-cases.test.ts | 3 | |
| BR.108 | Campaign: create with channel + template + segment -> preview count = 8 adults | Calculation | Tested | tests_business/campaign-logic.test.ts, tests_business/full-workflow.test.ts | 6 | Cross-entity workflow |
| BR.109 | Campaign: include + exclude segments targeting | Calculation | Tested | tests_business/campaign-logic.test.ts | 6 | Adults included, minors excluded |
| BR.110 | Campaign: campaign details link commchan, template, segments | Data integrity | Tested | tests_business/campaign-logic.test.ts | 3 | |
| BR.111 | Campaign: send via blackhole channel succeeds (204) | Side effect | Tested | tests_business/event-detail-and-ingest.test.ts | 3 | |
| BR.112 | CommChan: create blackhole channel, verify returns verified=true | State transition | Tested | tests_business/campaign-logic.test.ts | 3 | |
| BR.113 | CommChan: update name via PUT reflects on GET | State transition | Tested | tests_business/crud-update.test.ts | 3 | |
| BR.114 | Template: create HTML template with variables | State transition | Tested | tests_business/full-workflow.test.ts | 3 | |
| BR.115 | Template: content_type and subject match after creation | Data integrity | Tested | tests_business/full-workflow.test.ts | 3 | |
| BR.116 | DELETE segmentation: create -> delete -> 404 on GET | State transition | Tested | tests_business/crud-delete.test.ts | 3 | BUG-009: was documented but test shows it works on fresh tenant |
| BR.117 | DELETE campaign: create -> delete -> 404 | State transition | Tested | tests_business/crud-delete.test.ts | 3 | |
| BR.118 | DELETE commchan: create -> delete -> 404 | State transition | Tested | tests_business/crud-delete.test.ts | 5 | BUG-009: documented as returning 400; test checks |
| BR.119 | DELETE template: create -> delete -> 404 | State transition | Tested | tests_business/crud-delete.test.ts | 5 | BUG-009: documented as returning 400; test checks |
| BR.120 | DELETE customer schema field (draft) | State transition | Tested | tests_business/crud-delete.test.ts | 3 | |
| BR.121 | DELETE event type field (draft) | State transition | Tested | tests_business/crud-delete.test.ts | 3 | |
| BR.122 | UPDATE customer schema field displayName | State transition | Tested | tests_business/crud-update.test.ts | 3 | |
| BR.123 | UPDATE event type field displayName | State transition | Tested | tests_business/crud-update.test.ts | 3 | |
| BR.124 | Schema API name validation: lowercase_snake_case accepted | Validation | Tested | tests_business/schema-apply-verify.test.ts | 2 | |
| BR.125 | Schema API name validation: spaces rejected | Validation | Tested | tests_business/schema-apply-verify.test.ts | 2 | |
| BR.126 | Schema API name validation: starts with number rejected | Validation | Tested | tests_business/schema-apply-verify.test.ts | 2 | |
| BR.127 | Schema API name validation: existing name flagged | Validation | Tested | tests_business/schema-apply-verify.test.ts | 2 | |
| BR.128 | Event API name validation: valid name accepted | Validation | Tested | tests_business/crud-update.test.ts | 2 | |
| BR.129 | Event API name validation: uppercase rejected (400) | Validation | Tested | tests_business/crud-update.test.ts | 2 | |
| BR.130 | All 5 field types create successfully (VARCHAR, BIGINT, DOUBLE, BOOL, DATE) | State transition | Tested | tests_business/schema-apply-verify.test.ts | 3 | |
| BR.131 | File upload: 3-step init -> part -> complete flow works | State transition | Tested | tests_business/file-upload.test.ts | 3 | |
| BR.132 | File upload: JSON extension accepted | Validation | Tested | tests_business/file-upload.test.ts | 1 | |
| BR.133 | File upload: complete without part fails or empty | Validation | Tested | tests_business/file-upload.test.ts | 1 | |
| BR.134 | File upload: invalid objectId rejected | Validation | Tested | tests_business/file-upload.test.ts | 1 | |
| BR.135 | CSV paste endpoint returns 500 "implement me" (BUG-013) | Validation | Tested | tests_business/file-upload.test.ts | 4 | Test documents the bug |
| BR.136 | Tenant isolation: tenant 2 has 0 customers (fresh) | Data integrity | Tested | tests_business/tenant-isolation.test.ts | 6 | Cross-tenant |
| BR.137 | Tenant isolation: tenant 2 cannot see tenant 1's customers | Data integrity | Tested | tests_business/tenant-isolation.test.ts | 6 | |
| BR.138 | Tenant isolation: segmentation not visible across tenants | Data integrity | Tested | tests_business/tenant-isolation.test.ts | 6 | |
| BR.139 | Tenant isolation: UDAFs not visible across tenants | Data integrity | Tested | tests_business/tenant-isolation.test.ts | 6 | |
| BR.140 | Tenant isolation: campaigns, commchans, scenarios, templates isolated | Data integrity | Tested | tests_business/tenant-isolation.test.ts | 6 | |
| BR.141 | Tenant isolation: schema is different per tenant | Data integrity | Tested | tests_business/tenant-isolation.test.ts | 6 | |
| BR.142 | Scenario CRUD: create returns id + name | State transition | Tested | tests_backend/scenario-builder.test.ts | 3 | |
| BR.143 | Scenario: list with pagination | Boundary | Tested | tests_backend/scenario-builder.test.ts, tests_backend/scenario-lifecycle.test.ts | 1 | |
| BR.144 | Scenario: get-by-id returns nodes + edges | State transition | Tested | tests_backend/scenario-builder.test.ts | 3 | |
| BR.145 | Scenario: node_trigger (trigger_now) creation | State transition | Tested | tests_backend/scenario-builder.test.ts | 3 | |
| BR.146 | Scenario: node_wait (static_wait) creation | State transition | Tested | tests_backend/scenario-builder.test.ts | 3 | |
| BR.147 | Scenario: node_branch with predicate creation | State transition | Tested | tests_backend/scenario-builder.test.ts | 3 | |
| BR.148 | Scenario: node_action with invalid commchan/template -> 409 | Validation | Tested | tests_backend/scenario-builder.test.ts | 2 | |
| BR.149 | Scenario: node_action with valid commchan + template | State transition | Tested | tests_backend/scenario-builder.test.ts | 3 | |
| BR.150 | Scenario: edge link_next_node between nodes | State transition | Tested | tests_backend/scenario-builder.test.ts, tests_backend/scenario-lifecycle.test.ts | 3 | |
| BR.151 | Scenario: branch node yes/no edges (link_yes_branch, link_no_branch) | State transition | Tested | tests_backend/scenario-lifecycle.test.ts | 3 | |
| BR.152 | Scenario: save-changes on scenario with nodes | State transition | Tested | tests_backend/scenario-builder.test.ts | 5 | BUG-017: returns 500 |
| BR.153 | Scenario: save empty scenario returns 409 | Validation | Tested | tests_backend/scenario-builder.test.ts | 2 | |
| BR.154 | Scenario: whitespace-only name accepted (BUG-014) | Validation | Untested | -- | 2 | Documented in bugs.md but no test |
| BR.155 | Scenario: empty name accepted (BUG-030) | Validation | Untested | -- | 2 | Documented in bugs.md but no test |
| BR.156 | Scenario: XSS in name stored as-is (BUG-015) | Validation | Untested | -- | 4 | Documented in bugs.md, no test in tests_backend |
| BR.157 | Scenario: wait node accepts 0 and negative duration (BUG-016) | Validation | Untested | -- | 4 | Documented in bugs.md, no test |
| BR.158 | Scenario: edge accepts non-existent node IDs (BUG-018) | Validation | Untested | -- | 4 | Documented in bugs.md, no test |
| BR.159 | Scenario: delete scenario | State transition | Tested | tests_backend/scenario-lifecycle.test.ts | 3 | |
| BR.160 | Scenario: multiple trigger nodes allowed | Validation | Tested | tests_backend/scenario-lifecycle.test.ts | 2 | |
| BR.161 | Scenario: duplicate edge handling | Validation | Tested | tests_backend/scenario-lifecycle.test.ts | 2 | |
| BR.162 | Scenario: self-loop edge handling | Validation | Tested | tests_backend/scenario-lifecycle.test.ts | 2 | |
| BR.163 | UI settings: save and retrieve column configuration | Side effect | Tested | tests_business/v2-data-query.test.ts | 3 | |
| BR.164 | UI settings: very long key causes 500 (BUG-024) | Boundary | Tested | tests_backend/input-validation.test.ts | 3 | |
| BR.165 | Auth: reject empty signin body | Validation | Tested | tests_backend/input-validation.test.ts | 2 | |
| BR.166 | Auth: reject expired/malformed JWT | Validation | Tested | tests_backend/input-validation.test.ts | 2 | |
| BR.167 | Auth: reject no auth header on protected endpoint | Validation | Tested | tests_backend/input-validation.test.ts | 2 | |
| BR.168 | Ingest: batch of mixed valid/invalid -- accepted=2, rejected=1 | Data integrity | Tested | tests_business/event-detail-and-ingest.test.ts | 3 | |
| BR.169 | Ingest: empty array handled gracefully | Boundary | Tested | tests_business/event-detail-and-ingest.test.ts | 1 | |
| BR.170 | Ingest: customer with only primary_id accepted | Validation | Tested | tests_business/event-detail-and-ingest.test.ts | 2 | |
| BR.171 | Event detail: GET /api/tenant/data/events/{compositeId} returns 500 (BUG-010) | State transition | Tested | tests_business/event-detail-and-ingest.test.ts | 4 | Test expects 200 or 404, documents bug |
| BR.172 | Employee creation returns 500 (BUG-012) | State transition | Untested | -- | 5 | High severity bug, no automated test |
| BR.173 | Specific field mapping (email) via PUT /api/tenant/specific-fields | Side effect | Tested | tests_business/full-workflow.test.ts | 3 | |
| BR.174 | UDAF grouping toggle (enable: true) | Calculation | Untested | -- | 4 | All tests use enable: false; no test with grouping enabled |
| BR.175 | UDAF with OR predicate (combining multiple conditions with OR) | Calculation | Untested | -- | 4 | All UDAF filter tests use AND; no OR filter on events |
| BR.176 | UDAF with NEGATE predicate | Calculation | Untested | -- | 4 | Segmentation tests NEGATE, but no UDAF with negated event filter |
| BR.177 | Segmentation: "is null" operator | Calculation | Untested | -- | 4 | "is not null" tested, but "is null" never tested |
| BR.178 | Segmentation: <= on VARCHAR (lexicographic) | Calculation | Untested | -- | 1 | Edge case, low priority |
| BR.179 | Customer ingestion: duplicate primary_id upsert (last-write-wins) | Data integrity | Untested | -- | 7 | Documented in BACKEND-SPEC but never tested; critical data integrity |
| BR.180 | Events for non-existent customers: behavior undefined | Data integrity | Untested | -- | 4 | Documented as "may create orphaned events" |
| BR.181 | UDAF recalculation after new data ingestion | Side effect | Untested | -- | 7 | Documented: new data -> UDAF recalc needed. No test ingests AFTER UDAF creation |
| BR.182 | Schema: DATETIME field type | State transition | Untested | -- | 2 | Schema lists DATETIME as valid type but no test creates/uses it |
| BR.183 | Schema: JSON field type | State transition | Untested | -- | 2 | Schema lists JSON as valid type but no test creates/uses it |
| BR.184 | Predicate param kind: "udaf" + artifactId in UDAF filter (nested UDAF ref) | Calculation | Untested | -- | 4 | Segmentation uses UDAF predicates, but no UDAF filter references another UDAF |
| BR.185 | V2 events: filter with NEGATE group | Calculation | Untested | -- | 4 | Event filtering tested with AND only, no NEGATE |
| BR.186 | V2 events: filter with OR combinator | Calculation | Untested | -- | 4 | Event filtering tested with AND only, no OR |
| BR.187 | Scenario: trigger_on_date trigger type | State transition | Untested | -- | 3 | Only trigger_now tested; trigger_on_date never exercised |
| BR.188 | Scenario: trigger_on_event trigger type | State transition | Untested | -- | 3 | Only trigger_now tested; trigger_on_event never exercised |
| BR.189 | Scenario: webhook action type | State transition | Untested | -- | 3 | Only email action tested; webhook never exercised |
| BR.190 | Duplicate displayName in schema fields (BUG-031) | Data integrity | Untested | -- | 2 | Documented in bugs.md, only observed on shared tenant |
| BR.191 | UDAF SUM(total_price) for Bob = 1499.99 | Calculation | Untested | -- | 3 | EXPECTED value defined but no explicit test |
| BR.192 | UDAF SUM(total_price) for Frank = 1350 | Calculation | Untested | -- | 3 | EXPECTED value defined but no explicit test |
| BR.193 | Campaign: exclude segment removes customers from campaign reach | Calculation | Partial | tests_business/campaign-logic.test.ts | 6 | Test expects adultsCount but exclude is minors; no test excludes a non-trivial overlap |

## Top Untested Rules (by priority)

1. **BR.179** -- Customer ingestion: duplicate primary_id upsert (last-write-wins) (P-7)
2. **BR.181** -- UDAF recalculation triggered by new data ingestion after UDAF creation (P-7)
3. **BR.172** -- Employee creation endpoint returns 500 (BUG-012) (P-5)
4. **BR.74** -- Segment detail page crashes on null predicate (BUG-028) (P-5)
5. **BR.174** -- UDAF grouping toggle (enable: true) never tested (P-4)
6. **BR.175** -- UDAF with OR predicate in event filter (P-4)
7. **BR.176** -- UDAF with NEGATE predicate in event filter (P-4)
8. **BR.177** -- Segmentation "is null" operator never tested (P-4)
9. **BR.156** -- Scenario XSS in name stored as-is (BUG-015) (P-4)
10. **BR.157** -- Scenario wait node accepts 0/negative duration (BUG-016) (P-4)
11. **BR.158** -- Scenario edge accepts non-existent node IDs (BUG-018) (P-4)
12. **BR.44** -- UDAF PUT update returns 400 (BUG-025) (P-4)
13. **BR.45** -- UDAF calculate for non-existent customer returns 500 (BUG-027) (P-3)
14. **BR.180** -- Events for non-existent customers may create orphaned events (P-4)
15. **BR.184** -- Nested UDAF reference in UDAF filter (P-4)
16. **BR.185** -- V2 events filter with NEGATE group (P-4)
17. **BR.186** -- V2 events filter with OR combinator (P-4)
18. **BR.187** -- Scenario trigger_on_date never exercised (P-3)
19. **BR.188** -- Scenario trigger_on_event never exercised (P-3)
20. **BR.189** -- Scenario webhook action type never exercised (P-3)

## Coverage Summary

| Metric | Count |
|--------|-------|
| Total rules | 193 |
| Tested | 155 |
| Partial | 8 |
| Untested | 30 |
| **Coverage** | **80%** |
