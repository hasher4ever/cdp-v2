# CDP Test Suite

Automated QA suite for the Customer Data Platform at `cdpv2.ssd.uz`.
Go/Gin backend · Vite SPA frontend · multi-tenant.

---

## Quick Start

```bash
npm install
npx playwright install chromium
cp .env.example .env        # fill in credentials (see .env section below)
npm run test:backend        # verify the suite works (~2s)
```

---

## Environment (.env)

```env
CDP_BASE_URL=https://cdpv2.ssd.uz
CDP_DOMAIN=1762934640.cdp.com
CDP_EMAIL=shop2025.11.12-13:04:00@cdp.ru
CDP_PASSWORD=qwerty123
CDP_TENANT_ID=1762934640267
```

All tests run against the shared tenant (ID `1762934640267`).
No fresh-tenant provisioning — signup requires email activation that is not yet automated.

---

## Commands

### Test suites

| Command | What it runs | Time |
|---------|-------------|------|
| `npm run test:backend` | All backend API tests (shared tenant) | ~2s |
| `npm run test:business` | Business logic tests (20 customers, 45 events ingested fresh each run) | ~70s |
| `npm run test:e2e` | Browser E2E tests via Playwright (Chromium, headless) | varies |
| `npm run test:all` | backend → business → e2e in sequence | ~5min |

### Backend test variants

```bash
npm run test:backend          # run all backend tests once
npm run test:backend:watch    # watch mode (re-runs on file change)
npm run test:backend:ui       # Vitest browser UI
```

### E2E test variants

```bash
npm run test:e2e              # headless Chromium
npm run test:e2e:headed       # visible browser window
npm run test:e2e:ui           # Playwright interactive UI mode
npm run test:e2e:report       # open last Playwright HTML report
```

### Cleanup

```bash
npm run cleanup:udafs        # delete all test-tagged UDAFs from the shared tenant
npm run cleanup:udafs:dry    # preview what would be deleted without deleting
```

Test UDAFs accumulate on the shared tenant because tests never delete what they create.
`npm run test:business` now purges stale test UDAFs automatically at the start of each run.
Run `cleanup:udafs` manually after failed runs or before the health check to clear old junk.

Patterns considered test-tagged: `T<timestamp>_*` (makeTag format), `diag_*`, `test_udaf_*`.

### UDAF diagnostic tools (two-phase)

These commands exist to diagnose why newly created UDAFs return HTTP 500
for ~20–30 minutes after creation. Run them in order.

```bash
# Step 1 (optional): measure materialization timing
# Creates 6 UDAFs, polls every 30s for up to 45min, outputs timing report
npm run test:udaf:diagnostic

# Step 2: create UDAFs + record state (run once, then walk away)
npm run test:udaf:setup

# Step 3: assert values (run after the minimum wait has elapsed)
# Refuses with a countdown if run too early; polls until UDAFs are ready
npm run test:udaf:assert
```

