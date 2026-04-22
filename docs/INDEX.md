# CDP Test Documentation Suite

> Complete QA documentation for the Customer Data Platform. Designed for manual QA engineers and AI assistants.

## Documents

| Document | Purpose | Audience |
|----------|---------|----------|
| [QA Handbook](QA-HANDBOOK.md) | Onboarding, architecture, environment setup, key concepts, style | New QA engineers |
| [Auth](AUTH.md) | Correct auth flow, gotchas, .env setup | QA, developers, AI |
| [Bug Triage](BUG-TRIAGE.md) | Triage rules, bug ID policy, report template | QA engineers, AI |
| [Tenant Strategy](TENANT-STRATEGY.md) | Shared tenant details, archived provisioner, future plans | QA engineers, AI |
| [Manual Frontend Testing](MANUAL-FRONTEND-TESTING.md) | Step-by-step UI testing with Russian labels, buttons, data prep | Manual QA (daily work) |
| [Regression Checklist](REGRESSION-CHECKLIST.md) | 164-item pass/fail checklist incl. cross-feature workflows | Manual QA |
| [Test Cases](TEST-CASES.md) | API test cases with copy-paste curl commands and expected values | QA engineers, AI |
| [API Reference](API-REFERENCE.md) | All 77+ endpoints with request/response examples | QA, developers, AI |
| [Backend Spec](BACKEND-SPEC.md) | Data lifecycle, UDAF materialization, testing contract | QA engineers, AI |

## Quick Start

1. Read the [QA Handbook](QA-HANDBOOK.md) to understand the project
2. Set up your environment (Node.js, npm install, .env config)
3. Run `npm run test:backend` to verify setup (~2 seconds)
4. **For daily frontend QA:** Follow [Manual Frontend Testing](MANUAL-FRONTEND-TESTING.md) — has every button label, expected screen state, and data preparation curls
5. **For release regression:** Use the [Regression Checklist](REGRESSION-CHECKLIST.md) (164 items incl. cross-feature workflows)
6. **For API testing:** Follow [Test Cases](TEST-CASES.md) with copy-paste curl commands
7. Refer to [API Reference](API-REFERENCE.md) for endpoint details

## Related Files

| File | Purpose |
|------|---------|
| `CLAUDE.md` | AI behavior rules + pointer table to all docs |
| `bugs.md` | Active bug tracker with curl reproduction commands |
| `tests_business/test-data.ts` | Deterministic test data (10 customers, 18 events) |
| `openapi/clustermeta.yaml` | OpenAPI spec for main API |
| `openapi/ingest.yaml` | OpenAPI spec for ingestion API |

## Maintenance

- **New bug found** → add to `bugs.md` + run `npm run report:bugs` + add checkbox to [Regression Checklist](REGRESSION-CHECKLIST.md)
- **New endpoint** → add to [API Reference](API-REFERENCE.md)
- **New test added** → add entry to [Test Cases](TEST-CASES.md) with curl command
- **UI change** → update Russian labels in [Manual Frontend Testing](MANUAL-FRONTEND-TESTING.md)
- **New feature** → add section to [Regression Checklist](REGRESSION-CHECKLIST.md) + [Test Cases](TEST-CASES.md) + [Manual Frontend Testing](MANUAL-FRONTEND-TESTING.md)
- **Architecture change** → update [QA Handbook](QA-HANDBOOK.md)
