---
name: finished
description: End-of-session cleanup — update CLAUDE.md, update memory, log skill modifications, self-improve skills.
---

Review this session and do the following in order:

### Step 1: Update CLAUDE.md

Identify any changes to conventions, commands, or documentation routing table entries that emerged during this session. Update `CLAUDE.md` if anything changed. Keep it minimal — detail goes in docs files, not CLAUDE.md.

### Step 2: Update Memory

Identify any memory files that need updating based on decisions made this session (project state, feedback, user preferences, test approach changes). Write new memories or update existing ones in `~/.claude/projects/C--Users-amirz-cdp/memory/`.

### Step 3: Log Skill File Modifications

Check which `.claude/commands/*.md` files were modified during this session:

1. Run: `git diff --name-only HEAD -- .claude/commands/`
2. For each modified skill file, read the diff and write a one-line summary to `reports/skill-improvements.md` if the change is significant (new steps, new rules, behavioral changes — not formatting).
3. If no skill files changed, skip silently.

### Step 4: Session Skill Analysis & Self-Improvement

Analyze how skills performed during THIS session. For each skill that was invoked:

1. **Recall what happened** — Which skills ran? Did they produce correct output? Were there errors, retries, wasted tool calls, or confusion?
2. **Identify issues** in these categories:
   - **Bugs** — skill produced wrong output, wrote to wrong path, skipped a step, crashed
   - **Inconsistencies** — skill references files/paths/steps that don't exist or conflict with other skills
   - **Inefficiencies** — unnecessary tool calls, redundant reads, overly verbose prompts eating tokens
   - **Stale references** — skill mentions deprecated paths, old file names, removed features
3. **Fix immediately** — For each issue found, edit the skill file directly. Don't just log it.
4. **Log what was fixed** — Append a brief summary to `reports/skill-improvements.md`:
   ```
   ## {date}
   - /finished self-improve: {one-line per fix}
   ```

If no skills were invoked or no issues found, skip silently.

### Step 5: Confirm

Briefly confirm what was added, changed, or fixed. Or say "Nothing new to record" if the session had no decisions or fixes worth persisting.
