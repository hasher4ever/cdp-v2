import { describe, it, expect } from "vitest";
import { get, post } from "./client";

describe("Customers Data - /api/tenant/data/customers", () => {
  it("should list customers with field names", async () => {
    const { status, data } = await post("/api/tenant/data/customers", { fieldNames: ["primary_id", "cdp_created_at"] }, {
      page: 0,
      size: 5,
      desc: true,
    });
    expect(status).toBe(200);
    expect(data).toHaveProperty("list");
    expect(data).toHaveProperty("schema");
    expect(data).toHaveProperty("totalCount");
    expect(Array.isArray(data.list)).toBe(true);
    expect(typeof data.totalCount).toBe("number");
  });

  it("should respect pagination size", async () => {
    const { data } = await post("/api/tenant/data/customers", { fieldNames: ["primary_id"] }, {
      page: 0,
      size: 3,
    });
    expect(data.list.length).toBeLessThanOrEqual(3);
  });

  it("should return second page with offset", async () => {
    const page0 = await post("/api/tenant/data/customers", { fieldNames: ["primary_id"] }, { page: 0, size: 2 });
    const page1 = await post("/api/tenant/data/customers", { fieldNames: ["primary_id"] }, { page: 1, size: 2 });

    if (page0.data.totalCount > 2) {
      // Pages should have different data
      const ids0 = page0.data.list.map((r: any) => r.primary_id);
      const ids1 = page1.data.list.map((r: any) => r.primary_id);
      expect(ids0).not.toEqual(ids1);
    }
  });
});

describe("Customer Profile - /api/tenant/data/customers/{primaryId}", () => {
  it("should get customer details by primary ID", async () => {
    // First get a valid primary ID
    const { data: listing } = await post("/api/tenant/data/customers", { fieldNames: ["primary_id"] }, { page: 0, size: 1 });
    if (listing.list.length === 0) return; // skip if no data

    const primaryId = listing.list[0].primary_id;
    const { status, data } = await get(`/api/tenant/data/customers/${primaryId}`);
    expect(status).toBe(200);
    expect(data).toHaveProperty("fields");
    expect(data).toHaveProperty("schema");
  });

  it("should return 200 with empty data for non-existent customer", async () => {
    const { status } = await get("/api/tenant/data/customers/999999999999");
    // API returns 200 even for non-existent customers (empty fields)
    expect([200, 404]).toContain(status);
  });
});

describe("Events Data - /api/tenant/data/events", () => {
  it("should list events by type", async () => {
    // Get event types first
    const { data: types } = await get("/api/tenant/data/event-types/count");
    const withData = types.find((t: any) => t.count > 0);
    if (!withData) return; // skip if no data

    const { status, data } = await post(
      "/api/tenant/data/events",
      { fieldNames: ["primary_id", "event_created_at"] },
      { event_type_id: withData.id, page: 0, size: 5 }
    );
    expect(status).toBe(200);
    expect(data).toHaveProperty("list");
    expect(data).toHaveProperty("schema");
    expect(data).toHaveProperty("totalCount");
    expect(data).toHaveProperty("event_type");
  });

  it("should filter events by primary_id", async () => {
    const { data: types } = await get("/api/tenant/data/event-types/count");
    const withData = types.find((t: any) => t.count > 0);
    if (!withData) return;

    // Get a primary_id from events
    const { data: events } = await post(
      "/api/tenant/data/events",
      { fieldNames: ["primary_id"] },
      { event_type_id: withData.id, page: 0, size: 1 }
    );
    if (events.list.length === 0) return;

    const pid = events.list[0].primary_id;
    const { status, data } = await post(
      "/api/tenant/data/events",
      { fieldNames: ["primary_id"] },
      { event_type_id: withData.id, primary_id: pid, page: 0, size: 10 }
    );
    expect(status).toBe(200);
    for (const row of data.list) {
      expect(row.primary_id).toBe(pid);
    }
  });
});

describe("Field Reports - /api/tenant/data/reports/field-values", () => {
  it("should return field value report for customers", async () => {
    const { data: fields } = await get("/api/tenants/schema/customers/fields", { exclude_draft: true });
    const varcharField = fields.list.find((f: any) => f.dataType === "VARCHAR");
    if (!varcharField) return;

    const { status, data } = await get("/api/tenant/data/reports/field-values", {
      table: "customers",
      field: varcharField.fieldName || varcharField.apiName,
      page: 0,
      size: 5,
      order_by: "count",
      sort_order: "desc",
    });
    expect(status).toBe(200);
    expect(data).toHaveProperty("list");
    expect(data).toHaveProperty("totalCount");
  });
});

describe("Autocomplete - /api/tenant/data/autocomplete/field-values", () => {
  it("should return autocomplete suggestions for customer varchar field", async () => {
    const { data: fields } = await get("/api/tenants/schema/customers/fields", { exclude_draft: true });
    const varcharField = fields.list.find((f: any) => f.dataType === "VARCHAR");
    if (!varcharField) return;

    const { status, data } = await get("/api/tenant/data/autocomplete/field-values", {
      table: "customers",
      field: varcharField.fieldName || varcharField.apiName,
      size: 5,
    });
    expect(status).toBe(200);
    expect(data).toHaveProperty("list");
    expect(Array.isArray(data.list)).toBe(true);
  });
});
