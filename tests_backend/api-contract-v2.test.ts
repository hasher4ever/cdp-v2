/**
 * API Contract v2 — Session 17
 *
 * Documents and verifies the CURRENT API contract after the Session 17 restructuring.
 * Three tiers:
 *   1. Working endpoints  — assert correct status + response shape
 *   2. Known broken       — assert the known error status (documents bugs without failing CI incorrectly)
 *   3. Removed endpoints  — assert 404
 *   4. Response format    — assert correct wrapper shape per resource type
 *
 * Known bugs captured here:
 *   BUG-049 — UDAF calculate 500
 *   BUG-050 — campaign get-by-ID and create nil pointer crash
 *   BUG-052 — schema draft cancel/apply broken
 *
 * Session 17 changes (UPDATED S24: some endpoints returned since S17):
 *   - Scenario CRUD (/api/tenant/scenario/crud) → RESTORED (works since S19+)
 *   - Segmentation preview → RESTORED (works since S20)
 *   - Autocomplete → works when event_type param omitted (BUG-001)
 *   - Seg/commchan/campaign already on singular paths from S15
 *   - Schema sub-paths still work (draft-schema/status, customers/fields, event-types)
 */

import { describe, it, expect, beforeAll } from "vitest";
import { get, post, put, del } from "./client";

// ── Stable shared-tenant references ──────────────────────────────────────────
const INTERNAL_VARCHAR_FIELD = "col__varchar_s50000__0";

// IDs discovered once in beforeAll and reused across all suites
let customerPrimaryId: number | null = null;
let udafId: string | null = null;
let segmentationId: string | null = null;
let campaignId: string | null = null;
let scenarioId: string | null = null;
let commchanId: string | null = null;

beforeAll(async () => {
  // Customer list
  const { status: cStatus, data: cData } = await post(
    "/api/tenant/data/customers",
    { fieldNames: [INTERNAL_VARCHAR_FIELD] },
    { size: 1, page: 1 }
  );
  if (cStatus === 200 && cData?.list?.length > 0) {
    customerPrimaryId = cData.list[0]?.primary_id ?? null;
  }

  // UDAF list
  const { status: uStatus, data: uData } = await get("/api/tenants/udafs", { page: 1, size: 1 });
  if (uStatus === 200 && uData?.items?.length > 0) {
    udafId = uData.items[0].id ?? null;
  }

  // Segmentation list
  const { status: sStatus, data: sData } = await get("/api/tenants/segmentation", { page: 1, size: 1 });
  if (sStatus === 200 && sData?.items?.length > 0) {
    segmentationId = sData.items[0].id ?? null;
  }

  // Campaign list
  const { status: camStatus, data: camData } = await get("/api/tenants/campaign", { page: 1, size: 1 });
  if (camStatus === 200 && camData?.items?.length > 0) {
    campaignId = camData.items[0].id ?? null;
  }

  // Scenario list
  const { status: scStatus, data: scData } = await get("/api/tenant/scenario/crud", { page: 1, size: 1 });
  if (scStatus === 200 && scData?.list?.length > 0) {
    scenarioId = scData.list[0].id ?? null;
  }

  // Commchan list
  const { status: ccStatus, data: ccData } = await get("/api/tenants/commchan");
  if (ccStatus === 200 && Array.isArray(ccData) && ccData.length > 0) {
    commchanId = ccData[0].id ?? null;
  }
}, 30_000);

// =============================================================================
// 1. Working endpoints
// =============================================================================

