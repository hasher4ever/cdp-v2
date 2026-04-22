/**
 * Scenario Builder — execution lifecycle on a fresh tenant.
 *
 * Tests the full graph build and save workflow:
 *   1. Create prerequisite entities (commchan, template)
 *   2. Create scenario
 *   3. Add trigger node (trigger_now)
 *   4. Add wait node (5 min)
 *   5. Add action node (webhook)
 *   6. Wire edges: trigger → wait → action
 *   7. Save-changes (returns 204 — BUG-017 was fixed)
 *   8. Re-fetch and verify graph persists
 */
import { describe, it, expect } from "vitest";
import { get, post } from "../tests_backend/client";
import { makeTag } from "./test-factories";
import { custField } from "./tenant-context";

const TEST_TAG = makeTag();

describe("Scenario Execution Lifecycle (Fresh Tenant)", () => {
  let commChanId: string;
  let templateId: string;
  let scenarioId: string;
  let triggerNodeId: string;
  let waitNodeId: string;
  let actionNodeId: string;

  // ─── Setup: commchan + template (action node needs them) ────────────────────

  it("Step 1: Create webhook communication channel", async () => {
    const { status, data } = await post("/api/tenants/commchan", {
      name: `${TEST_TAG}_scenario_chan`,
      kind: "webhook",
      mappings: {},
      chanconf: { url: "http://10.0.10.165:30104/", method: "POST" },
    });
    expect(status).toBe(200);
    commChanId = data.id;
    expect(commChanId).toBeTruthy();
  });

  it("Step 2: Verify the communication channel", async () => {
    if (!commChanId) return;
    const { status, data } = await post(`/api/tenants/commchan/${commChanId}/verify`);
    expect(status).toBe(200);
    expect(data.verified).toBe(true);
  });

  it("Step 3: Create email template for action node", async () => {
    const { status, data } = await post("/api/tenant/template", {
      content_type: "html",
      name: `${TEST_TAG}_scenario_template`,
      subject: "Scenario test {{first_name}}",
      content: "<p>Hello {{first_name}}</p>",
      variables: { first_name: custField("first_name") },
    });
    expect(status).toBe(201);
    templateId = data.id;
    expect(templateId).toBeTruthy();
  });

  // ─── Scenario creation ──────────────────────────────────────────────────────

  it("Step 4: Create a new scenario", async () => {
    const { status, data } = await post("/api/tenant/scenario/crud", {
      name: `${TEST_TAG}_exec_lifecycle`,
    });
    expect(status).toBe(200);
    expect(data).toHaveProperty("id");
    scenarioId = data.id;
  });

  // ─── Add nodes ──────────────────────────────────────────────────────────────

  it("Step 5: Add trigger_now node", async () => {
    if (!scenarioId) return;
    const { status } = await post("/api/tenant/scenario/node/crud", {
      scenarioId,
      nodeType: "node_trigger",
      title: "Start Now",
      triggetNode: { triggerType: "trigger_now" },
      uiConfig: { position: { x: 0, y: 100 }, type: "trigger_now" },
    });
    expect(status).toBe(200);

    const { data: sc } = await get("/api/tenant/scenario/crud/get-by-id", { scenario_id: scenarioId });
    const trigger = sc.nodes.find((n: any) => n.nodeType === "node_trigger");
    triggerNodeId = trigger?.nodeId;
    expect(triggerNodeId).toBeTruthy();
  });

  it("Step 6: Add wait node (5 min static wait)", async () => {
    if (!scenarioId) return;
    const { status } = await post("/api/tenant/scenario/node/crud", {
      scenarioId,
      nodeType: "node_wait",
      title: "Wait 5m",
      waitNode: { waitNodeType: "static_wait", staticValue: { durationMin: 5 } },
      uiConfig: { position: { x: 300, y: 100 }, type: "static_wait" },
    });
    expect(status).toBe(200);

    const { data: sc } = await get("/api/tenant/scenario/crud/get-by-id", { scenario_id: scenarioId });
    const wait = sc.nodes.find((n: any) => n.nodeType === "node_wait");
    waitNodeId = wait?.nodeId;
    expect(waitNodeId).toBeTruthy();
  });

  it("Step 7: Add webhook action node", async () => {
    if (!scenarioId) return;
    const { status } = await post("/api/tenant/scenario/node/crud", {
      scenarioId,
      nodeType: "node_action",
      title: "Send Webhook",
      actionNode: {
        actionType: "webhook",
        webhook: { commChanId, url: "http://10.0.10.165:30104/", method: "POST" },
      },
      uiConfig: { position: { x: 600, y: 100 }, type: "webhook" },
    });
    expect(status).toBe(200);

    const { data: sc } = await get("/api/tenant/scenario/crud/get-by-id", { scenario_id: scenarioId });
    const action = sc.nodes.find((n: any) => n.nodeType === "node_action");
    actionNodeId = action?.nodeId;
    expect(actionNodeId).toBeTruthy();
  });

  it("Step 8: Scenario should have 3 nodes after adding all", async () => {
    const { status, data } = await get("/api/tenant/scenario/crud/get-by-id", { scenario_id: scenarioId });
    expect(status).toBe(200);
    expect(data.nodes.length).toBe(3);
    const types = data.nodes.map((n: any) => n.nodeType).sort();
    expect(types).toEqual(["node_action", "node_trigger", "node_wait"]);
  });

  // ─── Wire edges ─────────────────────────────────────────────────────────────

  it("Step 9: Connect trigger → wait with link_next_node edge", async () => {
    if (!triggerNodeId || !waitNodeId) return;
    const { status, data } = await post("/api/tenant/scenario/edge/crud", {
      scenarioId,
      edgeType: "link_next_node",
      fromNodeId: triggerNodeId,
      toNodeId: waitNodeId,
      uiConfig: { edge_key: `xy-edge__${triggerNodeId}-${waitNodeId}` },
    });
    expect(status).toBe(200);
    expect(data.edges.length).toBeGreaterThanOrEqual(1);
  });

  it("Step 10: Connect wait → action with link_next_node edge", async () => {
    if (!waitNodeId || !actionNodeId) return;
    const { status, data } = await post("/api/tenant/scenario/edge/crud", {
      scenarioId,
      edgeType: "link_next_node",
      fromNodeId: waitNodeId,
      toNodeId: actionNodeId,
      uiConfig: { edge_key: `xy-edge__${waitNodeId}-${actionNodeId}` },
    });
    expect(status).toBe(200);
    expect(data.edges.length).toBeGreaterThanOrEqual(2);
  });

  it("Step 11: Scenario should have 2 edges after wiring", async () => {
    const { status, data } = await get("/api/tenant/scenario/crud/get-by-id", { scenario_id: scenarioId });
    expect(status).toBe(200);
    expect(data.edges.length).toBe(2);
  });

  // ─── Save and verify persistence ───────────────────────────────────────────

  it("Step 12: Save scenario — expect 204", async () => {
    if (!scenarioId) return;
    const { status } = await post(
      "/api/tenant/scenario/crud/save-changes",
      undefined,
      { scenario_id: scenarioId },
    );
    // BUG-017: save-changes returns 500 on scenarios with nodes/edges
    expect(status).toBe(204);
  });

  it("Step 13: Re-fetch scenario — graph should persist with 3 nodes and 2 edges", async () => {
    if (!scenarioId) return;
    const { status, data } = await get("/api/tenant/scenario/crud/get-by-id", { scenario_id: scenarioId });
    expect(status).toBe(200);

    // Nodes
    expect(data.nodes.length).toBe(3);
    const nodeTypes = data.nodes.map((n: any) => n.nodeType).sort();
    expect(nodeTypes).toEqual(["node_action", "node_trigger", "node_wait"]);

    // Edges
    expect(data.edges.length).toBe(2);

    // Verify edge wiring: trigger → wait → action
    const triggerToWait = data.edges.find(
      (e: any) => e.fromNodeId === triggerNodeId && e.toNodeId === waitNodeId,
    );
    expect(triggerToWait).toBeTruthy();
    expect(triggerToWait.edgeType).toBe("link_next_node");

    const waitToAction = data.edges.find(
      (e: any) => e.fromNodeId === waitNodeId && e.toNodeId === actionNodeId,
    );
    expect(waitToAction).toBeTruthy();
    expect(waitToAction.edgeType).toBe("link_next_node");
  });

  // BUG-030: After save-changes (204), scenario status remains "" and is excluded from list.
  // List endpoint only returns scenarios with status="NEW". This test documents expected behavior.
  it("Step 14: Scenario should appear in scenario list", async () => {
    if (!scenarioId) return;
    const { status, data } = await get("/api/tenant/scenario/crud", { page: 1, size: 50 });
    expect(status).toBe(200);
    const found = data.list?.find((s: any) => s.id === scenarioId);
    expect(found).toBeTruthy();
    expect(found.name).toBe(`${TEST_TAG}_exec_lifecycle`);
  });
});
