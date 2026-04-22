import { test, expect } from "@playwright/test";

test.describe("Navigation & Sidebar", () => {
  test("should show sidebar with all main sections", async ({ page }) => {
    await page.goto("/dashboard");

    // Dashboard link
    await expect(page.getByRole("link", { name: "Панель управления" })).toBeVisible();

    // Data section
    await expect(page.getByText("Данные")).toBeVisible();
    await expect(page.getByRole("link", { name: /Клиенты/ })).toBeVisible();
    await expect(page.getByRole("button", { name: /События/ })).toBeVisible();
    await expect(page.getByRole("link", { name: "Сценарий" })).toBeVisible();
    await expect(page.getByRole("link", { name: "Файлы" })).toBeVisible();

    // Marketing section
    await expect(page.getByText("Маркетинг")).toBeVisible();
    await expect(page.getByRole("link", { name: "Агрегаты" })).toBeVisible();
    await expect(page.getByRole("link", { name: "Сегменты" })).toBeVisible();
    await expect(page.getByRole("link", { name: "Рассылки" })).toBeVisible();
    await expect(page.getByRole("link", { name: "Коммуникации" })).toBeVisible();

    // Analytics section
    await expect(page.getByText("Аналитика")).toBeVisible();
    await expect(page.getByRole("link", { name: "Статистика полей" })).toBeVisible();
  });

  test("should navigate to Clients page", async ({ page }) => {
    await page.goto("/dashboard");
    await page.getByRole("link", { name: /Клиенты/ }).click();
    await expect(page).toHaveURL(/\/data\/clients/);
    await expect(page.getByText("Клиенты").first()).toBeVisible();
  });

  test("should navigate to Scenarios page", async ({ page }) => {
    await page.goto("/dashboard");
    await page.getByRole("link", { name: "Сценарий" }).click();
    await expect(page).toHaveURL(/\/data\/scenario/);
    await expect(page.getByText("Сценарии")).toBeVisible();
  });

  test("should navigate to Files page", async ({ page }) => {
    await page.goto("/dashboard");
    await page.getByRole("link", { name: "Файлы" }).click();
    await expect(page).toHaveURL(/\/data\/files/);
  });

  test("should navigate to Aggregates page", async ({ page }) => {
    await page.goto("/dashboard");
    await page.getByRole("link", { name: "Агрегаты" }).click();
    await expect(page).toHaveURL(/\/marketing\/aggregate/);
    await expect(page.getByText("Агрегаты").first()).toBeVisible();
  });

  test("should navigate to Segments page", async ({ page }) => {
    await page.goto("/dashboard");
    await page.getByRole("link", { name: "Сегменты" }).click();
    await expect(page).toHaveURL(/\/marketing\/segments/);
    await expect(page.getByText("Сегментация")).toBeVisible();
  });

  test("should navigate to Campaigns page", async ({ page }) => {
    await page.goto("/dashboard");
    await page.getByRole("link", { name: "Рассылки" }).click();
    await expect(page).toHaveURL(/\/marketing\/campaigns/);
    await expect(page.getByText("Рассылки").first()).toBeVisible();
  });

  test("should navigate to Communications page", async ({ page }) => {
    await page.goto("/dashboard");
    await page.getByRole("link", { name: "Коммуникации" }).click();
    await expect(page).toHaveURL(/\/marketing\/communication/);
    await expect(page.getByText("Коммуникации").first()).toBeVisible();
  });

  test("should navigate to Field Statistics page", async ({ page }) => {
    await page.goto("/dashboard");
    await page.getByRole("link", { name: "Статистика полей" }).click();
    await expect(page).toHaveURL(/\/statistics\/field/);
    await expect(page.getByText("Статистика полей").first()).toBeVisible();
  });

  test("should show Events dropdown with event types", async ({ page }) => {
    await page.goto("/dashboard");
    await page.getByRole("button", { name: /События/ }).click();
    // Should show event type links in a dropdown/dialog
    await expect(page.getByRole("link", { name: /purchase/ })).toBeVisible({ timeout: 5000 });
  });
});
