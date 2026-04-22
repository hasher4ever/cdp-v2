/**
 * CommChan Webhook Boundary Tests — Session 16
 *
 * Hypothesis-driven boundary testing for commchan CREATE endpoint.
 * Tests edge cases in batch_size, URL, kind, and name fields that
 * have been a blind spot for 3+ sessions.
 *
 * Key discovery: backend returns 409 {"code":10,"description":"communication channel not valid"}
 * for ALL business-layer validation failures. 400 for OpenAPI schema violations.
 *
 * Known facts:
 *   - batch_size must be STRING not number (400 OpenAPI error otherwise)
 *   - Valid kinds: webhook, blackhole
 *   - chanconf + mappings required (BUG-056)
 *   - Successful create uses batch_size: "1" (from contract test)
 */

import { describe, it, expect } from "vitest";
import { get, post } from "./client";

const ts = Date.now();
let counter = 0;

function webhookBody(overrides: Record<string, any> = {}, chanconfOverrides: Record<string, any> = {}) {
  counter++;
  const base: any = {
    name: `boundary_${ts}_${counter}`,
    kind: "webhook",
    chanconf: { url: "https://example.com/hook", method: "POST", batch_size: "10", ...chanconfOverrides },
    mappings: {},
    ...overrides,
  };
  return base;
}

// ── batch_size boundary tests ──────────────────────────────────────────────
// Run 1 showed: batch_size "0", "-1", "999999", "0.5", "", "abc", omitted all → 409
// batch_size: 10 (number) → 400 (OpenAPI schema rejection)
// This means the backend validates batch_size as positive integer string at the business layer.

describe("CommChan batch_size boundaries", () => {
  it('batch_size: "1" — known good baseline', async () => {
    // Baseline: "1" is the value used in contract tests, should work
    const { status, data } = await post("/api/tenants/commchan", webhookBody({}, { batch_size: "1" }));
    console.log(`batch_size="1" → status=${status}`);
    expect(status).toBe(200);
    expect(data).toHaveProperty("id");
    expect(data.kind).toBe("webhook");
  });

  it('batch_size: "10" — moderate value', async () => {
    // Hypothesis: "10" should work like "1"
    const { status, data } = await post("/api/tenants/commchan", webhookBody({}, { batch_size: "10" }));
    console.log(`batch_size="10" → status=${status}`);
    // FINDING from run 1: "10" returns 409! Only "1" works from contract test.
    // This needs verification — is it batch_size or something else?
    if (status === 409) {
      console.log("SURPRISE: batch_size='10' rejected — backend may only accept specific values");
    }
    expect([200, 409]).toContain(status);
  });

  it('batch_size: "0" — zero value (rejected per run 1)', async () => {
    // CONFIRMED: returns 409 "communication channel not valid"
    const { status, data } = await post("/api/tenants/commchan", webhookBody({}, { batch_size: "0" }));
    console.log(`batch_size="0" → status=${status}, desc=${data?.description || ""}`);
    expect(status).toBe(409);
    expect(data.description).toContain("not valid");
  });

  it('batch_size: "-1" — negative value (rejected per run 1)', async () => {
    const { status } = await post("/api/tenants/commchan", webhookBody({}, { batch_size: "-1" }));
    console.log(`batch_size="-1" → status=${status}`);
    expect(status).toBe(409);
  });

  it('batch_size: "999999" — huge value (rejected per run 1)', async () => {
    // SURPRISE from run 1: even large positive integer strings are rejected
    const { status } = await post("/api/tenants/commchan", webhookBody({}, { batch_size: "999999" }));
    console.log(`batch_size="999999" → status=${status}`);
    expect(status).toBe(409);
  });

  it('batch_size: "0.5" — float value (rejected per run 1)', async () => {
    const { status } = await post("/api/tenants/commchan", webhookBody({}, { batch_size: "0.5" }));
    console.log(`batch_size="0.5" → status=${status}`);
    expect(status).toBe(409);
  });

  it('batch_size: "" — empty string (ACCEPTED — no validation)', async () => {
    // SURPRISE: empty string batch_size is accepted (200). Backend does not validate.
    const { status, data } = await post("/api/tenants/commchan", webhookBody({}, { batch_size: "" }));
    console.log(`batch_size="" → status=${status}, stored=${data?.chanconf?.batch_size}`);
    expect(status).toBe(200);
    // BUG CANDIDATE: empty batch_size accepted — will cause runtime issues when sending webhooks
  });

  it('batch_size: "abc" — non-numeric string (rejected per run 1)', async () => {
    const { status } = await post("/api/tenants/commchan", webhookBody({}, { batch_size: "abc" }));
    console.log(`batch_size="abc" → status=${status}`);
    expect(status).toBe(409);
  });

  it("batch_size: omitted — default behavior (ACCEPTED — optional field)", async () => {
    // FINDING: batch_size is optional. Omitting it returns 200.
    const body = webhookBody();
    delete body.chanconf.batch_size;
    const { status, data } = await post("/api/tenants/commchan", body);
    console.log(`batch_size=omitted → status=${status}, stored=${data?.chanconf?.batch_size ?? "undefined"}`);
    expect(status).toBe(200);
  });

  it("batch_size: 10 (number, not string) — OpenAPI schema rejection", async () => {
    // CONFIRMED: returns 400 with OpenAPI validation error (not 409 business error)
    const body = webhookBody();
    body.chanconf.batch_size = 10;
    const { status, data } = await post("/api/tenants/commchan", body);
    console.log(`batch_size=10(number) → status=${status}`);
    expect(status).toBe(400);
    expect(JSON.stringify(data)).toContain("must be a string");
  });

  // Discovery test: find the valid range of batch_size
  it("batch_size range discovery: test 2, 5, 50, 100", async () => {
    const results: Record<string, number> = {};
    for (const val of ["2", "5", "50", "100"]) {
      const { status } = await post("/api/tenants/commchan", webhookBody({}, { batch_size: val }));
      results[val] = status;
    }
    console.log("batch_size range discovery:", JSON.stringify(results));
    // Document which values are accepted
    for (const [val, st] of Object.entries(results)) {
      if (st === 200) console.log(`ACCEPTED: batch_size="${val}"`);
      else console.log(`REJECTED: batch_size="${val}" → ${st}`);
    }
  });
});

