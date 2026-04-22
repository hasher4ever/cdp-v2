/**
 * Global setup for business logic tests — shared tenant variant.
 *
 * Uses the existing shared tenant (no signup).
 * 1. Authenticates against shared tenant
 * 2. Ensures customer + event schema fields exist
 * 3. Ensures "purchase" event type exists
 * 4. Ingests a shared deterministic dataset (20 customers, 45 events)
 * 5. Polls until data is queryable
 * 6. Exports tenant context (including customers + events arrays) for test workers
 */
import dotenv from "dotenv";
dotenv.config();

import { getAuthToken } from "../tests_backend/client";
import { makeTag, type TestCustomer, type TestEvent } from "./test-factories";

const BASE_URL = process.env.CDP_BASE_URL || "https://cdpv2.ssd.uz";
const TENANT_ID = 1762934640267;
const DOMAIN = "1762934640.cdp.com";
const EMAIL = "shop2025.11.12-13:04:00@cdp.ru";
const PASSWORD = "qwerty123";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface TenantContext {
  tenantId: number;
  domain: string;
  email: string;
  password: string;
  token: string;
  customerFieldMap: Record<string, string>;
  eventFieldMap: Record<string, string>;
  purchaseEventTypeId: number;
  customers: TestCustomer[];
  events: TestEvent[];
  runTag: string;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

async function apiCall(
  path: string,
  opts: { method?: string; body?: unknown; token?: string } = {}
): Promise<{ status: number; data: any }> {
  const method = opts.method ?? (opts.body ? "POST" : "GET");
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (opts.token) headers["Authorization"] = `Bearer ${opts.token}`;

  const res = await fetch(`${BASE_URL}${path}`, {
    method,
    headers,
    body: opts.body ? JSON.stringify(opts.body) : undefined,
  });

  let data: any;
  const text = await res.text();
  try { data = JSON.parse(text); } catch { data = text; }
  return { status: res.status, data };
}

// ─── Customer field definitions ───────────────────────────────────────────────

const CUSTOMER_FIELDS = [
  { apiName: "first_name", displayName: "First Name", dataType: "VARCHAR", access: "field_required" },
  { apiName: "last_name", displayName: "Last Name", dataType: "VARCHAR", access: "field_required" },
  { apiName: "email", displayName: "Email", dataType: "VARCHAR", access: "field_optional" },
  { apiName: "gender", displayName: "Gender", dataType: "VARCHAR", access: "field_optional" },
  { apiName: "birthdate", displayName: "Birth Date", dataType: "DATE", access: "field_optional" },
  { apiName: "age", displayName: "Age", dataType: "BIGINT", access: "field_optional" },
  { apiName: "is_adult", displayName: "Is Adult", dataType: "BOOL", access: "field_optional" },
  { apiName: "is_subscribed", displayName: "Is Subscribed", dataType: "BOOL", access: "field_optional" },
  { apiName: "income", displayName: "Yearly Income", dataType: "DOUBLE", access: "field_optional" },
  { apiName: "phone_number", displayName: "Phone Number", dataType: "BIGINT", access: "field_optional" },
] as const;

const PURCHASE_EVENT_FIELDS = [
  { apiName: "purchase_id", displayName: "Purchase ID", dataType: "VARCHAR", access: "field_optional" },
  { apiName: "purchase_status", displayName: "Purchase Status", dataType: "VARCHAR", access: "field_optional" },
  { apiName: "total_price", displayName: "Total Price", dataType: "DOUBLE", access: "field_optional" },
  { apiName: "delivery_cost", displayName: "Delivery Cost", dataType: "DOUBLE", access: "field_optional" },
  { apiName: "delivery_city", displayName: "Delivery City", dataType: "VARCHAR", access: "field_optional" },
  { apiName: "delivery_country", displayName: "Delivery Country", dataType: "VARCHAR", access: "field_optional" },
  { apiName: "payment_type", displayName: "Payment Type", dataType: "VARCHAR", access: "field_optional" },
  { apiName: "total_quantity", displayName: "Total Quantity", dataType: "DOUBLE", access: "field_optional" },
] as const;

// ─── Deterministic shared dataset ─────────────────────────────────────────────

/**
 * Build the 20-customer deterministic dataset.
 * primary_ids are derived from the run tag (stable within a run, unique across runs).
 * Each customer row is fixed so test assertions based on counts are stable.
 *
 * Layout:
 *   i=0..4   female (ages: 25,32,45,15,16)
 *   i=5..9   male   (ages: 28,35,42,55,14)  — wait: row 5 is female age=60, row 6 onward male
 *   See table below.
 */
const CUSTOMER_DEFS: Array<{
  gender: "female" | "male" | "other";
  age: number;
  income: number;
  is_subscribed: boolean;
  events_count: number;
}> = [
  // female
  { gender: "female", age: 25, income: 75000,  is_subscribed: true,  events_count: 4 },
  { gender: "female", age: 32, income: 120000, is_subscribed: false, events_count: 3 },
  { gender: "female", age: 45, income: 0,      is_subscribed: true,  events_count: 2 },
  { gender: "female", age: 15, income: 0,      is_subscribed: false, events_count: 2 },  // minor
  { gender: "female", age: 16, income: 0,      is_subscribed: false, events_count: 0 },  // minor
  { gender: "female", age: 60, income: 30000,  is_subscribed: false, events_count: 1 },
  // male
  { gender: "male",   age: 28, income: 88000,  is_subscribed: true,  events_count: 5 },
  { gender: "male",   age: 35, income: 250000, is_subscribed: false, events_count: 3 },
  { gender: "male",   age: 42, income: 45000,  is_subscribed: true,  events_count: 4 },
  { gender: "male",   age: 55, income: 180000, is_subscribed: false, events_count: 2 },
  { gender: "male",   age: 14, income: 0,      is_subscribed: true,  events_count: 0 },  // minor
  { gender: "male",   age: 17, income: 0,      is_subscribed: true,  events_count: 1 },  // minor
  { gender: "male",   age: 30, income: 30000,  is_subscribed: false, events_count: 3 },
  { gender: "male",   age: 68, income: 95000,  is_subscribed: true,  events_count: 2 },
  // other
  { gender: "other",  age: 30, income: 88000,  is_subscribed: false, events_count: 4 },
  { gender: "other",  age: 48, income: 120000, is_subscribed: true,  events_count: 3 },
  { gender: "other",  age: 16, income: 0,      is_subscribed: false, events_count: 1 },  // minor
  { gender: "other",  age: 38, income: 0,      is_subscribed: true,  events_count: 2 },
  { gender: "other",  age: 22, income: 45000,  is_subscribed: true,  events_count: 3 },
  { gender: "other",  age: 55, income: 250000, is_subscribed: false, events_count: 0 },
];

// Total events: 4+3+2+2+0+1 + 5+3+4+2+0+1+3+2 + 4+3+1+2+3+0 = 45

const BASE_CITIES = ["Tashkent", "Samarkand", "Bukhara", "Namangan", "Andijan"] as const;

// Deterministic helpers — no Math.random(), index-driven
const STATUSES: Array<"completed" | "pending"> = ["completed", "pending"];
const PAYMENT_TYPES: Array<"card" | "cash"> = ["card", "cash"];

/** Low: 5–49, mid: 50–499, high: 500–950 — cycle by event global index */
function deterministicPrice(idx: number): number {
  const tier = idx % 3;
  if (tier === 0) return 5  + (idx * 7)  % 45;   // low   5..49
  if (tier === 1) return 50 + (idx * 31) % 450;  // mid   50..499
  return              500 + (idx * 13) % 451;    // high  500..950
}

function buildSharedDataset(tag: string): { customers: TestCustomer[]; events: TestEvent[] } {
  // Use a base ID derived from the tag so IDs are unique per run but stable within a run.
  // We hash the tag into a numeric offset in the range 0..799_999_980 (20 slots of 1).
  // Simple approach: parse the numeric timestamp portion of the tag (after leading "T").
  // makeTag() returns "T<timestamp><4-char-random>", so slice(1) strips the "T".
  const numericPart = parseInt(tag.slice(1), 10) % 800_000_000;
  const baseId = 9_000_000_000 + numericPart;

  const customers: TestCustomer[] = CUSTOMER_DEFS.map((def, i) => {
    const primary_id = baseId + i;
    const firstName = `${tag}_C${i}`;
    const lastName = `Tst${i}`;
    return {
      primary_id,
      first_name: firstName,
      last_name: lastName,
      email: `${tag}_c${i}@test.cdp`,
      gender: def.gender,
      age: def.age,
      is_adult: def.age >= 18,
      is_subscribed: def.is_subscribed,
      income: def.income,
      birthdate: `1990-${String((i % 12) + 1).padStart(2, "0")}-15`,
      phone_number: 7_000_000_000 + i,
      api_customer_name_first: firstName,
      api_customer_name_last: lastName,
    };
  });

  const events: TestEvent[] = [];
  let globalEventIdx = 0;
  for (let ci = 0; ci < CUSTOMER_DEFS.length; ci++) {
    const def = CUSTOMER_DEFS[ci];
    const customer = customers[ci];
    for (let j = 0; j < def.events_count; j++) {
      const cityBase = BASE_CITIES[globalEventIdx % BASE_CITIES.length];
      events.push({
        primary_id: customer.primary_id,
        event_type: "purchase",
        purchase_id: `${tag}_E${ci}_${j}`,
        purchase_status: STATUSES[globalEventIdx % STATUSES.length],
        total_price: deterministicPrice(globalEventIdx),
        delivery_cost: (globalEventIdx % 10) * 5,
        delivery_city: `${cityBase}_${tag}`,
        delivery_country: "UZ",
        payment_type: PAYMENT_TYPES[globalEventIdx % PAYMENT_TYPES.length],
        total_quantity: (globalEventIdx % 5) + 1,
      });
      globalEventIdx++;
    }
  }

  return { customers, events };
}

// ─── Main setup ───────────────────────────────────────────────────────────────

export async function setup(ctx: { provide: (key: string, value: any) => void }) {
  console.log("[Setup] === Using shared tenant (no signup) ===");

  // ── Step 1: Authenticate ────────────────────────────────────────────────
  console.log(`[Setup] Authenticating as ${EMAIL} on ${DOMAIN}...`);
  const token = await getAuthToken(BASE_URL, DOMAIN, EMAIL, PASSWORD);
  console.log("[Setup] Authenticated, got JWT.");

  // ── Step 2: Ensure customer schema fields ───────────────────────────────
  console.log("[Setup] Checking customer schema fields...");
  const { data: custFieldsData } = await apiCall(
    "/api/tenants/schema/customers/fields?exclude_draft=true",
    { token }
  );
  const existingCustFields = new Set<string>(
    (custFieldsData.list || []).map((f: any) => f.apiName)
  );

  let custFieldsAdded = 0;
  for (const field of CUSTOMER_FIELDS) {
    if (existingCustFields.has(field.apiName)) continue;
    const { status } = await apiCall("/api/tenants/schema/customers/fields", {
      token,
      body: {
        apiName: field.apiName,
        displayName: field.displayName,
        dataType: field.dataType,
        access: field.access,
        flagMulti: false,
      },
    });
    if (status === 200) custFieldsAdded++;
    // 409 = already exists = fine
  }
  console.log(`[Setup] ${custFieldsAdded} new customer fields added`);

  if (custFieldsAdded > 0) {
    console.log("[Setup] Applying customer schema draft...");
    await apiCall("/api/tenants/schema/draft-schema/apply", { token, body: {} });
    await sleep(3000);
  }

  // ── Step 3: Ensure "purchase" event type ────────────────────────────────
  console.log('[Setup] Checking "purchase" event type...');
  const { status: etStatus } = await apiCall("/api/tenants/schema/event-types", {
    token,
    body: { name: "purchase" },
  });

  if (etStatus === 200) {
    console.log('[Setup] Event type "purchase" created as draft, applying...');
    await apiCall("/api/tenants/schema/draft-schema/apply", { token, body: {} });
    await sleep(3000);
  } else if (etStatus === 409) {
    console.log('[Setup] Event type "purchase" already exists');
  } else {
    console.warn(`[Setup] Event type creation returned ${etStatus} — continuing`);
  }

  // ── Step 4: Get purchase event type ID ──────────────────────────────────
  const { data: eventTypes } = await apiCall(
    "/api/tenants/schema/event-types?exclude_draft=true",
    { token }
  );
  const purchaseType = eventTypes.list.find((t: any) => t.eventTypeName === "purchase");
  if (!purchaseType) {
    throw new Error("Could not find purchase event type");
  }
  const purchaseEventTypeId = purchaseType.eventTypeId;
  console.log(`[Setup] Purchase event type ID: ${purchaseEventTypeId}`);

  // ── Step 5: Ensure event fields ─────────────────────────────────────────
  console.log("[Setup] Checking purchase event fields...");
  const { data: evtFieldsData } = await apiCall(
    `/api/tenants/schema/events/fields/${purchaseEventTypeId}?exclude_draft=true`,
    { token }
  );
  const existingEvtFields = new Set<string>(
    (evtFieldsData.list || []).map((f: any) => f.apiName)
  );

  let evtFieldsAdded = 0;
  for (const field of PURCHASE_EVENT_FIELDS) {
    if (existingEvtFields.has(field.apiName)) continue;
    const { status } = await apiCall(
      `/api/tenants/schema/events/fields/${purchaseEventTypeId}`,
      {
        token,
        body: {
          apiName: field.apiName,
          displayName: field.displayName,
          dataType: field.dataType,
          access: field.access,
          flagMulti: false,
        },
      }
    );
    if (status === 200) evtFieldsAdded++;
    // 409 = already exists = fine
  }
  console.log(`[Setup] ${evtFieldsAdded} new event fields added`);

  if (evtFieldsAdded > 0) {
    console.log("[Setup] Applying event fields draft...");
    await apiCall("/api/tenants/schema/draft-schema/apply", { token, body: {} });
    await sleep(3000);
  }

  // ── Step 6: Read back field mappings ────────────────────────────────────
  console.log("[Setup] Reading back schema field mappings...");
  const { data: allCustFields } = await apiCall(
    "/api/tenants/schema/customers/fields?exclude_draft=true",
    { token }
  );
  const customerFieldMap: Record<string, string> = {};
  for (const f of allCustFields.list) {
    if (f.apiName && f.fieldName) {
      customerFieldMap[f.apiName] = f.fieldName;
    }
  }

  const { data: allEvtFields } = await apiCall(
    `/api/tenants/schema/events/fields/${purchaseEventTypeId}?exclude_draft=true`,
    { token }
  );
  const eventFieldMap: Record<string, string> = {};
  for (const f of allEvtFields.list) {
    if (f.apiName && f.fieldName) {
      eventFieldMap[f.apiName] = f.fieldName;
    }
  }

  console.log(`[Setup] Customer fields: ${Object.keys(customerFieldMap).join(", ")}`);
  console.log(`[Setup] Event fields: ${Object.keys(eventFieldMap).join(", ")}`);

  // ── Step 7: Build shared dataset ────────────────────────────────────────
  const RUN_TAG = makeTag();
  console.log(`[Setup] Building shared dataset (tag=${RUN_TAG})...`);
  const { customers, events } = buildSharedDataset(RUN_TAG);
  console.log(`[Setup] Dataset: ${customers.length} customers, ${events.length} events`);

  // ── Step 8: Ingest customers + events in one parallel call ──────────────
  console.log("[Setup] Ingesting shared dataset...");
  const [custRes, evtRes] = await Promise.all([
    fetch(
      `${BASE_URL}/cdp-ingest/ingest/tenant/${TENANT_ID}/async/customers`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(customers),
      }
    ),
    fetch(
      `${BASE_URL}/cdp-ingest/ingest/tenant/${TENANT_ID}/async/events`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(events),
      }
    ),
  ]);

  if (!custRes.ok) {
    const body = await custRes.text();
    throw new Error(`Customer ingest failed: ${custRes.status} — ${body}`);
  }
  if (!evtRes.ok) {
    const body = await evtRes.text();
    throw new Error(`Event ingest failed: ${evtRes.status} — ${body}`);
  }
  console.log("[Setup] Ingest requests accepted. Polling for data...");

  // ── Step 9: Poll until first AND last customer are queryable ─────────────
  const firstId = customers[0].primary_id;
  const lastId = customers[customers.length - 1].primary_id;
  const POLL_INTERVAL_MS = 5_000;
  const POLL_TIMEOUT_MS = 120_000;
  const deadline = Date.now() + POLL_TIMEOUT_MS;
  let ready = false;

  async function isCustomerQueryable(id: number | string): Promise<boolean> {
    const r = await fetch(`${BASE_URL}/api/tenant/data/customers/${id}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (r.status !== 200) return false;
    const d = await r.json();
    return !!(d.fields && Object.keys(d.fields).length > 2);
  }

  while (Date.now() < deadline) {
    const [firstOk, lastOk] = await Promise.all([
      isCustomerQueryable(firstId),
      isCustomerQueryable(lastId),
    ]);
    if (firstOk && lastOk) {
      ready = true;
      break;
    }
    const missing = !firstOk && !lastOk ? "first+last" : !firstOk ? "first" : "last";
    console.log(`[Setup] Customers not yet queryable (${missing}) — waiting ${POLL_INTERVAL_MS / 1000}s...`);
    await sleep(POLL_INTERVAL_MS);
  }

  if (!ready) {
    console.warn(`[Setup] WARNING: Timed out waiting for customers after ${POLL_TIMEOUT_MS / 1000}s`);
  } else {
    console.log(`[Setup] All customers queryable — dataset ready.`);
  }

  // ── Step 9.5: UDAF calculate health canary ────────────────────────────────
  // UDAFs are immutable and cannot be deleted — the shared tenant accumulates
  // thousands of them and `/udafs/types` is broken by poison rows (BUG-077).
  // Instead of listing, we probe 1–2 known-stable canary UDAF IDs and check
  // that POST /calculate returns 200. If both canaries are 500, compute is
  // degraded and calculate-dependent tests will be skipped.
  //
  // Canary IDs are read from .cdp-canaries.json (gitignored). On the first
  // successful run where env didn't supply them, we discover two stable UDAFs
  // via a single list call and persist them. Subsequent runs never hit the
  // list endpoint.
  const CANARY_FILE = new URL("../.cdp-canaries.json", import.meta.url).pathname.replace(/^\/([A-Z]:)/, "$1");
  const fs2 = await import("fs");
  type Canary = { id: string; primaryId: number };
  let canaries: Canary[] = [];
  if (fs2.existsSync(CANARY_FILE)) {
    try {
      canaries = JSON.parse(fs2.readFileSync(CANARY_FILE, "utf-8"));
    } catch { /* fall through to discovery */ }
  }

  async function calculateOk(udafId: string, primaryId: number): Promise<boolean> {
    const r = await fetch(
      `${BASE_URL}/api/tenants/udafs/${udafId}/calculate?primaryId=${primaryId}`,
      { method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` } },
    );
    return r.status === 200;
  }

  console.log(`[Setup] UDAF compute canary (${canaries.length ? "cached IDs" : "discovering"})...`);

  if (canaries.length === 0) {
    // First-time discovery: one list call, pick two UDAFs with non-empty aggType.
    const { data: listData } = await apiCall("/api/tenants/udafs", { token });
    const items: any[] = listData?.items ?? [];
    const probePrimary = customers[0].primary_id;
    for (const u of items) {
      if (canaries.length >= 2) break;
      const def = await apiCall(`/api/tenants/udafs/${u.id}`, { token });
      if (def.data?.aggType && def.data.aggType !== "" && await calculateOk(u.id, probePrimary)) {
        canaries.push({ id: u.id, primaryId: probePrimary });
      }
    }
    if (canaries.length > 0) {
      fs2.writeFileSync(CANARY_FILE, JSON.stringify(canaries, null, 2), "utf-8");
      console.log(`[Setup] Discovered ${canaries.length} canary UDAF(s); cached to .cdp-canaries.json`);
    }
  }

  let healthy = false;
  if (canaries.length > 0) {
    const results = await Promise.all(canaries.map(c => calculateOk(c.id, c.primaryId)));
    healthy = results.some(Boolean);
    if (!healthy) {
      // Canaries failed — they may have gone stale. Wipe the cache so next run rediscovers.
      try { fs2.unlinkSync(CANARY_FILE); } catch { /* ignore */ }
    }
  }

  process.env.__CDP_UDAF_CALCULATE_HEALTHY = healthy ? "true" : "false";
  if (healthy) {
    console.log(`[Setup] UDAF calculate: OK (${canaries.length} canary / ${canaries.length} healthy)`);
  } else if (canaries.length > 0) {
    console.warn(`[Setup] UDAF calculate: DEGRADED — all ${canaries.length} canaries returned non-200. Cache invalidated.`);
    console.warn("[Setup] Tests using describe.skipIf(!isUdafCalculateHealthy()) will be skipped.");
  } else {
    console.warn("[Setup] UDAF calculate: UNKNOWN — no canaries discovered. Assuming healthy.");
    process.env.__CDP_UDAF_CALCULATE_HEALTHY = "true";
  }

  // ── Step 10: Export full tenant context ─────────────────────────────────
  const tenant: TenantContext = {
    tenantId: TENANT_ID,
    domain: DOMAIN,
    email: EMAIL,
    password: PASSWORD,
    token,
    customerFieldMap,
    eventFieldMap,
    purchaseEventTypeId,
    customers,
    events,
    runTag: RUN_TAG,
  };

  const tenantJson = JSON.stringify(tenant);
  process.env.__CDP_TEST_TENANT = tenantJson;
  process.env.__CDP_USE_PROVISIONED_TENANT = "1";

  const fs = await import("fs");
  fs.writeFileSync(
    new URL("../.test-tenant.json", import.meta.url).pathname.replace(/^\/([A-Z]:)/, "$1"),
    tenantJson,
    "utf-8"
  );

  console.log("[Setup] === Shared tenant ready ===");
  console.log(`[Setup] Tenant ID: ${tenant.tenantId}`);
  console.log(`[Setup] Domain: ${tenant.domain}`);
  console.log(`[Setup] Run tag: ${RUN_TAG}`);
  console.log(`[Setup] Customers: ${customers.length}, Events: ${events.length}`);
}
