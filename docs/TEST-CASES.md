# CDP API Test Cases

> Detailed API test cases with copy-paste curl commands and exact expected responses.
> For **frontend/UI** test cases, see [MANUAL-FRONTEND-TESTING.md](MANUAL-FRONTEND-TESTING.md).

## Legend

- **Auto:** Automated test exists (file → test name)
- **Priority:** P0 (critical path), P1 (important), P2 (nice-to-have), P3 (edge case)
- **`$TOKEN`** — JWT Bearer token obtained from sign-in
- **`$BASE`** — `https://cdpv2.ssd.uz`
- **`$TENANT_ID`** — tenant ID from `.env` (e.g., `1762934640267`)

### How to Get a Token

Before running any authenticated test, obtain a token:

```bash
TOKEN=$(curl -s -X POST "$BASE/public/api/signin" \
  -H "Content-Type: application/json" \
  -d '{"domain":"1762934640.cdp.com","email":"shop2025.11.12-13:04:00@cdp.ru","password":"qwerty123"}' \
  | jq -r '.token')

echo $TOKEN   # Should print a long JWT string starting with "eyJ..."
```

---

## TC-1: Authentication

### TC-1.1: Successful Sign-In
- **Priority:** P0
- **Auto:** `tests_backend/auth.test.ts` → "should sign in and return a token"

**What we're testing:** That a user with valid credentials can obtain a JWT token.

**Steps:**
1. Send a POST request to the sign-in endpoint with valid domain, email, and password:
   ```bash
   curl -s -X POST "$BASE/public/api/signin" \
     -H "Content-Type: application/json" \
     -d '{
       "domain": "1762934640.cdp.com",
       "email": "shop2025.11.12-13:04:00@cdp.ru",
       "password": "qwerty123"
     }'
   ```
2. Examine the JSON response body.

**Verify:**
- HTTP status is `200`
- Response JSON contains a `token` field
- The token is a non-empty string starting with `eyJ` (JWT format)
- The token has 3 dot-separated parts: `header.payload.signature`

---

### TC-1.2: Sign-In with Wrong Password
- **Priority:** P1
- **Auto:** `tests_backend/auth.test.ts` → "should fail with wrong credentials"

**What we're testing:** That incorrect passwords are rejected — the system does not hand out tokens to unauthorized users.

**Steps:**
1. Send a sign-in request with the correct domain and email, but an intentionally wrong password:
   ```bash
   curl -s -w "\nHTTP_STATUS: %{http_code}\n" -X POST "$BASE/public/api/signin" \
     -H "Content-Type: application/json" \
     -d '{
       "domain": "1762934640.cdp.com",
       "email": "shop2025.11.12-13:04:00@cdp.ru",
       "password": "THIS_IS_WRONG_PASSWORD"
     }'
   ```

**Verify:**
- HTTP status is NOT `200` (should be `401` or `400`)
- Response does NOT contain a valid `token`
- An error message is present in the response body

---

### TC-1.3: Sign-In with Non-Existent Domain
- **Priority:** P1
- **Auto:** `tests_backend/auth.test.ts` → "should fail with wrong domain"

**What we're testing:** That a completely made-up domain is rejected.

**Steps:**
1. Send a sign-in request with a domain that doesn't exist:
   ```bash
   curl -s -w "\nHTTP_STATUS: %{http_code}\n" -X POST "$BASE/public/api/signin" \
     -H "Content-Type: application/json" \
     -d '{
       "domain": "this_domain_does_not_exist_99999.cdp.com",
       "email": "nobody@test.com",
       "password": "anything"
     }'
   ```

**Verify:**
- HTTP status is NOT `200`
- No token returned
- Error message indicates invalid domain or tenant not found

---

### TC-1.4: Protected Endpoint Without Token
- **Priority:** P0
- **Auto:** `tests_backend/auth.test.ts` → "should reject requests without token"

**What we're testing:** That API endpoints behind authentication reject requests that don't carry a JWT.

**Steps:**
1. Call a protected endpoint (tenant info) without any Authorization header:
   ```bash
   curl -s -w "\nHTTP_STATUS: %{http_code}\n" "$BASE/api/tenants/info"
   ```

**Verify:**
- HTTP status is `401` (Unauthorized)
- No tenant data is returned

---

### TC-1.5: Protected Endpoint with Invalid JWT
- **Priority:** P1
- **Auto:** `tests_backend/auth.test.ts` → "should reject invalid JWT"

**What we're testing:** That a fabricated/expired/malformed token is rejected.

**Steps:**
1. Call a protected endpoint with a clearly fake token:
   ```bash
   curl -s -w "\nHTTP_STATUS: %{http_code}\n" "$BASE/api/tenants/info" \
     -H "Authorization: Bearer fake.invalid.token123"
   ```

**Verify:**
- HTTP status is `401`
- No tenant data leaked

---

### TC-1.6: Tenant Signup + First Sign-In
- **Priority:** P0
- **Auto:** `tests_backend/signup.test.ts` → "should create a new tenant"

**What we're testing:** That a brand new tenant can be created and immediately signed into.

**Steps:**
1. Create a new tenant with a unique domain (use current timestamp to avoid collisions):
   ```bash
   TIMESTAMP=$(date +%s)
   curl -s -X POST "$BASE/public/api/signup" \
     -H "Content-Type: application/json" \
     -d "{
       \"domain\": \"test_${TIMESTAMP}.cdp.com\",
       \"email\": \"qa_${TIMESTAMP}@cdp.ru\",
       \"password\": \"qwerty123\",
       \"companyName\": \"QA Test Corp ${TIMESTAMP}\"
     }"
   ```
2. Sign in with the newly created credentials:
   ```bash
   curl -s -X POST "$BASE/public/api/signin" \
     -H "Content-Type: application/json" \
     -d "{
       \"domain\": \"test_${TIMESTAMP}.cdp.com\",
       \"email\": \"qa_${TIMESTAMP}@cdp.ru\",
       \"password\": \"qwerty123\"
     }"
   ```

**Verify:**
- Step 1: Returns `200` with tenant info (tenant ID, domain)
- Step 2: Returns `200` with a valid JWT token
- The new tenant is fully functional (can call `/api/tenants/info` with the new token)

---

### TC-1.7: Employee Creation
- **Priority:** P1
- **Auto:** `tests_backend/signup.test.ts` → "should create employee"
- **Known bug:** BUG-012 (returns 500)

**Steps:**
1. Using a valid token, attempt to create an employee:
   ```bash
   curl -s -w "\nHTTP_STATUS: %{http_code}\n" -X POST "$BASE/api/tenant/employee" \
     -H "Authorization: Bearer $TOKEN" \
     -H "Content-Type: application/json" \
     -d '{"email": "new_employee@test.com", "password": "qwerty123"}'
   ```

**Verify:**
- **Expected:** HTTP `200`, employee created
- **Actual (BUG-012):** HTTP `500` — server error

---

## TC-2: Schema Management

### TC-2.1: List Customer Fields
- **Priority:** P0
- **Auto:** `tests_backend/schema.test.ts` → "should list customer fields"

**What we're testing:** That we can retrieve the full list of customer fields including their types and internal column names.

**Steps:**
1. Fetch all customer fields:
   ```bash
   curl -s "$BASE/api/tenants/schema/customers/fields" \
     -H "Authorization: Bearer $TOKEN" | jq .
   ```

**Verify:**
- Response is a JSON array of field objects
- Each field has: `apiName` (e.g., "gender"), `displayName`, `fieldType` (VARCHAR/BOOL/DOUBLE/BIGINT/DATE)
- Applied fields also have `colName` (e.g., "col__varchar__2") — this is the internal column name used in queries
- System fields like `primary_id` are present

---

### TC-2.2: Create Customer Field + Apply Draft
- **Priority:** P0
- **Auto:** `tests_business/schema-lifecycle.test.ts`

**What we're testing:** The full lifecycle of adding a new customer field: create in draft → check pending → apply → verify it's live with an internal column name.

**Steps:**
1. Create a new VARCHAR field in draft mode:
   ```bash
   curl -s -X POST "$BASE/api/tenants/schema/customers/fields" \
     -H "Authorization: Bearer $TOKEN" \
     -H "Content-Type: application/json" \
     -d '{
       "apiName": "test_field_manual",
       "displayName": "Test Field Manual",
       "fieldType": "VARCHAR",
       "description": "Created by manual QA test"
     }'
   ```
