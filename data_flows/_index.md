# Data Flow Maps — Index

Synthesized from `docs/BACKEND-SPEC.md`, `docs/QA-HANDBOOK.md`, and `bugs.md`.
Use these maps as the authoritative reference for `/qa-autopilot` test planning and `/qa-nightshift` test writing.

---

## Flows

| File | Flow | Description |
|------|------|-------------|
| [customer-lifecycle.md](customer-lifecycle.md) | Customer Data Lifecycle | Full path from schema declaration through data ingestion (API and file upload), querying (v1/v2), to segmentation preview and save. Covers known bugs at the autocomplete and preview steps (BUG-001, BUG-003). |
| [udaf-lifecycle.md](udaf-lifecycle.md) | UDAF Lifecycle | Create UDAF → async materialization wait → calculate per customer → use in segmentation predicates. Covers timing nondeterminism, the RELATIVE time window bug (BUG-002), null SUM results (BUG-006), and inconsistent result casing. |
| [campaign-lifecycle.md](campaign-lifecycle.md) | Campaign Lifecycle | Create comm channel → verify → create template → create segmentation → create campaign, with optional Scenario Builder extension (trigger → wait → branch → action nodes and edges). Covers full entity dependency graph. |

---

## Key Cross-Flow Dependencies

- **Schema must precede all data operations.** Fields declared after ingestion are silently dropped (not retroactively applied).
- **UDAF materialization must complete before segmentation counts are reliable.** A segment preview that references a UDAF will show wrong counts if run before the UDAF has materialized.
- **Campaign targeting depends on a saved segmentation.** Segmentation depends on customer fields (and optionally UDAFs). The full chain is: schema → ingest → UDAF → segment → campaign.
- **Internal column names are tenant-specific.** Never hardcode `col__xxx` values across flows — always resolve from the schema API using `custField()` / `evtField()` helpers.

---

## Known Bugs Summary

| Bug ID | Severity | Affected Flow | Short Description |
|--------|----------|---------------|-------------------|
| BUG-001 | Medium | Customer Lifecycle (step 10) | Event autocomplete returns 500; customer autocomplete works |
| BUG-002 | High | UDAF Lifecycle (step 4) | RELATIVE time window UDAFs always return 0 |
| BUG-003 | Low | Customer Lifecycle (step 11) | Segmentation preview accepts empty name |
| BUG-005 | Low | UDAF Lifecycle | No DELETE endpoint for UDAFs; test UDAFs pollute shared tenant UI |
| BUG-006 | High | UDAF Lifecycle (step 3–4) | SUM on total_quantity returns null for specific customers (Bob) |
