# QA Crawl Extension Scans (Reference)

> Loaded by /qa-crawl when running `--api`, `--rules`, or `--docs` flags, or after all pages are scanned.

## API Contract Drift Check (`--api`)

### Sources of API contracts

Discover dynamically (check CLAUDE.md for pointers):
- OpenAPI/Swagger specs (`openapi.yaml`, `swagger.json`, etc.)
- API reference docs (`docs/API-REFERENCE.md` or similar)
- API calls recorded in `page_crawl/.cache/*_network.md` files

### Procedure

1. **Collect documented endpoints** — read API specs/docs, build list: method, path, expected status, response shape
2. **Collect actual API calls** — read `page_crawl/.cache/*_network.md` files
3. **Compare:**
   - In docs but never called → possibly dead or behind feature flags
   - Called but not in docs → undocumented (add to docs)
   - Status code mismatches → bug
   - Response shape changes → field renamed/added/removed
4. **Write to `qa_coverage/api-contracts.md`** — see `references/qa-output-templates.md § API Contracts`

Update `reports/QA_COVERAGE.md` with API Contracts section.

## Business Rule Coverage Scan (`--rules`)

Flips from element-first to **rule-first**: start from business rules, check if each is tested.

### Procedure

**Step 1: Extract rules from docs/BACKEND-SPEC.md**

Extract every testable rule as a discrete item:

| Rule Type | Example |
|-----------|---------|
| Calculation | Formulas, aggregations, derived values |
| State transition | Valid/invalid status transitions |
| Validation | Required fields, uniqueness, format constraints |
| Trigger/side-effect | "When X, then Y" cascading updates |
| Authorization | Role-based access checks |
| Data integrity | FK logic, orphan prevention |
| Boundary | Limits, caps, pagination rules |

**Step 2: Cross-reference against ALL test files**

Search across ALL test layers (`tests_backend/`, `tests/`). Mark each rule: Tested / Partial / Untested.

**Step 3: Score priority**

| Condition | Points |
|-----------|--------|
| Calculation/formula | +3 |
| State transition | +3 |
| Cross-entity side effect | +3 |
| Validation/constraint | +2 |
| Authorization | +2 |
| Boundary/limit | +1 |
| Has related bug in bugs.md | +2 |

**Step 4: Write to `qa_coverage/business-rules.md`** — see `references/qa-output-templates.md § Business Rules Coverage`

### When to run

- Automatically after all pages scanned
- Manually via `/qa-crawl --rules`
- Re-run when docs/BACKEND-SPEC.md changes

## Documentation Freshness Scan (`--docs`)

Checks if documentation still matches current codebase and crawled UI.

### What to check

1. **API docs vs actual behavior** — cross-reference `qa_coverage/api-contracts.md` against API docs
2. **UI docs vs crawled elements** — labels, routes, workflows against page_crawl/ data
3. **Test docs vs test files** — documented test cases vs actual test files
4. **Setup docs vs project config** — env vars, commands, dependencies

### Severity scoring

| Stale claim type | Severity |
|-----------------|----------|
| Setup/install instructions wrong | High |
| API endpoint path/method wrong | High |
| Expected values wrong | High |
| UI label changed | Low |
| Screenshot outdated | Low |
| References removed feature | Medium |

### Procedure

1. Discover documentation files — glob `docs/`, `*.md` (excluding generated)
2. Extract claims: endpoint paths, UI labels, command names, env vars
3. Cross-reference each claim against current state
4. **Write to `qa_coverage/docs-freshness.md`** — see `references/qa-output-templates.md § Documentation Freshness`
