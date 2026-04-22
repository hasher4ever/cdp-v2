import { test, expect } from "@playwright/test";

test.describe("Field Statistics Page — Layout", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/statistics/field");
    await page.waitForLoadState("networkidle");
  });

  test("should display field statistics page", async ({ page }) => {
    await expect(page.getByText("Статистика полей").first()).toBeVisible();
  });

  test("should show Customer and Event schema tabs", async ({ page }) => {
    await expect(
      page.getByRole("tab", { name: "Поля схемы клиента" })
    ).toBeVisible();
    await expect(
      page.getByRole("tab", { name: "Поля схемы событий" })
    ).toBeVisible();
  });

  test("should show field selector dropdown", async ({ page }) => {
    await expect(
      page.getByRole("textbox", { name: "Выберите поле" })
    ).toBeVisible();
  });

  test("should show prompt to select a field initially", async ({ page }) => {
    await expect(
      page.getByText("Выберите поле для просмотра значений")
    ).toBeVisible();
  });

  test("should have Customer Schema tab active by default", async ({
    page,
  }) => {
    const tab = page.getByRole("tab", { name: "Поля схемы клиента" });
    await expect(tab).toHaveAttribute("aria-selected", "true");
  });
});

test.describe("Field Statistics — Customer Field Selection", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/statistics/field");
    await page.waitForLoadState("networkidle");
  });

  test("should show dropdown options when clicking field selector", async ({
    page,
  }) => {
    const fieldSelector = page.getByRole("textbox", {
      name: "Выберите поле",
    });
    await fieldSelector.click();
    await page.waitForTimeout(500);

    // Dropdown should show available customer fields
    const options = page.getByRole("option");
    const listItems = page.getByRole("listbox").getByRole("option");
    const dropdownItems = options.or(listItems);

    const count = await dropdownItems.count().catch(() => 0);
    // Should list at least a few customer fields
    expect(count).toBeGreaterThanOrEqual(1);
  });

  test("should display value distribution after selecting a field", async ({
    page,
  }) => {
    const fieldSelector = page.getByRole("textbox", {
      name: "Выберите поле",
    });
    await fieldSelector.click();
    await page.waitForTimeout(500);

    // Try to select the first available field
    const options = page.getByRole("option");
    if (
      await options
        .first()
        .isVisible({ timeout: 2000 })
        .catch(() => false)
    ) {
      await options.first().click();
      await page.waitForTimeout(2000);
      await page.waitForLoadState("networkidle");

      // The prompt text should disappear and be replaced by data
      await expect(
        page.getByText("Выберите поле для просмотра значений")
      ).not.toBeVisible({ timeout: 5000 });

      // Some form of data visualization should appear (table, chart, etc.)
      const dataContent = page
        .getByRole("table")
        .or(page.locator("canvas"))
        .or(page.locator('[class*="chart"]'))
        .or(page.locator('[class*="stat"]'))
        .first();

      await expect(dataContent).toBeVisible({ timeout: 5000 });
    }
  });

  test("should show gender field values when selected", async ({ page }) => {
    const fieldSelector = page.getByRole("textbox", {
      name: "Выберите поле",
    });
    await fieldSelector.click();
    await page.waitForTimeout(500);

    // Try to find and select "gender" field
    const genderOption = page.getByRole("option", { name: /gender/i });
    if (
      await genderOption
        .isVisible({ timeout: 2000 })
        .catch(() => false)
    ) {
      await genderOption.click();
      await page.waitForTimeout(3000);
      await page.waitForLoadState("networkidle");

      // Should show gender value distribution: female, male, other
      // At minimum check that some data appeared
      const hasContent = page
        .getByText(/female|male|other/i)
        .first();
      await expect(hasContent).toBeVisible({ timeout: 5000 });
    }
  });
});

