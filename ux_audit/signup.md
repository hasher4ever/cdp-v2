# Registration — UX Findings

**Source:** `page_crawl/signup.md` (crawled 2026-03-30)
**Audited:** 2026-03-30
**Based on quick scan — form fields not fully explored.**

## Findings

| # | P | Category | Proposition |
|---|---|----------|-------------|
| 1 | **P3** | Forms & Validation | Add password requirements hint. Registration form should show password policy (min length, complexity) before submission (Nielsen #5: Error prevention). |

## Global References

None specific.

## Business Logic Findings

| # | Severity | Bug Ref | Finding |
|---|----------|---------|---------|
| BL-1 | High | BUG-012 | Employee creation via `POST /api/tenant/employee` returns 500. If this sign-up page submits to that endpoint (or a similar employee registration endpoint), the entire registration flow is broken — submitted forms will error. This needs to be confirmed by inspecting the network call on submit. |
| BL-2 | Medium | — | The page was captured in a quick scan only and form fields were not fully explored (per page_crawl/signup.md notes). It is unclear whether this page creates a new tenant (org-level registration) or a new employee within an existing tenant. The domain model (multi-tenant) implies tenant creation is a separate admin operation. If the sign-up page is intended for tenant self-registration, the backend flow is distinct from employee creation and BUG-012 may not apply — but this must be verified. |
| BL-3 | Low | — | No confirmation of required field set, password policy, or domain uniqueness rules is visible from the crawl. Given BUG-003 (segmentation accepts empty name) and BUG-019 (same pattern) as precedents, the sign-up backend likely also lacks strict validation — whitespace-only or empty required fields may be accepted without error. |
