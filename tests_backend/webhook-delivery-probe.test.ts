/**
 * Webhook Delivery Probe — /api/tenants/commchan (webhook-specific behavior)
 *
 * Scope: webhook creation variants, verify endpoint mechanics, unreachable URLs,
 *        malformed URLs, HTTP vs HTTPS, validate endpoint.
 *
 * NOT tested here: CRUD (covered in template-commchan-probe.test.ts)
 *
 * Discovered field names (from probe tests):
 *   Commchan: { name, kind, chanconf, mappings }
 *   Webhook chanconf: { url, method, batch_size }
 *
 * Internal webhook URL that accepts connections: http://10.0.10.165:30104/
 * Non-routable (RFC 5737 TEST-NET): 192.0.2.1 — TCP will hang or reset
 * External HTTPS endpoint: https://webhook-cdpv2.ssd.uz/
 */

import { describe, it, expect } from "vitest";
import { get, post, del } from "./client";

const TS = Date.now();

function webhookChan(name: string, url: string, overrides: Record<string, unknown> = {}) {
  return {
    name,
    kind: "webhook",
    chanconf: { url, method: "POST", batch_size: "250", ...overrides },
    mappings: {},
  };
}

// ─── Suite 1: Webhook Creation Variants ─────────────────────────────────────

