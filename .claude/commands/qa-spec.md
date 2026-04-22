---
name: qa-spec
description: Use when reviewing requirements, specs, or tickets BEFORE implementation. QA's critical eye on documentation — finds ambiguities, missing edge cases, untestable requirements, contradictions with docs/BACKEND-SPEC.md. Shift-left quality — catch problems in specs, not in production.
---

# QA Spec — Requirements Quality Review

QA's most valuable work happens BEFORE code is written. Review specs, tickets, and brainstorm output for testability, completeness, and consistency.

**Usage:**
- `/qa-spec docs/BACKEND-SPEC.md §6` — review a spec section for testability
- `/qa-spec docs/API-REFERENCE.md` — review API reference for testability

## What Lead QA Catches That Others Miss

1. **Ambiguous requirements** — "the system should handle edge cases gracefully" → which edge cases? What's graceful?
2. **Missing error states** — spec describes happy path but not: what if API is down? What if data is stale? What if user double-clicks?
3. **Untestable criteria** — "must be fast" → how fast? What's the threshold? How do we measure?
4. **Contradictions** — new rule contradicts existing docs/BACKEND-SPEC.md rule
5. **Missing status transitions** — new feature adds a state but doesn't define all transitions in/out
6. **Cross-entity side effects** — "when X changes, Y should update" but spec doesn't say what happens when Y is locked/archived/deleted
7. **Permission gaps** — spec defines the feature but not who can use it
8. **Data migration** — new field added but no mention of what happens to existing records

## Procedure

### Step 1: Read the spec

Read the provided file/ticket. Extract every requirement as a discrete claim:

```
CLAIM-1: "When a load reaches DELIVERED, the trip auto-completes"
CLAIM-2: "Drivers can only be assigned to one active trip"
CLAIM-3: "The rate field is locked after RC import"
```

### Step 2: Cross-reference against docs/BACKEND-SPEC.md

For each claim:
- Does it match an existing rule? → Note: "Consistent with §{N}"
- Does it contradict an existing rule? → Flag: "CONTRADICTION with §{N}: {existing rule says X, spec says Y}"
- Is it a new rule not yet in docs/BACKEND-SPEC.md? → Note: "NEW RULE — needs §{N} addition"

### Step 3: Testability analysis

For each claim, ask:

| Question | If answer is "no" → |
|----------|---------------------|
| Can I write a test that verifies this? | Flag as **untestable** — needs quantifiable acceptance criteria |
| Are the inputs defined? | Flag as **ambiguous input** — what data triggers this? |
| Are the outputs defined? | Flag as **ambiguous output** — what's the expected result? |
| Are error cases defined? | Flag as **missing error handling** — what happens when it fails? |
| Is the boundary clear? | Flag as **missing boundary** — what's the edge/limit? |
| Does it specify which roles? | Flag as **missing permissions** — who can do this? |

### Step 4: Edge case generation

For each claim, generate edge cases the spec didn't consider:

| Claim Type | Edge Cases to Check |
|-----------|-------------------|
| State transition | What if entity is in wrong state? What about concurrent transitions? |
| CRUD operation | Empty input? Duplicate? Max length? Special chars? Null fields? |
| Assignment | Already assigned? Assign to deleted entity? Circular reference? |
| Calculation | Zero values? Negative? Overflow? Null operands? |
| Time-based | Past date? Far future? Timezone? DST transition? |
| Multi-entity | What if parent deleted? What if child orphaned? Cascade behavior? |

### Step 5: Write review

Output format:

```markdown
# QA Spec Review — {source}

## Claims Extracted: {N}

| # | Claim | Source | Testable? | Issues |
|---|-------|--------|-----------|--------|
| 1 | {claim text} | {line/section} | Yes/No | {issue or "Clean"} |

## Contradictions with docs/BACKEND-SPEC.md

| # | Claim | Spec Says | §{N} Says | Resolution Needed |
|---|-------|-----------|-----------|-------------------|

## Missing Edge Cases

| # | Claim | Edge Case | Expected Behavior? |
|---|-------|-----------|-------------------|
| 1 | {claim} | {edge case} | ??? (not specified) |

## Untestable Requirements

| # | Claim | Why Untestable | Suggestion |
|---|-------|---------------|-----------|
| 1 | {claim} | {reason} | {how to make it testable} |

## New Rules for docs/BACKEND-SPEC.md

| # | Proposed Rule | Section | Rationale |
|---|--------------|---------|-----------|

## Verdict

- **Claims:** {N} total, {clean} clean, {issues} with issues
- **Contradictions:** {N}
- **Missing edge cases:** {N}
- **Untestable requirements:** {N}
- **Recommendation:** {Ready for implementation / Needs revision / Blocked on clarification}
```

## Integration

- **After spec updates:** Run `/qa-spec` on updated docs/BACKEND-SPEC.md sections to check testability
- **Before test writing:** Run `/qa-spec` on docs/API-REFERENCE.md endpoints to verify completeness

## Rules

1. **Shift-left.** This skill is most valuable BEFORE implementation. After code is written, bugs are 10x more expensive.
2. **Every claim needs a test.** If you can't imagine the test, the requirement is untestable.
3. **Edge cases are not optional.** Every state transition, calculation, and assignment has edge cases. The spec must address them.
4. **Contradictions are blockers.** Don't let contradictory requirements pass — they'll become production bugs.
5. **Be specific.** "Missing error handling" is useless. "What happens when updateTruck is called on a deleted truck?" is actionable.
6. **Don't design the solution.** Point out what's missing, don't prescribe how to fix it. That's the spec author's job.
