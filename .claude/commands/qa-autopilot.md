---
name: qa-autopilot
description: Purpose-driven autonomous QA agent. Each session forms a testing thesis, executes targeted tests, analyzes patterns in results, learns about the system, and proposes strategic improvements. AI's main value is in the ITERATE step — cross-session analysis, blind spot detection, strategy evolution. Not throughput.
---

# QA Autopilot — Purpose-Driven Autonomous Agent

One command. Walk away. Morning journal with findings, system insights, strategy proposals.

**Usage:** `/qa-autopilot` — fresh session, auto mode.

**CRITICAL: Fresh session required.** Context is the fuel. If context >10% used, warn and ask for fresh session.

## Philosophy

**Testing exists to find real problems, not to produce metrics.**

The goal of each session is NOT "write more tests" or "fill coverage gaps." The goal is:
1. Form a hypothesis about where problems live
2. Test that hypothesis
3. Learn something about the system
4. Use that learning to test smarter next time

If a session finds 0 new insights, it failed — even if it wrote 50 tests.

## Core Design

### Session Segmentation (unchanged)

Context compression is lossy. Autopilot **segments work into sessions**:

```
SESSION N (fresh context)
  → PLAN: Form thesis (2 cycles)
  → TEST: Execute guided by thesis (5-6 cycles)
  → ANALYZE: Pattern recognition across results (1 cycle)
  → LEARN: Update system model (1 cycle)
  → ITERATE: Propose strategy improvements (1 cycle)
  → HANDOFF: Journal + state file
  → EXIT

SESSION N+1 (fresh context)
  → Read journal from Session N
  → PLAN: New thesis informed by previous findings
  → ...
```

### Ultra-Lean Orchestrator (unchanged)

```
ORCHESTRATOR (~3K tokens per cycle)
  ├── reads: .autopilot-state.md + last session journal ONLY
  ├── current phase determines action (not a static queue)
  ├── dispatches: sub-agent (Sonnet for mechanical, Opus for judgment)
  ├── collects: one-paragraph result
  ├── logs: one row to cycle log
  └── repeats (max ~12 cycles per session)
```

## State Files

- **`reports/.autopilot-state.md`** — Session number, cycle log, bugs, tests, handoff notes (template in references)
- **`reports/.autopilot-journal-s{N}.md`** — Session journal: thesis, findings, model updates, recommendations (**NEW** — primary artifact)
- **`reports/.autopilot-history.md`** — Compressed one-row-per-session table

## Session Flow

### Phase 1: PLAN (Cycles 0-2)

**Goal:** Form a testing thesis — what to test and WHY.

#### Cycle 0: Initialize + Env Check (~2K tokens)

1. **Fresh-session check.** If prior conversation exists, warn.
2. Read `reports/.autopilot-state.md` — resume point + session count
3. Read last `reports/.autopilot-journal-s{N-1}.md` (limit: 40) — previous session's findings and recommendations
4. **Increment Improvement Tracker.** For every OPEN item in the tracker, increment `Sessions Since` by 1. This happens once per session, unconditionally — it tracks how long issues have been open.
5. **Pre-flight cleanup:** rm test-results/
6. **Env check:** 3 curls inline (signin + health + tenant check). If DOWN, abort.
7. Note session number. If session % 3 == 0 → self-improvement phase in ITERATE step (expanded).

Announce: *"Autopilot v4. Session {N}. Env: {status}."*

#### Cycles 1-2: Form Session Thesis

Spawn an **Opus sub-agent** to form the thesis:

```
Form a testing thesis for /qa-autopilot Session {N}.

READ:
- reports/.autopilot-journal-s{N-1}.md § Recommendations for Session {N} (PRIORITY — these are the previous session's explicit next-steps)
- reports/.autopilot-state.md § Improvement Tracker (systemic issues — note Sessions Since counts)
- reports/.autopilot-state.md § Bugs Filed (open bugs by area)
- bugs.md (limit: 30 — scan for open bugs, group by area)

DECIDE (in this priority order):
1. **Previous recommendations first.** Read § Recommendations from previous journal. If specific and actionable, adopt them as the thesis unless there's a strong reason not to. State why if overriding.
2. **Stale improvements.** Any Improvement Tracker item with Sessions Since ≥ 5 gets priority — it's been ignored too long. Either test it, mark it WONTFIX with a reason, or escalate.
3. **Bug concentration.** Which areas have the most open bugs? (cluster = instability)
4. **Blind spots.** Which areas have NOT been tested in 3+ sessions?
5. **Stale bug re-verification.** Any open bugs not re-checked in 3+ sessions?

RETURN (one paragraph max):
THESIS: {what we'll test and why}
BASED ON: {previous recommendation / stale improvement / bug concentration / blind spot}
TARGETS: {2-4 specific things to test}
DATA NEEDS: {any special test data shapes needed}
RISK: {what could go wrong with this approach}
```

