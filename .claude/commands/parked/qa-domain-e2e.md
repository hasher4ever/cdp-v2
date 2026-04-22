---
name: qa-domain-e2e
description: Domain-driven browser E2E test writer. Walks through real user workflows (create load → assign → dispatch → deliver) via Playwright MCP, then writes verified Playwright spec tests. Uses data_flows/ journey maps + component_recipes/ for interaction knowledge. Continuous mode loops until context dies.
---

# QA Domain E2E — Browser Workflow Test Writer

## Purpose

Write **browser E2E tests that exercise real business workflows**, not just "button exists, click doesn't crash." Each test walks a user journey end-to-end: create data → interact with UI → verify state changes → assert business rules.

**Usage:**
- `/qa-domain-e2e` — write tests for the highest-priority uncovered workflow
- `/qa-domain-e2e --continuous` — non-stop loop: one workflow at a time until context dies
- `/qa-domain-e2e --workflow "create-and-dispatch"` — specific workflow only

## How This Differs From `/qa-write`

| | `/qa-write` | `/qa-domain-e2e` |
|---|------------|------------------|
| **Tests** | Element visibility, click interactions | Full user workflow across pages |
| **Input** | `qa_coverage/{page}.md` element inventory | `data_flows/` journey maps + docs/BACKEND-SPEC.md |
| **Example** | "search input is present" | "create shipment → assign driver → dispatch → verify status on loadboard" |
| **Depth** | L1-L2 (some shallow L3-L4) | Real L3-L4 (data flow + business validation) |

## Prerequisites

Before writing tests, the skill needs:

1. **Playwright MCP available** — for navigating the live app, taking snapshots, interacting with elements
2. **`data_flows/schema-reference.md`** — GraphQL field names (for verifying API state after UI actions)
3. **Auth state** — `tests/auth-state.json` must exist (from Playwright auth setup)

**Optional but helpful:**
- `data_flows/*.md` journey maps (from `/qa-flows` or `/qa-synthesize`)
- `component_recipes/` interaction recipes (from `/qa-probe`)
- `page_crawl/{page}.md` element inventories

If journey maps don't exist, the skill derives workflows from docs/BACKEND-SPEC.md directly.

## Core Workflows to Test

These are the real user journeys that matter, derived from docs/BACKEND-SPEC.md:

| # | Workflow | Pages | What It Proves |
|---|---------|-------|---------------|
| 1 | **Create Shipment** | Load Board → New Load Dialog → Load Board | New load appears on board with correct status |
| 2 | **View & Edit Load Detail** | Load Board → Load Detail → Edit fields → Back | Data round-trips correctly, stops/trips visible |
| 3 | **Inline Assignment** | Load Board → Dispatch/Driver/Truck combobox → Verify | Inline entity assignment updates the row |
| 4 | **Team Management** | Team Mgmt → Assign dispatcher → Assign driver crew | Crew assignment persists across page reload |
| 5 | **Driver Management** | Drivers → Add Driver → Verify in list | New driver appears, status badge correct |
| 6 | **Fleet Management** | Fleet → Add Truck → Verify in list → Sort | Truck CRUD works end-to-end |
| 7 | **Customer Lookup** | Customers → Search by name → Open detail | Customer data accessible, MC/DOT displayed |
| 8 | **Settings Round-Trip** | Settings → Change value → Reload → Verify persisted | Settings actually save |
| 9 | **Cross-Page Data Flow** | Create load → See on dashboard KPI → See in fleet truck assignment | Data flows across modules |
| 10 | **Status Tab Filtering** | Load Board → Switch tabs → Verify row counts differ → Switch back | Tab filters show correct subsets |

## Procedure

### Step 0: Check Prerequisites

1. Verify Playwright MCP is available (try `mcp__playwright__browser_navigate`)
2. Read `data_flows/schema-reference.md` — if missing, warn and derive field names from `page_crawl/`
3. Read `reports/QA_WRITE_LOG.md` — check which workflows already have E2E tests
4. Read `component_recipes/_index.md` if it exists — cached interaction patterns

### Step 1: Select Workflow

**Single mode:** Pick the highest-priority uncovered workflow from the table above.
**Continuous mode:** Work through the list top-to-bottom, skipping workflows with existing tests.

Check existing spec files for coverage:
- `tests/specs/cross-page-flows.spec.ts` — existing cross-page tests
- `tests/specs/load-board-inline.spec.ts` — existing inline edit tests
- Grep for workflow-specific patterns (e.g., "createShipment" in spec files = Workflow 1 covered)

### Step 2: Walk the Workflow via Playwright MCP (Interactive Discovery)

**CRITICAL: Do this BEFORE writing any test code.**

For the selected workflow, manually walk through it using Playwright MCP:

