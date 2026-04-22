/**
 * Scenario Builder — creation and node/edge variation tests.
 *
 * Each test creates a fresh scenario (no reuse of existing ones).
 * Tests creation validation, all node types, edge wiring, and save.
 */
import { describe, it, expect } from "vitest";
import { get, post } from "./client";

// ─── Scenario creation validation ─────────────────────────────────────────────

describe("Scenario Creation: name validation", () => {
  it("should create scenario with valid name", async () => {
    const { status, data } = await post("/api/tenant/scenario/crud", { name: `valid_${Date.now()}` });
    expect(status).toBe(200);
    expect(data).toHaveProperty("id");
    expect(data).toHaveProperty("name");
  });

  it("should reject empty name", async () => {
    const { status } = await post("/api/tenant/scenario/crud", { name: "" });
    expect(status).toBe(400);
  });

  it("should reject missing name field", async () => {
    const { status } = await post("/api/tenant/scenario/crud", {});
    expect(status).toBe(400);
  });

  it("should reject single character name (min length)", async () => {
    const { status } = await post("/api/tenant/scenario/crud", { name: "a" });
    expect(status).toBe(400);
  });

  it("should reject very long name (500+ chars)", async () => {
    const { status } = await post("/api/tenant/scenario/crud", { name: "x".repeat(500) });
    expect(status).toBe(400);
  });

  it("should accept unicode and special characters", async () => {
    const { status, data } = await post("/api/tenant/scenario/crud", { name: `тест_${Date.now()}` });
    expect(status).toBe(200);
    expect(data.name).toContain("тест_");
  });

  it("should reject whitespace-only name", async () => {
    // BUG-014: Currently returns 200, should return 400
    const { status } = await post("/api/tenant/scenario/crud", { name: "   " });
    expect(status).toBe(400);
  });

  it("should allow duplicate names (no uniqueness constraint)", async () => {
    const name = `dup_${Date.now()}`;
    const r1 = await post("/api/tenant/scenario/crud", { name });
    const r2 = await post("/api/tenant/scenario/crud", { name });
    expect(r1.status).toBe(200);
    expect(r2.status).toBe(200);
    expect(r1.data.id).not.toBe(r2.data.id);
  });

  it("should reject HTML/script injection in name", async () => {
    // BUG-015: Currently 200, XSS payload stored as-is
    const { status } = await post("/api/tenant/scenario/crud", { name: '<script>alert("xss")</script>' });
    expect(status).toBe(400);
  });
});

// ─── Trigger node types ───────────────────────────────────────────────────────

describe("Scenario Nodes: trigger types", () => {
  let scenarioId: string;

  it("setup: create fresh scenario", async () => {
    const { data } = await post("/api/tenant/scenario/crud", { name: `trigger_test_${Date.now()}` });
    scenarioId = data.id;
  });

  it("should create trigger_now node", async () => {
    const { status } = await post("/api/tenant/scenario/node/crud", {
      scenarioId, nodeType: "node_trigger", title: "",
      triggetNode: { triggerType: "trigger_now" },
      uiConfig: { position: { x: 0, y: 0 }, type: "trigger_now" },
    });
    expect(status).toBe(200);
  });

  it("should create trigger_on_date node", async () => {
    const { status } = await post("/api/tenant/scenario/node/crud", {
      scenarioId, nodeType: "node_trigger", title: "",
      triggetNode: { triggerType: "trigger_on_date", triggerOnDate: { date: "2026-12-25T00:00:00Z" } },
      uiConfig: { position: { x: 200, y: 0 }, type: "trigger_on_date" },
    });
    expect(status).toBe(200);
  });

  it("should create trigger_on_event node", async () => {
    const { status } = await post("/api/tenant/scenario/node/crud", {
      scenarioId, nodeType: "node_trigger", title: "",
      triggetNode: { triggerType: "trigger_on_event", triggerOnEvent: { eventTypeId: 100 } },
      uiConfig: { position: { x: 400, y: 0 }, type: "trigger_on_event" },
    });
    expect(status).toBe(200);
  });

  it("should have 3 trigger nodes in scenario", async () => {
    const { data } = await get("/api/tenant/scenario/crud/get-by-id", { scenario_id: scenarioId });
    const triggers = data.nodes.filter((n: any) => n.nodeType === "node_trigger");
    expect(triggers.length).toBe(3);
    const types = triggers.map((t: any) => t.triggetNode.triggerType).sort();
    expect(types).toEqual(["trigger_now", "trigger_on_date", "trigger_on_event"]);
  });
});

// ─── Wait node variations ─────────────────────────────────────────────────────