test.describe("Field Statistics — Event Schema Tab", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/statistics/field");
    await page.waitForLoadState("networkidle");
  });

  test("should switch to event schema tab", async ({ page }) => {
    await page.getByRole("tab", { name: "Поля схемы событий" }).click();
    const tab = page.getByRole("tab", { name: "Поля схемы событий" });
    await expect(tab).toHaveAttribute("aria-selected", "true");
  });

  test("should show field selector on event schema tab", async ({ page }) => {
    await page.getByRole("tab", { name: "Поля схемы событий" }).click();
    await page.waitForTimeout(500);

    // Field selector should still be present but for event fields
    const fieldSelector = page.getByRole("textbox", {
      name: "Выберите поле",
    });
    await expect(fieldSelector).toBeVisible();
  });

  test("should show event field options in dropdown", async ({ page }) => {
    await page.getByRole("tab", { name: "Поля схемы событий" }).click();
    await page.waitForTimeout(500);

    const fieldSelector = page.getByRole("textbox", {
      name: "Выберите поле",
    });
    await fieldSelector.click();
    await page.waitForTimeout(500);

    const options = page.getByRole("option");
    const count = await options.count().catch(() => 0);
    // Event fields should be available
    expect(count).toBeGreaterThanOrEqual(1);
  });

  test("should display event field value distribution", async ({ page }) => {
    await page.getByRole("tab", { name: "Поля схемы событий" }).click();
    await page.waitForTimeout(500);

    const fieldSelector = page.getByRole("textbox", {
      name: "Выберите поле",
    });
    await fieldSelector.click();
    await page.waitForTimeout(500);

    // Select first available event field
    const options = page.getByRole("option");
    if (
      await options
        .first()
        .isVisible({ timeout: 2000 })
        .catch(() => false)
    ) {
      await options.first().click();
      await page.waitForTimeout(2000);
      await page.waitForLoadState("networkidle");

      // Data visualization should appear
      await expect(
        page.getByText("Выберите поле для просмотра значений")
      ).not.toBeVisible({ timeout: 5000 });
    }
  });
});

// @generated by /qa-write L1+L2
test.describe("Field Statistics — Total Count Value", () => {
  // L1: after selecting a customer field, "Всего:" shows a non-zero number
  test("should show non-zero total count after selecting a customer field", async ({
    page,
  }) => {
    // @generated by /qa-write L1
    await page.goto("/statistics/field");
    await page.waitForLoadState("networkidle");

    // Open customer field selector and pick "Gender"
    await page.getByRole("textbox", { name: "Выберите поле" }).click();
    await page.waitForTimeout(500);
    await page.getByRole("option", { name: "Gender", exact: true }).click();
    await page.waitForLoadState("networkidle");

    // "Всего:" label paragraph and its numeric sibling share a common parent generic.
    // Wait for the sibling count element to change away from "0", then assert > 0.
    // The count element is the direct sibling after the "Всего:" paragraph.
    const totalContainer = page
      .getByText("Всего:", { exact: true })
      .locator("..");
    // Poll until textContent contains a non-zero digit
    await expect(totalContainer).not.toHaveText(/Всего:\s*0$/, { timeout: 8000 });
    const fullText = await totalContainer.textContent();
    const match = (fullText ?? "").match(/(\d+)$/);
    const count = match ? parseInt(match[1], 10) : 0;
    expect(count).toBeGreaterThan(0);
  });

  // L2: switch to Event Schema tab — event-type selector appears, field selector
  //     populates with event fields, and "Всего:" goes non-zero after selection
  test("should show non-zero total count after selecting an event field", async ({
    page,
  }) => {
    // @generated by /qa-write L2
    await page.goto("/statistics/field");
    await page.waitForLoadState("networkidle");

    // Switch to Event Schema tab
    await page.getByRole("tab", { name: "Поля схемы событий" }).click();
    await page.waitForTimeout(300);

    // Event Schema has an extra event-type selector that must be filled first
    const eventTypeSelector = page.getByRole("textbox", {
      name: "Выберите тип события",
    });
    await expect(eventTypeSelector).toBeVisible();
    await eventTypeSelector.click();
    await page.waitForTimeout(400);
    await page
      .getByRole("option", { name: "purchase", exact: true })
      .click();
    await page.waitForTimeout(300);

    // Now open the field selector — it should list event-specific fields
    const fieldSelector = page.getByRole("textbox", { name: "Выберите поле" });
    await fieldSelector.click();
    await page.waitForTimeout(400);

    // Verify event-specific options appear (not customer-only fields like "Gender")
    await expect(
      page.getByRole("option", { name: "Purchase Status", exact: true })
    ).toBeVisible();

    // Select "Purchase Status"
    await page
      .getByRole("option", { name: "Purchase Status", exact: true })
      .click();
    await page.waitForLoadState("networkidle");

    // "Всего:" count must be > 0 — wait for it to update from "0"
    const totalContainer = page
      .getByText("Всего:", { exact: true })
      .locator("..");
    await expect(totalContainer).not.toHaveText(/Всего:\s*0$/, { timeout: 8000 });
    const fullText = await totalContainer.textContent();
    const match = (fullText ?? "").match(/(\d+)$/);
    const count = match ? parseInt(match[1], 10) : 0;
    expect(count).toBeGreaterThan(0);
  });
});