2. Check how many pending draft changes exist:
   ```bash
   curl -s "$BASE/api/tenants/schema/draft-schema/status" \
     -H "Authorization: Bearer $TOKEN"
   ```
3. Apply the draft to make the field live:
   ```bash
   curl -s -X POST "$BASE/api/tenants/schema/draft-schema/apply" \
     -H "Authorization: Bearer $TOKEN"
   ```
4. Verify the field now has an internal column name:
   ```bash
   curl -s "$BASE/api/tenants/schema/customers/fields" \
     -H "Authorization: Bearer $TOKEN" | jq '.[] | select(.apiName == "test_field_manual")'
   ```

**Verify:**
- Step 1: `200`, field created (in draft state)
- Step 2: `pendingChanges` > 0
- Step 3: `200`, draft applied
- Step 4: The field now has a `colName` like `col__varchar__N` (an internal name was assigned)

---

### TC-2.3: Cancel Draft
- **Priority:** P1
- **Auto:** `tests_business/schema-lifecycle.test.ts` → "cancel draft"

**What we're testing:** That drafted schema changes can be discarded before applying.

**Steps:**
1. Create a draft field (same as TC-2.2 step 1, but with a different name)
2. Cancel all pending changes:
   ```bash
   curl -s -X DELETE "$BASE/api/tenants/schema/draft-schema/cancel" \
     -H "Authorization: Bearer $TOKEN"
   ```
3. List fields again — the drafted field should be gone

**Verify:**
- After cancel: `pendingChanges` = 0
- The field you created no longer appears in the field list

---

### TC-2.4: Create Event Type with Fields
- **Priority:** P0
- **Auto:** `tests_business/global-setup.ts` (provisioner)

**What we're testing:** Creating a new event type and adding fields to it.

**Steps:**
1. Create an event type:
   ```bash
   curl -s -X POST "$BASE/api/tenants/schema/event-types" \
     -H "Authorization: Bearer $TOKEN" \
     -H "Content-Type: application/json" \
     -d '{"apiName": "test_event", "displayName": "Test Event"}'
   ```
   → Save the returned `id` (UUID) as `$EVENT_TYPE_ID`

2. Add a DOUBLE field to this event type:
   ```bash
   curl -s -X POST "$BASE/api/tenants/schema/events/fields/$EVENT_TYPE_ID" \
     -H "Authorization: Bearer $TOKEN" \
     -H "Content-Type: application/json" \
     -d '{"apiName": "amount", "displayName": "Amount", "fieldType": "DOUBLE"}'
   ```

3. Apply the draft:
   ```bash
   curl -s -X POST "$BASE/api/tenants/schema/draft-schema/apply" \
     -H "Authorization: Bearer $TOKEN"
   ```

**Verify:**
- Step 1: Returns UUID for the new event type
- Step 2: Field added to draft
- Step 3: Fields get internal column names (`col__double__0`, etc.)

---

## TC-3: Data Ingestion

### TC-3.1: Ingest Customers via Public API
- **Priority:** P0
- **Auto:** `tests_business/global-setup.ts`

**What we're testing:** That customer records can be ingested via the public (no-auth) ingest endpoint and become queryable.

**Steps:**
1. Send customer data (no auth needed — this is a public endpoint):
   ```bash
   curl -s -X POST "$BASE/cdp-ingest/ingest/tenant/$TENANT_ID/async/customers" \
     -H "Content-Type: application/json" \
     -d '[
       {"primary_id": "9900000099", "first_name": "TestQA", "gender": "female", "age": 30}
     ]'
   ```
2. Wait 1-2 minutes for the data pipeline to process the record
3. Query the customer to verify it was ingested:
   ```bash
   curl -s "$BASE/api/tenant/data/customers/9900000099" \
     -H "Authorization: Bearer $TOKEN"
   ```

**Verify:**
- Step 1: Returns `200` (accepted for processing)
- Step 3: Customer profile is returned with the correct field values (first_name = "TestQA", gender = "female", age = 30)

---

### TC-3.2: Ingest Events
- **Priority:** P0
- **Auto:** `tests_business/global-setup.ts`

**What we're testing:** That event records can be ingested and linked to existing customers.

**Steps:**
1. Ingest an event for the customer from TC-3.1:
   ```bash
   curl -s -X POST "$BASE/cdp-ingest/ingest/tenant/$TENANT_ID/async/events" \
     -H "Content-Type: application/json" \
     -d '[
       {"primary_id": "9900000099", "event_type": "purchase", "purchase_id": "PUR-QA-001", "total_price": 99.99, "delivery_city": "Tashkent"}
     ]'
   ```
2. Wait 1-2 minutes for processing
3. Query events to verify:
   ```bash
   curl -s -X POST "$BASE/api/tenant/data/events" \
     -H "Authorization: Bearer $TOKEN" \
     -H "Content-Type: application/json" \
     -d '{"page": 1, "size": 100}'
   ```

**Verify:**
- Step 1: Returns `200`
- Step 3: The event appears in results with correct values

---

### TC-3.3: File Upload (3-Step Bulk Import)
- **Priority:** P1
- **Auto:** `tests_business/file-upload.test.ts`

**What we're testing:** The 3-step chunked file upload flow for bulk data import.

**Steps:**
1. **Initialize** the upload — tell the server you're about to upload a CSV:
   ```bash
   INIT_RESPONSE=$(curl -s -X POST "$BASE/api/file/upload/init" \
     -H "Authorization: Bearer $TOKEN" \
     -H "Content-Type: application/json" \
     -d '{"fileName": "test_customers.csv", "fileType": "customers"}')

   OBJECT_ID=$(echo $INIT_RESPONSE | jq -r '.objectId')
   echo "Object ID: $OBJECT_ID"
   ```

2. **Upload the binary chunk** — send the actual CSV file content:
   ```bash
   echo -e "primary_id,first_name,gender\n9900000098,FileUploadTest,male" > /tmp/test.csv

   curl -s -X POST "$BASE/api/file/upload/part?objectId=$OBJECT_ID" \
     -H "Authorization: Bearer $TOKEN" \
     -H "Content-Type: application/octet-stream" \
     --data-binary @/tmp/test.csv
   ```

3. **Complete** the upload — finalize and map CSV columns to schema fields:
   ```bash
   curl -s -X POST "$BASE/api/file/upload/complete" \
     -H "Authorization: Bearer $TOKEN" \
     -H "Content-Type: application/json" \
     -d "{\"objectId\": \"$OBJECT_ID\"}"
   ```

**Verify:**
- Step 1: Returns `200` with an `objectId`
- Step 2: Returns `200` (chunk accepted)
- Step 3: Returns `200` (upload finalized)
- After waiting ~2 minutes, the uploaded data should be queryable

---

## TC-4: Data Queries

### TC-4.1: Customer List with Pagination (V1)
- **Priority:** P0
- **Auto:** `tests_backend/data.test.ts` → "customer listing"

**What we're testing:** That customers can be listed page by page with no missing or duplicate records.

**Steps:**
1. Request page 1 with 5 items:
   ```bash
   curl -s -X POST "$BASE/api/tenant/data/customers" \
     -H "Authorization: Bearer $TOKEN" \
     -H "Content-Type: application/json" \
     -d '{"page": 1, "size": 5}'
   ```
2. Request page 2:
   ```bash
   curl -s -X POST "$BASE/api/tenant/data/customers" \
     -H "Authorization: Bearer $TOKEN" \
     -H "Content-Type: application/json" \
     -d '{"page": 2, "size": 5}'
   ```

**Verify:**
- Each page returns at most 5 rows
- No primary_id appears on both pages (no duplicates)
- Response includes total count metadata

---

### TC-4.2: Customer Profile by ID
- **Priority:** P0
- **Auto:** `tests_backend/data.test.ts` → "customer profile"

**What we're testing:** That a specific customer's full profile can be retrieved by primary_id.

**Steps:**
1. Fetch Alice's profile (primary_id = 9900000001):
   ```bash
   curl -s "$BASE/api/tenant/data/customers/9900000001" \
     -H "Authorization: Bearer $TOKEN" | jq .
   ```

**Verify:**
- HTTP `200`
- Response contains all customer fields (first_name, gender, age, income, etc.)
- Values match: Alice, female, age 35, income 75000

---

### TC-4.3: V2 Advanced Query — Column Selection + OrderBy + Filter
- **Priority:** P1
- **Auto:** `tests_business/v2-data-query.test.ts`

**What we're testing:** The undocumented V2 data API that supports column selection, sorting, and filtering in one request.