1. `mcp__playwright__browser_navigate` to the starting page
2. `mcp__playwright__browser_snapshot` to get the accessibility tree
3. For each step in the workflow:
   a. **Identify the element** from the snapshot (exact role, name, label)
   b. **Interact** (`browser_click`, `browser_fill_form`, `browser_select_option`)
   c. **Snapshot again** to see what changed
   d. **Screenshot** if something unexpected happens
4. **Record the exact interaction sequence**: which selectors worked, what appeared after each click, what the final state looks like

This produces a **verified interaction script** — not guessed selectors from text descriptions.

### Step 3: Write the Test

Using the verified interaction script from Step 2, write a Playwright spec test:

**File:** `tests/specs/workflows/{workflow-slug}.spec.ts` (new directory for workflow tests)

**Structure:**
```typescript
import { test, expect } from '@playwright/test'

// @generated by /qa-domain-e2e
// Workflow: {name}
// docs/BACKEND-SPEC.md: §{N}
// Verified via Playwright MCP on {date}

test.describe('{Workflow Name}', () => {
  test('{step-by-step description}', async ({ page }) => {
    // Step 1: Navigate to starting page
    await page.goto('/all-loads-board')
    await page.waitForLoadState('networkidle')

    // Step 2: Perform action (using verified selectors from MCP walk)
    await page.getByRole('button', { name: 'New load' }).click()
    // ... exact selectors from Step 2 discovery

    // Step 3: Verify business outcome
    // ... assertions that prove the workflow worked
  })
})
```

**Key rules for test code:**
- Every selector must come from the MCP snapshot walk (Step 2), NOT guessed
- Include `waitForLoadState('networkidle')` after navigation
- Verify BUSINESS outcomes, not just "no crash" (e.g., "new row appears on loadboard with status UNASSIGNED")
- Use the project's existing test style (read `load-board.spec.ts` for reference)

### Step 4: Run and Verify

```bash
npx playwright test tests/specs/workflows/{file} --reporter list
```

- If passes: move to next workflow
- If fails: re-walk with MCP, fix selector, re-run (max 2 attempts)
- If still fails: determine if app bug or test issue. Document and move on.

### Step 5: Update Journal

Add to `reports/QA_WRITE_LOG.md`:
```
| /workflows/{slug} | L3-L4 | {N} | {pass}/{total} | — | {date} | Workflow: {name} |
```

## Continuous Mode (`--continuous`)

```
LOOP:
  1. Read journal → find next uncovered workflow
  2. If all 10 covered → STOP
  3. Walk workflow via Playwright MCP (Step 2)
  4. Write test (Step 3)
  5. Run test (Step 4)
  6. Update journal (Step 5)
  7. Print: "Workflow {N}/10: {name} — {pass}/{total} | Next: {next}"
  8. GOTO 1
```

**Context budgeting:**
- Each workflow takes ~30-50 tool calls (MCP navigation + snapshot + write + run)
- Budget ~10 workflows per conversation in continuous mode
- If context gets tight: finish current workflow, save journal, stop cleanly

## Workflow Directory

Tests go in a dedicated directory to separate them from element-level tests:

```
tests/specs/workflows/
  create-shipment.spec.ts         — Workflow 1
  load-detail-edit.spec.ts        — Workflow 2
  inline-assignment.spec.ts       — Workflow 3
  team-management.spec.ts         — Workflow 4
  driver-management.spec.ts       — Workflow 5
  fleet-management.spec.ts        — Workflow 6
  customer-lookup.spec.ts         — Workflow 7
  settings-roundtrip.spec.ts      — Workflow 8
  cross-page-data-flow.spec.ts    — Workflow 9
  status-tab-filtering.spec.ts    — Workflow 10
```

## Rules

1. **MCP walk BEFORE writing.** Never write a test without first navigating the workflow via Playwright MCP. The MCP walk IS the test discovery.
2. **Verified selectors only.** Every selector must come from a snapshot taken during the MCP walk. No guessing from page_crawl/ text.
3. **Business assertions, not crash checks.** "No crash" is L1. "New row appears with status UNASSIGNED and customer name matches" is L3.
4. **One workflow per test file.** Keep tests focused. Each file tests one complete user journey.
5. **Screenshot on failure.** If a step produces unexpected results during MCP walk, take a screenshot and document what happened.
6. **Reuse component recipes.** If `component_recipes/` has a recipe for the component you're interacting with, use its verified Playwright snippet instead of re-discovering.
7. **Max 2 fix attempts per test.** If the test doesn't pass after 2 selector fixes, it's likely an app issue — document and move on.
8. **Journal is the handoff.** Every workflow's status (done/in-progress/failed) goes in the journal so the next session picks up cleanly.
