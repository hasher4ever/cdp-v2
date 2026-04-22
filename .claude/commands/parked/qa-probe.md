---
name: qa-probe
description: Component interaction specialist. Call when an AI agent encounters an unknown UI component and needs to discover how it works. Probes with multiple interaction strategies, caches recipes. Check component_recipes/_index.md first — if cached, just read the file.
---

# `/qa-probe` — Component Interaction Specialist

**What:** On-demand specialist that probes unknown UI components, discovers their interaction recipes, and caches results.

**When to call:** Any AI agent (qa-write, qa-flows --explore, qa-nightshift) encounters a component it doesn't know how to interact with. Instead of guessing and retrying, call this skill.

**Not a pipeline step.** A callable function with cached results.

## Invocation

```
/qa-probe {page-route} {component-description}
```

Examples:
```
/qa-probe /all-loads-board "address combobox in new load dialog"
/qa-probe /team-management "driver multi-select combobox"
/qa-probe /audit "daily status combobox per driver"
```

## Procedure

### Step 0: Check Cache

1. Read `component_recipes/_index.md`
2. If component matches an existing entry → read the recipe file → return it inline → DONE
3. If no match → proceed to Step 1

### Step 1: Navigate & Locate

1. Navigate to `{page-route}` via `mcp__playwright__browser_navigate`
2. Wait for page load (3s or key element)
3. **Snapshot to file** via `mcp__playwright__browser_snapshot(filename: "component_recipes/.cache/{page}-baseline.md")` — NEVER inline. Read only the section around the target component (~20-30 lines).
4. Locate component matching `{component-description}` in the file
5. If component requires pre-steps to reach (open dialog, expand section, click tab):
   - Infer from description and page context
   - Execute pre-steps first
   - Re-snapshot to file after each pre-step
6. Record the **ref** of the target component
7. Record baseline DOM state (the ~20 lines around the component from the snapshot file)
8. Record baseline network state via `mcp__playwright__browser_network_requests(filename: "component_recipes/.cache/{page}-network.md")`

### Step 2: Probe — Interaction Matrix

Execute each action on the component, then immediately:
- Snapshot to file: `browser_snapshot(filename: "component_recipes/.cache/{page}-probe-{N}.md")` — NEVER inline
- Read only the ~20 lines around the target component from the snapshot file to check for changes
- Check network requests via `browser_network_requests(filename: "component_recipes/.cache/{page}-network-{N}.md")`
- Classify result by comparing against baseline file
- Reset component to baseline before next probe (Escape, clear, navigate back if needed)

**Standard probe sequence:**

```
1. click                    → snapshot + network → classify
2. fill "test123"           → snapshot + network → classify
3. fill "test123" + Enter   → snapshot + network → classify
4. fill "test123" + Tab     → snapshot + network → classify
5. fill "test123" + wait 2s → snapshot + network → classify
6. Escape                   → snapshot → classify (reset check)
```

**Additional probes for combobox-type components:**

```
7. click arrow/chevron icon → snapshot → classify
8. fill single char "t"     → snapshot + network → classify
9. fill 3+ chars "tes"      → snapshot + network → classify
```

**Additional probes for button-type components:**

```
7. hover                    → snapshot → classify (tooltip?)
8. right-click              → snapshot → classify (context menu?)
9. double-click             → snapshot → classify
```

### Step 3: Classify Each Result

| Code | Meaning | How to detect |
|------|---------|---------------|
| NO_CHANGE | Action had no visible effect | Snapshot identical to baseline |
| DOM_CHANGE | New elements appeared | New elements in snapshot (dropdown, modal, tooltip, validation) |
| NETWORK | API call fired | New request in network log |
| NAVIGATION | URL changed | Page URL differs |
| STATE_CHANGE | Existing element changed | Element text, attributes, or visibility changed |
| ERROR | Console error or crash | Error in page events |

### Step 4: Build Recipe

From probe results, construct:

1. **Working recipe**: The action sequence that produced the desired result (DOM_CHANGE + NETWORK for API components, DOM_CHANGE for pure UI)
   - Order the steps: what must happen first, what triggers the API, what completes the interaction
   - Note timing: how long to wait between steps

2. **Anti-patterns**: Actions that produced NO_CHANGE
   - These are the "traps" — what a naive agent would try and fail

