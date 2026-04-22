import { describe, it, expect } from "vitest";
import { get } from "./client";

describe("Tenant Info - /api/tenants/info", () => {
  it("should return tenant info with customer and event fields", async () => {
    const { status, data } = await get("/api/tenants/info");
    expect(status).toBe(200);
    expect(data).toHaveProperty("customerFields");
    expect(data).toHaveProperty("eventFields");
    expect(Array.isArray(data.customerFields)).toBe(true);
    expect(Array.isArray(data.eventFields)).toBe(true);
  });

  it("should have valid field structure", async () => {
    const { data } = await get("/api/tenants/info");
    for (const field of data.customerFields) {
      expect(field).toHaveProperty("id");
      expect(field).toHaveProperty("name");
      expect(field).toHaveProperty("type");
      expect(field).toHaveProperty("nullable");
      expect(field).toHaveProperty("state");
      expect(field).toHaveProperty("flags");
      expect(field.flags).toHaveProperty("sortKey");
      expect(field.flags).toHaveProperty("tableBuildIn");
      expect(field.flags).toHaveProperty("internalUse");
    }
  });

  it("should include built-in fields (primary_id, cdp_created_at)", async () => {
    const { data } = await get("/api/tenants/info");
    const names = data.customerFields.map((f: any) => f.name);
    expect(names).toContain("primary_id");
    expect(names).toContain("cdp_created_at");
  });

  it("should include built-in event fields", async () => {
    const { data } = await get("/api/tenants/info");
    const names = data.eventFields.map((f: any) => f.name);
    expect(names).toContain("primary_id");
    expect(names).toContain("event_created_at");
    expect(names).toContain("cdp_event_id");
  });
});

describe("Data Count - /api/tenant/data/count", () => {
  it("should return customer and event counts", async () => {
    const { status, data } = await get("/api/tenant/data/count");
    expect(status).toBe(200);
    expect(data).toHaveProperty("customerCount");
    expect(data).toHaveProperty("eventCount");
    expect(typeof data.customerCount).toBe("number");
    expect(typeof data.eventCount).toBe("number");
    expect(data.customerCount).toBeGreaterThanOrEqual(0);
    expect(data.eventCount).toBeGreaterThanOrEqual(0);
  });
});

describe("Event Types Count - /api/tenant/data/event-types/count", () => {
  it("should return array of event type counts", async () => {
    const { status, data } = await get("/api/tenant/data/event-types/count");
    expect(status).toBe(200);
    expect(Array.isArray(data)).toBe(true);
    expect(data.length).toBeGreaterThan(0);
  });

  it("should have valid event type structure", async () => {
    const { data } = await get("/api/tenant/data/event-types/count");
    for (const item of data) {
      expect(item).toHaveProperty("id");
      expect(item).toHaveProperty("name");
      expect(item).toHaveProperty("count");
      expect(item).toHaveProperty("uid");
      expect(typeof item.count).toBe("number");
    }
  });
});

// Draft Schema Status tests moved to schema-lifecycle.test.ts (more thorough coverage there)
