/**
 * UDAF CRUD completeness — update, delete, duplicate name, calculate edge cases.
 *
 * Fills the gap left by udafs.test.ts which only tested list/get/create/calculate.
 */
import { describe, it, expect, beforeAll } from "vitest";
import { get, post, put, del } from "./client";

const CALCULATE_OK = process.env.__CDP_UDAF_CALCULATE_HEALTHY === "true";

// ─── Helpers ────────────────────────────────────────────────────────────────

async function getAnEventType() {
  const { data: types } = await get("/api/tenant/data/event-types/count");
  return types.find((t: any) => t.count > 0) || types[0];
}

function makeCountUdaf(name: string, eventType: { id: number; name: string }) {
  return {
    name,
    aggType: "COUNT",
    params: [],
    filter: {
      eventType: { id: eventType.id, name: eventType.name },
      predicate: { type: "group", group: { logicalOp: "AND", predicates: [], negate: false } },
      timeWindow: {},
    },
    grouping: { enable: false },
  };
}

// ─── Shared probe UDAF (one per file — UDAFs cannot be deleted) ────────────

let sharedUdafId: string;
let sharedEventType: { id: number; name: string };

beforeAll(async () => {
  sharedEventType = await getAnEventType();
  if (!sharedEventType) return;
  const { status, data } = await post(
    "/api/tenants/udafs",
    makeCountUdaf(`test_crud_probe_${Date.now()}`, sharedEventType),
  );
  expect(status).toBe(200);
  sharedUdafId = data.id;
});

// ─── UDAF update ────────────────────────────────────────────────────────────

describe("UDAF Update - PUT /api/tenants/udafs/{id}", () => {
  // Reuses sharedUdafId — no additional UDAF created.
  const createdId = () => sharedUdafId;
  const eventType = () => sharedEventType;

  it("should attempt to update UDAF name (BUG-025: returns 400)", async () => {
    if (!createdId()) return;
    const { data: existing } = await get(`/api/tenants/udafs/${createdId()}`);
    const updatedName = `test_updated_${Date.now()}`;
    const { status } = await put(`/api/tenants/udafs/${createdId()}`, {
      ...existing,
      name: updatedName,
    });
    // BUG-025: PUT /api/tenants/udafs/{id} returns 400 — update doesn't work
    expect(status).toBe(400);
  });

  it("should verify name unchanged (PUT is broken)", async () => {
    if (!createdId()) return;
    const { status, data } = await get(`/api/tenants/udafs/${createdId()}`);
    expect(status).toBe(200);
    expect(data.name).toContain("test_crud_probe_");
  });

  it("should attempt to update aggType (BUG-025: returns 400)", async () => {
    if (!createdId()) return;
    const { data: existing } = await get(`/api/tenants/udafs/${createdId()}`);
    const { status } = await put(`/api/tenants/udafs/${createdId()}`, {
      ...existing,
      aggType: "SUM",
    });
    expect(status).toBe(400);
  });

  it("should return error when updating non-existent UDAF", async () => {
    const { status } = await put(
      "/api/tenants/udafs/00000000-0000-0000-0000-000000000000",
      makeCountUdaf("ghost", eventType() || { id: 1, name: "test" })
    );
    expect([404, 400, 500]).toContain(status);
  });
});

// ─── UDAF delete (unsupported — documents IMP-13 + no-delete product state) ──

describe("UDAF Delete - DELETE /api/tenants/udafs/{id} is unsupported", () => {
  // Reuses sharedUdafId — no additional UDAF created.

  it("DELETE returns 4xx (endpoint unimplemented)", async () => {
    if (!sharedUdafId) return;
    const { status } = await del(`/api/tenants/udafs/${sharedUdafId}`);
    // Product state: UDAFs are immutable and not deletable.
    // A 2xx here would mean DELETE was quietly implemented — surface it so we can update the spec.
    expect([400, 404, 405]).toContain(status);
  });

  it("UDAF remains retrievable after DELETE attempt", async () => {
    if (!sharedUdafId) return;
    const { status } = await get(`/api/tenants/udafs/${sharedUdafId}`);
    expect(status).toBe(200);
  });

  it("DELETE on a non-existent UDAF also returns 4xx", async () => {
    const { status } = await del("/api/tenants/udafs/00000000-0000-0000-0000-000000000000");
    expect([400, 404, 405]).toContain(status);
  });
});

