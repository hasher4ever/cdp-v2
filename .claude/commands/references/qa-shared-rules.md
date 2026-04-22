# QA Shared Rules (Reference)

> Loaded on-demand by QA skills. Contains rules that apply across multiple skills.

## Selector Rules

- **Live DOM only.** Navigate via Playwright MCP + snapshot before writing selectors. `page_crawl/` text is context, NOT a selector source.
- **Accessible queries first:** role > label > placeholder > text > data-testid > CSS selector (last resort).
- **Disambiguate adjacent elements** by reading snapshot tree structure (not position). Screenshot if ambiguous.
- **Use the project's locale** — if UI is Russian/Korean/etc., use those labels.

## Verify-First Loop (mandatory for every test)

1. Navigate → snapshot → read accessibility tree
2. Write ONE test from snapshot selectors
3. Run it (`npx playwright test {file} --grep "{name}" --reporter list`)
4. Pass → next test. Fail → screenshot + re-read snapshot + fix (max 2 attempts)
5. After 2 failures: selector issue → delete test. App bug → keep test + `// BUG-{N}` tag.
6. **Never batch-write.** One test at a time, verified before moving on.

## Bug Documentation

- **Never `test.skip()` for known bugs.** Write the test, let it fail, tag `// BUG-{N}`.
- **Never adapt tests to bugs.** Tests assert CORRECT behavior per docs/BACKEND-SPEC.md.
- Every bug needs `### Setup` and `### Reproduce` sections with ```bash curl blocks.
- `null`/`undefined` results ≠ wrong values. Re-run 1-2x before filing (eventual consistency).

## Context Hygiene

```
# WRONG — 300+ lines in context
browser_snapshot()

# RIGHT — 0 lines, read selectively
browser_snapshot(filename: "{cache-dir}/{page}.md")
Read("{cache-dir}/{page}.md", limit: 50)
```

- **Table rows:** 2-3 rows max. Structurally identical — stop reading.
- **Network logs:** Save to file, diff against baseline.
- **Sub-agent prompts:** Point to files on disk, never paste content.

## Quality Standards

- **Quality > quantity.** 3 verified-passing tests > 15 blind ones.
- **Zero broken tests shipped.** Delete rather than leave broken.
- **Match existing test style exactly.** Read 2-3 existing tests, copy patterns. No new abstractions.
- **`@generated` marker** on all generated test blocks. Human-written tests are append-only.
- **Max 2 fix attempts per selector.** Then delete (selector issue) or document (app bug).

## Model Tiering Defaults

| Task | Model | Why |
|------|-------|-----|
| Bulk invariants, mechanical cross-reference | Sonnet | Pattern-matching, low creativity |
| Selector verification, bug vs selector distinction | Opus | Judgment needed |
| Data flow / edge case tests | Opus | Domain reasoning |
| Schema extraction | Sonnet | Mechanical extraction |

## Test Data Management

- Tag all test-created data: `__qa_{skill}_{timestamp}` prefix
- Clean up in afterAll hooks. Reverse order (children before parents).
- Tolerate cleanup failures — log, don't fail.
- No delete endpoint → document as "manual cleanup needed"

## JSON Reporter Rule

**Never parse text/list output from test runners.** Prior incident missed 36 failures from tail truncation. Always `--reporter json` and parse the file.

## Token Efficiency Rules

These apply to ALL QA skill agents and sub-agents:

**Output verbosity:**
- Sub-agents return **one paragraph max.** No explanations, no reasoning, no summaries of what was read. Just: result, counts, findings.
- Never echo back file contents you just read. You read it, you know it — act on it.
- Never explain WHY you're doing something. Just do it and report the outcome.

**File reading:**
- Always use `limit:` on Read. Default `limit: 30` for index/summary files. `limit: 50` for code files.
- Never read a file you don't need for the current step.
- For tables: read header + 2-3 rows. That's the schema. Don't read 100 rows.

**Bash output:**
- Redirect large output to files: `command > file.json`, then parse with `node -e` or `head`.
- Never let test runner output (`npx playwright test`, `npx vitest`) dump into context directly.
- Use `wc -l`, `grep -c`, `jq '.count'` to extract numbers, not full output.

**Agent prompts (when spawning sub-agents):**
- Keep under 200 words. Point to files, don't paste content.
- Specify return format explicitly: "Return one paragraph: Result: | Tests: | Bugs:"
- The prompt IS context for the parent. Every extra word costs on every subsequent turn.
