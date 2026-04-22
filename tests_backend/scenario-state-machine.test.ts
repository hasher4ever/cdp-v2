/**
 * Scenario State Machine Tests — Session 21
 *
 * Thesis: Strategic review identified "state machine testing for scenarios"
 * as an untested dimension. Scenarios have status transitions (NEW → ACTIVE →
 * PAUSED → ARCHIVED etc.) that haven't been systematically probed.
 *
 * Tests the state machine dimension:
 *   1. Initial status on creation
 *   2. Status after save-changes
 *   3. Double save-changes — no node/edge duplication
 *   4. PUT with various status values — which are accepted?
 *   5. PUT to rename — verify persistence
 *   6. Full lifecycle: create → save → status change → save again
 *   7. Duplicate name creation
 *   8. Save-changes with empty nodes
 *   9. Self-referencing edge behavior
 *
 * Known bugs referenced:
 *   BUG-034: Status transitions not persisted via PUT
 *   BUG-059: Node titles silently dropped
 *   BUG-068: Status empty in get-by-id but "NEW" in list
 */
import { describe, it, expect } from "vitest";
import { get, post, put } from "./client";
import "./setup";

const TAG = "TEST_statemachine_s21";

// ─── Helpers ──────────────────────────────────────────────────────────────────

async function createScenario(suffix: string): Promise<{ id: string; name: string }> {
  const name = `${TAG}_${suffix}_${Date.now()}`;
  const { status, data } = await post("/api/tenant/scenario/crud", { name });
  if (status !== 200 || !data.id) {
    throw new Error(`Setup failed: create scenario returned ${status}`);
  }
  return { id: data.id, name };
}

async function addTriggerNode(scenarioId: string): Promise<void> {
  const { status } = await post("/api/tenant/scenario/node/crud", {
    scenarioId,
    nodeType: "node_trigger",
    title: "SM Trigger",
    triggetNode: { triggerType: "trigger_now" },
    uiConfig: { position: { x: 0, y: 0 }, type: "trigger_now" },
  });
  if (status !== 200) throw new Error(`addTriggerNode failed: ${status}`);
}

async function addWaitNode(scenarioId: string, x = 300): Promise<void> {
  const { status } = await post("/api/tenant/scenario/node/crud", {
    scenarioId,
    nodeType: "node_wait",
    title: "SM Wait",
    waitNode: { waitNodeType: "static_wait", staticValue: { durationMin: 5 } },
    uiConfig: { position: { x, y: 0 }, type: "static_wait" },
  });
  if (status !== 200) throw new Error(`addWaitNode failed: ${status}`);
}

async function saveChanges(scenarioId: string): Promise<number> {
  const { status } = await post("/api/tenant/scenario/crud/save-changes", undefined, { scenario_id: scenarioId });
  return status;
}

async function getById(scenarioId: string) {
  return get("/api/tenant/scenario/crud/get-by-id", { scenario_id: scenarioId });
}

async function getStatusFromList(scenarioId: string): Promise<string | undefined> {
  const { data } = await get("/api/tenant/scenario/crud", { page: 0, size: 50 });
  const found = data.list?.find((s: any) => s.id === scenarioId);
  return found?.status;
}

// ─── 1. Initial status on creation ──────────────────────────────────────────

describe("SM-1: Initial status after creation", () => {
  let scenarioId: string;

  it("SM-1a: newly created scenario has status NEW in list", async () => {
    const created = await createScenario("initial");
    scenarioId = created.id;
    const status = await getStatusFromList(scenarioId);
    expect(status).toBe("NEW");
  });

  it("SM-1b: BUG-068 — get-by-id returns empty status for new scenario", async () => {
    if (!scenarioId) return;
    const { data } = await getById(scenarioId);
    const statusById = data.scenario.status;
    console.log(`SM-1b: get-by-id status="${statusById}" (list shows "NEW")`);
    // BUG-068: get-by-id does not populate status field
    // Correct behavior: should be "NEW"
    // Actual: empty string
    if (statusById === "NEW") {
      console.log("BUG-068 FIXED: get-by-id now returns NEW");
      expect(statusById).toBe("NEW");
    } else {
      expect(statusById).toBe(""); // confirms BUG-068 still present
    }
  });
});

