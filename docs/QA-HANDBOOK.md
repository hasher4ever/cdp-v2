# CDP QA Handbook

> Onboarding guide for QA engineers joining the CDP (Customer Data Platform) project.

## Table of Contents

- [Project Overview](#project-overview)
- [Environment Setup](#environment-setup)
- [Architecture](#architecture)
- [Test Layers](#test-layers)
- [Running Tests](#running-tests)
- [Test Data](#test-data)
- [Bug Reporting](#bug-reporting)
- [Key Concepts](#key-concepts)

---

## Project Overview

CDP is a **Customer Data Platform** hosted at `cdpv2.ssd.uz`. It allows businesses to:

- **Collect** customer and event data (via API ingestion or file upload)
- **Model** data with custom schemas (customer fields, event types, event fields)
- **Aggregate** data using UDAFs (User-Defined Aggregate Functions: SUM, COUNT, AVG, MIN, MAX)
- **Segment** customers using predicate-based filters (field operators, nested AND/OR, NEGATE)
- **Campaign** — reach segmented audiences via email/webhook channels
- **Automate** using the Scenario Builder (trigger → wait → branch → action flows)

### Tech Stack

| Layer | Technology |
|-------|-----------|
| Backend | Go + Gin framework |
| Frontend | Vite SPA (Russian locale UI) |
| Database | Multi-tenant (column-based internal naming: `col__varchar__0`, `col__double__1`, etc.) |
| Auth | JWT Bearer tokens |
| Test framework | Vitest 4 (API/business), Playwright (E2E) |
| Reports | Allure + standalone HTML bug report |

---

## Environment Setup

### Prerequisites

- Node.js 18+
- npm
- Git
- Java (for Allure reports only)
- Chromium (installed automatically by Playwright)

### Installation

```bash
git clone <repo-url>
cd cdp
npm install
npx playwright install chromium   # for E2E tests
```

### Configuration

Copy `.env.example` to `.env` and fill in:

```env
CDP_BASE_URL=https://cdpv2.ssd.uz      # Platform URL
CDP_DOMAIN=1762934640.cdp.com           # Tenant domain
CDP_EMAIL=shop2025.11.12-13:04:00@cdp.ru  # Login email
CDP_PASSWORD=qwerty123                   # Login password
CDP_TENANT_ID=1762934640267             # Tenant ID
```

> **Note:** Backend tests use the shared tenant from `.env`. Business tests provision their own fresh tenant — they ignore these credentials for data operations.

---

## Architecture

### Multi-Tenancy

Every tenant has isolated data. The platform uses **internal column names** like `col__varchar__0` instead of human-readable names like `first_name`. The mapping between logical field names and internal column names is established during schema creation.

### Schema Workflow

Schema changes follow a **draft → apply** lifecycle:

1. **Draft**: Add/modify/delete fields (changes are staged, not live)
2. **Status check**: `GET /api/tenants/schema/draft-schema/status` returns pending change count
3. **Apply**: `POST /api/tenants/schema/draft-schema/apply` commits all drafted changes
4. **Cancel** (optional): `DELETE /api/tenants/schema/draft-schema/cancel` discards pending changes

### Two Data Ingestion Paths

| Path | Endpoint | Auth | Use Case |
|------|----------|------|----------|
| **Ingest API** | `/cdp-ingest/ingest/tenant/{id}/async/{customers\|events}` | None (public) | Real-time streaming |
| **File Upload** | `/api/file/upload/{init\|part\|complete}` | JWT required | Bulk historical import |

### Internal Field Naming

When you create a customer field "gender" (VARCHAR), the backend assigns it an internal name like `col__varchar__2`. All data queries must use the internal name, not the logical name. This is why test code uses helpers like `custField("gender")` → `col__varchar__2`.

### UDAF Recalculation

UDAFs (SUM, COUNT, AVG, MIN, MAX over event data) are **not instant**. After data ingestion, UDAF values may take **5–7 minutes** to recalculate. The business test suite polls for readiness before running UDAF assertions.

---

## Test Layers

### Layer 1: Backend API Tests (`tests_backend/`)

- **Purpose:** Verify API contracts, CRUD operations, error handling
- **Tenant:** Shared (from `.env`)
- **Speed:** ~2 seconds
- **Scope:** Individual endpoint behavior — does the API respond correctly?

### Layer 2: Business Logic Tests (`tests_business/`)

- **Purpose:** Verify business logic end-to-end with known data
- **Tenant:** Fresh tenant provisioned per run (isolated)
- **Speed:** ~70 seconds (includes provisioning + data ingestion + UDAF warmup)
- **Scope:** Cross-feature workflows — do segmentation predicates return correct counts? Do UDAFs compute correct sums?

### Layer 3: E2E Browser Tests (`tests_e2e/`)

- **Purpose:** Verify UI flows in the browser
- **Technology:** Playwright with Chromium
- **Locale:** Russian (all UI labels are in Russian)
- **Scope:** Can a user log in, navigate, see data, create entities?

---

## Running Tests

```bash
# Backend API tests (fast, shared tenant)
npm run test:backend

# Business logic tests (slow, provisions fresh tenant)
npm run test:business

# E2E browser tests
npm run test:e2e              # headless
npm run test:e2e:headed       # with browser visible
npm run test:e2e:ui           # Playwright UI mode

# All tests
npm run test:all

# Reports
npm run report:bugs           # Generate HTML bug report from bugs.md
npm run report                # Allure report (requires Java)
```

### Watching Tests

```bash
npm run test:backend:watch    # Re-run on file changes
npm run test:backend:ui       # Vitest UI dashboard
```

---

## Test Data

Business tests use **deterministic test data** defined in `tests_business/test-data.ts`.

### 10 Test Customers

| # | Name | Gender | Age | Adult? | Subscribed? | Income | City (events) |
|---|------|--------|-----|--------|-------------|--------|---------------|
| 1 | Alice | female | 35 | yes | yes | $75,000 | Tashkent, Samarkand |
| 2 | Carol | female | 17 | no | yes | $0 | Bukhara |
| 3 | Eve | female | 25 | yes | no | $45,000 | (no events) |
| 4 | Grace | female | 31 | yes | yes | $88,000 | Tashkent, Bukhara |
| 5 | Bob | male | 40 | yes | no | $120,000 | Samarkand |
| 6 | Dave | male | 51 | yes | yes | $250,000 | Tashkent |
| 7 | Frank | male | 65 | yes | no | $180,000 | Tashkent, Samarkand |
| 8 | Hana | other | 25 | yes | yes | $0 | Tashkent |
| 9 | Ivan | male | 26 | yes | yes | $55,000 | Bukhara |
| 10 | Jun | male | 15 | no | no | $0 | (no events) |

### 18 Purchase Events

Distributed across 3 cities:
- **Tashkent:** 9 events (Alice 2, Grace 1, Dave 4, Frank 1, Hana 1)
- **Samarkand:** 5 events (Alice 1, Bob 2, Frank 2)
- **Bukhara:** 4 events (Carol 1, Grace 1, Ivan 2)

### Pre-Calculated Expected Values

These are used in test assertions:

| Metric | Value |
|--------|-------|
| Total customers | 10 |
| Total events | 18 |
| Female customers | 4 |
| Male customers | 5 |
| Other gender | 1 |
| Adults (age >= 18) | 8 |
| Minors (age < 18) | 2 |
| Subscribed | 6 |
| Unsubscribed | 4 |

### Primary ID Range

Test customers use primary IDs `9_900_000_001` through `9_900_000_010`. This range is chosen to avoid collisions with real data.

### TEST_TAG Convention

All entities created by tests (UDAFs, segments, campaigns) are prefixed with `TEST_TAG` to distinguish them from manually created entities.

---

## Bug Reporting

### Process

1. Discover a bug during testing
2. Add an entry to `bugs.md` with the next sequential ID (BUG-001, BUG-002, ...)
3. Run `npm run report:bugs` to regenerate the HTML report

### Required Fields per Bug

| Field | Description |
|-------|-------------|
| **Bug ID** | Sequential: BUG-001, BUG-002, ... |
| **Severity** | High / Medium / Low |
| **Endpoint** | The API endpoint or UI page |
| **Curl command** | Copy-paste reproducible curl |
| **Expected** | What should happen |
| **Actual** | What actually happens |
| **Notes** | Additional context |

### Critical Rule

> **Never adapt tests to match backend bugs.** If a test expects `200` and gets `500`, and the expectation is logically correct, the test stays as-is. The bug goes into `bugs.md`. Only fix tests when the expected value itself is wrong (bad math, wrong index, etc.).

---

## Key Concepts

### Predicates (Segmentation & Branch Nodes)

Predicates are the core filtering model used in segmentation and scenario branch nodes:

```json
{
  "combinator": "AND",
  "predicates": [
    {
      "fieldName": "col__varchar__2",
      "kind": "field",
      "operator": "=",
      "value": "female"
    },
    {
      "fieldName": "col__bool__0",
      "kind": "field",
      "operator": "=",
      "value": true
    }
  ]
}
```

Predicates support:
- **Combinators:** AND, OR
- **Nesting:** Groups within groups
- **NEGATE:** Invert a group
- **Operators:** `=`, `!=`, `>`, `<`, `>=`, `<=`, `in`, `is_null`, `is_not_null`
- **Field kinds:** `field` (customer field), `udaf` (aggregate value)

### V2 Data Query Format

The undocumented V2 API uses a specific `orderBy` format:

```json
{
  "direction": "ASC",
  "param": {
    "fieldName": "col__double__0",
    "kind": "field"
  }
}
```

### Scenario Builder

Scenarios are visual automation flows with 4 node types:

| Node Type | Purpose | Key Config |
|-----------|---------|------------|
| `node_trigger` | Entry point | `triggerType`: trigger_now, trigger_on_date, trigger_on_event |
| `node_wait` | Delay | `waitNodeType`: static_wait, `durationMin`: N |
| `node_branch` | Decision | Uses predicate model (same as segmentation) |
| `node_action` | Execute | `actionType`: email, webhook |

Edges connect nodes with types: `link_next_node`, `link_yes_branch`, `link_no_branch`.

### Communication Channels

Before sending campaigns, a communication channel must be created and **verified**. Channel types: email, webhook. Verification hits the `/verify` endpoint to confirm credentials work.

### File Upload Flow

Three-step chunked upload:
1. `POST /api/file/upload/init` → returns `objectId`
2. `POST /api/file/upload/part?objectId=X` → binary chunk (Content-Type: application/octet-stream)
3. `POST /api/file/upload/complete` → finalize with field mappings

---

## API Client & Test Isolation

### API Client

`tests_backend/client.ts` exports `get`, `post`, `put`, `del` — all inject Bearer token from `globalThis.__cdp_token`. Ingest endpoints are public (no auth): `tests_backend/ingest.ts`.

### Test Isolation

- Backend tests (`tests_backend/`) run against the shared tenant from `.env`
- Business tests (`tests_business/`) use `global-setup-shared.ts` to auth, ensure schema, ingest test data, and poll until queryable
- Never hardcode `col__xxx` column names — use `custField("gender")` / `evtField("total_price")` from `tenant-context.ts`
- The `.test-tenant.json` file bridges globalSetup → setupFiles. It is only read when `__CDP_USE_PROVISIONED_TENANT=1` env var is set (by globalSetup)

---

## Test Style Conventions

- Tests use `describe`/`it` with descriptive names including expected values: `"should preview: adults=8, minors=2"`
- Business test files are named by feature: `segmentation-field-types.test.ts`, `udaf-logic.test.ts`
- Keep test files focused — one feature per file, not mega-files

---

## Maintaining Documentation

When making changes to tests or discovering new behavior, keep docs in sync:
- **New bug found** → add to `bugs.md` + run `npm run report:bugs` + add checkbox to [Regression Checklist](REGRESSION-CHECKLIST.md)
- **New endpoint discovered** → add to [API Reference](API-REFERENCE.md)
- **New test added** → add corresponding entry to [Test Cases](TEST-CASES.md)
- **UI change** → update Russian labels in [Manual Frontend Testing](MANUAL-FRONTEND-TESTING.md)
- **New feature** → add section to [Regression Checklist](REGRESSION-CHECKLIST.md) + [Test Cases](TEST-CASES.md)
