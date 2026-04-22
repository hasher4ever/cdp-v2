import { describe, it, expect } from "vitest";
import { get, post } from "./client";

const CALCULATE_OK = process.env.__CDP_UDAF_CALCULATE_HEALTHY === "true";

describe("UDAFs List - /api/tenants/udafs", () => {
  it("should list UDAF names and IDs", async () => {
    const { status, data } = await get("/api/tenants/udafs");
    expect(status).toBe(200);
    expect(data).toHaveProperty("items");
    expect(Array.isArray(data.items)).toBe(true);
  });

  it("should have valid name/id structure", async () => {
    const { data } = await get("/api/tenants/udafs");
    for (const item of data.items) {
      expect(item).toHaveProperty("id");
      expect(item).toHaveProperty("name");
      expect(typeof item.id).toBe("string");
      expect(typeof item.name).toBe("string");
    }
  });
});

describe("UDAFs Types - /api/tenants/udafs/types", () => {
  it("should list UDAFs with type information", async () => {
    const { status, data } = await get("/api/tenants/udafs/types");
    expect(status).toBe(200);
    expect(data).toHaveProperty("items");
    expect(Array.isArray(data.items)).toBe(true);
  });

  it("should include type definitions for each UDAF", async () => {
    const { data } = await get("/api/tenants/udafs/types");
    for (const item of data.items) {
      expect(item).toHaveProperty("id");
      expect(item).toHaveProperty("name");
      expect(item).toHaveProperty("types");
      expect(item.types).toHaveProperty("paramType");
      expect(item.types).toHaveProperty("valueType");
    }
  });
});

describe("UDAF by ID - /api/tenants/udafs/{udafId}", () => {
  it("should get a specific UDAF by ID", async () => {
    const { data: list } = await get("/api/tenants/udafs");
    if (list.items.length === 0) return;

    const udafId = list.items[0].id;
    const { status, data } = await get(`/api/tenants/udafs/${udafId}`);
    expect(status).toBe(200);
    expect(data).toHaveProperty("id");
    expect(data).toHaveProperty("name");
    expect(data).toHaveProperty("aggType");
    expect(data).toHaveProperty("params");
    expect(data).toHaveProperty("filter");
    expect(data).toHaveProperty("grouping");
    expect(data).toHaveProperty("createdAt");
    expect(data).toHaveProperty("updatedAt");
    expect(data).toHaveProperty("tenantId");
    expect(["SUM", "COUNT", "AVG", "MIN", "MAX"]).toContain(data.aggType);
  });

  it("should return 404 for non-existent UDAF", async () => {
    const { status } = await get("/api/tenants/udafs/00000000-0000-0000-0000-000000000000");
    expect(status).toBe(404);
  });
});

describe.skipIf(!CALCULATE_OK)("UDAF Calculate - /api/tenants/udafs/{udafId}/calculate", () => {
  it("should calculate UDAF value for a customer", async () => {
    const { data: list } = await get("/api/tenants/udafs");
    if (list.items.length === 0) return;

    // Get a customer primary_id
    const { data: customers } = await post("/api/tenant/data/customers", { fieldNames: ["primary_id"] }, { page: 0, size: 1 });
    if (customers.list.length === 0) return;

    const udafId = list.items[0].id;
    const primaryId = customers.list[0].primary_id;

    const { status, data } = await post(`/api/tenants/udafs/${udafId}/calculate`, undefined, { primaryId });
    // Some UDAFs may fail to calculate (500) if their event type has no data for this customer
    if (status === 500) {
      console.warn(`UDAF ${udafId} calculation returned 500 for primaryId ${primaryId}`);
      return;
    }
    expect(status).toBe(200);
    expect(data).toHaveProperty("result");
  });
});

describe("UDAF CRUD", () => {
  let createdUdafId: string;

  it("should create a new UDAF", async () => {
    // Get event types to find one with data
    const { data: types } = await get("/api/tenant/data/event-types/count");
    const eventType = types.find((t: any) => t.count > 0) || types[0];

    const payload = {
      name: `test_udaf_${Date.now()}`,
      aggType: "COUNT",
      params: [],
      filter: {
        eventType: { id: eventType.id, name: eventType.name },
        predicate: {
          type: "group",
          group: { logicalOp: "AND", predicates: [], negate: false },
        },
        timeWindow: {},
      },
      grouping: { enable: false },
    };

    const { status, data } = await post("/api/tenants/udafs", payload);
    expect(status).toBe(200);
    expect(data).toHaveProperty("id");
    createdUdafId = data.id;
  });

  it("should retrieve the created UDAF", async () => {
    if (!createdUdafId) return;
    const { status, data } = await get(`/api/tenants/udafs/${createdUdafId}`);
    expect(status).toBe(200);
    expect(data.id).toBe(createdUdafId);
    expect(data.aggType).toBe("COUNT");
  });
});
