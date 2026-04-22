# Campaign Lifecycle

## Steps

1. **Create Communication Channel** — `POST /api/tenants/comm-channels` (or equivalent comm channel endpoint) — Register the delivery channel (email SMTP config or webhook URL). The channel must exist before templates can reference it.
   - Input: `{ "type": "email", "name": "...", "config": { ... } }`
   - Output: `{ "id": "<commChanId>", "type": "email", ... }`
   - Dependency: None (first entity in the chain).
   - Known bugs: none

2. **Verify Communication Channel** — `POST /api/tenants/comm-channels/{id}/verify` — Confirm the channel credentials work (SMTP connection test, webhook reachability). Campaigns cannot send until the channel is verified.
   - Input: `{ "id": "<commChanId>" }`
   - Output: `{ "verified": true }` or error
   - Notes: Verification hits the external service; test environments may need a mock or skippable verification.
   - Known bugs: none

3. **Create Message Template** — `POST /api/tenants/comm-channels/{commChanId}/templates` (or equivalent) — Define the email or webhook payload template for the campaign.
   - Input: `{ "name": "...", "subject": "...", "body": "..." }`
   - Output: `{ "id": "<templateId>", "commChanId": "<commChanId>", ... }`
   - Dependency: Communication channel (`commChanId`) must exist first.
   - Known bugs: none

4. **Create Segmentation** — `POST /api/tenants/segmentation` — Define the target audience. The segment provides the customer list that the campaign sends to.
   - Input: `{ "name": "...", "segments": [{ "name": "...", "customerProfileFilter": { ... } }] }`
   - Output: `{ "id": "<segmentationId>", ... }`
   - Dependency: Customer fields and any referenced UDAFs must already be materialized.
   - Notes: Run a preview (`POST /api/tenants/segmentation/preview`) first to confirm expected counts before saving.
   - Known bugs: BUG-003 — preview accepts empty `name` (low severity, validation inconsistency).

5. **Create Campaign** — `POST /api/tenants/campaigns` (or equivalent) — Link a segment to a channel + template and schedule delivery.
   - Input: `{ "name": "...", "segmentationId": "<id>", "commChanId": "<id>", "templateId": "<id>", ... }`
   - Output: `{ "id": "<campaignId>", ... }`
   - Dependency: Communication channel (verified), template, and segmentation must all exist.
   - Known bugs: none

6. **[Optional] Create Scenario** — `POST /api/tenant/scenario/crud` — Build an automation flow (trigger → wait → branch → action) that wraps campaign delivery logic.
   - Input: `{ "name": "...", "description": "..." }`
   - Output: `{ "id": "<scenarioId>", ... }`

7. **[Optional] Add Scenario Nodes** — `POST /api/tenant/scenario/node/crud` — Add nodes to the scenario graph.
   - Node types and required config:
     - `node_trigger` → `triggerNode: { triggerType: "trigger_now" | "trigger_on_date" | "trigger_on_event" }`
     - `node_wait` → `waitNode: { waitNodeType: "static_wait", staticValue: { durationMin: N } }`
     - `node_branch` → `branchNode: { predicate: { ... } }` (same predicate model as segmentation)
     - `node_action` → `actionNode: { actionType: "email" | "webhook", email: { commChanId, templateId } }`
   - Known bugs: none

8. **[Optional] Add Scenario Edges** — `POST /api/tenant/scenario/edge/crud` — Connect nodes with typed edges.
   - Edge types: `link_next_node`, `link_yes_branch`, `link_no_branch`
   - Known bugs: none

9. **[Optional] Save Scenario Changes** — `POST /api/tenant/scenario/crud/save-changes` — Persist node/edge graph changes.
   - Input: scenario ID + modified graph
   - Known bugs: none

---

## Entity Dependency Graph

```
Communication Channel (verified)
        │
        ├──→ Template
        │         │
        │         └──→ Campaign ←── Segmentation ←── Customer Fields + UDAFs
        │
        └──→ Scenario / node_action (references commChanId + templateId)
                  │
                  └── node_trigger → node_wait → node_branch → node_action
```

All entities must be created in dependency order. A campaign cannot be created before its channel, template, and segmentation exist.

---

## Critical Path

Minimum steps for a passing campaign happy-path test:

1. `POST /api/tenants/comm-channels` — create channel
2. `POST /api/tenants/comm-channels/{id}/verify` — verify channel
3. `POST /api/tenants/comm-channels/{commChanId}/templates` — create template
4. `POST /api/tenants/segmentation` — create (or reuse) segment (ensure data is ingested and fields are applied first)
5. `POST /api/tenants/campaigns` — create campaign linking all above
6. Assert: campaign is created with correct `segmentationId`, `commChanId`, `templateId` references

---

## Edge Cases

- Creating a campaign against an unverified channel: expected to fail or be blocked at send time; verify behavior.
- Creating a template that references a deleted channel: undefined behavior — test referential integrity.
- Segmentation with UDAF predicate: UDAF must be fully materialized before segment count is meaningful (5–7min after UDAF creation).
- Scenario `node_action` with invalid `commChanId` or `templateId`: test error handling at save vs. execute time.
- `trigger_on_event` trigger type: depends on real-time event ingestion flow; test that scenario activates after event arrival.
- `node_branch` uses the same predicate model as segmentation — all BUG-002/BUG-003 edge cases apply if the branch condition references a UDAF with RELATIVE time window.
- Empty segment (0 customers match): campaign should gracefully handle zero recipients without error.
- Scenario with no edges (disconnected nodes): test whether save-changes rejects or accepts and how the runner handles orphan nodes.
