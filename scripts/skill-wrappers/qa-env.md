---
name: qa-env
description: Pre-flight environment probe. Thin wrapper around `npm run qa:env` — verifies API reachability, auth flow, and one authenticated endpoint before a suite run. No browser, no GraphQL (CDP doesn't use it), no LLM.
---

# QA Env — Thin Wrapper

All probing lives in `scripts/qa-env.ts`. Mirrors the real auth path from `tests_backend/client.ts` (not the GraphQL endpoint the old skill referenced).

## Commands

```bash
npm run qa:env                       # probe + reports/env.json, exit 0/1
npx tsx scripts/qa-env.ts --quiet    # no stdout, exit code only
npx tsx scripts/qa-env.ts --json     # machine-readable stdout
```

## Contract

**Input:** `.env` — `CDP_BASE_URL`, `CDP_DOMAIN`, `CDP_EMAIL`, `CDP_PASSWORD`, `CDP_TENANT_ID`
**Output:** `reports/env.json` with per-check latency + overall verdict (`HEALTHY` | `DEGRADED` | `DOWN`)

**Probes (in order):**
1. Reachability — `OPTIONS /public/api/signin` (anything under 500 = reachable)
2. Auth — `POST /public/api/signin` with real credentials, captures jwtToken
3. Authenticated endpoint — `GET /api/tenants/udafs` with the token

The JWT is used in memory and **never** written to disk.

## Exit codes

- `0` — `HEALTHY` or `DEGRADED` (slow but alive)
- `1` — `DOWN` (any check failed, or required env vars missing)

## Where this runs

Call it first in any CI job. If `qa-env` exits 1, abort before burning vitest minutes — the backend is either unreachable or creds are stale.

## What changed from the old skill

- Replaced broken GraphQL probe with the real `/public/api/signin` path (lived in the test client the whole time).
- Dropped browser check — parked under the no-browser policy.
- Results are now a JSON artifact (`reports/env.json`) that `qa-gate` or a dashboard can consume.