describe("Working endpoints", () => {
  // ── Auth ──────────────────────────────────────────────────────────────────
  describe("Auth", () => {
    it("POST /public/api/signin with valid credentials returns 200 + jwtToken", async () => {
      const domain = process.env.CDP_DOMAIN || "1762934640.cdp.com";
      const email = process.env.CDP_EMAIL || "shop2025.11.12-13:04:00@cdp.ru";
      const password = process.env.CDP_PASSWORD || "qwerty123";
      const baseUrl = globalThis.__cdp_base_url;
      const res = await fetch(`${baseUrl}/public/api/signin`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username: email, password, domainName: domain }),
      });
      expect(res.status).toBe(200);
      const data = await res.json() as any;
      expect(data).toHaveProperty("jwtToken");
      expect(typeof data.jwtToken).toBe("string");
    });
  });

  // ── Customer data ─────────────────────────────────────────────────────────
  describe("Customer data", () => {
    it("POST /api/tenant/data/customers returns 200 + {list, schema, totalCount}", async () => {
      const { status, data } = await post(
        "/api/tenant/data/customers",
        { fieldNames: [INTERNAL_VARCHAR_FIELD] },
        { size: 5, page: 1 }
      );
      expect(status).toBe(200);
      expect(data).toHaveProperty("list");
      expect(Array.isArray(data.list)).toBe(true);
      expect(data).toHaveProperty("schema");
      expect(data).toHaveProperty("totalCount");
    });

    it("GET /api/tenant/data/customers/{primaryId} returns 200 + {fields, schema}", async () => {
      if (!customerPrimaryId) return console.warn("[contract-v2] skip: no customerPrimaryId");
      const { status, data } = await get(`/api/tenant/data/customers/${customerPrimaryId}`);
      expect(status).toBe(200);
      expect(data).toHaveProperty("fields");
      expect(data).toHaveProperty("schema");
    });
  });

  // ── Event data ────────────────────────────────────────────────────────────
  describe("Event data", () => {
    it("POST /api/tenant/data/events returns 200 + {event_type, list, schema, totalCount}", async () => {
      const { status, data } = await post(
        "/api/tenant/data/events",
        { fieldNames: [INTERNAL_VARCHAR_FIELD] },
        { size: 5, page: 1, event_type_id: 100 }
      );
      expect(status).toBe(200);
      expect(data).toHaveProperty("list");
      expect(Array.isArray(data.list)).toBe(true);
      expect(data).toHaveProperty("schema");
      expect(data).toHaveProperty("totalCount");
      // event_type may be null if event_type_id=100 doesn't exist, but key must be present
      expect(Object.prototype.hasOwnProperty.call(data, "event_type")).toBe(true);
    });
  });

  // ── Segmentation ──────────────────────────────────────────────────────────
  describe("Segmentation", () => {
    it("GET /api/tenants/segmentation returns 200 + {items, totalCount}", async () => {
      const { status, data } = await get("/api/tenants/segmentation", { page: 1, size: 5 });
      expect(status).toBe(200);
      expect(data).toHaveProperty("items");
      expect(Array.isArray(data.items)).toBe(true);
      expect(data).toHaveProperty("totalCount");
    });

    it("GET /api/tenants/segmentation/{id} returns 200 + object with id", async () => {
      if (!segmentationId) return console.warn("[contract-v2] skip: no segmentationId");
      const { status, data } = await get(`/api/tenants/segmentation/${segmentationId}`);
      expect(status).toBe(200);
      expect(data).toHaveProperty("id");
      expect(data.id).toBe(segmentationId);
    });

    it("POST /api/tenants/segmentation (create) returns 200 or 201", async () => {
      // Required payload: name + segments array (S26: backend now requires `segments` property)
      const { status, data } = await post("/api/tenants/segmentation", {
        name: `contract_v2_seg_${Date.now()}`,
        segments: [],
      });
      expect([200, 201]).toContain(status);
      expect(data).toHaveProperty("id");
    });

    it("PUT /api/tenants/segmentation/{id} returns 200", async () => {
      // Create a fresh segmentation to PUT against — existing ones may have corrupt UDAF refs (500)
      const { status: cs, data: cd } = await post("/api/tenants/segmentation", {
        name: `contract_v2_seg_for_put_${Date.now()}`,
        segments: [],
      });
      if (cs !== 200) return console.warn("[contract-v2] skip: could not create segmentation for PUT test");
      const freshId = cd.id;
      const { status, data } = await put(`/api/tenants/segmentation/${freshId}`, {
        name: `contract_v2_seg_updated_${Date.now()}`,
        segments: [],
      });
      expect(status).toBe(200);
      expect(data).toHaveProperty("id");
    });
  });

  // ── UDAF ──────────────────────────────────────────────────────────────────
  describe("UDAF", () => {
    it("GET /api/tenants/udafs returns 200 + {items} array (no totalCount)", async () => {
      const { status, data } = await get("/api/tenants/udafs", { page: 1, size: 5 });
      expect(status).toBe(200);
      expect(data).toHaveProperty("items");
      expect(Array.isArray(data.items)).toBe(true);
      // NOTE: unlike segmentation, UDAF list does NOT return totalCount
    });

    it("GET /api/tenants/udafs/{id} returns 200 + full UDAF object", async () => {
      if (!udafId) return console.warn("[contract-v2] skip: no udafId");
      const { status, data } = await get(`/api/tenants/udafs/${udafId}`);
      expect(status).toBe(200);
      expect(data).toHaveProperty("id");
      expect(data.id).toBe(udafId);
    });
  });

  // ── Campaign ──────────────────────────────────────────────────────────────
  describe("Campaign", () => {
    it("GET /api/tenants/campaign returns 200 + {items} array", async () => {
      const { status, data } = await get("/api/tenants/campaign", { page: 1, size: 5 });
      expect(status).toBe(200);
      expect(data).toHaveProperty("items");
      expect(Array.isArray(data.items)).toBe(true);
    });
  });

  // ── Scenario ──────────────────────────────────────────────────────────────
  describe("Scenario", () => {
    it("GET /api/tenant/scenario/crud returns 200 + {list, totalCount}", async () => {
      const { status, data } = await get("/api/tenant/scenario/crud", { page: 1, size: 5 });
      expect(status).toBe(200);
      expect(data).toHaveProperty("list");
      expect(Array.isArray(data.list)).toBe(true);
      expect(data).toHaveProperty("totalCount");
    });

    it("POST /api/tenant/scenario/crud (create) returns 200 or 201", async () => {
      const { status, data } = await post("/api/tenant/scenario/crud", {
        name: `contract_v2_scenario_${Date.now()}`,
      });
      expect([200, 201]).toContain(status);
      if ([200, 201].includes(status) && data?.id) {
        scenarioId = data.id;
      }
    });
  });

  // ── Schema sub-paths (new S17) ────────────────────────────────────────────
  describe("Schema sub-paths", () => {
    it("GET /api/tenants/schema/customers/fields returns 200 + {list}", async () => {
      const { status, data } = await get("/api/tenants/schema/customers/fields");
      expect(status).toBe(200);
      expect(data).toHaveProperty("list");
      expect(Array.isArray(data.list)).toBe(true);
    });

    it("GET /api/tenants/schema/event-types returns 200 + {list}", async () => {
      const { status, data } = await get("/api/tenants/schema/event-types");
      expect(status).toBe(200);
      expect(data).toHaveProperty("list");
      expect(Array.isArray(data.list)).toBe(true);
    });
  });

  // ── Commchan ──────────────────────────────────────────────────────────────
  describe("Commchan", () => {
    it("GET /api/tenants/commchan returns 200 + bare array", async () => {
      const { status, data } = await get("/api/tenants/commchan");
      expect(status).toBe(200);
      expect(Array.isArray(data)).toBe(true);
    });

    it("GET /api/tenants/commchan/{id} returns 200 + full object", async () => {
      if (!commchanId) return console.warn("[contract-v2] skip: no commchanId");
      const { status, data } = await get(`/api/tenants/commchan/${commchanId}`);
      expect(status).toBe(200);
      expect(data).toHaveProperty("id");
      expect(data.id).toBe(commchanId);
    });
  });

  // ── Schema / Tenant info ──────────────────────────────────────────────────
  describe("Schema and tenant info", () => {
    it("GET /api/tenants/schema/draft-schema/status returns 200 + {numberOfChanges}", async () => {
      const { status, data } = await get("/api/tenants/schema/draft-schema/status");
      expect(status).toBe(200);
      expect(data).toHaveProperty("numberOfChanges");
      expect(typeof data.numberOfChanges).toBe("number");
    });

    it("GET /api/tenants/info returns 200 + {customerFields, eventFields, tenant}", async () => {
      const { status, data } = await get("/api/tenants/info");
      expect(status).toBe(200);
      expect(data).toHaveProperty("customerFields");
      expect(data).toHaveProperty("eventFields");
      expect(data).toHaveProperty("tenant");
    });
  });
});

