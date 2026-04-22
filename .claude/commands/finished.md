---
name: finished
description: End-of-session closeout. Thin routing wrapper — runs `npm run qa:finished` for the mechanical closeout (git state, report verdicts, modified files, punchlist → reports/closeout.json), then hands off to the legacy narrative skill for memory/skill-improvement authorship and CLAUDE.md doc-routing review.
---

# /finished — End-of-Session Closeout (Routing Wrapper)

This is the legacy `/finished` entry point. It now delegates:

## Step 1 — Mechanical snapshot (no LLM)

```bash
npm run qa:finished
```

Writes `reports/closeout.json` with:
- Git state (branch, staged/unstaged/untracked, commits-ahead, last commit)
- Report verdicts (env, triage, perf, health, self, coverage, bugs, next)
- Modified files categorized (skills / scripts / wrappers / docs / tests / other)
- Deterministic punchlist (blockers first, then hygiene items)

The punchlist is authoritative — the narrative below MUST acknowledge every item in it.

## Step 2 — Narrative closeout (LLM work)

Open `reports/closeout.json` and then work through the legacy procedure in `.claude/commands/legacy/finished-narrative.md`:

1. **Update CLAUDE.md doc routing table** only if `modified.docs` shows relevant changes (new/removed docs, or the "When you need..." table is stale).
2. **Persist session memory** to the appropriate memory location — decide which session facts are durable vs one-off. Judgment, not mechanical.
3. **Log skill mods** — for each entry in `modified.skills`, read the diff and append a one-line summary to `reports/skill-improvements.md`. Skip cleanups; log only rule changes.
4. **Self-improvement pass** — if any skill file in `modified.skills` underperformed *this session*, edit the skill to tighten the rule that was missed. Starts from `modified.skills` as the suspect list.
5. **Confirm** — print what was persisted vs skipped, one line per item. Acknowledge every punchlist entry either with action taken or rationale for skipping.

## Why this split

Mechanical closeout in 100 ms with deterministic punchlist. Narrative judgment — which diffs matter, which memories persist, which skills need tightening — stays with the LLM, now starting from a structured JSON rather than re-probing the filesystem.
