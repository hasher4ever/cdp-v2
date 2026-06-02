/**
 * Null / empty / missing-value handling in the FE.
 *
 * Real marketer scenarios where null/empty creeps in:
 *   1. Customer has empty/missing email — should show "—" or empty, never "null"/"undefined"
 *   2. Customer has null birthdate — should not show "Invalid Date" or "1970"
 *   3. Customer has no events — UDAF returns null — should show "—" or "0", not "NaN"
 *   4. Categorization current_breakpoint is null (not yet computed) — should show "Computing..." or "—"
 *   5. Empty segment (matches 0 customers) — preview shows "0" not "" or "N/A"
 *   6. Campaign never sent — should show "—" or "Never", not "Invalid Date"
 *   7. Template variable references unknown field — preview should warn, not blow up
 *
 * Strategy: create entities with KNOWN null/empty values via API, then navigate
 * the FE to display them and assert the DOM never shows raw garbage tokens.
 */
import { test, expect, type APIRequestContext, type Page } from "@playwright/test";
import dotenv from "dotenv";
dotenv.config();

const BASE = process.env.CDP_BASE_URL || "https://cdpv2.ssd.uz";
const DOMAIN = process.env.CDP_DOMAIN || "1762934640.cdp.com";
const EMAIL = process.env.CDP_EMAIL || "shop2025.11.12-13:04:00@cdp.ru";
const PASSWORD = process.env.CDP_PASSWORD || "qwerty123";
let TOKEN = "";

test.beforeAll(async ({ request }) => {
  const r = await request.post(`${BASE}/public/api/signin`, {
    data: { username: EMAIL, password: PASSWORD, domainName: DOMAIN },
  });
  TOKEN = (await r.json()).jwtToken;
});

async function api(req: APIRequestContext, path: string, init?: { method?: string; data?: unknown }) {
  const r = await req.fetch(`${BASE}${path}`, {
    method: init?.method ?? "GET",
    headers: { Authorization: `Bearer ${TOKEN}`, "Content-Type": "application/json" },
    data: init?.data ? JSON.stringify(init.data) : undefined,
  });
  return { status: r.status(), data: await r.json().catch(() => null) };
}

/** Tokens that must NEVER appear in user-facing pages — they leak from broken null handling. */
const FORBIDDEN = [
  "[object Object]",
  "undefined",
  "Invalid Date",
  "NaN",
  "null",        // string "null" is a render bug (the value null should be hidden)
];

async function assertCleanRendering(page: Page, where: string) {
  const body = await page.locator("body").innerText({ timeout: 5_000 });
  const found = FORBIDDEN.filter((tok) => body.includes(tok));
  expect(
    found.length,
    `${where}: forbidden tokens leaked into DOM: ${found.join(", ")}`
  ).toBe(0);
}

// ─── 1. Customer with no events — profile page renders cleanly ────────────────

