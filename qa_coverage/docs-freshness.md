# Documentation Freshness

**Last checked:** 2026-03-30

## Stale Documentation

| # | Doc File | Section | Claim | Current State | Severity |
|---|----------|---------|-------|---------------|----------|
| 1 | `CLAUDE.md` | Documentation Suite table | Lists `docs/BACKEND-SPEC.md` — "Data lifecycle, testing contract, anti-patterns" | File exists and is correct. However, the old CLAUDE.md section "Bug Tracking Rules" was renamed to "Bug Triage Rules" but the heading in the doc table still says the old name structure is implied. Minor inconsistency. | Low |
| 2 | `CLAUDE.md` | Documentation Suite table | Claims API-REFERENCE has "All 77 endpoints" | API-REFERENCE has **82** endpoint rows in tables (across 17 sections). The "77" figure is stale. | Medium |
| 3 | `docs/INDEX.md` | Documents table | Claims API-REFERENCE has "All 77 API endpoints" | Actual count is **82** endpoint rows. | Medium |
| 4 | `docs/INDEX.md` | Documents table | Claims Regression Checklist has "164-item pass/fail checklist incl. cross-feature workflows" | The checklist has exactly **164 checkbox items** -- this is correct. | Fresh |
| 5 | `CLAUDE.md` | Documentation Suite table | Claims Regression Checklist is "164-item pass/fail checklist (13 sections incl. cross-feature workflows)" | Checklist has **13 sections** (1-13) and **164 items** -- correct. | Fresh |
| 6 | `docs/REGRESSION-CHECKLIST.md` | Summary table | Claims "18 bugs" total affecting checklist items | bugs.md now has **28 open bugs** (BUG-001 through BUG-031, minus 3 resolved: BUG-004, BUG-007, BUG-029). The summary says 18 and only references bugs up to BUG-018. Bugs 019-028, 030-031 have no corresponding checklist items. | High |
| 7 | `docs/REGRESSION-CHECKLIST.md` | UDF-09 | Claims "UDAF with event filter predicate" is blocked by BUG-002 | BUG-002 is about **RELATIVE time windows**, not event filter predicates. Event filter UDAFs actually work (per BUG-002 notes: "event-predicate-filtered UDAFs all work correctly"). UDF-09 misdescribes the bug. | High |
| 8 | `docs/REGRESSION-CHECKLIST.md` | WF-09 | Claims "UDAF with Event Filter + Segment" is blocked by BUG-002 | Same issue as #7 -- BUG-002 is about RELATIVE time windows, not event filters. This workflow item wrongly attributes the blocker. | High |
| 9 | `docs/REGRESSION-CHECKLIST.md` | Missing items | No checklist items for BUG-019 through BUG-028, BUG-030, BUG-031 | 13 bugs discovered after the checklist was written have no corresponding regression items. Missing coverage for: empty segmentation names (019), empty segments array (020), XSS in segmentation (021), empty UDAF names (022), negative page numbers (023), long UI settings keys (024), UDAF PUT failure (025), UDAF params validation (026), UDAF non-existent customer (027), null predicate crash (028), empty scenario name via UI (030), duplicate field dropdown (031). | High |
| 10 | `docs/QA-HANDBOOK.md` | Running Tests | Lists `npm run test:e2e:headed` and `npm run test:e2e:ui` | Both exist in package.json -- correct. | Fresh |
| 11 | `docs/QA-HANDBOOK.md` | Running Tests | Lists `npm run test:backend:watch` and `npm run test:backend:ui` | Both exist in package.json -- correct. | Fresh |
| 12 | `docs/QA-HANDBOOK.md` | Test Data - 18 Purchase Events | Claims "Tashkent: 9 events (Alice 2, Grace 1, Dave 4, Frank 1, Hana 1)" | Need to verify against test-data.ts. The EXPECTED object shows alicePurchases=3, davePurchases=4, frankPurchases=3 total (not per-city). The per-city breakdown in the handbook is not directly verifiable from EXPECTED alone but the totals (18 events, Samarkand 5) match. | Low |
| 13 | `docs/API-REFERENCE.md` | Section 10 (UDAFs) | Claims BUG-002 is about "filtered UDAFs may return null/0" | BUG-002 was re-triaged (see bugs.md notes dated 2026-03-30). It is specifically about **RELATIVE time windows**, not filtered UDAFs in general. The API-REFERENCE description is stale. | Medium |
| 14 | `docs/API-REFERENCE.md` | Section 9 (Autocomplete) | Claims "Event fields: BUG-001 (returns 500)" | BUG-001 is still open and correctly described. | Fresh |
| 15 | `docs/BACKEND-SPEC.md` | Known Bug: RELATIVE Time Windows | Correctly describes BUG-002 scope after re-triage | Matches current bugs.md -- correct and detailed. | Fresh |
| 16 | `CLAUDE.md` | Bug Tracking Rules heading | Section is titled "Bug Tracking Rules -- CRITICAL" | The actual content was updated to "Bug Triage Rules -- CRITICAL" with new triage methodology. The heading change is correct in the file. | Fresh |
| 17 | `docs/QA-HANDBOOK.md` | Test Data table | Claims Hana income is "$0" | Need to verify against test-data.ts EXPECTED: incomeZero=3 (Carol, Hana, Jun) -- matches. | Fresh |
| 18 | `docs/TEST-CASES.md` | TC-1.7 | References BUG-012 for employee creation | BUG-012 is still open in bugs.md -- correct. | Fresh |

