# Tenant Strategy

> How tests interact with CDP tenants.

## Current: Shared Tenant Only

**All tests run against the shared tenant** (TenantID=1762934640267). Fresh tenant provisioning has been archived.

`npm run test:business` uses `tests_business/global-setup-shared.ts` which:
1. Auths against the shared tenant via `.env` credentials (no signup)
2. Ensures the required schema fields exist (idempotent — 409 = already exists = fine)
3. Ingests test data with deterministic primary IDs 9_900_000_001–9_900_000_010 (ingest is idempotent)
4. Polls until data is queryable

## Archived Files

In `old_test_suite/archived/`:
- `tenant-provisioner.ts` — old fresh-tenant provisioner (calls /public/api/signup)
- `global-setup.ts` — old globalSetup that called provisionTenant()
- `tenant-isolation.test.ts` — cross-tenant isolation tests (requires 2 tenants)
- `signup.test.ts` (from tests_backend) — tests the signup API directly

## Future: Fresh Tenant Provisioning

Signup flow (for future use when email activation is resolved):
```bash
POST https://cdpv2.ssd.uz/public/api/signup
{"name":"shop_name","domainName":"www.test-domain.com","user":{"firstName":"first name","lastName":"last name","email":"admin_mail@test-domain.com","password":"123123123Q.a"}}
```
Returns `{tenant: {tenantId, ...}}`. Requires email activation link before sign-in works. When developer provides the API to get the activation link programmatically, restore `tenant-provisioner.ts` and add the activation step.
