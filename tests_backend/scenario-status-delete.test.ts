/**
 * Scenario status fields and DELETE lifecycle tests.
 *
 * Covers gaps identified in gap analysis:
 *   (a) status field presence and values on created scenarios
 *   (b) listing scenarios returns status field on each item
 *   (c) GET by ID includes status field (and reveals status discrepancy bug)
 *   (d) DELETE lifecycle — cascade vs reject with nodes present
 *   (e) DELETE non-existent scenario
 *
 * Key findings from probing (see bugs.md):
 *   - List endpoint returns status "NEW" for all scenarios
 *   - GET by ID returns status "" (empty string) — status field is inconsistent
 *   - DELETE returns HTTP 400 {"error":"method not allowed"} regardless of body/params
 *   - Create response omits status field entirely (only returns id + name)
 */
import { describe, it, expect, afterEach } from "vitest";
import { get, post, put, del } from "./client";

const TEST_TAG = "TEST_scenario_status";

// ─── Status field on newly created scenario ─────────────────────────────────

describe("Scenario: status field on create", () => {
  let scenarioId: string;

  afterEach(async () => {
    // Cleanup: attempt delete (currently returns 400 — see BUG)
    if (scenarioId) {
      await del("/api/tenant/scenario/crud", { scenario_id: scenarioId });
    }
  });

  it("should create scenario with 200 and return id + name", async () => {
    const name = `${TEST_TAG}_create_${Date.now()}`;
    const { status, data } = await post("/api/tenant/scenario/crud", { name });
    expect(status).toBe(200);
    expect(data.id).toBeDefined();
    expect(typeof data.id).toBe("string");
    expect(data.name).toBe(name);
    scenarioId = data.id;
  });

  it("create response omits status field — field only available via list/get-by-id", async () => {
    const name = `${TEST_TAG}_status_omit_${Date.now()}`;
    const { data } = await post("/api/tenant/scenario/crud", { name });
    scenarioId = data.id;
    // Create response does NOT include status — this is a documentation gap
    expect(data).not.toHaveProperty("status");
    expect(Object.keys(data).sort()).toEqual(["id", "name"]);
  });
});

// ─── Status field in scenario list ──────────────────────────────────────────

describe("Scenario list: status field on each item", () => {
  let scenarioId: string;

  afterEach(async () => {
    if (scenarioId) {
      await del("/api/tenant/scenario/crud", { scenario_id: scenarioId });
    }
  });

  it("list response has list + totalCount structure", async () => {
    const { status, data } = await get("/api/tenant/scenario/crud", { page: 0, size: 5 });
    expect(status).toBe(200);
    expect(data).toHaveProperty("list");
    expect(data).toHaveProperty("totalCount");
    expect(Array.isArray(data.list)).toBe(true);
    expect(typeof data.totalCount).toBe("number");
  });

  it("each scenario in list has status field", async () => {
    const { data } = await get("/api/tenant/scenario/crud", { page: 0, size: 10 });
    expect(data.list.length).toBeGreaterThan(0);
    for (const scenario of data.list) {
      expect(scenario).toHaveProperty("status");
      expect(typeof scenario.status).toBe("string");
    }
  });

  it("newly created scenario appears in list with status NEW", async () => {
    const name = `${TEST_TAG}_list_status_${Date.now()}`;
    const { data: created } = await post("/api/tenant/scenario/crud", { name });
    scenarioId = created.id;

    const { data: list } = await get("/api/tenant/scenario/crud", { page: 0, size: 5 });
    const found = list.list.find((s: any) => s.id === scenarioId);
    expect(found).toBeDefined();
    expect(found.status).toBe("NEW");
  });

  it("list items include all expected fields: id, name, status, createdAt", async () => {
    const { data } = await get("/api/tenant/scenario/crud", { page: 0, size: 5 });
    const item = data.list[0];
    expect(item).toHaveProperty("id");
    expect(item).toHaveProperty("name");
    expect(item).toHaveProperty("status");
    expect(item).toHaveProperty("createdAt");
  });

  it("list respects page size", async () => {
    const { status, data } = await get("/api/tenant/scenario/crud", { page: 0, size: 3 });
    expect(status).toBe(200);
    expect(data.list.length).toBeLessThanOrEqual(3);
  });
});

// ─── Status field in GET by ID ───────────────────────────────────────────────