> **Important:** The V2 API uses **internal column names** (col__varchar__0, etc.), not field names like "gender". See the API Reference for the field mapping.

**Steps:**
1. Query with specific columns, sorted by income descending, filtered to adults only:
   ```bash
   curl -s -X POST "$BASE/api/v2/tenant/data/customers" \
     -H "Authorization: Bearer $TOKEN" \
     -H "Content-Type: application/json" \
     -d '{
       "columns": [
         {"fieldName": "col__varchar__0", "kind": "field"},
         {"fieldName": "col__double__0", "kind": "field"}
       ],
       "orderBy": {
         "direction": "DESC",
         "param": {"fieldName": "col__double__0", "kind": "field"}
       },
       "filter": {
         "combinator": "AND",
         "predicates": [
           {"fieldName": "col__bool__0", "kind": "field", "operator": "=", "value": true}
         ]
       },
       "page": 1,
       "size": 10
     }'
   ```

**Verify:**
- Only requested columns are in the response (first_name + income)
- Results are sorted by income descending (Dave $250K first, then Frank $180K, etc.)
- Only adults are returned (8 total — Carol and Jun excluded)

> **Note on V2 orderBy format:** It's `{"direction": "ASC", "param": {"fieldName": "...", "kind": "field"}}` — NOT `{"fieldName": "...", "direction": "asc"}`. Getting this wrong returns unexpected results.

---

### TC-4.4: V2 Pagination Without OrderBy (Bug Verification)
- **Priority:** P1
- **Auto:** `tests_business/v2-data-query.test.ts` → "pagination overlap"
- **Known bug:** BUG-008

**What we're testing:** Whether pagination without orderBy returns overlapping rows across pages.

**Steps:**
1. Fetch page 1 without orderBy:
   ```bash
   curl -s -X POST "$BASE/api/v2/tenant/data/customers" \
     -H "Authorization: Bearer $TOKEN" \
     -H "Content-Type: application/json" \
     -d '{"columns": [{"fieldName": "primary_id", "kind": "field"}], "page": 1, "size": 5}'
   ```
2. Fetch page 2:
   ```bash
   curl -s -X POST "$BASE/api/v2/tenant/data/customers" \
     -H "Authorization: Bearer $TOKEN" \
     -H "Content-Type: application/json" \
     -d '{"columns": [{"fieldName": "primary_id", "kind": "field"}], "page": 2, "size": 5}'
   ```
3. Compare the primary_ids from both pages.

**Verify:**
- **Expected:** No overlapping primary_ids between pages
- **Actual (BUG-008):** Some rows appear on both pages when no orderBy is specified

---

### TC-4.5: Autocomplete — Customer Fields
- **Priority:** P2
- **Auto:** `tests_business/autocomplete.test.ts`

**Steps:**
1. Request autocomplete for the gender field, searching for "f":
   ```bash
   curl -s "$BASE/api/tenant/data/autocomplete/field-values?field=col__varchar__2&q=f&size=10" \
     -H "Authorization: Bearer $TOKEN"
   ```

**Verify:**
- Returns matching values: should include "female"
- Respects the size limit

---

### TC-4.6: Autocomplete — Event Fields (Bug Verification)
- **Priority:** P2
- **Auto:** `tests_business/autocomplete.test.ts`
- **Known bug:** BUG-001

**Steps:**
1. Request autocomplete for an event field:
   ```bash
   curl -s -w "\nHTTP_STATUS: %{http_code}\n" \
     "$BASE/api/tenant/data/autocomplete/field-values?field=col__varchar__0&q=T&size=10&eventTypeId=PURCHASE_TYPE_ID" \
     -H "Authorization: Bearer $TOKEN"
   ```

**Verify:**
- **Expected:** Returns matching event field values
- **Actual (BUG-001):** Returns HTTP `500`

---

## TC-5: UDAFs (Aggregates)

### TC-5.1: Create and Calculate SUM UDAF
- **Priority:** P0
- **Auto:** `tests_business/udaf-field-types.test.ts`

**What we're testing:** That a SUM aggregate can be created over event data and returns correct totals per customer.

**Steps:**
1. Create a SUM UDAF on the total_price field:
   ```bash
   UDAF_RESPONSE=$(curl -s -X POST "$BASE/api/tenants/udafs" \
     -H "Authorization: Bearer $TOKEN" \
     -H "Content-Type: application/json" \
     -d '{
       "name": "TEST_manual_sum_price",
       "description": "Sum of total_price for QA testing",
       "eventTypeId": "PURCHASE_EVENT_TYPE_UUID",
       "fieldName": "col__double__0",
       "aggregationType": "SUM",
       "timeWindow": {"type": "ALL_TIME"}
     }')

   UDAF_ID=$(echo $UDAF_RESPONSE | jq -r '.id')
   echo "UDAF ID: $UDAF_ID"
   ```

2. Wait **5-7 minutes** for UDAF recalculation (this is not instant).

3. Calculate the UDAF for Alice (primary_id = 9900000001):
   ```bash
   curl -s -X POST "$BASE/api/tenants/udafs/$UDAF_ID/calculate?primaryId=9900000001" \
     -H "Authorization: Bearer $TOKEN"
   ```

**Verify:**
- Step 1: `200`, UDAF created with ID
- Step 3: Returns `{"value": 400.00}` — Alice has 3 purchases totaling $150 + $200 + $50 = $400

**Verification table for other customers:**

| Customer | Primary ID | Expected SUM(total_price) |
|----------|-----------|--------------------------|
| Alice | 9900000001 | **400.00** |
| Bob | 9900000005 | **1499.99** |
| Dave | 9900000006 | **2000.00** |
| Frank | 9900000007 | **1350.00** |

---

### TC-5.2: Create COUNT UDAF
- **Priority:** P0
- **Auto:** `tests_business/udaf-field-types.test.ts`

**Steps:**
1. Create a COUNT UDAF:
   ```bash
   curl -s -X POST "$BASE/api/tenants/udafs" \
     -H "Authorization: Bearer $TOKEN" \
     -H "Content-Type: application/json" \
     -d '{
       "name": "TEST_manual_event_count",
       "eventTypeId": "PURCHASE_EVENT_TYPE_UUID",
       "fieldName": "col__double__0",
       "aggregationType": "COUNT",
       "timeWindow": {"type": "ALL_TIME"}
     }'
   ```
2. Wait for recalculation, then calculate for Dave:
   ```bash
   curl -s -X POST "$BASE/api/tenants/udafs/$UDAF_ID/calculate?primaryId=9900000006" \
     -H "Authorization: Bearer $TOKEN"
   ```

**Verify:**
- Dave has 4 purchase events → COUNT should return `4`
- Alice → `3`, Bob → `2`, Hana → `1`, Eve → `0`

---

### TC-5.3: UDAF with Event Filter (Bug Verification)
- **Priority:** P1
- **Auto:** `tests_business/udaf-logic.test.ts`
- **Known bug:** BUG-002

**What we're testing:** That a UDAF can filter events by a condition (e.g., only Tashkent purchases).

**Steps:**
1. Create a filtered UDAF:
   ```bash
   curl -s -X POST "$BASE/api/tenants/udafs" \
     -H "Authorization: Bearer $TOKEN" \
     -H "Content-Type: application/json" \
     -d '{
       "name": "TEST_manual_tashkent_sum",
       "eventTypeId": "PURCHASE_EVENT_TYPE_UUID",
       "fieldName": "col__double__0",
       "aggregationType": "SUM",
       "timeWindow": {"type": "ALL_TIME"},
       "predicate": {
         "combinator": "AND",
         "predicates": [
           {"fieldName": "col__varchar__4", "kind": "field", "operator": "=", "value": "Tashkent"}
         ]
       }
     }'
   ```
2. Calculate for Dave (all 4 events are in Tashkent):
   ```bash
   curl -s -X POST "$BASE/api/tenants/udafs/$UDAF_ID/calculate?primaryId=9900000006" \
     -H "Authorization: Bearer $TOKEN"
   ```

**Verify:**
- **Expected:** Dave's Tashkent total = $300 + $450 + $750 + $500 = **$2,000**
- **Actual (BUG-002):** Returns `null` or `0` — filtered UDAF predicates are broken

---

## TC-6: Segmentation

### TC-6.1: Simple Equals Predicate
- **Priority:** P0
- **Auto:** `tests_business/segmentation-field-types.test.ts`

**What we're testing:** The most basic segmentation — filter customers by a single field value.