describe("Webhook creation variants — chanconf permutations", () => {
  let reachableId: string | null = null;

  it("W1: CREATE webhook with internal reachable URL (baseline)", async () => {
    const { status, data } = await post(
      "/api/tenants/commchan",
      webhookChan(`TEST_wh_reachable_${TS}`, "http://10.0.10.165:30104/")
    );
    console.log(`[PROBE] Reachable webhook create: status=${status} id=${data?.id}`);
    expect(status).toBe(200);
    reachableId = data?.id ?? null;
    expect(reachableId).toBeTruthy();
    expect(data?.kind).toBe("webhook");
    expect(data?.chanconf?.url).toBe("http://10.0.10.165:30104/");
  });

  it("W2: CREATE webhook with non-routable RFC5737 URL (192.0.2.1) — server should accept creation without testing reachability", async () => {
    const { status, data } = await post(
      "/api/tenants/commchan",
      webhookChan(`TEST_wh_nonroutable_${TS}`, "http://192.0.2.1/webhook")
    );
    console.log(`[PROBE] Non-routable webhook create: status=${status} data=${JSON.stringify(data)}`);
    // Expect: creation succeeds (URL is validated syntactically, not via connection)
    // If 200: correct behavior — creation is lazy
    // If 4xx/5xx: FINDING — server tests reachability at creation time
    if (status !== 200) {
      console.log(`FINDING: Server rejected non-routable URL at creation time (status=${status}) — may be doing live reachability check`);
    }
    expect([200, 400, 409, 500]).toContain(status);
  });

  it("W3: CREATE webhook with HTTPS external URL", async () => {
    const { status, data } = await post(
      "/api/tenants/commchan",
      webhookChan(`TEST_wh_https_${TS}`, "https://webhook-cdpv2.ssd.uz/")
    );
    console.log(`[PROBE] HTTPS webhook create: status=${status} data=${JSON.stringify(data)}`);
    if (status === 200) {
      console.log("[PROBE] HTTPS webhook URL accepted at creation");
    } else {
      console.log(`FINDING: HTTPS webhook URL rejected at creation (status=${status})`);
    }
    expect([200, 400, 409]).toContain(status);
  });

  it("W4: CREATE webhook with localhost URL", async () => {
    const { status, data } = await post(
      "/api/tenants/commchan",
      webhookChan(`TEST_wh_localhost_${TS}`, "http://localhost:9999/hook")
    );
    console.log(`[PROBE] Localhost webhook create: status=${status} data=${JSON.stringify(data)}`);
    if (status === 200) {
      console.log("[PROBE] localhost URL accepted — server-side SSRF possible");
    }
    expect([200, 400, 409]).toContain(status);
  });

  it("W5: CREATE webhook with GET method instead of POST", async () => {
    const { status, data } = await post(
      "/api/tenants/commchan",
      webhookChan(`TEST_wh_get_${TS}`, "http://10.0.10.165:30104/", { method: "GET" })
    );
    console.log(`[PROBE] GET method webhook create: status=${status} data=${JSON.stringify(data)}`);
    if (status === 200) {
      console.log("[PROBE] GET method accepted in webhook chanconf");
    } else {
      console.log(`FINDING: GET method rejected (status=${status}) — only POST allowed?`);
    }
    expect([200, 400, 409]).toContain(status);
  });

  it("W6: CREATE webhook with numeric batch_size (not string)", async () => {
    const { status, data } = await post("/api/tenants/commchan", {
      name: `TEST_wh_batchnum_${TS}`,
      kind: "webhook",
      chanconf: { url: "http://10.0.10.165:30104/", method: "POST", batch_size: 100 },
      mappings: {},
    });
    console.log(`[PROBE] Numeric batch_size webhook create: status=${status} data=${JSON.stringify(data)}`);
    if (status === 200) {
      console.log("[PROBE] Numeric batch_size accepted (type coercion)");
    } else {
      console.log(`FINDING: Numeric batch_size rejected (status=${status}) — expects string`);
    }
    expect([200, 400, 409]).toContain(status);
  });

  it("W7: CREATE webhook with very large batch_size", async () => {
    const { status, data } = await post(
      "/api/tenants/commchan",
      webhookChan(`TEST_wh_bigbatch_${TS}`, "http://10.0.10.165:30104/", { batch_size: "999999" })
    );
    console.log(`[PROBE] Large batch_size (999999) create: status=${status} data=${JSON.stringify(data)}`);
    expect([200, 400, 409]).toContain(status);
  });

  it("W8: CREATE webhook with zero batch_size", async () => {
    const { status, data } = await post(
      "/api/tenants/commchan",
      webhookChan(`TEST_wh_zerobatch_${TS}`, "http://10.0.10.165:30104/", { batch_size: "0" })
    );
    console.log(`[PROBE] Zero batch_size create: status=${status} data=${JSON.stringify(data)}`);
    if (status === 200) {
      console.log("FINDING: batch_size=0 accepted — delivery may never send (infinite batching or no-op)");
    }
    expect([200, 400, 409]).toContain(status);
  });

  // cleanup reachable channel
  it("W_cleanup: cleanup reachable baseline webhook", async () => {
    if (!reachableId) return;
    const { status } = await del(`/api/tenants/commchan/${reachableId}`);
    console.log(`[PROBE] Cleanup reachable webhook delete status: ${status} (400 expected per BUG-009)`);
    // BUG-009: DELETE not implemented, returns 400 — this is expected
  });
});

// ─── Suite 2: Malformed URL Behavior ────────────────────────────────────────

