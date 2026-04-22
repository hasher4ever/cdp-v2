---
name: qa-write
description: Progressive test writer across all layers. Discovers the project's test stack, reads qa_coverage for untested elements, writes tests L1→L4 (smoke → interaction → data flow → edge cases). Classifies each gap into the right test layer. Run /qa-crawl first to identify gaps.
---

# QA Write — Progressive Test Writer

## Purpose

Pick up where `/qa-crawl` left off. Read untested elements and write verified tests L1→L4 per page.

**Single page:** `/qa-write /dashboard`
**Specific level:** `/qa-write --depth L2 /dashboard`
**Full sweep:** `/qa-write`

## Prerequisites

- `/qa-crawl` must have run (needs `qa_coverage/{page}.md`). No data → announce and stop.
- Read `state.md` for backend health. If pass rate < 95%, print warning but proceed normally.

**Shared rules apply.** See `references/qa-shared-rules.md` — covers selectors, verify-first loop, bug documentation, context hygiene, quality standards, model tiering, test data management, and JSON reporter rules.

### Write vs Verify Modes

**Write mode (default):** Write tests from qa_coverage gaps. Mark as `Passing: unverified` in journal. Sub-agents cannot run Playwright — never claim pass counts.

**Verify mode (`--verify`):** Run the full suite, parse `reports/playwright-results.json`, update journal with actual pass/fail. Lightweight alternative to `/qa-triage`.

After every write run, print: *"Tests written but not verified. Run `/qa-write --verify` or `/qa-triage` to get actual pass/fail results."*

## Depth Levels

| Depth | What it covers | Applies to |
|-------|---------------|------------|
| **L1 — Smoke** | Page loads, elements visible, submit everything empty, click every button without prerequisites, no crashes | E2E + API |
| **L2 — Interaction** | Happy path (fill correctly) AND unhappy path (empty, invalid, XSS, boundary) for every interactive element | E2E + API |

**L3/L4 are NOT handled by qa-write.** They require validated data flows — use `/qa-nightshift`.

Default is all levels L1→L4 per page. Use `--depth L{n}` to target one level.

## Layer Classification

| Gap type (from qa_coverage/ux_audit) | Test layer |
|--------------------------------------|------------|
| Element not visible / missing label / broken layout | **E2E** |
| Button click → no feedback / modal doesn't open | **E2E** |
| Form submit → wrong API response / error | **API/Backend** |
| API returns wrong data shape / missing field | **API/Backend** |
| Calculation wrong / business rule violated | **Unit/Logic** |
| Page health: API call returns error | **API/Backend** |
| End-to-end workflow (create → verify → delete) | **E2E** + **API** combo |

When a gap spans layers, write both. If the project only has one test layer, write all tests there.

### FE Test Enforcement

**CDP project override (2026-04-01):** Browser-based E2E test writing is suspended. Existing E2E tests are maintained (obvious selector fixes only) but no new E2E tests should be written. All new test writing focuses on API-level backend and business logic tests. Use browser snapshots for reconnaissance (understanding workflows, tracing button→API mappings) but not for test execution or verification.

**For non-CDP projects:** Every page with a crawl cache MUST have L1 + L2 E2E tests. Backend tests don't substitute for FE — the backend can be correct while the UI breaks. Per-page minimum: L1 smoke (1 test), L2 interaction (1 per interactive element). BE-only tests are for endpoints with no UI surface.

After each sub-agent, check test coverage appropriate to the project's test strategy (E2E for projects with FE enforcement, API-level for CDP).

## Procedure

### Step 0: Load Journal + Discover

1. **Read `reports/QA_WRITE_LOG.md`** (if exists). Extract page status, failing tests, blockers, architecture.
2. **Re-discovery needed?** If journal has Test Architecture AND no config changes → reuse. Otherwise run full discovery and update journal.
3. **Discovery targets:** package manager, test frameworks + configs, test directories, test layers (E2E/API/Unit), test style (read 2-3 files), run commands, auth setup, CLAUDE.md conventions.
4. Persist discovery to the Test Architecture section of `reports/QA_WRITE_LOG.md`. See `references/qa-output-templates.md § QA_WRITE_LOG.md` for format.
5. Log any test config file changes to the Config Changes table — prevents `/qa-triage` from miscounting.

### Step 1: Build Queue

Read `reports/QA_COVERAGE.md` + journal. Skip pages already at target depth with all tests passing. Skip blockers. Re-attempt degraded pages if budget allows. Re-attempt failures only if app changed (check git log).

**Single page mode:** Queue only the specified page (user override ignores journal).
**Full sweep:** All pages sorted by lowest coverage first.

Announce: *"Writing tests. Stack: {stack}. Queue: {N} pages. Depth: {levels}. Starting with {page}."*

### Step 2: Per-Page Sub-Agent Loop

**Each page runs as a sub-agent** — keeps orchestrator lean (~2 tool calls per page).

Spawn with minimal prompt (file paths only, no pasted content):

