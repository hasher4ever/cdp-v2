# QA Pipeline Reference (Static)

> This file is read ONLY during Tier 3 (full rescan) of `/qa-next`.
> It contains the pipeline graph, skill inventory, dependency rules, and output templates.

## Pipeline Graph (22 QA skills)

```
DISCOVERY TRACK (what exists on each page)
  /qa-env → /website-crawl → /qa-crawl → /qa-write (L1-L2) → /qa-triage
                                 |              ^
                                 +-→ /ux-audit -+ (reads UX findings for priority)

FLOW TRACK (how data moves between pages)
  /qa-flows --explore → /qa-flows --review → /qa-write (L3-L4)
                        (human answers)       (data flow tests)
       |                                 ^
       +-→ /qa-probe -------------------+ (component recipes)
       |
       +-→ /qa-synthesize --------------+ (doc-derived flows, no browser)

DOMAIN TRACK (backend + E2E from business logic)
  /qa-domain-tests → tests_business/domain-*.test.ts
  /qa-domain-e2e   → tests/specs/workflows/*.spec.ts

RELEASE TRACK (deploy readiness)
  /qa-triage → /qa-perf → /qa-gate → PASS/WARN/FAIL verdict

SCORING & ORCHESTRATION
  /qa-health, /qa-next, /qa-self, /qa-nightshift

SHIFT-LEFT (before code is written)
  /qa-spec → reviews specs/tickets for testability before implementation

SESSION CLEANUP
  /finished → end-of-session: updates CLAUDE.md, memory, logs skill edits

AUTONOMOUS (full pipeline in one loop)
  /qa-autopilot → dispatches sub-agents from all tracks + files bugs + brainstorms

UTILITIES
  /qa-bugs → formalizes session findings into 3-file bug system
  /qa-skill-factory → meta-skill for creating/refactoring QA skills
```

## Skill Inventory

| # | Skill | Track | Output |
|---|-------|-------|--------|
| 1 | /website-crawl | Discovery | `page_crawl/` |
| 2 | /qa-crawl | Discovery | `reports/QA_COVERAGE.md`, `qa_coverage/` |
| 3 | /ux-audit | Discovery | `reports/UX_AUDIT.md`, `ux_audit/` |
| 4 | /qa-write | Discovery+Flow | `reports/QA_WRITE_LOG.md`, `tests/specs/` |
| 5 | /qa-triage | Discovery | `reports/QA_TRIAGE_REPORT.md` |
| 6 | /qa-flows | Flow | `data_flows/index.md`, `data_flows/discovered-*.md` |
| 7 | /qa-probe | Flow | `component_recipes/_index.md` |
| 8 | /qa-synthesize | Flow | `data_flows/synthesized-*.md` |
| 9 | /qa-nightshift | Flow | `tests/specs/` |
| 10 | /qa-domain-tests | Domain | `tests_business/domain-*.test.ts` |
| 11 | /qa-domain-e2e | Domain | `tests/specs/workflows/*.spec.ts` |
| 12 | /qa-health | Scoring | Alias for /qa-next (health focus) |
| 13 | /qa-self | Meta | (console) |
| 14 | /qa-autopilot | Autonomous | full pipeline loop + bugs + brainstorm |
| 15 | /qa-bugs | Utility | `bugs.md`, `bugs_journeys.md`, `bugs-data.ts` |
| 16 | /qa-skill-factory | Meta | (guides new skill creation) |
| 17 | /qa-gate | Release | `reports/release-gate-{date}.md` |
| 18 | /qa-env | Infra | (console — env health status) |
| 19 | /qa-perf | Release | `reports/perf-baseline.md` |
| 20 | /qa-next | Orchestration | `state.md`, recommendations |
| 21 | /qa-spec | Shift-left | (console — spec quality review) |
| 22 | /finished | Meta | session cleanup, updates CLAUDE.md + memory |

## Reference Files

| File | Loaded By | Content |
|------|-----------|---------|
| `references/qa-pipeline-reference.md` | /qa-next (Tier 3) | Pipeline graph, dependencies, priorities |
| `references/qa-shared-rules.md` | All QA skills (on-demand) | Selector rules, verify-first, bug docs, context hygiene, quality standards |
| `references/qa-output-templates.md` | Skills that write output files | All markdown templates (journal, coverage, triage, flows, health) |
| `references/qa-crawl-extensions.md` | /qa-crawl (--api/--rules/--docs) | API drift, business rule, docs freshness scan procedures |

## File Ownership (parallel-safe)

Each output file has ONE writer. Other skills read only. Prevents corruption when skills run concurrently.

