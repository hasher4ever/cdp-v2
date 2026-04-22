import { test as setup } from "@playwright/test";
import dotenv from "dotenv";

dotenv.config();

const BASE_URL = process.env.CDP_BASE_URL || "https://cdpv2.ssd.uz";
const DOMAIN = process.env.CDP_DOMAIN || "1762934640.cdp.com";
const EMAIL = process.env.CDP_EMAIL || "shop2025.11.12-13:04:00@cdp.ru";
const PASSWORD = process.env.CDP_PASSWORD || "qwerty123";

setup("authenticate", async ({ page }) => {
  await page.goto(`${BASE_URL}/auth/sign-in`);

  await page.getByRole("textbox", { name: "Домен" }).fill(DOMAIN);
  await page.getByRole("textbox", { name: "Электронная почта" }).fill(EMAIL);
  await page.getByRole("textbox", { name: "Пароль" }).fill(PASSWORD);
  await page.getByRole("button", { name: "Войти" }).click();

  // Wait for redirect to dashboard
  await page.waitForURL("**/dashboard", { timeout: 15_000 });

  // Save signed-in state
  await page.context().storageState({ path: "auth-state.json" });
});
