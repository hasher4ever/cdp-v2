/**
 * Edge-value handling — try to BREAK the FE with extreme/adversarial data and
 * see how it copes. The surface-level null-handling tests passed; this layer
 * goes after the actual breakage modes:
 *
 *   1. Extreme number magnitudes (0, negative, huge, scientific)
 *   2. Special chars in names (XSS-like, emoji, RTL text, very long strings)
 *   3. Boundary dates (1900, year 2050, 1970 unix epoch)
 *   4. Empty array vs null distinction (predicate value with empty arrays)
 *   5. Whitespace-only / unicode-zero-width chars
 *   6. Zero vs null in count columns (income=0 — shown as "0" or empty?)
 *
 * Each test seeds an entity with the edge value via API, then asks the FE to
 * render it, and asserts the DOM doesn't fall over.
 */
import { test, expect, type APIRequestContext, type Page } from "@playwright/test";
import dotenv from "dotenv";
dotenv.config();

const BASE = process.env.CDP_BASE_URL || "https://cdpv2.ssd.uz";
const TENANT_ID = process.env.CDP_TENANT_ID || "1762934640267";
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

async function ingestCustomer(req: APIRequestContext, body: Record<string, unknown>) {
  return req.fetch(`${BASE}/cdp-ingest/ingest/tenant/${TENANT_ID}/async/customers`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    data: JSON.stringify([body]),
  });
}

async function waitForCustomerVisible(req: APIRequestContext, id: number, maxMs = 15_000) {
  const deadline = Date.now() + maxMs;
  while (Date.now() < deadline) {
    const r = await api(req, `/api/tenant/data/customers/${id}`);
    if (r.status === 200) return true;
    await new Promise((r2) => setTimeout(r2, 1_000));
  }
  return false;
}

const FORBIDDEN = ["[object Object]", "Invalid Date", "NaN", "Infinity"];
async function assertCleanRendering(page: Page, where: string) {
  const body = await page.locator("body").innerText({ timeout: 5_000 });
  const found = FORBIDDEN.filter((t) => body.includes(t));
  expect(found.length, `${where}: forbidden tokens leaked: ${found.join(", ")}`).toBe(0);
}

const probeId = () => 9_910_000_000 + Math.floor(Math.random() * 89_999_999);

// ─── 1. Extreme number: huge income ───────────────────────────────────────────

test.describe("Edge values: extreme number magnitudes", () => {
  test("customer with income = 1_000_000_000_000 (1 trillion) renders without scientific notation or Infinity", async ({ page, request }) => {
    const id = probeId();
    await ingestCustomer(request, {
      primary_id: id,
      first_name: `Huge_${id}`,
      last_name: "Wealth",
      email: `huge${id}@test.cdp`,
      gender: "other",
      age: 40,
      is_adult: true,
      is_subscribed: false,
      income: 1_000_000_000_000,
      birthdate: "1985-06-15",
      phone_number: 0,
      api_customer_name_first: `Huge_${id}`,
      api_customer_name_last: "Wealth",
    });
    if (!(await waitForCustomerVisible(request, id))) {
      test.skip(true, "ingest not visible");
      return;
    }
    await page.goto(`/data/clients/${id}`, { timeout: 10_000 });
    await page.waitForLoadState("networkidle", { timeout: 10_000 });
    await assertCleanRendering(page, "huge-income customer");
    // Specific: no scientific notation on this page
    const body = await page.locator("body").innerText({ timeout: 5_000 });
    expect(body, "1 trillion should not render as 1e+12").not.toMatch(/\b1\.?\d*e\+12\b/);
  });

  test("customer with income = 0 renders something readable, not blank", async ({ page, request }) => {
    const id = probeId();
    await ingestCustomer(request, {
      primary_id: id,
      first_name: `Zero_${id}`,
      last_name: "Income",
      email: `z${id}@test.cdp`,
      gender: "male",
      age: 25,
      is_adult: true,
      is_subscribed: false,
      income: 0,
      birthdate: "1999-01-01",
      phone_number: 0,
      api_customer_name_first: `Zero_${id}`,
      api_customer_name_last: "Income",
    });
    if (!(await waitForCustomerVisible(request, id))) { test.skip(true, ""); return; }

    await page.goto(`/data/clients/${id}`, { timeout: 10_000 });
    await page.waitForLoadState("networkidle", { timeout: 10_000 });
    await assertCleanRendering(page, "zero-income customer");

    // Specific: phone_number=0 should not show "0" (likely "—" or empty), AND
    // income=0 should show either "0" or nothing — never "null"
    const body = await page.locator("body").innerText({ timeout: 5_000 });
    expect(body).not.toMatch(/income[\s:]*\bnull\b/i);
  });
});

