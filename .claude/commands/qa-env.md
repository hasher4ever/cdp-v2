---
name: qa-env
description: Use before any QA skill run to verify the test environment is alive. Checks API health, auth flow, browser availability. Prevents wasting tokens on tests against a dead environment.
---

# QA Env — Environment Health Pre-Check

Verify the test environment is alive before wasting context on test runs.

**Usage:**
- `/qa-env` — full health check (API + auth + browser)
- `/qa-env --api` — API-only (no browser check)

## Procedure

### Step 1: API Health (one bash command)

```bash
curl -s -o /dev/null -w "%{http_code} %{time_total}s" https://cdpv2.ssd.uz/graphql -H 'content-type: application/json' -d '{"query":"{ __typename }"}'
```

| Result | Status | Action |
|--------|--------|--------|
| 200, <2s | **HEALTHY** | Proceed |
| 200, >5s | **SLOW** | Warn — tests may timeout. Proceed with caution |
| 4xx/5xx | **DOWN** | Stop — no point running tests |
| Timeout | **UNREACHABLE** | Stop — network issue |

### Step 2: Auth Flow (one bash command)

```bash
curl -s -X POST https://cdpv2.ssd.uz/signin \
  -H 'content-type: application/json' \
  -d '{"email":"USER","password":"PASS"}' | head -c 200
```

| Result | Status | Action |
|--------|--------|--------|
| `access_token` present | **AUTH OK** | Proceed |
| 401/403 | **AUTH FAILED** | Warn — credentials may have expired. Check test setup. |
| Error/timeout | **AUTH DOWN** | Stop — no authenticated tests possible |

### Step 3: Browser (if not `--api`)

```bash
mcp__playwright__browser_navigate(url: "https://cdpv2.ssd.uz/sign-in")
```

Then `mcp__playwright__browser_close()`.

| Result | Status | Action |
|--------|--------|--------|
| Page loads | **BROWSER OK** | Proceed with FE tests |
| Timeout/crash | **BROWSER BLOCKED** | Mark FE tests as blocked. Proceed with BE-only |

### Step 4: Report

```
## Environment Health — {date}

| Check | Status | Latency | Notes |
|-------|--------|---------|-------|
| API (GraphQL) | {status} | {time}s | |
| Auth (signin) | {status} | {time}s | |
| Browser (Playwright) | {status} | — | |

**Verdict:** {ALL HEALTHY / PARTIAL (BE only) / DOWN (abort)}
```

If any check is DOWN, print: *"Environment unhealthy. Aborting QA run. Fix the environment first."*

## Integration

- **qa-autopilot** should call `/qa-env --api` at Step 0 before dispatching any work
- **qa-triage** should call `/qa-env` before running test suites
- **qa-write** should call `/qa-env` before spawning sub-agents

## Rules

1. **Fast.** Three curl commands + one browser nav. Under 30 seconds total.
2. **No test execution.** Just checks if the environment is alive.
3. **Partial is OK.** If browser is down but API is up, BE tests can still run.
4. **Don't cache.** Always re-check — environment state changes.
