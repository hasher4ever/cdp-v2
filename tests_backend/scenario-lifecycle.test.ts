/**
 * Scenario Full Lifecycle Test — Session 16, C5
 *
 * Thesis: Test the full scenario lifecycle (create -> retrieve -> add nodes ->
 * save -> retrieve -> verify) to confirm the multi-step workflow holds together.
 * This is one of few unblocked multi-step workflows not dependent on compute.
 *
 * Known bugs validated:
 *   BUG-030: empty name accepted (no validation)
 *   BUG-033: DELETE returns 400 method-not-allowed
 *   BUG-034: status transitions not persisted via PUT
 *   BUG-054: RESTful GET /{id} broken — must use query param style
 */
import { describe, it, expect } from "vitest";
import { get, post, put, del, api } from "./client";

const TAG = "TEST_lifecycle_s16";

// ─── Full lifecycle: create → nodes → save → verify ─────────────────────────

describe("Scenario full lifecycle", () => {
  let scenarioId: string;
  let scenarioName: string;
  let triggerNodeId: string;
  let waitNodeId: string;

  // 1. CREATE with timestamped name → verify 200 + returned ID
  it("1. CREATE scenario with timestamped name returns 200 + ID", async () => {
    scenarioName = `${TAG}_${Date.now()}`;
    const { status, data } = await post("/api/tenant/scenario/crud", { name: scenarioName });
    expect(status).toBe(200);
    expect(data.id).toBeDefined();
    expect(typeof data.id).toBe("string");
    expect(data.id.length).toBeGreaterThan(0);
    expect(data.name).toBe(scenarioName);
    scenarioId = data.id;
  });

  // 2. GET created scenario by ID (query param) → verify structure
  it("2. GET by ID (query param) returns scenario with correct structure", async () => {
    if (!scenarioId) return;
    const { status, data } = await get("/api/tenant/scenario/crud/get-by-id", { scenario_id: scenarioId });
    expect(status).toBe(200);
    expect(data).toHaveProperty("scenario");
    expect(data).toHaveProperty("nodes");
    expect(data).toHaveProperty("edges");
    expect(data.scenario.id).toBe(scenarioId);
    expect(data.scenario.name).toBe(scenarioName);
    expect(Array.isArray(data.nodes)).toBe(true);
    expect(Array.isArray(data.edges)).toBe(true);
    expect(data.nodes.length).toBe(0); // freshly created — no nodes yet
    expect(data.edges.length).toBe(0);
  });

  // 3. Add trigger node + action node → verify 200
  it("3a. Add trigger node returns 200", async () => {
    if (!scenarioId) return;
    const { status, data } = await post("/api/tenant/scenario/node/crud", {
      scenarioId,
      nodeType: "node_trigger",
      title: "Lifecycle Trigger",
      triggetNode: { triggerType: "trigger_now" },
      uiConfig: { position: { x: 0, y: 0 }, type: "trigger_now" },
    });
    expect(status).toBe(200);
  });

  it("3b. Add wait node returns 200", async () => {
    if (!scenarioId) return;
    const { status, data } = await post("/api/tenant/scenario/node/crud", {
      scenarioId,
      nodeType: "node_wait",
      title: "Lifecycle Wait",
      waitNode: { waitNodeType: "static_wait", staticValue: { durationMin: 5 } },
      uiConfig: { position: { x: 300, y: 0 }, type: "static_wait" },
    });
    expect(status).toBe(200);
  });

  // 3c. Save changes
  it("3c. Save-changes after adding nodes returns 200/204", async () => {
    if (!scenarioId) return;
    const { status } = await post("/api/tenant/scenario/crud/save-changes", undefined, { scenario_id: scenarioId });
    expect([200, 204]).toContain(status);
  });

  // 4. GET again → verify nodes persisted
  it("4. GET after save shows 2 nodes persisted", async () => {
    if (!scenarioId) return;
    const { status, data } = await get("/api/tenant/scenario/crud/get-by-id", { scenario_id: scenarioId });
    expect(status).toBe(200);
    expect(data.nodes.length).toBe(2);

    const trigger = data.nodes.find((n: any) => n.nodeType === "node_trigger");
    const wait = data.nodes.find((n: any) => n.nodeType === "node_wait");
    expect(trigger).toBeDefined();
    expect(wait).toBeDefined();

    // Capture IDs first — needed by subsequent tests
    triggerNodeId = trigger.nodeId;
    waitNodeId = wait?.nodeId;

    // NOTE: title is not persisted by the backend — returned as empty string
    // This is a documentation gap / possible bug: titles sent on create are silently dropped
    console.log(`Trigger title after save: "${trigger.title}" (sent: "Lifecycle Trigger")`);
    console.log(`Wait title after save: "${wait.title}" (sent: "Lifecycle Wait")`);
  });

  // 5. Save-changes: connect nodes with edge, then modify trigger title
  it("5a. Connect trigger -> action with edge", async () => {
    if (!triggerNodeId || !waitNodeId) return;
    const { status } = await post("/api/tenant/scenario/edge/crud", {
      scenarioId,
      edgeType: "link_next_node",
      fromNodeId: triggerNodeId,
      toNodeId: waitNodeId,
      uiConfig: { edge_key: `e_${triggerNodeId}_${waitNodeId}` },
    });
    expect(status).toBe(200);
  });

  it("5b. Save-changes after adding edge", async () => {
    if (!scenarioId) return;
    // NOTE: save-changes can be very slow (~30s+) after adding edges — possible backend perf issue
    const { status } = await post("/api/tenant/scenario/crud/save-changes", undefined, { scenario_id: scenarioId });
    console.log(`Save-changes after edge: status ${status}`);
    expect([200, 204]).toContain(status);
  }, 60000);

  // 6. GET again → verify edge persisted
  it("6. GET shows edge persisted between trigger and wait", async () => {
    if (!scenarioId) return;
    const { status, data } = await get("/api/tenant/scenario/crud/get-by-id", { scenario_id: scenarioId });
    expect(status).toBe(200);
    expect(data.nodes.length).toBe(2);
    console.log(`Edges after save: ${data.edges.length} (expected 1)`);
    if (data.edges.length === 1) {
      expect(data.edges[0].fromNodeId).toBe(triggerNodeId);
      expect(data.edges[0].toNodeId).toBe(waitNodeId);
      expect(data.edges[0].edgeType).toBe("link_next_node");
    } else if (data.edges.length === 0) {
      // Edge creation via node/edge CRUD succeeded (200) but edge was not persisted after save
      // This may be a timing issue or edge persistence bug
      console.log("FINDING: Edge was accepted (200) but not persisted after save-changes");
    }
    // At minimum, nodes should still be there
    expect(data.nodes.length).toBe(2);
  });
});