describe("Webhook creation — malformed and invalid URLs", () => {
  it("M1: CREATE webhook with plaintext non-URL string", async () => {
    const { status, data } = await post(
      "/api/tenants/commchan",
      webhookChan(`TEST_wh_badurl_plain_${TS}`, "not-a-url")
    );
    console.log(`[PROBE] Plain string URL create: status=${status} data=${JSON.stringify(data)}`);
    if (status === 200) {
      console.log("FINDING: Non-URL string accepted as webhook URL — no URL format validation");
    } else {
      console.log(`[PROBE] Non-URL string rejected (status=${status}) — server validates URL format`);
    }
    expect([200, 400, 409, 422]).toContain(status);
  });

  it("M2: CREATE webhook with empty URL string", async () => {
    const { status, data } = await post(
      "/api/tenants/commchan",
      webhookChan(`TEST_wh_emptyurl_${TS}`, "")
    );
    console.log(`[PROBE] Empty URL webhook create: status=${status} data=${JSON.stringify(data)}`);
    if (status === 200) {
      console.log("FINDING: Empty URL accepted — webhook would have no delivery target");
    }
    expect([200, 400, 409, 422]).toContain(status);
  });

  it("M3: CREATE webhook with ftp:// URL", async () => {
    const { status, data } = await post(
      "/api/tenants/commchan",
      webhookChan(`TEST_wh_ftp_${TS}`, "ftp://files.example.com/hook")
    );
    console.log(`[PROBE] FTP URL webhook create: status=${status} data=${JSON.stringify(data)}`);
    if (status === 200) {
      console.log("FINDING: ftp:// accepted as webhook URL — unsupported protocol stored without validation");
    }
    expect([200, 400, 409, 422]).toContain(status);
  });

  it("M4: CREATE webhook with URL containing auth credentials (http://user:pass@host/)", async () => {
    const { status, data } = await post(
      "/api/tenants/commchan",
      webhookChan(`TEST_wh_credurl_${TS}`, "http://user:secret@10.0.10.165:30104/hook")
    );
    console.log(`[PROBE] Credential-embedded URL create: status=${status} data=${JSON.stringify(data)}`);
    if (status === 200) {
      // Check if credentials are visible in the stored chanconf
      const stored = data?.chanconf?.url ?? "";
      const credVisible = stored.includes("secret");
      console.log(`[PROBE] Credentials visible in stored chanconf.url: ${credVisible}`);
      if (credVisible) {
        console.log("FINDING: Credentials in URL are stored in plaintext and returned via API");
      }
    }
    expect([200, 400, 409, 422]).toContain(status);
  });

  it("M5: CREATE webhook with URL containing SQL injection attempt in path", async () => {
    const { status, data } = await post(
      "/api/tenants/commchan",
      webhookChan(`TEST_wh_sqlinject_${TS}`, "http://10.0.10.165:30104/hook?id=1' OR '1'='1")
    );
    console.log(`[PROBE] SQL-injection URL create: status=${status} data=${JSON.stringify(data)}`);
    expect([200, 400, 409, 422]).toContain(status);
  });

  it("M6: CREATE webhook with missing URL field entirely", async () => {
    const { status, data } = await post("/api/tenants/commchan", {
      name: `TEST_wh_nourl_${TS}`,
      kind: "webhook",
      chanconf: { method: "POST", batch_size: "250" },
      mappings: {},
    });
    console.log(`[PROBE] Webhook without URL field: status=${status} data=${JSON.stringify(data)}`);
    if (status === 200) {
      console.log("FINDING: Webhook created without URL — delivery target undefined");
    }
    // expect 409 (not valid) based on pattern from template-commchan-probe W_edge
    expect([200, 400, 409, 422]).toContain(status);
  });
});

// ─── Suite 3: Verify Endpoint Mechanics ─────────────────────────────────────