describe("Scenario Nodes: wait duration variations", () => {
  let scenarioId: string;

  it("setup: create fresh scenario", async () => {
    const { data } = await post("/api/tenant/scenario/crud", { name: `wait_test_${Date.now()}` });
    scenarioId = data.id;
  });

  it("should create 1-minute wait", async () => {
    const { status } = await post("/api/tenant/scenario/node/crud", {
      scenarioId, nodeType: "node_wait", title: "",
      waitNode: { waitNodeType: "static_wait", staticValue: { durationMin: 1 } },
      uiConfig: { position: { x: 0, y: 0 }, type: "static_wait" },
    });
    expect(status).toBe(200);
  });

  it("should create 24-hour wait (1440 min)", async () => {
    const { status } = await post("/api/tenant/scenario/node/crud", {
      scenarioId, nodeType: "node_wait", title: "",
      waitNode: { waitNodeType: "static_wait", staticValue: { durationMin: 1440 } },
      uiConfig: { position: { x: 200, y: 0 }, type: "static_wait" },
    });
    expect(status).toBe(200);
  });

  it("should reject 0-minute wait", async () => {
    // A 0-duration wait is logically meaningless
    const { status } = await post("/api/tenant/scenario/node/crud", {
      scenarioId, nodeType: "node_wait", title: "",
      waitNode: { waitNodeType: "static_wait", staticValue: { durationMin: 0 } },
      uiConfig: { position: { x: 400, y: 0 }, type: "static_wait" },
    });
    // BUG-016: Currently 200, should reject 0-duration
    expect(status).toBe(400);
  });

  it("should reject negative duration wait", async () => {
    const { status } = await post("/api/tenant/scenario/node/crud", {
      scenarioId, nodeType: "node_wait", title: "",
      waitNode: { waitNodeType: "static_wait", staticValue: { durationMin: -5 } },
      uiConfig: { position: { x: 600, y: 0 }, type: "static_wait" },
    });
    // BUG-016: Currently 200, should reject negative duration
    expect(status).toBe(400);
  });
});

// ─── Full scenario flow: trigger → wait → edge → save ─────────────────────────

describe("Scenario: full build flow", () => {
  let scenarioId: string;
  let triggerNodeId: string;
  let waitNodeId: string;

  it("should create scenario", async () => {
    const { status, data } = await post("/api/tenant/scenario/crud", { name: `flow_test_${Date.now()}` });
    expect(status).toBe(200);
    scenarioId = data.id;
  });

  it("should add trigger_now node", async () => {
    const { status, data } = await post("/api/tenant/scenario/node/crud", {
      scenarioId, nodeType: "node_trigger", title: "Start",
      triggetNode: { triggerType: "trigger_now" },
      uiConfig: { position: { x: 0, y: 0 }, type: "trigger_now" },
    });
    expect(status).toBe(200);
    // Get scenario to find node IDs
    const { data: sc } = await get("/api/tenant/scenario/crud/get-by-id", { scenario_id: scenarioId });
    triggerNodeId = sc.nodes[0]?.nodeId;
  });

  it("should add wait node", async () => {
    const { status } = await post("/api/tenant/scenario/node/crud", {
      scenarioId, nodeType: "node_wait", title: "Wait 10m",
      waitNode: { waitNodeType: "static_wait", staticValue: { durationMin: 10 } },
      uiConfig: { position: { x: 300, y: 0 }, type: "static_wait" },
    });
    expect(status).toBe(200);
    const { data: sc } = await get("/api/tenant/scenario/crud/get-by-id", { scenario_id: scenarioId });
    waitNodeId = sc.nodes.find((n: any) => n.nodeType === "node_wait")?.nodeId;
  });

  it("should connect trigger → wait with edge", async () => {
    if (!triggerNodeId || !waitNodeId) return;
    const { status, data } = await post("/api/tenant/scenario/edge/crud", {
      scenarioId, edgeType: "link_next_node",
      fromNodeId: triggerNodeId, toNodeId: waitNodeId,
      uiConfig: { edge_key: `xy-edge__${triggerNodeId}-${waitNodeId}` },
    });
    expect(status).toBe(200);
    expect(data.edges.length).toBeGreaterThanOrEqual(1);
  });

  it("should save scenario", async () => {
    const { status } = await post("/api/tenant/scenario/crud/save-changes", undefined, { scenario_id: scenarioId });
    // BUG-017: save returns 500 on some scenarios
    expect([204, 200]).toContain(status);
  });

  it("should verify saved state", async () => {
    const { status, data } = await get("/api/tenant/scenario/crud/get-by-id", { scenario_id: scenarioId });
    expect(status).toBe(200);
    expect(data.nodes.length).toBe(2);
    expect(data.edges.length).toBe(1);
    expect(data.edges[0].fromNodeId).toBe(triggerNodeId);
    expect(data.edges[0].toNodeId).toBe(waitNodeId);
  });
});

// ─── Edge validation ──────────────────────────────────────────────────────────

describe("Scenario Edges: validation", () => {
  it("should reject edge with invalid fromNodeId", async () => {
    const { data: sc } = await post("/api/tenant/scenario/crud", { name: `edge_val_${Date.now()}` });
    const { status } = await post("/api/tenant/scenario/edge/crud", {
      scenarioId: sc.id, edgeType: "link_next_node",
      fromNodeId: "999999999999", toNodeId: "999999999998",
      uiConfig: { edge_key: "test_edge" },
    });
    expect([400, 409, 500]).toContain(status);
  });

  it("should reject edge with invalid scenario ID", async () => {
    const { status } = await post("/api/tenant/scenario/edge/crud", {
      scenarioId: "00000000-0000-0000-0000-000000000000", edgeType: "link_next_node",
      fromNodeId: "1", toNodeId: "2",
      uiConfig: { edge_key: "test_edge" },
    });
    expect([400, 404, 409]).toContain(status);
  });
});
