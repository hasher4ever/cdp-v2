# QA Pipeline Reference

> Canonical map of the QA tooling. Read this (or `docs/QA-PIPELINE.md`) whenever you need the full layout.

## Pipeline graph

```
ENV GATE
  npm run qa:env  -> reports/env.json  (overall: UP | DEGRADED | DOWN)

DISCOVERY / COVERAGE
  npm run qa:crawl -> reports/coverage.json (files, endpoints, bugCoverage, summary)

AUTHORING (LLM)
  /qa-write          -> tests_business/*.test.ts, tests_backend/*.test.ts
  /qa-domain-tests   -> tests_business/domain-*.test.ts
  /qa-spec           -> shift-left testability review (console)

TEST RUN
  npm run test:backend + npm run test:business
  npm run qa:triage  -> reports/triage.json (verdict, summary, expected_failures)

INVENTORY
  npm run qa:bugs    -> reports/bugs-mechanical.json (bugs, totals, issues, coverage)

PERFORMANCE
  npm run qa:perf            -> reports/perf.json  (verdict, diff[])
  npm run qa:perf:baseline   -> resets baseline

SCORING + NEXT
  npm run qa:health  -> reports/health.json (verdict, composite)
  npm run qa:next    -> reports/next.json   (actions[], inputs)

RELEASE GATE
  npm run qa:gate    -> console PASS/WARN/FAIL

META
  npm run qa:self     -> reports/self.json (tooling trilogy audit)
  npm run qa:finished -> reports/closeout.json (session snapshot + punchlist)

ORCHESTRATION (LLM)
  /qa-autopilot       -> consumes env.json, triage.json, bugs-mechanical.json, next.json
  /finished           -> reads closeout.json, authors narrative memory / skill improvements
```

## Active entry points

| Path | Purpose |
|------|---------|
| `/qa-env`       | thin wrapper -> npm run qa:env |
| `/qa-triage`    | thin wrapper -> npm run qa:triage |
| `/qa-perf`      | thin wrapper -> npm run qa:perf |
| `/qa-health`    | thin wrapper -> npm run qa:health |
| `/qa-next`      | thin wrapper -> npm run qa:next |
| `/qa-crawl`     | thin wrapper -> npm run qa:crawl |
| `/qa-bugs`      | thin wrapper -> npm run qa:bugs |
| `/qa-gate`      | thin wrapper -> npm run qa:gate |
| `/qa-self`      | thin wrapper -> npm run qa:self |
| `/qa-finished`  | thin wrapper -> npm run qa:finished |
| `/finished`     | routing wrapper: runs qa:finished then delegates to legacy narrative |
| `/qa-autopilot` | full autonomous loop; consumes all reports |
| `/qa-domain-tests` | domain-driven backend test writer |
| `/qa-write`     | L1/L2 page-driven test writer |
| `/qa-spec`      | shift-left spec review |
| `/qa-synthesize` | doc-derived flow synthesis |
| `/qa-skill-factory` | meta-skill for creating/refactoring QA skills |

## Legacy narrative companions (`.claude/commands/legacy/`)

Invoked explicitly when authoring / judgment is needed; not on the critical path.

| File | When to use |
|------|-------------|
| `finished-narrative.md` | Step 2 of `/finished` — author memory, log skill mods, update CLAUDE.md |
| `qa-bugs-narrative.md`  | Draft a new BUG-NNN entry with curl repro (starts from `issues.nextFreeId`) |
| `qa-self-narrative.md`  | Behavioral-regression or strategic trend pass after skill edits |
| `qa-{crawl,env,gate,health,next,perf,triage}.md` | Original LLM-driven versions, preserved for reference only |

## Parked skills (`.claude/commands/parked/`)

Flow/browser-oriented skills not on the current pipeline. See `.claude/commands/parked/README.md` for reactivation notes. Files: `qa-flows`, `qa-domain-e2e`, `qa-nightshift`, `qa-probe`, `website-crawl`, `ux-audit`.

## Report contracts (enforced by `qa-self`)

| File | Required keys |
|------|---------------|
| `env.json` | overall, checks |
| `triage.json` | verdict, summary |
| `perf.json` | verdict, diff |
| `health.json` | verdict |
| `next.json` | actions, inputs |
| `coverage.json` | files, endpoints, summary |
| `bugs-mechanical.json` | bugs, totals, issues |
| `expected-failures.json` | entries |
| `self.json` | verdict, counts, findings, inventory |
| `closeout.json` | git, reports, modified, punchlist |

## Writer ownership (parallel-safe)

Each report file has exactly one writer. Other tools read only.

| File | Writer |
|------|--------|
| `reports/env.json`              | scripts/qa-env.ts |
| `reports/triage.json`           | scripts/qa-triage.ts |
| `reports/perf.json`             | scripts/qa-perf.ts |
| `reports/health.json`           | scripts/qa-health.ts |
| `reports/next.json`             | scripts/qa-next.ts |
| `reports/coverage.json`         | scripts/qa-crawl.ts |
| `reports/bugs-mechanical.json`  | scripts/qa-bugs.ts |
| `reports/expected-failures.json`| scripts/qa-triage.ts (bootstrap) + scripts/qa-annotate-ef.ts |
| `reports/self.json`             | scripts/qa-self.ts |
| `reports/closeout.json`         | scripts/qa-finished.ts |
| `reports/QA_WRITE_LOG.md`       | /qa-write (owner); /qa-domain-tests, /qa-triage (append-only rows) |
| `reports/skill-improvements.md` | /finished narrative, /qa-self-narrative |
| `bugs.md`                       | /qa-bugs-narrative (authoring) |

## Dependency rules

| Downstream | Prerequisite |
|-----------|-------------|
| qa:gate     | qa:env PASS, qa:triage reports present, qa:perf reports present |
| qa:health   | qa:triage, qa:perf, qa:bugs |
| qa:next     | qa:health (and any fresh inputs) |
| qa:finished | nothing — runs on whatever the session produced |
| qa:self     | nothing — audits the tooling itself |
| /qa-autopilot | qa:env PASS before writing/running tests |
| /qa-domain-tests | qa:env PASS; docs/BACKEND-SPEC.md present |

## Exit code policy

| Code | Meaning |
|------|---------|
| 0 | PASS, or WARN without `--strict` |
| 1 | FAIL, or WARN with `--strict` |
| 2 | Script error (thrown exception, unreadable input) |

## Self-audit (trilogy consistency)

`npm run qa:self` runs on every change to `scripts/qa-*.ts`, `scripts/skill-wrappers/*.md`, or an `qa:*` npm script. Checks:

1. Every `qa:*` npm command resolves to an existing script OR composite.
2. Every first-class script has a wrapper in `scripts/skill-wrappers/` and an activated copy in `.claude/commands/`.
3. Every wrapper has valid frontmatter matching its filename.
4. Every canonical `reports/*.json` parses and carries its required keys.
5. Expected-failures debt ratio stays below 50%.
