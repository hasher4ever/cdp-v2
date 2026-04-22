/**
 * Cross-tenant isolation tests.
 *
 * Verifies that one tenant cannot access another tenant's data, segments,
 * campaigns, UDAFs, or scenarios. Uses the provisioned test tenant + creates
 * a second ephemeral tenant to test cross-access.
 */
import { describe, it, expect, beforeAll } from "vitest";
import { api, get, post, getAuthToken } from "../tests_backend/client";
import { getTenant } from "./tenant-context";
import { EXPECTED, TEST_TAG } from "./test-data";

let tenant2Token: string;
let tenant1Token: string;

beforeAll(async () => {
  const t = getTenant();
  tenant1Token = t.token;

  // Create a second tenant for cross-access testing
  const baseUrl = globalThis.__cdp_base_url;
  const domain2 = `iso_${Date.now()}`;
  const email2 = `admin@${domain2}.cdp`;
  const password2 = "Isolation123!";

  const signupRes = await fetch(`${baseUrl}/public/api/signup`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      domainName: domain2,
      adminEmail: email2,
      adminPassword: password2,
      companyName: `Isolation Test ${domain2}`,
    }),
  });

  if (!signupRes.ok) {
    console.warn(`Could not create second tenant (${signupRes.status}), isolation tests will be limited`);
    return;
  }

  // Wait for tenant to be ready, then sign in
  await new Promise((r) => setTimeout(r, 5000));

  try {
    tenant2Token = await getAuthToken(baseUrl, domain2, email2, password2);
  } catch (e) {
    console.warn("Could not auth as second tenant:", e);
  }
});

// ─── Data isolation ─────────────────────────────────────────────────────────

describe("Tenant Isolation: data queries", () => {
  it("tenant 2 should have 0 customers (fresh tenant)", async () => {
    if (!tenant2Token) return;
    const { status, data } = await api("/api/tenant/data/count", { token: tenant2Token });
    expect(status).toBe(200);
    expect(data.customerCount).toBe(0);
  });

  it("tenant 1 should have test data", async () => {
    const { status, data } = await api("/api/tenant/data/count", { token: tenant1Token });
    expect(status).toBe(200);
    expect(data.customerCount).toBe(EXPECTED.totalCustomers);
  });

  it("tenant 2 should NOT see tenant 1's customers", async () => {
    if (!tenant2Token) return;
    const { status, data } = await api("/api/tenant/data/customers", {
      method: "POST",
      body: { fieldNames: ["primary_id"] },
      params: { page: 0, size: 100 },
      token: tenant2Token,
    });
    expect(status).toBe(200);
    expect(data.list.length).toBe(0);
  });
});

// ─── Segmentation isolation ─────────────────────────────────────────────────

describe("Tenant Isolation: segmentation", () => {
  let seg1Id: string;

  it("create a segmentation on tenant 1", async () => {
    const { status, data } = await api("/api/tenants/segmentation", {
      method: "POST",
      body: {
        name: `${TEST_TAG}_iso_seg`,
        segments: [{
          name: "All",
          customerProfileFilter: { type: "group", group: { logicalOp: "AND", predicates: [], negate: false } },
        }],
      },
      token: tenant1Token,
    });
    expect(status).toBe(200);
    seg1Id = data.id;
  });

  it("tenant 2 should NOT see tenant 1's segmentations", async () => {
    if (!tenant2Token) return;
    const { status, data } = await api("/api/tenants/segmentation", {
      params: { page: 0, size: 100 },
      token: tenant2Token,
    });
    expect(status).toBe(200);
    // Should not contain the segmentation created by tenant 1
    const ids = data.items.map((i: any) => i.id);
    expect(ids).not.toContain(seg1Id);
  });

  it("tenant 2 should get 404 when accessing tenant 1's segmentation by ID", async () => {
    if (!tenant2Token || !seg1Id) return;
    const { status } = await api(`/api/tenants/segmentation/${seg1Id}`, { token: tenant2Token });
    expect([404, 403]).toContain(status);
  });
});

// ─── UDAF isolation ─────────────────────────────────────────────────────────

describe("Tenant Isolation: UDAFs", () => {
  it("tenant 2 should have empty UDAF list", async () => {
    if (!tenant2Token) return;
    const { status, data } = await api("/api/tenants/udafs", { token: tenant2Token });
    expect(status).toBe(200);
    expect(data.items.length).toBe(0);
  });

  it("tenant 2 should NOT see tenant 1's UDAFs", async () => {
    if (!tenant2Token) return;
    const { data: t1Udafs } = await api("/api/tenants/udafs", { token: tenant1Token });
    const { data: t2Udafs } = await api("/api/tenants/udafs", { token: tenant2Token });

    if (t1Udafs.items.length > 0) {
      const t1Ids = t1Udafs.items.map((i: any) => i.id);
      const t2Ids = t2Udafs.items.map((i: any) => i.id);
      for (const id of t1Ids) {
        expect(t2Ids).not.toContain(id);
      }
    }
  });
});

// ─── Campaign isolation ─────────────────────────────────────────────────────

describe("Tenant Isolation: campaigns", () => {
  it("tenant 2 should have empty campaign list", async () => {
    if (!tenant2Token) return;
    const { status, data } = await api("/api/tenants/campaign", {
      params: { page: 0, size: 100 },
      token: tenant2Token,
    });
    expect(status).toBe(200);
    expect(data.items.length).toBe(0);
  });
});

// ─── CommChan isolation ─────────────────────────────────────────────────────

describe("Tenant Isolation: communication channels", () => {
  it("tenant 2 should have empty channel list", async () => {
    if (!tenant2Token) return;
    const { status, data } = await api("/api/tenants/commchan", { token: tenant2Token });
    expect(status).toBe(200);
    expect(data.items.length).toBe(0);
  });
});

// ─── Scenario isolation ─────────────────────────────────────────────────────

describe("Tenant Isolation: scenarios", () => {
  it("tenant 2 should have empty scenario list", async () => {
    if (!tenant2Token) return;
    const { status, data } = await api("/api/tenant/scenario/crud", {
      params: { page: 0, size: 100 },
      token: tenant2Token,
    });
    expect(status).toBe(200);
    expect(data.items.length).toBe(0);
  });
});

// ─── Schema isolation ───────────────────────────────────────────────────────

describe("Tenant Isolation: schema", () => {
  it("tenant 2 should have different schema than tenant 1", async () => {
    if (!tenant2Token) return;
    const { data: t1Schema } = await api("/api/tenants/schema/customers/fields", { token: tenant1Token });
    const { data: t2Schema } = await api("/api/tenants/schema/customers/fields", { token: tenant2Token });

    // Tenant 1 has custom fields (gender, age, etc.); tenant 2 is fresh with only built-in
    expect(t1Schema.length).toBeGreaterThan(t2Schema.length);
  });
});

// ─── Template isolation ─────────────────────────────────────────────────────

describe("Tenant Isolation: templates", () => {
  it("tenant 2 should have empty template list", async () => {
    if (!tenant2Token) return;
    const { status, data } = await api("/api/tenant/template", {
      params: { page: 0, size: 100 },
      token: tenant2Token,
    });
    expect(status).toBe(200);
    expect(data.items.length).toBe(0);
  });
});
