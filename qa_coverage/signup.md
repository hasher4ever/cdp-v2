# Registration — Test Coverage

**Source:** `page_crawl/signup.md` (crawled 2026-03-30)
**Spec:** tests_e2e/specs/auth.spec.ts (15 tests cover registration)
**Coverage:** 3/3 (100%)

## Elements

| # | Element | Type | Tested? | Test Location | Priority | Notes |
|---|---------|------|---------|---------------|----------|-------|
| 1 | Registration form fields | input | Yes | auth.spec.ts — pre-existing L140-144 | 0 | Count >= 2 |
| 2 | Sign-in link | link | Yes | auth.spec.ts — pre-existing L147-158 | 0 | |
| 3 | Specific field labels/placeholders | input | Yes | auth.spec.ts @generated L1+L2 | 2 | Имя, Фамилия, Домен, Названия, Электронная почта, Пароль, Повторите пароль — all individually asserted |
| 4 | Submit button Зарегистрироваться | button | Yes | auth.spec.ts @generated L2 | 1 | |
| 5 | Page heading | text | Yes | auth.spec.ts @generated L1 | 0 | "Регистрация нового аккаунта" |
| 6 | Field count (exactly 7) | form | Yes | auth.spec.ts @generated L2 | 2 | |

## Notes

- Pароль field requires `{ exact: true }` because "Пароль" is a substring of "Повторите пароль" — Mantine PasswordInput strict-mode trap (documented in QA_WRITE_LOG.md Known Framework Quirks)
- Password fields are `type="password"` but exposed as `role="textbox"` via Mantine PasswordInput accessible wrapper
