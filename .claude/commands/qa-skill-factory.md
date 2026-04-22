---
name: qa-skill-factory
description: Use when creating new QA/testing skills or refactoring existing ones. Encodes token-efficient patterns, anti-patterns, and architectural decisions from the CDP QA skill suite (22 skills, 4 reference files).
---

# QA Skill Factory

Create or refactor QA skills using proven patterns from the CDP suite.

## Architecture

```
SKILL FILES (loaded per invocation — every token counts)
  qa-write.md, qa-crawl.md, qa-flows.md, ...
  ↓ reference pointers
REFERENCE FILES (loaded on-demand — only when needed)
  references/qa-shared-rules.md      — cross-cutting rules
  references/qa-output-templates.md  — all markdown templates
  references/qa-crawl-extensions.md  — optional scan procedures
  references/qa-pipeline-reference.md — pipeline graph, dependencies
```

**Key insight:** Skills pay full token cost every invocation. References load only when explicitly requested. Put behavior in skills, put templates and shared rules in references.

## Skill Anatomy (target: <2,000 words)

```markdown
---
changelog:
  - {date}: {why this changed}
name: qa-{name}
description: {triggering conditions only — never summarize workflow}
---

# {Title}

## Purpose
{1-2 sentences. What it does, when to use it.}

**Shared rules apply.** See `references/qa-shared-rules.md`

## Procedure
{Numbered steps. Each step: what to do, what to read, what to write.}

## Rules ({skill}-specific)
{Only rules NOT in shared-rules.md}
```

## Decision: New Skill vs Extend Existing

| Signal | Action |
|--------|--------|
| New pipeline stage (different input → different output) | New skill |
| New mode for existing skill (same I/O, different trigger) | Add `--flag` to existing skill |
| Rule that applies to 3+ skills | Add to `references/qa-shared-rules.md` |
| Template used by 2+ skills | Add to `references/qa-output-templates.md` |
| Heavy procedure used optionally | Add to a `references/` extension file |

## Patterns (do these)

### 1. Reference extraction

**Any content >20 lines that isn't behavioral logic** → extract to a reference file.

Templates, examples, scoring formulas, scan procedures, format specs — all go to references. The skill keeps a one-line pointer: `See references/qa-output-templates.md § {section}`.

**Why:** qa-write went from 6,653 → 1,678 words (75% reduction) primarily by extracting templates.

### 2. Shared rules deduplication

If a rule appears in 2+ skills, move it to `references/qa-shared-rules.md` and replace with: `**Shared rules apply.** See references/qa-shared-rules.md`

Current shared rules: selectors, verify-first loop, bug documentation, context hygiene, quality standards, model tiering, test data management, JSON reporter.

### 3. Sub-agent isolation for heavy work

Any skill that does 15+ tool calls per unit of work → orchestrator + sub-agent model.

- **Orchestrator:** Build queue, spawn agents, collect summaries, update journal. ~2 tool calls per unit.
- **Sub-agent:** Heavy lifting. Gets minimal prompt (file paths, not pasted content).

**Why:** qa-write would exhaust context after 3 pages without isolation. With it, 20 pages fit.

### 4. Journal-based resumption

Skills that span multiple sessions → write progress to a state file after each unit.

Pattern: read state → skip completed → do next → write state → checkpoint message.

Examples: `data_flows/.nightshift-state.md`, `data_flows/.explore-state.md`, `reports/QA_WRITE_LOG.md`

### 5. Tiered loading (qa-next pattern)

For state-checking skills, use tiers:
- **Tier 1 (quick):** Read cached state file → print → done. ~5 tool calls.
- **Tier 2 (incremental):** Compare timestamps → read only changed files → update cache.
- **Tier 3 (full):** Load reference file + read everything → rebuild cache.

### 6. Pipeline status footer

Every pipeline skill prints a status summary after completing. The user shouldn't need to run `/qa-next` to know what changed.

### 7. Duplicate work guard

Before writing output, check if it exists and is fresh. Offer: continue / overwrite / skip.

**Why:** Skills that ran twice silently overwrote prior output.

## Anti-Patterns (never do these)

### 1. Inline templates

