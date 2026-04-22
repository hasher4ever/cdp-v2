import { describe, it, expect } from "vitest";
import { get } from "./client";

describe("Scenarios - /api/tenant/scenario/crud", () => {
  it("should list scenarios with pagination", async () => {
    const { status, data } = await get("/api/tenant/scenario/crud", { page: 0, size: 10 });
    expect(status).toBe(200);
    expect(data).toHaveProperty("list");
    expect(Array.isArray(data.list)).toBe(true);
  });

  it("should have valid scenario structure", async () => {
    const { data } = await get("/api/tenant/scenario/crud", { page: 0, size: 10 });
    for (const item of data.list) {
      expect(item).toHaveProperty("id");
      expect(item).toHaveProperty("name");
      expect(item).toHaveProperty("createdAt");
      expect(item).toHaveProperty("status");
      expect(typeof item.name).toBe("string");
      expect(typeof item.status).toBe("string");
    }
  });

  it("should respect page size limit", async () => {
    const { data } = await get("/api/tenant/scenario/crud", { page: 0, size: 2 });
    expect(data.list.length).toBeLessThanOrEqual(2);
  });
});
