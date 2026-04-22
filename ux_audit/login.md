# Login — UX Findings

**Source:** `page_crawl/login.md` (crawled 2026-03-30)
**Audited:** 2026-03-30

## Findings

| # | P | Category | Proposition |
|---|---|----------|-------------|
| 1 | **P2** | Accessibility | Add `aria-label` to the password visibility toggle button. The eye icon has no accessible name — screen readers announce it as "button" with no context (WCAG 4.1.2: Name, Role, Value). |
| 2 | **P2** | Feedback & Loading | Show a visible error message for invalid credentials. auth.spec.ts notes that no clear error message appears after wrong password — only the page stays on sign-in. Add a toast or inline error (Nielsen #9: Help users recognize errors). |
| 3 | **P3** | Forms & Validation | Add autocomplete attributes. Domain, email, and password fields lack `autocomplete` attributes — browsers can't offer saved credentials (WCAG 1.3.5: Identify Input Purpose). |

## Global References

See G.1 — unlabeled icon button (password toggle).

## Business Logic Findings

| # | Severity | Bug Ref | Finding |
|---|----------|---------|---------|
| BL-1 | High | BUG-012 | Employee creation (`POST /api/tenant/employee`) returns 500. If new tenant employees cannot be created via the API, they have no credentials to log in with. This means the login page is only accessible to the initial tenant admin account — any team member onboarding flow is broken. |
| BL-2 | Medium | — | The login form requires three fields: domain, email, and password. The "domain" field is unusual for a SaaS login — it implies a multi-tenant architecture where the same email can exist in different tenants. There is no validation feedback if the domain does not exist (the form likely just returns an auth error indistinguishable from wrong credentials). Users who mistype their domain will not understand why valid credentials fail. |
| BL-3 | Low | — | No "Forgot password" / password reset flow is visible on the login page or linked from it. For an internal ERP system this may be intentional (admin resets), but the omission should be confirmed as a design decision rather than a missing feature. |
