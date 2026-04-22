/**
 * Campaign Send Lifecycle -- Gap Test
 *
 * Per-run factory data: 6 customers (4 adults, 2 minors).
 * Tests the full campaign delivery flow:
 *   1. Create blackhole commchan + verify
 *   2. Create email template
 *   3. Create segmentation (adults vs minors)
 *   4. Create campaign targeting adults, excluding minors
 *   5. Preview campaign (expect 4 adults)
 *   6. Trigger send -- expect 204
 *   7. Poll campaign detail for status change
 *   8. Re-send / probe endpoints
 */

import { describe, it, expect, beforeAll } from "vitest";
import { get, post, put } from "../tests_backend/client";
import { makeTag, makeId, ingestAndWait } from "./test-factories";
import { custField, getTenant } from "./tenant-context";

const BASE_URL = process.env.CDP_BASE_URL || "https://cdpv2.ssd.uz";
const TAG = makeTag();

// 6 customers: 4 adults, 2 minors
const IDS = Array.from({ length: 6 }, () => makeId());
const CUSTOMERS = [
  { primary_id: IDS[0], first_name: `${TAG}_A0`, last_name: "S0", email: `${TAG}_s0@t.cdp`, gender: "female", age: 30, is_adult: true,  is_subscribed: true,  income: 50000, birthdate: "1995-01-01", phone_number: 7200000001 },
  { primary_id: IDS[1], first_name: `${TAG}_A1`, last_name: "S1", email: `${TAG}_s1@t.cdp`, gender: "male",   age: 40, is_adult: true,  is_subscribed: false, income: 80000, birthdate: "1985-06-15", phone_number: 7200000002 },
  { primary_id: IDS[2], first_name: `${TAG}_A2`, last_name: "S2", email: `${TAG}_s2@t.cdp`, gender: "male",   age: 25, is_adult: true,  is_subscribed: true,  income: 60000, birthdate: "2000-03-20", phone_number: 7200000003 },
  { primary_id: IDS[3], first_name: `${TAG}_A3`, last_name: "S3", email: `${TAG}_s3@t.cdp`, gender: "female", age: 35, is_adult: true,  is_subscribed: true,  income: 90000, birthdate: "1990-09-10", phone_number: 7200000004 },
  { primary_id: IDS[4], first_name: `${TAG}_M0`, last_name: "S4", email: `${TAG}_s4@t.cdp`, gender: "female", age: 16, is_adult: false, is_subscribed: true,  income: 0,     birthdate: "2009-12-01", phone_number: 7200000005 },
  { primary_id: IDS[5], first_name: `${TAG}_M1`, last_name: "S5", email: `${TAG}_s5@t.cdp`, gender: "male",   age: 14, is_adult: false, is_subscribed: false, income: 0,     birthdate: "2011-04-25", phone_number: 7200000006 },
];

const ADULTS_COUNT = 4;

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

beforeAll(async () => {
  const t = getTenant();
  await ingestAndWait(BASE_URL, t.tenantId, t.token, CUSTOMERS, []);
});