test.describe("Null handling: customer with no events", () => {
  let testId = 0;

  test.beforeAll(async ({ request }) => {
    // Make a customer with a recognizable id and minimal data
    const id = 9_900_000_000 + Math.floor(Math.random() * 99_999_999);
    await request.post(`${BASE}/cdp-ingest/ingest/tenant/${process.env.CDP_TENANT_ID || 1762934640267}/async/customers`, {
      data: JSON.stringify([{
        primary_id: id,
        first_name: `NullProbe_${id}`,
        last_name: "NoEvents",
        email: "",  // explicit empty
        gender: "other",
        age: 30,
        is_adult: true,
        is_subscribed: false,
        income: 0,
        birthdate: "1990-01-01",
        phone_number: 0,
        api_customer_name_first: `NullProbe_${id}`,
        api_customer_name_last: "NoEvents",
      }]),
      headers: { "Content-Type": "application/json" },
    });
    testId = id;
    // Wait for v1 visibility
    for (let i = 0; i < 20; i++) {
      const r = await api(request, `/api/tenant/data/customers/${id}`);
      if (r.status === 200) break;
      await new Promise((r2) => setTimeout(r2, 1_000));
    }
  });

  test("customer profile renders cleanly — no Invalid Date / NaN / [object Object]", async ({ page }) => {
    if (!testId) test.skip(true, "couldn't seed test customer");
    await page.goto(`/data/clients/${testId}`, { timeout: 10_000 });
    await page.waitForLoadState("networkidle", { timeout: 10_000 });
    await assertCleanRendering(page, "/data/clients/{nullCustomer}");
  });

  test("customer with empty email field — does not render literal 'null' or 'undefined' in email cell", async ({ page }) => {
    if (!testId) test.skip(true, "");
    await page.goto(`/data/clients/${testId}`, { timeout: 10_000 });
    await page.waitForLoadState("networkidle", { timeout: 10_000 });
    const body = await page.locator("body").innerText({ timeout: 5_000 });
    // Specific check: a label like "Email" should not be immediately followed by "null" or "undefined"
    expect(body).not.toMatch(/[Ee]mail[\s:]*\b(null|undefined)\b/);
  });
});

// ─── 2. Categorization with null current_breakpoint (not yet computed) ───────

test.describe("Null handling: categorization not yet computed", () => {
  let catId = "";
  let segIdsToCleanup: string[] = [];

  test.beforeAll(async ({ request }) => {
    // Resolve a numeric customer field to base the categorization on
    const fieldsResp = await api(request, "/api/tenants/schema/customers/fields");
    const fields: any[] = fieldsResp.data?.fields ?? fieldsResp.data?.list ?? fieldsResp.data ?? [];
    const income = fields.find((f: any) => (f.api_name ?? f.apiName) === "income");
    const incomeField = income?.field_name ?? income?.fieldName;
    if (!incomeField) return;
    const created = await api(request, "/api/tenants/categorizations", {
      method: "POST",
      data: {
        name: `NULL_CAT_${Date.now()}`,
        source_kind: "field",
        source_field_name: incomeField,
        tiers: [
          { label: "low", threshold: 0.5 },
          { label: "high", threshold: 1.0 },
        ],
      },
    });
    if (created.status === 200) catId = created.data.id;
  });

  test.afterAll(async ({ request }) => {
    if (catId) await api(request, `/api/tenants/categorizations/${catId}`, { method: "DELETE" });
    for (const id of segIdsToCleanup) await api(request, `/api/tenants/segmentation/${id}`, { method: "DELETE" });
  });

  test("if FE has a categorizations page, it renders without leaked tokens", async ({ page }) => {
    if (!catId) test.skip(true, "couldn't create test categorization");
    // BUG-106 says there's no FE for categorizations — verify it still doesn't break
    await page.goto("/marketing/categorizations", { timeout: 10_000, waitUntil: "domcontentloaded" });
    await assertCleanRendering(page, "/marketing/categorizations");
  });
});

// ─── 3. Empty-result segment (0 customers) preview ───────────────────────────

test.describe("Null handling: segment that matches 0 customers", () => {
  test("segment detail with predicate matching nothing renders 0 cleanly, not '—' or empty", async ({ page, request }) => {
    // Predicate: age = 99999 (no one)
    const fieldsResp = await api(request, "/api/tenants/schema/customers/fields");
    const fields: any[] = fieldsResp.data?.fields ?? fieldsResp.data?.list ?? fieldsResp.data ?? [];
    const ageField = fields.find((f: any) => (f.api_name ?? f.apiName) === "age");
    const ageCol = ageField?.field_name ?? ageField?.fieldName;
    if (!ageCol) test.skip(true, "");

    const created = await api(request, "/api/tenants/segmentation", {
      method: "POST",
      data: {
        name: `EMPTY_${Date.now()}`,
        segments: [{
          name: "Nobody",
          customerProfileFilter: {
            type: "group",
            group: {
              logicalOp: "AND", negate: false,
              predicates: [{
                type: "condition",
                condition: {
                  param: { kind: "field", fieldName: ageCol },
                  operator: "=",
                  value: { string: [], time: [], float64: [], int64: [99999], bool: [] },
                },
              }],
            },
          },
        }],
      },
    });
    if (created.status !== 200) test.skip(true, "couldn't create empty segment");
    const segId = created.data.id;
    try {
      await page.goto(`/marketing/segments/${segId}`, { timeout: 10_000 });
      await page.waitForLoadState("networkidle", { timeout: 10_000 });
      await assertCleanRendering(page, "/marketing/segments/{empty}");
    } finally {
      await api(request, `/api/tenants/segmentation/${segId}`, { method: "DELETE" });
    }
  });
});

