# Files — UX Findings

**Source:** `page_crawl/files.md` (crawled 2026-03-30)
**Audited:** 2026-03-30

## Findings

| # | P | Category | Proposition |
|---|---|----------|-------------|
| 1 | **P1** | Navigation & Wayfinding | Add a page heading. Every other page in the app has a heading — Files is the only page without one. Users can't confirm they're on the right page (Nielsen #6: Recognition rather than recall). |
| 2 | **P2** | Forms & Validation | Explain why the Upload button is disabled. No tooltip or helper text indicates "Select a file first" — add visible helper text (Nielsen #1: Visibility of system status). |
| 3 | **P2** | Feedback & Loading | Add upload progress feedback. After file selection, users need progress indication (bar, percentage, spinner) during upload (Nielsen #1: Visibility of system status). |
| 4 | **P2** | Empty & Error States | Show previously uploaded files. No file list or history is visible — users can't see or manage past uploads. Add a file list below the upload area (Nielsen #6: Recognition rather than recall). |
| 5 | **P3** | Forms & Validation | Add drag-and-drop support. The upload area only supports click-to-choose — add a visible drop zone for file drag-and-drop, which is the standard expectation (Nielsen #4: Consistency and standards). |

## Global References

None specific.

## Business Logic Findings

| # | Severity | Finding | Reference |
|---|----------|---------|-----------|
| 1 | High | The "Send data" (Отправить данные) button calls `POST /api/tenants/data/file/keys`, which is a stub returning `{"debug":"implement me","error":"internal server error"}`. The button is visible and clickable in the UI but the backend handler is not implemented. Users who paste CSV data and click Send receive a silent failure or raw 500 error with no explanation. | BUG-013 |
| 2 | High | File upload uses an undocumented 3-step chunked protocol (`/api/file/upload/init` → `/api/file/upload/part` → `/api/file/upload/complete`) that is not in the OpenAPI spec. The page shows no progress indicator, no success confirmation, and no error state during this multi-step flow. If any step fails silently, the upload is lost with no recovery path. | CLAUDE.md — Two Data Ingestion Paths |
| 3 | Medium | No upload history or file list is shown. After uploading a file, users have no way to confirm it was received, see prior uploads, check import status, or re-download. The page resets to its initial state after upload with no record of what was ingested. | page_crawl/files.md — No file list (element #5) |
| 4 | Low | The page has no page heading. All other data pages (`/data/clients`, `/data/events/{id}`) display a heading ("Клиенты", "События purchase") that identifies the current context. The files page is the only page in the app with no `<h1>`, making wayfinding and screen-reader navigation harder. | page_crawl/files.md — No heading (element #4) |
