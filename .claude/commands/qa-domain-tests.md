---
name: qa-domain-tests
description: Domain-driven L3/L4 backend test orchestrator for CDP. Three phases — prep (API-reference freshness + gap analysis), dispatch (per-section sub-agents), verify (run suite + fix). Uses docs/BACKEND-SPEC.md + docs/API-REFERENCE.md as test specs. Writes to tests_business/domain-*.test.ts.
---

# QA Domain Tests — CDP Backend API Test Orchestrator

## Purpose

Write **domain-driven backend tests** that verify `docs/BACKEND-SPEC.md` lifecycle rules and `docs/API-REFERENCE.md` endpoint contracts against the live CDP REST API. Three automated phases: prep the API reference, dispatch per-section writers, verify and fix.

**Usage:**
- `/qa-domain-tests` — full run (prep + dispatch + verify)
- `/qa-domain-tests --continuous` — **non-stop loop until context dies.** Writes one section at a time, verifies, logs, repeats. Resumes via journal.
- `/qa-domain-tests --prep` — Phase 1 only (freshness check + gap analysis)
- `/qa-domain-tests --section 4` — single section only (prep + write + verify for that section)
- `/qa-domain-tests --verify` — Phase 3 only (run existing domain tests, fix import/field issues)

## Continuous Mode (`--continuous`)

```
LOOP:
  1. Read journal (reports/QA_WRITE_LOG.md) — what's done, what's next
  2. Read gap matrix — find next uncovered §section
  3. If all sections covered → run --verify on everything → STOP
  4. Write tests for ONE section (single sub-agent, sequential — saves orchestrator context)
  5. Run that file immediately (npx vitest run --config vitest.business.config.ts {file} --reporter json)
  6. Fix import / column-name issues (1 round max)
  7. Update journal with results
  8. Print checkpoint: "§{N} done — {pass}/{total} | Next: §{M}"
  9. GOTO 1
```

**Why sequential in continuous mode:**
- CDP's `vitest.business.config.ts` has `fileParallelism: false` (JWT cache + tenant isolation, see memory). Parallel sub-agent WRITES are fine; parallel test RUNS aren't.
- Sequential keeps orchestrator lean (~2 tool calls per section).
- With ~12 testable sections, sequential finishes in one conversation.
- If context runs out mid-section, the journal records exactly where to resume.

**Resumption:** The journal tracks which sections have passing domain tests. A new session running `/qa-domain-tests --continuous` reads the journal, skips completed sections, picks up from the first gap.

## Output

