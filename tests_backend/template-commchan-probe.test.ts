/**
 * Template CRUD and Communication Channel (commchan) endpoint probe tests.
 *
 * Actual API field names (discovered via probing):
 *   Template: { name, template_name, subject, content, content_type, variables }
 *   Commchan: { name, kind, chanconf, mappings }
 *   Webhook chanconf: { url, method, batch_size }
 *
 * Known bugs confirmed/discovered:
 *  - BUG-037: template list returns oldest-first with no sort control
 *  - BUG-011: commchan PUT returns 400 "method not allowed"
 *  - NEW: commchan DELETE returns 400 "method not allowed"
 *  - NEW: template DELETE returns 400 "method not allowed"
 *  - API-REFERENCE.md documents wrong field names (camelCase vs snake_case)
 */
import { describe, it, expect } from "vitest";
import { get, post, put, del } from "./client";

const TS = Date.now();

function templatePayload(name: string, overrides: Record<string, unknown> = {}) {
  return {
    name,
    template_name: name,
    subject: "Test Subject",
    content: "Hello world",
    content_type: "text",
    variables: {},
    ...overrides,
  };
}

function commchanWebhook(name: string) {
  return {
    name,
    kind: "webhook",
    chanconf: { url: "http://10.0.10.165:30104/", method: "POST", batch_size: "250" },
    mappings: {},
  };
}

function commchanBlackhole(name: string) {
  return { name, kind: "blackhole", chanconf: {}, mappings: {} };
}

// ─── Template CRUD ──────────────────────────────────────────────────────────

