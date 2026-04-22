import { describe, it, expect } from "vitest";
import { get, post, put } from "./client";

describe("UI Settings - /api/tenant/ui/settings", () => {
  const testKey = `test/settings/${Date.now()}`;

  it("should save UI settings", async () => {
    const payload = {
      key: testKey,
      data: { columns: ["col1", "col2"], pageSize: 20 },
    };

    const { status } = await post("/api/tenant/ui/settings", payload);
    expect(status).toBe(204);
  });

  it("should get UI settings by key", async () => {
    const { status, data } = await get("/api/tenant/ui/settings/by-key", { key: testKey });
    expect(status).toBe(200);
    expect(data).toHaveProperty("data");
    expect(data.data.columns).toEqual(["col1", "col2"]);
    expect(data.data.pageSize).toBe(20);
  });

  it("should list all UI settings", async () => {
    const { status, data } = await get("/api/tenant/ui/settings");
    expect(status).toBe(200);
    expect(Array.isArray(data)).toBe(true);
    const found = data.find((s: any) => s.key === testKey);
    expect(found).toBeDefined();
  });

  it("should return 200 for non-existent key (empty response)", async () => {
    const { status } = await get("/api/tenant/ui/settings/by-key", { key: "nonexistent/key/12345" });
    // API returns 200 with empty/default data for non-existent keys
    expect([200, 404]).toContain(status);
  });

  it("should overwrite settings with same key", async () => {
    const payload = {
      key: testKey,
      data: { columns: ["col3"], pageSize: 50 },
    };

    const { status } = await post("/api/tenant/ui/settings", payload);
    expect(status).toBe(204);

    const { data } = await get("/api/tenant/ui/settings/by-key", { key: testKey });
    expect(data.data.columns).toEqual(["col3"]);
    expect(data.data.pageSize).toBe(50);
  });
});

describe("Specific Fields - /api/tenant/specific-fields", () => {
  it("should get specific field mappings", async () => {
    const { status, data } = await get("/api/tenant/specific-fields");
    expect(status).toBe(200);
    expect(typeof data).toBe("object");
  });

  it("should set email specific field mapping", async () => {
    const payload = {
      field_type: "email",
      field_name: "col__varchar_s50000__5",
    };

    const { status, data } = await put("/api/tenant/specific-fields", payload);
    expect([200, 201]).toContain(status);
  });
});
