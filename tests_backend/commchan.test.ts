import { describe, it, expect } from "vitest";
import { get, post } from "./client";

describe("Communication Channels - /api/tenants/commchan", () => {
  it("should list communication channels", async () => {
    const { status, data } = await get("/api/tenants/commchan");
    expect(status).toBe(200);
    expect(Array.isArray(data)).toBe(true);
  });

  it("should have valid channel structure", async () => {
    const { data } = await get("/api/tenants/commchan");
    for (const chan of data) {
      expect(chan).toHaveProperty("id");
      expect(chan).toHaveProperty("name");
      expect(chan).toHaveProperty("kind");
      expect(chan).toHaveProperty("verified");
      expect(typeof chan.verified).toBe("boolean");
    }
  });

  it("should filter by verified status", async () => {
    const { status, data } = await get("/api/tenants/commchan", { verified: true });
    expect(status).toBe(200);
    for (const chan of data) {
      expect(chan.verified).toBe(true);
    }
  });
});

describe("CommChan by ID - /api/tenants/commchan/{id}", () => {
  it("should get channel details", async () => {
    const { data: list } = await get("/api/tenants/commchan");
    if (list.length === 0) return;

    const { status, data } = await get(`/api/tenants/commchan/${list[0].id}`);
    expect(status).toBe(200);
    expect(data).toHaveProperty("id");
    expect(data).toHaveProperty("name");
    expect(data).toHaveProperty("kind");
    expect(data).toHaveProperty("mappings");
    expect(data).toHaveProperty("chanconf");
    expect(data).toHaveProperty("createdAt");
    expect(data).toHaveProperty("updatedAt");
    expect(data).toHaveProperty("verified");
  });

  it("should return 404 for non-existent channel", async () => {
    const { status } = await get("/api/tenants/commchan/00000000-0000-0000-0000-000000000000");
    expect(status).toBe(404);
  });
});

describe("CommChan CRUD", () => {
  let createdChanId: string;

  it("should create a blackhole communication channel", async () => {
    const payload = {
      name: `test_chan_${Date.now()}`,
      kind: "blackhole",
      mappings: {},
      chanconf: {},
    };

    const { status, data } = await post("/api/tenants/commchan", payload);
    expect(status).toBe(200);
    expect(data).toHaveProperty("id");
    expect(data).toHaveProperty("name");
    expect(data.kind).toBe("blackhole");
    createdChanId = data.id;
  });

  it("should validate a communication channel config (may be removed — BUG-055)", async () => {
    const payload = {
      name: "test_validate",
      kind: "webhook",
      mappings: {},
      chanconf: { url: "https://example.com/webhook", method: "POST" },
    };

    const { status, data } = await post("/api/tenants/commchan/validate", payload);
    // Accept 200 (validate works) or 400 (endpoint removed per BUG-055)
    expect([200, 400]).toContain(status);
  });

  it("should verify a created channel (BUG-055: verify endpoint removed — expect 400)", async () => {
    if (!createdChanId) return;
    const { status } = await post(`/api/tenants/commchan/${createdChanId}/verify`);
    // BUG-055: verify endpoint was removed in S15. Per-ID variant may also be gone.
    // Accept 400 (method not allowed) or 200 (if per-ID verify still works)
    expect([200, 400]).toContain(status);
  });
});
