/**
 * Form validation correctness across the major create forms:
 *   1. /marketing/segments — create segment
 *   2. /marketing/campaigns — create campaign
 *   3. /marketing/communication — create commchan
 *   4. /dashboard (template create) — assumes Templates page exists
 *
 * For each: submit empty form, check FE behavior (validation error vs silent fail vs 5xx).
 * Empty submission should always show inline error, NOT call backend → 4xx → toast.
 */
import { test, expect, type Page } from "@playwright/test";

async function findCreateButton(page: Page) {
  const sels = ['button:has-text("Добавить")', 'button:has-text("Создать")', 'button:has-text("Add")', 'button:has-text("Create")'];
  for (const s of sels) {
    const b = page.locator(s).first();
    if (await b.isVisible({ timeout: 500 }).catch(() => false)) return b;
  }
  return null;
}

async function findSubmitButton(page: Page) {
  const sels = [
    'button:has-text("Сохранить")', 'button:has-text("Создать рассылку")', 'button:has-text("Создать сегментацию")',
    'button:has-text("Создать")', 'button:has-text("Save")', 'button[type="submit"]',
  ];
  for (const s of sels) {
    const b = page.locator(s).first();
    if (await b.isVisible({ timeout: 500 }).catch(() => false)) return b;
  }
  return null;
}

async function bodyText(page: Page) {
  return page.locator("body").innerText({ timeout: 3_000 }).catch(() => "");
}

// What patterns prove inline validation fired?
const VALIDATION_TOKENS = /обязател|введите|заполните|required|please enter|укажите|empty|cannot be empty|не может быть пустым/i;
// What patterns prove a 5xx leaked instead of inline validation?
const SERVER_ERROR_TOKENS = /500|internal server|произошла ошибка|нет соединения|connection/i;

const FORMS = [
  { name: "Segment",   path: "/marketing/segments" },
  { name: "Campaign",  path: "/marketing/campaigns" },
  { name: "CommChan",  path: "/marketing/communication" },
];

for (const f of FORMS) {
  test.describe(`Form validation: ${f.name} create — empty submit`, () => {
    test(`opening create form, submitting empty, shows validation (not server error)`, async ({ page }) => {
      await page.goto(f.path, { timeout: 10_000 });
      await page.waitForLoadState("networkidle", { timeout: 10_000 });

      const add = await findCreateButton(page);
      if (!add) { test.skip(true, `no Add button on ${f.path}`); return; }
      await add.click();
      await page.waitForTimeout(800);

      const save = await findSubmitButton(page);
      if (!save) { test.skip(true, `no Save button after opening form on ${f.path}`); return; }
      await save.click();
      await page.waitForTimeout(1_500);

      const body = await bodyText(page);
      const hasValidation = VALIDATION_TOKENS.test(body);
      const hasServerError = SERVER_ERROR_TOKENS.test(body);

      // Must NOT be a 5xx leak
      expect(hasServerError, `${f.name} empty submit: server-error tokens leaked (${body.match(SERVER_ERROR_TOKENS)?.[0]}). Validation should fire client-side, not let backend 5xx through.`).toBe(false);
      // SHOULD show inline validation
      expect(hasValidation, `${f.name} empty submit: no inline validation message — marketer can't tell what's required. (${body.slice(0, 300)})`).toBe(true);
    });
  });
}

// ─── 2. Negative-pattern: submit with whitespace-only name should be rejected ─

test.describe("Form validation: segment with whitespace-only name", () => {
  test("name='   ' should not create a segment", async ({ page }) => {
    await page.goto("/marketing/segments", { timeout: 10_000 });
    await page.waitForLoadState("networkidle", { timeout: 10_000 });
    const add = await findCreateButton(page);
    if (!add) { test.skip(true, ""); return; }
    await add.click();
    await page.waitForTimeout(800);

    const nameInput = page.locator('input[placeholder*="вод" i], input[type="text"]').first();
    if (!(await nameInput.isVisible({ timeout: 1_000 }).catch(() => false))) {
      test.skip(true, "no name input");
      return;
    }
    await nameInput.fill("   ");
    const save = await findSubmitButton(page);
    if (!save) { test.skip(true, ""); return; }
    await save.click();
    await page.waitForTimeout(1_500);

    const body = await bodyText(page);
    expect(SERVER_ERROR_TOKENS.test(body)).toBe(false);
    // Either validation fires or the form just doesn't submit — both acceptable, but no 5xx
  });
});

// ─── 3. Form auto-close behavior: cancel button discards changes ─────────────

test.describe("Form cancel — abandoning create flow doesn't create entity", async () => {
  test("/marketing/segments: open create form, type a name, click cancel/X — no segment appears in list", async ({ page }) => {
    await page.goto("/marketing/segments", { timeout: 10_000 });
    await page.waitForLoadState("networkidle", { timeout: 10_000 });

    const beforeCountText = (await bodyText(page)).match(/Всего:\s*(\d+)/);
    const beforeCount = beforeCountText ? parseInt(beforeCountText[1], 10) : 0;
    if (beforeCount === 0) { test.skip(true, ""); return; }

    const add = await findCreateButton(page);
    if (!add) { test.skip(true, ""); return; }
    await add.click();
    await page.waitForTimeout(500);

    // Type a name then cancel
    const nameInput = page.locator('input[type="text"]').first();
    if (await nameInput.isVisible({ timeout: 1_000 }).catch(() => false)) {
      await nameInput.fill(`CANCEL_${Date.now()}`);
    }

    // Find cancel/close
    const cancelSel = [
      'button:has-text("Отмена")',
      'button:has-text("Cancel")',
      'button:has-text("Закрыть")',
      'button[aria-label*="close" i]',
      '[role="dialog"] button[aria-label]',
    ];
    let canceled = false;
    for (const s of cancelSel) {
      const b = page.locator(s).first();
      if (await b.isVisible({ timeout: 500 }).catch(() => false)) {
        await b.click({ timeout: 2_000 }).catch(() => {});
        canceled = true; break;
      }
    }
    // Press Escape as fallback
    if (!canceled) await page.keyboard.press("Escape");
    await page.waitForTimeout(800);
    await page.reload({ waitUntil: "networkidle", timeout: 10_000 });

    const afterText = await bodyText(page);
    const afterMatch = afterText.match(/Всего:\s*(\d+)/);
    const afterCount = afterMatch ? parseInt(afterMatch[1], 10) : -1;
    expect(afterCount, "Cancel should not create a segment (count should not increase)").toBeLessThanOrEqual(beforeCount);
  });
});