describe("Scenario get-by-id: status field presence and consistency", () => {
  let scenarioId: string;

  afterEach(async () => {
    if (scenarioId) {
      await del("/api/tenant/scenario/crud", { scenario_id: scenarioId });
    }
  });

  it("get-by-id returns scenario, nodes, edges structure", async () => {
    const name = `${TEST_TAG}_getbyid_struct_${Date.now()}`;
    const { data: created } = await post("/api/tenant/scenario/crud", { name });
    scenarioId = created.id;

    const { status, data } = await get("/api/tenant/scenario/crud/get-by-id", { scenario_id: scenarioId });
    expect(status).toBe(200);
    expect(data).toHaveProperty("scenario");
    expect(data).toHaveProperty("nodes");
    expect(data).toHaveProperty("edges");
  });

  it("get-by-id scenario object includes status field", async () => {
    const name = `${TEST_TAG}_getbyid_status_${Date.now()}`;
    const { data: created } = await post("/api/tenant/scenario/crud", { name });
    scenarioId = created.id;

    const { data } = await get("/api/tenant/scenario/crud/get-by-id", { scenario_id: scenarioId });
    expect(data.scenario).toHaveProperty("status");
    expect(typeof data.scenario.status).toBe("string");
  });

  it("BUG: get-by-id returns empty status '' but list returns 'NEW' for same scenario", async () => {
    // This test documents the status inconsistency between list and get-by-id endpoints.
    // List returns status="NEW", get-by-id returns status="" for the same newly created scenario.
    const name = `${TEST_TAG}_status_inconsistency_${Date.now()}`;
    const { data: created } = await post("/api/tenant/scenario/crud", { name });
    scenarioId = created.id;

    const { data: listData } = await get("/api/tenant/scenario/crud", { page: 0, size: 5 });
    const inList = listData.list.find((s: any) => s.id === scenarioId);
    const statusFromList = inList?.status;

    const { data: byId } = await get("/api/tenant/scenario/crud/get-by-id", { scenario_id: scenarioId });
    const statusFromGetById = byId.scenario.status;

    // Document the actual discrepancy — list says "NEW", get-by-id says ""
    // Ideally both should return the same value
    expect(statusFromList).toBe("NEW"); // list is correct
    // get-by-id returns empty string — this is the bug
    expect(statusFromGetById).toBe("NEW"); // FAILS: actual value is "" — see BUG in bugs.md
  });

  it("get-by-id returns 200 for existing scenario", async () => {
    const name = `${TEST_TAG}_getbyid_existing_${Date.now()}`;
    const { data: created } = await post("/api/tenant/scenario/crud", { name });
    scenarioId = created.id;

    const { status } = await get("/api/tenant/scenario/crud/get-by-id", { scenario_id: scenarioId });
    expect(status).toBe(200);
  });

  it("get-by-id returns non-200 for non-existent scenario ID", async () => {
    const fakeId = "00000000-0000-0000-0000-000000000000";
    const { status } = await get("/api/tenant/scenario/crud/get-by-id", { scenario_id: fakeId });
    // Should return 404 for a missing resource
    expect(status).toBe(404);
  });

  it("get-by-id scenario includes all expected fields: id, name, status, createdAt", async () => {
    const name = `${TEST_TAG}_getbyid_fields_${Date.now()}`;
    const { data: created } = await post("/api/tenant/scenario/crud", { name });
    scenarioId = created.id;

    const { data } = await get("/api/tenant/scenario/crud/get-by-id", { scenario_id: scenarioId });
    const sc = data.scenario;
    expect(sc).toHaveProperty("id", scenarioId);
    expect(sc).toHaveProperty("name", name);
    expect(sc).toHaveProperty("status");
    expect(sc).toHaveProperty("createdAt");
  });
});

// ─── Scenario rename (PUT) does not break status ─────────────────────────────

describe("Scenario update: PUT does not change status", () => {
  let scenarioId: string;

  afterEach(async () => {
    if (scenarioId) {
      await del("/api/tenant/scenario/crud", { scenario_id: scenarioId });
    }
  });

  it("PUT rename returns updated name and id", async () => {
    const name = `${TEST_TAG}_put_before_${Date.now()}`;
    const { data: created } = await post("/api/tenant/scenario/crud", { name });
    scenarioId = created.id;

    const newName = `${TEST_TAG}_put_after_${Date.now()}`;
    const { status, data } = await put("/api/tenant/scenario/crud", {
      scenarioId: scenarioId,
      name: newName,
    });
    expect(status).toBe(200);
    expect(data.id).toBe(scenarioId);
    expect(data.name).toBe(newName);
  });

  it("after PUT, list still shows scenario with status NEW", async () => {
    const name = `${TEST_TAG}_put_status_before_${Date.now()}`;
    const { data: created } = await post("/api/tenant/scenario/crud", { name });
    scenarioId = created.id;

    const newName = `${TEST_TAG}_put_status_after_${Date.now()}`;
    await put("/api/tenant/scenario/crud", { scenarioId: scenarioId, name: newName });

    const { data: listData } = await get("/api/tenant/scenario/crud", { page: 0, size: 5 });
    const inList = listData.list.find((s: any) => s.id === scenarioId);
    expect(inList).toBeDefined();
    expect(inList.status).toBe("NEW");
    expect(inList.name).toBe(newName);
  });
});

