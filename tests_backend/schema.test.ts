import { describe, it, expect } from "vitest";
import { get, post } from "./client";

describe("Customer Schema Fields - /api/tenants/schema/customers/fields", () => {
  it("should list customer fields", async () => {
    const { status, data } = await get("/api/tenants/schema/customers/fields", { exclude_draft: true });
    expect(status).toBe(200);
    expect(data).toHaveProperty("list");
    expect(Array.isArray(data.list)).toBe(true);
    expect(data.list.length).toBeGreaterThan(0);
  });

  it("should return valid field objects", async () => {
    const { data } = await get("/api/tenants/schema/customers/fields", { exclude_draft: true });
    for (const field of data.list) {
      expect(field).toHaveProperty("id");
      expect(field).toHaveProperty("apiName");
      expect(field).toHaveProperty("displayName");
      expect(field).toHaveProperty("dataType");
      expect(field).toHaveProperty("status");
      expect(field).toHaveProperty("flagMulti");
      expect(field).toHaveProperty("flagSystemField");
      expect(field).toHaveProperty("access");
      expect(["BOOL", "BIGINT", "DOUBLE", "VARCHAR", "DATE", "DATETIME", "JSON"]).toContain(field.dataType);
      expect(["field_draft", "field_not_ready", "field_ready"]).toContain(field.status);
    }
  });

  it("should include draft fields when exclude_draft is false", async () => {
    const { status, data } = await get("/api/tenants/schema/customers/fields", { exclude_draft: false });
    expect(status).toBe(200);
    expect(data).toHaveProperty("list");
  });
});

describe("Event Types - /api/tenants/schema/event-types", () => {
  it("should list event types", async () => {
    const { status, data } = await get("/api/tenants/schema/event-types", { exclude_draft: true });
    expect(status).toBe(200);
    expect(data).toHaveProperty("list");
    expect(Array.isArray(data.list)).toBe(true);
    expect(data.list.length).toBeGreaterThan(0);
  });

  it("should return valid event type objects", async () => {
    const { data } = await get("/api/tenants/schema/event-types", { exclude_draft: true });
    for (const et of data.list) {
      expect(et).toHaveProperty("eventTypeName");
      expect(et).toHaveProperty("eventTypeId");
      expect(et).toHaveProperty("systemEvent");
      expect(et).toHaveProperty("draft");
      expect(et).toHaveProperty("uid");
      expect(typeof et.eventTypeId).toBe("number");
      expect(typeof et.draft).toBe("boolean");
    }
  });

  it("should get event type by id", async () => {
    const { data: list } = await get("/api/tenants/schema/event-types", { exclude_draft: true });
    const first = list.list[0];
    const { status, data } = await get("/api/tenants/schema/event-types/get-by-id", { id: first.uid });
    expect(status).toBe(200);
    expect(data.uid).toBe(first.uid);
    expect(data.eventTypeName).toBe(first.eventTypeName);
  });
});

describe("Event Type Fields - /api/tenants/schema/events/fields/{eventTypeId}", () => {
  it("should list fields for an event type", async () => {
    const { data: types } = await get("/api/tenants/schema/event-types", { exclude_draft: true });
    const eventTypeId = types.list[0].eventTypeId;
    const { status, data } = await get(`/api/tenants/schema/events/fields/${eventTypeId}`, { exclude_draft: true });
    expect(status).toBe(200);
    expect(data).toHaveProperty("list");
    expect(Array.isArray(data.list)).toBe(true);
  });
});

describe("Validate API Name", () => {
  it("should validate a valid customer api name", async () => {
    const { status, data } = await post("/api/tenants/schema/customers/validate-api-name", undefined, {
      api_name: "test_valid_field_name",
    });
    expect(status).toBe(200);
    expect(data).toHaveProperty("valid");
    expect(data).toHaveProperty("message");
  });

  it("should reject invalid api name (uppercase) with 400", async () => {
    const { status } = await post("/api/tenants/schema/customers/validate-api-name", undefined, {
      api_name: "INVALID",
    });
    // API returns 400 for invalid pattern (OpenAPI validation rejects uppercase)
    expect(status).toBe(400);
  });

  it("should check event type name existence", async () => {
    const { status, data } = await post("/api/tenants/schema/event-types-name-exists", undefined, {
      name: "purchase",
    });
    expect(status).toBe(200);
    expect(data).toHaveProperty("exists");
    expect(data.exists).toBe(true);
  });

  it("should return false for non-existent event type name", async () => {
    const { status, data } = await post("/api/tenants/schema/event-types-name-exists", undefined, {
      name: "nonexistent_event_type_xyz",
    });
    expect(status).toBe(200);
    expect(data.exists).toBe(false);
  });
});

describe("Internal Fields Info - /api/tenants/schema/internal/{table}/fields/info", () => {
  it("should return customers field info", async () => {
    const { status, data } = await get("/api/tenants/schema/internal/customers/fields/info");
    expect(status).toBe(200);
    expect(data).toHaveProperty("fields");
    expect(Array.isArray(data.fields)).toBe(true);
  });

  it("should return events field info", async () => {
    const { status, data } = await get("/api/tenants/schema/internal/events/fields/info");
    expect(status).toBe(200);
    expect(data).toHaveProperty("fields");
    expect(Array.isArray(data.fields)).toBe(true);
  });
});
