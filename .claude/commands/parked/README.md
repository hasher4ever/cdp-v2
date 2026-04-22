# Parked Skills

These skills are not actively used in the current QA pipeline. They remain here for reference or possible reactivation.

| Skill | Reason parked |
|-------|---------------|
| qa-flows | Interactive flow-mapping; superseded by doc-driven domain tests (docs/BACKEND-SPEC.md) |
| qa-synthesize | Paired with qa-flows for doc-derived flow synthesis; not currently in the pipeline |
| qa-domain-e2e | Browser E2E flow-based testing; CDP has no browser requirement currently |
| qa-nightshift | Autonomous overnight test writer; replaced by `/qa-autopilot` + `/qa-domain-tests --continuous` |
| qa-probe | Component-recipe extraction via Playwright; depends on browser pipeline |
| website-crawl | Browser-based element inventory; not used by current backend-focused pipeline |
| ux-audit | UX audit overlay; not part of backend QA pipeline |

To reactivate, move the file back to `.claude/commands/` and update `references/qa-pipeline-reference.md` if needed.

## Stale references

The following active files still reference parked skills. Cross-references will 404 for users invoking via slash command but the docs themselves still render. Consider cleaning up on next edit:

- `.claude/commands/qa-next.md` — inventory table rows for parked skills
- `.claude/commands/references/qa-pipeline-reference.md` — pipeline diagram nodes
- `.claude/commands/qa-crawl.md` — references `/website-crawl`, `/ux-audit`
- `.claude/commands/qa-domain-tests.md` — points to `/qa-domain-e2e` for UI verification
