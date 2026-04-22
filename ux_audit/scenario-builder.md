# Scenario Builder — UX Findings

**Source:** `page_crawl/scenario-builder.md` (crawled 2026-03-30)
**Audited:** 2026-03-30

## Findings

| # | P | Category | Proposition |
|---|---|----------|-------------|
| 1 | **P1** | Feedback & Loading | Add save confirmation feedback. The "Сохранить сценарий" button gives no visible success/error feedback after click — users can't tell if their scenario was saved (Nielsen #1: Visibility of system status). |
| 2 | **P2** | Navigation | Add a back/breadcrumb navigation to return to the scenario list. Currently users must use sidebar or browser back — the builder page has no explicit return path (Nielsen #3: User control and freedom). |
| 3 | **P2** | Accessibility | Add `aria-label` to all node palette items. "Trigger now", "Email", "Wait" etc. are generic elements, not semantic buttons — ensure they have proper roles and labels for drag-and-drop (WCAG 4.1.2). |
| 4 | **P3** | Visual Hierarchy | Label the node palette groups more prominently. "Triggers", "Actions", "Operators" headings are plain text — use visual grouping (borders, backgrounds) to distinguish sections (Nielsen #6: Recognition rather than recall). |

## Global References

See G.1 — unlabeled icon buttons (control panel buttons have labels but palette items may not).

## Business Logic Findings

| # | Severity | Bug Ref | Finding |
|---|----------|---------|---------|
| BL-1 | High | BUG-017, BUG-029 | Save endpoint (`POST /api/tenant/scenario/crud/save-changes`) returns 500 for any scenario that has nodes/edges, and also 500 when the user renames a scenario before saving. The "Сохранить сценарий" button is the primary action on this page — a 500 response means the core workflow is broken. No fallback or retry logic visible in UI. |
| BL-2 | High | BUG-015 | Scenario name field accepts and stores HTML/script tags without sanitization. Input like `<script>alert(1)</script>` is accepted by the backend (200) and stored as-is. When the scenario list renders names, this creates a stored XSS vector. Client-side input filtering on the name field would prevent this class of attack. |
| BL-3 | Medium | BUG-016 | Wait node (`node_wait`) accepts `durationMin: 0` and negative values (e.g., `-5`). The backend returns 200 and persists these invalid states. A wait of zero or negative minutes is logically meaningless in an automation flow. The node configuration panel should enforce `durationMin >= 1` before allowing the edge to be drawn or the scenario to be saved. |
| BL-4 | Medium | BUG-018 | Edge creation endpoint accepts `fromNodeId`/`toNodeId` values that do not correspond to any node in the scenario. The backend stores edges with dangling references (200). This creates invisible invalid graph state that could cause undefined behavior at execution time. The UI should only allow edges to be drawn between existing canvas nodes — this is standard React Flow behavior and should already be enforced, but the backend has no guard. |
| BL-5 | Medium | BUG-030 | The name input field has no client-side validation. Clearing the field and clicking Save submits an empty string to the backend. The builder page should block submission with a visible inline error when the name is empty or whitespace-only (related: BUG-014 — backend also accepts whitespace-only names). |
| BL-6 | Low | BUG-014 | Whitespace-only scenario names (e.g., `"   "`) are accepted by the backend and stored. If the UI ever trims displayed names, such scenarios become invisible in the list. Name field should trim and validate before submit. |
| BL-7 | Low | CLAUDE.md | The node palette exposes `node_branch` (Branch node) but the crawl reveals no configuration panel for branch predicates. According to the domain model, `branchNode` requires a `predicate` object (same model as segmentation). If the config panel is absent or not reachable, users cannot define split conditions — the Branch node is non-functional from the UI. Needs verification by opening a branch node on canvas. |
| BL-8 | Low | CLAUDE.md | Email and Webhook action nodes (`node_action`) require `commChanId` and `templateId` configuration. No action node config panel was observed in the crawl. If these panels are missing, action nodes cannot be configured from the UI — scenarios would be structurally incomplete but still saveable (given BL-5 above). |
