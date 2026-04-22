/**
 * Global setup for business logic tests.
 *
 * 1. Provisions a fresh tenant (signup → schema → event types → apply)
 * 2. Ingests deterministic customer + event data
 * 3. Polls until data is queryable
 * 4. Exports tenant context via env vars for test workers
 */
import dotenv from "dotenv";
dotenv.config();

import { provisionTenant, type ProvisionedTenant } from "./tenant-provisioner";
import { CUSTOMERS, EVENTS } from "./test-data";

const BASE_URL = process.env.CDP_BASE_URL || "https://cdpv2.ssd.uz";

export async function setup(ctx: { provide: (key: string, value: any) => void }) {
  console.log("[Setup] ═══ Provisioning fresh tenant for isolated testing ═══");

  // ── Step 1: Provision tenant ────────────────────────────────────────────
  const tenant = await provisionTenant();

  // ── Step 2: Ingest customers ────────────────────────────────────────────
  console.log("[Setup] Ingesting test customers...");
  const custRes = await ingestData(
    `${BASE_URL}/cdp-ingest/ingest/tenant/${tenant.tenantId}/async/customers`,
    CUSTOMERS
  );
  console.log(`[Setup] Customers: ${custRes.accepted} accepted, ${custRes.rejected} rejected`);
  if (custRes.rejected > 0) {
    for (const item of custRes.items) {
      if (item.status === "rejected") console.error("[Setup] Rejected:", item.error);
      if (item.ignoredFields?.length) console.warn("[Setup] Ignored fields:", item.ignoredFields);
    }
  }

  // ── Step 3: Ingest events ───────────────────────────────────────────────
  console.log("[Setup] Ingesting test events...");
  const evtRes = await ingestData(
    `${BASE_URL}/cdp-ingest/ingest/tenant/${tenant.tenantId}/async/events`,
    EVENTS
  );
  console.log(`[Setup] Events: ${evtRes.accepted} accepted, ${evtRes.rejected} rejected`);
  if (evtRes.rejected > 0) {
    for (const item of evtRes.items) {
      if (item.status === "rejected") console.error("[Setup] Rejected:", item.error);
    }
  }

  // ── Step 4: Poll until data lands ───────────────────────────────────────
  await pollUntilDataLands(tenant);

  // ── Step 5: Wait for UDAF recalculation ─────────────────────────────────
  await pollUntilUdafsReady(tenant);

  // ── Step 6: Export tenant context for test workers ──────────────────────
  const tenantJson = JSON.stringify(tenant);
  process.env.__CDP_TEST_TENANT = tenantJson;
  // Signal to setup.ts that a provisioned tenant is available
  process.env.__CDP_USE_PROVISIONED_TENANT = "1";

  // Also write to a temp file that setupFiles can read
  const fs = await import("fs");
  fs.writeFileSync(
    new URL("../.test-tenant.json", import.meta.url).pathname.replace(/^\/([A-Z]:)/, "$1"),
    tenantJson,
    "utf-8"
  );

  console.log("[Setup] ═══ Tenant provisioned and data ready ═══");
  console.log(`[Setup] Tenant ID: ${tenant.tenantId}`);
  console.log(`[Setup] Domain: ${tenant.domain}`);
}

// ─── Ingest helper ────────────────────────────────────────────────────────────

async function ingestData(url: string, records: Record<string, unknown>[]) {
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(records),
  });
  if (!res.ok) throw new Error(`Ingest failed: ${res.status} ${await res.text()}`);
  return res.json() as Promise<{
    accepted: number;
    rejected: number;
    items: { status: string; ignoredFields?: string[]; error?: any }[];
  }>;
}

// ─── Data polling ─────────────────────────────────────────────────────────────

async function pollUntilDataLands(tenant: ProvisionedTenant, maxWaitMs = 360_000) {
  const targetPid = CUSTOMERS[0].primary_id;
  const start = Date.now();
  const interval = 15_000;

  console.log(`[Setup] Polling for customer primary_id=${targetPid} in new tenant...`);

  while (Date.now() - start < maxWaitMs) {
    try {
      const res = await fetch(`${BASE_URL}/api/tenant/data/customers/${targetPid}`, {
        headers: { Authorization: `Bearer ${tenant.token}` },
      });
      if (res.status === 200) {
        const data = await res.json();
        if (data.fields && Object.keys(data.fields).length > 2) {
          console.log(`[Setup] Data landed after ${((Date.now() - start) / 1000).toFixed(0)}s`);
          return;
        }
      }
    } catch { /* retry */ }

    console.log(`[Setup] Not yet (${((Date.now() - start) / 1000).toFixed(0)}s), waiting...`);
    await new Promise((r) => setTimeout(r, interval));
  }

  // Don't hard-fail — some tests can still run without data
  console.warn(`[Setup] ⚠ Data polling timed out after ${maxWaitMs / 1000}s. Tests may partially fail.`);
}

// ─── UDAF readiness polling ───────────────────────────────────────────────────
// UDAFs take ~5 minutes to recalculate after data ingest.
// We create a probe COUNT UDAF and poll until it returns a non-zero result for Alice (who has events).

async function pollUntilUdafsReady(tenant: ProvisionedTenant, maxWaitMs = 420_000) {
  const start = Date.now();
  const interval = 20_000;
  const alicePid = CUSTOMERS[0].primary_id;

  // Create a probe UDAF
  console.log("[Setup] Creating probe UDAF to check recalculation readiness...");
  const createRes = await fetch(`${BASE_URL}/api/tenants/udafs`, {
    method: "POST",
    headers: { Authorization: `Bearer ${tenant.token}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      name: `__probe_udaf_${Date.now()}`,
      aggType: "COUNT",
      params: [],
      filter: {
        eventType: { id: tenant.purchaseEventTypeId, name: "purchase" },
        predicate: { type: "group", group: { logicalOp: "AND", predicates: [], negate: false } },
        timeWindow: {},
      },
      grouping: { enable: false },
    }),
  });

  if (createRes.status !== 200) {
    console.warn(`[Setup] ⚠ Probe UDAF creation failed: ${createRes.status}. Skipping UDAF poll.`);
    return;
  }

  const probeUdaf = await createRes.json();
  const probeId = probeUdaf.id;
  console.log(`[Setup] Probe UDAF created: ${probeId}. Polling for Alice's count...`);

  while (Date.now() - start < maxWaitMs) {
    try {
      const res = await fetch(`${BASE_URL}/api/tenants/udafs/${probeId}/calculate?primaryId=${alicePid}`, {
        method: "POST",
        headers: { Authorization: `Bearer ${tenant.token}`, "Content-Type": "application/json" },
      });
      if (res.status === 200) {
        const data = await res.json();
        const raw = data.result;
        // Result can be a number or { Result: number } depending on backend version
        const val = typeof raw === "number" ? raw : (raw?.Result ?? raw);
        if (typeof val === "number" && val > 0) {
          console.log(`[Setup] UDAF ready after ${((Date.now() - start) / 1000).toFixed(0)}s (Alice COUNT=${val})`);
          return;
        }
      }
    } catch { /* retry */ }

    console.log(`[Setup] UDAF not ready (${((Date.now() - start) / 1000).toFixed(0)}s), waiting...`);
    await new Promise((r) => setTimeout(r, interval));
  }

  console.warn(`[Setup] ⚠ UDAF polling timed out after ${maxWaitMs / 1000}s. UDAF tests may fail.`);
}