**Steps:**
1. Preview a segment that finds all female customers:
   ```bash
   curl -s -X POST "$BASE/api/tenants/segmentation/preview" \
     -H "Authorization: Bearer $TOKEN" \
     -H "Content-Type: application/json" \
     -d '{
       "name": "TEST_manual_females",
       "predicate": {
         "combinator": "AND",
         "predicates": [
           {
             "fieldName": "col__varchar__2",
             "kind": "field",
             "operator": "=",
             "value": "female"
           }
         ]
       }
     }'
   ```

**Verify:**
- Returns `{"count": 4}` — Alice, Carol, Eve, Grace are the 4 female customers
- HTTP status `200`

---

### TC-6.2: All Operator Types
- **Priority:** P0
- **Auto:** `tests_business/segmentation-field-types.test.ts`

Run each of these preview requests and verify the count:

| # | Predicate | Field | Operator | Value | Expected Count | Who matches |
|---|-----------|-------|----------|-------|---------------|------------|
| a | gender = male | col__varchar__2 | `=` | "male" | **5** | Bob, Dave, Frank, Ivan, Jun |
| b | gender != female | col__varchar__2 | `!=` | "female" | **6** | Bob, Dave, Frank, Hana, Ivan, Jun |
| c | gender IN [female,other] | col__varchar__2 | `in` | ["female","other"] | **5** | Alice, Carol, Eve, Grace, Hana |
| d | gender IS NOT NULL | col__varchar__2 | `is_not_null` | — | **10** | Everyone |
| e | is_adult = true | col__bool__0 | `=` | true | **8** | All except Carol, Jun |
| f | income > 100000 | col__double__0 | `>` | 100000 | **3** | Bob, Dave, Frank |
| g | age < 18 | col__bigint__0 | `<` | 18 | **2** | Carol (17), Jun (15) |

**Example curl for "income > 100000":**
```bash
curl -s -X POST "$BASE/api/tenants/segmentation/preview" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "high_income",
    "predicate": {
      "combinator": "AND",
      "predicates": [
        {"fieldName": "col__double__0", "kind": "field", "operator": ">", "value": 100000}
      ]
    }
  }'
```
→ Expected: `{"count": 3}`

---

### TC-6.3: Compound AND Predicate
- **Priority:** P0
- **Auto:** `tests_business/segmentation-complex.test.ts`

**What we're testing:** Combining multiple conditions where ALL must be true.

**Steps:**
1. Preview: adult AND female:
   ```bash
   curl -s -X POST "$BASE/api/tenants/segmentation/preview" \
     -H "Authorization: Bearer $TOKEN" \
     -H "Content-Type: application/json" \
     -d '{
       "name": "adult_females",
       "predicate": {
         "combinator": "AND",
         "predicates": [
           {"fieldName": "col__varchar__2", "kind": "field", "operator": "=", "value": "female"},
           {"fieldName": "col__bool__0", "kind": "field", "operator": "=", "value": true}
         ]
       }
     }'
   ```

**Verify:**
- Count = **3** (Alice 35, Eve 25, Grace 31 — Carol is 17 so not adult)

---

### TC-6.4: Compound OR Predicate
- **Priority:** P0
- **Auto:** `tests_business/segmentation-complex.test.ts`

**Steps:**
1. Preview: female OR subscribed:
   ```bash
   curl -s -X POST "$BASE/api/tenants/segmentation/preview" \
     -H "Authorization: Bearer $TOKEN" \
     -H "Content-Type: application/json" \
     -d '{
       "name": "female_or_subscribed",
       "predicate": {
         "combinator": "OR",
         "predicates": [
           {"fieldName": "col__varchar__2", "kind": "field", "operator": "=", "value": "female"},
           {"fieldName": "col__bool__1", "kind": "field", "operator": "=", "value": true}
         ]
       }
     }'
   ```

**Verify:**
- Count = **7** — union of females (Alice, Carol, Eve, Grace) and subscribed (Alice, Carol, Grace, Dave, Hana, Ivan) = 7 unique

---

### TC-6.5: Nested Predicate Groups
- **Priority:** P1
- **Auto:** `tests_business/segmentation-complex.test.ts`

**What we're testing:** Groups nested inside groups — e.g., (female OR other) AND adult.

**Steps:**
1. This requires nested predicate structure — the inner group is an OR, wrapped in an outer AND:
   ```bash
   curl -s -X POST "$BASE/api/tenants/segmentation/preview" \
     -H "Authorization: Bearer $TOKEN" \
     -H "Content-Type: application/json" \
     -d '{
       "name": "nested_test",
       "predicate": {
         "combinator": "AND",
         "predicates": [
           {
             "combinator": "OR",
             "predicates": [
               {"fieldName": "col__varchar__2", "kind": "field", "operator": "=", "value": "female"},
               {"fieldName": "col__varchar__2", "kind": "field", "operator": "=", "value": "other"}
             ]
           },
           {"fieldName": "col__bool__0", "kind": "field", "operator": "=", "value": true}
         ]
       }
     }'
   ```

**Verify:**
- (female OR other) = Alice, Carol, Eve, Grace, Hana (5)
- AND adult = removes Carol (minor)
- Final count = **4** (Alice, Eve, Grace, Hana)

---

### TC-6.6: NEGATE Predicate
- **Priority:** P1
- **Auto:** `tests_business/segmentation-complex.test.ts`

**What we're testing:** Inverting a predicate group.

**Steps:**
1. Preview: NOT(male) — should return everyone who is NOT male:
   ```bash
   curl -s -X POST "$BASE/api/tenants/segmentation/preview" \
     -H "Authorization: Bearer $TOKEN" \
     -H "Content-Type: application/json" \
     -d '{
       "name": "not_male",
       "predicate": {
         "combinator": "AND",
         "negate": true,
         "predicates": [
           {"fieldName": "col__varchar__2", "kind": "field", "operator": "=", "value": "male"}
         ]
       }
     }'
   ```

**Verify:**
- Count = **5** (Alice, Carol, Eve, Grace = female + Hana = other)

---

### TC-6.7: Segmentation CRUD Lifecycle
- **Priority:** P1
- **Auto:** `tests_backend/segmentation.test.ts`, `tests_business/crud-delete.test.ts`

**Steps:**
1. **Create:** POST a new segmentation (see TC-6.1 format, but with `POST /api/tenants/segmentation`)
2. **List:** GET `/api/tenants/segmentation?page=1&size=10` → verify it appears
3. **Get by ID:** GET `/api/tenants/segmentation/{id}` → verify full predicate
4. **Update:** PUT `/api/tenants/segmentation/{id}` with modified name/predicate
5. **Delete:** DELETE `/api/tenants/segmentation/{id}`

**Verify:**
- Steps 1-4: All return `200`
- Step 5: **Expected** `200`, **Actual (BUG-009):** returns `400`

---

## TC-7: Campaigns (Full Workflow)

### TC-7.1: End-to-End Campaign Creation and Send
- **Priority:** P0
- **Auto:** `tests_business/campaign-logic.test.ts`

**What we're testing:** The complete campaign flow: channel → verify → template → segment → campaign → preview → send.

**Steps:**
1. **Create a communication channel:**
   ```bash
   CHAN_RESPONSE=$(curl -s -X POST "$BASE/api/tenants/commchan" \
     -H "Authorization: Bearer $TOKEN" \
     -H "Content-Type: application/json" \
     -d '{"name": "TEST_manual_blackhole", "channelType": "email", "config": {"host": "blackhole.test", "port": 587}}')
   CHAN_ID=$(echo $CHAN_RESPONSE | jq -r '.id')
   ```

2. **Verify the channel:**
   ```bash
   curl -s -X POST "$BASE/api/tenants/commchan/$CHAN_ID/verify" \
     -H "Authorization: Bearer $TOKEN"
   ```

3. **Create a template:**
   ```bash
   TPL_RESPONSE=$(curl -s -X POST "$BASE/api/tenant/template" \
     -H "Authorization: Bearer $TOKEN" \
     -H "Content-Type: application/json" \
     -d '{"name": "TEST_manual_template", "subject": "Hello", "body": "Hi {{first_name}}!", "contentType": "text"}')
   TPL_ID=$(echo $TPL_RESPONSE | jq -r '.id')
   ```

