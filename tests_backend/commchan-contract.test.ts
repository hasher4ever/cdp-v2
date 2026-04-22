/**
 * CommChan Contract Test — Session 15
 *
 * Documents the CURRENT commchan API contract after S15 schema changes:
 *   - CREATE now requires chanconf + mappings fields
 *   - Verify endpoint removed (400 method not allowed)
 *   - PUT/DELETE still unimplemented
 *   - Validate schema changed
 *
 * Bugs: BUG-055 (verify removed), BUG-056 (create schema changed)
 */

import { describe, it, expect } from "vitest";
import { get, post, put, del } from "./client";

// ── CREATE with new schema ──────────────────────────────────────────────────

describe("CommChan CREATE — new schema (S15)", () => {
  let createdBlackholeId: string | null = null;
  let createdWebhookId: string | null = null;

  it("should create a blackhole channel with chanconf + mappings", async () => {
    const { status, data } = await post("/api/tenants/commchan", {
      name: `cc_test_blackhole_${Date.now()}`,
      kind: "blackhole",
      chanconf: {},
      mappings: {},
    });
    expect(status).toBe(200);
    expect(data).toHaveProperty("id");
    expect(data.kind).toBe("blackhole");
    expect(data).toHaveProperty("chanconf");
    expect(data).toHaveProperty("mappings");
    createdBlackholeId = data.id;
  });

  it("should create a webhook channel with chanconf containing url+method", async () => {
    const { status, data } = await post("/api/tenants/commchan", {
      name: `cc_test_webhook_${Date.now()}`,
      kind: "webhook",
      chanconf: { url: "https://example.com/hook", method: "POST", batch_size: "1" },
      mappings: {},
    });
    expect(status).toBe(200);
    expect(data).toHaveProperty("id");
    expect(data.kind).toBe("webhook");
    expect(data.chanconf).toHaveProperty("url");
    createdWebhookId = data.id;
  });

  it("should reject old schema (no chanconf/mappings) — BUG-056", async () => {
    const { status } = await post("/api/tenants/commchan", {
      name: `cc_test_old_schema_${Date.now()}`,
      kind: "blackhole",
    });
    // OpenAPI validation rejects the old format
    expect([400, 422]).toContain(status);
  });

  it("created channels should appear in list", async () => {
    const { status, data } = await get("/api/tenants/commchan");
    expect(status).toBe(200);
    expect(Array.isArray(data)).toBe(true);
    if (createdBlackholeId) {
      expect(data.some((c: any) => c.id === createdBlackholeId)).toBe(true);
    }
    if (createdWebhookId) {
      expect(data.some((c: any) => c.id === createdWebhookId)).toBe(true);
    }
  });

  it("created channel should be fetchable by ID", async () => {
    if (!createdWebhookId) return;
    const { status, data } = await get(`/api/tenants/commchan/${createdWebhookId}`);
    expect(status).toBe(200);
    expect(data.id).toBe(createdWebhookId);
    expect(data).toHaveProperty("chanconf");
    expect(data.chanconf).toHaveProperty("url");
  });
});

// ── Removed/broken endpoints ────────────────────────────────────────────────

describe("CommChan removed/broken endpoints (S15)", () => {
  it("POST /api/tenants/commchan/verify returns 400 — endpoint removed (BUG-055)", async () => {
    const { status } = await post("/api/tenants/commchan/verify", {
      commChanId: "f91eccdc-f18e-4e7f-bbfa-aeef6b060d4a",
    });
    expect(status).toBe(400);
  });

  it("PUT /api/tenants/commchan/{id} returns 400 — still not implemented", async () => {
    const { status } = await put("/api/tenants/commchan/f91eccdc-f18e-4e7f-bbfa-aeef6b060d4a", {
      name: "noop",
      kind: "blackhole",
      chanconf: {},
      mappings: {},
    });
    expect(status).toBe(400);
  });

  it("DELETE /api/tenants/commchan/{id} returns 400 — still not implemented", async () => {
    const { status } = await del("/api/tenants/commchan/f91eccdc-f18e-4e7f-bbfa-aeef6b060d4a");
    expect(status).toBe(400);
  });
});
