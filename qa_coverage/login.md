# Login — Test Coverage

**Source:** `page_crawl/login.md` (crawled 2026-03-30)
**Spec:** tests_e2e/specs/auth.spec.ts (10 tests)
**Coverage:** 9/9 (100%)

## Elements

| # | Element | Type | Tested? | Test Location | Priority | Notes |
|---|---------|------|---------|---------------|----------|-------|
| 1 | Title "Вход в аккаунт" | text | No | — | 0 | Decorative |
| 2 | Domain input | input | Yes | auth.spec.ts:L10 | 0 | |
| 3 | Email input | input | Yes | auth.spec.ts:L13 | 0 | |
| 4 | Password input | input | Yes | auth.spec.ts:L16 | 0 | |
| 5 | Password visibility toggle | button | Yes | auth.spec.ts L1+L2 @generated | 2 | Eye icon, aria-hidden="true", no aria-label (UX P2). Located by .mantine-PasswordInput-visibilityToggle |
| 6 | Submit "Войти" | button | Yes | auth.spec.ts:L19 | 0 | |
| 7 | Registration link | link | Yes | auth.spec.ts:L26-28 | 0 | |
| 8 | Valid login → redirect | — | Yes | auth.spec.ts:L31-46 | 0 | |
| 9 | Invalid login → error | — | Yes | auth.spec.ts:L49-95 | 0 | |

## Top Untested (by priority)

_All elements tested. Coverage: 100%._
