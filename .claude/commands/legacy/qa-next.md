---
name: qa-next
description: QA workflow state machine with 3-tier caching. Quick (read state.md), Incremental (timestamps), Full (rescan all). Recommends optimal next action.
---

# QA Next — Tiered State Machine

Answer: **"Where am I in the QA pipeline, and what should I run next?"**

**Usage:**
- `/qa-next` — auto-selects tier (Quick if state.md is <1 day old, else Incremental)
- `/qa-next --full` — force full rescan (Tier 3)
- `/qa-next --quick` — force quick mode even if stale

## Tier Selection (do this FIRST)

Run ONE bash command to check state.md age:

```bash
# Get state.md modification time (seconds since epoch) vs now
stat -c %Y state.md 2>/dev/null && date +%s
# On macOS: stat -f %m state.md 2>/dev/null && date +%s
```

**Decision:**
- User passed `--full` → **Tier 3**
- User passed `--quick` → **Tier 1**
- `state.md` doesn't exist → **Tier 3**
- `state.md` < 24 hours old → **Tier 1**
- `state.md` 1-3 days old → **Tier 2**
- `state.md` > 3 days old → **Tier 3**

---

## Tier 1: Quick (~5k tokens)

**When:** state.md exists and is fresh (<24h). The common case.

### Steps:
1. **Read state.md** (the whole file — it's small, ~2k tokens)
2. **Run `git log --oneline -5`** to see if anything changed since state.md was written
3. **Print state.md content** to the user as-is
4. If git log shows relevant changes (deploys, test fixes, new specs), add a note:
   > "state.md is from {date}. Since then: {1-line summary of git changes}. Run `/qa-next --full` to refresh."
5. Otherwise: show the Recommended Next Action from state.md

**Do NOT:** Read any other files. Do not regenerate. Do not write state.md.

---

## Tier 2: Incremental (~12-15k tokens)

**When:** state.md exists but is 1-3 days old. Check what changed.

### Step 1: Read state.md + get timestamps (ONE bash command)

```bash
# Read state.md, then get mtimes of all pipeline output files
cat state.md
echo "---TIMESTAMPS---"
ls -la --time-style=long-iso \
  page_crawl/index.md \
  reports/QA_COVERAGE.md \
  reports/UX_AUDIT.md \
  reports/QA_WRITE_LOG.md \
  reports/QA_TRIAGE_REPORT.md \
  reports/QA_HEALTH.md \
  data_flows/index.md \
  data_flows/.explore-state.md \
  component_recipes/_index.md \
  bugs.md \
  2>/dev/null
echo "---COUNTS---"
ls tests_backend/src/business/scenarios/*.test.ts 2>/dev/null | wc -l
ls tests/specs/*-domain.spec.ts 2>/dev/null | wc -l
ls data_flows/synthesized-*.md 2>/dev/null | wc -l
```

### Step 2: Compare timestamps against state.md

For each file, check if its mtime is NEWER than state.md's mtime. Only files that changed need re-reading.

- **No files changed** → Treat as Tier 1. Print state.md, done.
- **Some files changed** → Read ONLY the changed files (first 30 lines each, using `limit: 30`). Update the relevant rows in the dashboard.

### Step 3.5: Compute Page Health Scores

For each page, compute health score using these dimensions and weights:

| Dimension | Source | Weight |
|-----------|--------|--------|
| Element Coverage | QA_COVERAGE.md | 25% |
| Test Depth | QA_WRITE_LOG (L1=25%, L2=50%, L3=75%, L4=100%) | 20% |
| Rule Coverage | pm-trace.md (N/A if absent — redistribute weight) | 20% |
| UX Health | 100% minus (P1×20 + P2×10 + P3×5), floor 0% | 15% |
| Bug Exposure | 100% minus (Critical×30 + High×20 + Medium×10), floor 0% | 15% |
| Data Freshness | 100% if <3d, 75% if 3-7d, 50% if >7d, 0% if never | 5% |

Grades: A=90-100, B=75-89, C=60-74, D=40-59, F=0-39.
N/A dimensions excluded from weighted average (redistribute proportionally).

Include health grades in the Pipeline Status tables and write `reports/QA_HEALTH.md` summary — see `references/qa-output-templates.md § QA_HEALTH.md`.

### Step 4: Regenerate recommendation

Using the old state.md as baseline + any updated data, regenerate ONLY:
- The rows that changed in the dashboard tables
- The Quality Gates table (quick recount)
- The Recommended Next Action

### Step 5: Write updated state.md

Merge old state.md with updated sections. Write the file.

### Step 6: Regenerate dashboard (skip if nothing changed)

`npm run report:dashboard` — only if state.md was actually updated.

---

## Tier 3: Full Rescan (~25-30k tokens)

**When:** state.md doesn't exist, is >3 days old, or user passed `--full`.

### Step 1: Read the reference file

```
Read: references/qa-pipeline-reference.md
```

This gives you the pipeline graph, dependency rules, recommendation priority, and quality gates — all the static content that used to be inline.

### Step 2: Get ALL timestamps + counts in ONE bash command

```bash
echo "---TIMESTAMPS---"
ls -la --time-style=long-iso \
  page_crawl/index.md \
  reports/QA_COVERAGE.md \
  reports/UX_AUDIT.md \
  reports/QA_WRITE_LOG.md \
  reports/QA_TRIAGE_REPORT.md \
  reports/QA_HEALTH.md \
  data_flows/index.md \
  data_flows/.explore-state.md \
  component_recipes/_index.md \
  bugs.md \
  2>/dev/null
echo "---COUNTS---"
ls tests_backend/src/business/scenarios/*.test.ts 2>/dev/null | wc -l
ls tests/specs/*-domain.spec.ts 2>/dev/null | wc -l
ls data_flows/synthesized-*.md 2>/dev/null | wc -l
ls page_crawl/*.md 2>/dev/null | wc -l
ls qa_coverage/*.md 2>/dev/null | wc -l
ls ux_audit/*.md 2>/dev/null | wc -l
ls component_recipes/*/*.md 2>/dev/null | wc -l
echo "---GIT---"
git log --oneline -10
```

### Step 3: Read summary files (ONLY headers — use limit)

Read ONLY files that exist (skip missing = "Never run"). Use `limit: 30` for each:

```
Read (limit 30): page_crawl/index.md — Routes table
Read (limit 30): reports/QA_COVERAGE.md — Routes table + Coverage Summary
Read (limit 15): reports/UX_AUDIT.md — just the summary counts
Read (limit 30): reports/QA_WRITE_LOG.md — Page Status table
Read (limit 20): data_flows/index.md — Validation Status + Flows table
Read (limit 15): bugs.md — count Open vs Resolved (scan ### headers)
Read (limit 20): reports/QA_HEALTH.md — Summary table
```

**Parallel reads:** Do all reads in ONE message (parallel tool calls). Do NOT read files sequentially.

**Skip entirely:** QA_TRIAGE_REPORT.md (existence + date from timestamp is enough), .explore-state.md (count from timestamp), component_recipes/_index.md (count from ls).

### Step 4: Compute state

Using timestamps + summary data + reference file dependency rules:

1. **Staleness** — compare each file's mtime against thresholds (reference file has the table)
2. **Dependencies** — check prerequisite rules from reference file
3. **Completeness** — use counts from Step 2 + summary data from Step 3
4. **Quality gates** — extract numbers from summary files

### Step 5: Generate recommendation

Walk the priority list from reference file. Pick the SINGLE highest-impact action. Add 2-3 secondary recommendations.

### Step 6: Print dashboard + write state.md

Print the dashboard (format below), then write it to state.md.

```markdown
# CDP Project State
> Auto-generated by /qa-next — {ISO date}
> Do not edit manually. Re-run /qa-next to refresh.

## App Health
- **FE E2E Tests:** {from QA_WRITE_LOG or "unknown"}
- **BE API Tests:** {from test results or "unknown"}
- **Bugs:** {count from bugs.md} ({H}H {M}M {L}L)
- **Pages crawled:** {done}/{total}
- **Last crawl:** {date from page_crawl/index.md}

## QA Pipeline Status — {date}

### Discovery Track

| Skill | Status | Pages | Last Run | Health |
|-------|--------|-------|----------|--------|
| /website-crawl | {status} | {n}/{total} | {date} | {health} |
| /qa-crawl | {status} | {n}/{total} | {date} | {health} |
| /ux-audit | {status} | {n}/{total} | {date} | {health} |
| /qa-write (L1-L4) | {status} | {n}/{total} | {date} | {health} |
| /qa-triage | {status} | -- | {date} | {health} |

### Flow Track

| Skill | Status | Count | Last Run | Health |
|-------|--------|-------|----------|--------|
| /qa-flows --explore | {status} | {n}/{total} pages | {date} | {health} |
| /qa-flows --review | {status} | {v}/{d} flows, {q} Q pending | {date} | {health} |
| /qa-probe | {status} | {n} components | {date} | {health} |
| /qa-synthesize | {status} | {n} doc-derived flows | {date} | {health} |
| /qa-nightshift | {status} | {n} tests | {date} | {health} |

### Domain Track

| Skill | Status | Count | Last Run | Health |
|-------|--------|-------|----------|--------|
| /qa-domain-tests | {status} | {n} scenario files | {date} | {health} |
| /qa-domain-e2e | {status} | {n} domain specs | {date} | {health} |

### Quality Gates

| Gate | Status | Value | Target |
|------|--------|-------|--------|
| Element coverage | {P/F} | {n}% | >90% |
| Flow validation | {P/F} | {v}/{t} validated | 100% |
| Bug curl quality | {P/F} | {g}/{t} have curls | 100% |
| P1 UX issues | {INFO} | {n} open | 0 |
| Failing tests | {INFO} | {n} known | -- |
| Page health | {P/F} | {n} at C or below | 0 |

### Page Health

| Page | Grade | Score | Top Issue |
|------|-------|-------|-----------|

### Dependency Violations

{list or "None"}

## What Changed Recently

{git log --oneline -10}

## Recommended Next Action

**{Primary}**

Also consider:
- {Secondary 1}
- {Secondary 2}

**Overnight options:** /qa-nightshift | /qa-autopilot

> **Reminder:** /website-crawl available for refreshing page_crawl/. Last crawl: {date}. {N} pages cached. Not auto-triggered.
```

### Step 7: Regenerate dashboard

`npm run report:dashboard` — if it fails, skip silently.

---

## Rules

1. **Tier 1 is the default.** Most invocations should finish in <5 tool calls.
2. **Never read full file contents.** Use `limit: 30` on all reads. Use `ls` for existence + dates.
3. **Parallel reads.** All file reads in one message. Never sequential.
4. **One primary recommendation.** Secondary list capped at 3.
5. **state.md is the cache.** Tier 1 and 2 depend on it. Tier 3 rebuilds it.
6. **Dashboard regen only on write.** Skip `npm run report:dashboard` if state.md wasn't updated.
7. **Reference file for static content.** Pipeline graph, skill inventory, dependency rules, recommendation priority — all in `references/qa-pipeline-reference.md`. Only loaded in Tier 3.