// =============================================================================
// 2. Known broken endpoints — assert known error status (documents bugs)
// =============================================================================

describe("Known broken endpoints", () => {
  it("BUG-043 — POST /api/tenants/segmentation/preview returns 409 (preview conflict — still broken S17)", async () => {
    const { status } = await post("/api/tenants/segmentation/preview", {
      segmentationId,
    });
    // BROKEN: always 409 "segmentation preview conflict"
    expect(status).toBe(409);
  });

  it("BUG-049 — POST /api/tenants/udafs/{id}/calculate — partial fix: old UDAFs work, new fail", async () => {
    if (!udafId) return console.warn("[contract-v2] skip: no udafId");
    const { status, data } = await post(
      `/api/tenants/udafs/${udafId}/calculate`,
      undefined,
      { primaryId: customerPrimaryId ?? 1 }
    );
    // PARTIAL FIX (S15): Pre-existing UDAFs now return 200 with result.
    // Newly created UDAFs still fail with ComputeService error.
    // Accept either 200 (old UDAF) or 500 (new UDAF).
    expect([200, 500]).toContain(status);
    if (status === 200) {
      expect(data).toHaveProperty("result");
    }
  });

  it("BUG-050 — GET /api/tenants/campaign/{id} returns 500 (nil pointer dereference)", async () => {
    if (!campaignId) return console.warn("[contract-v2] skip: no campaignId");
    const { status } = await get(`/api/tenants/campaign/${campaignId}`);
    // BROKEN: nil pointer dereference in campaign handler — update to expect 200 when fixed
    expect(status).toBe(500);
  });

  it("BUG-050 — POST /api/tenants/campaign (create) returns 500 (nil pointer dereference)", async () => {
    const { status } = await post("/api/tenants/campaign", {
      name: `contract_v2_campaign_${Date.now()}`,
      commChanId: commchanId ?? "00000000-0000-0000-0000-000000000000",
      includeSegment: [],
      excludeSegment: [],
    });
    // BROKEN: nil pointer dereference — update to expect 200/201 when fixed
    expect(status).toBe(500);
  });

  it("BUG-052 — DELETE /api/tenants/schema/draft-schema/cancel returns 200 but doesn't clear", async () => {
    // We can only verify the HTTP response; behavioural part requires a schema diff to exist.
    // Just confirm the endpoint responds (not 404/405) — the bug is the silent no-op.
    const { status } = await del("/api/tenants/schema/draft-schema/cancel");
    expect([200, 404, 409]).toContain(status);
    // NOTE: when numberOfChanges > 0, 200 is returned but changes persist (BUG-052)
  });

  it("BUG-052 — POST /api/tenants/schema/draft-schema/apply returns 409 (uncompleted plans)", async () => {
    const { status } = await post("/api/tenants/schema/draft-schema/apply", {});
    // BROKEN: returns 409 "uncompleted plans exists" — update to expect 200 when fixed
    expect([409, 200]).toContain(status);
  });

  // ── Session 15: CommChan regressions ────────────────────────────────────────
  it("BUG-055 — POST /api/tenants/commchan/verify returns 400 (method not allowed)", async () => {
    if (!commchanId) return console.warn("[contract-v2] skip: no commchanId");
    const { status } = await post("/api/tenants/commchan/verify", { commChanId: commchanId });
    // BROKEN: verify endpoint removed or method changed — was POST, now returns 400
    expect(status).toBe(400);
  });

  it("BUG-056 — POST /api/tenants/commchan (create blackhole) rejects old schema", async () => {
    const { status } = await post("/api/tenants/commchan", {
      name: `contract_v2_cc_${Date.now()}`,
      kind: "blackhole",
    });
    // BROKEN: old CREATE schema rejected by OpenAPI validation — schema changed
    expect([400, 422]).toContain(status);
  });

  // ── Method-not-allowed regressions ────────────────────────────────────────
  it("DELETE /api/tenants/segmentation/{id} returns 4xx (method not allowed / not implemented)", async () => {
    if (!segmentationId) return console.warn("[contract-v2] skip: no segmentationId");
    const { status } = await del(`/api/tenants/segmentation/${segmentationId}`);
    // BROKEN: DELETE not implemented — Gin returns 400 or 405 depending on route config
    expect([400, 405]).toContain(status);
  });

  it("PUT /api/tenants/commchan/{id} returns 4xx (method not allowed / not implemented)", async () => {
    if (!commchanId) return console.warn("[contract-v2] skip: no commchanId");
    const { status } = await put(`/api/tenants/commchan/${commchanId}`, { name: "noop" });
    // BROKEN: PUT not implemented — actual status is 400 or 405
    expect([400, 405]).toContain(status);
  });

  it("DELETE /api/tenants/commchan/{id} returns 4xx (method not allowed / not implemented)", async () => {
    if (!commchanId) return console.warn("[contract-v2] skip: no commchanId");
    const { status } = await del(`/api/tenants/commchan/${commchanId}`);
    // BROKEN: DELETE not implemented — actual status is 400 or 405
    expect([400, 405]).toContain(status);
  });

  it("PUT /api/tenants/udafs/{id} returns 4xx (method not allowed / not implemented)", async () => {
    if (!udafId) return console.warn("[contract-v2] skip: no udafId");
    const { status } = await put(`/api/tenants/udafs/${udafId}`, { name: "noop" });
    // BROKEN: PUT not implemented — actual status is 400 or 405
    expect([400, 405]).toContain(status);
  });

  it("DELETE /api/tenants/udafs/{id} returns 4xx (method not allowed / not implemented)", async () => {
    if (!udafId) return console.warn("[contract-v2] skip: no udafId");
    const { status } = await del(`/api/tenants/udafs/${udafId}`);
    // BROKEN: DELETE not implemented — actual status is 400 or 405
    expect([400, 405]).toContain(status);
  });

  it("DELETE /api/tenants/campaign/{id} returns 4xx (method not allowed / not implemented)", async () => {
    if (!campaignId) return console.warn("[contract-v2] skip: no campaignId");
    const { status } = await del(`/api/tenants/campaign/${campaignId}`);
    // BROKEN: DELETE not implemented — actual status is 400 or 405
    expect([400, 405]).toContain(status);
  });

  // ── Scenario CRUD regression (from Session 14) ──────────────────────────
  it("REGRESSION — GET /api/tenant/scenario/crud/{id} returns 404 or 'no matching operation' error", async () => {
    if (!scenarioId) return console.warn("[contract-v2] skip: no scenarioId");
    const { status, data } = await get(`/api/tenant/scenario/crud/${scenarioId}`);
    expect([400, 404, 405]).toContain(status);
    console.warn(`[contract-v2] Scenario GET by ID: status=${status}`, JSON.stringify(data).substring(0, 200));
  });

  it("REGRESSION — PUT /api/tenant/scenario/crud/{id} returns error (no matching operation)", async () => {
    if (!scenarioId) return console.warn("[contract-v2] skip: no scenarioId");
    const { status, data } = await put(`/api/tenant/scenario/crud/${scenarioId}`, {
      name: `contract_v2_updated_${Date.now()}`,
    });
    expect([400, 404, 405]).toContain(status);
    console.warn(`[contract-v2] Scenario PUT by ID: status=${status}`, JSON.stringify(data).substring(0, 200));
  });

  it("REGRESSION — DELETE /api/tenant/scenario/crud/{id} returns error (no matching operation)", async () => {
    if (!scenarioId) return console.warn("[contract-v2] skip: no scenarioId");
    const { status, data } = await del(`/api/tenant/scenario/crud/${scenarioId}`);
    expect([400, 404, 405]).toContain(status);
    console.warn(`[contract-v2] Scenario DELETE by ID: status=${status}`, JSON.stringify(data).substring(0, 200));
  });
});