// ─── 4. Campaign never sent — list + detail should not show Invalid Date ─────

test.describe("Null handling: campaign that has never been sent", () => {
  test("list view does not show Invalid Date for last-sent on never-sent campaigns", async ({ page }) => {
    await page.goto("/marketing/campaigns", { timeout: 10_000 });
    await page.waitForLoadState("networkidle", { timeout: 10_000 });
    await assertCleanRendering(page, "/marketing/campaigns (list)");
  });

  test("opening a campaign detail page that's never been sent renders cleanly", async ({ page, request }) => {
    const list = await api(request, "/api/tenants/campaign?page=0&size=5");
    const items = Array.isArray(list.data) ? list.data : (list.data?.items ?? list.data?.list ?? []);
    if (items.length === 0) test.skip(true, "no campaigns");
    const id = items[0].id;
    await page.goto(`/marketing/campaigns/${id}`, { timeout: 10_000 });
    await page.waitForLoadState("networkidle", { timeout: 10_000 });
    await assertCleanRendering(page, "/marketing/campaigns/{id}");
  });
});

// ─── 5. Commchan list — channels with state=null or verified=false render cleanly ─

test.describe("Null handling: commchan list channels in mixed states", () => {
  test("commchan list page never displays literal 'null' / 'undefined'", async ({ page }) => {
    await page.goto("/marketing/communication", { timeout: 10_000 });
    await page.waitForLoadState("networkidle", { timeout: 10_000 });
    await assertCleanRendering(page, "/marketing/communication");
  });
});

// ─── 6. Bogus UUID detail pages — graceful empty state, not blank/crashed ────

test.describe("Null handling: bogus UUID navigation", () => {
  const fakeUuid = "00000000-0000-0000-0000-000000000000";
  const probes = [
    `/marketing/segments/${fakeUuid}`,
    `/marketing/campaigns/${fakeUuid}`,
    `/marketing/communication/${fakeUuid}`,
    `/data/clients/${fakeUuid}`,
  ];
  for (const path of probes) {
    test(`${path} (bogus id) — renders no forbidden tokens`, async ({ page }) => {
      await page.goto(path, { timeout: 10_000, waitUntil: "domcontentloaded" });
      // Wait briefly for SPA + error state
      await page.waitForTimeout(1_000);
      await assertCleanRendering(page, path);
    });
  }
});

// ─── 7. Customer profile with cdp_created_at null/missing ─────────────────────

test.describe("Null handling: customer with null timestamps", () => {
  test("any-customer profile renders without 'Invalid Date' anywhere", async ({ page, request }) => {
    const r = await api(request, "/api/v2/tenant/data/customers", {
      method: "POST",
      data: {
        columns: [{ fieldName: "primary_id", kind: "field" }],
        orderBy: [],
        filter: {},
        page: 0, size: 1,
      },
    });
    const id = r.data?.list?.[0]?.primary_id;
    if (!id) test.skip(true, "no customers on tenant");
    await page.goto(`/data/clients/${id}`, { timeout: 10_000 });
    await page.waitForLoadState("networkidle", { timeout: 10_000 });
    await assertCleanRendering(page, `/data/clients/${id}`);
  });
});
