# Dashboard — UX Findings

**Source:** `page_crawl/dashboard.md` (crawled 2026-03-30)
**Screenshot:** `page_crawl/dashboard.png`
**Audited:** 2026-03-30

## Findings

| # | P | Category | Proposition |
|---|---|----------|-------------|
| 1 | **P2** | Feedback & Loading | Add visual feedback when copy-to-clipboard buttons are clicked. Currently 7 copy icons give no confirmation toast or "Copied!" indicator — users can't tell if the action succeeded (Nielsen #1: Visibility of system status). |
| 2 | **P2** | Data Display | Display the tenant ID in sidebar in a readable format. "cdp_1762934640267" is truncated with ellipsis ("cdp_17629...") — use a tooltip on hover to reveal the full value, or show the short tenant name instead (Nielsen #7: Flexibility and efficiency). |
| 3 | **P2** | Accessibility | Add `aria-label` attributes to the copy icon buttons. Screen readers announce them as unnamed buttons — there are 7 on the Artifacts tab alone (WCAG 4.1.2: Name, Role, Value). |
| 4 | **P3** | Data Display | Differentiate system fields from custom fields visually in the Customer Schema tab. System fields (cdp_created_at, primary_id) have disabled edit buttons but look identical otherwise — use a row background color, an icon, or a "System" badge (Nielsen #6: Recognition rather than recall). |
| 5 | **P3** | Consistency | Use consistent naming between display names and API names. "customer first name" (lowercase) vs "Customer Primary ID" (Title Case) — normalize to one capitalization convention (Nielsen #4: Consistency and standards). |
| 6 | **P3** | Data Display | Show field count in the Customer Schema tab header. Currently 19 fields with no count indicator — "Поля схемы клиента (19)" would help orientation (Nielsen #1: Visibility of system status). |
| 7 | **P2** | Forms & Validation | Clarify the purpose of "Применить черновики" and "Отменить черновики" buttons. They appear disabled with no explanation of what draft state they refer to or how to enable them — add a tooltip: "No pending schema changes" (Nielsen #10: Help and documentation). |
| 8 | **P3** | Visual Hierarchy | Add a page-level description or help text under the "Панель управления" heading. New users land here without understanding what the tabs represent or what "Артефакты арендатора" means in context (Nielsen #10: Help and documentation). |

## Global References

None yet — first page audited.

## Business Logic Findings

| # | Severity | Category | Finding |
|---|----------|----------|---------|
| BL-01 | **High** | Bug Impact | Templates created from the "Создать шаблон" (Create Template) tab cannot be deleted. `DELETE /api/tenant/template/{id}` returns 400 (BUG-009). The dashboard is the only place to manage templates; a template created in error is permanently stuck in the list with no removal path. |
| BL-02 | **High** | Bug Impact | The schema draft system has no observable state. The "Применить черновики" and "Отменить черновики" buttons are always disabled and the UI provides no indication of when draft state exists. The underlying API (`GET /api/tenants/schema/draft-schema/status`) is called on load but its response is never surfaced to the user (no count of pending drafts, no "0 pending changes" label). This violates the tenant-admin workflow: an admin cannot know if a draft schema is waiting for application. |
| BL-03 | **Medium** | Missing State | The dashboard Artifacts tab has no degraded-state UI for `isReady: false`. All seven infrastructure items (DB, loading jobs, tables, topics) are shown with a green check — but there is no rendering path for a failing/pending tenant (red icon, warning banner, or retry button). A newly provisioned tenant that fails mid-setup would appear identically to a healthy one. |
| BL-04 | **Medium** | Bug Impact | Employee creation (`POST /api/tenant/employee`) returns 500 (BUG-012). The dashboard is the tenant administration panel; if the admin role cannot create employee accounts, the entire multi-user access workflow is blocked. No UI entry point for employee management is visible on this page, but the entity is a first-class domain concept documented in CLAUDE.md. This is a missing feature gap on the dashboard. |
| BL-05 | **Medium** | Missing Coverage | The "Конкретные сопоставления полей" (Field Mappings) tab (Tab 4, element #15) has no business logic validation. The tab switch is tested but the mapping content is untested (noted in qa_coverage). Field mappings govern how ingest data maps to schema columns — errors here would silently corrupt customer/event data without any observable test failure on the dashboard. |
| BL-06 | **Low** | Entity Mapping | The sidebar live count for Клиенты (342 279) is sourced from `GET /api/tenant/data/count`. This count is not cross-validated against the v2 data query row count (`POST /api/v2/tenant/data/customers`). BUG-008 shows the v2 pagination is non-deterministic without orderBy; the sidebar count may diverge from what the Clients page actually displays, creating an inconsistent tenant-facing number. |
