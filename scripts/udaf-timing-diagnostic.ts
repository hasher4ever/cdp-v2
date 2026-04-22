#!/usr/bin/env npx tsx
/**
 * UDAF 500 Timing Diagnostic
 *
 * Hypothesis under test:
 *   (A) Cache-refresh theory: compute service has a periodic cache of UDAF definitions.
 *       New UDAFs are unknown until the cache refreshes. All UDAFs created in the same
 *       window transition at the SAME moment (cache reload), regardless of tenant load.
 *
 *   (B) Load/queue theory: compute service processes new UDAFs through a queue.
 *       Under high tenant load, the queue backs up. UDAFs created together might
 *       transition at different times, and transition time correlates with queue length.
 *
 * Method:
 *   0. Control check: test calculate on a PRE-EXISTING UDAF (created before this run).
 *      If the pre-existing UDAF also returns 500 → endpoint is broken, not just warming up.
 *      Exit immediately with diagnosis instead of polling for 45 minutes.
 *   1. Create 1 UDAF (solo) immediately — record T0
 *   2. Create 5 UDAFs simultaneously (batch) — record T0_batch
 *   3. Poll all 6 every POLL_INTERVAL_MS
 *   4. Record exact elapsed time at first non-500 response for each UDAF
 *   5. Early abort: if 5+ consecutive polls with 0 successes AND control also failed → exit
 *   6. Compare: solo vs batch transition times, and within-batch variance
 *
 * If (A): all 5 batch UDAFs transition within 1 poll interval of each other
 * If (B): batch UDAFs transition at different times with high variance
 * If (C): control check fails → endpoint is broken entirely, stop immediately
 *
 * Usage:
 *   npx tsx scripts/udaf-timing-diagnostic.ts
 *   # Exits early if endpoint is broken; otherwise runs up to MAX_WAIT_MS (default 45min)
 *   # Outputs a timing table and interpretation at the end
 *
 * Writes results to: reports/udaf-timing-diagnostic-{timestamp}.json
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

const POLL_INTERVAL_MS   = 30_000;        // 30 seconds between polls
const MAX_WAIT_MS        = 45 * 60 * 1000; // 45 minutes total
const EARLY_ABORT_POLLS  = 5;             // abort after this many all-500 polls if control also failed

// ─── Types ────────────────────────────────────────────────────────────────────

interface PollEntry {
  elapsedMs: number;
  status: number;
  errorSnippet: string | null;  // first 200 chars of error body if 500
  result: any;
}

interface UdafRecord {
  id: string;
  label: string;           // "solo" | "batch_0" .. "batch_4"
  createdAt: number;       // Date.now()
  firstSuccessMs: number | null;   // null = never succeeded within window
  firstSuccessResult: any;
  pollLog: PollEntry[];
}

// ─── HTTP helpers ─────────────────────────────────────────────────────────────

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

function sleep(ms: number) { return new Promise(r => setTimeout(r, ms)); }

// ─── Auth ─────────────────────────────────────────────────────────────────────

async function auth(): Promise<string> {
  console.log("[auth] Authenticating...");
  const res = await fetch(`${BASE_URL}/public/api/signin`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username: EMAIL, password: PASSWORD, domainName: DOMAIN }),
  });
  if (!res.ok) throw new Error(`Auth failed: ${res.status}`);
  const data = await res.json() as { jwtToken: string };
  console.log("[auth] OK");
  return data.jwtToken;
}

// ─── Get event type ───────────────────────────────────────────────────────────

async function getPurchaseEventTypeId(token: string): Promise<{ id: number; name: string }> {
  const { data } = await apiCall("/api/tenants/schema/event-types?exclude_draft=true", { token });
  const pt = (data.list || []).find((t: any) => t.eventTypeName === "purchase");
  if (!pt) throw new Error("No purchase event type found — run test:business first to set up schema");
  return { id: pt.eventTypeId, name: "purchase" };
}

async function getACustomerPrimaryId(token: string): Promise<number> {
  const { data } = await apiCall("/api/tenant/data/customers", { token,
    method: "POST",
    body: { fieldNames: ["primary_id"] }
  });
  // Try v1 response shape first
  const list = data?.list ?? data?.customers ?? [];
  if (list.length === 0) throw new Error("No customers found — run test:business first to ingest data");
  return list[0].primary_id ?? list[0].fields?.primary_id;
}

// ─── Create UDAF ──────────────────────────────────────────────────────────────

async function createUdaf(
  token: string,
  label: string,
  eventTypeId: number,
  eventTypeName: string
): Promise<string> {
  const { status, data } = await apiCall("/api/tenants/udafs", { token, body: {
    name: `diag_${label}_${Date.now()}`,
    aggType: "COUNT",
    params: [],
    filter: {
      eventType: { id: eventTypeId, name: eventTypeName },
      predicate: { type: "group", group: { logicalOp: "AND", predicates: [], negate: false } },
      timeWindow: {},
    },
    grouping: { enable: false },
  }});
  if (status !== 200) throw new Error(`UDAF create failed: ${status} — ${JSON.stringify(data)}`);

  // Verify the stored definition immediately after creation.
  // BUG-041: backend sometimes accepts POST but stores empty aggType.
  // A UDAF with empty aggType will ALWAYS return 500 on calculate — it's not a timing issue.
  // If we don't catch this here, the diagnostic will poll for 45 minutes and conclude
  // "cache refresh > 45 min" when the real answer is "corrupt DB record."
  const { data: stored } = await apiCall(`/api/tenants/udafs/${data.id}`, { token });
  if (!stored.aggType || stored.aggType === "") {
    throw new Error(
      `UDAF ${data.id} (${label}) was stored with empty aggType — backend persistence bug (BUG-041). ` +
      `This UDAF will always return 500. Cannot run diagnostic with corrupt UDAFs.`
    );
  }

  return data.id;
}

// ─── Poll one UDAF ────────────────────────────────────────────────────────────

async function pollOnce(
  token: string,
  udafId: string,
  primaryId: number,
  createdAt: number
): Promise<PollEntry> {
  const url = `${BASE_URL}/api/tenants/udafs/${udafId}/calculate?primaryId=${primaryId}`;
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
  });
  const text = await res.text();
  let data: any;
  try { data = JSON.parse(text); } catch { data = text; }

  let errorSnippet: string | null = null;
  if (res.status === 500) {
    const raw = typeof data === "string" ? data : JSON.stringify(data);
    errorSnippet = raw.slice(0, 250);
  }

  return {
    elapsedMs: Date.now() - createdAt,
    status: res.status,
    errorSnippet,
    result: data,
  };
}

// ─── Control check ────────────────────────────────────────────────────────────

// Known-good UDAF confirmed to return 200 on the shared tenant (see bugs.md BUG-002 notes).
// Used as the sole control probe: if this returns 200 the endpoint is healthy;
// other UDAFs returning 500 are per-UDAF issues (BUG-041 corruption or not yet materialized).
const CONTROL_UDAF_ID  = "40ed934f-eed0-43ef-9a17-fd25501ae7af";
const CONTROL_PRIMARY_ID = 13;

/**
 * Tests the known-good control UDAF.
 * Returns a diagnosis:
 *   "ok"     — endpoint works; 500s on new UDAFs are per-UDAF issues (corruption / not materialized)
 *   "broken" — even the known-good UDAF returns non-200; endpoint is fundamentally broken
 */
