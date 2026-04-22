/**
 * CommChan Lifecycle Test — Session 20
 *
 * Full CRUD lifecycle for /api/tenants/commchan.
 * Hypothesis: CREATE/GET work, PUT returns 400 (not implemented),
 * DELETE returns 400 (universal DELETE bug IMP-13).
 *
 * Schema: { name, kind, chanconf: { url, method, batch_size }, mappings: {} }
 * Valid kinds: "webhook", "blackhole"
 * batch_size: string "1"-"100" (only low values confirmed working)
 */

import { describe, it, expect } from "vitest";
import { get, post, put, del } from "./client";

const ts = Date.now();
let webhookId: string | null = null;
let blackholeId: string | null = null;

// ── CREATE ─────────────────────────────────────────────────────────────────

describe("CommChan lifecycle — CREATE", () => {
  it("H1: CREATE webhook with valid schema returns 200 and ID", async () => {
    const { status, data } = await post("/api/tenants/commchan", {
      name: `lifecycle_webhook_${ts}`,
      kind: "webhook",
      chanconf: { url: "https://example.com/lifecycle-hook", method: "POST", batch_size: "1" },
      mappings: {},
    });
    console.log(`CREATE webhook → ${status}, id=${data?.id}`);
    expect(status).toBe(200);
    expect(data).toHaveProperty("id");
    expect(data.kind).toBe("webhook");
    expect(data.chanconf).toHaveProperty("url");
    expect(data.chanconf).toHaveProperty("method");
    webhookId = data.id;
  });

  it("H8: CREATE blackhole with minimal chanconf (no url needed)", async () => {
    const { status, data } = await post("/api/tenants/commchan", {
      name: `lifecycle_blackhole_${ts}`,
      kind: "blackhole",
      chanconf: {},
      mappings: {},
    });
    console.log(`CREATE blackhole → ${status}, id=${data?.id}, chanconf=${JSON.stringify(data?.chanconf)}`);
    expect(status).toBe(200);
    expect(data).toHaveProperty("id");
    expect(data.kind).toBe("blackhole");
    blackholeId = data.id;
  });

  it("H9: CREATE with duplicate name — expect accepted (no uniqueness, IMP-10)", async () => {
    const dupName = `lifecycle_dup_${ts}`;
    const first = await post("/api/tenants/commchan", {
      name: dupName,
      kind: "blackhole",
      chanconf: {},
      mappings: {},
    });
    expect(first.status).toBe(200);

    const second = await post("/api/tenants/commchan", {
      name: dupName,
      kind: "blackhole",
      chanconf: {},
      mappings: {},
    });
    console.log(`Duplicate name CREATE → ${second.status}`);
    // No uniqueness constraint expected
    expect(second.status).toBe(200);
    if (second.status === 200) {
      expect(second.data.id).not.toBe(first.data.id);
      console.log("CONFIRMED: duplicate names allowed, different IDs assigned");
    }
  });
});

// ── READ ───────────────────────────────────────────────────────────────────

describe("CommChan lifecycle — READ", () => {
  it("H2: GET list contains created webhook", async () => {
    const { status, data } = await get("/api/tenants/commchan");
    expect(status).toBe(200);
    expect(Array.isArray(data)).toBe(true);
    console.log(`GET list → ${status}, count=${data.length}`);
    if (webhookId) {
      const found = data.find((c: any) => c.id === webhookId);
      expect(found).toBeTruthy();
      console.log(`Webhook ${webhookId} found in list: ${!!found}`);
    }
    if (blackholeId) {
      const found = data.find((c: any) => c.id === blackholeId);
      expect(found).toBeTruthy();
      console.log(`Blackhole ${blackholeId} found in list: ${!!found}`);
    }
  });

  it("H3: GET by ID returns full commchan with chanconf", async () => {
    if (!webhookId) return;
    const { status, data } = await get(`/api/tenants/commchan/${webhookId}`);
    console.log(`GET by ID → ${status}, data keys=${Object.keys(data || {})}`);
    expect(status).toBe(200);
    expect(data.id).toBe(webhookId);
    expect(data.name).toBe(`lifecycle_webhook_${ts}`);
    expect(data.kind).toBe("webhook");
    expect(data.chanconf).toHaveProperty("url");
    expect(data.chanconf.url).toBe("https://example.com/lifecycle-hook");
    expect(data.chanconf).toHaveProperty("method");
    expect(data.chanconf).toHaveProperty("batch_size");
  });

  it("H10: Mappings with non-empty object — rejected by OpenAPI (400)", async () => {
    // FINDING: mappings only accepts {} — non-empty objects are schema-rejected (400)
    const { status, data } = await post("/api/tenants/commchan", {
      name: `lifecycle_mappings_${ts}`,
      kind: "blackhole",
      chanconf: {},
      mappings: { field1: "value1", nested: { a: 1 } },
    });
    console.log(`CREATE with non-empty mappings → ${status}`);
    expect(status).toBe(400);
  });

  it("H10b: Mappings empty object roundtrip — persists on GET", async () => {
    if (!blackholeId) return;
    const { status, data } = await get(`/api/tenants/commchan/${blackholeId}`);
    console.log(`GET blackhole mappings → ${JSON.stringify(data?.mappings)}`);
    expect(status).toBe(200);
    expect(data).toHaveProperty("mappings");
  });
});

