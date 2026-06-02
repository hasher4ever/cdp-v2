/**
 * Marketer-journey E2E — uses the FE in a browser the way a marketing user would.
 *
 * Scope: confirm the FE wires correctly to BE for the high-stakes paths and
 * surface the BUG-106 gap (Metrics / Categorizations / Heatmap / Activate
 * have no UI to click).
 *
 * Strategy:
 *   - Use the authenticated context (auth-state.json from auth.setup.ts).
 *   - Navigate to where each marketer feature SHOULD live.
 *   - Assert what's actually visible. Document the gap.
 *   - For features that DO exist, exercise one happy-path action and check the
 *     resulting state ends up correct.
 *
 * Hard wall: each test has a 20s timeout. Total file budget < 3 min.
 */
import { test, expect } from "@playwright/test";

test.describe.configure({ mode: "default" });

const FEATURE_URLS = {
  metrics: "/metrics",
  categorizations: "/categorizations",
  heatmap: "/heatmap",
  funnel: "/campaigns/funnel-metrics",
} as const;

// ─── 1. Confirm BUG-106 visually: the 4 unwired features should 404 or fallback ─

test.describe("BUG-106: missing marketer feature UIs", () => {
  for (const [feature, path] of Object.entries(FEATURE_URLS)) {
    test(`/${feature} — no top-level UI route (SPA falls back)`, async ({ page }) => {
      await page.goto(path, { timeout: 10_000 });
      await page.waitForLoadState("domcontentloaded", { timeout: 5_000 });
      // The SPA shell renders, but the page body should NOT contain a feature-specific heading.
      // We assert the URL no longer matches the requested feature path OR the page lacks recognizable feature UI.
      const body = await page.locator("body").innerText({ timeout: 2_000 }).catch(() => "");
      const hasFeatureUi =
        body.toLowerCase().includes(feature) &&
        body.length > 200; // SPA shell minimal text would be tiny
      expect(hasFeatureUi, `Feature page for "${feature}" should not have dedicated UI yet (BUG-106 / CDP-1783)`).toBe(false);
    });
  }
});

// ─── 2. CommChan activation gap — list page shows channels but no activate button ─

test.describe("BUG-106 cascade: commchan has no Activate UI", () => {
  test("commchan list renders, but no Activate/Deactivate button on items", async ({ page }) => {
    await page.goto("/communication", { timeout: 10_000 });
    await page.waitForLoadState("domcontentloaded", { timeout: 5_000 });
    // Look for any "Активировать" / "Activate" / "Деактивировать" button across the page
    const activateBtns = await page
      .getByRole("button", { name: /Активиров|Activate|Деактивир|Deactivate/ })
      .count();
    expect(
      activateBtns,
      "FE has no Activate/Deactivate button — marketers cannot transition commchan to state=active (BUG-106)"
    ).toBe(0);
  });
});

// ─── 3. Segment builder smoke — happy path that DOES work today ───────────────

test.describe("Segment builder (wired feature)", () => {
  test("can navigate to segments list page", async ({ page }) => {
    await page.goto("/marketing/segments", { timeout: 10_000 });
    await page.waitForLoadState("domcontentloaded", { timeout: 5_000 });
    // Should not have been redirected to sign-in
    expect(page.url()).not.toContain("/auth/sign-in");
  });
});

// ─── 4. Campaign builder smoke — wired ────────────────────────────────────────

test.describe("Campaign builder (wired feature)", () => {
  test("can navigate to campaigns list page", async ({ page }) => {
    await page.goto("/marketing/campaigns", { timeout: 10_000 });
    await page.waitForLoadState("domcontentloaded", { timeout: 5_000 });
    expect(page.url()).not.toContain("/auth/sign-in");
  });
});

// ─── 5. Dashboard renders for authed marketer ─────────────────────────────────

test("authenticated marketer lands on dashboard (sanity)", async ({ page }) => {
  await page.goto("/dashboard", { timeout: 10_000 });
  await page.waitForLoadState("domcontentloaded", { timeout: 5_000 });
  expect(page.url()).toMatch(/\/dashboard|\/$/);
});