async function runControlCheck(
  token: string,
): Promise<{ verdict: "ok" | "broken"; udafId: string; status: number; errorSnippet: string | null }> {
  const url = `${BASE_URL}/api/tenants/udafs/${CONTROL_UDAF_ID}/calculate?primaryId=${CONTROL_PRIMARY_ID}`;
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
  });
  const text = await res.text();
  let resData: any;
  try { resData = JSON.parse(text); } catch { resData = text; }

  let errorSnippet: string | null = null;
  if (res.status !== 200) {
    const raw = typeof resData === "string" ? resData : JSON.stringify(resData);
    errorSnippet = raw.slice(0, 250);
  }

  return {
    verdict: res.status === 200 ? "ok" : "broken",
    udafId: CONTROL_UDAF_ID,
    status: res.status,
    errorSnippet,
  };
}

// ─── Format elapsed ───────────────────────────────────────────────────────────

function fmtMs(ms: number | null): string {
  if (ms === null) return "never";
  const s = Math.round(ms / 1000);
  const m = Math.floor(s / 60);
  const sec = s % 60;
  return m > 0 ? `${m}m ${sec}s` : `${sec}s`;
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  const startedAt = Date.now();
  const token = await auth();

  const { id: eventTypeId, name: eventTypeName } = await getPurchaseEventTypeId(token);
  console.log(`[setup] Purchase event type ID: ${eventTypeId}`);

  const primaryId = await getACustomerPrimaryId(token);
  console.log(`[setup] Using customer primaryId: ${primaryId}`);

  // ── Control check: is the calculate endpoint working at all? ─────────────
  console.log("\n[control] Testing calculate on known-good UDAF (40ed934f)...");
  const control = await runControlCheck(token);

  if (control.verdict === "broken") {
    console.error(`[control] UDAF ${control.udafId} (pre-existing) returned HTTP ${control.status}`);
    console.error(`[control] Error: ${control.errorSnippet}`);
    console.error("");
    console.error("═══════════════════════════════════════════════════════");
    console.error(" EARLY EXIT: ENDPOINT IS BROKEN");
    console.error("═══════════════════════════════════════════════════════");
    console.error("A pre-existing UDAF (created before this run) returned 500.");
    console.error("This is NOT a timing/materialization issue — the calculate");
    console.error("endpoint itself is broken for this tenant.");
    console.error("");
    console.error("Possible causes:");
    console.error("  - Compute service is down or crashed");
    console.error("  - Shared tenant compute state is corrupted (known issue)");
    console.error("  - The endpoint has a new bug unrelated to UDAF age");
    console.error("");
    console.error("Next steps:");
    console.error("  1. Check if the compute service pod is running");
    console.error("  2. Try a different tenant (if available)");
    console.error("  3. File a bug — include the error snippet above");
    console.error("═══════════════════════════════════════════════════════");
    process.exit(1);
  } else {
    console.log(`[control] UDAF ${control.udafId} (pre-existing) → HTTP 200 ✓`);
    console.log("[control] Endpoint works for existing UDAFs — 500s on new UDAFs are a timing issue.\n");
  }

  const controlVerdictOk = control.verdict === "ok";

  // ── Create solo UDAF ──────────────────────────────────────────────────────
  console.log("\n[create] Creating solo UDAF...");
  const soloId = await createUdaf(token, "solo", eventTypeId, eventTypeName);
  const soloRecord: UdafRecord = {
    id: soloId, label: "solo",
    createdAt: Date.now(),
    firstSuccessMs: null, firstSuccessResult: null, pollLog: [],
  };
  console.log(`[create] Solo UDAF: ${soloId}`);

  // ── Create 5 batch UDAFs simultaneously ───────────────────────────────────
  console.log("[create] Creating 5 batch UDAFs simultaneously...");
  const batchIds = await Promise.all(
    [0, 1, 2, 3, 4].map(i => createUdaf(token, `batch_${i}`, eventTypeId, eventTypeName))
  );
  const batchCreatedAt = Date.now();
  const batchRecords: UdafRecord[] = batchIds.map((id, i) => ({
    id, label: `batch_${i}`,
    createdAt: batchCreatedAt,
    firstSuccessMs: null, firstSuccessResult: null, pollLog: [],
  }));
  console.log(`[create] Batch UDAFs: ${batchIds.join(", ")}`);

  const allRecords = [soloRecord, ...batchRecords];

  // ── First poll immediately ────────────────────────────────────────────────
  console.log("\n[poll] Polling immediately after creation (T+0)...");
  for (const rec of allRecords) {
    const entry = await pollOnce(token, rec.id, primaryId, rec.createdAt);
    rec.pollLog.push(entry);
    const errPart = entry.errorSnippet
      ? ` | err: ${entry.errorSnippet.slice(0, 80)}`
      : ` | result: ${JSON.stringify(entry.result).slice(0, 60)}`;
    console.log(`  [${rec.label}] ${fmtMs(entry.elapsedMs)} → HTTP ${entry.status}${errPart}`);
    if (entry.status === 200 && rec.firstSuccessMs === null) {
      rec.firstSuccessMs = entry.elapsedMs;
      rec.firstSuccessResult = entry.result;
    }
  }

  // ── Poll loop ─────────────────────────────────────────────────────────────
  const deadline = startedAt + MAX_WAIT_MS;
  let pollNum = 1;
  let consecutiveAllFailed = 0;

  while (Date.now() < deadline) {
    const remaining = deadline - Date.now();
    const stillPending = allRecords.filter(r => r.firstSuccessMs === null);
    if (stillPending.length === 0) {
      console.log("\n[done] All UDAFs succeeded — exiting poll loop early.");
      break;
    }

    const waitMs = Math.min(POLL_INTERVAL_MS, remaining);
    console.log(`\n[poll] Waiting ${waitMs / 1000}s (poll #${++pollNum}, ${stillPending.length} pending)...`);
    await sleep(waitMs);

    for (const rec of stillPending) {
      const entry = await pollOnce(token, rec.id, primaryId, rec.createdAt);
      rec.pollLog.push(entry);
      const errPart = entry.errorSnippet
        ? ` | err: ${entry.errorSnippet.slice(0, 80)}`
        : ` | result: ${JSON.stringify(entry.result).slice(0, 60)}`;
      console.log(`  [${rec.label}] ${fmtMs(entry.elapsedMs)} → HTTP ${entry.status}${errPart}`);
      if (entry.status === 200 && rec.firstSuccessMs === null) {
        rec.firstSuccessMs = entry.elapsedMs;
        rec.firstSuccessResult = entry.result;
        console.log(`  *** [${rec.label}] FIRST SUCCESS at ${fmtMs(entry.elapsedMs)} ***`);
      }
    }

    // ── Early abort: if control was broken and nothing is improving ───────
    const anySucceededThisPoll = stillPending.some(r => r.firstSuccessMs !== null);
    if (!anySucceededThisPoll) {
      consecutiveAllFailed++;
    } else {
      consecutiveAllFailed = 0;
    }

    if (!controlVerdictOk && consecutiveAllFailed >= EARLY_ABORT_POLLS) {
      console.error(`\n[abort] ${EARLY_ABORT_POLLS} consecutive polls with 0 successes.`);
      console.error("[abort] Control check also failed — endpoint appears permanently broken.");
      console.error("[abort] Exiting early instead of waiting the full 45 minutes.");
      console.error("[abort] Check compute service health before re-running.");
      break;
    }

    // ── Warn (but don't abort) if control was ok but still no progress ───
    if (controlVerdictOk && consecutiveAllFailed >= EARLY_ABORT_POLLS) {
      const elapsedMin = Math.round((Date.now() - startedAt) / 60_000);
      console.warn(`\n[warn] ${consecutiveAllFailed} polls with no successes (${elapsedMin} min elapsed).`);
      console.warn("[warn] Control UDAF works, so endpoint is alive — UDAFs may just need more time.");
      console.warn("[warn] Continuing to poll. Ctrl+C to stop early.");
    }
  }

  // ── Analysis ──────────────────────────────────────────────────────────────
  console.log("\n═══════════════════════════════════════════════════════");
  console.log(" TIMING RESULTS");
  console.log("═══════════════════════════════════════════════════════");
  console.log(`${"UDAF".padEnd(12)} ${"Created at".padEnd(10)} ${"First OK".padEnd(12)} ${"Last status"}`);
  console.log("─".repeat(55));
  for (const rec of allRecords) {
    const lastEntry = rec.pollLog[rec.pollLog.length - 1];
    console.log(
      `${rec.label.padEnd(12)} ${fmtMs(rec.createdAt - startedAt).padEnd(10)} ${fmtMs(rec.firstSuccessMs).padEnd(12)} ${lastEntry?.status ?? "?"}`
    );
  }

  // ── Interpretation ────────────────────────────────────────────────────────
  const batchSuccessTimes = batchRecords
    .map(r => r.firstSuccessMs)
    .filter((t): t is number => t !== null);

  console.log("\n═══════════════════════════════════════════════════════");
  console.log(" INTERPRETATION");
  console.log("═══════════════════════════════════════════════════════");

  if (batchSuccessTimes.length === 0) {
    if (!controlVerdictOk) {
      console.log("❌ No batch UDAFs succeeded AND control UDAF also failed.");
      console.log("   → ENDPOINT IS BROKEN — this is not a timing issue.");
      console.log("   → File a bug. Do not re-run the diagnostic until compute service is fixed.");
    } else {
      console.log("❌ No batch UDAFs succeeded within the window (control UDAF works).");
      console.log("   → Cache refresh interval may be longer than 45 minutes.");
      console.log("   → Re-run with a larger MAX_WAIT_MS, or check compute service logs.");
    }
  } else {
    const minT = Math.min(...batchSuccessTimes);
    const maxT = Math.max(...batchSuccessTimes);
    const variance = maxT - minT;

    console.log(`Batch UDAFs: ${batchSuccessTimes.length}/${batchRecords.length} succeeded`);
    console.log(`First-success spread: ${fmtMs(minT)} → ${fmtMs(maxT)} (variance: ${fmtMs(variance)})`);

    if (variance < POLL_INTERVAL_MS * 1.5) {
      console.log("\n✅ LOW VARIANCE → CACHE-REFRESH THEORY (A) supported");
      console.log("   All batch UDAFs transitioned within ~1 poll interval of each other.");
      console.log("   This indicates a periodic cache reload, not a work queue.");
      console.log("   Implication: the wait time is fixed (~cache interval), not load-dependent.");
      console.log("   Fix approach: reduce compute service UDAF cache TTL (developer action).");
    } else {
      console.log("\n⚠️  HIGH VARIANCE → QUEUE/LOAD THEORY (B) partially supported");
      console.log("   Batch UDAFs transitioned at very different times.");
      console.log("   This is consistent with queue processing (earlier-queued UDAFs finish first).");
      console.log("   Implication: wait time may scale with tenant load (more UDAFs = longer wait).");
      console.log("   Fix approach: investigate compute worker queue throughput.");
    }

    if (soloRecord.firstSuccessMs !== null && batchSuccessTimes.length > 0) {
      const soloT = soloRecord.firstSuccessMs;
      const batchAvg = batchSuccessTimes.reduce((a, b) => a + b, 0) / batchSuccessTimes.length;
      const ratio = batchAvg / soloT;
      console.log(`\nSolo UDAF succeeded at: ${fmtMs(soloT)}`);
      console.log(`Batch average:          ${fmtMs(batchAvg)}`);
      if (ratio > 1.5) {
        console.log(`⚠️  Batch took ${ratio.toFixed(1)}x longer than solo → load correlation detected`);
      } else {
        console.log(`✅ Solo and batch similar (${ratio.toFixed(1)}x ratio) → load not a factor`);
      }
    }
  }

  // ── Unique error messages across all polls ────────────────────────────────
  const errorMessages = new Set<string>();
  for (const rec of allRecords) {
    for (const entry of rec.pollLog) {
      if (entry.errorSnippet) errorMessages.add(entry.errorSnippet.slice(0, 150));
    }
  }
  if (errorMessages.size > 0) {
    console.log("\n─── Unique 500 error messages seen ───────────────────");
    for (const msg of errorMessages) {
      console.log(`  ${msg}`);
    }
  }

  // ── Save JSON report ──────────────────────────────────────────────────────
  const reportsDir = path.join(process.cwd(), "reports");
  if (!fs.existsSync(reportsDir)) fs.mkdirSync(reportsDir, { recursive: true });
  const outFile = path.join(reportsDir, `udaf-timing-diagnostic-${Date.now()}.json`);
  fs.writeFileSync(outFile, JSON.stringify({ startedAt, allRecords }, null, 2));
  console.log(`\n[report] Written to: ${outFile}`);

  // ── Cleanup: delete all UDAFs created by this diagnostic run ─────────────
  // Without cleanup, each run deposits 6 diag_ UDAFs on the shared tenant.
  // These accumulate and could pollute future control checks.
  console.log("\n[cleanup] Deleting diagnostic UDAFs created this run...");
  for (const rec of allRecords) {
    const res = await fetch(`${BASE_URL}/api/tenants/udafs/${rec.id}`, {
      method: "DELETE",
      headers: { Authorization: `Bearer ${token}` },
    });
    const icon = (res.status === 200 || res.status === 204) ? "✓" : `✗ (HTTP ${res.status})`;
    console.log(`  [${rec.label}] ${icon}`);
  }
}

main().catch(err => {
  console.error("[fatal]", err);
  process.exit(1);
});