// ── UPDATE ─────────────────────────────────────────────────────────────────

describe("CommChan lifecycle — UPDATE (PUT)", () => {
  it("H4: PUT update name — expect 400 (PUT not implemented per contract test)", async () => {
    if (!webhookId) return;
    const { status, data } = await put(`/api/tenants/commchan/${webhookId}`, {
      name: `lifecycle_webhook_renamed_${ts}`,
      kind: "webhook",
      chanconf: { url: "https://example.com/lifecycle-hook", method: "POST", batch_size: "1" },
      mappings: {},
    });
    console.log(`PUT update name → ${status}, data=${JSON.stringify(data)}`);
    // Contract test says PUT returns 400. If it now works, that's a surprise.
    if (status === 200) {
      console.log("SURPRISE: PUT now works! Verifying persistence...");
      const verify = await get(`/api/tenants/commchan/${webhookId}`);
      console.log(`Verify after PUT → name=${verify.data?.name}`);
      expect(verify.data.name).toBe(`lifecycle_webhook_renamed_${ts}`);
    } else {
      expect([400, 404, 405]).toContain(status);
      console.log("CONFIRMED: PUT still not implemented");
    }
  });

  it("H5: PUT update chanconf URL — expect 400 or surprise success", async () => {
    if (!webhookId) return;
    const { status, data } = await put(`/api/tenants/commchan/${webhookId}`, {
      name: `lifecycle_webhook_${ts}`,
      kind: "webhook",
      chanconf: { url: "https://example.com/updated-hook", method: "POST", batch_size: "1" },
      mappings: {},
    });
    console.log(`PUT update chanconf → ${status}`);
    if (status === 200) {
      console.log("SURPRISE: PUT chanconf update works!");
      const verify = await get(`/api/tenants/commchan/${webhookId}`);
      expect(verify.data.chanconf.url).toBe("https://example.com/updated-hook");
    } else {
      expect([400, 404, 405]).toContain(status);
    }
  });

  it("H6: PUT change kind webhook→blackhole — expect 400 or rejected", async () => {
    if (!webhookId) return;
    const { status, data } = await put(`/api/tenants/commchan/${webhookId}`, {
      name: `lifecycle_webhook_${ts}`,
      kind: "blackhole",
      chanconf: {},
      mappings: {},
    });
    console.log(`PUT change kind → ${status}, data=${JSON.stringify(data)}`);
    if (status === 200) {
      console.log("SURPRISE: kind change via PUT works!");
      const verify = await get(`/api/tenants/commchan/${webhookId}`);
      console.log(`Verify kind after PUT → ${verify.data?.kind}`);
    } else {
      expect([400, 404, 405, 409]).toContain(status);
    }
  });
});

// ── DELETE ──────────────────────────────────────────────────────────────────

describe("CommChan lifecycle — DELETE", () => {
  it("H7: DELETE returns 400 (universal DELETE bug IMP-13)", async () => {
    if (!webhookId) return;
    const { status, data } = await del(`/api/tenants/commchan/${webhookId}`);
    console.log(`DELETE → ${status}, data=${JSON.stringify(data)}`);
    if (status === 200 || status === 204) {
      console.log("SURPRISE: DELETE now works! Verifying removal...");
      const verify = await get(`/api/tenants/commchan/${webhookId}`);
      console.log(`Verify after DELETE → ${verify.status}`);
      expect([404, 400]).toContain(verify.status);
    } else {
      // Expected: 400 per contract test and universal DELETE bug
      expect([400, 404, 405]).toContain(status);
      console.log("CONFIRMED: DELETE still broken (IMP-13)");
    }
  });

  it("H7b: DELETE blackhole also returns 400", async () => {
    if (!blackholeId) return;
    const { status } = await del(`/api/tenants/commchan/${blackholeId}`);
    console.log(`DELETE blackhole → ${status}`);
    expect([400, 404, 405]).toContain(status);
  });

  it("DELETE non-existent ID — expect 400 or 404", async () => {
    const { status } = await del("/api/tenants/commchan/00000000-0000-0000-0000-000000000000");
    console.log(`DELETE non-existent → ${status}`);
    expect([400, 404, 405]).toContain(status);
  });
});
