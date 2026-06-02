/**
 * Captures "actual" screenshots from the live FE for each FE bug, and renders
 * accompanying "expected" mockup screenshots from local HTML files.
 *
 * Output: tests_e2e/evidence/*.png  (both actual_X.png and expected_X.png)
 * Filenames map to bug IDs so the Jira-attach script can find them.
 */
import { test, expect } from "@playwright/test";
import path from "path";
import { fileURLToPath } from "url";

const EV_DIR = "tests_e2e/evidence";

// ─── Actual: live FE screenshots ─────────────────────────────────────────────

test.describe.serial("actual-state evidence captures", () => {
  test("BUG-108 actual: campaign list with only ID + Name columns", async ({ page }) => {
    await page.goto("/marketing/campaigns", { timeout: 10_000 });
    await page.waitForLoadState("networkidle", { timeout: 10_000 });
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.screenshot({ path: `${EV_DIR}/BUG-108_actual.png`, fullPage: false });
  });

  test("BUG-109 actual: clients list with no date columns", async ({ page }) => {
    await page.goto("/data/clients", { timeout: 10_000 });
    await page.waitForLoadState("networkidle", { timeout: 10_000 });
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.screenshot({ path: `${EV_DIR}/BUG-109_actual.png`, fullPage: false });
  });

  test("BUG-110 actual: clients pagination control", async ({ page }) => {
    await page.goto("/data/clients", { timeout: 10_000 });
    await page.waitForLoadState("networkidle", { timeout: 10_000 });
    await page.setViewportSize({ width: 1280, height: 800 });
    // Try to scroll to pagination area
    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
    await page.waitForTimeout(500);
    await page.screenshot({ path: `${EV_DIR}/BUG-110_actual.png`, fullPage: false });
  });

  test("BUG-111 actual: segments list with no search input", async ({ page }) => {
    await page.goto("/marketing/segments", { timeout: 10_000 });
    await page.waitForLoadState("networkidle", { timeout: 10_000 });
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.screenshot({ path: `${EV_DIR}/BUG-111_actual.png`, fullPage: false });
  });

  test("BUG-113 actual: customer profile hides basic fields by default", async ({ page, request }) => {
    // Pick first customer
    const tokenResp = await request.post("/public/api/signin", {
      data: { username: process.env.CDP_EMAIL, password: process.env.CDP_PASSWORD, domainName: process.env.CDP_DOMAIN },
    });
    const token = (await tokenResp.json()).jwtToken;
    const list = await request.post("/api/v2/tenant/data/customers", {
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      data: JSON.stringify({ columns: [{ fieldName: "primary_id", kind: "field" }], orderBy: [], filter: {}, page: 0, size: 1 }),
    });
    const id = (await list.json()).list?.[0]?.primary_id;
    if (!id) test.skip(true, "no customer");
    await page.goto(`/data/clients/${id}`, { timeout: 10_000 });
    await page.waitForLoadState("networkidle", { timeout: 10_000 });
    await page.setViewportSize({ width: 1280, height: 900 });
    await page.screenshot({ path: `${EV_DIR}/BUG-113_actual.png`, fullPage: false });
  });

  test("BUG-106 actual: /marketing/metrics — falls back to root (no page)", async ({ page }) => {
    await page.goto("/marketing/metrics", { timeout: 10_000 });
    await page.waitForLoadState("domcontentloaded", { timeout: 5_000 });
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.screenshot({ path: `${EV_DIR}/BUG-106_actual.png`, fullPage: false });
  });
});

// ─── Expected: HTML mockups rendered to PNG ──────────────────────────────────

test.describe.serial("expected-state mockup captures", () => {
  test("render expected mockups from /tmp/mockups/*.html", async ({ page }) => {
    const mockups = [
      { id: "BUG-108", file: "BUG-108_expected.html" },
      { id: "BUG-109", file: "BUG-109_expected.html" },
      { id: "BUG-110", file: "BUG-110_expected.html" },
      { id: "BUG-111", file: "BUG-111_expected.html" },
      { id: "BUG-113", file: "BUG-113_expected.html" },
      { id: "BUG-106", file: "BUG-106_expected.html" },
    ];
    await page.setViewportSize({ width: 1280, height: 800 });
    for (const m of mockups) {
      const url = `file:///${path.resolve("tests_e2e/evidence", m.file).replace(/\\/g, "/")}`;
      await page.goto(url, { timeout: 5_000 });
      await page.waitForLoadState("domcontentloaded", { timeout: 3_000 });
      await page.screenshot({ path: `tests_e2e/evidence/${m.id}_expected.png`, fullPage: false });
    }
  });
});