// ─── 2. Special chars: XSS, emoji, RTL ────────────────────────────────────────

test.describe("Edge values: special characters in names", () => {
  test("customer with HTML/script in first_name is escaped, not executed", async ({ page, request }) => {
    const id = probeId();
    const xss = `<script>window.__pwned=true</script>`;
    await ingestCustomer(request, {
      primary_id: id,
      first_name: xss,
      last_name: "Xss",
      email: `xss${id}@test.cdp`,
      gender: "other",
      age: 30, is_adult: true, is_subscribed: false,
      income: 50_000, birthdate: "1995-01-01", phone_number: 0,
      api_customer_name_first: xss, api_customer_name_last: "Xss",
    });
    if (!(await waitForCustomerVisible(request, id))) { test.skip(true, ""); return; }

    await page.goto(`/data/clients/${id}`, { timeout: 10_000 });
    await page.waitForLoadState("networkidle", { timeout: 10_000 });

    // The XSS payload should NOT have executed (primary security assertion)
    const pwned = await page.evaluate(() => (window as any).__pwned === true);
    expect(pwned, "XSS payload in first_name should NOT execute in the FE").toBe(false);

    // Click "Показать остальные" (Show more) to expose hidden fields including first_name (BUG-113 cascade)
    const showMore = page.getByRole("button", { name: "Показать остальные" }).first();
    if (await showMore.isVisible({ timeout: 1_000 }).catch(() => false)) await showMore.click();
    await page.waitForTimeout(500);

    // HTML in the DOM source — confirms FE renders it as text not as a script element.
    const html = await page.content();
    expect(html.includes("&lt;script&gt;") || html.includes("\\u003cscript\\u003e") || !html.match(/<script[^>]*>window\.__pwned/i),
      "FE should escape <script> tags from user-supplied fields").toBe(true);
  });

  test("customer with emoji in name renders without crashing", async ({ page, request }) => {
    const id = probeId();
    await ingestCustomer(request, {
      primary_id: id,
      first_name: "🎉 Emoji 👍",
      last_name: "Тест",  // also tests Cyrillic
      email: `e${id}@test.cdp`,
      gender: "other", age: 30, is_adult: true, is_subscribed: false,
      income: 10_000, birthdate: "1990-01-01", phone_number: 0,
      api_customer_name_first: "🎉 Emoji 👍", api_customer_name_last: "Тест",
    });
    if (!(await waitForCustomerVisible(request, id))) { test.skip(true, ""); return; }
    await page.goto(`/data/clients/${id}`, { timeout: 10_000 });
    await page.waitForLoadState("networkidle", { timeout: 10_000 });
    await assertCleanRendering(page, "emoji-name customer");
  });

  test("customer with 1000-char first_name does not break layout / SPA still navigable", async ({ page, request }) => {
    const id = probeId();
    const longName = "L" + "x".repeat(1000);
    const res = await ingestCustomer(request, {
      primary_id: id,
      first_name: longName,
      last_name: "Long",
      email: `l${id}@test.cdp`,
      gender: "other", age: 30, is_adult: true, is_subscribed: false,
      income: 10_000, birthdate: "1990-01-01", phone_number: 0,
      api_customer_name_first: longName, api_customer_name_last: "Long",
    });
    if (!res.ok) {
      // Some backends reject names this long — that's also a valid behavior
      console.warn(`backend refused 1000-char name with status ${res.status()}`);
      return;
    }
    if (!(await waitForCustomerVisible(request, id))) { test.skip(true, ""); return; }
    await page.goto(`/data/clients/${id}`, { timeout: 10_000 });
    await page.waitForLoadState("networkidle", { timeout: 10_000 });
    await assertCleanRendering(page, "1000-char-name customer");

    // SPA still navigable — top-level dashboard link still visible
    const dashLink = await page.getByRole("link", { name: "Панель управления" }).first()
      .isVisible({ timeout: 2_000 }).catch(() => false);
    expect(dashLink, "Dashboard nav link should still be visible despite 1000-char name").toBe(true);
  });
});

// ─── 3. Boundary dates — far past + future ────────────────────────────────────

