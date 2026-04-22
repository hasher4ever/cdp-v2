# Scenario Builder — Test Coverage

**Source:** `page_crawl/scenario-builder.md` (crawled 2026-03-30)
**Spec:** tests_e2e/specs/scenarios.spec.ts
**Coverage:** 19/21 (90%)
**Last updated:** 2026-03-29

## Elements

| # | Element | Type | Tested? | Test Location | Priority | Notes |
|---|---------|------|---------|---------------|----------|-------|
| 1 | "Сценарий:" label | text | No | — | 0 | Decorative label, not worth testing |
| 2 | Scenario name input | input | Yes | L1:should display scenario name textbox, L2:should allow editing | 3 | |
| 3 | Save button | button | Yes | L1:should display Save button, L3:save scenario name change | 5 | BUG-029: returns 500 |
| 4 | Cancel button | button | Yes | L1:should display Cancel button | 3 | |
| 5 | Triggers heading | text | Yes | L1:should display node palette with Triggers heading | 0 | |
| 6 | Trigger now | button | Yes | L2:should have interactive Trigger now, L4:all 7 palette items | 4 | |
| 7 | Trigger on date | button | Yes | L4:should display all 7 node palette items | 4 | |
| 8 | Trigger on event | button | Yes | L4:should display all 7 node palette items | 4 | |
| 9 | Actions heading | text | Yes | L1:should display node palette with Actions heading | 0 | |
| 10 | Email | button | Yes | L2:should have interactive Email, L4:all 7 palette items | 4 | |
| 11 | Webhook | button | Yes | L4:should display all 7 node palette items | 4 | |
| 12 | Operators heading | text | Yes | L1:should display node palette with Operators heading | 0 | |
| 13 | Wait | button | Yes | L2:should have interactive Wait, L4:all 7 palette items | 4 | |
| 14 | Branch | button | Yes | L4:should display all 7 node palette items | 4 | |
| 15 | Canvas (React Flow) | application | Yes | L1:should display React Flow canvas, L3:render nodes/edges | 5 | |
| 16 | Zoom In | button | Yes | L1:should display Zoom In, L2:should respond to click | 2 | |
| 17 | Zoom Out | button | Yes | L1:should display Zoom Out, L2:should respond to click | 2 | |
| 18 | Fit View | button | Yes | L1:should display Fit View, L2:should respond to click | 2 | |
| 19 | Toggle Interactivity | button | Yes | L4:canvas functional after toggling | 2 | |
| 20 | Mini Map | img | Yes | L2:should display Mini Map | 1 | |
| 21 | Drag-drop node to canvas | — | No | — | 6 | Requires complex drag simulation, deferred |

## Top Untested (by priority)

1. **Drag-drop node to canvas** (#21) — P6 — Requires Playwright drag-and-drop to React Flow canvas coordinates; deferred to next iteration

## Bugs Found

- **BUG-029** (High): Save returns 500 when renaming scenario
- **BUG-030** (Medium): Empty scenario name accepted without validation