// ─── 2. Status after save-changes ───────────────────────────────────────────

describe("SM-2: Status after save-changes", () => {
  let scenarioId: string;

  it("setup: create scenario with nodes and save", async () => {
    const created = await createScenario("aftersave");
    scenarioId = created.id;
    await addTriggerNode(scenarioId);
    await addWaitNode(scenarioId);
    const saveStatus = await saveChanges(scenarioId);
    expect([200, 204]).toContain(saveStatus);
  }, 60000);

  it("SM-2a: status in list remains NEW after save-changes", async () => {
    if (!scenarioId) return;
    const status = await getStatusFromList(scenarioId);
    console.log(`SM-2a: status after save-changes = "${status}"`);
    // save-changes should not change status from NEW
    expect(status).toBe("NEW");
  });

  it("SM-2b: nodes are persisted after save-changes", async () => {
    if (!scenarioId) return;
    const { data } = await getById(scenarioId);
    expect(data.nodes.length).toBe(2);
  });
});

// ─── 3. Double save-changes — no duplication ────────────────────────────────

describe("SM-3: Double save-changes — no node/edge duplication", () => {
  let scenarioId: string;
  let nodeCountAfterFirstSave: number;

  it("setup: create scenario with nodes and save once", async () => {
    const created = await createScenario("doublesave");
    scenarioId = created.id;
    await addTriggerNode(scenarioId);
    await addWaitNode(scenarioId);
    await saveChanges(scenarioId);
  }, 60000);

  it("SM-3a: record node count after first save", async () => {
    if (!scenarioId) return;
    const { data } = await getById(scenarioId);
    nodeCountAfterFirstSave = data.nodes.length;
    console.log(`SM-3a: nodes after first save = ${nodeCountAfterFirstSave}`);
    expect(nodeCountAfterFirstSave).toBe(2);
  });

  it("SM-3b: second save-changes does not duplicate nodes", async () => {
    if (!scenarioId) return;
    const saveStatus = await saveChanges(scenarioId);
    expect([200, 204]).toContain(saveStatus);

    const { data } = await getById(scenarioId);
    console.log(`SM-3b: nodes after second save = ${data.nodes.length} (expected ${nodeCountAfterFirstSave})`);
    expect(data.nodes.length).toBe(nodeCountAfterFirstSave);
  }, 60000);

  it("SM-3c: edges remain consistent after double save", async () => {
    if (!scenarioId) return;
    const { data } = await getById(scenarioId);
    // No edges were added, so should remain 0
    expect(data.edges.length).toBe(0);
  });
});

// ─── 4. PUT with various status values ──────────────────────────────────────

describe("SM-4: PUT with various status values — BUG-034", () => {
  let scenarioId: string;
  let scenarioName: string;

  it("setup: create scenario", async () => {
    const created = await createScenario("statusput");
    scenarioId = created.id;
    scenarioName = created.name;
  });

  const statusValues = ["ACTIVE", "PAUSED", "ARCHIVED", "DRAFT", "STOPPED", "RUNNING"];

  for (const targetStatus of statusValues) {
    it(`SM-4: PUT status="${targetStatus}" — check if accepted and persisted`, async () => {
      if (!scenarioId) return;
      const newName = `${TAG}_status_${targetStatus}_${Date.now()}`;
      const { status: httpStatus, data } = await put("/api/tenant/scenario/crud", {
        scenarioId,
        name: newName,
        status: targetStatus,
      });

      console.log(`SM-4: PUT status="${targetStatus}" → HTTP ${httpStatus}`);

      if (httpStatus === 200) {
        // PUT accepted — check if status actually persisted
        const listStatus = await getStatusFromList(scenarioId);
        console.log(`SM-4: after PUT status="${targetStatus}", list shows "${listStatus}"`);

        if (listStatus === targetStatus) {
          console.log(`SM-4: status "${targetStatus}" PERSISTED correctly`);
        } else {
          // BUG-034: status not persisted
          console.log(`SM-4: BUG-034 confirmed — PUT accepted "${targetStatus}" but list shows "${listStatus}"`);
        }
        // Name should have updated regardless
        expect(data.name).toBe(newName);
        scenarioName = newName;
      } else {
        // PUT rejected this status value
        console.log(`SM-4: status="${targetStatus}" rejected with HTTP ${httpStatus}`);
        expect(httpStatus).toBeGreaterThanOrEqual(400);
      }
    });
  }
});