**Fallback:** If the thesis is "no clear direction" → default to: re-verify oldest 3 open bugs + test least-covered feature area.

**Override rule:** If the previous session's recommendation is "declare area X STABLE" or "stop testing Y", the thesis MUST respect that. Don't re-test areas the previous session declared done.

**Anti-planning guardrail:** Planning is MAX 2 cycles. If thesis isn't formed by cycle 2, go with best-effort and start testing.

### Phase 2: TEST (Cycles 3-8)

**Goal:** Execute tests guided by the thesis. Minimum 5 cycles of actual testing.

Each cycle:
1. Pick next target from the thesis
2. Dispatch sub-agent to write/run tests OR investigate via API calls
3. Collect one-paragraph result
4. Log to cycle log
5. **If surprising result:** allowed to pivot the thesis mid-session (log the pivot and why)

**Sub-agent prompt (keep under 200 words):**
```
{ACTION} for /qa-autopilot.
THESIS CONTEXT: {why we're testing this — from session thesis}
TARGET: {specific endpoint/feature/flow}
HYPOTHESIS: {what we expect to find}
READ: {2-3 file paths}
RULES: See references/qa-shared-rules.md
WRITE: {output paths}

RETURN (one paragraph max):
Result: | Tests: | Bugs: | Surprise: {anything unexpected}
```

**Model selection (unchanged):**

| Mechanical (Sonnet) | Judgment (Opus) |
|---------------------|-----------------|
| Triage, Synthesize, File bugs | Write tests, Domain tests, Investigate, Brainstorm |

**NO BROWSER. NO PLAYWRIGHT. NO CHROME.** Zero browser interaction of any kind. All work is API-level only.

**Test writing is hypothesis-driven:**
- GOOD: `it("UDAF with RELATIVE window should return non-zero when events exist in window")` — tests a belief
- BAD: `it("GET /api/tenants/udaf returns 200")` — tests nothing interesting

**Adaptive test data:** If the thesis requires specific data shapes (e.g., "test what happens with 0 events"), the sub-agent should generate that data as part of the test setup. Don't rely solely on the standard 10-customer dataset.

### Phase 3: ANALYZE (Cycle 9)

**Goal:** Look at ALL results from this session as a whole. Find patterns, not just pass/fail.

Spawn an **Opus sub-agent:**

```
Analyze all test results from /qa-autopilot Session {N}.

READ:
- reports/.autopilot-state.md § Cycle Log (this session only)
- Any test result files from this session
- bugs.md (limit: 20 — for cross-referencing)

ANALYZE — don't just classify failures. Answer:
1. PATTERNS: Do failures cluster in one area? What does that tell us?
2. SURPRISES: What passed when we expected failure? What failed unexpectedly?
3. GAPS: What did we NOT test that we should have? What data shapes were missing?
4. CONFIDENCE: How confident are we in our findings? (High/Medium/Low per finding)
5. SYSTEMIC: Is there a deeper issue behind multiple surface-level bugs?

RETURN structured:
PATTERNS: {1-2 sentences}
SURPRISES: {list}
GAPS: {list}
SYSTEMIC: {hypothesis about root cause if any}
CONFIDENCE: {assessment}
```

### Phase 4: LEARN (Cycle 10)

**Goal:** Update our mental model of the system. Strategic learnings, not operational ones.

Update `reports/LEARNINGS.md` using this section structure (create if missing):

```markdown
# Learnings

## System Behavior
<!-- How the CDP backend actually behaves — race conditions, timing, quirks -->
- S{N}: {insight} (from: {what test/bug revealed this})

## Testing Strategy
<!-- What testing approaches work/don't work for this codebase -->
- S{N}: {insight} (result: {what changed because of this})

## Test Data
<!-- What data shapes are needed, what's missing, what exercises edge cases -->
- S{N}: {insight} (action: {what data was added/is still needed})

## Stable Areas (ceiling reached)
<!-- Areas where further testing adds no value — declared DONE -->
- S{N}: {area} — {why it's done} (last bug: S{M})
```

Each entry is prefixed with the session number (S{N}) and includes provenance. Entries in Stable Areas MUST also be marked STABLE in the Improvement Tracker. **Prune entries older than 10 sessions** that have been superseded by newer findings — LEARNINGS.md should be a living reference, not an append-only log.

**NOT** operational learnings like "batch curls are more efficient" — those are ephemeral and don't survive context compression.

Also update `reports/.autopilot-state.md § Improvement Tracker` — this is a running list of systemic issues that spans sessions:

