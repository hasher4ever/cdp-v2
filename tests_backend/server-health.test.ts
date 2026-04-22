/**
 * Server Health Check — Session 24
 *
 * Lightweight probe to detect server deadlock state (BUG-076).
 * Run FIRST before any other test suite to avoid wasting time on a dead server.
 *
 * Tests three layers:
 *   1. Nginx (SPA serves) — always passes unless infra is down
 *   2. Go backend process (token validation responds) — passes if process alive
 *   3. Database connectivity (auth actually works) — fails if DB locked/deadlocked
 *
 * Usage: npx vitest run tests_backend/server-health.test.ts
 */

import { describe, it, expect } from "vitest";

const BASE_URL = process.env.CDP_BASE_URL || "https://cdpv2.ssd.uz";
const TIMEOUT_MS = 8000;

async function fetchWithTimeout(url: string, opts?: RequestInit): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    return await fetch(url, { ...opts, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

describe("Server Health Check", () => {
  it("Layer 1: Nginx serves SPA (static files)", async () => {
    const res = await fetchWithTimeout(BASE_URL);
    expect(res.status).toBe(200);
    const text = await res.text();
    expect(text).toContain("CDP");
  });

  it("Layer 2: Go backend process alive (token validation)", async () => {
    // GET on a protected endpoint without token → should get 401 quickly
    const res = await fetchWithTimeout(`${BASE_URL}/api/tenants/udafs`);
    expect(res.status).toBe(401);
  });

  it("Layer 3: OpenAPI validation alive (schema check)", async () => {
    // POST with empty body → should get 400 with schema error
    const res = await fetchWithTimeout(`${BASE_URL}/public/api/signin`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });
    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.error).toContain("username");
  });

  it("Layer 4: Database connectivity (auth flow)", async () => {
    // This is the critical test — if this times out, the DB is locked (BUG-076)
    const domain = process.env.CDP_DOMAIN || "1762934640.cdp.com";
    const email = process.env.CDP_EMAIL || "shop2025.11.12-13:04:00@cdp.ru";
    const password = process.env.CDP_PASSWORD || "qwerty123";

    const res = await fetchWithTimeout(`${BASE_URL}/public/api/signin`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username: email, password, domainName: domain }),
    });

    // If we get here without timeout, the DB is alive
    // Accept 200 (auth success) or 401/403 (wrong creds but DB responded)
    expect(res.status).toBeLessThan(500);
    if (res.status === 200) {
      const data = await res.json();
      expect(data).toHaveProperty("jwtToken");
    }
  });

  it("Layer 5: Authenticated endpoint (full stack)", async () => {
    const domain = process.env.CDP_DOMAIN || "1762934640.cdp.com";
    const email = process.env.CDP_EMAIL || "shop2025.11.12-13:04:00@cdp.ru";
    const password = process.env.CDP_PASSWORD || "qwerty123";

    // First authenticate
    const authRes = await fetchWithTimeout(`${BASE_URL}/public/api/signin`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username: email, password, domainName: domain }),
    });

    if (authRes.status !== 200) {
      // Can't test authenticated layer if auth is down
      console.warn("AUTH DOWN — skipping authenticated endpoint check");
      return;
    }

    const { jwtToken } = await authRes.json();

    // Try a lightweight GET that hits the DB
    const listRes = await fetchWithTimeout(`${BASE_URL}/api/tenants/udafs`, {
      headers: { Authorization: `Bearer ${jwtToken}` },
    });

    expect(listRes.status).toBe(200);
  });
});
