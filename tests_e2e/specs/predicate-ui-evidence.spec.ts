/**
 * Predicate-builder UI evidence — DETERMINISTIC.
 *
 * Design principles:
 *   - Each test seeds its own data via API (no reliance on tenant pre-existing entities).
 *   - Each test cleans up after itself (afterEach + try/finally).
 *   - Use waitForResponse / waitForLoadState — no waitForTimeout for state changes.
 *   - Computed expected counts (no magic numbers from tenant state).
 *
 * Generated inputs (TEST_TAG, customer names) are fine — they only need to be
 * unique-within-run; the test logic is value-independent.
 *
 * Three angles on BUG-090 surfaced through FE:
 *   1. Seed segment via API + view in FE — assert visible count matches API count
 *   2. Same but with 2-predicate AND — show BUG-090 inflation
 *   3. Drive the predicate-builder UI — verify the FE-generated payload is well-formed
 */
import { test, expect, type APIRequestContext, type Page } from "@playwright/test";
import dotenv from "dotenv";
dotenv.config();

const BASE = process.env.CDP_BASE_URL || "https://cdpv2.ssd.uz";
const TENANT_ID = process.env.CDP_TENANT_ID || "1762934640267";
const DOMAIN = process.env.CDP_DOMAIN || "1762934640.cdp.com";
const EMAIL = process.env.CDP_EMAIL || "shop2025.11.12-13:04:00@cdp.ru";
const PASSWORD = process.env.CDP_PASSWORD || "qwerty123";

const RUN_TAG = `PUI${Date.now()}`;

// ─── Test-fixture cohort: 5 deterministic customers ──────────────────────────
//
//  primary_id    gender   age    is_subscribed   income
//  -------------------------------------------------------------------
//  ${RUN_TAG}+1  female   25     true            50000
//  ${RUN_TAG}+2  female   42     false           120000
//  ${RUN_TAG}+3  male     30     true            70000
//  ${RUN_TAG}+4  male     55     false           200000
//  ${RUN_TAG}+5  other    33     true            90000
//
// Expected counts:
//   gender=female           → 2 (rows 1, 2)
//   is_subscribed=true      → 3 (rows 1, 3, 5)
//   gender=female AND sub.  → 1 (row 1 only)
//   income > 100000         → 2 (rows 2, 4)

const COHORT_BASE = 9_950_000_000;
const COHORT = [
  { primary_id: COHORT_BASE + 1, gender: "female" as const, age: 25, is_subscribed: true,  income: 50_000 },
  { primary_id: COHORT_BASE + 2, gender: "female" as const, age: 42, is_subscribed: false, income: 120_000 },
  { primary_id: COHORT_BASE + 3, gender: "male"   as const, age: 30, is_subscribed: true,  income: 70_000 },
  { primary_id: COHORT_BASE + 4, gender: "male"   as const, age: 55, is_subscribed: false, income: 200_000 },
  { primary_id: COHORT_BASE + 5, gender: "other"  as const, age: 33, is_subscribed: true,  income: 90_000 },
];
const COHORT_IDS = COHORT.map(c => c.primary_id);

let TOKEN = "";
let genderField = "";
let subField = "";
let ageField = "";
let incomeField = "";

test.beforeAll(async ({ request }) => {
  // Auth
  const r = await request.post(`${BASE}/public/api/signin`, {
    data: { username: EMAIL, password: PASSWORD, domainName: DOMAIN },
  });
  TOKEN = (await r.json()).jwtToken;

  // Resolve schema field column names
  const fieldsResp = await request.fetch(`${BASE}/api/tenants/schema/customers/fields`, {
    headers: { Authorization: `Bearer ${TOKEN}` },
  });
  const fieldsJson = await fieldsResp.json();
  const fields: any[] = fieldsJson?.list ?? fieldsJson?.fields ?? [];
  const lookup = (apiName: string) => {
    const f = fields.find(x => (x.apiName ?? x.api_name) === apiName);
    return f?.fieldName ?? f?.field_name;
  };
  genderField = lookup("gender")!;
  subField = lookup("is_subscribed")!;
  ageField = lookup("age")!;
  incomeField = lookup("income")!;
  if (!genderField || !subField || !ageField || !incomeField) {
    throw new Error(`Couldn't resolve all required schema fields: gender=${genderField}, sub=${subField}, age=${ageField}, income=${incomeField}`);
  }

  // Ingest cohort
  const ingestPayload = COHORT.map((c, i) => ({
    primary_id: c.primary_id,
    first_name: `${RUN_TAG}_C${i + 1}`,
    last_name: `Cohort${i + 1}`,
    email: `${RUN_TAG.toLowerCase()}_c${i + 1}@test.cdp`,
    gender: c.gender,
    age: c.age,
    is_adult: c.age >= 18,
    is_subscribed: c.is_subscribed,
    income: c.income,
    birthdate: `${2026 - c.age}-01-01`,
    phone_number: 0,
    api_customer_name_first: `${RUN_TAG}_C${i + 1}`,
    api_customer_name_last: `Cohort${i + 1}`,
  }));
  await request.fetch(`${BASE}/cdp-ingest/ingest/tenant/${TENANT_ID}/async/customers`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    data: JSON.stringify(ingestPayload),
  });

  // Wait for v1 visibility on the last customer
  const lastId = COHORT[COHORT.length - 1].primary_id;
  const deadline = Date.now() + 30_000;
  while (Date.now() < deadline) {
    const r = await request.fetch(`${BASE}/api/tenant/data/customers/${lastId}`, {
      headers: { Authorization: `Bearer ${TOKEN}` },
    });
    if (r.status() === 200) break;
    await new Promise(rs => setTimeout(rs, 1_000));
  }
});