```markdown
## Improvement Tracker

| ID | Issue | Found | Status | Sessions Since |
|----|-------|-------|--------|---------------|
| IMP-1 | UDAF compute unreliable on shared tenant | S1 | OPEN — workaround: poll + retry | 7 |
| IMP-2 | Employee CRUD completely unimplemented | S6 | OPEN — blocked on backend | 2 |
| IMP-3 | Tests don't exercise 0-event customers | S9 | FIXED S10 — added edge data | 0 |
```

**Improvement ceiling awareness:** If an area has been "improved" 3+ times with no further bugs found, mark it as STABLE and stop targeting it. Be honest about "done."

### Phase 5: ITERATE (Cycle 11)

**Goal:** This is where AI adds unique value. Look across sessions and propose strategic improvements.

#### Normal Session (session % 3 != 0)

Spawn an **Opus sub-agent:**

```
Strategic iteration for /qa-autopilot Session {N}.

READ:
- reports/.autopilot-journal-s{N-1}.md (previous session)
- reports/.autopilot-state.md § Improvement Tracker
- reports/LEARNINGS.md (limit: 40)

THINK about:
1. STRATEGY: Are we testing the right things? Should we pivot to a different area?
2. DATA: Is our test data adequate for the bugs we're trying to find?
3. APPROACH: Should we try a different testing technique? (negative testing, boundary testing, concurrency testing, state-based testing)
4. BLIND SPOTS: What areas haven't we touched in 3+ sessions?
5. CEILING: Are we still finding new bugs in this area, or have we hit diminishing returns?
6. FALLBACK CHECK: Did any previously-fixed improvements regress? (check Improvement Tracker FIXED items)

RETURN (structured — the PLAN phase of next session reads this directly):
RECOMMENDATIONS:
  1. {specific, actionable item} — why: {reason from this session's findings}
  2. {specific, actionable item} — why: {reason}
  3-5. ...
STRATEGY SHIFT: {if any — what to change and why, or "none"}
CEILING AREAS: {areas to stop testing, or "none identified"}
FALLBACK ALERT: {improvements that regressed, or "all holding"}
STABLE DECLARATIONS: {areas to mark STABLE in Improvement Tracker, or "none"}
```

**Recommendation quality rule:** Each recommendation must be specific enough that the next session's PLAN phase can adopt it directly as a thesis target. "Test more edge cases" is too vague. "Test UDAF with RELATIVE window + 0 events — S8 found nulls but didn't isolate the cause" is actionable.

#### Self-Improvement Session (session % 3 == 0)

Everything from normal session PLUS deeper strategic review:

**Step A: History compression** (Sonnet sub-agent)
1. Read all `reports/.autopilot-journal-s*.md` files
2. Write/update `reports/.autopilot-history.md` — one row per session
3. Keep only latest 2 journals on disk. Archive older ones.

**Step B: Cross-session strategic analysis** (Opus sub-agent)

```
Deep strategic review for /qa-autopilot (every 3 sessions).

READ:
- reports/.autopilot-history.md (all sessions compressed)
- reports/.autopilot-state.md § Improvement Tracker
- reports/LEARNINGS.md
- reports/skill-improvements.md (pending proposals)

ANSWER:
1. BUG DISCOVERY: Are we finding NEW real bugs, or rediscovering known ones?
   - If 0 new bugs in 3 sessions → either system is stable OR we're testing wrong things
2. STRATEGY EVOLUTION: Has our testing strategy actually changed based on learnings?
   - If same approach for 3+ sessions → strategy is stale, propose change
3. TEST DATA EVOLUTION: Have we evolved test data based on findings?
   - If same 10 customers for 3+ sessions → propose new data shapes
4. IMPROVEMENT DURABILITY: Are fixed improvements staying fixed?
   - Check Tracker: any FIXED items that show signs of regression?
5. HONEST CEILING: Which areas are truly done? Be brutally honest.
   - Area with 0 new bugs in 3+ sessions AND adequate coverage = DONE

RETURN:
NEW BUGS TREND: {rising/flat/declining} — interpretation: {what it means}
STRATEGY ASSESSMENT: {stale/evolving/effective}
DATA ADEQUACY: {adequate/needs expansion/stagnant}
DURABILITY: {all improvements holding / {list of regressions}}
CEILING AREAS: {list of areas to stop testing}
PROPOSALS: {max 5 actionable items}
```

**Step C: Skill plumbing fixes** (max 3 auto-fixes)