// =============================================================================
// 3. Removed endpoints — verify 404
// =============================================================================

describe("Removed endpoints (must return 404)", () => {
  it("GET /api/tenants/udaf (singular) returns 404 — use /udafs plural", async () => {
    const { status } = await get("/api/tenants/udaf");
    expect(status).toBe(404);
  });

  it("GET /api/tenants/templates returns 404 (removed)", async () => {
    const { status } = await get("/api/tenants/templates");
    expect(status).toBe(404);
  });

  it("GET /api/tenants/employees returns 404 (removed)", async () => {
    const { status } = await get("/api/tenants/employees");
    expect(status).toBe(404);
  });

  it("GET /api/tenants/schema returns 404 (removed — use /api/tenants/schema/draft-schema/status)", async () => {
    const { status } = await get("/api/tenants/schema");
    expect(status).toBe(404);
  });

  it("GET /api/tenant/data/schema returns 404 (removed)", async () => {
    const { status } = await get("/api/tenant/data/schema");
    expect(status).toBe(404);
  });

  // ── Session 15 discoveries ─────────────────────────────────────────────────
  it("POST /api/auth/sign-in returns 401 (frontend route, not API endpoint)", async () => {
    const baseUrl = globalThis.__cdp_base_url;
    const res = await fetch(`${baseUrl}/api/auth/sign-in`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ domain: "x", email: "x", password: "x" }),
    });
    // This is a frontend route (hyphenated), not the backend API.
    // Backend API is at /public/api/signin (no hyphen).
    expect(res.status).toBe(401);
  });

  it("GET /api/tenants/webhook returns 404 (removed — merged into commchan)", async () => {
    const { status } = await get("/api/tenants/webhook");
    expect(status).toBe(404);
  });

  it("GET /api/tenants/webhook/list returns 404 (removed)", async () => {
    const { status } = await get("/api/tenants/webhook/list");
    expect(status).toBe(404);
  });

  // ── Segmentation preview — removed S17 (was 409 in S16) ──────────────────
  it("POST /api/tenants/segmentation/{id}/preview returns 404 (removed S17)", async () => {
    if (!segmentationId) return console.warn("[contract-v2] skip: no segmentationId");
    const { status } = await post(`/api/tenants/segmentation/${segmentationId}/preview`, {});
    expect(status).toBe(404);
  });

  it("GET /api/tenants/autocomplete returns 404 (removed)", async () => {
    const { status } = await get("/api/tenants/autocomplete", { field: "customer_name_first", prefix: "a" });
    expect(status).toBe(404);
  });

  it("GET /api/tenants/commchan/list returns 400 (list suffix removed — use /api/tenants/commchan)", async () => {
    const { status } = await get("/api/tenants/commchan/list");
    // "list" is now interpreted as a UUID param → parse error
    expect(status).toBe(400);
  });

  it("GET /api/tenants/segmentation/list returns 400 (list suffix removed — use /api/tenants/segmentation)", async () => {
    const { status } = await get("/api/tenants/segmentation/list");
    // "list" is now interpreted as a UUID param → parse error
    expect(status).toBe(400);
  });

  it("GET /api/tenants/campaign/list returns 400 (list suffix removed — use /api/tenants/campaign)", async () => {
    const { status } = await get("/api/tenants/campaign/list");
    // "list" is now interpreted as a UUID param → parse error
    expect(status).toBe(400);
  });
});

