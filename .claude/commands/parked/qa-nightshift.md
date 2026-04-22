---
name: qa-nightshift
description: Autonomous overnight test writer. Reads validated data_flows/, writes and verifies L3/L4 (data flow + edge case) E2E tests one at a time. Runs until context dies. Picks up where it left off across sessions. Companion to /qa-flows --explore (which discovers flows) — this one writes tests from them.
---

# QA Night Shift — Autonomous Domain-Driven Test Writer

## Purpose

Write and verify **L3 (data flow) and L4 (edge case) E2E tests** autonomously, overnight, from validated `data_flows/` files. Each test is written, run, verified, and fixed before moving to the next. Never stops, never rushes, never ships broken tests.

**This is the test-writing companion to `/qa-flows --explore`:**
- `/qa-flows --explore` discovers flows + leaves questions → you review in the morning
- `/qa-nightshift` writes tests from validated flows → you review passing tests in the morning

**Usage:** `/qa-nightshift` — run in auto mode before bed

## Prerequisites

- `data_flows/` must have at least one flow with `validated: true`
- `page_crawl/index.md` must exist (for route list)
- Test infrastructure must be discoverable (playwright.config.*, test files, etc.)

If no validated flows exist: "No validated data flows found. Run `/qa-flows --interview` or `/qa-synthesize` first."

## How It Differs from `/qa-write`

| | `/qa-write` | `/qa-nightshift` |
|---|---|---|
| **Scope** | All levels L1-L4, all pages | L3/L4 only, from data_flows/ |
| **Source** | qa_coverage/ element inventory | data_flows/ validated flows |
| **Speed** | Fast — targets per page | Slow — one test at a time, fully verified |
| **Mode** | Interactive or batch | Autonomous overnight |
| **Persistence** | QA_WRITE_LOG.md | nightshift-log.md (more granular) |

`/qa-write` handles L1/L2 (element-based). `/qa-nightshift` handles L3/L4 (flow-based). They complement each other.

## State File: `data_flows/.nightshift-state.md`

Tracks progress across runs so the agent never re-does work. See `references/qa-output-templates.md` § Nightshift State for template. Contains: Last Run metadata, Flow Coverage table (flow / steps / tests written / passing / last run), and Test Registry table (test name / file / flow / step / status / attempts / last run).

## Procedure

### Step 0: Load State + Discover Architecture

