## Approach
- Think before acting. Read existing files before writing code.
- Be concise in output but thorough in reasoning.
- Prefer editing over rewriting whole files.
- Do not re-read files you have already read unless the file may have changed.
- Test your code before declaring done.
- No sycophantic openers or closing fluff.
- Keep solutions simple and direct.
- User instructions always override this file.

# CDP Test Suite

QA test suite for CDP (Customer Data Platform) at `cdpv2.ssd.uz`. Go/Gin backend, Vite SPA frontend, multi-tenant.

## Commands

```bash
npm run test:backend          # API tests (~200s, shared tenant, sequential files)
npm run test:business         # Business logic (~370s, shared tenant, sequential files)
npm run test:e2e              # Browser E2E
npm run test:all              # Everything
npm run report:bugs           # Generate standalone HTML bug report
npm run report:dashboard      # QA dashboard — aggregates ALL skill outputs into one HTML
npm run report                # Allure report (needs Java)
```

## Documentation — Read When Needed

All detail lives in `docs/`. Start from `docs/INDEX.md`.

| When you need... | Read |
|-------------------|------|
| Architecture, test data, style, doc maintenance | `docs/QA-HANDBOOK.md` |
| Auth flow, correct endpoints, .env setup | `docs/AUTH.md` |
| Bug triage rules, ID policy, report template | `docs/BUG-TRIAGE.md` |
| Tenant strategy, shared tenant, archived provisioner | `docs/TENANT-STRATEGY.md` |
| All 77+ endpoints, payloads, webhook/commchan details | `docs/API-REFERENCE.md` |
| Data lifecycle, UDAF materialization, testing contract | `docs/BACKEND-SPEC.md` |
| Click-by-click UI testing (Russian labels) | `docs/MANUAL-FRONTEND-TESTING.md` |
| 164-item regression checklist | `docs/REGRESSION-CHECKLIST.md` |
| API test cases with curl commands | `docs/TEST-CASES.md` |
