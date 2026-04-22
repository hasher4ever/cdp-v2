---
name: qa-bugs
description: Use when bugs were found during the current session — from test failures, API errors, MCP exploration, or manual discovery. Formalizes findings into reproducible bug reports across all three bug files (bugs.md, bugs_journeys.md, bugs-data.ts). Run at end of session or when a bug is confirmed.
---

# QA Bugs — Session Bug Report Writer

## Purpose

Scan the current session for confirmed bugs and write them into the three-file bug system:

1. **`bugs.md`** — Quick reference with severity, status, cURL reproduction
2. **`bugs_journeys.md`** — Step-by-step user journey format (full cURL chain)
3. **`tests_backend/src/bugs-data.ts`** — Structured TypeScript for HTML report generation

**Usage:**
- `/qa-bugs` — scan session context, write all discovered bugs
- `/qa-bugs BUG-19 BUG-20` — write specific bugs only (already identified)
- `/qa-bugs --check` — read-only: list what looks like a bug in session context, don't write anything

## What Counts as a Bug

| Source | Signal | Confidence |
|--------|--------|-----------|
| Test failure with wrong non-null value | Expected X, got Y | High — file immediately |
| GraphQL error response | `"errors": [...]` in API response | High — file immediately |
| MCP exploration: unexpected behavior | Button does nothing, wrong page, crash | Medium — verify with API call first |
| Test failure with null/undefined | Expected X, got null | Low — may be timing. Re-run before filing |
| UI looks wrong in screenshot | Visual mismatch | Low — may be expected. Ask before filing |