// ─── Scenario DELETE lifecycle ────────────────────────────────────────────────

describe("Scenario DELETE: lifecycle and cascade behavior", () => {
  it("BUG: DELETE returns 400 method-not-allowed — delete is not implemented", async () => {
    // Create a fresh scenario with no nodes
    const name = `${TEST_TAG}_del_empty_${Date.now()}`;
    const { data: created } = await post("/api/tenant/scenario/crud", { name });
    const id = created.id;

    // Attempt DELETE
    const { status, data } = await del("/api/tenant/scenario/crud", { scenario_id: id });

    // Expected: 200 or 204 — scenario should be deletable
    // Actual: 400 {"error":"method not allowed"} — DELETE is not implemented
    expect(status).toBe(200); // FAILS: actual is 400 — see BUG in bugs.md
  });

  it("BUG: DELETE scenario with nodes also returns 400 — cascade behavior untestable", async () => {
    // Create scenario
    const name = `${TEST_TAG}_del_with_nodes_${Date.now()}`;
    const { data: created } = await post("/api/tenant/scenario/crud", { name });
    const id = created.id;

    // Add a node
    await post("/api/tenant/scenario/node/crud", {
      scenarioId: id,
      nodeType: "node_trigger",
      title: "Cascade Test Trigger",
      triggetNode: { triggerType: "trigger_now" },
      uiConfig: { position: { x: 0, y: 0 }, type: "trigger_now" },
    });

    // Verify node was added
    const { data: graph } = await get("/api/tenant/scenario/crud/get-by-id", { scenario_id: id });
    expect(graph.nodes.length).toBeGreaterThan(0);

    // Attempt DELETE — should either cascade-delete nodes or return clear error
    const { status, data } = await del("/api/tenant/scenario/crud", { scenario_id: id });

    // Expected: 200/204 (cascade) or 409/422 (reject with nodes present — requiring manual node removal)
    // Actual: 400 {"error":"method not allowed"} — DELETE not implemented at all
    expect([200, 204, 409, 422]).toContain(status); // FAILS: actual is 400
  });

  it("DELETE non-existent scenario returns 400 (method not allowed — same as valid IDs)", async () => {
    const { status, data } = await del("/api/tenant/scenario/crud", {
      scenario_id: "00000000-0000-0000-0000-000000000000",
    });
    // DELETE endpoint is not implemented — returns 400 regardless of whether ID exists
    // Expected behavior: 404 for non-existent, but since DELETE isn't implemented, 400 is the actual
    expect(status).toBe(400);
    expect(data.error).toBe("method not allowed");
  });

  it("scenario remains accessible after failed DELETE attempt", async () => {
    // Confirm that a failed delete doesn't corrupt the scenario
    const name = `${TEST_TAG}_del_persists_${Date.now()}`;
    const { data: created } = await post("/api/tenant/scenario/crud", { name });
    const id = created.id;

    // Attempt delete (will fail with 400)
    await del("/api/tenant/scenario/crud", { scenario_id: id });

    // Scenario should still be accessible
    const { status, data } = await get("/api/tenant/scenario/crud/get-by-id", { scenario_id: id });
    expect(status).toBe(200);
    expect(data.scenario.id).toBe(id);
    expect(data.scenario.name).toBe(name);
  });
});

// ─── Scenario list: pagination and ordering ──────────────────────────────────

describe("Scenario list: pagination correctness", () => {
  it("page=0 size=1 returns exactly 1 item", async () => {
    const { status, data } = await get("/api/tenant/scenario/crud", { page: 0, size: 1 });
    expect(status).toBe(200);
    expect(data.list.length).toBe(1);
  });

  it("page=0 size=10 returns up to 10 items", async () => {
    const { status, data } = await get("/api/tenant/scenario/crud", { page: 0, size: 10 });
    expect(status).toBe(200);
    expect(data.list.length).toBeLessThanOrEqual(10);
  });

  it("totalCount is greater than list length when many scenarios exist", async () => {
    const { data } = await get("/api/tenant/scenario/crud", { page: 0, size: 5 });
    // Shared tenant has 574+ scenarios
    if (data.totalCount > 5) {
      expect(data.list.length).toBe(5);
      expect(data.totalCount).toBeGreaterThan(5);
    } else {
      expect(data.list.length).toBe(data.totalCount);
    }
  });

  it("large page offset returns empty list (not error)", async () => {
    const { status, data } = await get("/api/tenant/scenario/crud", { page: 9999, size: 10 });
    expect(status).toBe(200);
    expect(data).toHaveProperty("list");
    expect(data).toHaveProperty("totalCount");
    // Scenarios returned should be empty for way-out-of-range page
    expect(Array.isArray(data.list)).toBe(true);
    // totalCount should still reflect actual total
    expect(data.totalCount).toBeGreaterThan(0);
  });
});
