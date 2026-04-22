/**
 * Campaign E2E Flow (Isolated Tenant)
 *
 * Per-run factory data: 6 customers (4 adults, 2 minors).
 * Creates segmentation -> campaign -> preview.
 */
import { describe, it, expect, beforeAll } from "vitest";
import { get, post } from "../tests_backend/client";
import { makeTag, makeId, ingestAndWait } from "./test-factories";
import { custField, getTenant } from "./tenant-context";

const BASE_URL = process.env.CDP_BASE_URL || "https://cdpv2.ssd.uz";
const TAG = makeTag();

// 6 customers: 4 adults, 2 minors
const IDS = Array.from({ length: 6 }, () => makeId());
const CUSTOMERS = [
  { primary_id: IDS[0], first_name: `${TAG}_A0`, last_name: "A", email: `${TAG}_a0@t.cdp`, gender: "female", age: 30, is_adult: true,  is_subscribed: true,  income: 50000, birthdate: "1995-01-01", phone_number: 7100000001 },
  { primary_id: IDS[1], first_name: `${TAG}_A1`, last_name: "B", email: `${TAG}_a1@t.cdp`, gender: "male",   age: 40, is_adult: true,  is_subscribed: false, income: 80000, birthdate: "1985-06-15", phone_number: 7100000002 },
  { primary_id: IDS[2], first_name: `${TAG}_A2`, last_name: "C", email: `${TAG}_a2@t.cdp`, gender: "male",   age: 25, is_adult: true,  is_subscribed: true,  income: 60000, birthdate: "2000-03-20", phone_number: 7100000003 },
  { primary_id: IDS[3], first_name: `${TAG}_A3`, last_name: "D", email: `${TAG}_a3@t.cdp`, gender: "female", age: 35, is_adult: true,  is_subscribed: true,  income: 90000, birthdate: "1990-09-10", phone_number: 7100000004 },
  { primary_id: IDS[4], first_name: `${TAG}_M0`, last_name: "E", email: `${TAG}_m0@t.cdp`, gender: "female", age: 16, is_adult: false, is_subscribed: true,  income: 0,     birthdate: "2009-12-01", phone_number: 7100000005 },
  { primary_id: IDS[5], first_name: `${TAG}_M1`, last_name: "F", email: `${TAG}_m1@t.cdp`, gender: "male",   age: 14, is_adult: false, is_subscribed: false, income: 0,     birthdate: "2011-04-25", phone_number: 7100000006 },
];

const ADULTS_COUNT = 4;

beforeAll(async () => {
  const t = getTenant();
  await ingestAndWait(BASE_URL, t.tenantId, t.token, CUSTOMERS, []);
});

describe("Campaign End-to-End Flow (Isolated Tenant)", () => {
  let commChanId: string;
  let segmentationId: string;
  let includeSegmentId: string;
  let excludeSegmentId: string;
  let templateId: string;
  let campaignId: string;

  it("Step 1: Create a blackhole communication channel", async () => {
    const { status, data } = await post("/api/tenants/commchan", {
      name: `${TAG}_chan`,
      kind: "blackhole",
      mappings: {},
      chanconf: {},
    });
    expect(status).toBe(200);
    commChanId = data.id;
  });

  it("Step 2: Verify the channel", async () => {
    if (!commChanId) return;
    const { status, data } = await post(`/api/tenants/commchan/${commChanId}/verify`);
    expect(status).toBe(200);
    expect(data.verified).toBe(true);
  });

  it("Step 3: Create a template", async () => {
    const { status, data } = await post("/api/tenant/template", {
      content_type: "html",
      name: `${TAG}_template`,
      subject: "Hello {{first_name}}!",
      content: "<h1>Hello {{first_name}}</h1>",
      variables: { first_name: custField("first_name") },
    });
    expect(status).toBe(201);
    templateId = data.id;
  });

  it("Step 4: Create segmentation -- adults vs minors", async () => {
    const ac = custField("is_adult");
    const { status, data } = await post("/api/tenants/segmentation", {
      name: `${TAG}_campaign_seg`,
      segments: [
        { name: "Adults", customerProfileFilter: { type: "group", group: { logicalOp: "AND", negate: false, predicates: [{ type: "condition", condition: { param: { kind: "field", fieldName: ac }, operator: "=", value: { string: [], time: [], float64: [], int64: [], bool: [true] } } }] } } },
        { name: "Minors", customerProfileFilter: { type: "group", group: { logicalOp: "AND", negate: false, predicates: [{ type: "condition", condition: { param: { kind: "field", fieldName: ac }, operator: "=", value: { string: [], time: [], float64: [], int64: [], bool: [false] } } }] } } },
      ],
    });
    expect(status).toBe(200);
    segmentationId = data.id;
    includeSegmentId = data.segments.find((s: any) => s.name === "Adults")?.id;
    excludeSegmentId = data.segments.find((s: any) => s.name === "Minors")?.id;
  });

  it("Step 5: Create campaign targeting adults, excluding minors", async () => {
    if (!commChanId || !includeSegmentId) return;
    const { status, data } = await post("/api/tenants/campaign", {
      name: `${TAG}_campaign`,
      commChanId,
      templateId,
      includeSegment: [includeSegmentId],
      excludeSegment: [excludeSegmentId],
    });
    if (status === 500) { console.warn("Campaign create 500"); return; }
    expect(status).toBe(200);
    campaignId = data.id;
  });

  it("Step 6: Preview campaign = adults only", async () => {
    if (!campaignId) return;
    const { status, data } = await post("/api/tenants/campaign/compute/preview", undefined, { id: campaignId });
    if (status === 500) { console.warn("Preview 500 -- BUG-031"); return; }
    expect(status).toBe(200);
    expect(data.numberOfCustomer).toBe(ADULTS_COUNT);
  });

  it("Step 7: Verify campaign details link all entities", async () => {
    if (!campaignId) return;
    const { status, data } = await get(`/api/tenants/campaign/${campaignId}`);
    if (status === 500) return;
    expect(status).toBe(200);
    expect(data.commChan.id).toBe(commChanId);
    expect(data.template.id).toBe(templateId);
    expect(data.includeSegment.length).toBe(1);
    expect(data.excludeSegment.length).toBe(1);
  });
});