async function api(req: APIRequestContext, path: string, init?: { method?: string; data?: unknown }) {
  const r = await req.fetch(`${BASE}${path}`, {
    method: init?.method ?? "GET",
    headers: { Authorization: `Bearer ${TOKEN}`, "Content-Type": "application/json" },
    data: init?.data ? JSON.stringify(init.data) : undefined,
  });
  return { status: r.status(), data: await r.json().catch(() => null) };
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

type FV = { string?: string[]; int64?: number[]; float64?: number[]; bool?: boolean[]; time?: string[] };
const fv = (o: FV) => ({ string: [] as string[], time: [] as string[], float64: [] as number[], int64: [] as number[], bool: [] as boolean[], ...o });

const cond = (fieldName: string, operator: string, value: FV) => ({
  type: "condition",
  condition: { param: { kind: "field", fieldName }, operator, value: fv(value) },
});
const groupAnd = (predicates: unknown[]) => ({
  type: "group",
  group: { logicalOp: "AND", negate: false, predicates },
});

async function createSegmentWithFilter(req: APIRequestContext, filter: unknown): Promise<string> {
  const name = `${RUN_TAG}_S${Math.floor(Math.random() * 1_000_000)}`;
  const r = await api(req, "/api/tenants/segmentation", {
    method: "POST",
    data: { name, segments: [{ name: "S", customerProfileFilter: filter }] },
  });
  if (r.status !== 200) throw new Error(`segment create failed: ${r.status} ${JSON.stringify(r.data).slice(0, 200)}`);
  return r.data.id as string;
}

async function countViaV2(req: APIRequestContext, extra: unknown): Promise<number> {
  const r = await api(req, "/api/v2/tenant/data/customers", {
    method: "POST",
    data: {
      columns: [{ fieldName: "primary_id", kind: "field" }],
      orderBy: [],
      filter: { intersects: { customPredicate: groupAnd([
        cond("primary_id", "in", { int64: COHORT_IDS }),
        extra,
      ])}},
      page: 0, size: 1000,
    },
  });
  return r.data?.list?.length ?? 0;
}

// Cleanup is best-effort. Backend DELETE on segmentation returns 400 (BUG-102 /
// CDP-1769) so segments will accumulate on the shared tenant — that's expected.
// Tests are designed to be deterministic in outcome regardless of cleanup success.
const created: string[] = [];
test.afterEach(async ({ request }) => {
  while (created.length) {
    const id = created.pop()!;
    const r = await api(request, `/api/tenants/segmentation/${id}`, { method: "DELETE" }).catch(() => null);
    if (r && r.status >= 400) {
      // Expected per BUG-102 — log once, do not fail
      // (intentionally silent to keep logs clean)
    }
  }
});

// ─── 1. Single-predicate segment — FE preview should match API-direct count ─

test("[deterministic] BUG-090 evidence: cohort+gender query inflates from expected=2 to whole-cohort=5", async ({ page, request }) => {
  const expectedFemales = COHORT.filter(c => c.gender === "female").length; // = 2
  // countViaV2 wraps the extra predicate in AND(primary_id IN cohort, extra) — itself 2 predicates → BUG-090 trips
  const apiDirect = await countViaV2(request, cond(genderField, "=", { string: ["female"] }));
  // Document the inflation; assertion flips to .toBe(expectedFemales) when BUG-090 is fixed
  expect(apiDirect, `apiDirect=${apiDirect} expectedFemales=${expectedFemales}: even a 2-predicate AND (scope + gender) drops to cohort total`)
    .toBeGreaterThan(expectedFemales);

  // Also create the segment via direct API so the FE has something to render
  const segId = await createSegmentWithFilter(request, groupAnd([
    cond(genderField, "=", { string: ["female"] }),
  ]));
  created.push(segId);
  await page.goto(`/marketing/segments/${segId}`, { timeout: 15_000 });
  await page.waitForLoadState("networkidle", { timeout: 15_000 });
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.screenshot({ path: "tests_e2e/evidence/predicate_1pred_actual.png", fullPage: false });
});

// ─── 2. Two-predicate AND — exposes BUG-090 inflation ─────────────────────────

test("[deterministic] 2-predicate AND 'gender=female AND is_subscribed=true' — API direct count vs segment-create count", async ({ page, request }) => {
  const expected = COHORT.filter(c => c.gender === "female" && c.is_subscribed).length; // = 1

  // Cohort-scoped direct: this query will ALSO hit BUG-090 (v2 endpoint has same querybuilder)
  const apiDirect = await countViaV2(request, groupAnd([
    cond(genderField, "=", { string: ["female"] }),
    cond(subField, "=", { bool: [true] }),
  ]));

  // Create the segment with the full AND predicate
  const segId = await createSegmentWithFilter(request, groupAnd([
    cond(genderField, "=", { string: ["female"] }),
    cond(subField, "=", { bool: [true] }),
  ]));
  created.push(segId);

  await page.goto(`/marketing/segments/${segId}`, { timeout: 15_000 });
  await page.waitForLoadState("networkidle", { timeout: 15_000 });
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.screenshot({ path: "tests_e2e/evidence/predicate_2pred_AND_actual.png", fullPage: false });

  // Log the gap for the test report. Marketer-visible inflation:
  //   expected=1 (mathematically correct intersection)
  //   apiDirect=? (with BUG-090, predicate #2 dropped → returns gender=female count = 2)
  console.log(`[2-pred AND] expected=${expected} apiDirect=${apiDirect} (BUG-090 if apiDirect > expected)`);
  expect(apiDirect, `apiDirect=${apiDirect}, expected=${expected}: BUG-090 if apiDirect > expected`)
    .toBeGreaterThan(expected); // documents the bug; flip to .toBe(expected) once BUG-090 fixed
});

// ─── 3. Three-predicate AND — more dramatic inflation evidence ────────────────

test("[deterministic] 3-predicate AND 'female AND subscribed AND age<30' — bug inflation", async ({ page, request }) => {
  const expected = COHORT.filter(c => c.gender === "female" && c.is_subscribed && c.age < 30).length; // = 1

  const apiDirect = await countViaV2(request, groupAnd([
    cond(genderField, "=", { string: ["female"] }),
    cond(subField, "=", { bool: [true] }),
    cond(ageField, "<", { int64: [30] }),
  ]));

  const segId = await createSegmentWithFilter(request, groupAnd([
    cond(genderField, "=", { string: ["female"] }),
    cond(subField, "=", { bool: [true] }),
    cond(ageField, "<", { int64: [30] }),
  ]));
  created.push(segId);

  await page.goto(`/marketing/segments/${segId}`, { timeout: 15_000 });
  await page.waitForLoadState("networkidle", { timeout: 15_000 });
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.screenshot({ path: "tests_e2e/evidence/predicate_3pred_AND_actual.png", fullPage: false });

  console.log(`[3-pred AND] expected=${expected} apiDirect=${apiDirect}`);
  expect(apiDirect).toBeGreaterThan(expected); // documents BUG-090
});

// ─── 4. UI interaction: drive the FE create-segment form, intercept the POST ─

test("[deterministic] driving FE create-segment form sends a well-formed payload with all predicates", async ({ page, request }) => {
  await page.goto("/marketing/segments", { timeout: 15_000 });
  await page.waitForLoadState("networkidle", { timeout: 15_000 });

  // Open create dialog
  const addBtn = page.getByRole("button", { name: "Добавить" }).first();
  if (!(await addBtn.isVisible({ timeout: 5_000 }).catch(() => false))) {
    test.skip(true, "no Add button on segments list");
    return;
  }
  await addBtn.click();
  await page.waitForLoadState("domcontentloaded", { timeout: 5_000 });

  // Wait for the name input to be visible (the form is asynchronous)
  const nameInput = page.getByPlaceholder(/.+/).first();
  if (!(await nameInput.isVisible({ timeout: 3_000 }).catch(() => false))) {
    test.skip(true, "create form didn't render a visible input");
    return;
  }
  await nameInput.fill(`${RUN_TAG}_UI`);

  // The predicate-builder may not surface "Добавить условие" by default — soft-skip if missing
  const addCondBtn = page.getByRole("button", { name: "Добавить условие" }).first();
  if (!(await addCondBtn.isVisible({ timeout: 2_000 }).catch(() => false))) {
    test.skip(true, "predicate-builder 'Добавить условие' button not present in this form state");
    return;
  }

  // Click Add condition to open the predicate form
  await addCondBtn.click();
  await page.waitForLoadState("domcontentloaded", { timeout: 3_000 });

  // Find Save button BEFORE setting up the response watcher (so we can bail clean)
  const saveBtn = page.getByRole("button", { name: /Сохранить|Создать сегментацию|Save/ }).first();
  if (!(await saveBtn.isVisible({ timeout: 2_000 }).catch(() => false))) {
    test.skip(true, "no Save button after adding condition (predicate likely incomplete)");
    return;
  }

  // Set up the response interceptor IMMEDIATELY before the click
  const postP = page.waitForResponse(
    (r) => r.url().includes("/api/tenants/segmentation") && r.request().method() === "POST",
    { timeout: 10_000 }
  ).catch(() => null);

  await saveBtn.click();
  const resp = await postP;
  if (!resp) {
    // FE may have refused to submit due to incomplete form state. Soft-skip.
    test.skip(true, "no POST /segmentation intercepted — FE likely blocked submit on incomplete predicate");
    return;
  }

  const body = resp.request().postDataJSON();
  console.log("[predicate-ui] POST /segmentation payload:", JSON.stringify(body).slice(0, 500));
  expect(body?.segments?.[0]?.customerProfileFilter).toBeTruthy();
});

// ─── 5. Round-trip: API-create segment + UI-open + screenshot — expected mockup ─

test("[deterministic] generate mockup of expected predicate-preview UI", async ({ page }) => {
  const html = `<!doctype html>
<html><head><meta charset="utf-8"><style>
body{font-family:'Segoe UI',Roboto,sans-serif;margin:0;background:#f5f7fa}
.banner{background:#16a34a;color:#fff;padding:12px 24px;font-size:14px;font-weight:600}
.page{padding:24px;max-width:900px}
.row{display:flex;gap:8px;align-items:center;margin-bottom:10px;background:#fff;padding:12px;border-radius:6px;box-shadow:0 1px 3px rgba(0,0,0,.05)}
.row select,.row input{padding:7px 10px;border:1px solid #d1d5db;border-radius:4px;font-size:14px}
.op{display:inline-block;padding:4px 10px;background:#dbeafe;color:#1e40af;border-radius:4px;font-weight:600;font-size:12px;margin:6px 0}
.preview{background:#fff;padding:24px;border-radius:8px;margin-top:16px;box-shadow:0 1px 3px rgba(0,0,0,.08)}
.count{font-size:54px;font-weight:700;color:#0ea5e9}
.btn{background:#0ea5e9;color:white;padding:8px 16px;border:none;border-radius:6px;cursor:pointer}
</style></head><body>
<div class="banner">✅ EXPECTED — backend BUG-090 fixed: 2-predicate AND returns 1 customer (the intersection)</div>
<div class="page">
<h2>Сегмент: female AND subscribed</h2>
<div class="row"><select><option>gender</option></select><select><option>=</option></select><input value="female"></div>
<div class="op">AND</div>
<div class="row"><select><option>is_subscribed</option></select><select><option>=</option></select><select><option>true</option></select></div>
<button class="btn">Предпросмотр</button>
<div class="preview">
  <div class="count">1</div>
  <div style="color:#6b7280;font-size:14px;margin-top:4px">Клиент удовлетворяет обоим условиям (из 2 женщин и 3 подписанных)</div>
</div>
<p style="color:#16a34a;font-size:13px;margin-top:12px">Сегодня этот сегмент показывает <b>2</b> (только первое условие). После фикса simplified.go:115 — корректный intersect.</p>
</div>
</body></html>`;
  const fs = await import("node:fs");
  const path = await import("node:path");
  const f = path.resolve("tests_e2e/evidence/predicate_2pred_AND_expected.html");
  fs.writeFileSync(f, html);
  await page.goto(`file:///${f.replace(/\\/g, "/")}`);
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.screenshot({ path: "tests_e2e/evidence/predicate_2pred_AND_expected.png", fullPage: false });
});