**Not bugs:** Selector mismatches (agent's fault), missing test infrastructure, unimplemented features (check Jira status first).

## Procedure

### Step 1: Gather Findings

Scan the current conversation for:

1. **Test results** — any test tagged `// BUG-{N}` or failing with an assertion error (not a selector error)
2. **API errors** — any GraphQL response with `"errors"` array
3. **MCP observations** — any Playwright MCP interaction where the app behaved unexpectedly
4. **Explicit mentions** — user or agent said "this is a bug" or "this is broken"

For each finding, extract:
- **What was expected** (from docs/BACKEND-SPEC.md, docs/API-REFERENCE.md, or spec)
- **What actually happened** (exact error message or wrong value)
- **How to reproduce** (API call, UI step, or test command)

### Step 2: Deduplicate Against Existing Bugs

Read `bugs.md` header to get the current bug count and list.

For each finding:
- If it matches an existing BUG-{N} (same endpoint, same error) → **skip** (already filed)
- If it's a variant of an existing bug (same service, related endpoint) → **add note to existing bug**
- If it's new → **assign next BUG-{N} number**

### Step 3: Reproduce with cURL

**Every bug MUST have a reproducible cURL command.** No exceptions.

For API bugs, construct the cURL chain:

```bash
# Step 1: Authenticate
curl -s -X POST https://cdpv2.ssd.uz/signin \
  -H 'content-type: application/json' \
  -d '{"email":"user@cdp.ru","password":"***"}'
# → {"data":{"access_token":"eyJ..."}}

# Step 2: The failing call
curl -s -X POST https://cdpv2.ssd.uz/graphql \
  -H 'content-type: application/json' \
  -H 'authorization: Bearer $TOKEN' \
  -d '{"query":"{EXACT_QUERY_HERE}"}'
# → {"errors":[...]}
```

For UI bugs discovered via MCP:
1. Identify the underlying API call (check network requests or infer from the action)
2. Reproduce at the API level with cURL
3. If purely visual (no API involvement), note: "UI-only — no API reproduction. Screenshot: {path}"

**If you cannot reproduce with cURL:** The bug is unconfirmed. Add to `--check` output but do NOT write to bug files.

### Step 4: Classify

| Field | How to determine |
|-------|-----------------|
| **Severity** | Critical = data loss/auth broken. High = feature unusable. Medium = workaround exists. |
| **Service** | Read `extensions.service` from GraphQL error, or infer from endpoint |
| **Status** | `Broken` = fully broken. `Partial fix` = workaround exists. `Fixed` = was broken, now works. |
| **Impact** | What can't the user do? What workflow is blocked? |

### Step 5: Write to All Three Files

#### 5a: Append to `bugs.md`

```markdown
---

## BUG-{N}: {title}

**Severity:** {severity} | **Test:** {PASSING/FAILING ❌}
**Where:** {mutation/query name} ({service})
**Expected:** {spec behavior}
**Actual:** {what happens}
**Impact:** {user-facing consequence}

\```bash
curl -s 'https://cdpv2.ssd.uz/graphql' \
  -H 'content-type: application/json' \
  -H 'authorization: Bearer $TOKEN' \
  --data-raw '{"query":"{EXACT_QUERY}"}'
\```
```

Update the header test count if tests were affected.

#### 5b: Append to `bugs_journeys.md`

Add to the Summary Table, then add the full journey section:

```markdown
---

### BUG-{N}: {title}
**Severity:** {severity} | **Service:** {service}
**Summary:** {one-line}

**User Journey:**

\```
Step 1: Authenticate
{curl + response}
  -> Success — got Bearer token

Step 2: {action that fails}
{curl + response}
  -> FAIL — {what went wrong}
\```

**Expected behavior:** {spec}
**Actual behavior:** {what happens}
**Business impact:** {consequence}
```

#### 5c: Append to `tests_backend/src/bugs-data.ts`

Add a new entry to the `BUGS` array following the existing `Bug` interface:

```typescript
{
  id: 'BUG-{N}', title: '{title}',
  severity: '{Critical|High|Medium}', service: '{service}', status: 'Broken',
  summary: '{one-line}',
  expected: '{spec behavior}',
  actual: '{what happens}',
  impact: '{user consequence}',
  steps: [
    { title: 'Authenticate', curl: `curl ...`, response: '{...}', result: 'success', resultText: 'Success — got Bearer token' },
    { title: '{failing step}', curl: `curl ...`, response: '{...}', result: 'fail', resultText: 'FAIL — {what}' }
  ]
},
```

### Step 6: Tag Tests

For any test that fails due to this bug:
- Add `// BUG-{N}: {brief description}` comment above the test
- Do NOT add `test.skip()` — the failing test monitors the bug

### Step 7: Report

```
## Bugs Filed — {date}

| # | Bug | Severity | Service | Source |
|---|-----|----------|---------|--------|
| BUG-{N} | {title} | {sev} | {service} | {test/MCP/API} |

Files updated:
- bugs.md — {N} new entries
- bugs_journeys.md — {N} new journeys
- tests_backend/src/bugs-data.ts — {N} new entries

Run `npm run report:bugs` to regenerate the HTML report.
```

## `--check` Mode (Read-Only)

Scan session context and list potential bugs without writing anything:

```
## Potential Bugs Found in Session

| # | Finding | Confidence | Source | Why |
|---|---------|-----------|--------|-----|
| 1 | {description} | High | Test failure | Expected X, got Y |
| 2 | {description} | Medium | MCP exploration | Button had no effect |
| 3 | {description} | Low | Null result | May be timing |

To file these, run: /qa-bugs
```

## Rules

1. **Every bug needs cURL reproduction.** No prose-only reports. If you can't reproduce with cURL, it's unconfirmed.
2. **All three files get updated together.** Never write to just one — the system expects consistency.
3. **Deduplicate first.** Read existing bugs before filing. Duplicates waste triage time.
4. **Never file selector issues as bugs.** Wrong selectors are agent mistakes, not app bugs.
5. **Null is not necessarily wrong.** Re-run before filing null-result bugs. Eventual consistency is real.
6. **Severity is about user impact, not technical complexity.** A 500 error on a rarely-used endpoint is Medium. A wrong calculation on invoices is Critical.
7. **Tag tests, never skip them.** `// BUG-{N}` comment, not `test.skip()`.
8. **Run `npm run report:bugs` reminder.** Always remind user to regenerate the HTML report after filing.