All domain-driven scenario tests write to `tests_business/` with the `domain-` prefix (to avoid collision with CDP's existing `scenario-*` tests which cover the Scenario Engine *feature*):

```
tests_business/
  domain-schema-lifecycle.test.ts      — §1 Schema draft/apply/propagation
  domain-customer-ingest.test.ts       — §2 Customer ingestion invariants
  domain-event-ingest.test.ts          — §3 Event ingestion invariants
  domain-udaf-aggregation.test.ts      — §4 UDAF COUNT/SUM/AVG/MIN/MAX + filters + windows
  domain-query-predicates.test.ts      — §5 v2 query + predicate correctness
  domain-segmentation.test.ts          — §6 Segmentation preview + create + UDAF predicates
  domain-campaign-lifecycle.test.ts    — §7 Campaign create → send → event (blackhole only)
  domain-scenario-engine.test.ts       — §8 Scenario state machine + execution
  domain-commchan-template.test.ts     — §9 Template rendering + CommChan linkage
  domain-tenant-config.test.ts         — §10 Tenant config boundaries
  domain-file-upload.test.ts           — §11 CSV → customer ingest integrity
  domain-cross-entity.test.ts          — §12 Schema↔Ingest↔UDAF↔Segment↔Campaign integrity
```

If an existing non-domain test already covers a section end-to-end (e.g. `udaf-logic.test.ts` covers §4 well), mark it COVERED in the gap matrix and skip.

---

## Phase 1: PREP

> Runs once. Results cached. Re-runs if stale (>7 days).

### Step 1A: API Reference Freshness

**Prologue — env gate.** Run `npm run qa:env` first. If exit code is 1 (backend DOWN), halt the whole run and report env.json's failing checks. No point writing domain tests against a broken backend.

CDP uses REST, not GraphQL. The authoritative surface map is `docs/API-REFERENCE.md` (77+ endpoints) — **do not regenerate it automatically**; it's maintained by humans. Only check:

1. It exists. If missing, halt and tell the user to restore it from git.
2. `git log -1 --format=%ci docs/API-REFERENCE.md` shows a date within the last 90 days. If older, warn in the gap matrix but continue.

Also confirm these helper files exist (tests depend on them — if any are missing, halt):
- `tests_backend/client.ts` — auth + HTTP helpers
- `tests_backend/setup.ts` — global setup (JWT cache)
- `tests_business/global-setup-shared.ts` — shared tenant bootstrap
- `tests_business/tenant-context.ts` — `getTenant()`, `custField()`, `evtField()`
- `tests_business/test-factories.ts` — `makeCustomers()`, `makeEvents()`, `ingestAndWait()`
- `tests_business/udaf-helpers.ts` — `createAndVerifyUdaf()`, `waitForUdaf()`, `extractUdafValue()`
- `tests_business/test-data.ts` — `TEST_TAG`, `CUSTOMERS`, `EVENTS`, `EXPECTED`

**Column names are resolved at runtime via `custField()` / `evtField()`** — there is no static schema reference to keep fresh. This is by design: each tenant assigns its own `col__xxx_N` internal names.

### Step 1B: Gap Analysis

1. Read `docs/BACKEND-SPEC.md` + `docs/API-REFERENCE.md` table of contents.
2. List existing files in `tests_business/` and any domain-style files in `tests_backend/` (files matching `*-logic.test.ts`, `*-lifecycle.test.ts`, `cross-*`, `full-*`, `domain-*`).
3. For each §section (1-12 below), check:
   - Is a `domain-{slug}.test.ts` file present?
   - Does an existing non-domain file cover the same ground? (Check test titles, not just filenames.)
   - How many `it(` occurrences total?
   - Are tests tagged with `// §{N}` comments?

4. Build and print the gap matrix:

```
## Gap Analysis — {date}

| §Section | Title | Existing Coverage | Test Count | Status |
|----------|-------|-------------------|------------|--------|
| §1 | Schema Lifecycle | schema-lifecycle + schema-apply-verify | 14 | COVERED |
| §2 | Customer Ingestion | data-ingestion + ingest-boundary | 9 | PARTIAL |
| §3 | Event Ingestion | event-ingest-boundary + event-detail-and-ingest | 12 | COVERED |
| §4 | UDAF Aggregation | udaf-logic + udaf-oracle + udaf-* | 40+ | COVERED |
| §5 | Query & Predicates | v2-data-query + v2-events-query | 8 | PARTIAL |
| §6 | Segmentation | segmentation-* + seg-campaign-chain | 20+ | COVERED |
| §7 | Campaign | campaign-logic + campaign-send + campaign-lifecycle | 15 | COVERED |
| §8 | Scenario Engine | scenario-execution + scenario-* | 10 | COVERED |
| §9 | CommChan + Template | commchan-* + template-* | 12 | COVERED |
| §10 | Tenant Config | tenant-config-boundary | 6 | PARTIAL |
| §11 | File Upload | file-upload + file-upload-boundary | 8 | COVERED |
| §12 | Cross-Entity Integrity | cross-feature-workflow + full-workflow | 5 | PARTIAL |

Sections to write: §2 (missing orphaned-event semantics), §5 (missing udaf predicate kind), §10 (missing propagation delay), §12 (missing schema→udaf→segment cascade)
Sections to skip (covered): §1, §3, §4, §6, §7, §8, §9, §11
```

PARTIAL = existing coverage but has a known gap; the sub-agent should write *additive* tests (not replace existing files).
COVERED = do not touch; skip.
GAP = write from scratch into `domain-{slug}.test.ts`.

**STOP here if `--prep` flag was passed.**

---

## Phase 2: DISPATCH

> Sub-agents write tests for each gap/partial section.

### Duplicate Work Guard

Before dispatching:
- If a section is COVERED, skip. Print: "§4 covered by udaf-logic + udaf-oracle (40+ tests) — SKIP"
- Dispatch only for GAP and PARTIAL sections.
- PARTIAL sections get a narrower prompt (write only the missing test cases named in the gap matrix, not a whole file).

### Agent Dispatch Rules

- **Sequential by default** (CDP's shared-tenant + fileParallelism:false constraint). Parallel writes are fine, but keep orchestrator load low.
- If `--section N` is passed, dispatch one agent for that section.
- In continuous mode, always one at a time.

### Model Tiering

| Test Type | Model | Rationale |
|-----------|-------|-----------|
| UDAF multi-step (ingest → wait → create → wait → calculate → assert) | Opus | Complex sequencing + timing |
| Segmentation preview / campaign lifecycle | Opus | Multi-entity dependencies |
| Schema draft apply / ingestion boundary | Sonnet | Pattern-match, low creativity |
| Bulk invariants (query all + loop assert) | Sonnet | Simple pattern |

### Sub-Agent Prompt Template

For each §section with gaps, use this prompt:

```
Write L3/L4 business-logic tests for CDP §{N}: {section title}.

READ FIRST (mandatory — do not skip any):
1. docs/BACKEND-SPEC.md — the lifecycle rules you are verifying
2. docs/API-REFERENCE.md §{relevant subsection} — exact endpoint paths, payloads, responses
3. tests_business/test-factories.ts — makeCustomers, makeEvents, ingestAndWait, primaryIdScopePredicate, v2Filter, v2Cond
4. tests_business/udaf-helpers.ts — createAndVerifyUdaf, waitForUdaf, extractUdafValue, skipIfNotMaterialized
5. tests_business/tenant-context.ts — getTenant(), custField(logicalName), evtField(logicalName), purchaseTypeId()
6. tests_business/test-data.ts — TEST_TAG, CUSTOMERS, EVENTS, EXPECTED (known fixture expectations)
7. tests_business/udaf-logic.test.ts — style reference for a typical CDP domain test
8. tests_backend/client.ts — api() client, auth headers
9. tests_backend/setup.ts — global auth setup

RULES:
- Run via `npm run test:business` (config: vitest.business.config.ts, fileParallelism: false).
- Import from '../tests_backend/client.js' (or the path that existing tests use — check udaf-logic.test.ts first).
- Use vitest: import { describe, it, expect, beforeAll } from 'vitest'
- NEVER import from 'vitest/globals' — always explicit.
- NEVER use test.skip(). If a test can't run, don't write it.
- NEVER hardcode column names (col__xxx). Always resolve via custField() / evtField().
- NEVER use fresh-tenant provisioning — it's archived. Use getTenant() which returns the shared tenant.
- NEVER assert immediately after ingest or UDAF create. Use ingestAndWait / waitForUdaf.
- NEVER use CommChan with kind != "blackhole" (email quota exhausted per memory).
- Tag each test with a comment: // §{N}: {brief rule text}
- Mark file header with: // @generated by /qa-domain-tests
- Tests live in: tests_business/domain-{slug}.test.ts
- 3-8 tests per file. Every assertion must be a meaningful business rule, not HTTP status.

PRIORITY ORDER (per BACKEND-SPEC Testing Contract):
1. Bulk invariants — query all records of a type, loop, assert rule holds for every record.
2. Fresh data lifecycle — make fixtures → ingest → wait → mutate/create → wait → calculate → assert specific numeric value.
3. Negative cases — predicates that should exclude, time windows that should filter, etc.

ASSERTION STYLE (from BACKEND-SPEC §Anti-Pattern #5):
- GOOD: `expect(extractUdafValue(calc)).toBe(EXPECTED.bobPurchases)` (2, from fixtures)
- BAD:  `expect(response.status).toBe(200)`

UDAF QUIRKS (BACKEND-SPEC §Aggregation Layer):
- `null` result = timing, not a bug. Use `skipIfNotMaterialized()` or poll with `waitForUdaf()`.
- Inconsistent casing — `result` vs `Result`. Always use `extractUdafValue()`.
- BUG-002: RELATIVE time windows return 0. Don't write tests that rely on them working.

STRUCTURE:
describe('§{N}: {section title}', () => {
  beforeAll(async () => { /* ingest fixtures if needed, wait for landing */ })

  describe('invariants', () => {
    it('every customer with primary_id in test range has required fields // §{N}: ...', ...)
  })
  describe('lifecycle', () => {
    it('ingest → wait → query returns exact value // §{N}: ...', ...)
  })
})

Write to: tests_business/domain-{slug}.test.ts
After writing, report: file path, test count, any missing endpoints/helpers you had to invent.
```

For PARTIAL sections, replace the "Write to" line with: *"Append only the listed missing tests to the existing domain-{slug}.test.ts (create it if absent). Do not modify tests in the pre-existing non-domain files."*

---

## Phase 3: VERIFY

> Sequential. Runs after all Phase 2 agents complete.

### Step 3A: Run the Suite

```bash
cd C:/Users/amirz/cdp && npx vitest run --config vitest.business.config.ts tests_business/domain-*.test.ts --reporter=json --outputFile=reports/domain-scenarios-result.json
```

Use Bash tool timeout `120000` (2 min) per memory entry "Test Run Timeout". If the full suite needs more, run sections individually.

**CRITICAL: Parse JSON output only.** Read `reports/domain-scenarios-result.json`. Never parse terminal output.

**Then run the triage wrapper for deterministic pass/fail classification:**

```bash
npm run qa:triage
```

The wrapper writes `reports/triage.json` with `{verdict: PASS|WARN|FAIL, summary: {passed, failed, unexpected_failures[], expected_failures[]}}`. It reconciles failures against `reports/expected-failures.json` so known-bug failures don't poison the verdict. Downstream logic should consume `reports/triage.json`, NOT grep raw vitest output.

### Step 3B: Triage Failures

| Failure Type | Detection | Action |
|--------------|-----------|--------|
| **Import error** | "Cannot find module", missing `.js` extension | Fix import path. |
| **Column hardcoded** | "column col__xxx__N does not exist" for a hardcoded name | Replace with `custField()` / `evtField()`. |
| **Auth/timing** | 401/403/timeout | Ensure `import '../tests_backend/setup.js'` (or equivalent path — check udaf-logic.test.ts) at top. Do not retry. |
| **UDAF null** | `extractUdafValue()` returns null | Timing, not bug. Wrap in `skipIfNotMaterialized()` or rerun suite. |
| **Business logic** | Concrete numeric expectation fails (e.g. expected 3, got 2) | **FINDING**. Tag with `// §{N} FINDING: {description}`. Do not adapt the test to the bug (memory: "Never adapt business logic tests to match backend bugs"). |
| **RELATIVE window = 0** | UDAF with RELATIVE time window returns 0 | Known BUG-002. Do not treat as a new finding. Test should not have been written against a known bug. |
| **500 on compute** | Calculate endpoint 500 | Shared-tenant compute corruption (known per memory). Mark env-dependent, not a finding. |

### Step 3C: Fix Round (max 1)

- Collect ALL import errors + hardcoded-column errors across files.
- Fix them all at once (batch Edit).
- Re-run ONCE more. Remaining failures are findings or env issues; do not retry.

### Step 3D: Flaky Isolation

If a test fails with `null`/`undefined` from UDAF calculate:
1. Re-run that single file 2 more times (per memory "Bug Triage Process — run 2-3x").
2. Fails 3/3 → real finding.
3. Fails 1–2/3 → flaky timing; add `skipIfNotMaterialized()` guard.

### Step 3E: Log Results

Append to `reports/QA_WRITE_LOG.md` — see `references/qa-output-templates.md` § QA_WRITE_LOG.md. Include:
- Phase summaries (which sections were GAP/PARTIAL/COVERED)
- Findings (business logic failures: section, test name, expected vs actual, reproducing file)
- Files written table (path, tests added, pass/fail)

Append one row to `reports/SKILL_STATS.md`.

**Closeout snapshot.** After logging, run:

```bash
npm run qa:finished
```

This writes `reports/closeout.json` with git state, report verdicts, modified files, and a punchlist — used by `/finished` to author the final narrative.

---

## Pipeline Status Footer

After all phases complete, print a summary table:

```
| § | Title | File | Tests | Pass | Fail | Status |
|---|-------|------|-------|------|------|--------|
| 2 | Customer Ingestion | domain-customer-ingest.test.ts | 5 | 5 | 0 | GREEN |
| 5 | Query & Predicates | domain-query-predicates.test.ts | 4 | 3 | 1 | FINDING |
...
Totals: 18 tests written, 16 passing, 1 finding, 1 env-flaky. Findings → reports/QA_WRITE_LOG.md
```

---

## Hard Rules

**Shared rules apply.** See `references/qa-shared-rules.md` (JSON reporter, no test.skip, test isolation, bug documentation).

**CDP-specific rules:**

1. **No GraphQL.** CDP is REST. Ignore any remnant skill text referring to mutations, queries, or graphql clients — use the `api()` client from `tests_backend/client.ts`.

2. **No column-name hardcoding.** Every customer/event field name is resolved via `custField()` / `evtField()`. Column names differ per tenant.

3. **Shared tenant only.** `getTenant()` always returns tenant `1762934640267`. The fresh-tenant provisioner is archived (memory: "Tenant Strategy"). Isolate by primary_id range (`9_900_000_001–9_900_000_010`) and `TEST_TAG`, not by tenant.

4. **Async is real.** Never assert right after ingest or UDAF create — use `ingestAndWait()` / `waitForUdaf()`. Typical waits: 30s–2min for data landing, 3–7min for UDAF recalc.

5. **UDAF null ≠ bug.** A null result means the materialization hasn't caught up. Only consistently wrong non-null values are findings (memory: "UDAF Materialization").

6. **Do not adapt tests to known bugs.** Tests reflect human business logic; backend bugs get filed in `bugs.md`, not smoothed over in the test (memory: "Test Approach", "Bug ID Immutability").

7. **CommChan = blackhole.** Never write tests that send via email/sms/push — quota exhausted (memory: "CommChan Blackhole Only").

8. **No browser.** This is backend domain testing only. If a section needs UI verification, mark it for `/qa-domain-e2e` instead (memory: "No Browser Interaction").

9. **Timeout discipline.** Bash tool timeout 120000ms. Not Unix `timeout 300`. Not 600000. 120s is enough for any single-file run (memory: "Test Run Timeout").

10. **Log everything.** Every run appends to `reports/QA_WRITE_LOG.md` and `reports/SKILL_STATS.md`.

11. **One fix round max.** No infinite retry loops. On repeat failures, classify as finding or env-flaky and stop (memory: "Stuck Recovery", "Improvement Ceiling").