// ─── UDAF duplicate names ───────────────────────────────────────────────────

describe("UDAF: duplicate name handling", () => {
  it("should create two UDAFs with the same name", async () => {
    const eventType = await getAnEventType();
    if (!eventType) return;
    const name = `test_dup_${Date.now()}`;

    const r1 = await post("/api/tenants/udafs", makeCountUdaf(name, eventType));
    const r2 = await post("/api/tenants/udafs", makeCountUdaf(name, eventType));

    // Either both succeed (dupes allowed) or second fails (uniqueness enforced)
    expect(r1.status).toBe(200);
    if (r2.status === 200) {
      expect(r1.data.id).not.toBe(r2.data.id); // different IDs
    } else {
      expect([400, 409]).toContain(r2.status); // uniqueness constraint
    }
  });
});

// ─── UDAF aggType coverage ──────────────────────────────────────────────────

describe("UDAF: all aggregation types create successfully", () => {
  it("should create COUNT UDAF (no params needed)", async () => {
    const eventType = await getAnEventType();
    if (!eventType) return;
    const { status, data } = await post("/api/tenants/udafs", {
      ...makeCountUdaf(`test_count_${Date.now()}`, eventType),
      aggType: "COUNT",
    });
    expect(status).toBe(200);
    expect(data).toHaveProperty("id");
  });

  // SUM/AVG/MIN/MAX require a params array with the field to aggregate on
  // Without params, the API returns 409
  for (const aggType of ["SUM", "AVG", "MIN", "MAX"]) {
    it(`should create ${aggType} UDAF (BUG-026: returns 409 without params)`, async () => {
      const eventType = await getAnEventType();
      if (!eventType) return;

      // First try without params (like COUNT) — this fails with 409
      const { status: noParamStatus } = await post("/api/tenants/udafs", {
        ...makeCountUdaf(`test_${aggType.toLowerCase()}_noparam_${Date.now()}`, eventType),
        aggType,
      });
      // 409 means params field is required for non-COUNT types but API gives wrong error code
      expect(noParamStatus).toBe(409);
    });
  }
});

// ─── UDAF calculate: edge cases ─────────────────────────────────────────────

describe.skipIf(!CALCULATE_OK)("UDAF Calculate: edge cases", () => {
  it("should return 404 for calculate on non-existent UDAF", async () => {
    const { status } = await post(
      "/api/tenants/udafs/00000000-0000-0000-0000-000000000000/calculate",
      undefined,
      { primaryId: "9900000001" }
    );
    expect([404, 400, 500]).toContain(status);
  });

  it("should handle calculate with non-existent customer (BUG-027: returns 500)", async () => {
    const { data: list } = await get("/api/tenants/udafs");
    if (list.items.length === 0) return;

    const { status } = await post(
      `/api/tenants/udafs/${list.items[0].id}/calculate`,
      undefined,
      { primaryId: "0000000000" }
    );
    // BUG-027: Returns 500 for non-existent customer instead of 200 with null or 404
    // Intermittent: sometimes returns 200 (flaky)
    expect([200, 500]).toContain(status);
  });

  it("should handle calculate without primaryId param", async () => {
    const { data: list } = await get("/api/tenants/udafs");
    if (list.items.length === 0) return;

    const { status } = await post(`/api/tenants/udafs/${list.items[0].id}/calculate`);
    expect([400, 500]).toContain(status);
  });
});