4. **Create a segmentation (adults):**
   ```bash
   SEG_RESPONSE=$(curl -s -X POST "$BASE/api/tenants/segmentation" \
     -H "Authorization: Bearer $TOKEN" \
     -H "Content-Type: application/json" \
     -d '{
       "name": "TEST_manual_adults",
       "predicate": {"combinator":"AND","predicates":[{"fieldName":"col__bool__0","kind":"field","operator":"=","value":true}]}
     }')
   SEG_ID=$(echo $SEG_RESPONSE | jq -r '.id')
   ```

5. **Create the campaign linking all three:**
   ```bash
   CAMP_RESPONSE=$(curl -s -X POST "$BASE/api/tenants/campaign" \
     -H "Authorization: Bearer $TOKEN" \
     -H "Content-Type: application/json" \
     -d "{\"name\":\"TEST_manual_campaign\",\"segmentationId\":\"$SEG_ID\",\"commChanId\":\"$CHAN_ID\",\"templateId\":\"$TPL_ID\"}")
   CAMP_ID=$(echo $CAMP_RESPONSE | jq -r '.id')
   ```

6. **Preview reach:**
   ```bash
   curl -s -X POST "$BASE/api/tenants/campaign/compute/preview" \
     -H "Authorization: Bearer $TOKEN" \
     -H "Content-Type: application/json" \
     -d "{\"campaignId\": \"$CAMP_ID\"}"
   ```

**Verify:**
- Steps 1-5: All return `200`
- Step 6: Preview count = **8** (matching the adults segment)

---

## TC-8: Scenario Builder

### TC-8.1: Create Scenario with Nodes and Edges
- **Priority:** P1
- **Auto:** `tests_backend/scenario-creation.test.ts`

**Steps:**
1. **Create scenario:**
   ```bash
   SCN_RESPONSE=$(curl -s -X POST "$BASE/api/tenant/scenario/crud" \
     -H "Authorization: Bearer $TOKEN" \
     -H "Content-Type: application/json" \
     -d '{"name": "TEST_manual_scenario"}')
   SCN_ID=$(echo $SCN_RESPONSE | jq -r '.id')
   ```

2. **Add trigger node:**
   ```bash
   TRIGGER_RESPONSE=$(curl -s -X POST "$BASE/api/tenant/scenario/node/crud" \
     -H "Authorization: Bearer $TOKEN" \
     -H "Content-Type: application/json" \
     -d "{\"scenarioId\":\"$SCN_ID\",\"nodeType\":\"node_trigger\",\"triggerNode\":{\"triggerType\":\"trigger_now\"},\"position\":{\"x\":100,\"y\":100}}")
   TRIGGER_ID=$(echo $TRIGGER_RESPONSE | jq -r '.id')
   ```

3. **Add wait node (60 minutes):**
   ```bash
   WAIT_RESPONSE=$(curl -s -X POST "$BASE/api/tenant/scenario/node/crud" \
     -H "Authorization: Bearer $TOKEN" \
     -H "Content-Type: application/json" \
     -d "{\"scenarioId\":\"$SCN_ID\",\"nodeType\":\"node_wait\",\"waitNode\":{\"waitNodeType\":\"static_wait\",\"staticValue\":{\"durationMin\":60}},\"position\":{\"x\":100,\"y\":300}}")
   WAIT_ID=$(echo $WAIT_RESPONSE | jq -r '.id')
   ```

4. **Connect trigger → wait:**
   ```bash
   curl -s -X POST "$BASE/api/tenant/scenario/edge/crud" \
     -H "Authorization: Bearer $TOKEN" \
     -H "Content-Type: application/json" \
     -d "{\"scenarioId\":\"$SCN_ID\",\"sourceNodeId\":\"$TRIGGER_ID\",\"targetNodeId\":\"$WAIT_ID\",\"edgeType\":\"link_next_node\"}"
   ```

5. **Verify the scenario has all parts:**
   ```bash
   curl -s "$BASE/api/tenant/scenario/crud/get-by-id?id=$SCN_ID" \
     -H "Authorization: Bearer $TOKEN" | jq .
   ```

**Verify:**
- Steps 1-4: All return `200` with IDs
- Step 5: Response contains the scenario with 2 nodes and 1 edge
- Nodes have correct types (node_trigger, node_wait)
- Edge connects the correct source → target

---

### TC-8.2: Scenario Validation Bugs
- **Priority:** P2
- **Auto:** `tests_backend/scenario-creation.test.ts`

Run these to verify known validation issues:

**Whitespace name (BUG-014):**
```bash
curl -s -X POST "$BASE/api/tenant/scenario/crud" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"name": "   "}'
```
→ **Expected:** Error (name is blank). **Actual:** Accepted.

**XSS in name (BUG-015):**
```bash
curl -s -X POST "$BASE/api/tenant/scenario/crud" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"name": "<script>alert(1)</script>"}'
```
→ **Expected:** Sanitized or rejected. **Actual:** Stored as-is.

**Zero/negative wait duration (BUG-016):**
```bash
curl -s -X POST "$BASE/api/tenant/scenario/node/crud" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d "{\"scenarioId\":\"$SCN_ID\",\"nodeType\":\"node_wait\",\"waitNode\":{\"waitNodeType\":\"static_wait\",\"staticValue\":{\"durationMin\":-5}}}"
```
→ **Expected:** Error (negative duration). **Actual:** Accepted.

---

## TC-9: Communication Channels

### TC-9.1: Create Email Channel
- **Priority:** P0
- **Auto:** `tests_backend/commchan.test.ts` → "should create blackhole channel"

**What we're testing:** That an email communication channel can be created for sending campaigns.

**Steps:**
1. Create an email channel:
   ```bash
   curl -s -X POST "$BASE/api/tenants/commchan" \
     -H "Authorization: Bearer $TOKEN" \
     -H "Content-Type: application/json" \
     -d '{
       "name": "TEST_manual_email_channel",
       "channelType": "email",
       "config": {"host": "blackhole.test", "port": 587}
     }'
   ```
   → Save the returned `id` as `$CHAN_ID`

**Verify:**
- HTTP `200`, response contains `id`
- Channel appears in list: `GET /api/tenants/commchan`

---

### TC-9.2: Verify Channel
- **Priority:** P0
- **Auto:** `tests_backend/commchan.test.ts` → "should verify channel"

**Steps:**
1. Verify the channel created in TC-9.1:
   ```bash
   curl -s -X POST "$BASE/api/tenants/commchan/$CHAN_ID/verify" \
     -H "Authorization: Bearer $TOKEN"
   ```
2. Check channel status:
   ```bash
   curl -s "$BASE/api/tenants/commchan/$CHAN_ID" \
     -H "Authorization: Bearer $TOKEN"
   ```

**Verify:**
- Step 1: HTTP `200`
- Step 2: Channel shows verified status

---

### TC-9.3: List Channels with Verified Filter
- **Priority:** P1
- **Auto:** `tests_backend/commchan.test.ts` → "should filter by verified"

**Steps:**
1. List only verified channels:
   ```bash
   curl -s "$BASE/api/tenants/commchan?verified=true" \
     -H "Authorization: Bearer $TOKEN"
   ```

**Verify:**
- All returned channels have verified status
- Unverified channels are excluded

---

### TC-9.4: Validate Channel Config
- **Priority:** P1
- **Auto:** `tests_backend/commchan.test.ts` → "should validate config"

**Steps:**
1. Validate a channel configuration:
   ```bash
   curl -s -X POST "$BASE/api/tenants/commchan/validate" \
     -H "Authorization: Bearer $TOKEN" \
     -H "Content-Type: application/json" \
     -d '{"channelType": "email", "config": {"host": "blackhole.test", "port": 587}}'
   ```

**Verify:**
- HTTP `200`, validation result returned

---

### TC-9.5: Update Channel (Bug Verification)
- **Priority:** P1
- **Auto:** `tests_business/crud-update.test.ts`
- **Known bug:** BUG-011

**Steps:**
1. Update the channel name:
   ```bash
   curl -s -w "\nHTTP_STATUS: %{http_code}\n" -X PUT "$BASE/api/tenants/commchan/$CHAN_ID" \
     -H "Authorization: Bearer $TOKEN" \
     -H "Content-Type: application/json" \
     -d '{"name": "TEST_manual_updated_channel", "channelType": "email", "config": {"host": "blackhole.test", "port": 587}}'
   ```

**Verify:**
- **Expected:** HTTP `200`, name updated
- **Actual (BUG-011):** HTTP `400`

---

### TC-9.6: Delete Channel (Bug Verification)
- **Priority:** P1
- **Auto:** `tests_business/crud-delete.test.ts`
- **Known bug:** BUG-009