```
Write VERIFIED tests for page {route}. Target depth: {levels}.

Use the Verify-First Loop (references/qa-shared-rules.md):
1. Navigate via mcp__playwright__browser_navigate
2. Snapshot via mcp__playwright__browser_snapshot — selector source of truth
3. Read accessibility tree for exact roles/names/labels
4. Write ONE test from snapshot selectors
5. Run: npx playwright test {file} --grep "{name}" --reporter list
6. Fail → screenshot + re-read snapshot + fix (max 2 attempts)
7. Pass → next test. Repeat.

Quality ceiling: 3-8 verified tests per page. Fewer is fine.

Read: reports/QA_WRITE_LOG.md (architecture), qa_coverage/{page}.md (gaps), 1-2 existing test files (style).

Return: passing tests written, bugs found (app behavior, not selector issues).
```

**Playwright MCP vs npx:** Sub-agents use MCP tools for interactive verification. Orchestrator uses `npx playwright test --reporter json` for batch runs. Sub-agents may use npx for final single-test confirmation.

### Step 3: Checkpoint + Journal Update

After each agent returns, print:
```
✓ {page} — L1-L4 | {layer}: +{N} | unverified | coverage: {before}% → {after}% | bugs: {list}
```

**Immediately update journal:** Page Status row, Failing Tests table, Known Blockers. Critical for crash recovery — if interrupted at page 5/15, next run resumes at page 6.

Validate bug docs: each bug needs `### Setup` + `### Reproduce` with curl blocks. Flag incomplete ones.

### Step 4: Context Budgeting

Orchestrator stays lean via sub-agent isolation. If context grows large: degrade remaining pages to L1+L2 (announce it). Never stop early — prefer shallower tests over skipping pages. If a sub-agent fails (crash, auth), skip and continue.

### Step 5: Stop Conditions

Stop when: all pages done, auth unrecoverable, or context exhausted. On pause: *"Pausing — {done}/{total}. Run `/qa-write` to continue."*

### Step 6: Final Summary

Append Run History entry to journal. See `references/qa-output-templates.md § QA_WRITE_LOG.md` for format.

Print summary table + bugs found + what next run will do + recommendations (`/qa-triage`, `/qa-write --rules`, `/qa-self`).

## Execution Model — Sub-Agent Isolation

Writing tests for one page = 15-30 tool calls (read coverage, read tests, read crawl, write code, run, diagnose, fix, re-run). Without isolation, 3 pages exhaust the orchestrator.

**Orchestrator:** Discovery (once) → build queue → spawn agents → collect summaries → journal updates → final report.
**Sub-agents:** Navigate → snapshot → read gaps → classify → write/verify loop → update coverage → return summary.

**Model:** All levels use Opus — even L1/L2 need correct selectors from live DOM.

## Test Style

**DO NOT use hardcoded templates.** Read 2-3 existing tests, match their exact patterns (imports, grouping, assertions, naming, setup). Use same file naming convention and helper functions.

Add `// @generated by /qa-write L{n}` to generated test blocks. Existing files without `@generated` → append only, never modify.

**File placement:** Follow existing structure exactly. Never create new directories unless the project has no tests.

## Quality Targets (ceilings, not quotas)

- **L1:** 2-4 tests — page loads, elements visible, empty submits
- **L2:** 3-8 tests — one per interactive element type (not per instance)

Every test that ships must pass. Prefer 3 verified tests over 15 blind ones.

## Cross-Reference UX Findings

Before writing tests, check `ux_audit/{page}.md`. P1 findings MUST have coverage. Elements flagged "untested + UX-broken" are highest priority.

## Business Rule Tests (`--rules`)

After page tests are done (or via `/qa-write --rules`), test untested rules from `qa_coverage/business-rules.md`. These are backend tests not tied to specific pages.

1. Read untested rules sorted by priority
2. Classify: calculations → unit, state transitions → API, cross-entity → API, validation → API, auth → API
3. Write, run, verify, update coverage

## Special Modes

### `--heal` — Clean broken generated tests

Find all `@generated` test blocks → run each → fix (1 attempt) or delete. Never touches human-written tests. Updates journal + coverage.

### `--fix {file}:{line}` — Single test repair

Locate test → identify page → navigate + snapshot → diagnose → fix selector → re-verify. Max 2 attempts, then delete (selector issue) or document (app bug).

### `--resync` — Patch selectors after app update

Diff old vs new `page_crawl/{page}.md` → patch changed selectors in `@generated` tests → re-run to verify. Does NOT write new tests or touch human-written tests.

### `--verify` — Run suite and update journal

Run full suite → parse JSON results → update journal pass/fail counts. Does not write tests.

## Flaky Tests

Flaky tests are tracked by `/qa-triage`, not `/qa-write`. If a test flips during writing, note it in the Failing Tests table and move on.

## Rules (qa-write-specific)

**Shared rules from `references/qa-shared-rules.md` apply in full.** The following are qa-write-specific:

1. **Discover, don't assume.** Never hardcode frameworks, directories, or patterns. Read the project first.
2. **Own what you wrote, respect what humans wrote.** `@generated` = freely replaceable. No marker = append-only.
3. **Degrade gracefully.** Context tight → fewer tests per page, not fewer pages. Quality stays constant.
4. **Don't invent layers.** If the project only has E2E tests, write E2E tests.
5. **Cross-check data references before committing.** Verify array indices, expected values, entity names against actual data. A 30-second check prevents hours of wrong triage.
6. **Config changes get logged immediately.** Prevents `/qa-triage` from miscounting tests.
7. **Sub-agent prompts are file paths, not pasted content.** Every spawn adds to orchestrator context.
8. **FE tests are mandatory.** Backend API tests never substitute for E2E coverage on pages with a UI.
