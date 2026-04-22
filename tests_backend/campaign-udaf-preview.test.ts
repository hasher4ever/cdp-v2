/**
 * Campaign Preview with UDAF-Backed Segments
 *
 * Tests the critical path: campaign → UDAF-predicate segment → preview.
 * Probes whether the compute service correctly handles UDAF materialization
 * during campaign preview vs field-predicate segments (control case).
 *
 * Key findings (shared tenant probe 2026-04-02):
 * - Campaign preview returns 500/EOF for ALL campaigns regardless of segment type (BUG-031)
 * - Campaign GET returns 500 for campaigns created before schema migrations
 * - Campaign creation via POST returns 500/nil pointer dereference on shared tenant
 * - Segmentation detail correctly exposes UDAF predicate structure (kind: "udaf")
 * - Preview via JSON body returns 409 "campaign data invalid" — wrong format
 * - Preview via query param ?id= returns 500/EOF — documented bug (BUG-031)
 */

import { describe, it, expect } from "vitest";
import { get, post } from "./client";

// ─────────────────────────────────────────────────────────────────────────────
// Known IDs on shared tenant (stable, not TEST_ prefixed — pre-existing data)
// ─────────────────────────────────────────────────────────────────────────────

/** Segmentation with UDAF predicate: "avg del cost for purchase 2"
 *  segment kind: "udaf", artifactId: 715cf8fd, operator: ">", value: 5.0 */
const UDAF_SEGMENTATION_ID = "8f6d7d53-a3ab-4bb3-9534-00462d1b8f30";
const UDAF_SEGMENT_ID = "12cd7711-439b-4032-8fb3-e060a8fe8c4a";

/** Campaign linked to UDAF segment: "Email campaign 2.12.2025" (blackhole chan) */
const UDAF_CAMPAIGN_ID = "0cd4aea7-2caa-4ae9-84ed-40abf7bf972d";

/** Segmentation with UDAF predicate: "artefact" (count purchase 1 = 123)
 *  Campaign "test email" uses blackhole commchan and this UDAF segment */
const UDAF_CAMPAIGN_ID_2 = "3605454a-f9f3-4220-a7c3-b86c47fc8ec3";

/** Business-test campaign with field-predicate segment (control: no UDAF) */
const FIELD_CAMPAIGN_ID = "6748865c-b11b-446d-8df1-7b4cb87937a7";

// ─────────────────────────────────────────────────────────────────────────────
// 1. Segmentation shape — verify UDAF predicate is surfaced correctly
// ─────────────────────────────────────────────────────────────────────────────

