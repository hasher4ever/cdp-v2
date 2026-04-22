---
name: qa-self
description: Self-check for the QA skill suite. Three layers — structural integrity (cross-refs, file paths), behavioral regression (did a skill change make things worse?), and metrics health (value-per-token trends). Run after skill edits or as part of autopilot self-improvement.
---

# QA Self-Check — Validate the QA System Itself

Three-layer validation. Run after modifying any skill.

**Usage:**
- `/qa-self` — full check (all 3 layers)
- `/qa-self --structural` — Layer 1 only (fast, after small edits)
- `/qa-self --regression` — Layer 2 only (after self-improvement applied changes)

## Layer 1: Structural Integrity (syntax, references, paths)

### 1.1 Skill file integrity

For each `qa-*.md` + `website-crawl.md` + `ux-audit.md`:
- Frontmatter has `name:` and `description:`
- Cross-references to other skills → verify skill file exists
- File path references → verify pattern is consistent across skills
- Reference pointers (`See references/qa-*.md`) → verify reference file exists and has the named section

### 1.2 Pipeline reference consistency

Read `references/qa-pipeline-reference.md`:
- Every skill in the inventory table exists as a file
- Every file in the ownership table is referenced by the correct writer skill
- Dependency graph has no circular dependencies
- Skill count in header matches actual count

### 1.3 Shared rules coverage

Read `references/qa-shared-rules.md`:
- Every skill that spawns sub-agents references shared rules (grep for `qa-shared-rules`)
- No skill duplicates a rule that's in shared-rules (grep for key phrases like "never guess selectors", "verify-first", "JSON reporter")

### 1.4 Template consistency

Read `references/qa-output-templates.md`:
- Every section header (`§ Name`) referenced by skills exists in the template file
- No skill has inline templates >20 lines that should be in the reference file

## Layer 2: Behavioral Regression Detection

**When to run:** After self-improvement (autopilot Step 6) applies auto-fixes, or after any manual skill edit.

### 2.1 Diff-against-previous

For each modified skill file, detect what changed:
- If git is available: `git diff HEAD~1 -- .claude/commands/{skill}.md`
- If not: compare current file against `.bak` copy (from autopilot Step C) or against `reports/skill-improvements.md` change log
- For each removed line: was it a **rule**, a **procedure step**, or **prose**?
  - Rule removed → **HIGH RISK** — check if the rule appears in LEARNINGS.md (grep the key phrase). If it does, this learning was earned from a real failure — removing it is a regression.
  - Procedure step removed → **MEDIUM RISK** — check if downstream skills depend on the output of that step
  - Prose removed → **LOW RISK** — likely just trimming

### 2.2 Rule coverage check

After a skill edit, verify that learnings from `reports/LEARNINGS.md` are still enforced:

```
For each entry in LEARNINGS.md § System Behavior and § Testing Strategy:
  1. Extract the key insight (the text after "S{N}:")
  2. Identify the enforcement mechanism — is it a rule in a skill, a test pattern, or an Improvement Tracker item?
  3. Grep across .claude/commands/*.md + references/*.md for related keywords
  4. If NO match in any skill/reference → FLAG: "Learning S{N} '{phrase}' has no enforcement — regression risk"
  5. If match exists → PASS (learning is covered)

For each entry in LEARNINGS.md § Stable Areas:
  1. Verify the area is also marked STABLE in .autopilot-state.md § Improvement Tracker
  2. If NOT in tracker → FLAG: "Stable area '{area}' missing from Improvement Tracker — sync required"
```

