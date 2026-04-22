---
name: qa-synthesize
description: Derive data flow maps from existing documentation — docs/BACKEND-SPEC.md, bugs_journeys.md, backend tests, page_crawl/. No app access needed. Produces synthesized flow files for qa-write L3/L4 consumption. Fast, fully autonomous.
---

# QA Synthesize — Document-Derived Flow Generator

## Purpose

Extract data flow maps from existing project artifacts WITHOUT touching the live app. Reads business rules, bug reports, test files, and page inventories to construct flow maps that qa-write uses for L3/L4 test generation.

**Usage:** `/qa-synthesize` — process all sources, write all flows
**Usage:** `/qa-synthesize §3` — synthesize flows from a specific docs/BACKEND-SPEC.md section only

## When to Use

- Before `/qa-flows --interview` — pre-populates flows that the human can then validate faster
- When the app is down or inaccessible — still produces useful test intelligence
- After new business rules are added — synthesize new flows immediately
- After bugs are documented — convert bug journeys into test flows

## Inputs

| Source | What it provides | Path |
|--------|-----------------|------|
| docs/BACKEND-SPEC.md | Domain rules with "where enforced" and "what violates" | Root |
| bugs_journeys.md | Step-by-step cURL sequences = API-level data flows | Root |
| bugs.md | Known failures = negative test flows | Root |
| tests_backend/src/business/scenarios/*.test.ts | Lifecycle test scenarios | tests_backend/ |
| tests_backend/src/*.test.ts | API test files with valid payloads | tests_backend/ |
| page_crawl/*.md | Page element inventories | page_crawl/ |
| data_flows/index.md | Already-synthesized flows (skip duplicates) | data_flows/ |

## Output

Writes to `data_flows/synthesized-{slug}.md` with `source: synthesized, validated: false`.

## Procedure

### Step 1: Read All Sources

Read in this order (stop early if a source doesn't exist):

1. `data_flows/index.md` — know what's already covered
2. `docs/BACKEND-SPEC.md` — full read, extract all rules with enforcement locations
3. `page_crawl/index.md` — route list for UI-matching
4. `bugs_journeys.md` — if exists, full read
5. `bugs.md` — if exists, scan for bug descriptions
6. Scan `tests_backend/src/business/scenarios/` — read file names + first 50 lines of each
7. Scan `tests_backend/src/*.test.ts` — read file names + describe block names

### Step 2: Extract Flows from Business Rules

For each rule in docs/BACKEND-SPEC.md:

1. **Identify the entities involved** — match entity names (Shipment, Trip, Stop, Driver, Truck, etc.) to pages via page_crawl/
2. **Identify the trigger** — what action causes this rule to fire? (status change, form submit, assignment, etc.)
3. **Identify the API call** — from "where enforced" field, match to test files for exact mutation/query names
4. **Identify the verification** — what should change after the rule fires? (status update, new record created, field value changed)
5. **Construct the flow:**
   - Starting page (where the user initiates the action)
   - Action (what they click/submit)
   - API call (the mutation that fires)
   - Result page (where to verify the outcome)
   - Assertion (what to check)

6. **Identify edge cases from "what violates"** — these become L4 test targets

Example:
```
Rule: §3 — Shipment status starts as UNASSIGNED after creation
Entities: Shipment
Trigger: createShipment mutation
Pages: /all-loads-board (creation), /load/{id} (verification)
API: createShipment
Assertion: status = UNASSIGNED, trip auto-created, 2 stops

Edge cases from "what violates":
- Create without customer → should reject
- Create with invalid dates (delivery before pickup) → should reject
```

### Step 3: Extract Flows from Bug Journeys

For each journey in bugs_journeys.md:

1. **Parse the cURL sequence** — each curl is a flow step
2. **Map API endpoints to UI pages:**
   - `createShipment` → "New load" form on /all-loads-board
   - `updateTrip` → Trip edit on /load/{id}
   - `getShipment` → Load detail page /load/{id}
   - `sendToDriver` → Dispatch button on load detail
3. **Construct a UI-equivalent flow** — same steps but through the browser instead of cURL
4. **Mark as negative test** if the journey documents a bug — the expected behavior (what SHOULD happen) becomes the assertion

### Step 4: Extract Flows from Backend Test Scenarios

For each scenario file in `tests_backend/src/business/scenarios/`:

1. **Read the test** — identify the API call chain
2. **Map to UI:** each API call = a user action on a page
3. **Construct the flow** with assertions matching the test's expect() statements
4. **Note:** These are the most reliable source — they have exact payloads and expected responses

### Step 5: Cross-Reference with Page Elements

For each synthesized flow:

1. Read `page_crawl/{page}.md` for each page in the flow
2. Verify the UI elements referenced actually exist:
   - "New load button" → check page_crawl/all-loads-board.md has element #10 "New load" button
   - "Customer dropdown" → check the modal has a customer select
3. If an element doesn't exist in the crawl: mark as `???` with a question
4. If a flow step has no corresponding page: mark as "API-only step, no UI equivalent"

### Step 6: Deduplicate

Before writing, check `data_flows/index.md`:
- If a flow with the same slug already exists AND is `validated: true` → skip (don't overwrite human work)
- If it exists but is `validated: false` → overwrite with fresh synthesis
- If it doesn't exist → create new

### Step 7: Write Flows

For each synthesized flow:

1. Write `data_flows/synthesized-{slug}.md` using the standard template
2. Set `source: synthesized, validated: false, discovered_by: qa-synthesize`
3. Fill in all known steps, mark unknowns as `???`
4. List questions for elements that couldn't be matched to UI

### Step 8: Update Index

Update `data_flows/index.md` with all new/updated flows.

### Step 9: Summary

```
## QA Synthesize Complete

Sources processed:
- docs/BACKEND-SPEC.md: {N} rules → {M} flows
- bugs_journeys.md: {N} journeys → {M} flows
- Backend scenarios: {N} files → {M} flows
- bugs.md: {N} bugs → {M} negative flows

Flows written: {total}
- New: {N}
- Updated: {N}
- Skipped (already validated): {N}

Questions generated: {N} (run /qa-flows --review to answer)
Unmatched UI elements: {N} (page_crawl may be stale)

Next: Run /qa-flows --review to validate synthesized flows,
      or /qa-flows --interview to add human-validated flows.
```

## Rules

1. **Never overwrite human-validated flows.** If `source: human` or `validated: true`, skip.
2. **No app access.** This skill reads files only. No Playwright, no API calls, no network.
3. **Mark confidence.** Flows derived from backend tests = high confidence. Flows inferred from rule descriptions = medium. Flows guessed from entity names = low. Note the source rule/test/bug in each flow.
4. **Always cross-reference page_crawl.** A flow step that references a UI element must verify it exists in the crawl cache. Unverified elements get `???`.
5. **Prefer specific over general.** "Create shipment with customer UBER FREIGHT, origin Chicago, dest LA" is better than "Create a shipment."
6. **Include the API mutation/query name.** qa-write needs this to set up network interception in E2E tests.
7. **Extract edge cases from "what violates."** Every business rule's violation list becomes an L4 test target.
8. **Link to source.** Every flow step should reference where the information came from: `(from §3)`, `(from BUG-4)`, `(from full-lifecycle.test.ts)`.