// @generated by /qa-write L3
test.describe("Field Statistics — L3 Data Flow", () => {
  // Helper: wait for total count to go non-zero
  async function waitForNonZeroTotal(page: any, timeout = 10000) {
    await page.waitForFunction(
      () => {
        const all = [...document.querySelectorAll("p")];
        const vsego = all.find((p) => p.textContent?.trim() === "Всего:");
        if (!vsego) return false;
        const parent = vsego.parentElement;
        return parent?.textContent?.replace("Всего:", "").trim() !== "0";
      },
      { timeout }
    );
  }

  // Helper: extract value+count pairs from visualization list
  async function getVizRows(page: any): Promise<{ value: string; count: number }[]> {
    return page.evaluate(() => {
      const all = document.querySelectorAll("body *");
      const rows: { value: string; count: number }[] = [];
      for (const el of all) {
        const children = [...(el as Element).children];
        if (children.length === 2) {
          const t1 = children[0].textContent?.trim() ?? "";
          const t2 = children[1].textContent?.trim() ?? "";
          if (t1 && t2 && /^\d+$/.test(t2) && t1.length < 100 && !t1.includes("Всего")) {
            rows.push({ value: t1, count: parseInt(t2, 10) });
          }
        }
      }
      return rows;
    });
  }

  test("L3: Gender field shows 3 distinct values: male, female, male1", async ({ page }) => {
    // @generated by /qa-write L3
    await page.goto("/statistics/field");
    await page.waitForLoadState("networkidle");

    await page.getByRole("textbox", { name: "Выберите поле" }).click();
    await page.waitForTimeout(500);
    await page.getByRole("option", { name: "Gender", exact: true }).click();
    await page.waitForLoadState("networkidle");
    await waitForNonZeroTotal(page);

    // Total count should be 3 (three distinct gender values)
    const totalContainer = page.getByText("Всего:", { exact: true }).locator("..");
    const fullText = await totalContainer.textContent();
    const match = (fullText ?? "").match(/(\d+)$/);
    expect(parseInt(match![1], 10)).toBe(3);

    // The three distinct values should all be visible
    const rows = await getVizRows(page);
    const values = rows.map((r) => r.value);
    expect(values).toContain("male");
    expect(values).toContain("female");
    expect(values).toContain("male1");
  });

  test("L3: isAdult field shows 2 distinct values with counts", async ({ page }) => {
    // @generated by /qa-write L3
    await page.goto("/statistics/field");
    await page.waitForLoadState("networkidle");

    await page.getByRole("textbox", { name: "Выберите поле" }).click();
    await page.waitForTimeout(500);
    await page.getByRole("option", { name: "isAdult", exact: true }).click();
    await page.waitForLoadState("networkidle");
    await waitForNonZeroTotal(page);

    const totalContainer = page.getByText("Всего:", { exact: true }).locator("..");
    const fullText = await totalContainer.textContent();
    const match = (fullText ?? "").match(/(\d+)$/);
    // isAdult has 2 distinct values
    expect(parseInt(match![1], 10)).toBe(2);

    // Both 0 and 1 should be present
    const rows = await getVizRows(page);
    const values = rows.map((r) => r.value);
    expect(values).toContain("1");
    expect(values).toContain("0");
    // Counts should be positive integers
    rows.forEach((r) => expect(r.count).toBeGreaterThan(0));
  });

  test("L3: switching field updates distribution — Gender → isAdult replaces data", async ({ page }) => {
    // @generated by /qa-write L3
    await page.goto("/statistics/field");
    await page.waitForLoadState("networkidle");

    // Select Gender first
    await page.getByRole("textbox", { name: "Выберите поле" }).click();
    await page.waitForTimeout(500);
    await page.getByRole("option", { name: "Gender", exact: true }).click();
    await page.waitForLoadState("networkidle");
    await waitForNonZeroTotal(page);

    const genderRows = await getVizRows(page);
    expect(genderRows.map((r) => r.value)).toContain("male");

    // Switch to isAdult
    await page.getByRole("textbox", { name: "Выберите поле" }).click();
    await page.waitForTimeout(400);
    await page.getByRole("option", { name: "isAdult", exact: true }).click();
    await page.waitForLoadState("networkidle");
    await waitForNonZeroTotal(page);

    const adultRows = await getVizRows(page);
    const adultValues = adultRows.map((r) => r.value);
    // Old gender values should be gone
    expect(adultValues).not.toContain("male");
    expect(adultValues).not.toContain("female");
    // New isAdult values should be present
    expect(adultValues).toContain("1");
    expect(adultValues).toContain("0");
  });

  test("L3: section heading updates when switching tabs — Customer vs Event", async ({ page }) => {
    // @generated by /qa-write L3
    await page.goto("/statistics/field");
    await page.waitForLoadState("networkidle");

    // Customer tab heading
    await expect(page.getByRole("heading", { level: 4 })).toHaveText("Поля схемы клиента");

    // Switch to Event tab
    await page.getByRole("tab", { name: "Поля схемы событий" }).click();
    await page.waitForTimeout(400);

    // Heading should now say event schema
    await expect(page.getByRole("heading", { level: 4 })).toHaveText("Поля схемы событий");

    // Switch back — heading reverts
    await page.getByRole("tab", { name: "Поля схемы клиента" }).click();
    await page.waitForTimeout(400);
    await expect(page.getByRole("heading", { level: 4 })).toHaveText("Поля схемы клиента");
  });

  test("L3: event field selector shows options only after event type selected", async ({ page }) => {
    // @generated by /qa-write L3
    await page.goto("/statistics/field");
    await page.waitForLoadState("networkidle");

    await page.getByRole("tab", { name: "Поля схемы событий" }).click();
    await page.waitForTimeout(400);

    // Click field selector before event type — no options available
    await page.getByRole("textbox", { name: "Выберите поле" }).click();
    await page.waitForTimeout(300);
    const optionsBefore = await page.getByRole("option").count().catch(() => 0);
    expect(optionsBefore).toBe(0);
    await page.keyboard.press("Escape");

    // Select event type
    await page.getByRole("textbox", { name: "Выберите тип события" }).click();
    await page.waitForTimeout(300);
    await page.getByRole("option", { name: "purchase", exact: true }).click();
    await page.waitForTimeout(300);

    // Now field selector should list event-specific fields (30 for purchase)
    await page.getByRole("textbox", { name: "Выберите поле" }).click();
    await page.waitForTimeout(300);
    const optionsAfter = await page.getByRole("option").count();
    expect(optionsAfter).toBeGreaterThanOrEqual(10);
    await page.keyboard.press("Escape");
  });

  test("L3: pagination appears and URL updates for fields with many distinct values", async ({ page }) => {
    // @generated by /qa-write L3
    await page.goto("/statistics/field");
    await page.waitForLoadState("networkidle");

    // Switch to Event tab → purchase → Customer Primary ID (55209 distinct values)
    await page.getByRole("tab", { name: "Поля схемы событий" }).click();
    await page.waitForTimeout(400);
    await page.getByRole("textbox", { name: "Выберите тип события" }).click();
    await page.waitForTimeout(300);
    await page.getByRole("option", { name: "purchase", exact: true }).click();
    await page.waitForTimeout(300);
    await page.getByRole("textbox", { name: "Выберите поле" }).click();
    await page.waitForTimeout(400);
    await page.getByRole("option", { name: "Customer Primary ID", exact: true }).click();
    await page.waitForLoadState("networkidle");
    await waitForNonZeroTotal(page);

    // URL should include ?page=1
    expect(page.url()).toContain("?page=1");

    // Total count should be very large
    const totalContainer = page.getByText("Всего:", { exact: true }).locator("..");
    const fullText = await totalContainer.textContent();
    const match = (fullText ?? "").match(/(\d+)$/);
    expect(parseInt(match![1], 10)).toBeGreaterThan(1000);

    // Pagination buttons should be visible
    await expect(page.getByRole("button", { name: "2", exact: true })).toBeVisible();
  });

  test("L3: pagination page 2 shows different rows from page 1", async ({ page }) => {
    // @generated by /qa-write L3
    await page.goto("/statistics/field");
    await page.waitForLoadState("networkidle");

    await page.getByRole("tab", { name: "Поля схемы событий" }).click();
    await page.waitForTimeout(400);
    await page.getByRole("textbox", { name: "Выберите тип события" }).click();
    await page.waitForTimeout(300);
    await page.getByRole("option", { name: "purchase", exact: true }).click();
    await page.waitForTimeout(300);
    await page.getByRole("textbox", { name: "Выберите поле" }).click();
    await page.waitForTimeout(400);
    await page.getByRole("option", { name: "Customer Primary ID", exact: true }).click();
    await page.waitForLoadState("networkidle");
    await waitForNonZeroTotal(page);

    const page1Rows = await getVizRows(page);
    const page1FirstValue = page1Rows[0]?.value;

    // Navigate to page 2
    await page.getByRole("button", { name: "2", exact: true }).click();
    await page.waitForLoadState("networkidle");
    await page.waitForTimeout(500);

    expect(page.url()).toContain("?page=2");

    const page2Rows = await getVizRows(page);
    const page2FirstValue = page2Rows[0]?.value;
    expect(page2Rows.length).toBeGreaterThan(0);
    // Page 2 rows must differ from page 1 rows
    expect(page2FirstValue).not.toBe(page1FirstValue);
  });
});

