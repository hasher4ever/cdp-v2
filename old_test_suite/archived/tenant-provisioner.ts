/**
 * Tenant Provisioner — creates a fresh tenant with full schema for isolated testing.
 *
 * Flow: signup → signin → add customer fields → apply → add event type →
 *       add event fields → apply → ingest customers → ingest events → poll
 *
 * Inspired by old QA suite (genV12) but uses current OpenAPI-validated endpoints.
 */
import { getAuthToken } from "../tests_backend/client";

const BASE_URL = process.env.CDP_BASE_URL || "https://cdpv2.ssd.uz";

// ─── Helpers ──────────────────────────────────────────────────────────────────

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

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

// ─── Types ────────────────────────────────────────────────────────────────────

export interface ProvisionedTenant {
  tenantId: number;
  domain: string;
  email: string;
  password: string;
  token: string;
  /** Map of our logical names → actual fieldName in the tenant (e.g. "gender" → "col__varchar_s50000__0") */
  customerFieldMap: Record<string, string>;
  /** Map of our logical names → actual fieldName for purchase events */
  eventFieldMap: Record<string, string>;
  /** The event type ID assigned to "purchase" */
  purchaseEventTypeId: number;
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

// ─── Provisioner ──────────────────────────────────────────────────────────────

export async function provisionTenant(): Promise<ProvisionedTenant> {
  const ts = new Date().toISOString().replace(/[-:T.Z]/g, "").slice(0, 14);
  const tenantName = `test_${ts}`;
  const domain = `${tenantName}.cdp.com`;
  const email = `shop_${ts}@cdp.test`;
  const password = "qwerty123";

  // ── Step 1: Signup ──────────────────────────────────────────────────────
  console.log(`[Provision] Signing up tenant "${tenantName}"...`);
  const { status: signupStatus, data: signupData } = await apiCall("/public/api/signup", {
    body: {
      name: tenantName,
      domainName: domain,
      user: { email, password, firstName: "Test", lastName: "User" },
    },
  });

  if (signupStatus !== 200) {
    throw new Error(`Signup failed: ${signupStatus} ${JSON.stringify(signupData)}`);
  }

  // Extract tenantId from response — the tenant state is nested
  const tenantId: number = signupData.tenant?.tenantId;
  if (!tenantId) {
    throw new Error(`No tenantId in signup response: ${JSON.stringify(signupData).slice(0, 500)}`);
  }
  console.log(`[Provision] Tenant created: ID=${tenantId}, domain=${domain}`);

  // ── Step 2: Wait for infrastructure ─────────────────────────────────────
  console.log("[Provision] Waiting for infrastructure readiness...");
  await waitForReady(domain, email, password);

  // ── Step 3: Sign in ─────────────────────────────────────────────────────
  const token = await getAuthToken(BASE_URL, domain, email, password);
  console.log("[Provision] Signed in, got JWT.");

  // ── Step 4: Add customer schema fields ──────────────────────────────────
  // Some fields may already exist (system defaults) — 409 is OK
  console.log("[Provision] Adding customer schema fields...");
  let fieldsAdded = 0;
  for (const field of CUSTOMER_FIELDS) {
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
    if (status === 200) fieldsAdded++;
    // 409 = already exists = fine
  }
  console.log(`[Provision] ${fieldsAdded} new customer fields added (others already existed)`);

  // ── Step 5: Apply customer schema draft (only if we added new fields) ──
  if (fieldsAdded > 0) {
    console.log("[Provision] Applying customer schema draft...");
    await apiCall("/api/tenants/schema/draft-schema/apply", { token, body: {} });
    await sleep(3000);
  }

  // ── Step 6: Create or find "purchase" event type ────────────────────────
  console.log('[Provision] Creating/finding "purchase" event type...');
  const { status: etStatus, data: etData } = await apiCall("/api/tenants/schema/event-types", {
    token,
    body: { name: "purchase" },
  });

  let needApplyEventType = false;
  if (etStatus === 200) {
    console.log(`[Provision] Event type "purchase" created as draft, UID=${etData.ID}`);
    needApplyEventType = true;
  } else if (etStatus === 409) {
    console.log('[Provision] Event type "purchase" already exists — using existing');
  } else {
    throw new Error(`Create event type failed: ${etStatus} ${JSON.stringify(etData)}`);
  }

  if (needApplyEventType) {
    await apiCall("/api/tenants/schema/draft-schema/apply", { token, body: {} });
    await sleep(3000);
  }

  // ── Step 7: Get the actual event type ID ────────────────────────────────
  const { data: eventTypes } = await apiCall("/api/tenants/schema/event-types?exclude_draft=true", { token });
  const purchaseType = eventTypes.list.find((t: any) => t.eventTypeName === "purchase");
  if (!purchaseType) {
    throw new Error("Could not find purchase event type after creation");
  }
  const purchaseEventTypeId = purchaseType.eventTypeId;
  console.log(`[Provision] Purchase event type ID: ${purchaseEventTypeId}`);

  // ── Step 8: Add event type fields ───────────────────────────────────────
  console.log("[Provision] Adding purchase event fields...");
  let evtFieldsAdded = 0;
  for (const field of PURCHASE_EVENT_FIELDS) {
    const { status } = await apiCall(`/api/tenants/schema/events/fields/${purchaseEventTypeId}`, {
      token,
      body: {
        apiName: field.apiName,
        displayName: field.displayName,
        dataType: field.dataType,
        access: field.access,
        flagMulti: false,
      },
    });
    if (status === 200) evtFieldsAdded++;
    // 409 = already exists = fine
  }
  console.log(`[Provision] ${evtFieldsAdded} new event fields added`);

  // ── Step 9: Apply event fields draft ────────────────────────────────────
  if (evtFieldsAdded > 0) {
    console.log("[Provision] Applying event fields draft...");
    await apiCall("/api/tenants/schema/draft-schema/apply", { token, body: {} });
    await sleep(3000);
  }

  // ── Step 10: Read back actual field names (col__xxx mappings) ───────────
  console.log("[Provision] Reading back schema field mappings...");

  const { data: custFields } = await apiCall("/api/tenants/schema/customers/fields?exclude_draft=true", { token });
  const customerFieldMap: Record<string, string> = {};
  for (const f of custFields.list) {
    if (f.apiName && f.fieldName) {
      customerFieldMap[f.apiName] = f.fieldName;
    }
  }

  const { data: evtFields } = await apiCall(`/api/tenants/schema/events/fields/${purchaseEventTypeId}?exclude_draft=true`, { token });
  const eventFieldMap: Record<string, string> = {};
  for (const f of evtFields.list) {
    if (f.apiName && f.fieldName) {
      eventFieldMap[f.apiName] = f.fieldName;
    }
  }

  console.log(`[Provision] Customer fields mapped: ${Object.keys(customerFieldMap).join(", ")}`);
  console.log(`[Provision] Event fields mapped: ${Object.keys(eventFieldMap).join(", ")}`);

  return {
    tenantId,
    domain,
    email,
    password,
    token,
    customerFieldMap,
    eventFieldMap,
    purchaseEventTypeId,
  };
}

// ─── Infrastructure readiness polling ─────────────────────────────────────────

async function waitForReady(domain: string, email: string, password: string, maxWaitMs = 60_000) {
  const start = Date.now();
  const interval = 3000;

  while (Date.now() - start < maxWaitMs) {
    try {
      // Try to sign in — if it works, infrastructure is ready
      await getAuthToken(BASE_URL, domain, email, password);
      console.log(`[Provision] Infrastructure ready after ${((Date.now() - start) / 1000).toFixed(0)}s`);
      return;
    } catch {
      // Not ready yet
    }
    await sleep(interval);
  }
  throw new Error(`Infrastructure not ready after ${maxWaitMs / 1000}s`);
}