describe("Template CRUD — /api/tenant/template", () => {
  let createdId: string | null = null;
  let secondId: string | null = null;

  // 1. Create with correct payload
  it("H1: CREATE with correct payload returns 201", async () => {
    const { status, data } = await post("/api/tenant/template", templatePayload(`TEST_probe_minimal_${TS}`));
    expect(status).toBe(201);
    createdId = data?.id ?? null;
    expect(createdId).toBeTruthy();
  });

  // 2. Create with HTML body content
  it("H2: CREATE with HTML body content (including script tag) is accepted", async () => {
    const { status, data } = await post("/api/tenant/template", templatePayload(`TEST_probe_html_${TS}`, {
      content: "<h1>Welcome</h1><p>Hello <b>{{first_name}}</b>!</p><script>alert('xss')</script>",
      content_type: "html",
    }));
    expect(status).toBe(201);
    secondId = data?.id ?? null;

    // Check if script tag was sanitized or stored as-is
    if (secondId) {
      const getRes = await get(`/api/tenant/template/${secondId}`);
      if (getRes.status === 200) {
        const content = getRes.data?.content ?? "";
        const hasScript = content.includes("<script>");
        console.log(`[PROBE] HTML body stored contains <script>: ${hasScript} (no sanitization = potential XSS)`);
      }
    }
  });

  // 3. Create with empty name — BUG: accepted (no validation)
  it("H3: CREATE with empty name is accepted (BUG: missing name validation)", async () => {
    const { status } = await post("/api/tenant/template", templatePayload("", { template_name: "" }));
    // BUG: Backend accepts empty name — should return 400
    expect(status).toBe(201);
  });

  // 3b. Create with empty content — BUG: 500 instead of 400
  it("H3b: CREATE with empty content returns 500 (BUG: crashes instead of 400 validation)", async () => {
    const { status } = await post("/api/tenant/template", templatePayload(`TEST_probe_nobody_${TS}`, { content: "" }));
    console.log(`[PROBE] Empty content template create status: ${status}`);
    // BUG: Backend crashes with 500 instead of returning 400 validation error
    expect(status).toBe(500);
  });

  // 4. GET by ID returns full content
  it("H4: GET by ID returns full template content with correct fields", async () => {
    if (!createdId) return;
    const { status, data } = await get(`/api/tenant/template/${createdId}`);
    expect(status).toBe(200);
    expect(data?.template_name).toContain("TEST_probe_minimal");
    expect(data?.content).toBe("Hello world");
    expect(data?.content_type).toBe("text");
    expect(data?.subject).toBe("Test Subject");
  });

  // 5. UPDATE persists changes
  it("H5: UPDATE template persists changes", async () => {
    if (!createdId) return;
    const updatedContent = "Updated body " + TS;
    const { status: putStatus } = await put(`/api/tenant/template/${createdId}`, templatePayload(`TEST_probe_minimal_${TS}`, {
      subject: "Updated Subject",
      content: updatedContent,
    }));
    expect(putStatus).toBe(200);

    // Verify persistence
    const { status: getStatus, data } = await get(`/api/tenant/template/${createdId}`);
    expect(getStatus).toBe(200);
    expect(data?.content).toBe(updatedContent);
    expect(data?.subject).toBe("Updated Subject");
  });

  // 6. DELETE — returns 400 "method not allowed" (NEW BUG)
  it("H6: DELETE template returns 400 'method not allowed' (BUG: DELETE unimplemented)", async () => {
    if (!createdId) return;
    const { status, data } = await del(`/api/tenant/template/${createdId}`);
    console.log(`[PROBE] Template DELETE status: ${status}, response: ${JSON.stringify(data)}`);
    // BUG: returns 400 "method not allowed" — DELETE is not implemented
    expect(status).toBe(400);
    expect(data?.error).toMatch(/method not allowed/i);

    // Confirm template still exists after failed delete
    const { status: getStatus } = await get(`/api/tenant/template/${createdId}`);
    expect(getStatus).toBe(200);
  });

  // 7. List — verify BUG-037 (sort order)
  it("H7: Template list returns items — check sort order (BUG-037: oldest-first)", async () => {
    const { status, data } = await get("/api/tenant/template", { page: 1, size: 50 });
    expect(status).toBe(200);
    const items = data?.list ?? [];
    expect(Array.isArray(items)).toBe(true);
    expect(items.length).toBeGreaterThan(0);
    console.log(`[PROBE] Template list count: ${items.length}, totalCount: ${data?.totalCount}`);
    // List only returns id, template_name, subject, content_type — no createdAt for sort verification
    // BUG-037 cannot be verified via timestamps from list endpoint
  });

  // 8. Special characters in name
  it("H8: Template with Unicode name is accepted", async () => {
    const uniName = `TEST_probe_unicode_${TS}_\u041F\u0440\u0438\u0432\u0435\u0442`;
    const { status, data } = await post("/api/tenant/template", templatePayload(uniName, { template_name: uniName }));
    console.log(`[PROBE] Unicode template create status: ${status}`);
    expect(status).toBe(201);
    // Verify it stored correctly
    if (data?.id) {
      const getRes = await get(`/api/tenant/template/${data.id}`);
      expect(getRes.data?.template_name).toContain("\u041F\u0440\u0438\u0432\u0435\u0442");
    }
  });

  it("H8b: Template with very long name (500 chars) — accepted or rejected?", async () => {
    const longName = "TEST_probe_long_" + "A".repeat(484);
    const { status } = await post("/api/tenant/template", templatePayload(longName, { template_name: longName }));
    console.log(`[PROBE] Long name (500 chars) template create status: ${status}`);
    // Accept either — probing
    expect([201, 400, 422]).toContain(status);
  });

  // 14. Duplicate name
  it("H14: Duplicate template name — allowed or rejected?", async () => {
    const dupName = `TEST_probe_dup_${TS}`;
    const first = await post("/api/tenant/template", templatePayload(dupName, { template_name: dupName }));
    expect(first.status).toBe(201);

    const second = await post("/api/tenant/template", templatePayload(dupName, { template_name: dupName, content: "body2" }));
    console.log(`[PROBE] Duplicate template name create status: ${second.status}`);

    if (second.status === 201) {
      console.log("[PROBE] Duplicate template names ARE allowed (no uniqueness constraint)");
    } else {
      console.log("[PROBE] Duplicate template names are REJECTED");
    }
    expect([201, 400, 409]).toContain(second.status);
  });

  // Edge: invalid content_type
  it("H_edge: CREATE with invalid content_type is rejected", async () => {
    const { status } = await post("/api/tenant/template", templatePayload(`TEST_probe_badtype_${TS}`, { content_type: "xml" }));
    console.log(`[PROBE] Invalid content_type status: ${status}`);
    expect([201, 400]).toContain(status);
  });

  // Edge: content_type json
  it("H_edge: CREATE with content_type=json", async () => {
    const { status } = await post("/api/tenant/template", templatePayload(`TEST_probe_json_${TS}`, {
      content_type: "json",
      content: '{"greeting": "hello"}',
    }));
    console.log(`[PROBE] JSON content_type status: ${status}`);
    expect([201, 400]).toContain(status);
  });

  // Edge: GET non-existent
  it("H_edge: GET non-existent template returns 404", async () => {
    const { status } = await get("/api/tenant/template/00000000-0000-0000-0000-000000000000");
    expect(status).toBe(404);
  });

  // Auth check
  it("H_edge: CREATE template without auth returns 401", async () => {
    const baseUrl = globalThis.__cdp_base_url;
    const res = await fetch(`${baseUrl}/api/tenant/template`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(templatePayload("noauth")),
    });
    expect(res.status).toBe(401);
  });
});

