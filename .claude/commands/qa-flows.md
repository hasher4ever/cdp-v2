---
name: qa-flows
description: Interactive data flow builder for L3/L4 test intelligence. Three modes — explore (AI discovers flows overnight, leaves questions), interview (human walks through flows with AI), review (human annotates AI discoveries). Produces data_flows/*.md consumed by qa-write.
---

# QA Flows — Interactive Data Flow Builder

## Purpose

Build the **connective tissue** between pages — the data flow maps that tell qa-write what to test at L3 (data flow) and L4 (edge cases). Without these, qa-write only knows what elements exist, not how data moves between them.

**Three modes:**
- `/qa-flows --explore` — AI explores the live app, discovers elements, leaves questions for human
- `/qa-flows --interview [/page]` — Human walks through flows step by step, AI records
- `/qa-flows --review` — Human reviews and annotates AI's overnight discoveries

## Output

All flows write to `data_flows/`:

```
data_flows/
  index.md                          — Flow registry
  .explore-state.md                 — Exploration progress (resume across runs)
  {flow-slug}.md                    — Human-validated flow (source: human)
  synthesized-{slug}.md             — Doc-derived flow (source: synthesized)
  discovered-{page}.md              — AI exploration draft (source: discovered)
```

**Templates:** See `references/qa-output-templates.md` § Data Flow File, § Data Flows Index, § Discovery File.
**Provenance rules:** See `references/qa-output-templates.md` § Provenance Rules.

---

## Mode: `--explore` (Autonomous Discovery)

**When:** Run overnight, unattended. Persistent across multiple runs.

### Step 0: Load State

1. Read `page_crawl/index.md` (must exist, error if missing)
2. Read `data_flows/index.md` + `data_flows/.explore-state.md` (create if missing)
3. Build queue: pages sorted by least-explored first, skip `explored: complete`

### Step 1: Per-Page Exploration

For each page in queue:

1. **Navigate** via `mcp__playwright__browser_navigate`, wait for content
2. **Snapshot to file** via `mcp__playwright__browser_snapshot(filename: "data_flows/.cache/{page}.md")` — then `Read` only first ~50 lines for element inventory. For tables, read 2-3 rows max.
3. **Screenshot** to `data_flows/.cache/{page}.png`

4. **Catalog every interactive element.** For each element, record type/label/state/ARIA and classify intent:
   - **Navigation** (links, breadcrumbs) → record destination
   - **State change** (tabs, toggles, filters) → SAFE to interact
   - **Data entry** (inputs, dropdowns in forms) → record fields, do NOT submit
   - **Destructive** (delete, remove, cancel) → record existence, do NOT click
   - **Creation** (new, add, create, submit) → record existence, do NOT click
   - **Unknown** → record and ask human

5. **Interact with EVERYTHING.** Click buttons, fill inputs, submit forms, open modals — discover what every element does.
   - Fill inputs with `__qa_explore_` prefix for any created entities
   - Open every dropdown, record all options
   - Submit forms, record API calls and resulting state changes
   - Click tabs, snapshot each tab's content
   - Try invalid inputs too (empty submit, boundary values) — record validation behavior
   - **Cleanup:** After creation, delete test entities if a delete endpoint exists. If no delete: "Created __qa_explore_{entity}_{timestamp} — manual cleanup needed"
   - **Hard stop:** Do NOT click buttons that are clearly irreversible AND affect real users (mass notifications, production deploys). When in doubt, click it.

6. **Auto-validate standard patterns.** Before generating questions, auto-validate obvious behavior (pagination, sort, column options, search, tabs, status toggles, edit icons). Mark as `auto-validated: true`. Only generate questions for genuinely ambiguous elements: API-integrated comboboxes, business logic interpretations, elements whose behavior couldn't be determined by clicking, multi-step workflows. **Target: 3-8 questions per page.**

7. **Generate contextual answer options via Sonnet sub-agent.** For each non-auto-validated question, spawn a Sonnet sub-agent that reads the element inventory, `docs/BACKEND-SPEC.md`, `page_crawl/{page}.md`, and `CLAUDE.md` to produce 3-5 domain-aware multiple-choice options. Output format in discovery files:
   ```markdown
   - [ ] Q1: The "RC import" button — what does it do?
     - A) Uploads Rate Confirmation PDF → auto-creates shipment
     - B) Imports loads from external TMS via EDI
     - C) CSV batch import
     - D) Other
   ```

8. **Record network requests** via `mcp__playwright__browser_network_requests` — note API endpoints on page load.

9. **Diff against previous exploration.** If `data_flows/discovered-{page}.md` already exists, compare and record changes in `## Changes Since Last Exploration`:

   | Change Type | Element | Before | After | Date |
   |-------------|---------|--------|-------|------|
   | STATE | Dispatch combobox | disabled | enabled | 2026-03-31 |
   | ADDED | "Export CSV" button | — | new | 2026-03-31 |

   These diffs ARE regression signals. **Accumulate, don't overwrite** — append new changes, building version history over time.

### Step 2: Write Discovery File

Write `data_flows/discovered-{page-slug}.md` using template from `references/qa-output-templates.md` § Discovery File. Key principle: present what was **observed** (facts) AND what was **assumed** (business logic interpretation). Human validates the assumption, not the observation.

Finding types: page purpose, element behavior, data flows/API calls, validation behavior, security tests, multi-step behavioral flows. Every finding gets a validation prompt.

### Step 3: Update State

Update `data_flows/.explore-state.md` (page status table) and `data_flows/index.md` with new entries.

### Step 4: Next Page

Move to next page. Never stop early if there's work to do. Repeat until context limit, then save state.

**Queue priority:**
1. Pages never explored
2. Pages with answered questions (re-explore with new context)
3. Pages last explored >7 days ago (full re-explore)
4. Pages last explored >3 days ago (light re-check — snapshot + diff only)

**When ALL pages are fresh (<3 days):** Start deep re-exploration — auto-probe complex components via `/qa-probe`, explore sub-states not previously reached, run full diff pass, try edge case interactions (double-click, rapid tab switching, back-button).

**On pause (context limit):**
1. Print summary of progress
2. Announce: "Explored {done}/{total} pages. {M} questions pending. {C} changes detected."

**Answer ingestion:** On next run, check for `data_flows/.review-answers.json`. If exists: update discovery files with answers, auto-assemble answered questions into draft flows, promote fully-answered discoveries to `validated: true`, transfer validated logic to structured docs, delete answers file.

---

## Mode: `--interview` (Human-Guided Flow Recording)

**When:** Human has time to walk through workflows. Most valuable mode — produces ground truth.

### Step 0: Setup

1. Read `page_crawl/index.md` + `data_flows/index.md`
2. If page argument given: start there. Otherwise: list pages with fewest validated flows
3. Check `data_flows/discovered-*.md` for pending questions — offer to review those first

### Step 1: Navigate and Present

Navigate via Playwright MCP, take snapshot + screenshot. Present element inventory summary and ask: "What would a user typically do on this page?"

### Step 2: Record User's Steps

User says what to do → AI executes via Playwright MCP → AI snapshots result → AI presents what happened → user explains next step. Record each step with expected results and assertions.

**Brief example:**
```
User: "Click New load"
AI: Modal opened: "Create New Load" — Fields: Customer (combobox), Origin, Destination,
    Pickup date, Delivery date, Load pay, Reference number.
    What would the user fill in?
User: "Select customer from dropdown, enter Chicago origin, LA destination, dates, click Create"
AI: [records steps with API calls and assertions]
```

### Step 3: Exhaustive Element Tracking

**The interview does NOT end when the user finishes a flow. It ends when EVERY interactive element is accounted for.** Maintain a checklist. After each flow, show remaining uncovered elements and work through them one by one.

Mark elements as: **flow step** (in a recorded flow), **explained** (described but not a flow step), **standard** (confirmed standard behavior), or **skip** (with reason).

The page is complete only when all elements have one of these labels.

### Step 4: Write Flows

After each flow (not just at the end):
1. Assemble steps into flow template (`references/qa-output-templates.md` § Data Flow File)
2. Match business rules from docs/BACKEND-SPEC.md by entity names and actions
3. Suggest edge cases based on matched rules
4. Write to `data_flows/{slug}.md` with `source: human, validated: true`
5. Update index. Continue to next uncovered element — do NOT ask "are we done?" until all elements are accounted for

### Step 5: Page Completion

When all elements are accounted for, present summary (flows recorded, elements explained/skipped). Only now ask about moving to another page.

---

## Mode: `--review` (Annotate AI Discoveries)

**When:** Morning after overnight explore run. Human reviews and answers questions.

1. Read `data_flows/index.md`, filter for `validated: false` AND `questions_pending > 0`
2. Sort by most questions first
3. Present one discovery at a time with screenshot and questions
4. User answers inline → AI updates discovery file, decrements `questions_pending`
5. When all questions answered: assemble into proper flows, present for approval → set `validated: true`
6. Extra context from user beyond the question → record in Notes

---

## Rules

1. **Human flows are sacred.** Files with `source: human` are never overwritten by AI. AI can suggest updates, human edits.
2. **Explore mode interacts with everything.** Tag created data with `__qa_explore_` prefix. Clean up after. Only skip irreversible user-facing actions.
3. **One question at a time in interview mode.** Don't overwhelm.
4. **Always suggest exploratory paths.** Mention elements the user didn't discuss.
5. **Always reference business rules.** Grep docs/BACKEND-SPEC.md for matching entities.
6. **Validate before marking validated.** Only `validated: true` if human confirmed (interview) or approved (review).
7. **Persist everything.** Every exploration writes to disk immediately. Crashes lose nothing.
8. **Context hygiene:** See `references/qa-shared-rules.md` § Context Hygiene. Never let full snapshots land in context.