1. Read `data_flows/.nightshift-state.md` (create if missing)
2. Read `reports/QA_WRITE_LOG.md` Test Architecture section (if exists — reuse qa-write's discovery)
3. If no architecture discovered: run the standard test stack discovery (same as qa-write Step 0)
4. Read existing test files to learn style, imports, patterns

### Step 1: Build Queue from Validated Flows

```
Read: data_flows/index.md
Filter: validated: true only (human, synthesized+validated, discovered+validated)
Sort: human flows first (highest confidence), then by page coverage gap
Skip: flows already fully covered in nightshift-state.md
```

Announce: "Night shift starting. {N} validated flows, {M} already covered. Writing tests for {remaining} flows. First up: {flow name}."

### Step 2: Per-Flow Test Writing

For each flow in queue:

#### 2a. Read the Flow

Read `data_flows/{flow}.md`. Extract:
- Steps table (page, action, expected result, API call, assertion)
- Preconditions (what must exist before the flow starts)
- Edge cases (L4 targets)
- Business rules referenced

#### 2b. Plan Tests

From the flow, derive a test plan:

**L3 tests (one per significant step):**
- Each step that involves an API call or data change = one test
- Steps that are pure navigation (click tab, scroll) = skip or combine into setup
- Multi-step sequences that must run in order = `test.describe.serial`

**L4 tests (one per edge case):**
- Each edge case from the flow's "Edge Cases" section = one test
- Each "what violates" from referenced business rules = one test
- Each known bug that affects this flow = one regression test

**Test structure per flow:**
```typescript
test.describe.serial('{Flow Name}', () => {
  // Setup: create precondition data (tagged __qa_nightshift_)

  test('L3: creates shipment via New Load modal', async ({ page }) => {
    // Steps 1-3 of the flow
  });

  test('L3: verifies trip auto-created on load detail', async ({ page }) => {
    // Step 4 — depends on previous test's data
  });

  test('L4: rejects empty form submit', async ({ page }) => {
    // Edge case 1
  });

  // Cleanup: delete test entities
});
```

#### 2c. Write + Verify One Test at a Time

**THE CORE LOOP — this is where the agent spends most of its time:**

For each planned test:

1. **Navigate to the page** via Playwright MCP, take snapshot
2. **Read the accessibility tree** — find exact selectors for target elements
3. **Write ONE test** using selectors from the live snapshot
4. **Run it:** `npx playwright test {file} --grep "{test name}" --reporter list`
5. **If passes:** record in nightshift-state.md, move to next test
6. **If fails:**
   - Take screenshot to see actual state
   - Re-read snapshot for correct selector
   - Fix and re-run (max 2 attempts)
   - After 2 failures: determine if selector issue or real bug
     - Selector issue → delete the test, note in state
     - Real bug → keep the test (it documents the bug), add `// BUG-{N}` comment, note in state
7. **Save state after EVERY test** — crash-safe, never loses progress

**Pacing:** This is an overnight agent. There is NO rush. Spend as many tool calls as needed per test to get it right. 3 verified tests per hour is fine. 1 verified test that's correct > 10 that are broken.

#### 2d. Test Data Management

**Precondition setup:**
- Before the first L3 test in a flow, create any required test data
- Tag all created entities with `__qa_nightshift_{flow}_{timestamp}`
- Use the test framework's setup hooks (beforeAll/beforeEach)

**Cleanup:**
- After all tests in a flow complete, delete test entities
- Use afterAll hooks
- If cleanup fails, log it — don't fail the test

**Isolation between flows:**
- Each flow's tests use their own data — no sharing between flows
- This means flows can run in any order and tests are independent

#### 2e. Flow Checkpoint

After all tests for a flow are written/verified:

```
✓ Flow: {name} — L3: {n} tests ({passing}/{total}) | L4: {m} tests ({passing}/{total}) | Bugs: {list}
```

Update `data_flows/.nightshift-state.md`:
- Mark flow as covered in Flow Coverage table
- Add all tests to Test Registry
- Update Last Run date

### Step 3: Context Management

**The agent never stops if there's work to do.** But context windows are finite.

**Budget tracking:**
- After each flow, estimate remaining context
- If tight: switch to shorter flows (fewer steps = fewer tests = less context per flow)
- If very tight: switch to L4-only mode (edge case tests are single-step, cheaper to write)

**Never:** stop mid-flow. Finish the current flow before checking context.

**On context limit:**
```
Night shift pausing.

Progress:
- Flows covered: {N}/{total}
- Tests written: {M} ({passing} passing, {failing} failing)
- Bugs found: {list}
- Next flow: {name}

Run /qa-nightshift to continue from {next flow}.
```

### Step 4: Morning Summary

When all flows are covered OR context runs out:

Write a summary to `data_flows/.nightshift-summary-{date}.md` with: results (flows covered, L3/L4 test counts, bugs found, tests deleted), new bugs table, test files modified table, flows not yet covered, and what's next recommendations.

## File I/O

**Reads:** `data_flows/*.md`, `.nightshift-state.md`, `reports/QA_WRITE_LOG.md`, `page_crawl/`, `docs/BACKEND-SPEC.md`, `bugs.md`. **Writes:** test files, `.nightshift-state.md`, `.nightshift-summary-{date}.md`, `bugs.md`. **Never writes:** `state.md`, `reports/QA_WRITE_LOG.md`, `data_flows/*.md` (flow files are read-only ground truth).

## Relationship to Other Night Agents

Alternate nights: `/qa-flows --explore` (discover) -> human review -> `/qa-nightshift` (write tests) -> `/qa-triage` (run all). Or chain in one session if context allows.

## Rules

**Shared rules apply.** See `references/qa-shared-rules.md` (selectors from live DOM, verify-first, bug documentation, test data tagging).

**Nightshift-specific rules:**
1. **One test at a time.** Write, run, verify, fix. Never batch.
2. **Human flows first.** `source: human` flows get tests before `source: synthesized`.
3. **Serial tests for dependent steps.** Flow steps that depend on previous data use `test.describe.serial`.
4. **Save state after every test.** The agent can crash at any point and lose zero progress.
5. **Pace yourself.** This is overnight. Quality > speed. 3 verified tests/hour > 30 broken tests/hour.
6. **Never modify flow files.** data_flows/ is read-only for this agent. If a flow is wrong, the test fails and gets documented — the flow fix is the human's job.
