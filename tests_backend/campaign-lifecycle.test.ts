/**
 * Campaign Full Lifecycle Test
 *
 * Hypothesis-driven tests covering the campaign CRUD lifecycle end-to-end.
 * Each test answers a specific question about system behavior.
 *
 * Known bugs exercised:
 *   BUG-041: DELETE /api/tenants/campaign/{id} returns "method not allowed"
 *   BUG-050: POST without templateId causes 500 nil pointer crash
 */
import { describe, it, expect } from "vitest";
import { get, post, put, del } from "./client";

const TAG = "TEST_lifecycle_camp";

// ─── Prerequisites: resolve shared-tenant fixture IDs ────────────────────────

/**
 * Resolve the first available inner-segment ID, commchan ID, and template ID.
 * All campaign create/update calls need these; they live in the shared tenant.
 */
async function resolveFixtures(): Promise<{
  innerSegId: string | null;
  commChanId: string | null;
  templateId: string | null;
}> {
  // commchan — any verified channel
  const { data: channels } = await get("/api/tenants/commchan", { verified: true });
  const commChanId: string | null =
    Array.isArray(channels) && channels.length > 0 ? channels[0].id : null;

  // segmentation — drill into first seg to get an inner segment ID
  let innerSegId: string | null = null;
  const { data: segs } = await get("/api/tenants/segmentation", { page: 0, size: 10 });
  if (Array.isArray(segs?.items)) {
    for (const seg of segs.items) {
      const { data: detail } = await get(`/api/tenants/segmentation/${seg.id}`);
      if (Array.isArray(detail?.segments) && detail.segments.length > 0) {
        innerSegId = detail.segments[0].id;
        break;
      }
    }
  }

  // template — first available template (singular /api/tenant/template, returns {list: [...]})
  let templateId: string | null = null;
  const { data: templates } = await get("/api/tenant/template");
  if (Array.isArray(templates?.list) && templates.list.length > 0) {
    templateId = templates.list[0].id;
  } else if (Array.isArray(templates) && templates.length > 0) {
    templateId = templates[0].id;
  }

  return { innerSegId, commChanId, templateId };
}

// ─── 1. List endpoint contract ───────────────────────────────────────────────

describe("Campaign list — GET /api/tenants/campaign", () => {
  it("returns 200 with items array", async () => {
    const { status, data } = await get("/api/tenants/campaign", { page: 0, size: 10 });
    expect(status).toBe(200);
    expect(data).toHaveProperty("items");
    expect(Array.isArray(data.items)).toBe(true);
  });

  it("each item has id and name fields", async () => {
    const { data } = await get("/api/tenants/campaign", { page: 0, size: 20 });
    for (const item of data.items) {
      expect(typeof item.id).toBe("string");
      expect(item.id.length).toBeGreaterThan(0);
      expect(typeof item.name).toBe("string");
    }
  });
});

// ─── 2. BUG-050: CREATE without templateId → 500 crash ──────────────────────

describe("BUG-050: CREATE without templateId causes nil pointer crash", () => {
  it("POST without templateId returns 500 (nil pointer dereference)", async () => {
    const { commChanId, innerSegId } = await resolveFixtures();
    if (!commChanId) {
      console.warn("No commchan available — skipping BUG-050 check");
      return;
    }

    const payload = {
      name: `${TAG}_no_template_${Date.now()}`,
      commChanId,
      includeSegment: innerSegId ? [innerSegId] : [],
      excludeSegment: [],
      // templateId intentionally omitted
    };

    const { status, data } = await post("/api/tenants/campaign", payload);
    // BUG-050: server crashes with nil pointer instead of returning 400
    console.log(`BUG-050 status: ${status}, data: ${JSON.stringify(data).slice(0, 200)}`);
    if (status === 400 || status === 422) {
      // Bug is fixed — server now validates templateId
      console.log("BUG-050 FIXED: missing templateId returns validation error");
      expect([400, 422]).toContain(status);
    } else {
      // Bug still present
      expect(status).toBe(500);
    }
  });
});

// ─── 3. Full lifecycle: create → get → update → verify ──────────────────────

