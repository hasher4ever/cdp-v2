/**
 * Minimal browser-launch canary. No auth, no storageState, no network.
 * If this hangs, the browser launch itself is the problem.
 * If this passes, the hang is in auth.setup.ts (the login flow).
 */
import { test, expect } from "@playwright/test";

test.use({ storageState: { cookies: [], origins: [] } });

test("browser launches and renders about:blank", async ({ page }) => {
  await page.goto("about:blank", { timeout: 5_000 });
  expect(page.url()).toBe("about:blank");
});

test("can reach https://example.com", async ({ page }) => {
  const res = await page.goto("https://example.com", { timeout: 10_000 });
  expect(res?.status()).toBe(200);
  await expect(page.locator("h1")).toContainText("Example Domain");
});

test("can reach cdpv2.ssd.uz sign-in page (public, no auth)", async ({ page }) => {
  const res = await page.goto("https://cdpv2.ssd.uz/auth/sign-in", { timeout: 10_000 });
  expect(res).toBeTruthy();
  // SPA shell loads — body becomes non-empty
  await page.waitForLoadState("domcontentloaded", { timeout: 5_000 });
});