See [UDAF Diagnostic](#udaf-diagnostic-two-phase-flow) below for full workflow.

---

### Reports

| Command | Output | Notes |
|---------|--------|-------|
| `npm run report:bugs` | `reports/cdp-report-{timestamp}.html` | Standalone — no server needed |
| `npm run report:dashboard` | `reports/qa-dashboard-{timestamp}.html` | Aggregates all QA skill outputs |
| `npm run report` | `allure-report/` opened in browser | Needs Java installed |
| `npm run report:generate` | `allure-report/` (no open) | Allure generate only |
| `npm run report:open` | opens existing `allure-report/` | Allure open only |

---

## UDAF Diagnostic: Two-Phase Flow

Newly created UDAFs return `500 "unsupported AggType, type: "` for approximately
20–30 minutes. The compute service appears to cache UDAF definitions and only
loads new ones on a periodic refresh cycle.

The two-phase flow separates **creation** from **assertion** so that tests
don't need to poll for 30 minutes inline.

### Phase 0 — measure timing once (optional but recommended)

```bash
npm run test:udaf:diagnostic
```

Runs for up to 45 minutes. Walk away. When it finishes, look at the output:
- **Low variance** across 5 simultaneous UDAFs → cache-refresh theory (fixed interval, not load-dependent)
- **High variance** → queue/load theory (more UDAFs = longer wait)

Output written to `reports/udaf-timing-diagnostic-{timestamp}.json`.

After seeing the actual transition time, update `MIN_PHASE2_WAIT_MS` in
`scripts/udaf-phase1-setup.ts` to `observed_time_ms - 5_minutes_in_ms`.

### Phase 1 — setup (run once, note the time)

```bash
npm run test:udaf:setup
```

Creates 3 UDAFs (`count_no_window`, `count_relative_365`, `count_absolute_future`)
and writes `.udaf-phase1-state.json` with UDAF IDs + timestamp.

If run again while Phase 2 is still locked out, it asks for confirmation
before resetting the clock.

### Phase 2 — assert (run after minimum wait)

```bash
npm run test:udaf:assert
```

Reads `.udaf-phase1-state.json`. If Phase 1 ran less than `MIN_PHASE2_WAIT_MS` ago,
it **refuses** with a message showing how many minutes remain.

Once past the floor, it polls each UDAF every 30 seconds (up to 15 more minutes)
until materialized, then asserts:
- `count_no_window` returns a non-negative number
- `count_relative_365 == count_no_window` (mismatch = BUG-002 RELATIVE window bug)
- `count_absolute_future == count_no_window` (2025–2030 window should cover all data)
- Timing spread across UDAFs (cache vs queue interpretation)

Results appear in Allure.

---

## Project Structure

```
cdp/
├── tests_backend/                    # Backend API tests (Vitest, shared tenant)
│   ├── setup.ts                      # Auth + tenant context loader (runs before every file)
│   ├── client.ts                     # HTTP helpers: get / post / put / del
│   ├── ingest.ts                     # Ingest API client (public endpoints, no auth)
│   │
│   ├── auth.test.ts                  # Sign-in, wrong credentials, token validation
│   ├── tenant.test.ts                # Tenant info, data counts, draft status
│   ├── schema.test.ts                # Customer/event fields, validation rules
│   ├── schema-lifecycle.test.ts      # Draft → apply → cancel lifecycle
│   ├── schema-apply-verify.test.ts   # Schema apply side-effects
│   ├── data.test.ts                  # Customer/event listing, pagination, reports
│   ├── data-ingestion.test.ts        # Ingest API edge cases
│   ├── v2-data-api.test.ts           # V2 data query (columns, orderBy, filter)
│   ├── udafs.test.ts                 # UDAF CRUD + calculate
│   ├── udafs-crud.test.ts            # UDAF create/read/update/delete
│   ├── udaf-phase2-assert.test.ts    # Deferred UDAF assertions (two-phase diagnostic)
│   ├── segmentation.test.ts          # Segmentation CRUD + preview
│   ├── segmentation-udaf-predicate.test.ts  # UDAF-based segment predicates
│   ├── campaign.test.ts              # Campaign CRUD + preview
│   ├── campaign-udaf-preview.test.ts # Campaign preview with UDAF segments
│   ├── commchan.test.ts              # Communication channels CRUD + verify
│   ├── commchan-template-full.test.ts # Channel + template integration
│   ├── template.test.ts              # Message templates CRUD (text/html/json)
│   ├── scenario.test.ts              # Scenario list
│   ├── scenario-builder.test.ts      # Scenario builder: nodes/edges read
│   ├── scenario-creation.test.ts     # Scenario create + node/edge variations
│   ├── scenario-status-delete.test.ts # Scenario status transitions + delete
│   ├── scenario-lifecycle.test.ts    # Full scenario lifecycle
│   ├── ui-settings.test.ts           # UI settings + field mappings
│   ├── employees.test.ts             # Employee management
│   ├── field-reports.test.ts         # Field-level reporting
│   ├── entity-delete.test.ts         # DELETE for all entity types
│   ├── input-validation.test.ts      # Input validation edge cases
│   └── file-upload.test.ts           # File upload (init/part/complete)
│
├── tests_business/                   # Business logic tests (Vitest, 20 customers × 45 events)
│   ├── global-setup-shared.ts        # Auth → ensure schema → ingest dataset → poll ready
│   ├── tenant-context.ts             # custField() / evtField() / purchaseTypeId() helpers
│   ├── test-data.ts                  # Static EXPECTED counts for assertions
│   ├── test-factories.ts             # Dataset builder (deterministic, tag-based)
│   ├── timing-stats.ts               # Timing utilities
│   │
│   ├── data-filtering.test.ts        # Customer/event data verification + v2 filtering
│   ├── data-integrity-edge-cases.test.ts  # Edge cases: empty fields, null, boundary values
│   ├── pagination-edge-cases.test.ts # Pagination boundary conditions
│   ├── v2-data-query.test.ts         # V2 query: columns, orderBy, filter
│   ├── v2-events-query.test.ts       # V2 events query
│   ├── autocomplete.test.ts          # Field value autocomplete (customers + events)
│   ├── segmentation-field-types.test.ts   # VARCHAR/BOOL/DOUBLE/BIGINT/DATE operators
│   ├── segmentation-complex.test.ts       # Nested groups, AND/OR, NEGATE, multi-segment
│   ├── segmentation-advanced-predicates.test.ts  # Complex predicate combinations
│   ├── segmentation-udaf.test.ts          # Segmentation with UDAF predicates
│   ├── udaf-logic.test.ts            # SUM/COUNT/AVG + event filter + time window
│   ├── udaf-field-types.test.ts      # All agg types × field types × filter combinations
│   ├── udaf-segmentation-interplay.test.ts  # UDAF values feeding into segment predicates
│   ├── udaf-relative-window.test.ts  # RELATIVE time window behaviour (BUG-002 coverage)
│   ├── udaf-recalculation-flow.test.ts     # MIN/SUM/COUNT multi-UDAF + segmentation round-trip
│   ├── campaign-logic.test.ts        # E2E: channel → template → segment → campaign
│   ├── campaign-send.test.ts         # Campaign send + delivery verification
│   ├── scenario-execution.test.ts    # Scenario trigger → wait → branch → action
│   ├── customer-update-cascade.test.ts     # Customer update propagates to segments/UDAFs
│   ├── event-detail-and-ingest.test.ts     # Event detail, ingest edge cases
│   ├── event-detail-discovery.test.ts      # Event discovery / profiling
│   ├── cross-feature-workflow.test.ts      # Cross-feature: ingest → segment → campaign → scenario
│   ├── file-upload.test.ts           # File upload (init/part/complete) + CSV paste
│   ├── crud-delete.test.ts           # DELETE for all entity types
│   ├── crud-update.test.ts           # PUT/UPDATE + validate-api-name
│   └── full-workflow.test.ts         # Full 13-step E2E lifecycle
│
├── tests_e2e/                        # Browser E2E tests (Playwright, Chromium)
│   ├── auth.setup.ts                 # Login + save auth session
│   └── specs/
│       ├── auth.spec.ts
│       ├── navigation.spec.ts
│       ├── dashboard.spec.ts
│       ├── clients.spec.ts
│       ├── events.spec.ts
│       ├── scenarios.spec.ts
│       ├── segments.spec.ts
│       ├── campaigns.spec.ts
│       ├── communications.spec.ts
│       ├── statistics.spec.ts
│       ├── files.spec.ts
│       └── aggregates.spec.ts
│
├── scripts/
│   ├── generate-report.ts            # Standalone HTML bug report from bugs.md
│   ├── generate-qa-dashboard.ts      # QA dashboard aggregating all skill outputs
│   ├── udaf-timing-diagnostic.ts     # Measure UDAF 500→200 transition timing (45min run)
│   └── udaf-phase1-setup.ts          # Phase 1: create UDAFs, write state file
│
├── docs/                             # Full QA documentation
│   ├── INDEX.md                      # Entry point — links all docs
│   ├── QA-HANDBOOK.md                # Architecture, setup, key concepts, test data reference
│   ├── MANUAL-FRONTEND-TESTING.md    # Click-by-click UI testing (Russian labels, data prep)
│   ├── REGRESSION-CHECKLIST.md       # 164-item pass/fail checklist (13 sections)
│   ├── TEST-CASES.md                 # API test cases with copy-paste curl commands
│   ├── API-REFERENCE.md              # All 77 endpoints with methods, payloads, curl examples
│   └── BACKEND-SPEC.md               # Data lifecycle, testing contract, anti-patterns
│
├── reports/                          # Generated reports (gitignored)
│   ├── cdp-report-{timestamp}.html   # Bug report (npm run report:bugs)
│   ├── qa-dashboard-{timestamp}.html # QA dashboard (npm run report:dashboard)
│   └── udaf-timing-diagnostic-*.json # UDAF timing diagnostic output
│
├── openapi/                          # API specs (from backend team)
│   ├── clustermeta.yaml              # Main API (auth, schema, data, campaigns, etc.)
│   ├── ingest.yaml                   # Ingest API
│   └── compute.yaml / communication.yaml  # K8s deployment specs (not API specs)
│
├── bugs.md                           # All discovered bugs with curl reproduction steps
├── .udaf-phase1-state.json           # Written by test:udaf:setup, read by test:udaf:assert
├── vitest.config.ts                  # Backend test config
├── vitest.business.config.ts         # Business test config (with globalSetup)
├── vitest.udaf-phase2.config.ts      # Phase 2 UDAF assert config (no globalSetup)
└── playwright.config.ts              # E2E test config
```

---

## Test Architecture

### Shared tenant

All tests run against tenant ID `1762934640267`. There is no fresh-tenant provisioning
(signup requires email activation that is not yet automatable).

The `global-setup-shared.ts` for business tests:
1. Authenticates against the shared tenant
2. Ensures the required schema fields exist (409 = already exists = fine)
3. Ingests 20 customers + 45 events with deterministic primary IDs
4. Polls until data is queryable before handing off to test files

### Test data

- **Primary ID range:** `9_000_000_000 + (tag_hash % 800_000_000)` — unique per run, stable within a run
- **20 customers:** mix of female/male/other, ages 14–68, various income/subscription combos
- **45 events:** deterministic prices, cities, statuses — pre-calculated `EXPECTED` counts in `test-data.ts`
- **Run tag:** `T{timestamp}{4-char-random}` — prefixes all created entity names to avoid shared tenant pollution

### Test isolation

Backend tests (`tests_backend/`) — any order, no shared state between files.
Business tests (`tests_business/`) — sequential (`concurrent: false`), share the ingested dataset.
E2E tests — isolated Playwright sessions, share the saved auth state.

### Column name helpers

Never hardcode `col__double__0` style names in business tests. Use:
```ts
import { custField, evtField, purchaseTypeId } from "./tenant-context";

custField("gender")          // → "col__varchar__2" (or whatever the mapping is)
evtField("total_price")      // → "col__double__0"
purchaseTypeId()             // → 3  (or whatever event type ID is)
```

---

## Bug Tracking

Bugs live in `bugs.md`. Each entry has:
- Sequential ID (`BUG-001`, `BUG-002`, …) — **permanent, never renumbered**
- Severity (High / Medium / Low)
- Copy-paste curl commands that reproduce from scratch
- Expected vs actual response bodies

```bash
npm run report:bugs     # generate HTML report from bugs.md
```

To add a bug: append to the bottom of `bugs.md` with the next sequential ID,
then run `npm run report:bugs`.

---

## QA Documentation

Full documentation in `docs/` — start from [`docs/INDEX.md`](docs/INDEX.md).

| Document | Contents |
|----------|----------|
| [QA Handbook](docs/QA-HANDBOOK.md) | Onboarding, architecture, setup, key concepts |
| [Manual Frontend Testing](docs/MANUAL-FRONTEND-TESTING.md) | Click-by-click UI testing, Russian labels, data prep |
| [Regression Checklist](docs/REGRESSION-CHECKLIST.md) | 164-item pass/fail checklist for releases |
| [Test Cases](docs/TEST-CASES.md) | API test cases with copy-paste curl commands |
| [API Reference](docs/API-REFERENCE.md) | All 77 endpoints with payloads and examples |
| [Backend Spec](docs/BACKEND-SPEC.md) | Data lifecycle, testing contract, anti-patterns |

---

## Auth Notes

The correct sign-in endpoint is `/public/api/signin` — **not** `/api/auth/sign-in`
(that route has a middleware bug and always returns `{"error":"missing token"}`).

```bash
TOKEN=$(curl -s -X POST "https://cdpv2.ssd.uz/public/api/signin" \
  -H "Content-Type: application/json" \
  -d '{"username":"shop2025.11.12-13:04:00@cdp.ru","password":"qwerty123","domainName":"1762934640.cdp.com"}' \
  | grep -o '"jwtToken":"[^"]*"' | cut -d'"' -f4)
```

Response field is `jwtToken`, not `token`.