**Steps:**
1. Delete the channel:
   ```bash
   curl -s -w "\nHTTP_STATUS: %{http_code}\n" -X DELETE "$BASE/api/tenants/commchan/$CHAN_ID" \
     -H "Authorization: Bearer $TOKEN"
   ```

**Verify:**
- **Expected:** HTTP `200`
- **Actual (BUG-009):** HTTP `400`

---

## TC-10: Templates

### TC-10.1: Create Text Template
- **Priority:** P0
- **Auto:** `tests_backend/template.test.ts` → "should create text template"

**Steps:**
1. Create a plain text template:
   ```bash
   curl -s -X POST "$BASE/api/tenant/template" \
     -H "Authorization: Bearer $TOKEN" \
     -H "Content-Type: application/json" \
     -d '{
       "name": "TEST_manual_text_tpl",
       "subject": "Hello {{first_name}}",
       "body": "Dear {{first_name}}, your order is confirmed.",
       "contentType": "text"
     }'
   ```
   → Save the returned `id` as `$TPL_ID`

**Verify:**
- HTTP `200`, response contains `id`

---

### TC-10.2: Create HTML Template
- **Priority:** P1
- **Auto:** `tests_backend/template.test.ts` → "should create HTML template"

**Steps:**
1. Create an HTML template:
   ```bash
   curl -s -X POST "$BASE/api/tenant/template" \
     -H "Authorization: Bearer $TOKEN" \
     -H "Content-Type: application/json" \
     -d '{
       "name": "TEST_manual_html_tpl",
       "subject": "Newsletter",
       "body": "<h1>Hello {{first_name}}</h1><p>Welcome!</p>",
       "contentType": "html"
     }'
   ```

**Verify:**
- HTTP `200`, template created with HTML content type

---

### TC-10.3: Get Template by ID
- **Priority:** P1
- **Auto:** `tests_backend/template.test.ts` → "should get template by ID"

**Steps:**
1. Retrieve template:
   ```bash
   curl -s "$BASE/api/tenant/template/$TPL_ID" \
     -H "Authorization: Bearer $TOKEN" | jq .
   ```

**Verify:**
- Returns full template: name, subject, body, contentType
- Values match what was created

---

### TC-10.4: Update Template
- **Priority:** P1
- **Auto:** `tests_backend/template.test.ts` → "should update template"

**Steps:**
1. Update the template body:
   ```bash
   curl -s -X PUT "$BASE/api/tenant/template/$TPL_ID" \
     -H "Authorization: Bearer $TOKEN" \
     -H "Content-Type: application/json" \
     -d '{
       "name": "TEST_manual_text_tpl",
       "subject": "Updated Subject",
       "body": "Updated body content.",
       "contentType": "text"
     }'
   ```

**Verify:**
- HTTP `200`
- GET by ID returns updated subject and body

---

### TC-10.5: Delete Template (Bug Verification)
- **Priority:** P1
- **Auto:** `tests_business/crud-delete.test.ts`
- **Known bug:** BUG-009

**Steps:**
1. Delete the template:
   ```bash
   curl -s -w "\nHTTP_STATUS: %{http_code}\n" -X DELETE "$BASE/api/tenant/template/$TPL_ID" \
     -H "Authorization: Bearer $TOKEN"
   ```

**Verify:**
- **Expected:** HTTP `200`
- **Actual (BUG-009):** HTTP `400`

---

### TC-10.6: List Templates with Pagination
- **Priority:** P1
- **Auto:** `tests_backend/template.test.ts` → "should list templates"

**Steps:**
1. List templates:
   ```bash
   curl -s "$BASE/api/tenant/template?page=1&size=10" \
     -H "Authorization: Bearer $TOKEN" | jq .
   ```

**Verify:**
- Returns paginated list
- Previously created templates appear in results

---

## TC-11: UI Settings

### TC-11.1: Save and Get Field Mapping
- **Priority:** P1
- **Auto:** `tests_backend/ui-settings.test.ts`

**What we're testing:** That UI field mappings (email, phone) can be saved and retrieved per-tenant.

**Steps:**
1. Save an email field mapping:
   ```bash
   curl -s -X POST "$BASE/api/tenant/ui/settings" \
     -H "Authorization: Bearer $TOKEN" \
     -H "Content-Type: application/json" \
     -d '{"key": "field_mapping_email", "value": "col__varchar__3"}'
   ```
2. Retrieve the setting:
   ```bash
   curl -s "$BASE/api/tenant/ui/settings/by-key?key=field_mapping_email" \
     -H "Authorization: Bearer $TOKEN"
   ```

**Verify:**
- Step 1: HTTP `200`
- Step 2: Returns the saved value `col__varchar__3`

---

### TC-11.2: Overwrite Setting
- **Priority:** P2
- **Auto:** `tests_backend/ui-settings.test.ts` → "should overwrite"

**Steps:**
1. Save the same key with a different value:
   ```bash
   curl -s -X POST "$BASE/api/tenant/ui/settings" \
     -H "Authorization: Bearer $TOKEN" \
     -H "Content-Type: application/json" \
     -d '{"key": "field_mapping_email", "value": "col__varchar__5"}'
   ```
2. Retrieve the setting again

**Verify:**
- Returns the new value `col__varchar__5`, not the old one

---

### TC-11.3: List All Settings
- **Priority:** P2
- **Auto:** `tests_backend/ui-settings.test.ts` → "should list all"

**Steps:**
1. List all settings:
   ```bash
   curl -s "$BASE/api/tenant/ui/settings" \
     -H "Authorization: Bearer $TOKEN" | jq .
   ```

**Verify:**
- Returns array of all saved key-value pairs
- Previously saved settings are present

---

## TC-12: File Upload

### TC-12.1: Three-Step Chunked File Upload
- **Priority:** P0
- **Auto:** `tests_business/file-upload.test.ts`

**What we're testing:** The complete file upload flow: init → upload chunk → complete with field mappings.

**Steps:**
1. **Init upload:**
   ```bash
   UPLOAD_RESPONSE=$(curl -s -X POST "$BASE/api/file/upload/init" \
     -H "Authorization: Bearer $TOKEN" \
     -H "Content-Type: application/json" \
     -d '{"fileName": "test_upload.csv", "fileType": "csv"}')
   OBJECT_ID=$(echo $UPLOAD_RESPONSE | jq -r '.objectId')
   ```

2. **Upload binary chunk:**
   ```bash
   echo "primary_id,first_name,email
   9900000099,TestUser,test@example.com" > /tmp/test_upload.csv

   curl -s -X POST "$BASE/api/file/upload/part?objectId=$OBJECT_ID" \
     -H "Authorization: Bearer $TOKEN" \
     -H "Content-Type: application/octet-stream" \
     --data-binary @/tmp/test_upload.csv
   ```

3. **Complete upload with field mappings:**
   ```bash
   curl -s -X POST "$BASE/api/file/upload/complete" \
     -H "Authorization: Bearer $TOKEN" \
     -H "Content-Type: application/json" \
     -d "{\"objectId\": \"$OBJECT_ID\", \"mappings\": [{\"csvColumn\": \"primary_id\", \"fieldName\": \"primary_id\"}, {\"csvColumn\": \"first_name\", \"fieldName\": \"first_name\"}, {\"csvColumn\": \"email\", \"fieldName\": \"email\"}]}"
   ```

**Verify:**
- Step 1: HTTP `200`, returns `objectId`
- Step 2: HTTP `200`, chunk accepted
- Step 3: HTTP `200`, upload finalized

---

### TC-12.2: Upload Edge Cases
- **Priority:** P2
- **Auto:** `tests_business/file-upload.test.ts`

**Edge cases to verify:**

| # | Scenario | Expected |
|---|----------|----------|
| a | Complete without uploading any parts | Error (no data) |
| b | Invalid objectId in part upload | Error |
| c | JSON file extension (not CSV) | May be accepted or error depending on backend |
| d | Empty file (0 bytes) | Error |

---

### TC-12.3: CSV Paste Endpoint (Bug Verification)
- **Priority:** P1
- **Auto:** `tests_business/file-upload.test.ts`
- **Known bug:** BUG-013

**Steps:**
1. Attempt CSV paste:
   ```bash
   curl -s -w "\nHTTP_STATUS: %{http_code}\n" -X POST "$BASE/api/tenants/data/file/keys" \
     -H "Authorization: Bearer $TOKEN" \
     -H "Content-Type: application/json" \
     -d '{"data": "primary_id,name\n1,test"}'
   ```

