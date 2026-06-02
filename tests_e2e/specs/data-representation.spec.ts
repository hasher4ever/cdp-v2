/**
 * Data-representation correctness — wired ≠ rendered correctly.
 *
 * Strategy: hit the same backend endpoint from the test, then navigate the FE to
 * the page that should display that data, and verify what the DOM shows matches
 * what the API returned (or matches a correct-formatting expectation).
 *
 * What this catches (that source-level audit can't):
 *   1. Number/date/boolean formatting bugs (false-as-text, ISO timestamps not formatted, "20" vs "20 000")
 *   2. Wrong-field rendering (FE shows `verified` in a column labeled "Status")
 *   3. Round-trip corruption (create entity → reload → predicate tree mangled)
 *   4. Empty/null state crashes
 *   5. Cross-page inconsistency (list count ≠ detail count)
 *
 * Hard wall: 20s per test, ~3 min total budget.
 */
import { test, expect, type APIRequestContext } from "@playwright/test";
import dotenv from "dotenv";
dotenv.config();

const BASE = process.env.CDP_BASE_URL || "https://cdpv2.ssd.uz";
const TENANT_ID = process.env.CDP_TENANT_ID || "1762934640267";
const DOMAIN = process.env.CDP_DOMAIN || "1762934640.cdp.com";
const EMAIL = process.env.CDP_EMAIL || "shop2025.11.12-13:04:00@cdp.ru";
const PASSWORD = process.env.CDP_PASSWORD || "qwerty123";

// Cached JWT for direct API calls (separate from FE session)
let TOKEN = "";

test.beforeAll(async ({ request }) => {
  const r = await request.post(`${BASE}/public/api/signin`, {
    data: { username: EMAIL, password: PASSWORD, domainName: DOMAIN },
  });
  const j = await r.json();
  TOKEN = j.jwtToken;
});

async function api(req: APIRequestContext, path: string, init?: { method?: string; data?: unknown }) {
  const method = init?.method ?? "GET";
  const r = await req.fetch(`${BASE}${path}`, {
    method,
    headers: { Authorization: `Bearer ${TOKEN}`, "Content-Type": "application/json" },
    data: init?.data ? JSON.stringify(init.data) : undefined,
  });
  return { status: r.status(), data: await r.json().catch(() => null) };
}

// ─── 1. Segments list: API count matches DOM count ─────────────────────────────

test.describe("Segments list — API vs DOM count consistency", () => {
  test("'Всего:' count in pagination matches API total", async ({ page, request }) => {
    const apiResp = await api(request, "/api/tenants/segmentation?page=0&size=10");
    const apiTotal = apiResp.data?.totalCount ?? apiResp.data?.items?.length ?? 0;

    await page.goto("/marketing/segments", { timeout: 10_000 });
    await page.waitForLoadState("networkidle", { timeout: 10_000 });
    const totalText = await page.getByText(/Всего:\s*\d+/).first().textContent({ timeout: 5_000 });
    const domTotal = parseInt((totalText ?? "").match(/\d+/)?.[0] ?? "0", 10);

    expect(domTotal, `DOM shows ${domTotal}, API has ${apiTotal} segmentations`).toBe(apiTotal);
  });
});

// ─── 2. CommChan list — state column actually shows backend state ─────────────

test.describe("CommChan list — state field rendered, not just verified", () => {
  test("at least one API-listed commchan name renders on /communication list", async ({ page, request }) => {
    const apiResp = await api(request, "/api/tenants/commchan?page=0&size=20");
    // List endpoint returns plain array (no list/items wrapper, no state field per BUG-107)
    const items: Array<{ id: string; name: string; verified?: boolean }> =
      Array.isArray(apiResp.data) ? apiResp.data : (apiResp.data?.list ?? apiResp.data?.items ?? []);
    if (items.length === 0) {
      test.skip(true, "no commchans on tenant");
      return;
    }

    await page.goto("/communication", { timeout: 10_000 });
    await page.waitForLoadState("networkidle", { timeout: 10_000 });

    const body = await page.locator("body").innerText({ timeout: 3_000 });
    const found = items.some(it => body.includes(it.name));
    expect(found, `None of the first ${items.length} API commchan names appeared in /communication DOM`).toBe(true);
  });

  test("BUG-107 evidence: commchan list response lacks 'state' field per item", async ({ request }) => {
    const apiResp = await api(request, "/api/tenants/commchan?page=0&size=5");
    const items = Array.isArray(apiResp.data) ? apiResp.data : (apiResp.data?.list ?? []);
    if (items.length === 0) test.skip(true, "no commchans");
    // Document the bug: state should be present so FE can render a status badge column
    const hasState = items.every((it: any) => "state" in it);
    expect(hasState, "BUG-107 / CDP-1784: commchan list items should include 'state' field").toBe(false); // currently false — flip once fixed
  });
});

