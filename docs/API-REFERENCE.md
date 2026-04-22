# CDP API Reference

> Complete endpoint reference for QA testing. All endpoints at `cdpv2.ssd.uz`.

## Authentication

All `/api/*` endpoints require `Authorization: Bearer <token>` header.
Public endpoints (`/public/*`, `/cdp-ingest/*`) require no auth.

### Get a Token

> **See [AUTH.md](AUTH.md) for full details and gotchas.**

```bash
curl -X POST https://cdpv2.ssd.uz/public/api/signin \
  -H "Content-Type: application/json" \
  -d '{"username":"YOUR_EMAIL","password":"YOUR_PASSWORD","domainName":"YOUR_DOMAIN"}'
```

Response: `{ "jwtToken": "eyJhb..." }`

**Note:** Body uses `username` + `domainName` (not `email`/`domain`). Response field is `jwtToken` (not `token`).

---

## 1. Auth & Tenant

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| POST | `/public/api/signin` | No | Sign in, get JWT |
| POST | `/public/api/signup` | No | Create new tenant |
| POST | `/api/tenant/employee` | Yes | Create employee (BUG-012: 500) |
| GET | `/api/tenants/info` | Yes | Tenant info + schema metadata |

### POST /public/api/signup

```json
{
  "domain": "test_1234567890.cdp.com",
  "email": "test@cdp.ru",
  "password": "qwerty123",
  "companyName": "Test Corp"
}
```

---

## 2. Schema — Customer Fields

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| GET | `/api/tenants/schema/customers/fields` | Yes | List all customer fields |
| POST | `/api/tenants/schema/customers/fields` | Yes | Create customer field (draft) |
| PUT | `/api/tenants/schema/customers/fields` | Yes | Update customer field |
| DELETE | `/api/tenants/schema/customers/fields?field_id=X` | Yes | Delete draft field |
| POST | `/api/tenants/schema/customers/validate-api-name` | Yes | Check API name uniqueness |

### Create Customer Field

```json
{
  "apiName": "gender",
  "displayName": "Gender",
  "fieldType": "VARCHAR",
  "description": "Customer gender"
}
```

Field types: `VARCHAR`, `BOOL`, `DOUBLE`, `BIGINT`, `DATE`

---

## 3. Schema — Event Types

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| GET | `/api/tenants/schema/event-types` | Yes | List event types |
| POST | `/api/tenants/schema/event-types` | Yes | Create event type |
| GET | `/api/tenants/schema/event-types/get-by-id?id=UUID` | Yes | Get event type by ID |
| PUT | `/api/tenants/schema/event-types?id=UUID` | Yes | Update event type |
| DELETE | `/api/tenants/schema/event-types?id=UUID` | Yes | Delete draft event type |
| GET | `/api/tenants/schema/event-types-name-exists?name=X` | Yes | Check name exists |

### Create Event Type

```json
{
  "apiName": "purchase",
  "displayName": "Purchase"
}
```

---

## 4. Schema — Event Fields

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| GET | `/api/tenants/schema/events/fields/{eventTypeId}` | Yes | List fields for event type |
| POST | `/api/tenants/schema/events/fields/{eventTypeId}` | Yes | Create event field (draft) |
| PUT | `/api/tenants/schema/events/fields/{eventTypeId}` | Yes | Update event field |
| DELETE | `/api/tenants/schema/events/fields/{eventTypeId}?field_id=X` | Yes | Delete event field |
| POST | `/api/tenants/schema/events/validate-api-name/{eventTypeId}` | Yes | Validate API name |

---

## 5. Schema — Draft Lifecycle

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| GET | `/api/tenants/schema/draft-schema/status` | Yes | Pending change count |
| POST | `/api/tenants/schema/draft-schema/apply` | Yes | Apply all drafted changes |
| DELETE | `/api/tenants/schema/draft-schema/cancel` | Yes | Discard pending changes |

### Typical Flow

```
Create fields → Check status (count > 0) → Apply → Verify fields are live
```

---

## 6. Schema — Internal Field Info

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| GET | `/api/tenants/schema/internal/customers/fields/info` | Yes | Customer field metadata + internal names |
| GET | `/api/tenants/schema/internal/events/fields/info` | Yes | Event field metadata + internal names |

Returns mapping of `apiName` → `col__type__N` for use in data queries.

---

## 7. Data Ingestion (Public)

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| POST | `/cdp-ingest/ingest/tenant/{tenantId}/async/customers` | No | Ingest customer records |
| POST | `/cdp-ingest/ingest/tenant/{tenantId}/async/events` | No | Ingest event records |

### Ingest Customers

```json
[
  {
    "primary_id": "9900000001",
    "first_name": "Alice",
    "gender": "female",
    "age": 35
  }
]
```

### Ingest Events

```json
[
  {
    "primary_id": "9900000001",
    "event_type": "purchase",
    "purchase_id": "PUR-001",
    "total_price": 150.00,
    "delivery_city": "Tashkent"
  }
]
```

---