describe("Webhook verify endpoint — POST /api/tenants/commchan/{id}/verify", () => {
  let reachableId: string | null = null;
  let nonroutableId: string | null = null;
  let httpsId: string | null = null;

  // Setup: create channels to verify
  it("V_setup_reachable: create reachable webhook for verify tests", async () => {
    const { status, data } = await post(
      "/api/tenants/commchan",
      webhookChan(`TEST_wh_verify_reach_${TS}`, "http://10.0.10.165:30104/")
    );
    console.log(`[PROBE] Setup reachable webhook: status=${status}`);
    if (status === 200) reachableId = data?.id ?? null;
    expect([200]).toContain(status);
  });

  it("V_setup_nonroutable: create non-routable webhook for verify tests", async () => {
    const { status, data } = await post(
      "/api/tenants/commchan",
      webhookChan(`TEST_wh_verify_nonreach_${TS}`, "http://192.0.2.1/webhook")
    );
    console.log(`[PROBE] Setup non-routable webhook: status=${status}`);
    if (status === 200) nonroutableId = data?.id ?? null;
    // May fail at creation if server tests reachability — skip verify test in that case
  });

  it("V_setup_https: create HTTPS webhook for verify tests", async () => {
    const { status, data } = await post(
      "/api/tenants/commchan",
      webhookChan(`TEST_wh_verify_https_${TS}`, "https://webhook-cdpv2.ssd.uz/")
    );
    console.log(`[PROBE] Setup HTTPS webhook: status=${status}`);
    if (status === 200) httpsId = data?.id ?? null;
  });

  // Core verify behavior
  it("V1: verify reachable webhook returns verified=true", async () => {
    if (!reachableId) {
      console.log("[SKIP] No reachable webhook ID — setup failed");
      return;
    }
    const { status, data } = await post(`/api/tenants/commchan/${reachableId}/verify`);
    console.log(`[PROBE] Verify reachable webhook: status=${status} body=${JSON.stringify(data)}`);
    expect(status).toBe(200);
    expect(data?.verified).toBe(true);
  });

  it("V2: verify non-routable webhook — what does the server return?", async () => {
    if (!nonroutableId) {
      console.log("[SKIP] Non-routable webhook was not created — likely rejected at creation");
      return;
    }
    // This call may be slow (TCP timeout to 192.0.2.1) — vitest default timeout applies
    const { status, data } = await post(`/api/tenants/commchan/${nonroutableId}/verify`);
    console.log(`[PROBE] Verify non-routable webhook: status=${status} body=${JSON.stringify(data)}`);
    if (status === 200 && data?.verified === true) {
      console.log("FINDING: verify returned verified=true for a non-routable IP — verify does NOT test actual connectivity");
    } else if (status === 200 && data?.verified === false) {
      console.log("[PROBE] verify returned verified=false for non-routable — server attempted outbound connection");
    } else {
      console.log(`[PROBE] Unexpected verify response for non-routable: status=${status}`);
    }
    // Allow all outcomes — this is discovery
    expect([200, 400, 500, 504]).toContain(status);
  });

  it("V3: verify HTTPS webhook", async () => {
    if (!httpsId) {
      console.log("[SKIP] HTTPS webhook was not created — likely rejected at creation");
      return;
    }
    const { status, data } = await post(`/api/tenants/commchan/${httpsId}/verify`);
    console.log(`[PROBE] Verify HTTPS webhook: status=${status} body=${JSON.stringify(data)}`);
    if (status === 200 && data?.verified === true) {
      console.log("[PROBE] HTTPS webhook verified successfully");
    } else {
      console.log(`FINDING: HTTPS webhook verify returned status=${status} verified=${data?.verified}`);
    }
    expect([200, 400, 500]).toContain(status);
  });

  it("V4: verify non-existent commchan ID returns 409 'not found' (not 404)", async () => {
    const { status, data } = await post(
      "/api/tenants/commchan/00000000-0000-0000-0000-000000000000/verify"
    );
    console.log(`[PROBE] Verify non-existent commchan: status=${status} body=${JSON.stringify(data)}`);
    // FINDING: server returns 409 "communication channel not found" — uses 409 for not-found
    // consistently with other commchan endpoints (not 404 as REST convention would expect)
    if (status === 409) {
      console.log("FINDING: verify on non-existent ID returns 409 (not 404) — CDP uses 409 for not-found errors");
    }
    expect([400, 404, 409, 500]).toContain(status);
  });

  it("V5: verify with a body payload — is it ignored or does it affect behavior?", async () => {
    if (!reachableId) {
      console.log("[SKIP] No reachable webhook ID");
      return;
    }
    const { status, data } = await post(`/api/tenants/commchan/${reachableId}/verify`, {
      test_payload: "hello",
      force: true,
    });
    console.log(`[PROBE] Verify with body payload: status=${status} body=${JSON.stringify(data)}`);
    // Body should be ignored — verify should behave the same as without body
    expect(status).toBe(200);
    expect(data?.verified).toBe(true);
  });

  it("V6: verify same channel twice in succession — idempotent?", async () => {
    if (!reachableId) {
      console.log("[SKIP] No reachable webhook ID");
      return;
    }
    const first = await post(`/api/tenants/commchan/${reachableId}/verify`);
    const second = await post(`/api/tenants/commchan/${reachableId}/verify`);
    console.log(`[PROBE] Double verify: first=${first.status}/${first.data?.verified} second=${second.status}/${second.data?.verified}`);
    expect(first.status).toBe(200);
    expect(second.status).toBe(200);
    expect(first.data?.verified).toBe(second.data?.verified);
  });

  it("V7: verify without auth returns 401", async () => {
    const baseUrl = globalThis.__cdp_base_url;
    const targetId = reachableId ?? "00000000-0000-0000-0000-000000000000";
    const res = await fetch(`${baseUrl}/api/tenants/commchan/${targetId}/verify`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
    });
    console.log(`[PROBE] Verify without auth: status=${res.status}`);
    expect(res.status).toBe(401);
  });
});