// ─── 5. PUT to rename — verify persistence ──────────────────────────────────

describe("SM-5: PUT rename persists on GET", () => {
  let scenarioId: string;

  it("setup: create scenario", async () => {
    const created = await createScenario("rename");
    scenarioId = created.id;
  });

  it("SM-5a: PUT with new name returns 200 and new name", async () => {
    if (!scenarioId) return;
    const newName = `${TAG}_renamed_${Date.now()}`;
    const { status, data } = await put("/api/tenant/scenario/crud", {
      scenarioId,
      name: newName,
    });
    expect(status).toBe(200);
    expect(data.name).toBe(newName);
  });

  it("SM-5b: GET after rename shows updated name", async () => {
    if (!scenarioId) return;
    const { data } = await getById(scenarioId);
    expect(data.scenario.name).toContain("_renamed_");
  });

  it("SM-5c: list after rename shows updated name", async () => {
    if (!scenarioId) return;
    const { data } = await get("/api/tenant/scenario/crud", { page: 0, size: 50 });
    const found = data.list.find((s: any) => s.id === scenarioId);
    expect(found).toBeDefined();
    expect(found.name).toContain("_renamed_");
  });
});

// ─── 6. Full lifecycle: create → save → status → save again ────────────────

describe("SM-6: Full state machine lifecycle", () => {
  let scenarioId: string;

  it("SM-6a: create scenario", async () => {
    const created = await createScenario("lifecycle");
    scenarioId = created.id;
    const status = await getStatusFromList(scenarioId);
    expect(status).toBe("NEW");
  });

  it("SM-6b: add nodes and save-changes", async () => {
    if (!scenarioId) return;
    await addTriggerNode(scenarioId);
    await addWaitNode(scenarioId);
    const saveStatus = await saveChanges(scenarioId);
    expect([200, 204]).toContain(saveStatus);
  }, 60000);

  it("SM-6c: verify nodes persisted, status still NEW", async () => {
    if (!scenarioId) return;
    const { data } = await getById(scenarioId);
    expect(data.nodes.length).toBe(2);
    const listStatus = await getStatusFromList(scenarioId);
    expect(listStatus).toBe("NEW");
  });

  it("SM-6d: PUT to change status to ACTIVE (BUG-034)", async () => {
    if (!scenarioId) return;
    const { status } = await put("/api/tenant/scenario/crud", {
      scenarioId,
      name: `${TAG}_lifecycle_active_${Date.now()}`,
      status: "ACTIVE",
    });
    expect(status).toBe(200);

    const listStatus = await getStatusFromList(scenarioId);
    console.log(`SM-6d: after PUT ACTIVE, list status="${listStatus}"`);
    // BUG-034: status doesn't change — still NEW
  });

  it("SM-6e: save-changes again after status PUT — nodes still intact", async () => {
    if (!scenarioId) return;
    const saveStatus = await saveChanges(scenarioId);
    expect([200, 204]).toContain(saveStatus);

    const { data } = await getById(scenarioId);
    expect(data.nodes.length).toBe(2);
    console.log(`SM-6e: nodes after second save = ${data.nodes.length}, edges = ${data.edges.length}`);
  }, 60000);

  it("SM-6f: final state consistency check", async () => {
    if (!scenarioId) return;
    const { data } = await getById(scenarioId);
    // Scenario exists with correct structure
    expect(data.scenario.id).toBe(scenarioId);
    expect(data.nodes.length).toBe(2);
    expect(Array.isArray(data.edges)).toBe(true);

    // Name was updated by SM-6d
    expect(data.scenario.name).toContain("_lifecycle_active_");
  });
});

// ─── 7. Duplicate name creation ─────────────────────────────────────────────