## 8. File Upload (Authenticated)

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| POST | `/api/file/upload/init` | Yes | Initialize upload → objectId |
| POST | `/api/file/upload/part?objectId=X` | Yes | Upload binary chunk |
| POST | `/api/file/upload/complete` | Yes | Finalize with mappings |
| POST | `/api/tenants/data/file/keys` | Yes | CSV paste (BUG-013: not implemented) |

### Step 1: Init

```json
{ "fileName": "customers.csv", "fileType": "customers" }
```

### Step 2: Part

```bash
curl -X POST "https://cdpv2.ssd.uz/api/file/upload/part?objectId=OBJECT_ID" \
  -H "Authorization: Bearer TOKEN" \
  -H "Content-Type: application/octet-stream" \
  --data-binary @customers.csv
```

### Step 3: Complete

```json
{
  "objectId": "OBJECT_ID",
  "fieldMappings": { "first_name": "col__varchar__0", "age": "col__bigint__0" }
}
```

---

## 9. Data Queries

### V1 Endpoints

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| POST | `/api/tenant/data/customers` | Yes | List customers (paginated) |
| GET | `/api/tenant/data/customers/{primaryId}` | Yes | Customer profile |
| POST | `/api/tenant/data/events` | Yes | List events (paginated) |
| GET | `/api/tenant/data/events/{compositeId}` | Yes | Event detail (BUG-010: 500) |
| GET | `/api/tenant/data/count` | Yes | Total customer + event counts |
| GET | `/api/tenant/data/event-types/count` | Yes | Per-event-type counts |

### V2 Endpoints (Undocumented)

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| POST | `/api/v2/tenant/data/customers` | Yes | Advanced query with columns/orderBy/filter |
| POST | `/api/v2/tenant/data/events` | Yes | Advanced event query |

### V2 Request Body

```json
{
  "columns": [
    { "fieldName": "col__varchar__0", "kind": "field" },
    { "fieldName": "col__double__0", "kind": "field" }
  ],
  "orderBy": {
    "direction": "ASC",
    "param": { "fieldName": "col__double__0", "kind": "field" }
  },
  "filter": {
    "combinator": "AND",
    "predicates": [
      { "fieldName": "col__bool__0", "kind": "field", "operator": "=", "value": true }
    ]
  },
  "page": 1,
  "size": 10
}
```

> **Important:** `orderBy.param` wraps the field — it's NOT `{ "fieldName": "...", "direction": "..." }`.

### Autocomplete

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| GET | `/api/tenant/data/autocomplete/field-values?field=X&q=Y&size=Z` | Yes | Field value autocomplete |

- Customer fields: works
- Event fields: BUG-001 (returns 500)

### Reports

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| GET | `/api/tenant/data/reports/field-values?field=X` | Yes | Field value distribution |

---

## 10. UDAFs (Aggregates)

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| GET | `/api/tenants/udafs` | Yes | List all UDAFs |
| POST | `/api/tenants/udafs` | Yes | Create UDAF |
| GET | `/api/tenants/udafs/{udafId}` | Yes | Get UDAF definition |
| GET | `/api/tenants/udafs/types` | Yes | List UDAF names + types |
| POST | `/api/tenants/udafs/{udafId}/calculate?primaryId=X` | Yes | Calculate for customer |

### Create UDAF

```json
{
  "name": "TEST_total_price_sum",
  "description": "Sum of total_price",
  "eventTypeId": "UUID",
  "fieldName": "col__double__0",
  "aggregationType": "SUM",
  "timeWindow": { "type": "ALL_TIME" }
}
```

Aggregation types: `SUM`, `COUNT`, `AVG`, `MIN`, `MAX`

Time windows: `ALL_TIME`, `RELATIVE` (with `{ "days": N }`)

### Calculate Response

```json
{ "value": 400.00 }
```

> **Note:** UDAF values may take 5-7 minutes to recalculate after data ingestion. BUG-002: filtered UDAFs may return null/0.

---

## 11. Segmentation

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| GET | `/api/tenants/segmentation?page=1&size=10` | Yes | List segmentations |
| POST | `/api/tenants/segmentation` | Yes | Create segmentation |
| GET | `/api/tenants/segmentation/{id}` | Yes | Get by ID |
| PUT | `/api/tenants/segmentation/{id}` | Yes | Update |
| DELETE | `/api/tenants/segmentation/{id}` | Yes | Delete (BUG-009) |
| POST | `/api/tenants/segmentation/preview` | Yes | Preview count |

### Create Segmentation

```json
{
  "name": "TEST_adult_females",
  "description": "Adult female customers",
  "predicate": {
    "combinator": "AND",
    "predicates": [
      { "fieldName": "col__varchar__2", "kind": "field", "operator": "=", "value": "female" },
      { "fieldName": "col__bool__0", "kind": "field", "operator": "=", "value": true }
    ]
  }
}
```

### Preview Response

```json
{ "count": 3 }
```

---

## 12. Campaigns

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| GET | `/api/tenants/campaign?page=1&size=10` | Yes | List campaigns |
| POST | `/api/tenants/campaign` | Yes | Create campaign |
| GET | `/api/tenants/campaign/{id}` | Yes | Get by ID |
| PUT | `/api/tenants/campaign/{id}` | Yes | Update |
| DELETE | `/api/tenants/campaign/{id}` | Yes | Delete |
| POST | `/api/tenants/campaign/compute/preview` | Yes | Preview reach |
| POST | `/api/tenants/campaign/compute/send` | Yes | Send campaign |