## Freshness Summary

| Doc File | Claims Checked | Stale | Fresh | Freshness % |
|----------|---------------|-------|-------|-------------|
| `CLAUDE.md` | 5 | 1 | 4 | 80% |
| `docs/INDEX.md` | 3 | 1 | 2 | 67% |
| `docs/QA-HANDBOOK.md` | 6 | 0 | 6 | 100% |
| `docs/API-REFERENCE.md` | 4 | 2 | 2 | 50% |
| `docs/TEST-CASES.md` | 3 | 0 | 3 | 100% |
| `docs/BACKEND-SPEC.md` | 3 | 0 | 3 | 100% |
| `docs/REGRESSION-CHECKLIST.md` | 8 | 4 | 4 | 50% |
| **TOTAL** | **32** | **8** | **24** | **75%** |

## File Existence Verification

All referenced files were confirmed to exist:

| Referenced Path | Exists |
|----------------|--------|
| `tests_backend/client.ts` | Yes |
| `tests_backend/ingest.ts` | Yes |
| `tests_business/test-data.ts` | Yes |
| `tests_business/global-setup.ts` | Yes |
| `tests_business/tenant-provisioner.ts` | Yes |
| `tests_business/tenant-context.ts` | Yes |
| `tests_business/full-workflow.test.ts` | Yes |
| `tests_business/segmentation-field-types.test.ts` | Yes |
| `tests_business/udaf-logic.test.ts` | Yes |
| `tests_backend/auth.test.ts` | Yes |
| `tests_backend/signup.test.ts` | Yes |
| `openapi/clustermeta.yaml` | Yes |
| `openapi/ingest.yaml` | Yes |
| `scripts/generate-report.ts` | Yes |
| `scripts/generate-qa-dashboard.ts` | Yes |
| `vitest.business.config.ts` | Yes |
| `docs/MANUAL-FRONTEND-TESTING.md` | Yes |
| `docs/BACKEND-SPEC.md` | Yes |
| `.env.example` | Yes |

## Script Name Verification

All documented npm scripts exist in package.json:

| Script | Documented In | Exists |
|--------|--------------|--------|
| `test:backend` | CLAUDE.md, QA-HANDBOOK, INDEX | Yes |
| `test:business` | CLAUDE.md, QA-HANDBOOK | Yes |
| `test:e2e` | CLAUDE.md, QA-HANDBOOK | Yes |
| `test:all` | CLAUDE.md, QA-HANDBOOK | Yes |
| `report:bugs` | CLAUDE.md, QA-HANDBOOK | Yes |
| `report:dashboard` | CLAUDE.md | Yes |
| `report` | CLAUDE.md, QA-HANDBOOK | Yes |
| `test:e2e:headed` | QA-HANDBOOK | Yes |
| `test:e2e:ui` | QA-HANDBOOK | Yes |
| `test:backend:watch` | QA-HANDBOOK | Yes |
| `test:backend:ui` | QA-HANDBOOK | Yes |

## Recommendations

1. **`docs/REGRESSION-CHECKLIST.md`**: 4 stale claims -- needs update urgently
   - Fix UDF-09 and WF-09 to correctly reference BUG-002 as RELATIVE time window issue (not event filter predicates)
   - Add checklist items for BUG-019 through BUG-028, BUG-030, BUG-031 (13 bugs with no regression items)
   - Update the summary table bug count from "18 bugs" to reflect actual count (28 open)

2. **`docs/API-REFERENCE.md`**: 2 stale claims -- moderate priority
   - Update BUG-002 note in Section 10 (UDAFs) to say "RELATIVE time window UDAFs return 0" instead of "filtered UDAFs may return null/0"
   - The "77 endpoints" claim in INDEX.md and CLAUDE.md should be updated to 82

3. **`CLAUDE.md`**: 1 stale claim -- low priority
   - Update "All 77 endpoints" to "All 82 endpoints" in the doc table

4. **`docs/INDEX.md`**: 1 stale claim -- low priority
   - Update "All 77 API endpoints" to "All 82 API endpoints"