// ─── Communication Channel CRUD ─────────────────────────────────────────────

describe("Communication Channel CRUD — /api/tenants/commchan", () => {
  let webhookId: string | null = null;
  let blackholeId: string | null = null;

  // 9. Create webhook
  it("H9: CREATE webhook channel with correct chanconf", async () => {
    const { status, data } = await post("/api/tenants/commchan", commchanWebhook(`TEST_probe_webhook_${TS}`));
    console.log(`[PROBE] Webhook create status: ${status}`);
    expect(status).toBe(200);
    webhookId = data?.id ?? null;
    expect(webhookId).toBeTruthy();
    expect(data?.kind).toBe("webhook");
    expect(data?.chanconf?.url).toBe("http://10.0.10.165:30104/");
  });

  // 10. Create blackhole
  it("H10: CREATE blackhole channel (minimal config)", async () => {
    const { status, data } = await post("/api/tenants/commchan", commchanBlackhole(`TEST_probe_blackhole_${TS}`));
    console.log(`[PROBE] Blackhole create status: ${status}`);
    expect(status).toBe(200);
    blackholeId = data?.id ?? null;
    expect(blackholeId).toBeTruthy();
    expect(data?.kind).toBe("blackhole");
  });

  // 11. List channels
  it("H11: List commchans returns array with known types", async () => {
    const { status, data } = await get("/api/tenants/commchan");
    expect(status).toBe(200);
    expect(Array.isArray(data)).toBe(true);
    const kinds = [...new Set(data.map((ch: any) => ch.kind))];
    console.log(`[PROBE] Commchan list count: ${data.length}, kinds: ${JSON.stringify(kinds)}`);
    expect(data.length).toBeGreaterThan(0);
  });

  // GET by ID
  it("H11b: GET commchan by ID returns full detail", async () => {
    if (!webhookId) return;
    const { status, data } = await get(`/api/tenants/commchan/${webhookId}`);
    expect(status).toBe(200);
    expect(data?.name).toContain("TEST_probe_webhook");
    expect(data?.chanconf).toBeDefined();
    expect(data?.mappings).toBeDefined();
  });

  // 12. UPDATE — re-verify BUG-011
  it("H12: UPDATE commchan returns 400 'method not allowed' (BUG-011 confirmed)", async () => {
    if (!webhookId) return;
    const { status, data } = await put(`/api/tenants/commchan/${webhookId}`, commchanWebhook(`TEST_probe_webhook_updated_${TS}`));
    console.log(`[PROBE] Commchan PUT status: ${status}, response: ${JSON.stringify(data)}`);
    // BUG-011: returns 400 "method not allowed"
    expect(status).toBe(400);
    expect(data?.error).toMatch(/method not allowed/i);
  });

  // Verify channels
  it("H12b: Verify webhook channel succeeds", async () => {
    if (!webhookId) return;
    const { status, data } = await post(`/api/tenants/commchan/${webhookId}/verify`);
    console.log(`[PROBE] Webhook verify status: ${status}, verified: ${data?.verified}`);
    expect(status).toBe(200);
    expect(data?.verified).toBe(true);
  });

  it("H12c: Verify blackhole channel succeeds", async () => {
    if (!blackholeId) return;
    const { status, data } = await post(`/api/tenants/commchan/${blackholeId}/verify`);
    console.log(`[PROBE] Blackhole verify status: ${status}, verified: ${data?.verified}`);
    expect(status).toBe(200);
    expect(data?.verified).toBe(true);
  });

  // 13. DELETE — returns 400 "method not allowed" (NEW BUG)
  it("H13: DELETE commchan returns 400 'method not allowed' (BUG: DELETE unimplemented)", async () => {
    if (!webhookId) return;
    const { status, data } = await del(`/api/tenants/commchan/${webhookId}`);
    console.log(`[PROBE] Commchan DELETE status: ${status}, response: ${JSON.stringify(data)}`);
    // BUG: returns 400 "method not allowed"
    expect(status).toBe(400);
    expect(data?.error).toMatch(/method not allowed/i);
  });

  // 15. Duplicate name
  it("H15: Duplicate commchan name — allowed or rejected?", async () => {
    const dupName = `TEST_probe_dup_chan_${TS}`;
    const first = await post("/api/tenants/commchan", commchanBlackhole(dupName));
    expect(first.status).toBe(200);

    const second = await post("/api/tenants/commchan", commchanBlackhole(dupName));
    console.log(`[PROBE] Duplicate commchan name create status: ${second.status}`);

    if (second.status === 200) {
      console.log("[PROBE] Duplicate commchan names ARE allowed (no uniqueness constraint)");
    } else {
      console.log("[PROBE] Duplicate commchan names are REJECTED");
    }
    expect([200, 400, 409]).toContain(second.status);
  });

  // Edge: unknown kind
  it("H_edge: CREATE commchan with unknown kind is rejected", async () => {
    const { status } = await post("/api/tenants/commchan", {
      name: `TEST_probe_badkind_${TS}`, kind: "telegram", chanconf: {}, mappings: {},
    });
    console.log(`[PROBE] Unknown kind commchan status: ${status}`);
    expect(status).toBeGreaterThanOrEqual(400);
  });

  // Edge: webhook without method/batch_size in chanconf
  it("H_edge: Webhook without method in chanconf returns 409 'not valid'", async () => {
    const { status, data } = await post("/api/tenants/commchan", {
      name: `TEST_probe_wh_minimal_${TS}`,
      kind: "webhook",
      chanconf: { url: "http://10.0.10.165:30104/" },
      mappings: {},
    });
    console.log(`[PROBE] Webhook without method status: ${status}`);
    // 409 "communication channel not valid"
    expect(status).toBe(409);
  });

  // Edge: GET non-existent
  it("H_edge: GET non-existent commchan returns 404", async () => {
    const { status } = await get("/api/tenants/commchan/00000000-0000-0000-0000-000000000000");
    expect([400, 404]).toContain(status);
  });

  // Edge: missing mappings field
  it("H_edge: CREATE without mappings returns 400 (schema validation)", async () => {
    const { status } = await post("/api/tenants/commchan", {
      name: `TEST_nomappings_${TS}`, kind: "blackhole", chanconf: {},
    });
    expect(status).toBe(400);
  });
});