// ─── Suite 4: Validate Endpoint ──────────────────────────────────────────────

describe("Validate endpoint — POST /api/tenants/commchan/validate", () => {
  it("VL1: validate correct webhook payload", async () => {
    const { status, data } = await post("/api/tenants/commchan/validate", {
      name: `TEST_validate_ok_${TS}`,
      kind: "webhook",
      chanconf: { url: "http://10.0.10.165:30104/", method: "POST", batch_size: "250" },
      mappings: {},
    });
    console.log(`[PROBE] Validate correct webhook: status=${status} body=${JSON.stringify(data)}`);
    if (status === 404) {
      console.log("FINDING: /api/tenants/commchan/validate returns 404 — endpoint may not be implemented or route conflicts with /{id}");
    }
    expect([200, 204, 400, 404, 409]).toContain(status);
  });

  it("VL2: validate webhook with missing URL", async () => {
    const { status, data } = await post("/api/tenants/commchan/validate", {
      name: `TEST_validate_nourl_${TS}`,
      kind: "webhook",
      chanconf: { method: "POST", batch_size: "250" },
      mappings: {},
    });
    console.log(`[PROBE] Validate webhook without URL: status=${status} body=${JSON.stringify(data)}`);
    expect([200, 204, 400, 404, 409]).toContain(status);
  });

  it("VL3: validate webhook with malformed URL", async () => {
    const { status, data } = await post("/api/tenants/commchan/validate", {
      name: `TEST_validate_badurl_${TS}`,
      kind: "webhook",
      chanconf: { url: "not-a-url", method: "POST", batch_size: "250" },
      mappings: {},
    });
    console.log(`[PROBE] Validate webhook malformed URL: status=${status} body=${JSON.stringify(data)}`);
    // validate returns 200 with valid=false and configError — correct behavior
    // If valid=true, it's a FINDING (no format checking)
    if (status === 200 && data?.valid === true) {
      console.log("FINDING: /validate accepted malformed URL as valid — no URL format check");
    } else if (status === 200 && data?.valid === false) {
      console.log("[PROBE] /validate correctly rejects malformed URL with configError detail");
    }
    expect([200, 204, 400, 404, 409, 422]).toContain(status);
  });

  it("VL4: validate endpoint vs. /{id} routing — does 'validate' get treated as an ID?", async () => {
    // Route conflict: GET /api/tenants/commchan/validate may match /{id} with id="validate"
    const { status, data } = await get("/api/tenants/commchan/validate");
    console.log(`[PROBE] GET /commchan/validate (route conflict check): status=${status} body=${JSON.stringify(data)}`);
    if (status === 200 && data?.kind) {
      console.log("FINDING: GET /commchan/validate treated 'validate' as a channel ID lookup — route conflict");
    } else if (status === 404 || status === 400) {
      console.log("[PROBE] GET /commchan/validate correctly returns error — no route conflict");
    }
    expect([200, 400, 404, 405]).toContain(status);
  });
});

