---
name: qa-health
description: Unified page health score. Alias for /qa-next with health focus. Combines element coverage, rule coverage, UX findings, and bug exposure into grades per page.
---

# QA Health — Page Health Score

**This is a convenience alias.** Health scoring is built into `/qa-next` (Tier 2+).

- `/qa-health` → runs `/qa-next`, prints only the Page Health table
- `/qa-health /page` → reads `state.md`, extracts health row for that page. If stale, runs `/qa-next` Tier 2 first.

Health dimensions, weights, and grade bands are defined in `/qa-next` Step 3.5.

For the full QA pipeline status, use `/qa-next` directly.