This catches two failure modes:
- Self-improvement edit accidentally removed a rule that was added because of a real failure
- LEARNINGS.md and Improvement Tracker drifted out of sync (one says stable, other doesn't)

### 2.3 Handoff chain validation

Verify that the context handoff chain is unbroken:
- For each entry in the pipeline reference's Handoff table:
  - The "From" skill's output contains the expected data
  - The "To" skill's input reads from the correct path
  - The format the writer produces matches what the reader parses

### 2.4 File ownership violations

Check if any skill writes to a file it doesn't own (per the ownership table in pipeline reference):
- Grep each skill for `Write`, `Edit`, `append` patterns
- Cross-reference against the ownership table
- Flag any write to a file not in the skill's owned list

## Layer 3: Strategic Health (purpose-driven metrics)

**When to run:** As part of autopilot's self-improvement (every 3 sessions).

### 3.1 Purpose-Driven Trend Analysis

Read all `reports/.autopilot-journal-s*.md` and `.autopilot-state.md`. Extract strategic metrics per session:

**Bug Discovery (are we finding real problems?)**
- New real bugs per session (target: >0; if 0 for 3 sessions → flag)
- Bug severity trend: are we finding important bugs or trivial ones?
- Rediscovery rate: how often do we re-find known bugs? (high = wasting cycles)

**Surprise Rate (are we learning?)**
- Results that contradicted expectations per session (target: >0)
- If 0 surprises for 2+ sessions → **FLAG: we're in a testing rut**
- This means we're only testing what we already know works/fails

**Improvement Durability (do fixes stick?)**
- Check Improvement Tracker: any FIXED items showing regression?
- If regression found → **FLAG AS CRITICAL** — immediate priority
- Track: improvements made vs improvements that held

**Strategy Evolution (is our approach changing?)**
- Compare session theses across last 3 sessions
- If same targets/approach for 3+ sessions → **FLAG: strategy is stale**
- Testing the same area repeatedly without new findings = diminishing returns

**Area Diversity (are we spreading or clustering?)**
- Unique system areas tested per session
- Areas not tested in 3+ sessions → blind spots
- Areas tested 3+ sessions with no new findings → ceiling reached

Flag these patterns:

| Pattern | What it means | Action |
|---------|--------------|--------|
| 0 new bugs for 3 sessions | System stable OR testing wrong things | Honest assessment: declare stable or pivot |
| 0 surprises for 2 sessions | Testing rut — only confirming what we know | Force new area or new technique |
| Improvement regression | A fix didn't stick | Immediate priority — investigate root cause |
| Same thesis 3 sessions | Strategy stale | Force pivot to untested area |
| Rising test count, flat bug count | Writing tests for metrics, not value | Shift to hypothesis-driven tests |
| Stale open bugs (3+ sessions unverified) | Bug list becoming stale | Schedule re-verification |

### 3.2 Thesis Quality Assessment

Read session journals. Per session:
- Was the thesis specific enough to test? (vague → low hypothesis validation rate)
- Did the thesis lead to new findings? (no → thesis was unproductive)
- Did mid-session pivots occur? (yes → either good adaptation or poor initial thesis)

Flag:
- Theses that are just "test endpoint X" without a reason → testing for testing's sake
- Theses that never lead to findings → wrong hypotheses or wrong area
- Sessions where all findings were predictable → need more exploratory testing

### 3.3 Improvement Ceiling Detection

Cross-session analysis of diminishing returns:
- Area has been tested 3+ sessions with 0 new bugs → declare STABLE
- Same improvement proposed 3+ times → either unactionable or being ignored → escalate or drop
- Test suite growing but bug discovery flat → **honest assessment: we may be done with this area**
- Total open bugs declining with no new bugs → system is stabilizing (this is GOOD — acknowledge it)

**Ceiling is not failure.** Reaching a ceiling means testing worked. The right response is to:
1. Acknowledge it explicitly in the journal
2. Mark the area as STABLE in Improvement Tracker
3. Redirect effort to areas that haven't reached ceiling

## Report Format

```
## QA Self-Check — {date}

### Layer 1: Structural Integrity
| Check | Status | Issues |
|-------|--------|--------|
| 1.1 Skill files | {P/F} | {N issues} |
| 1.2 Pipeline ref | {P/F} | {N issues} |
| 1.3 Shared rules | {P/F} | {N duplications found} |
| 1.4 Templates | {P/F} | {N inline templates >20 lines} |

### Layer 2: Behavioral Regression {if --regression or full}
| Check | Status | Issues |
|-------|--------|--------|
| 2.1 Diff analysis | {P/F} | {N rules removed, M high-risk} |
| 2.2 Learning coverage | {P/F} | {N learnings uncovered} |
| 2.3 Handoff chain | {P/F} | {N broken handoffs} |
| 2.4 Ownership | {P/F} | {N violations} |

### Layer 3: Metrics Health {if full + briefs exist}
| Check | Status | Issues |
|-------|--------|--------|
| 3.1 Session trends | {P/F} | {declining metrics} |
| 3.2 Skill performance | {P/F} | {underperforming skills} |
| 3.3 Anti-patterns | {P/F} | {repeated blockers/proposals} |

### Summary
- **Structural:** {N} issues
- **Behavioral risk:** {N} high-risk removals, {N} uncovered learnings
- **Metrics:** {trending up / stable / declining}
- **Verdict:** {HEALTHY / WARN: {reasons} / DEGRADED: {reasons}}
```

## Integration with Autopilot Self-Improvement

The self-improvement loop (autopilot Step 6) should:

1. **BEFORE applying auto-fixes:** Run `/qa-self --structural` to baseline
2. **Apply auto-fixes**
3. **AFTER applying:** Run `/qa-self --regression` to verify no behavioral regression
4. **If regression detected:** Revert the auto-fix, log as "auto-fix rejected: {reason}", add to proposals for human review instead
5. **If clean:** Keep the fix, log as "auto-fix applied and verified"

This creates a safe self-improvement loop: **propose → apply → verify → keep or revert**.

## Rules

1. **Read-only.** Never modifies skill files. Reports issues.
2. **Layer 2 requires diff context.** Only meaningful after a skill edit — skip if no changes detected.
3. **Layer 3 requires multiple briefs.** Skip if fewer than 2 autopilot briefs exist.
4. **LEARNINGS.md is the regression oracle.** If a learning is uncovered, that's the highest priority finding.
5. **Revert over regress.** When integrated with self-improvement, always prefer reverting a bad fix over keeping it.