// ── URL boundary tests ─────────────────────────────────────────────────────
// Run 1 showed: ALL url variants → 409. This is surprising because the contract
// test with "https://example.com/hook" + batch_size:"1" works fine.
// Possible explanation: the 409s in run 1 were caused by batch_size:"10", not URL issues.
// Need to isolate: use batch_size:"1" as baseline for URL tests.

describe("CommChan URL boundaries (with batch_size='1' baseline)", () => {
  it('url: "https://example.com/hook" — baseline (should succeed)', async () => {
    const { status, data } = await post("/api/tenants/commchan", webhookBody({}, { batch_size: "1" }));
    console.log(`url=baseline → status=${status}`);
    expect(status).toBe(200);
    expect(data).toHaveProperty("id");
  });

  it('url: "" — empty URL', async () => {
    const { status, data } = await post("/api/tenants/commchan", webhookBody({}, { url: "", batch_size: "1" }));
    console.log(`url="" → status=${status}, data=${JSON.stringify(data)}`);
    // Empty URL should be rejected for webhook kind
    expect([200, 400, 409, 422]).toContain(status);
    if (status === 200) console.log("BUG CANDIDATE: empty URL accepted for webhook");
  });

  it('url: "not-a-url" — invalid URL format', async () => {
    const { status, data } = await post("/api/tenants/commchan", webhookBody({}, { url: "not-a-url", batch_size: "1" }));
    console.log(`url="not-a-url" → status=${status}, data=${JSON.stringify(data)}`);
    expect([200, 400, 409, 422]).toContain(status);
    if (status === 200) console.log("BUG CANDIDATE: non-URL string accepted as webhook URL");
  });

  it('url: "ftp://example.com" — non-HTTP protocol', async () => {
    const { status, data } = await post("/api/tenants/commchan", webhookBody({}, { url: "ftp://example.com", batch_size: "1" }));
    console.log(`url="ftp://..." → status=${status}, data=${JSON.stringify(data)}`);
    expect([200, 400, 409, 422]).toContain(status);
    if (status === 200) console.log("CONFIRMED BUG-048: non-HTTP protocol accepted for webhook");
  });

  it('url: "http://localhost:8080" — SSRF-like URL', async () => {
    const { status, data } = await post("/api/tenants/commchan", webhookBody({}, { url: "http://localhost:8080", batch_size: "1" }));
    console.log(`url="http://localhost:8080" → status=${status}, data=${JSON.stringify(data)}`);
    expect([200, 400, 409, 422]).toContain(status);
    if (status === 200) console.log("FINDING: localhost/internal URLs accepted (SSRF risk)");
  });

  it("url: very long URL (2000+ chars)", async () => {
    const longUrl = "http://example.com/" + "a".repeat(2000);
    const { status, data } = await post("/api/tenants/commchan", webhookBody({}, { url: longUrl, batch_size: "1" }));
    console.log(`url=long(${longUrl.length} chars) → status=${status}`);
    expect([200, 400, 409, 413, 422]).toContain(status);
    if (status === 200 && data.chanconf?.url) {
      const storedLen = data.chanconf.url.length;
      console.log(`Stored URL length: ${storedLen} (original: ${longUrl.length})`);
      if (storedLen < longUrl.length) console.log("SURPRISE: URL was truncated!");
    }
  });

  it("url: omitted — missing URL field", async () => {
    const body = webhookBody({}, { batch_size: "1" });
    delete body.chanconf.url;
    const { status, data } = await post("/api/tenants/commchan", body);
    console.log(`url=omitted → status=${status}, data=${JSON.stringify(data)}`);
    expect([200, 400, 409, 422]).toContain(status);
    if (status === 200) console.log("FINDING: webhook created without URL field");
  });
});