3. **API details** (if NETWORK detected):
   - Endpoint URL from network log
   - Approximate latency
   - What triggers it (which action in the sequence)

4. **Playwright snippet**: Translate working recipe into copy-pasteable Playwright code

5. **Dependencies**: What must be true before this component is reachable
   - Dialog open? Tab selected? Section expanded? Page scrolled?

6. **Component type classification**:

| Type | Signature |
|------|-----------|
| `searchable-combobox-api` | fill + keypress → NETWORK → DOM_CHANGE (dropdown) |
| `searchable-select` | fill filters existing options (no NETWORK) |
| `simple-select` | click → DOM_CHANGE (options appear immediately) |
| `inline-assign` | click cell → dropdown → select → NETWORK (auto-save) |
| `multi-chip-select` | select adds chip, X removes |
| `date-picker` | click → calendar widget |
| `file-upload` | click → file dialog or drag target |
| `toggle` | click → STATE_CHANGE, maybe NETWORK |
| `expandable` | click → DOM_CHANGE (children appear) |
| `text-input` | fill works, may validate on blur |
| `text-input-validated` | fill + blur → DOM_CHANGE (validation message) |

### Step 5: Write Recipe File

Write to `component_recipes/{page-slug}/{component-slug}.md`:

```markdown
---
page: {route}
component: {slug}
parent: {parent element description or selector}
selector: {how to find this component}
type: {classified type from Step 4}
probed: {date}
---

# Recipe

1. {action 1}
2. {action 2}          # {annotation if needed}
3. {action 3}

# Anti-patterns

| action | result |
|--------|--------|
| {failed action} | {what happened — nothing, wrong behavior} |

# API

- trigger: {what action fires the API}
- endpoint: {URL}
- latency: {approximate ms}

# Playwright

```ts
{copy-pasteable working code}
```

# Depends

- {precondition 1}
- {precondition 2}
```

### Step 6: Update Index

Append row to `component_recipes/_index.md`:

```markdown
| {component} | {page} | {type} | {page-slug}/{component-slug}.md |
```

Create `_index.md` if it doesn't exist:

```markdown
# Component Recipe Index

| component | page | type | file |
|-----------|------|------|------|
```

### Step 7: Return Recipe

Return the recipe content inline so the calling agent can use it immediately without a separate file read.

## Rules

1. **Cache first.** Always check `_index.md` before probing. Never re-probe a cached component.
2. **Don't submit forms.** Probe individual components, not full flows. Use minimal test input ("test123", "Chi", "5551234567"). Don't click Save/Submit/Create.
3. **Reset after each probe.** Press Escape, clear inputs, navigate back if needed. Leave the page in a clean state.
4. **Record anti-patterns.** What doesn't work is as valuable as what does. Saves future agents from retry loops.
5. **Playwright snippet is mandatory.** Every recipe must include a working code snippet. This is the primary output test writers consume.
6. **Minimal token output.** No prose, no explanations beyond what's in the structured format. AI consumers don't need paragraphs.
7. **One component per invocation.** If the caller needs multiple components probed, they call multiple times.
8. **Network requests reveal integrations.** Always check network after interactions — this catches hidden API calls that aren't visible in the DOM.

## Output Paths

| Output | Path |
|--------|------|
| Recipe index | `component_recipes/_index.md` |
| Per-component recipe | `component_recipes/{page-slug}/{component-slug}.md` |

## Context Hygiene — CRITICAL

**NEVER let a full page snapshot land in context.** Always use `filename` parameter.

```
# WRONG — 300+ lines of YAML in context
browser_snapshot()

# RIGHT — 0 lines in context, read selectively
browser_snapshot(filename: "component_recipes/.cache/{page}-probe-{N}.md")
Read("component_recipes/.cache/{page}-probe-{N}.md", offset: {component_line}, limit: 20)
```

- Don't read entire discovery files. The caller already knows which component to probe.
- After each probe action, only read the ~20 lines around the target component — not the whole snapshot.
- Network request log: save to file, diff against baseline file to find NEW requests only.
- Recipe files are ~30-50 lines. Keep them tight.
- Cache files in `component_recipes/.cache/` are ephemeral — don't version them.