**Verify:**
- **Expected:** HTTP `200`, data processed
- **Actual (BUG-013):** HTTP `500`, body contains "implement me"

---

## TC-13: CRUD Delete & Update Operations

### TC-13.1: Delete Operations
- **Priority:** P1
- **Auto:** `tests_business/crud-delete.test.ts`

**Summary of DELETE endpoint behavior:**

| Resource | Endpoint | Expected | Actual | Bug |
|----------|----------|----------|--------|-----|
| Campaign | `DELETE /api/tenants/campaign/{id}` | 200 | **200** | — (works) |
| Segmentation | `DELETE /api/tenants/segmentation/{id}` | 200 | **400** | BUG-009 |
| Comm Channel | `DELETE /api/tenants/commchan/{id}` | 200 | **400** | BUG-009 |
| Template | `DELETE /api/tenant/template/{id}` | 200 | **400** | BUG-009 |
| Customer field | `DELETE /api/tenants/schema/customers/fields` | 200 | Varies | — |
| Event field | `DELETE /api/tenants/schema/events/fields/{etId}` | 200 | Varies | — |
| UDAFs | `DELETE /api/tenants/udafs/{id}` | — | **Not implemented** | BUG-005 |

---

### TC-13.2: Update Operations
- **Priority:** P1
- **Auto:** `tests_business/crud-update.test.ts`

**Update endpoint verification:**

| Resource | Endpoint | Test |
|----------|----------|------|
| Comm Channel | `PUT /api/tenants/commchan/{id}` | Update name → **BUG-011 (400)** |
| Customer field | `POST /api/tenants/schema/customers/fields` | Update display name |
| Event field | `POST /api/tenants/schema/events/fields/{etId}` | Update display name |
| Event type API name | `POST /api/tenants/schema/events/validate-api-name/{etId}` | Validate uniqueness |

---

## TC-14: End-to-End Business Logic Workflows

> These test cases cover cross-feature workflows that exercise multiple subsystems together,
> matching the automated tests in `tests_business/full-workflow.test.ts` and related files.

### TC-14.1: Complete CDP User Journey
- **Priority:** P0
- **Auto:** `tests_business/full-workflow.test.ts`

**What we're testing:** The full lifecycle as a real CDP user would experience it — from schema setup through data ingestion, segmentation, and campaign delivery.

**Flow:**
1. Schema verification (customer fields + event types applied)
2. Data ingestion (customers + events via Ingest API)
3. UI field mappings (email, phone)
4. UDAF creation (SUM on total_price, COUNT on events)
5. Segmentation (adults segment)
6. Segment preview (count = 8 adults)
7. Communication channel creation + verification
8. Template creation
9. Campaign creation (segment + channel + template)
10. Campaign preview (reach = 8)
11. File upload (CSV with additional data)

**Steps (abbreviated — each step uses endpoints from prior TC sections):**

1. **Verify schema:**
   ```bash
   curl -s "$BASE/api/tenants/schema/customers/fields?exclude_draft=true" \
     -H "Authorization: Bearer $TOKEN" | jq '[.[].apiName]'
   ```
   → Must contain: first_name, last_name, email, gender, is_adult, income, birthdate, age

2. **Verify data counts:**
   ```bash
   curl -s "$BASE/api/tenant/data/count" \
     -H "Authorization: Bearer $TOKEN"
   ```
   → `customerCount: 10`, `eventCount: 18`

3. **Save UI field mapping:**
   ```bash
   curl -s -X POST "$BASE/api/tenant/ui/settings" \
     -H "Authorization: Bearer $TOKEN" \
     -H "Content-Type: application/json" \
     -d '{"key": "field_mapping_email", "value": "col__varchar__3"}'
   ```

4. **Create SUM UDAF → wait 5-7min → verify for Alice:**
   ```bash
   # Create
   UDAF_ID=$(curl -s -X POST "$BASE/api/tenants/udafs" ... | jq -r '.id')
   # Wait for recalculation...
   # Calculate
   curl -s -X POST "$BASE/api/tenants/udafs/$UDAF_ID/calculate?primaryId=9900000001" \
     -H "Authorization: Bearer $TOKEN"
   ```
   → Alice's SUM(total_price) = **$400.00**

5. **Create adults segmentation → preview:**
   ```bash
   SEG_ID=$(curl -s -X POST "$BASE/api/tenants/segmentation" ... | jq -r '.id')
   curl -s -X POST "$BASE/api/tenants/segmentation/preview" ...
   ```
   → Count = **8**

6. **Create channel → verify → create template → create campaign → preview reach:**
   → Campaign preview count = **8** (matches segment)

7. **Upload CSV file (3-step):**
   → Init → Part → Complete all return `200`

**Verify at each phase:**
- No step should return 5xx (except known bugs)
- Counts and values must match pre-calculated EXPECTED values
- Entities created in earlier steps are accessible in later steps

---

### TC-14.2: Segmentation Using UDAF Values
- **Priority:** P1
- **Auto:** `tests_business/segmentation-complex.test.ts` (partial)

**What we're testing:** Creating a segment that filters customers based on aggregate (UDAF) values, not just static customer fields.

**Flow:**
1. Create a SUM UDAF on total_price
2. Wait for UDAF recalculation
3. Create a segmentation with a `kind: "udaf"` predicate filtering by UDAF value
4. Preview the segment

**Steps:**
1. Create UDAF (see TC-5.1)
2. Wait 5-7 minutes for recalculation
3. Create segmentation using UDAF predicate:
   ```bash
   curl -s -X POST "$BASE/api/tenants/segmentation/preview" \
     -H "Authorization: Bearer $TOKEN" \
     -H "Content-Type: application/json" \
     -d "{
       \"name\": \"high_spenders\",
       \"predicate\": {
         \"combinator\": \"AND\",
         \"predicates\": [
           {\"fieldName\": \"$UDAF_ID\", \"kind\": \"udaf\", \"operator\": \">\", \"value\": 1000}
         ]
       }
     }"
   ```

**Verify:**
- Customers with SUM(total_price) > 1000: Bob ($1,499.99), Dave ($2,000), Frank ($1,350) → count = **3**

---

### TC-14.3: Scenario Builder Complete Flow
- **Priority:** P1
- **Auto:** `tests_backend/scenario-builder.test.ts`, `tests_backend/scenario-creation.test.ts`

**What we're testing:** Building a complete automation scenario: trigger → wait → branch → action, end-to-end.

**Flow:**
1. Create scenario
2. Add trigger_now node
3. Add static_wait node (60 min)
4. Add branch node (is_adult = true)
5. Add email action node (yes branch)
6. Add webhook action node (no branch)
7. Connect edges: trigger→wait→branch, branch→yes→email, branch→no→webhook
8. Save scenario

**Steps:**
1. **Create scenario:**
   ```bash
   SCN_ID=$(curl -s -X POST "$BASE/api/tenant/scenario/crud" \
     -H "Authorization: Bearer $TOKEN" \
     -H "Content-Type: application/json" \
     -d '{"name": "TEST_manual_full_scenario"}' | jq -r '.id')
   ```

2. **Add nodes (trigger, wait, branch, email action, webhook action):**
   ```bash
   # Trigger
   TRIGGER_ID=$(curl -s -X POST "$BASE/api/tenant/scenario/node/crud" \
     -H "Authorization: Bearer $TOKEN" \
     -H "Content-Type: application/json" \
     -d "{\"scenarioId\":\"$SCN_ID\",\"nodeType\":\"node_trigger\",\"triggerNode\":{\"triggerType\":\"trigger_now\"},\"position\":{\"x\":100,\"y\":100}}" | jq -r '.id')

   # Wait
   WAIT_ID=$(curl -s -X POST "$BASE/api/tenant/scenario/node/crud" \
     -H "Authorization: Bearer $TOKEN" \
     -H "Content-Type: application/json" \
     -d "{\"scenarioId\":\"$SCN_ID\",\"nodeType\":\"node_wait\",\"waitNode\":{\"waitNodeType\":\"static_wait\",\"staticValue\":{\"durationMin\":60}},\"position\":{\"x\":100,\"y\":250}}" | jq -r '.id')

   # Branch
   BRANCH_ID=$(curl -s -X POST "$BASE/api/tenant/scenario/node/crud" \
     -H "Authorization: Bearer $TOKEN" \
     -H "Content-Type: application/json" \
     -d "{\"scenarioId\":\"$SCN_ID\",\"nodeType\":\"node_branch\",\"branchNode\":{\"predicate\":{\"combinator\":\"AND\",\"predicates\":[{\"fieldName\":\"col__bool__0\",\"kind\":\"field\",\"operator\":\"=\",\"value\":true}]}},\"position\":{\"x\":100,\"y\":400}}" | jq -r '.id')

   # Email action (yes branch)
   EMAIL_ID=$(curl -s -X POST "$BASE/api/tenant/scenario/node/crud" \
     -H "Authorization: Bearer $TOKEN" \
     -H "Content-Type: application/json" \
     -d "{\"scenarioId\":\"$SCN_ID\",\"nodeType\":\"node_action\",\"actionNode\":{\"actionType\":\"email\",\"email\":{\"commChanId\":\"$CHAN_ID\",\"templateId\":\"$TPL_ID\"}},\"position\":{\"x\":0,\"y\":550}}" | jq -r '.id')

   # Webhook action (no branch)
   WEBHOOK_ID=$(curl -s -X POST "$BASE/api/tenant/scenario/node/crud" \
     -H "Authorization: Bearer $TOKEN" \
     -H "Content-Type: application/json" \
     -d "{\"scenarioId\":\"$SCN_ID\",\"nodeType\":\"node_action\",\"actionNode\":{\"actionType\":\"webhook\"},\"position\":{\"x\":200,\"y\":550}}" | jq -r '.id')
   ```