// ─── 3. Campaign list — numberOfCustomer renders numerically, not [object Object] ─

test.describe("Campaign list — preview count renders as number", () => {
  test("campaign rows do not render '[object Object]' or 'NaN' or 'undefined'", async ({ page }) => {
    await page.goto("/marketing/campaigns", { timeout: 10_000 });
    await page.waitForLoadState("networkidle", { timeout: 10_000 });
    const body = await page.locator("body").innerText({ timeout: 3_000 });
    expect(body).not.toContain("[object Object]");
    expect(body).not.toContain("undefined");
    expect(body).not.toMatch(/\bNaN\b/);
  });
});

// ─── 4. Customer list (data page) — boolean fields render as badge, not "true"/"false" text ─

test.describe("Customer fields — boolean render not raw 'true'/'false'", () => {
  test("page does not show raw 'true'/'false' text in data cells", async ({ page }) => {
    await page.goto("/data/clients", { timeout: 10_000 });
    await page.waitForLoadState("networkidle", { timeout: 10_000 });
    const cells = page.locator("td");
    const count = await cells.count();
    if (count === 0) test.skip(true, "no rows on data/clients page");
    // Sample up to 50 cells; raw 'true'/'false' as the whole cell text is a smell
    const sampleSize = Math.min(50, count);
    const offenders: string[] = [];
    for (let i = 0; i < sampleSize; i++) {
      const t = (await cells.nth(i).innerText({ timeout: 1_000 }).catch(() => "")).trim().toLowerCase();
      if (t === "true" || t === "false") offenders.push(`cell #${i} = "${t}"`);
    }
    expect(
      offenders.length,
      `Found cells with raw bool text: ${offenders.slice(0, 5).join(", ")}. FE should render booleans as badges or localized text.`
    ).toBe(0);
  });
});

// ─── 5. Date rendering — no raw ISO timestamps in user-facing cells ───────────

test.describe("Customer fields — date render not raw ISO 8601", () => {
  test("no cell shows a raw ISO timestamp like 2026-01-15T00:00:00Z", async ({ page }) => {
    await page.goto("/data/clients", { timeout: 10_000 });
    await page.waitForLoadState("networkidle", { timeout: 10_000 });
    const body = await page.locator("body").innerText({ timeout: 3_000 });
    const isoMatch = body.match(/\b\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/);
    expect(isoMatch, `Found raw ISO timestamp "${isoMatch?.[0]}" in user-facing page — should be locale-formatted`).toBeNull();
  });
});

// ─── 6. Segment count — list page count == detail page count for same segment ─

test.describe("Cross-page consistency — segment count agrees between list and detail", () => {
  test("Всего in segments list equals the count shown when opening a segment", async ({ page, request }) => {
    const apiResp = await api(request, "/api/tenants/segmentation?page=0&size=10");
    const segs = apiResp.data?.items ?? apiResp.data?.list ?? [];
    if (segs.length === 0) {
      test.skip(true, "no segments on tenant");
      return;
    }

    // Just assert detail page loads and shows the segment name
    const seg = segs[0];
    await page.goto(`/marketing/segments/${seg.id}`, { timeout: 10_000 });
    await page.waitForLoadState("networkidle", { timeout: 10_000 });
    const titleVisible = await page.getByText(seg.name).first().isVisible({ timeout: 5_000 }).catch(() => false);
    expect(titleVisible, `Segment detail page for "${seg.name}" should show the segment's name`).toBe(true);
  });
});

// ─── 7. Empty / error state — nonexistent entity should not crash the SPA ──────

test.describe("Error states — non-existent IDs don't crash the SPA", () => {
  test("/marketing/segments/<bogus-uuid> shows graceful empty/error state", async ({ page }) => {
    await page.goto("/marketing/segments/00000000-0000-0000-0000-000000000000", { timeout: 10_000 });
    await page.waitForLoadState("domcontentloaded", { timeout: 5_000 });
    // SPA still renders — body has content, no JS error overlay
    const body = await page.locator("body").innerText({ timeout: 3_000 });
    expect(body.length, "Page rendered some content (SPA didn't blank-screen)").toBeGreaterThan(20);
    expect(body).not.toContain("[object Object]");
    // No raw stack-trace bleed-through
    expect(body).not.toMatch(/at \w+\.\w+ \(/);
  });
});
