---
name: qa-self
description: Thin wrapper around `npm run qa:self`. Deterministic audit of the QA tooling itself — script/wrapper/npm-script trilogy consistency, report JSON validity, and report-shape contracts. Writes `reports/self.json`. No LLM for the audit; strategic/behavioral judgment (rule-removal risk, thesis quality, session trends) stays in the legacy `/qa-self` skill.
---

# QA Self-Check — Thin Wrapper (Mechanical Audit)

All mechanical work lives in `scripts/qa-self.ts`. No LLM in the hot path.

## Commands

```bash
npm run qa:self                    # audit -> reports/self.json + stdout
npm run qa:self -- --json          # machine-readable stdout
npm run qa:self -- --strict        # exit 1 on WARN too (CI gate mode)
npm run qa:self -- --quiet         # no stdout
```

## Contract

**Inputs** — the QA tooling itself:
- `package.json` scripts (all `qa:*` keys)
- `scripts/qa-*.ts` files
- `scripts/skill-wrappers/qa-*.md` files (staged wrappers)
- `.claude/commands/qa-*.md` files (activated wrappers)
- `reports/*.json` (only canonical files — third-party outputs like vitest/playwright JSON are not audited)

**Output** — `reports/self.json`:
```
{
  verdict: "PASS" | "WARN" | "FAIL",
  counts:  { pass, warn, fail },
  findings: [{ check, severity, message, detail? }, ...],
  inventory: { npmQaScripts[], scriptFiles[], wrapperFiles[], activatedWrappers[], reportFiles[] }
}
```

**Checks** (hard-coded in the script)

| # | Check | Severity |
|---|-------|----------|
| 1 | Every `qa:*` npm command resolves to an existing `scripts/qa-*.ts` OR is an `npm run ...` composite | FAIL if missing target, WARN if neither |
| 2 | Every first-class script (referenced by an npm command) has a wrapper | WARN |
| 3 | Every staged wrapper has a backing script | WARN |
| 4 | Every wrapper has valid frontmatter (`name:` + `description:`) and frontmatter `name` matches the filename | FAIL on missing, WARN on mismatch |
| 5 | Every canonical `reports/*.json` parses as JSON | FAIL |
| 6 | Core reports (env/triage/perf/health/next/coverage/bugs-mechanical/expected-failures) have required keys | FAIL |
| 7 | Expected-failures debt: if unclassified ratio >= 50%, WARN | WARN |

Helper scripts not wired into npm (e.g. one-off annotators like `qa-annotate-ef.ts`) are ignored — only first-class scripts are expected to have wrappers.

**Exit codes**
- `0` — PASS, or WARN without `--strict`
- `1` — FAIL, or WARN with `--strict`
- `2` — script error

## Reframing from the old skill

The previous `/qa-self` skill was a three-layer LLM audit: structural, behavioral-regression, strategic. Layers 1 and parts of 2.4 (file ownership) are mechanical and now live here. Layers 2.1–2.3 (diff-against-previous, rule coverage, handoff chain) and all of Layer 3 (purpose-driven trend analysis, thesis quality, improvement-ceiling detection) remain LLM-driven — those need judgment about whether a removed line is a hard-earned rule or a cleanup, whether a thesis was productive, whether we've hit a testing ceiling.

Result: mechanical drift (broken references, missing reports, wrapper-script mismatches) is caught in ms with a deterministic exit code, while narrative self-improvement remains a manual invocation of the legacy skill.

## When the LLM is called (and only when)

The LLM is NOT invoked for the audit. It is only useful for:

1. **Narrative health summary on request.** Read `reports/self.json` + `reports/next.json` and describe the tooling's current shape in one paragraph (what's wired, what's staged but inactive, what's drifting).
2. **Behavioral-regression judgment.** After a skill edit, classify removed lines as rule / procedure / prose and flag high-risk removals against `reports/LEARNINGS.md`. That's the legacy `/qa-self --regression` path.
3. **Strategic trend analysis.** Cross-session metrics (bug discovery rate, surprise rate, improvement durability) require reading journals and making qualitative judgments. Legacy `/qa-self` Layer 3.