**Bad:** 30-line markdown template block inside the skill file.
**Good:** `See references/qa-output-templates.md § QA_TRIAGE_REPORT.md`

Templates burn tokens every invocation but are only needed when writing output.

### 2. Duplicated rules across skills

**Bad:** "Never guess selectors" appears in qa-write, qa-nightshift, qa-domain-e2e, qa-probe.
**Good:** Rule in `references/qa-shared-rules.md`, skills reference it once.

### 3. Verbose explanatory prose

**Bad:** "Why this matters: When agents batch-write tests without verification, the resulting failures are only discovered at triage time. This creates a false sense of progress during the writing phase..."
**Good:** "Never batch-write. One test at a time, verified before next."

Rules should be pithy. The "why" lives in `reports/LEARNINGS.md`, not in the skill.

### 4. Splitting skills that share state

**Bad:** Split qa-write into qa-write-discover + qa-write-execute + qa-write-journal.
**Good:** Keep as one skill, extract templates to references.

Splitting creates rule duplication, state coordination overhead, and harder discovery. Trim the skill instead.

### 5. Agent prompts with pasted content

**Bad:** Orchestrator pastes 200 lines of coverage data into each sub-agent prompt.
**Good:** `Read: qa_coverage/{page}.md`

Every agent spawn adds its prompt to orchestrator context. File paths = 1 line. Pasted content = N lines × M agents.

### 6. Parsing test output as text

**Bad:** `npx playwright test | tail -30` → misses failures printed before passes.
**Good:** `--reporter json` → parse structured data.

This caused 36 missed failures. The rule exists in shared-rules because it applies everywhere.

### 7. Guessing selectors from descriptions

**Bad:** Read "combobox" from page_crawl/ → write `getByRole('combobox')`.
**Good:** Navigate → snapshot → read accessibility tree → derive exact selector.

This caused 36 of 100 tests to fail. The verify-first loop exists because of this.

## Creating a New QA Skill — Checklist

1. **Check if an existing skill can be extended** with a `--flag` instead
2. **Write the frontmatter** — `description` starts with triggering conditions, never workflow summary
3. **Add changelog** — date + why for every change
4. **Declare shared rules** — one line: `See references/qa-shared-rules.md`
5. **Write procedure** — numbered steps, compressed, no verbose explanations
6. **Extract templates** to `references/qa-output-templates.md` if >20 lines
7. **Extract optional procedures** to a `references/` file if >50 lines
8. **Add only skill-specific rules** — everything in shared-rules is already covered
9. **Add pipeline status footer** — what just happened, what to run next
10. **Add duplicate work guard** — check if output exists before writing
11. **Verify word count** — target <2,000 words. If over, find what to extract.
12. **Update `references/qa-pipeline-reference.md`** — add to skill inventory, dependency rules

## Token Budget Guidelines

| Skill type | Target words | Why |
|-----------|-------------|-----|
| Standalone (probe, synthesize, self) | <1,300 | Loaded alone, should be fast |
| Orchestrator (write, crawl, triage) | <2,000 | Has sub-agent overhead |
| State machine (next) | <1,700 | Tier 1 should be <5 tool calls |
| Alias (health) | <150 | Just a redirect |
| Reference file | <1,200 | Loaded on-demand, can be larger |

### Where tokens ACTUALLY go (understand this before optimizing)

Every message re-sends the ENTIRE conversation. A file read in cycle 1 is still paid for in cycle 12. This means:
- **Skill file size** matters — it's loaded into every turn after invocation
- **Sub-agent results** persist in parent context — require one-paragraph max
- **Read tool without `limit:`** dumps full file into permanent context
- **Bash output** (test runners, git log) stays in context — redirect to files, parse small extracts

**The #1 token waste:** verbose sub-agent results. An agent that explains its reasoning in 3 paragraphs costs 10x more than one that returns `"Result: 4 tests, 4 pass. Bugs: none."` — and the explanation is never re-read.

See `references/qa-shared-rules.md § Token Efficiency Rules` for the enforceable rules.

**Current suite totals:** 19 skills (~21K words) + 4 references (~3.5K words). Only 1 skill loads per invocation.