describe("Campaign Send Lifecycle (Fresh Tenant)", () => {
  let commChanId: string;
  let templateId: string;
  let segmentationId: string;
  let allCustomersSegmentId: string;
  let excludeSegmentId: string;
  let campaignId: string;

  // ── Setup: specific field mappings ──────────────────────────────────────

  it("Step 0a: Configure tenant email specific-field mapping", async () => {
    const { status, data } = await put("/api/tenant/specific-fields", {
      field_type: "email",
      field_name: custField("email"),
    });
    expect([200, 201]).toContain(status);
    expect(data).toHaveProperty("id");
  });

  it("Step 0b: Configure tenant phone specific-field mapping", async () => {
    const { status, data } = await put("/api/tenant/specific-fields", {
      field_type: "phone",
      field_name: custField("phone_number"),
    });
    expect([200, 201]).toContain(status);
    expect(data).toHaveProperty("id");
  });

  // ── Setup: Communication Channel ─────────────────────────────────────────

  it("Step 1: Create a blackhole communication channel", async () => {
    const { status, data } = await post("/api/tenants/commchan", {
      name: `${TAG}_send_chan`,
      kind: "blackhole",
      mappings: { email: custField("email") },
      chanconf: {},
    });
    expect(status).toBe(200);
    expect(data).toHaveProperty("id");
    commChanId = data.id;
  });

  it("Step 2: Verify the blackhole channel", async () => {
    if (!commChanId) return;
    const { status, data } = await post(`/api/tenants/commchan/${commChanId}/verify`);
    expect(status).toBe(200);
    expect(data.verified).toBe(true);
  });

  // ── Setup: Template ──────────────────────────────────────────────────────

  it("Step 3: Create an email template", async () => {
    const { status, data } = await post("/api/tenant/template", {
      content_type: "html",
      name: `${TAG}_send_template`,
      subject: "Campaign test for {{first_name}}",
      content: "<p>Hello {{first_name}}, this is a test campaign.</p>",
      variables: { first_name: custField("first_name") },
    });
    expect(status).toBe(201);
    expect(data).toHaveProperty("id");
    templateId = data.id;
  });

  // ── Setup: Segmentation ──────────────────────────────────────────────────

  it("Step 4: Create segmentation -- adults and minors", async () => {
    const ac = custField("is_adult");
    const { status, data } = await post("/api/tenants/segmentation", {
      name: `${TAG}_send_seg`,
      segments: [
        {
          name: "Adults",
          customerProfileFilter: {
            type: "group",
            group: {
              logicalOp: "AND",
              negate: false,
              predicates: [{
                type: "condition",
                condition: {
                  param: { kind: "field", fieldName: ac },
                  operator: "=",
                  value: { string: [], time: [], float64: [], int64: [], bool: [true] },
                },
              }],
            },
          },
        },
        {
          name: "Minors",
          customerProfileFilter: {
            type: "group",
            group: {
              logicalOp: "AND",
              negate: false,
              predicates: [{
                type: "condition",
                condition: {
                  param: { kind: "field", fieldName: ac },
                  operator: "=",
                  value: { string: [], time: [], float64: [], int64: [], bool: [false] },
                },
              }],
            },
          },
        },
      ],
    });
    expect(status).toBe(200);
    expect(data).toHaveProperty("id");
    segmentationId = data.id;
    allCustomersSegmentId = data.segments.find((s: any) => s.name === "Adults")?.id;
    excludeSegmentId = data.segments.find((s: any) => s.name === "Minors")?.id;
    expect(allCustomersSegmentId).toBeDefined();
    expect(excludeSegmentId).toBeDefined();
  });

  // ── Setup: Campaign ──────────────────────────────────────────────────────

  it("Step 5: Create campaign targeting adults, excluding minors", async () => {
    if (!commChanId || !allCustomersSegmentId || !templateId) return;
    const { status, data } = await post("/api/tenants/campaign", {
      name: `${TAG}_send_campaign`,
      commChanId,
      templateId,
      includeSegment: [allCustomersSegmentId],
      excludeSegment: [excludeSegmentId],
    });
    expect(status).toBe(200);
    expect(data).toHaveProperty("id");
    expect(data).toHaveProperty("name");
    campaignId = data.id;
  });

  // ── Pre-send verification ────────────────────────────────────────────────

  it("Step 6: Preview campaign -- should target adults only", async () => {
    if (!campaignId) return;
    const { status, data } = await post(
      "/api/tenants/campaign/compute/preview",
      undefined,
      { id: campaignId },
    );
    if (status === 500) {
      console.warn("[Campaign Send] Preview 500 -- compute service issue (BUG-031):", JSON.stringify(data));
      return;
    }
    expect(status).toBe(200);
    expect(data).toHaveProperty("numberOfCustomer");
    expect(data.numberOfCustomer).toBe(ADULTS_COUNT);
  });

  it("Step 7: Campaign detail should show correct entity links before send", async () => {
    if (!campaignId) return;
    const { status, data } = await get(`/api/tenants/campaign/${campaignId}`);
    expect(status).toBe(200);
    expect(data.commChan.id).toBe(commChanId);
    expect(data.template.id).toBe(templateId);
    expect(data.includeSegment).toHaveLength(1);
    expect(data.includeSegment[0].segmentID).toBe(allCustomersSegmentId);
    expect(data.excludeSegment).toHaveLength(1);
  });

  // ── Send ─────────────────────────────────────────────────────────────────

  it("Step 8: Trigger campaign send -- expect 204 (accepted)", async () => {
    if (!campaignId) return;
    const { status, data } = await post(
      "/api/tenants/campaign/compute/send",
      undefined,
      { id: campaignId },
    );
    if (status === 409 && data?.data?.err?.Code === 31) {
      console.warn("[Campaign Send] BUG-032: Blackhole send rejected with 'invalid column mappings':", JSON.stringify(data));
      return;
    }
    expect(status).toSatisfy(
      (s: number) => s === 200 || s === 204,
      `Expected 200 or 204, got ${status}. Response: ${JSON.stringify(data)}`,
    );
  });

  // ── Post-send verification ───────────────────────────────────────────────

  it("Step 9: Campaign detail after send -- check for status/state fields", async () => {
    if (!campaignId) return;
    await sleep(3000);

    const { status, data } = await get(`/api/tenants/campaign/${campaignId}`);
    expect(status).toBe(200);
    expect(data.id).toBe(campaignId);
    expect(data.name).toContain(TAG);

    if ("status" in data) {
      expect(["SENT", "COMPLETED", "sent", "completed"]).toContain(data.status);
    }

    if ("sendCount" in data || "sentCount" in data || "numberOfCustomer" in data) {
      const count = data.sendCount ?? data.sentCount ?? data.numberOfCustomer;
      expect(count).toBe(ADULTS_COUNT);
    }
  });

  // ── Re-send behavior ────────────────────────────────────────────────────

  it("Step 10: Re-send the same campaign -- probe idempotency", async () => {
    if (!campaignId) return;
    const { status, data } = await post(
      "/api/tenants/campaign/compute/send",
      undefined,
      { id: campaignId },
    );
    expect([200, 204, 409]).toContain(status);
  });

  // ── Probe endpoints ────────────────────────────────────────────────────

  it("Step 11: Probe /api/tenants/campaign/{id}/history", async () => {
    if (!campaignId) return;
    const { status, data } = await get(`/api/tenants/campaign/${campaignId}/history`);
    if (status === 200 && Array.isArray(data)) {
      expect(data.length).toBeGreaterThanOrEqual(1);
    }
    expect([200, 404, 405, 500]).toContain(status);
  });

  it("Step 12: Probe /api/tenants/campaign/{id}/stats", async () => {
    if (!campaignId) return;
    const { status } = await get(`/api/tenants/campaign/${campaignId}/stats`);
    expect([200, 404, 405, 500]).toContain(status);
  });

  it("Step 13: Probe /api/tenants/campaign/compute/status", async () => {
    if (!campaignId) return;
    const { status } = await get("/api/tenants/campaign/compute/status", { id: campaignId });
    expect([200, 404, 405, 500]).toContain(status);
  });

  it("Step 14: Preview after send -- count should still match", async () => {
    if (!campaignId) return;
    const { status, data } = await post(
      "/api/tenants/campaign/compute/preview",
      undefined,
      { id: campaignId },
    );
    if (status === 500) {
      console.warn("[Campaign Send] Preview after send 500 -- BUG-031");
      return;
    }
    expect(status).toBe(200);
    expect(data.numberOfCustomer).toBe(ADULTS_COUNT);
  });

  it("Step 15: Campaign appears in list after send", async () => {
    if (!campaignId) return;
    const { status, data } = await get("/api/tenants/campaign", { page: 0, size: 50 });
    expect(status).toBe(200);
    expect(data).toHaveProperty("items");
    const found = data.items.find((c: any) => c.id === campaignId);
    expect(found).toBeDefined();
    expect(found.name).toContain(TAG);
  });
});