| File | Writer (ONLY) | Readers |
|------|--------------|---------|
| `page_crawl/{page}.md` | /website-crawl | qa-crawl, ux-audit, qa-write, qa-probe |
| `reports/QA_COVERAGE.md` | /qa-crawl | qa-write, qa-next, qa-health, qa-gate |
| `qa_coverage/{page}.md` | /qa-crawl | qa-write, qa-next |
| `reports/UX_AUDIT.md` | /ux-audit | qa-health, qa-next, qa-gate |
| `ux_audit/{page}.md` | /ux-audit | qa-write, qa-health |
| `reports/QA_WRITE_LOG.md` | /qa-write (owner, full rewrite of architecture sections); /qa-triage, /qa-domain-tests, /qa-domain-e2e (append-only Run History + Failing Tests rows) | qa-next, qa-nightshift, qa-gate |
| `reports/QA_TRIAGE_REPORT.md` | /qa-triage | qa-next, qa-gate, qa-bugs |
| `reports/QA_HEALTH.md` | /qa-next (health mode), /qa-health | qa-gate |
| `reports/SKILL_STATS.md` | /qa-domain-tests (append-only) | /qa-self |
| `data_flows/.nightshift-summary-*.md` | /qa-nightshift | human, qa-next |
| `bugs.md` | /qa-bugs | qa-health, qa-next, qa-gate, qa-triage |
| `bugs_journeys.md` | /qa-bugs | (human reading) |
| `tests_backend/src/bugs-data.ts` | /qa-bugs | npm run report:bugs |
| `data_flows/discovered-*.md` | /qa-flows (--explore) | qa-flows (--review), qa-nightshift, qa-domain-e2e, qa-write |
| `data_flows/synthesized-*.md` | /qa-synthesize | qa-nightshift, qa-domain-e2e, qa-write |
| `data_flows/{human-slug}.md` | /qa-flows (--interview/--review only, sets `source: human`) | qa-nightshift, qa-domain-e2e, qa-write |
| `data_flows/index.md` | /qa-flows, /qa-synthesize (append-only; each adds rows for its own files) | all flow readers |
| `component_recipes/` | /qa-probe | qa-domain-e2e, qa-write |
| `state.md` | /qa-next | qa-autopilot, qa-gate, qa-write |
| `reports/.autopilot-state.md` | /qa-autopilot | qa-autopilot (next session) |
| `reports/release-gate-*.md` | /qa-gate | (human reading) |
| `reports/skill-improvements.md` | /qa-autopilot (Step 6), /qa-self | Human reviews periodically |
| `reports/.autopilot-history.md` | /qa-autopilot (Step 6a) | /qa-autopilot self-improvement |
| `reports/perf-baseline.md` | /qa-perf | qa-gate |
| `tests/specs/*.spec.ts` | /qa-write, /qa-nightshift | qa-triage |
| `tests/specs/workflows/*.spec.ts` | /qa-domain-e2e | qa-triage |
| `tests_business/domain-*.test.ts` | /qa-domain-tests | qa-triage |

**Handoff files** (produced by one skill specifically for another):

| From | To | Via |
|------|----|-----|
| /qa-triage | /qa-bugs | `reports/QA_TRIAGE_REPORT.md` § Regressions table |
| /qa-domain-tests | /qa-bugs | Test comments `// §{N} FINDING:` in scenario files |

## Dependency Rules

| Downstream | Prerequisite | Check |
|-----------|-------------|-------|
| /qa-crawl | /website-crawl | page_crawl/{page}.md must exist |
| /ux-audit | /website-crawl | page_crawl/{page}.md must exist |
| /qa-write L1-L2 | /qa-crawl | qa_coverage/{page}.md must exist |
| /qa-triage | /qa-write | QA_WRITE_LOG.md must exist |
| /qa-flows --review | /qa-flows --explore | data_flows/index.md has discovered entries |
| /qa-write L3-L4 | /qa-flows --review | data_flows/index.md has validated: true |
| /qa-nightshift | /qa-flows --review | validated flows required |
| /qa-domain-e2e | /qa-flows --review + /qa-probe | validated flows + recipes |
| /qa-domain-tests | docs/BACKEND-SPEC.md | always available |

## Recommendation Priority (highest first)

1. No page-crawl data -> `/website-crawl`
2. No flow data -> `/qa-flows --explore`
3. Pages crawled, no qa-crawl -> `/qa-crawl`
4. Flows discovered, not reviewed -> `/qa-flows --review`
5. Coverage gaps, no L1-L2 tests -> `/qa-write`
6. Validated flows, no L3-L4 -> `/qa-nightshift`
7. No backend domain tests -> `/qa-domain-tests`
8. Validated flows + recipes, no domain E2E -> `/qa-domain-e2e`
9. Complex components not probed -> `/qa-probe`
10. No ux-audit -> `/ux-audit`
11. No qa-health -> `/qa-health`
12. Tests exist, never triaged -> `/qa-triage`
13. Stale crawl (>7 days) -> reminder
14. Skills modified since /qa-self -> `/qa-self`
15. Bug docs incomplete -> review bugs.md
16. All caught up -> pipeline current

## Staleness Thresholds

| Condition | Status |
|-----------|--------|
| File doesn't exist | **Never run** |
| >7 days old | **Stale** |
| 3-7 days old | **Aging** |
| <3 days old | **Fresh** |
| Some pages done | **Partial** |

## Quality Gates

| Gate | Source | Target |
|------|--------|--------|
| Element coverage | reports/QA_COVERAGE.md | >90% |
| Flow validation | data_flows/index.md | 100% validated |
| Bug curl quality | bugs.md | 100% have curls |
| P1 UX issues | reports/UX_AUDIT.md | 0 |
| Failing tests | reports/QA_WRITE_LOG.md | tracked |
| Page health grades | reports/QA_HEALTH.md | 0 at C or below |
