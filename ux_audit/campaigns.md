# Campaigns — UX Findings

**Source:** `page_crawl/campaigns.md` (crawled 2026-03-30)
**Screenshot:** `page_crawl/campaigns.png`
**Audited:** 2026-03-30

## Findings

| # | P | Category | Proposition |
|---|---|----------|-------------|
| 1 | **P2** | Forms & Validation | Show which fields are required before submission. The creation form marks 4 fields with asterisks (*) in labels but provides no visual legend or explanation. Add a note: "* Required field" or use consistent red asterisks (WCAG 3.3.2: Labels or Instructions). |
| 2 | **P2** | Feedback & Loading | Clarify why "Включить сегменты" and "Исключить сегменты" are disabled. The placeholder "Сначала выберите канал коммуникации" is only visible if user focuses the field — add a visible helper text or grey-out the entire section with explanation (Nielsen #1: Visibility of system status). |
| 3 | **P2** | Forms & Validation | Clarify why Preview button is disabled. No tooltip or message explains what needs to be completed first — add a tooltip: "Fill all required fields to preview campaign reach" (Nielsen #10: Help and documentation). |
| 4 | **P2** | Data Display | Add pagination or virtual scroll for the campaigns table. All campaigns load at once — with growth this will degrade performance and scrollability (Nielsen #7: Flexibility and efficiency). |
| 5 | **P3** | Consistency | Add a No-Delete confirmation. The context menu only shows "Редактировать" — if campaigns can be deleted, add the option. If deletion is intentionally blocked, document why (Nielsen #3: User control and freedom). |
| 6 | **P3** | Data Display | Truncate or format UUID column. Full UUIDs consume ~50% of table width and are rarely useful for end users — consider showing first 8 chars with copy-on-click (Nielsen #8: Aesthetic and minimalist design). |

## Global References

See G.1 — unlabeled icon buttons (three-dot menu icons per row).

## Business Logic Findings

| # | Severity | Bug Ref | Finding |
|---|----------|---------|---------|
| BL-1 | Medium | BUG-009 | Campaign DELETE is available per the OpenAPI spec (DELETE for campaign returns 200 per bugs.md notes), but the three-dot context menu only shows "Редактировать" (Edit) — no Delete option. Users have no way to remove campaigns from the UI. This is a missing feature in the frontend, not a backend limitation. |
| BL-2 | Medium | BUG-009 | The communication channel (Канал коммуникации) referenced in campaign creation cannot be deleted (`DELETE /api/tenants/commchan/{id}` returns 400) and cannot be updated (`PUT /api/tenants/commchan/{id}` returns 400 per BUG-011). This means a campaign created with a misconfigured channel has no repair path — users must create a new channel and recreate the campaign. |
| BL-3 | Medium | BUG-009 | Templates also cannot be deleted (`DELETE /api/tenant/template/{id}` returns 400). With 60+ campaigns in the list and no cleanup path for templates, the template dropdown in the creation form will grow unbounded, making selection increasingly difficult. |
| BL-4 | Medium | — | The "Включить сегменты" (Include segments) and "Исключить сегменты" (Exclude segments) dropdowns remain disabled with the hint "Сначала выберите канал коммуникации" (First select a communication channel). However, the domain model requires a segmentation selection first (`Сегментация *` is required), then segments within it. The dependency message references the wrong prerequisite — it says "select channel" but the segments dropdown likely depends on the segmentation selection, not the channel. This mismatch will confuse users about what to fill in first. |
| BL-5 | Low | BUG-008 | Campaign list loads all records at once (`GET /api/tenants/campaign?page=0&size=100`). With 60+ campaigns already visible and no pagination, this will degrade as campaigns accumulate. The v2 customer data API (BUG-008) shows that even with pagination, non-deterministic ordering causes row overlap — campaigns should implement server-side pagination with explicit sort to avoid this class of issue. |
| BL-6 | Low | — | Preview button ("Предпросмотр") is disabled until the form is complete. No tooltip explains what is missing. The campaign preview should call a preview endpoint to estimate reach (number of customers in included segments minus excluded). If preview is not backed by an API call, the button is cosmetic only — this should be verified. |
