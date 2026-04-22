# Bug Triage Rules & Reporting Template

> How to identify, reproduce, and document bugs in the CDP test suite.

## Triage Rules

### Always reproduce on a fresh tenant first
Never triage bugs on the shared tenant — it may have compute service corruption or stale state. Run `npm run test:business` (provisions a clean tenant) and check pass/fail across 2-3 runs. Only **consistently wrong values** (not flaky `null`) are real bugs. See [Backend Spec](BACKEND-SPEC.md) § Bug Triage Methodology.

### UDAF `null` results are usually timing, not bugs
Newly created UDAFs materialize asynchronously. A `null` result means "not yet computed," not "broken." Run multiple times — if flaky, it's timing. If consistently wrong (returns 0 when it should be 3), it's a bug.

### Never adapt tests to match backend bugs
If a test expects `200` and gets `500`, and the expectation is logically correct — **keep the test as-is**. It is a bug to document, not a test to fix. Only fix tests when the expected value itself is wrong (bad math, wrong index, etc.).

---

## Bug ID Rules — CRITICAL

**BUG IDs ARE IMMUTABLE — once assigned, they refer to that exact bug forever.**

Bug IDs are given to developers in reports and referenced in tickets. Renumbering breaks every external reference.

- **Never delete a bug entry.** If resolved: mark `~~BUG-N~~: RESOLVED — {description}` and add a note.
- **Never renumber.** If a bug was filed in error or is a duplicate: mark `~~BUG-N~~: DUPLICATE of BUG-M` or `~~BUG-N~~: INVALID — {reason}`.
- **New bugs always go at the end** with the next sequential ID. Never insert in the middle.
- **Never use "FORMERLY BUG-N"** — this indicates a renumbering happened, which is forbidden.

---

## Required Fields per Bug

| Field | Description |
|-------|-------------|
| **Bug ID** | Sequential: BUG-001, BUG-002, ... (next available after current highest) |
| **Severity** | High / Medium / Low |
| **Endpoint** | The API endpoint or UI page |
| **Complete reproduction curls** | See below |
| **Expected** | What should happen (with exact response bodies) |
| **Actual** | What actually happens (with exact response bodies) |
| **Notes** | Additional context |

---

## Curl Reproduction Requirements — NON-NEGOTIABLE

Every bug MUST have **copy-paste curl commands that reproduce it from scratch**. No prose steps like "create a customer" — show the actual curl. A developer should be able to paste every curl in order and see the bug.

**What "complete" means:**
1. **Setup curls** — every prerequisite (create the entity, ingest the data, wait if needed)
2. **Trigger curl** — the call that demonstrates the bug
3. **Every curl must include:** full URL, method, headers (Content-Type, Authorization), and the exact JSON body
4. **Use literal values, not variables** — `"primary_id": "9900000005"` not `"primary_id": "$ID"`
5. **Include the actual response** — paste what the server returned, not a description of it

---

## Bug Report Template

```markdown
## BUG-{N}: {title}

**Severity:** {High/Medium/Low}
**Endpoint:** `{METHOD} {path}`
**Status:** Open

### Setup
```bash
# Step 1: Create prerequisite data
curl -X POST 'https://example.com/api/endpoint' \
  -H 'Content-Type: application/json' \
  -H 'Authorization: Bearer {token}' \
  -d '{"exact": "payload", "with": "real values"}'
# Response: {"id": "abc123", "status": "created"}

# Step 2: Additional setup if needed
curl -X POST 'https://example.com/api/other' \
  -H 'Content-Type: application/json' \
  -d '{"references": "abc123"}'
# Response: {"ok": true}
```

### Reproduce
```bash
# The call that shows the bug
curl -X POST 'https://example.com/api/buggy-endpoint' \
  -H 'Content-Type: application/json' \
  -H 'Authorization: Bearer {token}' \
  -d '{"id": "abc123"}'
```

**Expected:** `{"result": 2}` — because {reasoning}
**Actual:** `{"result": 0}` — full response: `{"result": 0, "error": null, "timing": "3.2s"}`
```

> **Why this matters:** A bug without reproducible curls is not a bug report — it's an anecdote. The developer cannot verify it, cannot debug it, and cannot confirm it's fixed.

After updating `bugs.md`, run `npm run report:bugs` to regenerate the HTML report.
