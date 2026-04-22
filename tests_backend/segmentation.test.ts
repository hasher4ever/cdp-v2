import { describe, it, expect } from "vitest";
import { get, post, put } from "./client";

describe("Segmentation List - /api/tenants/segmentation", () => {
  it("should list segmentations with pagination", async () => {
    const { status, data } = await get("/api/tenants/segmentation", { page: 0, size: 10 });
    expect(status).toBe(200);
    expect(data).toHaveProperty("items");
    expect(data).toHaveProperty("totalCount");
    expect(Array.isArray(data.items)).toBe(true);
    expect(typeof data.totalCount).toBe("number");
  });

  it("should return valid segmentation items", async () => {
    const { data } = await get("/api/tenants/segmentation", { page: 0, size: 10 });
    for (const item of data.items) {
      expect(item).toHaveProperty("id");
      expect(item).toHaveProperty("name");
      expect(typeof item.id).toBe("string");
      expect(typeof item.name).toBe("string");
    }
  });

  it("should respect page size", async () => {
    const { data } = await get("/api/tenants/segmentation", { page: 0, size: 2 });
    expect(data.items.length).toBeLessThanOrEqual(2);
  });
});

describe("Segmentation Details - /api/tenants/segmentation/{id}", () => {
  it("should get segmentation details by ID", async () => {
    const { data: list } = await get("/api/tenants/segmentation", { page: 0, size: 1 });
    if (list.items.length === 0) return;

    const segId = list.items[0].id;
    const { status, data } = await get(`/api/tenants/segmentation/${segId}`);
    expect(status).toBe(200);
    expect(data).toHaveProperty("id");
    expect(data).toHaveProperty("name");
    expect(data).toHaveProperty("segments");
    expect(data).toHaveProperty("createdAt");
    expect(data).toHaveProperty("updatedAt");
    expect(Array.isArray(data.segments)).toBe(true);
  });

  it("should have valid segment structure", async () => {
    const { data: list } = await get("/api/tenants/segmentation", { page: 0, size: 1 });
    if (list.items.length === 0) return;

    const { data } = await get(`/api/tenants/segmentation/${list.items[0].id}`);
    for (const segment of data.segments) {
      expect(segment).toHaveProperty("id");
      expect(segment).toHaveProperty("name");
      expect(segment).toHaveProperty("customerProfileFilter");
    }
  });

  it("should return 404 for non-existent segmentation", async () => {
    const { status } = await get("/api/tenants/segmentation/00000000-0000-0000-0000-000000000000");
    expect(status).toBe(404);
  });
});

describe("Segmentation CRUD", () => {
  let createdSegId: string;
  let createdSegmentIds: string[] = [];

  it("should create a new segmentation", async () => {
    const payload = {
      name: `test_seg_${Date.now()}`,
      segments: [
        {
          name: "Segment A",
          customerProfileFilter: {
            type: "group" as const,
            group: { logicalOp: "AND" as const, predicates: [], negate: false },
          },
        },
      ],
    };

    const { status, data } = await post("/api/tenants/segmentation", payload);
    expect(status).toBe(200);
    expect(data).toHaveProperty("id");
    expect(data).toHaveProperty("name");
    expect(data).toHaveProperty("segments");
    createdSegId = data.id;
    createdSegmentIds = data.segments.map((s: any) => s.id);
  });

  it("should update the created segmentation", async () => {
    if (!createdSegId) return;
    const updatedPayload = {
      name: `test_seg_updated_${Date.now()}`,
      segments: [
        {
          id: createdSegmentIds[0],
          name: "Segment A Updated",
          customerProfileFilter: {
            type: "group" as const,
            group: { logicalOp: "AND" as const, predicates: [], negate: false },
          },
        },
      ],
    };

    const { status, data } = await put(`/api/tenants/segmentation/${createdSegId}`, updatedPayload);
    expect(status).toBe(200);
    expect(data.name).toContain("test_seg_updated_");
  });
});

describe("Segmentation Preview - /api/tenants/segmentation/preview", () => {
  it("should preview segmentation with empty filter (all customers)", async () => {
    const payload = {
      segmentation: {
        name: "preview_test",
        segments: [
          {
            name: "All",
            customerProfileFilter: {
              type: "group",
              group: { logicalOp: "AND", predicates: [], negate: false },
            },
          },
        ],
      },
    };

    const { status, data } = await post("/api/tenants/segmentation/preview", payload);
    expect(status).toBe(200);
    expect(data).toHaveProperty("segments");
    expect(Array.isArray(data.segments)).toBe(true);
    for (const seg of data.segments) {
      expect(seg).toHaveProperty("name");
      expect(seg).toHaveProperty("numberOfCustomer");
      expect(typeof seg.numberOfCustomer).toBe("number");
    }
  });
});