**Auto-fix (apply immediately):** broken file paths in skills, stale references to deleted files, LEARNINGS.md entries that contradict current code.
**Proposal (write to `reports/skill-improvements.md`, don't apply):** rule changes, section rewrites, workflow modifications, anything that changes skill behavior.

Rollback guard for auto-fixes:
1. Copy the file before editing: `cp {file} {file}.bak`
2. Apply the fix
3. Run `/qa-self --structural` on just that file
4. If structural check fails → restore from .bak
5. Clean up .bak files after verification

**Budget cap:** Self-improvement uses at most 3 of the 12 cycles. Meta-work must not starve real work.

### Phase 6: HANDOFF (Cycle 12)

**Goal:** Write session journal and update state for next session.

**Early-exit protocol** — if the user requests a graceful halt mid-session OR the env becomes unresponsive:
1. Stop dispatching new test cycles immediately. Do not start new probes.
2. Mark currently-in-progress task as completed if its result is captured; otherwise note the partial state.
3. Write the journal with a `## Status: Early-exit (reason)` section at the top and an `## Unfinished Work` section listing what was deferred.
4. If the halted session was % 3 == 0 (self-improvement), defer the strategic review to the next % 3 == 0 session and note the deferral in handoff notes.
5. Skip dashboard regeneration if it would risk triggering the same backend issue (e.g. UDAF recompute).

Spawn a **Sonnet sub-agent** to write:

#### 1. Session Journal: `reports/.autopilot-journal-s{N}.md`

```markdown
# Session {N} Journal — {date}

## Thesis
{What we set out to test and why}

## Findings
{What the tests revealed about the system — patterns, not just pass/fail}

## Surprises
{What contradicted our expectations}

## Model Updates
{How our understanding of the system changed}

## Improvement Tracker Updates
{New systemic issues found / existing ones resolved / fallback alerts}

## Recommendations for Session {N+1}
<!-- PLAN phase reads this section directly — be specific and actionable -->
1. {recommendation} — why: {what from this session supports it}
2. {recommendation} — why: {reason}
3-5. ...

## Metrics
- Tests written: {N} | Passing: {N}
- Bugs filed: {N} | Bugs re-verified: {N}
- New insights: {N} | Ceiling areas identified: {N}
```

#### 2. Update `reports/.autopilot-state.md`

- Status: HANDOFF
- Next session: {N+1}
- Cycle log (kept for operational tracking)
- Bugs filed table (cumulative)
- Tests written table (cumulative)
- Improvement Tracker (updated)
- Handoff notes referencing journal

#### 3. Regenerate reports

```bash
npm run report:bugs
npm run report:dashboard
```

Print: *"Session {N} complete. Journal: reports/.autopilot-journal-s{N}.md"*

## Metrics That Matter

**Primary (what we optimize for):**

| Metric | Why | Target |
|--------|-----|--------|
| Bug discovery rate | New real bugs per session | >0 (if 0 for 3 sessions, strategy is wrong or system is stable) |
| Surprise rate | Results that contradicted expectations | >0 (if 0, we're in a rut — testing only what we already know) |
| Improvement durability | Fixed issues that stay fixed | 100% (any regression = immediate priority) |

**Secondary (health indicators):**

| Metric | Why | Target |
|--------|-----|--------|
| Area diversity | Unique system areas tested per session | Spread across system, not stuck in one area |
| Stale bug count | Open bugs not re-verified in 3+ sessions | 0 (every open bug should be periodically re-checked) |
| Hypothesis validation rate | Did we get clear answers to our questions? | >70% (if low, our hypotheses are too vague) |
| Ceiling areas | Areas where further testing adds no value | Track growth — honest "done" is good |

**Retired metrics:**
- ~~Depth ratio (L3+L4 / total)~~ — measured test shape, not test value. Replaced by bug discovery rate.
- ~~Coverage percentage~~ — measured breadth, not effectiveness. Having 90% coverage that finds 0 bugs is worse than 30% coverage that finds 5.

## Rules

1. **Purpose over throughput.** Every test should answer a question, not fill a checkbox.
2. **Session segmentation.** Max ~12 cycles per session. Journal is the deliverable.
3. **Thesis-driven testing.** No more static priority queues. Each session has a reason.
4. **Sonnet for mechanical, Opus for judgment.** Unchanged.
5. **Env check first.** Don't waste a session on dead environment.
6. **No browser.** Zero Playwright/Chrome/MCP browser interaction. All API-level.
7. **Fail fast.** Max 1 retry on blocked work. Log, skip, move on.
8. **State on disk, not in context.** Write and forget.
9. **Strategic self-improvement every 3 sessions.** Not plumbing — strategy review.
10. **Journal is the deliverable.** The journal enables the next session AND informs the human.
11. **Guard against fallback.** Every improvement tracked. Regressions detected. Fixed means fixed.
12. **Honest ceiling.** When an area is done, say so. Don't keep testing it for metrics.
13. **Minimum 5 testing cycles.** Planning (2) + Analysis (1) + Learn (1) + Iterate (1) = 5 overhead. Remaining 7 are testing. Non-negotiable minimum: 5 testing cycles.
14. **Adaptive, not static.** Test data, testing approach, and target areas should evolve based on findings. Same approach for 3+ sessions = stale.