// ─── Suite 5: HTTP vs HTTPS Behavioral Difference ────────────────────────────

describe("HTTP vs HTTPS webhook URL semantics", () => {
  let httpId: string | null = null;
  let httpsId: string | null = null;

  it("HS1: create HTTP webhook and inspect stored chanconf", async () => {
    const { status, data } = await post(
      "/api/tenants/commchan",
      webhookChan(`TEST_wh_http_scheme_${TS}`, "http://10.0.10.165:30104/")
    );
    console.log(`[PROBE] HTTP scheme webhook: status=${status} chanconf=${JSON.stringify(data?.chanconf)}`);
    if (status === 200) {
      httpId = data?.id ?? null;
      const storedUrl: string = data?.chanconf?.url ?? "";
      console.log(`[PROBE] HTTP URL stored as: ${storedUrl}`);
      expect(storedUrl.startsWith("http://")).toBe(true);
    }
    expect([200, 400]).toContain(status);
  });

  it("HS2: create HTTPS webhook and inspect stored chanconf", async () => {
    const { status, data } = await post(
      "/api/tenants/commchan",
      webhookChan(`TEST_wh_https_scheme_${TS}`, "https://webhook-cdpv2.ssd.uz/")
    );
    console.log(`[PROBE] HTTPS scheme webhook: status=${status} chanconf=${JSON.stringify(data?.chanconf)}`);
    if (status === 200) {
      httpsId = data?.id ?? null;
      const storedUrl: string = data?.chanconf?.url ?? "";
      console.log(`[PROBE] HTTPS URL stored as: ${storedUrl}`);
    }
    expect([200, 400, 409]).toContain(status);
  });

  it("HS3: verify HTTP webhook — compare behavior to HTTPS", async () => {
    if (!httpId) {
      console.log("[SKIP] HTTP webhook not created");
      return;
    }
    const { status, data } = await post(`/api/tenants/commchan/${httpId}/verify`);
    console.log(`[PROBE] HTTP webhook verify: status=${status} verified=${data?.verified}`);
    expect(status).toBe(200);
  });

  it("HS4: verify HTTPS webhook — compare behavior to HTTP", async () => {
    if (!httpsId) {
      console.log("[SKIP] HTTPS webhook not created");
      return;
    }
    const { status, data } = await post(`/api/tenants/commchan/${httpsId}/verify`);
    console.log(`[PROBE] HTTPS webhook verify: status=${status} verified=${data?.verified}`);
    expect(status).toBe(200);
  });

  it("HS5: list all commchans — check if chanconf.url is included in list response", async () => {
    const { status, data } = await get("/api/tenants/commchan");
    expect(status).toBe(200);
    const channels: any[] = Array.isArray(data) ? data : [];
    const webhooks = channels.filter((c) => c.kind === "webhook");
    // Check if list response includes chanconf (it may be omitted in list, only in GET-by-ID)
    const firstWebhook = webhooks[0];
    const hasChanconf = firstWebhook && "chanconf" in firstWebhook;
    console.log(`[PROBE] Total webhook commchans in list: ${webhooks.length}, list includes chanconf: ${hasChanconf}`);
    if (!hasChanconf) {
      console.log("FINDING: commchan list endpoint omits chanconf — URL scheme audit requires individual GET-by-ID calls");
    } else {
      const httpCount = webhooks.filter((c) => (c.chanconf?.url ?? "").startsWith("http://")).length;
      const httpsCount = webhooks.filter((c) => (c.chanconf?.url ?? "").startsWith("https://")).length;
      console.log(`[PROBE] HTTP webhooks: ${httpCount}, HTTPS webhooks: ${httpsCount}`);
    }
  });
});
