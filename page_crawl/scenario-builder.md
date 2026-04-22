# Scenario Builder (`/data/scenario/{uuid}`)

**Last crawled:** 2026-03-30
**Stale after:** 7 days

## Structure

Visual flow builder using React Flow. Header with editable scenario name + Save/Cancel buttons. Left sidebar with draggable node palette (Triggers, Actions, Operators). Main canvas with nodes, edges, and control panel (Zoom, Fit, Interactivity). Mini map at bottom right.

## Elements

| # | Element | Type | Label / Text | State | Notes |
|---|---------|------|-------------|-------|-------|
| 1 | "Сценарий:" label | text | Сценарий: | — | |
| 2 | Scenario name input | input | {scenario name} | — | Inline editable |
| 3 | Save button | button | Сохранить сценарий | enabled | |
| 4 | Cancel button | button | Отменить изменения | enabled | |
| 5 | Triggers group | text | Triggers | — | Palette heading |
| 6 | Node: Trigger now | button | Trigger now | — | Draggable |
| 7 | Node: Trigger on date | button | Trigger on date | — | Draggable |
| 8 | Node: Trigger on event | button | Trigger on event | — | Draggable |
| 9 | Actions group | text | Actions | — | Palette heading |
| 10 | Node: Email | button | Email | — | Draggable |
| 11 | Node: Webhook | button | Webhook | — | Draggable |
| 12 | Operators group | text | Operators | — | Palette heading |
| 13 | Node: Wait | button | Wait | — | Draggable |
| 14 | Node: Branch | button | Branch | — | Draggable |
| 15 | Canvas (React Flow) | application | — | — | SVG nodes + edges |
| 16 | Zoom In | button | Zoom In | — | Control panel |
| 17 | Zoom Out | button | Zoom Out | — | Control panel |
| 18 | Fit View | button | Fit View | — | Control panel |
| 19 | Toggle Interactivity | button | Toggle Interactivity | — | Control panel |
| 20 | Mini Map | img | Mini Map | — | |
| 21 | React Flow attribution | link | React Flow | — | Links to reactflow.dev |

## Page Health

**Console errors:** None