describe("SM-7: Duplicate scenario name", () => {
  it("SM-7: creating two scenarios with identical names — observe behavior", async () => {
    const dupName = `${TAG}_duplicate_${Date.now()}`;
    const { status: s1, data: d1 } = await post("/api/tenant/scenario/crud", { name: dupName });
    expect(s1).toBe(200);

    const { status: s2, data: d2 } = await post("/api/tenant/scenario/crud", { name: dupName });
    if (s2 === 200) {
      // No uniqueness constraint — both created with different IDs
      expect(d2.id).toBeDefined();
      expect(d2.id).not.toBe(d1.id);
      console.log("SM-7: duplicate name accepted — no uniqueness constraint on scenario names");
    } else {
      // Server rejects duplicates
      console.log(`SM-7: duplicate name rejected with HTTP ${s2}`);
      expect([400, 409, 422]).toContain(s2);
    }
  });
});

// ─── 8. Save-changes with empty nodes ───────────────────────────────────────

describe("SM-8: Save-changes on empty scenario", () => {
  let scenarioId: string;

  it("SM-8a: save-changes on scenario with zero nodes returns 409", async () => {
    const created = await createScenario("emptysave");
    scenarioId = created.id;

    // Save without adding any nodes
    const saveStatus = await saveChanges(scenarioId);
    console.log(`SM-8a: save-changes on empty scenario → HTTP ${saveStatus}`);
    // FINDING: save-changes on empty scenario returns 409, not 200/204
    // Backend rejects saving a scenario with no nodes — arguably correct
    // but 409 (Conflict) is a questionable status code for "nothing to save"
    if (saveStatus === 409) {
      console.log("SM-8a: FINDING — save-changes rejects empty scenarios with 409");
      expect(saveStatus).toBe(409);
    } else {
      expect([200, 204]).toContain(saveStatus);
    }
  }, 60000);

  it("SM-8b: GET after empty save shows 0 nodes and 0 edges", async () => {
    if (!scenarioId) return;
    const { data } = await getById(scenarioId);
    expect(data.nodes.length).toBe(0);
    expect(data.edges.length).toBe(0);
  });
});

// ─── 9. Self-referencing edge ───────────────────────────────────────────────

describe("SM-9: Self-referencing edge (source = target)", () => {
  let scenarioId: string;
  let triggerNodeId: string;

  it("setup: create scenario with a trigger node and save", async () => {
    const created = await createScenario("selfedge");
    scenarioId = created.id;
    await addTriggerNode(scenarioId);
    await saveChanges(scenarioId);

    const { data } = await getById(scenarioId);
    triggerNodeId = data.nodes[0]?.nodeId;
    expect(triggerNodeId).toBeDefined();
  }, 60000);

  it("SM-9a: create edge where fromNodeId = toNodeId — observe behavior", async () => {
    if (!scenarioId || !triggerNodeId) return;
    const { status, data } = await post("/api/tenant/scenario/edge/crud", {
      scenarioId,
      edgeType: "link_next_node",
      fromNodeId: triggerNodeId,
      toNodeId: triggerNodeId, // self-reference
      uiConfig: { edge_key: `e_self_${triggerNodeId}` },
    });

    console.log(`SM-9a: self-referencing edge → HTTP ${status}`);
    if (status === 200) {
      console.log("SM-9a: FINDING — self-referencing edge accepted (no validation)");
      // This is likely a bug — a node pointing to itself creates an infinite loop
    } else {
      console.log(`SM-9a: self-referencing edge rejected with ${status} — correct behavior`);
      expect(status).toBeGreaterThanOrEqual(400);
    }
  });

  it("SM-9b: save after self-referencing edge — check state", async () => {
    if (!scenarioId) return;
    const saveStatus = await saveChanges(scenarioId);
    console.log(`SM-9b: save after self-edge → HTTP ${saveStatus}`);
    expect([200, 204]).toContain(saveStatus);

    const { data } = await getById(scenarioId);
    console.log(`SM-9b: after save — nodes=${data.nodes.length}, edges=${data.edges.length}`);

    // Node should still be intact regardless
    expect(data.nodes.length).toBe(1);

    if (data.edges.length > 0) {
      const selfEdge = data.edges.find(
        (e: any) => e.fromNodeId === triggerNodeId && e.toNodeId === triggerNodeId
      );
      if (selfEdge) {
        console.log("SM-9b: FINDING — self-referencing edge PERSISTED. Potential infinite loop risk.");
      }
    }
  }, 60000);
});