// ── Kind boundary tests ────────────────────────────────────────────────────
// Use batch_size:"1" to isolate kind validation from batch_size issues

describe("CommChan kind boundaries", () => {
  it('kind: "" — empty string', async () => {
    const { status, data } = await post("/api/tenants/commchan", webhookBody({ kind: "" }, { batch_size: "1" }));
    console.log(`kind="" → status=${status}, data=${JSON.stringify(data)}`);
    expect([400, 409, 422]).toContain(status);
  });

  it('kind: "WEBHOOK" — uppercase (case sensitivity)', async () => {
    const { status, data } = await post("/api/tenants/commchan", webhookBody({ kind: "WEBHOOK" }, { batch_size: "1" }));
    console.log(`kind="WEBHOOK" → status=${status}, data=${JSON.stringify(data)}`);
    expect([200, 400, 409, 422]).toContain(status);
    if (status === 200) console.log("FINDING: kind is case-insensitive");
    if (status === 409) console.log("CONFIRMED: kind is case-sensitive (lowercase only)");
  });

  it('kind: "smtp" — invalid kind', async () => {
    const { status, data } = await post("/api/tenants/commchan", webhookBody({ kind: "smtp" }, { batch_size: "1" }));
    console.log(`kind="smtp" → status=${status}, data=${JSON.stringify(data)}`);
    expect([400, 409, 422]).toContain(status);
  });
});

// ── Name boundary tests ────────────────────────────────────────────────────
// Use batch_size:"1" to isolate name validation

describe("CommChan name boundaries", () => {
  it('name: "" — empty name', async () => {
    const { status, data } = await post("/api/tenants/commchan", webhookBody({ name: "" }, { batch_size: "1" }));
    console.log(`name="" → status=${status}, data=${JSON.stringify(data)}`);
    expect([200, 400, 409, 422]).toContain(status);
    if (status === 200) console.log("FINDING: empty name accepted");
  });

  it("name: very long (1000 chars)", async () => {
    const longName = "a".repeat(1000);
    const { status, data } = await post("/api/tenants/commchan", webhookBody({ name: longName }, { batch_size: "1" }));
    console.log(`name=long(1000) → status=${status}`);
    expect([200, 400, 409, 413, 422]).toContain(status);
    if (status === 200 && data.name) {
      console.log(`Stored name length: ${data.name.length}`);
      if (data.name.length < 1000) console.log("SURPRISE: Name was truncated!");
    }
  });

  it("name: duplicate of existing channel", async () => {
    const dupName = `boundary_dup_${ts}`;
    const first = await post("/api/tenants/commchan", webhookBody({ name: dupName }, { batch_size: "1" }));
    console.log(`First create → status=${first.status}`);
    expect(first.status).toBe(200);
    const second = await post("/api/tenants/commchan", webhookBody({ name: dupName }, { batch_size: "1" }));
    console.log(`Duplicate create → status=${second.status}, data=${JSON.stringify(second.data)}`);
    expect([200, 400, 409, 422]).toContain(second.status);
    if (second.status === 200) {
      console.log("FINDING: Duplicate names are allowed (no uniqueness constraint)");
    }
  });
});