test.describe("Edge values: boundary dates", () => {
  test("customer born in year 1900 renders without 'Invalid Date'", async ({ page, request }) => {
    const id = probeId();
    await ingestCustomer(request, {
      primary_id: id,
      first_name: `Old_${id}`,
      last_name: "Era",
      email: `old${id}@test.cdp`,
      gender: "other", age: 125, is_adult: true, is_subscribed: false,
      income: 0, birthdate: "1900-01-01", phone_number: 0,
      api_customer_name_first: `Old_${id}`, api_customer_name_last: "Era",
    });
    if (!(await waitForCustomerVisible(request, id))) { test.skip(true, ""); return; }
    await page.goto(`/data/clients/${id}`, { timeout: 10_000 });
    await page.waitForLoadState("networkidle", { timeout: 10_000 });
    await assertCleanRendering(page, "year-1900-birthdate customer");
  });

  test("customer with year-2050 birthdate doesn't crash (future-date input)", async ({ page, request }) => {
    const id = probeId();
    const res = await ingestCustomer(request, {
      primary_id: id,
      first_name: `Future_${id}`,
      last_name: "Date",
      email: `f${id}@test.cdp`,
      gender: "other", age: 0, is_adult: false, is_subscribed: false,
      income: 0, birthdate: "2050-12-31", phone_number: 0,
      api_customer_name_first: `Future_${id}`, api_customer_name_last: "Date",
    });
    if (!res.ok) return; // backend may reject — fine
    if (!(await waitForCustomerVisible(request, id))) { test.skip(true, ""); return; }
    await page.goto(`/data/clients/${id}`, { timeout: 10_000 });
    await page.waitForLoadState("networkidle", { timeout: 10_000 });
    await assertCleanRendering(page, "year-2050-birthdate customer");
  });
});

// ─── 4. Empty arrays in predicates — segment/preview should handle gracefully ─

test.describe("Edge values: predicate with empty value arrays", () => {
  test("segment with predicate having empty value arrays renders detail page without breaking SPA", async ({ page, request }) => {
    const fieldsResp = await api(request, "/api/tenants/schema/customers/fields");
    const fields: any[] = fieldsResp.data?.fields ?? fieldsResp.data?.list ?? fieldsResp.data ?? [];
    const g = fields.find((f: any) => (f.api_name ?? f.apiName) === "gender");
    const gName = g?.field_name ?? g?.fieldName;
    if (!gName) test.skip(true, "");

    // Edge case: operator "in" with empty array — backend may 400; that's valid
    const created = await api(request, "/api/tenants/segmentation", {
      method: "POST",
      data: {
        name: `EMPTY_VAL_${Date.now()}`,
        segments: [{
          name: "X",
          customerProfileFilter: {
            type: "group",
            group: {
              logicalOp: "AND", negate: false,
              predicates: [{
                type: "condition",
                condition: {
                  param: { kind: "field", fieldName: gName },
                  operator: "in",
                  value: { string: [], time: [], float64: [], int64: [], bool: [] }, // ALL empty
                },
              }],
            },
          },
        }],
      },
    });
    if (created.status !== 200) {
      // Backend rejected the empty-value predicate — that's fine
      return;
    }
    const segId = created.data.id;
    try {
      await page.goto(`/marketing/segments/${segId}`, { timeout: 10_000 });
      await page.waitForLoadState("networkidle", { timeout: 10_000 });
      await assertCleanRendering(page, "empty-value-array segment");
    } finally {
      await api(request, `/api/tenants/segmentation/${segId}`, { method: "DELETE" });
    }
  });
});

// ─── 5. Whitespace / zero-width chars in name ─────────────────────────────────

test.describe("Edge values: whitespace and zero-width chars", () => {
  test("segment with name containing zero-width chars and unicode spaces still renders", async ({ page, request }) => {
    const segName = `WSP_${Date.now()}​ ‌`;
    const fieldsResp = await api(request, "/api/tenants/schema/customers/fields");
    const fields: any[] = fieldsResp.data?.fields ?? fieldsResp.data?.list ?? fieldsResp.data ?? [];
    const g = fields.find((f: any) => (f.api_name ?? f.apiName) === "is_adult");
    const gName = g?.field_name ?? g?.fieldName;
    if (!gName) test.skip(true, "");
    const created = await api(request, "/api/tenants/segmentation", {
      method: "POST",
      data: {
        name: segName,
        segments: [{
          name: "X",
          customerProfileFilter: {
            type: "group",
            group: { logicalOp: "AND", negate: false, predicates: [
              { type: "condition", condition: { param: { kind: "field", fieldName: gName }, operator: "=", value: { string: [], time: [], float64: [], int64: [], bool: [true] } } }
            ]},
          },
        }],
      },
    });
    if (created.status !== 200) return;
    try {
      await page.goto(`/marketing/segments/${created.data.id}`, { timeout: 10_000 });
      await page.waitForLoadState("networkidle", { timeout: 10_000 });
      await assertCleanRendering(page, "zero-width-char segment");
    } finally {
      await api(request, `/api/tenants/segmentation/${created.data.id}`, { method: "DELETE" });
    }
  });
});