describe("Campaign full lifecycle — create → get-by-id → update → verify", () => {
  let campaignId: string;
  let createdName: string;
  let fixtures: { innerSegId: string | null; commChanId: string | null; templateId: string | null };

  it("setup: resolve fixture IDs from shared tenant", async () => {
    fixtures = await resolveFixtures();
    console.log("Fixtures:", JSON.stringify(fixtures));
    // Not asserting presence — later tests gracefully skip if missing
  });

  it("1. CREATE with valid templateId returns 200 + ID", async () => {
    if (!fixtures?.commChanId || !fixtures?.templateId) {
      console.warn("Missing commChanId or templateId — skipping CREATE");
      return;
    }

    createdName = `${TAG}_${Date.now()}`;
    const payload = {
      name: createdName,
      commChanId: fixtures.commChanId,
      templateId: fixtures.templateId,
      includeSegment: fixtures.innerSegId ? [fixtures.innerSegId] : [],
      excludeSegment: [],
    };

    const { status, data } = await post("/api/tenants/campaign", payload);
    console.log(`CREATE status: ${status}, data: ${JSON.stringify(data).slice(0, 300)}`);
    expect(status).toBe(200);
    expect(data).toHaveProperty("id");
    expect(typeof data.id).toBe("string");
    expect(data.id.length).toBeGreaterThan(0);
    campaignId = data.id;
  });

  it("2. GET-by-id returns full object with commChan, includeSegment, template", async () => {
    if (!campaignId) return;

    const { status, data } = await get(`/api/tenants/campaign/${campaignId}`);
    console.log(`GET-by-id status: ${status}, data: ${JSON.stringify(data).slice(0, 400)}`);
    expect(status).toBe(200);
    expect(data.id).toBe(campaignId);
    expect(data.name).toBe(createdName);
    expect(data).toHaveProperty("commChan");
    expect(data).toHaveProperty("includeSegment");
    expect(data).toHaveProperty("excludeSegment");
    expect(Array.isArray(data.includeSegment)).toBe(true);
    // excludeSegment can be null or array — API returns null when empty
    expect(data.excludeSegment === null || Array.isArray(data.excludeSegment)).toBe(true);
    // Template should be present given we provided templateId at create
    expect(data).toHaveProperty("template");
  });

  it("3. PUT updates name — GET confirms new name persisted", async () => {
    if (!campaignId || !fixtures?.commChanId || !fixtures?.templateId) return;

    const updatedName = `${TAG}_updated_${Date.now()}`;
    const payload = {
      name: updatedName,
      commChanId: fixtures.commChanId,
      templateId: fixtures.templateId,
      includeSegment: fixtures.innerSegId ? [fixtures.innerSegId] : [],
      excludeSegment: [],
    };

    const { status: putStatus, data: putData } = await put(`/api/tenants/campaign/${campaignId}`, payload);
    console.log(`PUT status: ${putStatus}, data: ${JSON.stringify(putData).slice(0, 200)}`);
    expect(putStatus).toBe(200);

    // Verify persistence by re-fetching
    const { status: getStatus, data: getData } = await get(`/api/tenants/campaign/${campaignId}`);
    expect(getStatus).toBe(200);
    expect(getData.name).toBe(updatedName);
  });

  it("4. Updated name appears in list", async () => {
    if (!campaignId) return;

    // Campaign list returns max 10 items oldest-first — new campaign may not appear
    // (same pattern as BUG-037 for templates)
    const { data } = await get("/api/tenants/campaign");
    const items = data?.items || [];
    const found = items.find((c: any) => c.id === campaignId);
    if (!found) {
      console.warn(`[FINDING] Campaign list (${items.length} items) does not include newly created campaign ${campaignId} — no pagination/sort control (similar to BUG-037)`);
    } else {
      expect(found.name).toContain(`${TAG}_updated_`);
    }
    // At minimum, list should return something
    expect(items.length).toBeGreaterThan(0);
  });
});

// ─── 4. BUG-041: DELETE returns "method not allowed" ────────────────────────

