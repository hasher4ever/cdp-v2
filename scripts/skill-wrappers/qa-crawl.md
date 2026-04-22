---
name: qa-crawl
description: Thin wrapper around `npm run qa:crawl`. Walks tests_backend/ and tests_business/, extracts test names + endpoint references + BUG-NNN tokens, cross-references docs/API-REFERENCE.md, and writes `reports/coverage.json`. No LLM, no page_crawl cache — this is backend-API coverage, not UI coverage.
---

# QA Crawl — Thin Wrapper

All mechanical work lives in `scripts/qa-crawl.ts`. No LLM in the hot path.

## Commands

```bash
npm run qa:crawl                   # scan -> reports/coverage.json + stdout summary
npm run qa:crawl -- --uncovered    # list endpoints with 0 tests
npm run qa:crawl -- --json         # machine-readable stdout
npm run qa:crawl -- --quiet        # no stdout
```

## Contract

**Inputs**
- `tests_backend/**/*.test.ts` and `tests_business/**/*.test.ts` — source of truth for tests
- `docs/API-REFERENCE.md` — canonical endpoint surface

**Output** — `reports/coverage.json`:
```
{
  suites:      { backend: {files, tests}, business: {files, tests} },
  files:       [{ suite, file, testCount, endpoints[], bugs[] }, ...],
  endpoints:   [{ method, path, testsReferencing, referencedIn[] }, ...],  // from API-REFERENCE
  bugCoverage: { "BUG-012": ["tests_backend/…", ...], ... },
  summary:     { filesScanned, totalTests, documentedEndpoints,
                 coveredEndpoints, uncoveredEndpoints, bugsWithTests }
}
```

**Extraction rules** (encoded in the script)
- **Test names:** regex over `describe(`, `it(`, `test(` — supports `.skip`, `.only`, `.each(...)`. Only `it`/`test` count toward `testCount` (describes are containers).
- **Endpoints:** regex over quoted `/api/...` / `/public/api/...` / `/cdp-ingest/...` strings. Paths are normalized: query strings stripped, UUIDs and numeric IDs → `{id}`.
- **Bugs:** regex over `BUG-NNN` (3-4 digits) tokens anywhere in test source.

**Matching** — a documented endpoint is "covered" if any test references its path (after both sides have `{id}` placeholders collapsed). Prefix matches count too, so a test hitting `/api/tenants/campaign/{id}` covers the doc entry `/api/tenants/campaign`.

Exit code is always 0 — coverage inventory is not a gate.

## Reframing from the old skill

The previous `qa-crawl.md` was a **per-page UI coverage audit** that required a `page_crawl/{page}.md` cache from `/website-crawl`. That skill is parked under this project's *No Browser Interaction* policy, so the UI-coverage premise never applies.

This replacement inventories what the project actually tests: the backend REST surface. Same idea (find the gaps), different subject (endpoints instead of DOM elements). If browser testing is un-parked later, we can add a `--ui` mode that consumes `page_crawl/` alongside.

## When the LLM is called (and only when)

The LLM is NOT invoked to scan files or compute coverage. It is only useful for:

1. **Narrative summary on request.** Read `reports/coverage.json` and describe biggest gaps / strongest areas in one paragraph.
2. **Drafting new tests for uncovered endpoints.** Once `--uncovered` points at a gap, the LLM can draft a test — but that's `/qa-write` territory, not here.