3. **Connect edges:**
   ```bash
   # trigger → wait
   curl -s -X POST "$BASE/api/tenant/scenario/edge/crud" \
     -H "Authorization: Bearer $TOKEN" \
     -H "Content-Type: application/json" \
     -d "{\"scenarioId\":\"$SCN_ID\",\"sourceNodeId\":\"$TRIGGER_ID\",\"targetNodeId\":\"$WAIT_ID\",\"edgeType\":\"link_next_node\"}"

   # wait → branch
   curl -s -X POST "$BASE/api/tenant/scenario/edge/crud" \
     -H "Authorization: Bearer $TOKEN" \
     -H "Content-Type: application/json" \
     -d "{\"scenarioId\":\"$SCN_ID\",\"sourceNodeId\":\"$WAIT_ID\",\"targetNodeId\":\"$BRANCH_ID\",\"edgeType\":\"link_next_node\"}"

   # branch → yes → email
   curl -s -X POST "$BASE/api/tenant/scenario/edge/crud" \
     -H "Authorization: Bearer $TOKEN" \
     -H "Content-Type: application/json" \
     -d "{\"scenarioId\":\"$SCN_ID\",\"sourceNodeId\":\"$BRANCH_ID\",\"targetNodeId\":\"$EMAIL_ID\",\"edgeType\":\"link_yes_branch\"}"

   # branch → no → webhook
   curl -s -X POST "$BASE/api/tenant/scenario/edge/crud" \
     -H "Authorization: Bearer $TOKEN" \
     -H "Content-Type: application/json" \
     -d "{\"scenarioId\":\"$SCN_ID\",\"sourceNodeId\":\"$BRANCH_ID\",\"targetNodeId\":\"$WEBHOOK_ID\",\"edgeType\":\"link_no_branch\"}"
   ```

4. **Save scenario:**
   ```bash
   curl -s -w "\nHTTP_STATUS: %{http_code}\n" -X POST "$BASE/api/tenant/scenario/crud/save-changes" \
     -H "Authorization: Bearer $TOKEN" \
     -H "Content-Type: application/json" \
     -d "{\"scenarioId\": \"$SCN_ID\"}"
   ```

**Verify:**
- Steps 1-3: All return `200` with IDs
- Get by ID shows 5 nodes + 4 edges
- Step 4: **Expected** `200`, **Actual (BUG-017):** `500`

---

### TC-14.4: Data Ingestion → Query → Verify Consistency
- **Priority:** P0
- **Auto:** `tests_business/data-filtering.test.ts`

**What we're testing:** That data ingested via the Ingest API is accurately queryable — field values match, counts are correct, filtering works.

**Flow:**
1. Ingest known customers via Ingest API
2. Wait for data to land
3. Query each customer by primary_id — verify all field values
4. Query with filters — verify counts match expected
5. Query events — verify event data matches

**Steps:**
1. **Query Alice by primary_id:**
   ```bash
   curl -s "$BASE/api/tenant/data/customers/9900000001" \
     -H "Authorization: Bearer $TOKEN" | jq .
   ```
   → first_name=Alice, gender=female, age=35, is_adult=true, income=75000

2. **Filter: gender=female AND is_adult=true:**
   ```bash
   curl -s -X POST "$BASE/api/v2/tenant/data/customers" \
     -H "Authorization: Bearer $TOKEN" \
     -H "Content-Type: application/json" \
     -d '{
       "filter": {
         "combinator": "AND",
         "predicates": [
           {"fieldName": "col__varchar__2", "kind": "field", "operator": "=", "value": "female"},
           {"fieldName": "col__bool__0", "kind": "field", "operator": "=", "value": true}
         ]
       },
       "page": 1, "size": 100
     }'
   ```
   → Count = **3** (Alice, Eve, Grace — Carol is minor)

3. **Verify data count consistency:**
   ```bash
   curl -s "$BASE/api/tenant/data/count" -H "Authorization: Bearer $TOKEN"
   ```
   → customerCount=10, eventCount=18

---

### TC-14.5: Schema Change → Re-Ingest → Query New Fields
- **Priority:** P1
- **Auto:** `tests_business/schema-lifecycle.test.ts` (partial)

**What we're testing:** That after adding a new schema field and applying it, newly ingested data populates that field and it's queryable.

**Flow:**
1. Add a new customer field (e.g., "loyalty_tier" VARCHAR) in draft
2. Apply draft
3. Ingest a customer with the new field populated
4. Query the customer — new field has the value

**Steps:**
1. Create field + apply (see TC-2.2)
2. Ingest customer with new field:
   ```bash
   curl -s -X POST "$BASE/cdp-ingest/ingest/tenant/$TENANT_ID/async/customers" \
     -H "Content-Type: application/json" \
     -d '{"customers": [{"primary_id": "9900000099", "loyalty_tier": "gold"}]}'
   ```
3. Wait ~30s, then query:
   ```bash
   curl -s "$BASE/api/tenant/data/customers/9900000099" \
     -H "Authorization: Bearer $TOKEN" | jq .
   ```

**Verify:**
- The new internal column (e.g., col__varchar__N) has value "gold"

---

### TC-14.6: Campaign with UDAF-Based Segment
- **Priority:** P1
- **Auto:** `tests_business/campaign-logic.test.ts` (partial)

**What we're testing:** Full campaign flow where the segment targets customers based on aggregate values (e.g., "high spenders").

**Flow:**
1. Create SUM UDAF on total_price
2. Wait for recalculation
3. Create segmentation: UDAF value > 1000
4. Create channel + verify + template
5. Create campaign with UDAF-based segment
6. Preview reach

**Verify:**
- Preview count matches customers with SUM(total_price) > 1000 (Bob, Dave, Frank = **3**)

---

## Test Coverage Matrix

| Feature | P0 | P1 | P2 | P3 | Automated | Known Bugs |
|---------|----|----|----|----|-----------|------------|
| Authentication | 3 | 3 | 0 | 0 | All | BUG-012 |
| Schema | 3 | 1 | 0 | 0 | All | — |
| Ingestion | 2 | 1 | 0 | 0 | All | BUG-013 |
| Data Queries | 2 | 2 | 2 | 0 | All | BUG-001, BUG-008, BUG-010 |
| UDAFs | 2 | 1 | 0 | 0 | All | BUG-002, BUG-006 |
| Segmentation | 4 | 3 | 0 | 0 | All | BUG-003, BUG-009 |
| Campaigns | 1 | 0 | 0 | 0 | All | BUG-009 |
| Scenarios | 0 | 1 | 1 | 0 | All | BUG-014–018 |
| Comm Channels | 2 | 4 | 0 | 0 | All | BUG-009, BUG-011 |
| Templates | 1 | 4 | 0 | 0 | All | BUG-009 |
| UI Settings | 0 | 1 | 2 | 0 | All | — |
| File Upload | 1 | 1 | 1 | 0 | All | BUG-013 |
| CRUD Delete/Update | 0 | 2 | 0 | 0 | All | BUG-005, BUG-009, BUG-011 |
| **E2E Workflows** | **2** | **4** | **0** | **0** | **All** | BUG-002, BUG-017 |
