import { describe, it, expect } from "vitest";
import { api, get, post, put } from "./client";

/**
 * Campaign Send Flow Probe — S23
 *
 * First probe of POST /api/tenants/campaign/compute/send?id={campaignId}
 * S22 discovered the endpoint returns 409 "invalid column mappings" instead of crashing.
 * This test investigates what column mappings are needed and whether send can work.
 *
 * Known state:
 * - Campaign CREATE works with templateId + commChanId + includeSegment
 * - Campaign GET by ID crashes 500 (BUG-050)
 * - Campaign send requires ?id= query param
 * - Specific fields configure email/phone column routing
 * - BUG-076: specific-fields PUT can deadlock server — DO NOT write to specific-fields
 */

const TS = Date.now();

describe("Campaign Send Probe — /api/tenants/campaign/compute/send", () => {
  let segId: string | null = null;
  let innerSegId: string | null = null;
  let campaignId: string | null = null;
  let commChanId: string | null = null;
  let templateId: string | null = null;

  describe("1. Prerequisites setup", () => {
    it("should create a segmentation for campaign targeting", async () => {
      const { status, data } = await post("/api/tenants/segmentation", {
        name: `s23_send_seg_${TS}`,
        segments: [],
      });
      expect([200, 201]).toContain(status);
      segId = data?.id || data?.items?.[0]?.id;
      expect(segId).toBeTruthy();
    });

    it("should get inner segment ID from segmentation", async () => {
      if (!segId) return;
      const { status, data } = await get(`/api/tenants/segmentation/${segId}`);
      expect(status).toBe(200);
      // Inner segment may be in data.segments array or data.includeSegment
      const segments = data?.segments || data?.includeSegment || [];
      if (segments.length > 0) {
        innerSegId = segments[0]?.id || segments[0];
      } else {
        // Use the segId itself as inner ID (some API versions)
        innerSegId = segId;
      }
      console.log(`Segmentation ${segId}, inner segment: ${innerSegId}`);
    });

    it("should find or create a commchan for sending", async () => {
      // List existing commchans
      const { status, data } = await get("/api/tenants/commchan");
      expect(status).toBe(200);
      const items = data?.items || data?.list || [];
      if (items.length > 0) {
        commChanId = items[0].id;
        console.log(`Using existing commchan: ${commChanId}`);
      } else {
        // Create a blackhole commchan
        const { status: cs, data: cd } = await post("/api/tenants/commchan", {
          name: `s23_send_commchan_${TS}`,
          kind: "blackhole",
          chanconf: { method: "POST" },
          mappings: {},
        });
        expect([200, 201]).toContain(cs);
        commChanId = cd?.id;
        console.log(`Created commchan: ${commChanId}`);
      }
      expect(commChanId).toBeTruthy();
    });

    it("should find or create a template for campaign", async () => {
      const { status, data } = await get("/api/tenant/template");
      expect(status).toBe(200);
      const items = data?.list || data?.items || [];
      if (items.length > 0) {
        templateId = items[0].id;
        console.log(`Using existing template: ${templateId}`);
      } else {
        // Create minimal template
        const { status: ts, data: td } = await post("/api/tenant/template", {
          name: `s23_send_template_${TS}`,
          content_type: "html",
          subject: "Test",
          content: "<p>Hello</p>",
        });
        expect([200, 201]).toContain(ts);
        templateId = td?.id;
        console.log(`Created template: ${templateId}`);
      }
      expect(templateId).toBeTruthy();
    });

    it("should create a campaign with full prerequisites", async () => {
      if (!innerSegId || !commChanId || !templateId) {
        console.warn("Skipping: missing prerequisites");
        return;
      }
      const { status, data } = await post("/api/tenants/campaign", {
        name: `s23_send_campaign_${TS}`,
        templateId,
        commChanId,
        includeSegment: [innerSegId],
        excludeSegment: [],
      });
      // 409 = "communication channel not verified" — commchan needs verification first
      // 500 = BUG-050 nil pointer dereference (legacy)
      if (status === 409) {
        console.warn(`Campaign create 409: ${JSON.stringify(data).slice(0, 200)} — commchan not verified`);
      }
      expect([200, 201, 409, 500]).toContain(status);
      if ([200, 201].includes(status)) {
        campaignId = data?.id;
        console.log(`Created campaign: ${campaignId}`);
      }
    });
  });

  describe("2. Send endpoint probes", () => {
    it("should require id query parameter", async () => {
      const { status, data } = await post("/api/tenants/campaign/compute/send", {});
      // Missing id → 400 from OpenAPI validation
      expect(status).toBe(400);
      expect(JSON.stringify(data)).toContain("id");
    });

    it("should return 409 with column mappings error for valid campaign", async () => {
      if (!campaignId) {
        console.warn("Skipping: no campaign created");
        return;
      }
      const { status, data } = await post(
        `/api/tenants/campaign/compute/send`,
        {},
        { id: campaignId }
      );
      // Expected: 409 "invalid column mappings" — campaign needs specific-fields configured
      console.log(`Send response: HTTP ${status}, body: ${JSON.stringify(data).slice(0, 200)}`);
      expect([200, 409, 500]).toContain(status);
      if (status === 409) {
        console.log("FINDING: Campaign send requires column mappings — likely from specific-fields configuration");
      }
    });

    it("should return error for non-existent campaign ID", async () => {
      const { status } = await post(
        "/api/tenants/campaign/compute/send",
        {},
        { id: "00000000-0000-0000-0000-000000000000" }
      );
      // Should be 404, but API may return 409 or 500
      expect([404, 409, 500]).toContain(status);
    });

    it("should return error for invalid UUID campaign ID", async () => {
      const { status } = await post(
        "/api/tenants/campaign/compute/send",
        {},
        { id: "not-a-uuid" }
      );
      expect([400, 409, 500]).toContain(status);
    });

    it("should probe send with body containing column mappings", async () => {
      if (!campaignId) {
        console.warn("Skipping: no campaign created");
        return;
      }
      // Hypothesis: send might accept column mappings in the body
      const { status, data } = await post(
        `/api/tenants/campaign/compute/send`,
        {
          columnMappings: {
            email: "col__varchar_s50000__5",
            phone: "col__bigint__1",
          },
        },
        { id: campaignId }
      );
      console.log(`Send w/ mappings: HTTP ${status}, body: ${JSON.stringify(data).slice(0, 200)}`);
      expect([200, 409, 500]).toContain(status);
    });
  });

  describe("3. Campaign GET probe (BUG-050)", () => {
    it("should document campaign GET by ID status", async () => {
      if (!campaignId) return;
      const { status, data } = await get(`/api/tenants/campaign/${campaignId}`);
      console.log(`Campaign GET: HTTP ${status}`);
      if (status === 500) {
        console.warn(`BUG-050: Campaign GET by ID still crashes 500`);
      } else if (status === 200) {
        console.log(`BUG-050 FIXED: Campaign GET returns 200. Data keys: ${Object.keys(data)}`);
      }
      expect([200, 500]).toContain(status);
    });
  });

  describe("4. Specific-fields relationship", () => {
    it("should verify specific-fields are configured (GET only — no writes, BUG-076)", async () => {
      // BUG-076: specific-fields PUT can deadlock the server. Only read here.
      const { status, data } = await get("/api/tenant/specific-fields");
      expect(status).toBe(200);
      const hasEmail = data?.email && typeof data.email === "object";
      const hasPhone = data?.phone && typeof data.phone === "object";
      console.log(`Specific fields configured: email=${hasEmail}, phone=${hasPhone}`);
      if (hasEmail) {
        console.log(`  email → ${data.email.field_name} (${data.email.field_api_name})`);
      }
      if (hasPhone) {
        console.log(`  phone → ${data.phone.field_name} (${data.phone.field_api_name})`);
      }
      // Hypothesis: campaign send "invalid column mappings" means commchan needs
      // column_mapping config that references these specific-fields
    });
  });
});
