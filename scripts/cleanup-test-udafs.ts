#!/usr/bin/env npx tsx
/**
 * Cleanup stale test UDAFs from the shared tenant.
 *
 * Deletes UDAFs whose names match test-run patterns:
 *   T<digits><4-chars>_*   — business test tags (makeTag() format)
 *   diag_*                 — diagnostic script UDAFs
 *   test_udaf_*            — backend test UDAFs
 *   diag_p1_*              — phase1 setup script UDAFs
 *
 * Safe: only deletes test-tagged UDAFs, never production ones.
 * Useful after a failed run that left UDAFs behind, or to manually
 * clear accumulation before running the control check.
 *
 * Usage:
 *   npm run cleanup:udafs
 *   # or: npx tsx scripts/cleanup-test-udafs.ts
 *
 * Options:
 *   --dry-run   List what would be deleted without deleting
 */

import dotenv from "dotenv";
dotenv.config();

const BASE_URL = process.env.CDP_BASE_URL || "https://cdpv2.ssd.uz";
const DOMAIN   = "1762934640.cdp.com";
const EMAIL    = "shop2025.11.12-13:04:00@cdp.ru";
const PASSWORD = "qwerty123";

const DRY_RUN = process.argv.includes("--dry-run");

const TEST_PATTERNS = [
  /^T\d{10,}[a-z0-9]{4}_/i,   // makeTag() format: T1743123456abcd_...
  /^diag_/,                    // udaf-timing-diagnostic.ts
  /^diag_p1_/,                 // udaf-phase1-setup.ts (subset of diag_ but explicit)
  /^test_udaf_/,               // tests_backend/udafs.test.ts
];

function isTestUdaf(name: string): boolean {
  return TEST_PATTERNS.some(p => p.test(name));
}

async function main() {
  // ── Auth ──────────────────────────────────────────────────────────────────
  console.log("[cleanup] Authenticating...");
  const res = await fetch(`${BASE_URL}/public/api/signin`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username: EMAIL, password: PASSWORD, domainName: DOMAIN }),
  });
  if (!res.ok) throw new Error(`Auth failed: ${res.status}`);
  const { jwtToken: token } = await res.json() as { jwtToken: string };
  console.log("[cleanup] Auth OK");

  // ── List UDAFs ────────────────────────────────────────────────────────────
  const listRes = await fetch(`${BASE_URL}/api/tenants/udafs`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!listRes.ok) throw new Error(`List UDAFs failed: ${listRes.status}`);
  const { items }: { items: Array<{ id: string; name: string }> } = await listRes.json();

  const toDelete = items.filter(u => isTestUdaf(u.name));
  const toKeep   = items.filter(u => !isTestUdaf(u.name));

  console.log(`\n[cleanup] Total UDAFs: ${items.length}`);
  console.log(`[cleanup] Test UDAFs to delete: ${toDelete.length}`);
  console.log(`[cleanup] Non-test UDAFs to keep: ${toKeep.length}`);

  if (toDelete.length === 0) {
    console.log("[cleanup] Nothing to delete.");
    return;
  }

  if (DRY_RUN) {
    console.log("\n[cleanup] DRY RUN — would delete:");
    for (const u of toDelete) {
      console.log(`  ${u.id}  ${u.name}`);
    }
    return;
  }

  // ── Delete ────────────────────────────────────────────────────────────────
  console.log("\n[cleanup] Deleting...");
  let deleted = 0;
  let failed  = 0;
  for (const u of toDelete) {
    const r = await fetch(`${BASE_URL}/api/tenants/udafs/${u.id}`, {
      method: "DELETE",
      headers: { Authorization: `Bearer ${token}` },
    });
    if (r.status === 200 || r.status === 204) {
      console.log(`  ✓ deleted  ${u.id}  ${u.name}`);
      deleted++;
    } else {
      console.warn(`  ✗ HTTP ${r.status}  ${u.id}  ${u.name}`);
      failed++;
    }
  }

  console.log(`\n[cleanup] Done. Deleted: ${deleted}, Failed: ${failed}`);
  if (failed > 0) {
    console.warn("[cleanup] Some deletes failed — UDAF DELETE may have a bug (check entity-delete.test.ts).");
  }
}

main().catch(err => {
  console.error("[fatal]", err);
  process.exit(1);
});
