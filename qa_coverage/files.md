# Files — Test Coverage

**Source:** `page_crawl/files.md` (crawled 2026-03-30)
**Spec:** tests_e2e/specs/files.spec.ts (23 tests — 4 legacy + 9 L1-L2 @generated + 10 L3-L4 @generated)
**Coverage:** 5/5 (100%)

## Elements

| # | Element | Type | Tested? | Test Location | Priority | Notes |
|---|---------|------|---------|---------------|----------|-------|
| 1 | File picker label | text | Yes | files.spec.ts L2 @generated | 1 | `getByText("Выберите файл")` |
| 2 | File picker button | button | Yes | files.spec.ts L1+L2+L3+L4 @generated | 3 | `getByRole("button", { name: "Выберите файл" })` — accessible name differs from inner text |
| 3 | Upload button (disabled) | button | Yes | files.spec.ts L1+L2+L3+L4 @generated | 3 | Disabled state, enable after file select, upload click, double-click |
| 4 | No heading | — | Yes | files.spec.ts L1 @generated | 2 | `getByRole("heading", { level: 1 })` count === 0 |
| 5 | No file list | — | Yes | files.spec.ts legacy | 3 | Legacy test covers absence; confirmed no table |

## Coverage History

| Run | Depth | Tests Added | Passing | Notes |
|-----|-------|-------------|---------|-------|
| 2026-03-29 | L1+L2 | 9 | 9/9 | Fix attempt 1: button accessible name is "Выберите файл" not "Нажмите, чтобы выбрать файл" |
| 2026-03-30 | L3+L4 | 10 | 10/10 | All passed on first attempt; no bugs found |

## L3+L4 Test Summary

### L3 — Data Flow (4 tests)
- Selecting a CSV file enables the upload button
- Selected filename is displayed on the page
- Clicking upload sends a network request
- Upload button state after upload completes

### L4 — Edge Cases (6 tests)
- Zero console errors on page load
- Empty (0-byte) file selection — no crash
- Non-CSV file (txt) selection — no crash
- Very long filename (200 chars) — no UI overflow crash
- Re-selecting a different file updates displayed filename
- Rapid double-click on upload — no duplicate requests

## Key Finding

The file picker `<button>` accessible name is **"Выберите файл"** (the wrapping label text), not **"Нажмите, чтобы выбрать файл"** (the visible inner text). Use `getByRole("button", { name: "Выберите файл" })` as the selector.