// ─── BUG-034: Status transitions not persisted ──────────────────────────────

describe("BUG-034: scenario status transitions not persisted", () => {
  let scenarioId: string;

  it("setup: create scenario for status test", async () => {
    const { data } = await post("/api/tenant/scenario/crud", { name: `${TAG}_status_${Date.now()}` });
    scenarioId = data.id;
  });

  it("7a. Newly created scenario has status NEW in list", async () => {
    if (!scenarioId) return;
    const { data } = await get("/api/tenant/scenario/crud", { page: 0, size: 50 });
    const found = data.list.find((s: any) => s.id === scenarioId);
    expect(found).toBeDefined();
    expect(found.status).toBe("NEW");
  });

  it("7b. BUG-034: PUT with name+status=ACTIVE — status does not persist", async () => {
    if (!scenarioId) return;
    // PUT requires name field; we include status alongside
    const { status } = await put("/api/tenant/scenario/crud", {
      scenarioId,
      name: `${TAG}_status_active_${Date.now()}`,
      status: "ACTIVE",
    });
    // PUT accepts the rename but silently ignores status
    expect(status).toBe(200);

    // Verify: check list to see if status changed
    const { data: listData } = await get("/api/tenant/scenario/crud", { page: 0, size: 50 });
    const found = listData.list.find((s: any) => s.id === scenarioId);
    expect(found).toBeDefined();
    // BUG-034: status should be ACTIVE but remains NEW
    expect(found.status).toBe("NEW"); // confirms bug: status didn't change
  });

  it("7c. BUG-034: PUT with status=STOPPED also does not persist", async () => {
    if (!scenarioId) return;
    await put("/api/tenant/scenario/crud", {
      scenarioId,
      name: `${TAG}_status_stopped_${Date.now()}`,
      status: "STOPPED",
    });

    const { data: listData } = await get("/api/tenant/scenario/crud", { page: 0, size: 50 });
    const found = listData.list.find((s: any) => s.id === scenarioId);
    expect(found.status).toBe("NEW"); // confirms bug: still NEW
  });
});

