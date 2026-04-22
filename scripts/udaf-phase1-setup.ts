#!/usr/bin/env npx tsx
/**
 * UDAF Phase 1 — Setup
 *
 * Run this first. It:
 *   1. Authenticates against the shared tenant
 *   2. Verifies schema + customer data exist (does NOT ingest — shared tenant already has data)
 *   3. Creates 3 diagnostic UDAFs (COUNT, SUM, AVG) against known customers
 *   4. Records expected values (computable from ingested data)
 *   5. Writes .udaf-phase1-state.json with: timestamp, UDAF IDs, expected values
 *
 * Then run Phase 2 (npm run test:udaf:assert) — it will wait for materialization.
 *
 * Usage:
 *   npm run test:udaf:setup
 *   # or: npx tsx scripts/udaf-phase1-setup.ts
 */

import dotenv from "dotenv";
dotenv.config();
import fs from "fs";
import path from "path";

const BASE_URL = process.env.CDP_BASE_URL || "https://cdpv2.ssd.uz";
const TENANT_ID = 1762934640267;
const DOMAIN = "1762934640.cdp.com";
const EMAIL = "shop2025.11.12-13:04:00@cdp.ru";
const PASSWORD = "qwerty123";

// Minimum age before Phase 2 will run. Adjust based on diagnostic findings.
// Default: 20 minutes. After running udaf-timing-diagnostic, set this to observed T+10min.
export const MIN_PHASE2_WAIT_MS = 20 * 60 * 1000;

const STATE_FILE = path.join(process.cwd(), ".udaf-phase1-state.json");