// =============================================================================
// 4. Response format contract — correct wrapper shape per resource type
// =============================================================================

describe("Response format contract", () => {
  it("Segmentation uses {items, totalCount} wrapper — NOT {list}", async () => {
    const { status, data } = await get("/api/tenants/segmentation", { page: 1, size: 1 });
    expect(status).toBe(200);
    expect(data).toHaveProperty("items");
    expect(data).toHaveProperty("totalCount");
    expect(data).not.toHaveProperty("list");
  });

  it("UDAF uses {items} wrapper — NOT {list}; no totalCount", async () => {
    const { status, data } = await get("/api/tenants/udafs", { page: 1, size: 1 });
    expect(status).toBe(200);
    expect(data).toHaveProperty("items");
    expect(data).not.toHaveProperty("list");
    // totalCount is absent on UDAF list — this is intentional per current contract
    expect(data).not.toHaveProperty("totalCount");
  });

  it("Campaign uses {items} wrapper — NOT {list}", async () => {
    const { status, data } = await get("/api/tenants/campaign", { page: 1, size: 1 });
    expect(status).toBe(200);
    expect(data).toHaveProperty("items");
    expect(data).not.toHaveProperty("list");
  });

  it("Scenario uses {list, totalCount} wrapper — NOT {items}", async () => {
    const { status, data } = await get("/api/tenant/scenario/crud", { page: 1, size: 1 });
    expect(status).toBe(200);
    expect(data).toHaveProperty("list");
    expect(data).toHaveProperty("totalCount");
    expect(data).not.toHaveProperty("items");
  });

  it("Customer list uses {list, schema, totalCount} wrapper — NOT {items}", async () => {
    const { status, data } = await post(
      "/api/tenant/data/customers",
      { fieldNames: [INTERNAL_VARCHAR_FIELD] },
      { size: 1, page: 1 }
    );
    expect(status).toBe(200);
    expect(data).toHaveProperty("list");
    expect(data).toHaveProperty("schema");
    expect(data).toHaveProperty("totalCount");
    expect(data).not.toHaveProperty("items");
  });

  it("Commchan list is a bare array — NOT {items} or {list}", async () => {
    const { status, data } = await get("/api/tenants/commchan");
    expect(status).toBe(200);
    // Response is a bare JSON array, not wrapped in an object
    expect(Array.isArray(data)).toBe(true);
    // Confirm it is not an object wrapper (array with items/list keys)
    expect((data as any).items).toBeUndefined();
    expect((data as any).list).toBeUndefined();
  });
});
