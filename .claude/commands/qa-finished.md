---
name: qa-finished
description: Thin wrapper around `npm run qa:finished`. Deterministic end-of-session closeout — gathers git state, report freshness + verdicts, modified-files categorization, and a concrete punchlist. Writes `reports/closeout.json`. No LLM in the hot path; narrative closeout + memory/skill-improvement authorship stays in the legacy `/finished` skill but now starts from this JSON.
---

# QA Finished — Thin Wrapper (Mechanical Closeout)

All mechanical work lives in `scripts/qa-finished.ts`. No LLM in the hot path.

## Commands

```bash
npm run qa:finished                  # closeout -> reports/closeout.json + stdout
npm run qa:finished -- --json        # machine-readable stdout
npm run qa:finished -- --quiet       # no stdout
```

## Contract

**Inputs** — whatever the session has produced:
- Git state: `git status --porcelain`, `git log -1`, ahead-of-upstream count
- `reports/{env,triage,perf,health,next,self,coverage,bugs-mechanical}.json` verdicts (when present)
- Nothing else — this is a snapshot, not a test run

**Output** — `reports/closeout.json`:
```
{
  git:      { branch, headShort, lastMessage, staged[], unstaged[], untracked[], commitsAhead },
  reports:  { env, triage, perf, health, next, self, coverage, bugs }
              each: { present, verdict: PASS|WARN|FAIL|missing|unknown, ageSec },
  modified: { skills[], scripts[], wrappers[], docs[], tests[], other[] },
  punchlist: [
    // deterministic items the narrator MUST mention, e.g.:
    "BLOCKER: triage verdict=FAIL - regressions need investigation",
    "3 skill file(s) modified - append to reports/skill-improvements.md",
    "git: 4 unstaged + 25 untracked file(s) - commit or clean up",
    ...
  ]
}
```

**Punchlist rules** (hard-coded in the script)

| Trigger | Item |
|---------|------|
| `env.overall === "DOWN"` | BLOCKER: backend down - don't declare work done |
| `triage.verdict === "FAIL"` | BLOCKER: triage regressions outstanding |
| `triage.verdict === "WARN"` | update expected-failures manifest |
| `perf.verdict === "FAIL"` | BLOCKER: latency regressions outstanding |
| `health.verdict === "FAIL"` | see reports/health.json |
| `self.verdict === "FAIL"` | tooling drift — run qa:self |
| missing env/triage | suggest running the relevant npm script |
| modified skills | append to reports/skill-improvements.md |
| modified scripts / wrappers | run `npm run qa:self` |
| modified docs | CLAUDE.md doc routing table review |
| modified tests | rerun `npm run qa:triage` |
| unstaged / untracked files | git hygiene note |

Exit code is always 0 — closeout is informational.

## Reframing from the old skill

The previous `/finished` skill had five LLM steps: update CLAUDE.md, update memory, log skill mods, self-improve skills, confirm. Steps 1, 2, 4, 5 are narrative judgment and stay in the LLM. Step 3 (find modified skills, check for significance) was previously a full re-read of diffs; now `reports/closeout.json` already lists the modified skill files, and the LLM only needs to decide *which* diffs are significant enough to log — one Edit per actually-significant change, not a full scan.

Net effect: `/finished` now opens `reports/closeout.json` first, uses the punchlist to avoid missing the obvious, and spends tokens on the judgment-heavy steps (memory, skill-improvement authorship) rather than on re-probing the working tree.

## When the LLM is called (and only when)

The LLM is NOT invoked for the closeout snapshot. It is only useful for:

1. **Authoring `reports/skill-improvements.md` entries.** Given the `modified.skills[]` list, read each diff and write a one-line summary per meaningful change.
2. **Updating CLAUDE.md** if doc routing changed — requires judgment about what's conventional vs project-specific.
3. **Updating memory** in `~/.claude/projects/...` — judgment about which session facts persist.
4. **Narrative confirm step** — acknowledge what was persisted vs what was skipped.
5. **Self-improvement pass** — analyze skill performance *this session* and edit the offending skill file. Starts from `modified.skills[]` as the suspect list.
