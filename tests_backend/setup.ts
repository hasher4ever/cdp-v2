import dotenv from "dotenv";
dotenv.config();

import { getAuthToken } from "./client";
interface ProvisionedTenant {
  tenantId: number;
  domain: string;
  email: string;
  password: string;
  token: string;
  customerFieldMap: Record<string, string>;
  eventFieldMap: Record<string, string>;
  purchaseEventTypeId: number;
}

declare global {
  var __cdp_token: string;
  var __cdp_base_url: string;
  var __cdp_tenant_id: string;
  /** Available only in business tests — the full provisioned tenant context */
  var __cdp_tenant: ProvisionedTenant | null;
}

const baseUrl = process.env.CDP_BASE_URL || "https://cdpv2.ssd.uz";
globalThis.__cdp_base_url = baseUrl;
globalThis.__cdp_tenant = null;

// Try to load provisioned tenant from global-setup (business tests only)
// Reuses .test-tenant.json if it exists (written by global-setup-shared.ts) — this
// avoids per-file re-authentication. The env flag is no longer required because the
// file's presence is authoritative; env flags don't always propagate to forked workers.
async function loadTenantContext() {
  try {
    const fs = await import("fs");
    const path = await import("path");
    const filePath = path.resolve(process.cwd(), ".test-tenant.json");
    if (fs.existsSync(filePath)) {
      const stat = fs.statSync(filePath);
      // Guard: ignore stale tenant files older than 1 hour (JWT lifetime safety)
      const ageMs = Date.now() - stat.mtimeMs;
      if (ageMs < 60 * 60 * 1000) {
        const tenant: ProvisionedTenant = JSON.parse(fs.readFileSync(filePath, "utf-8"));
        globalThis.__cdp_tenant = tenant;
        globalThis.__cdp_token = tenant.token;
        globalThis.__cdp_tenant_id = String(tenant.tenantId);
        console.log(`[CDP] Using cached tenant token: ${tenant.tenantId} (age ${Math.round(ageMs / 1000)}s)`);
        return;
      }
    }
  } catch { /* fall through to default auth */ }

  // Default: use .env credentials (backend tests, or if no provisioned tenant)
  const domain = process.env.CDP_DOMAIN || "1762934640.cdp.com";
  const email = process.env.CDP_EMAIL || "shop2025.11.12-13:04:00@cdp.ru";
  const password = process.env.CDP_PASSWORD || "qwerty123";
  const tenantId = process.env.CDP_TENANT_ID || "1762934640267";

  globalThis.__cdp_tenant_id = tenantId;

  if (process.env.CDP_AUTH_TOKEN) {
    globalThis.__cdp_token = process.env.CDP_AUTH_TOKEN;
  } else {
    globalThis.__cdp_token = await getAuthToken(baseUrl, domain, email, password);
    // Write-through cache: subsequent files in this run reuse the token instead of re-auth.
    // Safe because the file is guarded by a 1-hour mtime check above.
    try {
      const fs = await import("fs");
      const path = await import("path");
      const filePath = path.resolve(process.cwd(), ".test-tenant.json");
      fs.writeFileSync(
        filePath,
        JSON.stringify({
          tenantId: Number(tenantId),
          domain,
          email,
          password,
          token: globalThis.__cdp_token,
          customerFieldMap: {},
          eventFieldMap: {},
          purchaseEventTypeId: 0,
        }, null, 2),
      );
    } catch { /* non-fatal — next file will just re-auth */ }
  }
  console.log(`[CDP] Authenticated against ${baseUrl}, tenant ${tenantId}`);
}

await loadTenantContext();

// ── UDAF calculate health check (BUG-041 guard) ────────────────────────────
// Only runs once per test run — forked workers don't inherit env mutations, so
// the result is cached to `.udaf-health.json` (mtime-bounded) for siblings to read.
async function loadOrProbeUdafHealth(): Promise<void> {
  if (process.env.__CDP_UDAF_CALCULATE_HEALTHY !== undefined) return;
  try {
    const fs = await import("fs");
    const path = await import("path");
    const healthFile = path.resolve(process.cwd(), ".udaf-health.json");
    if (fs.existsSync(healthFile)) {
      const ageMs = Date.now() - fs.statSync(healthFile).mtimeMs;
      if (ageMs < 60 * 60 * 1000) {
        const cached = JSON.parse(fs.readFileSync(healthFile, "utf-8")) as { healthy: boolean };
        process.env.__CDP_UDAF_CALCULATE_HEALTHY = cached.healthy ? "true" : "false";
        return;
      }
    }
  } catch { /* fall through to probe */ }
}
await loadOrProbeUdafHealth();

if (process.env.__CDP_UDAF_CALCULATE_HEALTHY === undefined) {
  try {
    const udafRes = await fetch(`${baseUrl}/api/tenants/udafs`, {
      headers: { Authorization: `Bearer ${globalThis.__cdp_token}` },
    });
    if (udafRes.ok) {
      const udafData = await udafRes.json() as { items: Array<{ id: string; name: string }> };
      const candidates = (udafData.items || []).filter((u: any) => !u.name?.startsWith("diag_"));

      // Find a UDAF with a valid stored definition (non-empty aggType).
      // Corrupt records (empty aggType) always return 500 — using one as a probe
      // produces a false "broken" verdict.
      let probeId: string | null = null;
      for (const candidate of candidates) {
        const defRes = await fetch(`${baseUrl}/api/tenants/udafs/${(candidate as any).id}`, {
          headers: { Authorization: `Bearer ${globalThis.__cdp_token}` },
        });
        if (defRes.ok) {
          const def = await defRes.json() as { aggType?: string };
          if (def.aggType && def.aggType !== "") { probeId = (candidate as any).id; break; }
        }
      }

      if (probeId) {
        const custRes = await fetch(`${baseUrl}/api/tenant/data/customers`, {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${globalThis.__cdp_token}` },
          body: JSON.stringify({ fieldNames: ["primary_id"] }),
        });
        const custData = custRes.ok ? await custRes.json() : null;
        const primaryId = custData?.list?.[0]?.primary_id ?? custData?.customers?.[0]?.primary_id;
        if (primaryId) {
          const calcRes = await fetch(
            `${baseUrl}/api/tenants/udafs/${probeId}/calculate?primaryId=${primaryId}`,
            { method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${globalThis.__cdp_token}` } }
          );
          process.env.__CDP_UDAF_CALCULATE_HEALTHY = calcRes.status === 200 ? "true" : "false";
          if (calcRes.status !== 200) {
            console.warn(`[CDP] UDAF calculate BROKEN (HTTP ${calcRes.status}) — calculate tests will be skipped.`);
          }
        }
      } else {
        // No valid probe — assume healthy, don't suppress tests.
        process.env.__CDP_UDAF_CALCULATE_HEALTHY = "true";
      }
    }
    // Cache probe result so sibling worker files reuse it instead of re-probing.
    try {
      const fs = await import("fs");
      const path = await import("path");
      fs.writeFileSync(
        path.resolve(process.cwd(), ".udaf-health.json"),
        JSON.stringify({ healthy: process.env.__CDP_UDAF_CALCULATE_HEALTHY === "true" }),
      );
    } catch { /* non-fatal */ }
  } catch {
    // Non-fatal — tests will proceed, calculate-dependent ones may fail
  }
}