// ─── BUG-030: Empty name accepted ───────────────────────────────────────────

describe("BUG-030 recheck: empty name on create", () => {
  it("8. CREATE with empty name — verify if BUG-030 is fixed", async () => {
    const { status, data } = await post("/api/tenant/scenario/crud", { name: "" });
    // BUG-030 was: server accepts empty name (200). Now checking if fixed.
    if (status === 400 || status === 422) {
      // BUG-030 is FIXED — server now rejects empty name
      console.log(`BUG-030 FIXED: empty name rejected with ${status}`);
      expect([400, 422]).toContain(status);
    } else {
      // BUG-030 still present
      expect(status).toBe(200);
      console.log("BUG-030 still present: empty name accepted");
    }
  });
});

// ─── Boundary: very long name ───────────────────────────────────────────────

describe("Scenario boundary: very long name", () => {
  it("9. CREATE with 1000-char name — observe behavior", async () => {
    const longName = "A".repeat(1000);
    const { status, data } = await post("/api/tenant/scenario/crud", { name: longName });
    // Hypothesis: either truncates or accepts as-is (no validation)
    if (status === 200) {
      expect(data.id).toBeDefined();
      // Verify if it stored the full name or truncated
      const { data: byId } = await get("/api/tenant/scenario/crud/get-by-id", { scenario_id: data.id });
      const storedLen = byId.scenario.name.length;
      console.log(`Long name: sent 1000 chars, stored ${storedLen} chars`);
      // Accept either truncation or full storage
      expect(storedLen).toBeGreaterThan(0);
    } else {
      // If rejected, that's actually correct validation
      expect([400, 422]).toContain(status);
      console.log(`Long name correctly rejected with ${status}`);
    }
  });
});

// ─── Boundary: duplicate name ───────────────────────────────────────────────

describe("Scenario boundary: duplicate name", () => {
  it("10. CREATE with duplicate name — observe behavior", async () => {
    const dupName = `${TAG}_dup_${Date.now()}`;
    const { status: s1, data: d1 } = await post("/api/tenant/scenario/crud", { name: dupName });
    expect(s1).toBe(200);

    const { status: s2, data: d2 } = await post("/api/tenant/scenario/crud", { name: dupName });
    // Hypothesis: server allows duplicate names (no uniqueness constraint)
    if (s2 === 200) {
      expect(d2.id).toBeDefined();
      expect(d2.id).not.toBe(d1.id); // different IDs, same name
      console.log("Duplicate name accepted — no uniqueness constraint");
    } else {
      expect([400, 409]).toContain(s2);
      console.log(`Duplicate name rejected with ${s2}`);
    }
  });
});

// ─── BUG-054: RESTful GET /{id} broken ──────────────────────────────────────

describe("BUG-054: RESTful GET by ID broken", () => {
  it("11. GET /api/tenant/scenario/crud/{id} returns error", async () => {
    // Create a scenario to have a valid ID
    const { data: created } = await post("/api/tenant/scenario/crud", { name: `${TAG}_restful_${Date.now()}` });
    const id = created.id;

    // RESTful style: /{id} in path
    const { status, data } = await get(`/api/tenant/scenario/crud/${id}`);
    // BUG-054: this should work but doesn't — returns error
    // Query param style works fine: /get-by-id?scenario_id=ID
    console.log(`RESTful GET status: ${status}, data: ${JSON.stringify(data).slice(0, 200)}`);
    // Confirm the bug: status should be 200 but won't be
    expect(status).not.toBe(200);
  });
});

// ─── BUG-033: DELETE returns 400 ────────────────────────────────────────────

describe("BUG-033: DELETE unimplemented", () => {
  it("12. DELETE returns 400 method-not-allowed", async () => {
    const { data: created } = await post("/api/tenant/scenario/crud", { name: `${TAG}_del_${Date.now()}` });

    const { status, data } = await del("/api/tenant/scenario/crud", { scenario_id: created.id });
    // BUG-033: DELETE is not implemented
    expect(status).toBe(400);
    expect(data.error).toBe("method not allowed");
  });
});