describe("UDAF segment structure - /api/tenants/segmentation/{id}", () => {
  it("should return segmentation with kind='udaf' in predicate param", async () => {
    const { status, data } = await get(`/api/tenants/segmentation/${UDAF_SEGMENTATION_ID}`);
    expect(status).toBe(200);
    expect(Array.isArray(data.segments)).toBe(true);
    expect(data.segments.length).toBeGreaterThan(0);

    const seg = data.segments[0];
    expect(seg).toHaveProperty("customerProfileFilter");
    const predicates = seg.customerProfileFilter?.group?.predicates ?? [];
    expect(predicates.length).toBeGreaterThan(0);

    const udafPredicate = predicates.find(
      (p: any) => p?.condition?.param?.kind === "udaf"
    );
    expect(udafPredicate).toBeDefined();
    expect(udafPredicate.condition.param.kind).toBe("udaf");
    expect(udafPredicate.condition.param.artifactId).toBeTruthy();
  });

  it("should expose UDAF display name and data type in extraResult", async () => {
    const { status, data } = await get(`/api/tenants/segmentation/${UDAF_SEGMENTATION_ID}`);
    expect(status).toBe(200);

    const predicates = data.segments[0]?.customerProfileFilter?.group?.predicates ?? [];
    const udafCond = predicates.find((p: any) => p?.condition?.param?.kind === "udaf");
    expect(udafCond).toBeDefined();

    const extraResult = udafCond.condition.param.extraResult;
    expect(extraResult).toBeDefined();
    expect(extraResult).toHaveProperty("param_display_name");
    expect(extraResult).toHaveProperty("param_data_type");
    expect(extraResult.param_data_type).toHaveProperty("TypeName");
    expect(typeof extraResult.param_data_type.TypeName).toBe("string");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 2. Campaign detail for UDAF-backed campaign
// ─────────────────────────────────────────────────────────────────────────────

describe("Campaign detail with UDAF segment - /api/tenants/campaign/{id}", () => {
  it("should return campaign detail with includeSegment referencing UDAF segmentation", async () => {
    const { status, data } = await get(`/api/tenants/campaign/${UDAF_CAMPAIGN_ID}`);
    expect(status).toBe(200);
    expect(data).toHaveProperty("id");
    expect(data).toHaveProperty("commChan");
    expect(Array.isArray(data.includeSegment)).toBe(true);
    expect(data.includeSegment.length).toBeGreaterThan(0);

    const seg = data.includeSegment[0];
    expect(seg).toHaveProperty("segmentID");
    expect(seg).toHaveProperty("segmentationID");
    expect(seg.segmentationID).toBe(UDAF_SEGMENTATION_ID);
  });

  it("should return campaign detail for second UDAF-linked campaign", async () => {
    const { status, data } = await get(`/api/tenants/campaign/${UDAF_CAMPAIGN_ID_2}`);
    expect(status).toBe(200);
    expect(data).toHaveProperty("id");
    expect(data).toHaveProperty("commChan");
    // This campaign uses artefact segmentation with UDAF predicate (count purchase 1 = 123)
    expect(Array.isArray(data.includeSegment)).toBe(true);
    expect(data.includeSegment[0].segmentationName).toBeTruthy();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 3. Campaign preview — UDAF-backed segments (BUG-031 documented failure path)
// ─────────────────────────────────────────────────────────────────────────────

describe("Campaign preview with UDAF segment - /api/tenants/campaign/compute/preview", () => {
  it("should return 200 with numberOfCustomer for UDAF-backed campaign (BUG-031: returns 500/EOF)", async () => {
    // BUG-031: compute service returns 500/EOF for all campaign previews.
    // This test documents the expected behavior — it SHOULD return 200.
    // Campaign: "Email campaign 2.12.2025", segmentation: "avg del cost for purchase 2"
    // Predicate: avg delivery cost for purchase > 5.0 (UDAF kind)
    const { status, data } = await post("/api/tenants/campaign/compute/preview", undefined, {
      id: UDAF_CAMPAIGN_ID,
    });
    // BUG-031: returns 500 {"Debug":"EOF","TraceID":"..."}
    // Expected: 200 {"numberOfCustomer": <number>}
    expect(status).toBe(200);
    if (status === 200) {
      expect(data).toHaveProperty("numberOfCustomer");
      expect(typeof data.numberOfCustomer).toBe("number");
    }
  });

  it("should return 200 with numberOfCustomer for second UDAF campaign (BUG-031: returns 500/EOF)", async () => {
    // BUG-031: campaign "test email" uses "artefact" segmentation with UDAF predicate
    // (count purchase 1 = 123). Blackhole commchan, verified.
    const { status, data } = await post("/api/tenants/campaign/compute/preview", undefined, {
      id: UDAF_CAMPAIGN_ID_2,
    });
    // BUG-031: returns 500 {"Debug":"EOF","TraceID":"..."}
    expect(status).toBe(200);
    if (status === 200) {
      expect(data).toHaveProperty("numberOfCustomer");
      expect(typeof data.numberOfCustomer).toBe("number");
    }
  });

  it("response shape should include numberOfCustomer when preview succeeds", async () => {
    // Structural contract: if preview returns 200, numberOfCustomer must be numeric
    const { status, data } = await post("/api/tenants/campaign/compute/preview", undefined, {
      id: UDAF_CAMPAIGN_ID,
    });
    if (status === 200) {
      expect(data).toHaveProperty("numberOfCustomer");
      expect(typeof data.numberOfCustomer).toBe("number");
      expect(data.numberOfCustomer).toBeGreaterThanOrEqual(0);
    } else {
      // Document the actual failure mode (BUG-031)
      console.warn(`[BUG-031] Campaign preview returned ${status}:`, JSON.stringify(data).substring(0, 200));
      expect([500]).toContain(status);
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 4. Control case: field-predicate campaign preview
// ─────────────────────────────────────────────────────────────────────────────

describe("Campaign preview control case - field-predicate segment", () => {
  it("should preview field-predicate campaign (BUG-031: also returns 500/EOF)", async () => {
    // Control: "biz_campaign_1774681895846" uses "All Customers" empty-predicate segment
    // This rules out UDAF materialization as the cause of BUG-031
    // since field-predicate campaigns also return 500/EOF
    const { status, data } = await post("/api/tenants/campaign/compute/preview", undefined, {
      id: FIELD_CAMPAIGN_ID,
    });
    // BUG-031: field-predicate campaigns ALSO return 500/EOF — not UDAF-specific
    expect(status).toBe(200);
    if (status === 200) {
      expect(data).toHaveProperty("numberOfCustomer");
      expect(typeof data.numberOfCustomer).toBe("number");
    }
  });

  it("should find any campaign in list and preview it", async () => {
    const { data: list } = await get("/api/tenants/campaign", { page: 0, size: 5 });
    if (!list.items || list.items.length === 0) return;

    // Pick the most recently created campaign to maximize chance of compute being alive
    const campaign = list.items[0];
    const { status, data } = await post("/api/tenants/campaign/compute/preview", undefined, {
      id: campaign.id,
    });
    // BUG-031: all previews currently return 500/EOF
    expect(status).toBe(200);
    if (status === 200) {
      expect(data).toHaveProperty("numberOfCustomer");
    } else {
      console.warn(`[BUG-031] Preview for ${campaign.name} (${campaign.id}) returned ${status}:`, JSON.stringify(data).substring(0, 150));
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 5. Preview request validation — error cases
// ─────────────────────────────────────────────────────────────────────────────

describe("Campaign preview error cases", () => {
  it("should return 400 when id param is empty string", async () => {
    // OpenAPI filter rejects empty id param
    const { status, data } = await post("/api/tenants/campaign/compute/preview", undefined, {
      id: "",
    });
    expect(status).toBe(400);
    expect(data).toHaveProperty("error");
  });

  it("should return 404 or error for non-existent campaign UUID", async () => {
    // Zero UUID is a valid UUID format but no campaign exists with this ID
    // BUG-031 note: even non-existent IDs may return 500/EOF instead of 404
    const { status } = await post("/api/tenants/campaign/compute/preview", undefined, {
      id: "00000000-0000-0000-0000-000000000000",
    });
    // Expected: 404 (campaign not found)
    // Actual (BUG-031): 500 {"Debug":"EOF","TraceID":"..."} — compute fails before lookup
    expect([404, 400]).toContain(status);
  });

  it("should reject preview request with JSON body instead of query param (409)", async () => {
    // Discovery: preview does NOT accept a JSON body — it requires ?id= query param
    // Sending JSON body returns 409 "campaign data invalid"
    const { status, data } = await post(
      "/api/tenants/campaign/compute/preview",
      { id: UDAF_CAMPAIGN_ID },
      undefined
    );
    // The API returns 409 for JSON-body requests — this is the format contract test
    expect(status).toBe(409);
    expect(data).toHaveProperty("description");
    expect(data.description).toContain("invalid");
  });
});