// @generated by /qa-write L4
test.describe("Field Statistics — L4 Edge Cases", () => {
  test("L4: no console errors on page load and during normal field selection", async ({ page }) => {
    // @generated by /qa-write L4
    const consoleErrors: string[] = [];
    page.on("console", (msg) => {
      if (msg.type() === "error") consoleErrors.push(msg.text());
    });

    await page.goto("/statistics/field");
    await page.waitForLoadState("networkidle");

    await page.getByRole("textbox", { name: "Выберите поле" }).click();
    await page.waitForTimeout(400);
    await page.getByRole("option", { name: "Gender", exact: true }).click();
    await page.waitForLoadState("networkidle");
    await page.waitForTimeout(2000);

    expect(consoleErrors).toHaveLength(0);
  });

  test("L4: tab switch resets field selection and shows empty state", async ({ page }) => {
    // @generated by /qa-write L4
    await page.goto("/statistics/field");
    await page.waitForLoadState("networkidle");

    // Select Gender → data appears
    await page.getByRole("textbox", { name: "Выберите поле" }).click();
    await page.waitForTimeout(400);
    await page.getByRole("option", { name: "Gender", exact: true }).click();
    await page.waitForLoadState("networkidle");
    await page.waitForFunction(
      () => {
        const all = [...document.querySelectorAll("p")];
        const vsego = all.find((p) => p.textContent?.trim() === "Всего:");
        return vsego?.parentElement?.textContent?.replace("Всего:", "").trim() !== "0";
      },
      { timeout: 10000 }
    );

    // Switch to Event Schema tab
    await page.getByRole("tab", { name: "Поля схемы событий" }).click();
    await page.waitForTimeout(500);

    // Field selector should be cleared
    const fieldValue = await page.getByRole("textbox", { name: "Выберите поле" }).inputValue();
    expect(fieldValue).toBe("");

    // Total should reset to 0
    const totalContainer = page.getByText("Всего:", { exact: true }).locator("..");
    await expect(totalContainer).toHaveText(/Всего:\s*0/);

    // Empty state message should reappear
    await expect(page.getByText("Выберите поле для просмотра значений")).toBeVisible();
  });

  test("L4: switching back to customer tab after visiting event tab also resets state", async ({ page }) => {
    // @generated by /qa-write L4
    await page.goto("/statistics/field");
    await page.waitForLoadState("networkidle");

    // Select Gender
    await page.getByRole("textbox", { name: "Выберите поле" }).click();
    await page.waitForTimeout(400);
    await page.getByRole("option", { name: "Gender", exact: true }).click();
    await page.waitForLoadState("networkidle");
    await page.waitForTimeout(1500);

    // Go to Event tab then back to Customer tab
    await page.getByRole("tab", { name: "Поля схемы событий" }).click();
    await page.waitForTimeout(300);
    await page.getByRole("tab", { name: "Поля схемы клиента" }).click();
    await page.waitForTimeout(400);

    // Previous Gender selection should NOT be restored
    const fieldValue = await page.getByRole("textbox", { name: "Выберите поле" }).inputValue();
    expect(fieldValue).toBe("");

    // Empty state should be visible again
    await expect(page.getByText("Выберите поле для просмотра значений")).toBeVisible();
  });

  test("L4: duplicate 'Customers yearly income' entry exists in customer field dropdown (BUG-031)", async ({ page }) => {
    // @generated by /qa-write L4
    // Documents a known data quality issue: the field appears twice in the dropdown
    await page.goto("/statistics/field");
    await page.waitForLoadState("networkidle");

    await page.getByRole("textbox", { name: "Выберите поле" }).click();
    await page.waitForTimeout(500);

    const allOptions = await page.getByRole("option").allInnerTexts();
    const duplicateCount = allOptions.filter((o) => o === "Customers yearly income").length;

    // This test documents the current (buggy) state: 2 identical entries exist.
    // Expected: 1 entry. Actual: 2 entries. See BUG-031.
    expect(duplicateCount).toBe(2);

    await page.keyboard.press("Escape");
  });

  test("L4: rapid tab switching does not crash the page", async ({ page }) => {
    // @generated by /qa-write L4
    await page.goto("/statistics/field");
    await page.waitForLoadState("networkidle");

    // Switch tabs rapidly 6 times
    for (let i = 0; i < 3; i++) {
      await page.getByRole("tab", { name: "Поля схемы событий" }).click();
      await page.waitForTimeout(80);
      await page.getByRole("tab", { name: "Поля схемы клиента" }).click();
      await page.waitForTimeout(80);
    }

    // Page should still be intact
    await expect(page.getByText("Статистика полей").first()).toBeVisible();
    await expect(page.getByRole("tab", { name: "Поля схемы клиента" })).toHaveAttribute("aria-selected", "true");
    await expect(page.getByText("Выберите поле для просмотра значений")).toBeVisible();
  });

  test("L4: navigating directly to ?page=1 without field selected shows empty state (not crash)", async ({ page }) => {
    // @generated by /qa-write L4
    // Edge case: user lands on a URL that has a page param but no field is selected
    await page.goto("/statistics/field?page=1");
    await page.waitForLoadState("networkidle");
    await page.waitForTimeout(500);

    // Should gracefully show empty state, not an error
    await expect(page.getByText("Выберите поле для просмотра значений")).toBeVisible();
    const totalContainer = page.getByText("Всего:", { exact: true }).locator("..");
    await expect(totalContainer).toHaveText(/Всего:\s*0/);
    // Page heading should still render
    await expect(page.getByText("Статистика полей").first()).toBeVisible();
  });

  test("L4: 11 event types are available in the event type selector", async ({ page }) => {
    // @generated by /qa-write L4
    await page.goto("/statistics/field");
    await page.waitForLoadState("networkidle");

    await page.getByRole("tab", { name: "Поля схемы событий" }).click();
    await page.waitForTimeout(400);
    await page.getByRole("textbox", { name: "Выберите тип события" }).click();
    await page.waitForTimeout(400);

    const eventTypes = await page.getByRole("option").allTextContents();
    expect(eventTypes.length).toBe(11);
    expect(eventTypes).toContain("purchase");
    expect(eventTypes).toContain("login");
    expect(eventTypes).toContain("add_to_cart");

    await page.keyboard.press("Escape");
  });
});