export interface Phase1State {
  phase1CompletedAt: number;       // Date.now()
  tenantId: number;
  token: string;                   // saved so Phase 2 doesn't re-auth if run quickly
  eventTypeId: number;
  eventTypeName: string;
  udafs: Array<{
    id: string;
    label: string;                 // "count_no_window" | "sum_total_price" | "count_relative_365"
    aggType: string;
    description: string;
    primaryIdToTest: number;       // which customer to assert against
    // expectedValue is NOT stored here — Phase 2 computes it from live data
    // This avoids stale expected values if data changed between phases
  }>;
  // A control UDAF that already existed before Phase 1 ran (proves pre-existing UDAFs work)
  controlUdafId: string | null;
  controlPrimaryId: number | null;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

async function apiCall(path: string, opts: { method?: string; body?: unknown; token?: string } = {}) {
  const method = opts.method ?? (opts.body ? "POST" : "GET");
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (opts.token) headers["Authorization"] = `Bearer ${opts.token}`;
  const res = await fetch(`${BASE_URL}${path}`, {
    method, headers,
    body: opts.body ? JSON.stringify(opts.body) : undefined,
  });
  const text = await res.text();
  let data: any;
  try { data = JSON.parse(text); } catch { data = text; }
  return { status: res.status, data };
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  // ── Check if Phase 1 already ran recently ────────────────────────────────
  if (fs.existsSync(STATE_FILE)) {
    const existing = JSON.parse(fs.readFileSync(STATE_FILE, "utf-8")) as Phase1State;
    const ageMs = Date.now() - existing.phase1CompletedAt;
    const ageMin = Math.round(ageMs / 60_000);
    if (ageMs < MIN_PHASE2_WAIT_MS) {
      console.log(`[phase1] State file already exists from ${ageMin} min ago.`);
      console.log(`[phase1] Phase 2 cannot run until ${Math.round(MIN_PHASE2_WAIT_MS / 60_000)} min have elapsed.`);
      console.log(`[phase1] Re-running Phase 1 would reset the clock. Abort? (y/n)`);
      const confirmed = await new Promise<boolean>(resolve => {
        process.stdin.resume();
        process.stdin.once("data", chunk => {
          process.stdin.pause();
          resolve(chunk.toString().trim().toLowerCase() === "y");
        });
      });
      if (!confirmed) {
        console.log("[phase1] Aborted — existing state preserved.");
        process.exit(0);
      }
    } else {
      console.log(`[phase1] Existing state is ${ageMin} min old — overwriting.`);
    }
  }

  // ── Auth ──────────────────────────────────────────────────────────────────
  console.log("[phase1] Authenticating...");
  const res = await fetch(`${BASE_URL}/public/api/signin`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username: EMAIL, password: PASSWORD, domainName: DOMAIN }),
  });
  if (!res.ok) throw new Error(`Auth failed: ${res.status}`);
  const { jwtToken: token } = await res.json() as { jwtToken: string };
  console.log("[phase1] Auth OK");

  // ── Get purchase event type ───────────────────────────────────────────────
  const { data: etData } = await apiCall("/api/tenants/schema/event-types?exclude_draft=true", { token });
  const pt = (etData.list || []).find((t: any) => t.eventTypeName === "purchase");
  if (!pt) throw new Error("No purchase event type — run npm run test:business first.");
  const eventTypeId = pt.eventTypeId;
  console.log(`[phase1] Purchase event type ID: ${eventTypeId}`);

  // ── Pick a customer with known events ─────────────────────────────────────
  // Use the v1 customers endpoint to find any customer with events
  const { data: custData } = await apiCall("/api/tenant/data/customers", {
    token, method: "POST",
    body: { fieldNames: ["primary_id"] }
  });
  const list = custData?.list ?? custData?.customers ?? [];
  if (list.length < 2) throw new Error("Not enough customers — run npm run test:business first.");
  const primaryIdToTest: number = list[0].primary_id ?? list[0].fields?.primary_id;
  const primaryIdControl: number = list[1].primary_id ?? list[1].fields?.primary_id;
  console.log(`[phase1] Test customer primaryId: ${primaryIdToTest}`);
  console.log(`[phase1] Control customer primaryId: ${primaryIdControl}`);

  // ── Find a pre-existing UDAF with valid aggType (control) ────────────────
  // Must validate aggType != "" — corrupt records (BUG-041) always return 500
  // and would make Phase 2 falsely conclude the endpoint is broken.
  const { data: udafList } = await apiCall("/api/tenants/udafs", { token });
  const existingUdafs: any[] = (udafList?.items || []);
  const candidates = existingUdafs.filter(u => !u.name.startsWith("diag_") && !u.name.startsWith("diag_p1_"));
  let controlUdafId: string | null = null;
  for (const candidate of candidates) {
    const { data: def } = await apiCall(`/api/tenants/udafs/${candidate.id}`, { token });
    if (def?.aggType && def.aggType !== "") {
      controlUdafId = candidate.id;
      console.log(`[phase1] Control UDAF (pre-existing, aggType=${def.aggType}): ${controlUdafId}`);
      break;
    }
    console.log(`[phase1] Skipping ${candidate.id} — stored aggType is empty (BUG-041 corrupt record)`);
  }
  if (!controlUdafId) {
    console.warn("[phase1] No valid pre-existing UDAF found — Phase 2 cannot verify baseline.");
  }

  // ── Create 3 new UDAFs ────────────────────────────────────────────────────
  const noFilter = {
    type: "group",
    group: { logicalOp: "AND", predicates: [], negate: false },
  };

  const udafDefs = [
    {
      label: "count_no_window",
      aggType: "COUNT",
      description: "COUNT all purchase events, no time window",
      body: {
        aggType: "COUNT",
        params: [],
        filter: { eventType: { id: eventTypeId, name: "purchase" }, predicate: noFilter, timeWindow: {} },
        grouping: { enable: false },
      },
    },
    {
      label: "count_relative_365",
      aggType: "COUNT",
      description: "COUNT purchase events in last 365 days (RELATIVE window — tests BUG-002 direction)",
      body: {
        aggType: "COUNT",
        params: [],
        filter: {
          eventType: { id: eventTypeId, name: "purchase" },
          predicate: noFilter,
          timeWindow: { from: { kind: "RELATIVE", relativeDuration: 365, relativeUnit: "DAY" } },
        },
        grouping: { enable: false },
      },
    },
    {
      label: "count_absolute_future",
      aggType: "COUNT",
      description: "COUNT in absolute window 2025-2030 (should match no_window if data is recent)",
      body: {
        aggType: "COUNT",
        params: [],
        filter: {
          eventType: { id: eventTypeId, name: "purchase" },
          predicate: noFilter,
          timeWindow: {
            from: { kind: "ABSOLUTE", absoluteTime: "2025-01-01T00:00:00Z" },
            to:   { kind: "ABSOLUTE", absoluteTime: "2030-01-01T00:00:00Z" },
          },
        },
        grouping: { enable: false },
      },
    },
  ];

  const createdUdafs: Phase1State["udafs"] = [];
  for (const def of udafDefs) {
    const tag = `diag_p1_${Date.now() % 100000}`;
    const { status, data } = await apiCall("/api/tenants/udafs", { token, body: {
      name: `${tag}_${def.label}`,
      ...def.body,
    }});
    if (status !== 200) {
      throw new Error(`UDAF create failed [${def.label}]: ${status} — ${JSON.stringify(data)}`);
    }

    // Verify stored definition — BUG-041: backend sometimes stores empty aggType.
    // If aggType is empty the UDAF will always return 500 on calculate, making Phase 2 useless.
    const { data: stored } = await apiCall(`/api/tenants/udafs/${data.id}`, { token });
    if (!stored.aggType || stored.aggType === "") {
      throw new Error(
        `UDAF ${data.id} (${def.label}) was stored with empty aggType — backend persistence bug (BUG-041). ` +
        `Phase 2 would never succeed for this UDAF. Re-run Phase 1 or file the bug.`
      );
    }

    console.log(`[phase1] Created UDAF [${def.label}]: ${data.id} (aggType=${stored.aggType} ✓)`);
    createdUdafs.push({
      id: data.id,
      label: def.label,
      aggType: def.aggType,
      description: def.description,
      primaryIdToTest,
    });
  }

  // ── Write state file ──────────────────────────────────────────────────────
  const state: Phase1State = {
    phase1CompletedAt: Date.now(),
    tenantId: TENANT_ID,
    token,
    eventTypeId,
    eventTypeName: "purchase",
    udafs: createdUdafs,
    controlUdafId,
    controlPrimaryId: primaryIdControl,
  };

  fs.writeFileSync(STATE_FILE, JSON.stringify(state, null, 2));

  console.log("\n[phase1] ═══════════════════════════════════════════════");
  console.log("[phase1]  Phase 1 complete. State saved to:");
  console.log(`[phase1]  ${STATE_FILE}`);
  console.log("[phase1]");
  console.log(`[phase1]  UDAFs created: ${createdUdafs.length}`);
  console.log(`[phase1]  Minimum wait before Phase 2: ${MIN_PHASE2_WAIT_MS / 60_000} min`);
  console.log("[phase1]");
  console.log("[phase1]  When ready, run: npm run test:udaf:assert");
  console.log("[phase1]  Phase 2 will refuse to run until the minimum wait has elapsed.");
  console.log("[phase1]  It will then poll until UDAFs are materialized, then assert.");
  console.log("[phase1] ═══════════════════════════════════════════════");
}

main().catch(err => {
  console.error("[fatal]", err);
  process.exit(1);
});