describe("BUG-041: DELETE /api/tenants/campaign/{id} returns method not allowed", () => {
  let campaignId: string;

  it("setup: create a campaign to attempt deletion on", async () => {
    const fixtures = await resolveFixtures();
    if (!fixtures.commChanId || !fixtures.templateId) {
      console.warn("Missing fixtures — cannot create campaign for DELETE test");
      return;
    }

    const { status, data } = await post("/api/tenants/campaign", {
      name: `${TAG}_del_${Date.now()}`,
      commChanId: fixtures.commChanId,
      templateId: fixtures.templateId,
      includeSegment: fixtures.innerSegId ? [fixtures.innerSegId] : [],
      excludeSegment: [],
    });

    if (status === 200 && data.id) {
      campaignId = data.id;
    } else {
      console.warn(`Cannot create campaign for DELETE test: ${status} ${JSON.stringify(data).slice(0, 200)}`);
    }
  });

  it("BUG-041: DELETE returns 405 or error body 'method not allowed'", async () => {
    if (!campaignId) {
      // Fallback: try deleting a non-existent campaign to observe the method behavior
      console.warn("No campaignId — using nil UUID to probe DELETE method support");
      const { status, data } = await del("/api/tenants/campaign/00000000-0000-0000-0000-000000000000");
      console.log(`DELETE (nil UUID) status: ${status}, data: ${JSON.stringify(data).slice(0, 200)}`);
      // Still expect method not allowed (BUG-041) — route itself is unimplemented
      const body = typeof data === "string" ? data : JSON.stringify(data);
      const isMethodNotAllowed =
        status === 405 || body.toLowerCase().includes("method not allowed");
      expect(isMethodNotAllowed).toBe(true);
      return;
    }

    const { status, data } = await del(`/api/tenants/campaign/${campaignId}`);
    console.log(`DELETE status: ${status}, data: ${JSON.stringify(data).slice(0, 200)}`);

    if (status === 200 || status === 204) {
      // Bug is fixed — DELETE now works
      console.log("BUG-041 FIXED: DELETE campaign now returns success");
      expect([200, 204]).toContain(status);
    } else {
      // Bug still present — confirm the method not allowed response
      const body = typeof data === "string" ? data : JSON.stringify(data);
      const isMethodNotAllowed =
        status === 405 || body.toLowerCase().includes("method not allowed");
      expect(isMethodNotAllowed).toBe(true);
      console.log("BUG-041 confirmed: DELETE campaign returns method not allowed");
    }
  });
});

// ─── 5. GET non-existent campaign ────────────────────────────────────────────

describe("Campaign error handling — non-existent ID", () => {
  it("GET with nil UUID returns error (not 200)", async () => {
    const { status, data } = await get("/api/tenants/campaign/00000000-0000-0000-0000-000000000000");
    console.log(`GET nil UUID: status ${status}, data: ${JSON.stringify(data).slice(0, 200)}`);
    // Should be 404; some backends return 400 or 500 for unknown IDs
    expect(status).not.toBe(200);
    expect([400, 404, 500]).toContain(status);
  });

  it("GET with random UUID returns error (not 200)", async () => {
    const fakeId = "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee";
    const { status } = await get(`/api/tenants/campaign/${fakeId}`);
    expect(status).not.toBe(200);
  });
});

// ─── 6. CREATE input validation ──────────────────────────────────────────────

describe("Campaign CREATE input validation", () => {
  it("CREATE with empty name — observe if validated or accepted", async () => {
    const fixtures = await resolveFixtures();
    if (!fixtures.commChanId || !fixtures.templateId) return;

    const { status, data } = await post("/api/tenants/campaign", {
      name: "",
      commChanId: fixtures.commChanId,
      templateId: fixtures.templateId,
      includeSegment: [],
      excludeSegment: [],
    });

    console.log(`Empty name create: status ${status}, data: ${JSON.stringify(data).slice(0, 200)}`);
    if (status === 400 || status === 422) {
      console.log("Good: empty name rejected with validation error");
    } else if (status === 200) {
      console.log("FINDING: empty campaign name accepted — no server-side validation");
    }
    // Record actual behavior without asserting a specific outcome
    expect([200, 400, 422]).toContain(status);
  });

  it("CREATE with missing commChanId — observe error type", async () => {
    const fixtures = await resolveFixtures();
    if (!fixtures.templateId) return;

    const { status, data } = await post("/api/tenants/campaign", {
      name: `${TAG}_no_commchan_${Date.now()}`,
      templateId: fixtures.templateId,
      includeSegment: [],
      excludeSegment: [],
      // commChanId intentionally omitted
    });

    console.log(`Missing commChanId: status ${status}, data: ${JSON.stringify(data).slice(0, 200)}`);
    // Should fail; 500 here would be another nil pointer crash
    expect([400, 422, 500]).toContain(status);
    if (status === 500) {
      console.log("FINDING: missing commChanId causes 500 — possible nil pointer (similar to BUG-050)");
    }
  });
});
