# QA Pipeline — Tooling Architecture

How the QA automation is organized: deterministic TypeScript scripts in the hot path, thin markdown wrappers for slash-command access, and a smaller set of legacy narrative skills kept for authoring / judgment work.

## Layout

```
scripts/
  qa-*.ts                      # deterministic work — no LLM in the hot path
  skill-wrappers/qa-*.md       # thin slash-command wrappers (source of truth)

.claude/commands/
  qa-*.md                      # activated wrappers (copied from scripts/skill-wrappers/)
  qa-autopilot.md              # orchestrator (reads scripts' JSON reports)
  qa-domain-tests.md           # test-writing orchestrator
  qa-write.md, qa-spec.md, qa-synthesize.md, qa-skill-factory.md   # active LLM skills
  finished.md                  # routing wrapper for /finished
  legacy/                      # preserved narrative companions + superseded LLM skills
    finished-narrative.md
    qa-bugs-narrative.md
    qa-self-narrative.md
    qa-{crawl,env,gate,health,next,perf,triage}.md
  parked/                      # unused skills (not on current pipeline)
    qa-{flows,domain-e2e,nightshift,probe}.md
    website-crawl.md, ux-audit.md

reports/
  <script-name>.json           # machine-readable output from each qa-* script
```

## Commands

Every first-class script is wired through npm. Use the npm script rather than calling `node` directly — CI and `/qa-autopilot` both rely on the wrapper.

```bash
npm run qa:env                 # env.json       — backend health gate
npm run qa:triage              # triage.json    — test pass/fail classification
npm run qa:triage:bootstrap    #                  (first-run expected-failures seed)
npm run qa:perf                # perf.json      — latency diff vs baseline
npm run qa:perf:baseline       #                  (reset baseline)
npm run qa:health              # health.json    — composite health score
npm run qa:next                # next.json      — recommended next actions
npm run qa:crawl               # coverage.json  — test-to-bug-to-endpoint cross-reference
npm run qa:bugs                # bugs-mechanical.json — bug-ledger audit
npm run qa:gate                # (console)      — PASS/WARN/FAIL release verdict
npm run qa:self                # self.json      — tooling self-audit
npm run qa:finished            # closeout.json  — end-of-session snapshot

npm run qa:ci                  # test:backend + test:business + qa:triage + qa:gate
```

All scripts run under `node --experimental-strip-types` (Node 22+). Exit codes:
`0 = PASS` (or WARN without `--strict`), `1 = FAIL` (or WARN with `--strict`), `2 = script error`.

## Report contracts

Every canonical `reports/*.json` file carries the shape audited by `qa-self`. Fields here are the required keys only — scripts may emit more.

| File | Shape |
|------|-------|
| `env.json` | `{overall: UP\|DEGRADED\|DOWN, checks[]}` |
| `triage.json` | `{verdict: PASS\|WARN\|FAIL, summary: {passed, failed, unexpected_failures[], expected_failures[]}}` |
| `perf.json` | `{verdict, diff[]}` — per-endpoint latency delta |
| `health.json` | `{verdict}` + composite score |
| `next.json` | `{actions[], inputs}` — recommended next actions with priority |
| `coverage.json` | `{files, endpoints, summary, bugCoverage}` — crawl output |
| `bugs-mechanical.json` | `{bugs[], totals, issues, coverage}` — bug-ledger audit |
| `expected-failures.json` | `{entries[]}` — known-bug failures excluded from triage verdict |
| `self.json` | `{verdict, counts, findings[], inventory}` |
| `closeout.json` | `{git, reports, modified, punchlist[]}` — session closeout |

## When the LLM is still called

The scripts cover all mechanical audit / inventory / classification work. LLM-driven skills remain for tasks that need judgment:

| Task | Active skill |
|------|--------------|
| Writing new tests (L1/L2 page-driven) | `/qa-write` |
| Writing new tests (L3/L4 domain-driven) | `/qa-domain-tests` |
| Authoring a new bug entry with curl repro | `.claude/commands/legacy/qa-bugs-narrative.md` |
| Narrative closeout, memory persistence, skill-improvement logging | `/finished` → delegates to `.claude/commands/legacy/finished-narrative.md` |
| Behavioral-regression check after a skill edit (rule vs cleanup) | `.claude/commands/legacy/qa-self-narrative.md` |
| Spec/ticket testability review (shift-left) | `/qa-spec` |
| Creating or refactoring a QA skill | `/qa-skill-factory` |
| Full autonomous loop (test → triage → file bugs → brainstorm) | `/qa-autopilot` |

Anything else — pass/fail math, expected-failure reconciliation, git state, next-action ranking, bug-ledger parsing, release-gate verdicts — is deterministic and runs without an LLM.

## Self-audit

`npm run qa:self` checks the script/wrapper/npm-script trilogy stays consistent:

1. Every `qa:*` npm command resolves to an existing `scripts/qa-*.ts` or composite.
2. Every first-class script has a wrapper in `scripts/skill-wrappers/` AND an activated copy in `.claude/commands/`.
3. Every wrapper has valid frontmatter and matches its filename.
4. Every canonical `reports/*.json` parses and carries its required keys.
5. Expected-failures debt stays below 50% unclassified.

Run this before committing any change to `scripts/qa-*.ts`, `scripts/skill-wrappers/*.md`, or an npm script.

## End-of-session

`/finished` (or `npm run qa:finished`) writes `reports/closeout.json` with git state, report verdicts, modified-files categorization, and a deterministic punchlist. The punchlist is authoritative — every blocker / hygiene item must be acknowledged in the narrative closeout (memory persistence, CLAUDE.md doc-routing review, skill-improvement logging). See `.claude/commands/legacy/finished-narrative.md` for the narrative procedure.

## Reactivating parked or legacy skills

Move the file back to `.claude/commands/`. Then run `npm run qa:self` to confirm the wrapper trilogy stays consistent. If the skill references data sources (`page_crawl/`, `data_flows/`, `component_recipes/`) that are no longer maintained, reactivate those producers first.