### Create Campaign

```json
{
  "name": "TEST_welcome_campaign",
  "segmentationId": "UUID",
  "commChanId": "UUID",
  "templateId": "UUID"
}
```

---

## 13. Communication Channels

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| GET | `/api/tenants/commchan` | Yes | List channels |
| POST | `/api/tenants/commchan` | Yes | Create channel |
| GET | `/api/tenants/commchan/{id}` | Yes | Get by ID |
| PUT | `/api/tenants/commchan/{id}` | Yes | Update (BUG-011) |
| DELETE | `/api/tenants/commchan/{id}` | Yes | Delete (BUG-009) |
| POST | `/api/tenants/commchan/validate` | Yes | Validate config |
| POST | `/api/tenants/commchan/{id}/verify` | Yes | Verify credentials |

### Create Channel

```json
{
  "name": "TEST_blackhole",
  "channelType": "email",
  "config": { "host": "smtp.example.com", "port": 587 }
}
```

---

## 14. Templates

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| GET | `/api/tenant/template?page=1&size=10` | Yes | List templates |
| POST | `/api/tenant/template` | Yes | Create template |
| GET | `/api/tenant/template/{id}` | Yes | Get by ID |
| PUT | `/api/tenant/template/{id}` | Yes | Update |
| DELETE | `/api/tenant/template/{id}` | Yes | Delete (BUG-009) |

### Create Template

```json
{
  "name": "TEST_welcome_email",
  "subject": "Welcome!",
  "body": "Hello {{first_name}}!",
  "contentType": "text"
}
```

Content types: `text`, `html`, `json`

---

## 15. Scenarios (Undocumented)

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| GET | `/api/tenant/scenario/crud?page=1&size=10` | Yes | List scenarios |
| POST | `/api/tenant/scenario/crud` | Yes | Create scenario |
| GET | `/api/tenant/scenario/crud/get-by-id?id=UUID` | Yes | Get with nodes/edges |
| POST | `/api/tenant/scenario/crud/save-changes` | Yes | Save (BUG-017: 500) |
| POST | `/api/tenant/scenario/node/crud` | Yes | Create/update node |
| POST | `/api/tenant/scenario/edge/crud` | Yes | Create/update edge |

### Create Scenario

```json
{ "name": "TEST_onboarding_flow" }
```

### Create Node

```json
{
  "scenarioId": "UUID",
  "nodeType": "node_trigger",
  "triggerNode": { "triggerType": "trigger_now" },
  "position": { "x": 100, "y": 200 }
}
```

### Create Edge

```json
{
  "scenarioId": "UUID",
  "sourceNodeId": "UUID",
  "targetNodeId": "UUID",
  "edgeType": "link_next_node"
}
```

---

## 16. UI Settings

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| GET | `/api/tenant/ui/settings` | Yes | List all settings |
| POST | `/api/tenant/ui/settings` | Yes | Create/save setting |
| GET | `/api/tenant/ui/settings/by-key?key=X` | Yes | Get by key |

### Save Setting

```json
{
  "key": "customer_grid_columns",
  "value": { "visible": ["first_name", "email", "gender"] }
}
```

---

## 17. Specific Field Mappings

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| GET | `/api/tenant/specific-fields` | Yes | Get field mappings |
| PUT | `/api/tenant/specific-fields` | Yes | Set email/phone field mappings |

### Set Mappings

```json
{
  "emailField": "col__varchar__3",
  "phoneField": "col__varchar__9"
}
```

---

## 18. Webhook & Communication Channel Details

### Test URLs

| URL | Purpose |
|-----|---------|
| `https://webhook-cdpv2.ssd.uz/` | External test URL (visual inspection only) |
| `http://10.0.10.165:30104/` | Internal URL — use as `chanconf.url` when creating `kind: "webhook"` commchans in tests |

### Blackhole Channels

`kind: "blackhole"` channels consume messages but verify nothing — useful for creating communication channels that always succeed without real delivery.

### Verification

Both blackhole and webhook channels auto-verify via `POST /api/tenants/commchan/{id}/verify`.

### Kind Matching Rule

Action node `actionType` must match the commchan `kind`:
- `webhook` → `webhook`
- `email` → `email_smtp2go_api`
- `blackhole` → `blackhole`

---

## 19. Segmentation Predicate Format (UDAF kind)

UDAF-based predicates use `artifactId` (NOT `udafId`):
```json
{
  "type": "condition",
  "condition": {
    "param": { "kind": "udaf", "artifactId": "<udaf-uuid>" },
    "operator": ">",
    "value": { "float64": [0], "string": [], "int64": [], "bool": [], "time": [] }
  }
}
```

Field predicates use `kind: "field"` with `fieldName: "col__xxx__N"`.

> **Note:** Preview returns code-13 "conflict" when the referenced UDAF's compute state is broken (shared tenant issue, not a payload problem).
