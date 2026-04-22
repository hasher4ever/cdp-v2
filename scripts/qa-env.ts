/**
 * Environment pre-flight. Verifies the CDP backend is reachable, auth works,
 * and an authenticated endpoint responds before committing a suite run.
 *
 * No LLM. No browser. Just HTTP.
 *
 * Usage:
 *   npx tsx scripts/qa-env.ts             # full probe, writes reports/env.json
 *   npx tsx scripts/qa-env.ts --quiet     # no stdout, exit code only
 *   npx tsx scripts/qa-env.ts --json      # machine-readable to stdout
 *
 * Exit codes:
 *   0 — all checks green (safe to run tests)
 *   1 — at least one check failed (abort before burning CI minutes)
 *
 * Credentials come from .env via dotenv, matching tests_backend/setup.ts.
 */
import dotenv from "dotenv";
import { writeFileSync, mkdirSync } from "fs";
import { resolve } from "path";

dotenv.config();

interface CheckResult {
  name: string;
  ok: boolean;
  status?: number;
  durationMs: number;
  detail?: string;
}

interface EnvReport {
  version: 1;
  generatedAt: string;
  baseUrl: string;
  tenantId: string;
  overall: "HEALTHY" | "DEGRADED" | "DOWN";
  checks: CheckResult[];
}

interface Opts {
  quiet: boolean;
  json: boolean;
}

const ROOT = process.cwd();
const REPORT_PATH = resolve(ROOT, "reports", "env.json");

// Thresholds — cheap, proven numbers. Tune in CI if they're wrong.
const SLOW_MS = 2000;
const TIMEOUT_MS = 10000;

function parseArgs(argv: string[]): Opts {
  const opts: Opts = { quiet: false, json: false };
  for (const a of argv) {
    if (a === "--quiet") opts.quiet = true;
    else if (a === "--json") opts.json = true;
    else if (a === "--help" || a === "-h") {
      console.log(`Usage:
  npx tsx scripts/qa-env.ts            full probe -> reports/env.json, exit 0/1
  npx tsx scripts/qa-env.ts --quiet    no stdout, exit code only
  npx tsx scripts/qa-env.ts --json     machine-readable stdout`);
      process.exit(0);
    }
  }
  return opts;
}

async function timed<T>(fn: () => Promise<T>): Promise<{ value: T | null; error?: string; ms: number }> {
  const t0 = Date.now();
  try {
    const value = await fn();
    return { value, ms: Date.now() - t0 };
  } catch (err) {
    return { value: null, error: (err as Error).message, ms: Date.now() - t0 };
  }
}

function fetchWithTimeout(url: string, init: RequestInit = {}, ms = TIMEOUT_MS): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), ms);
  return fetch(url, { ...init, signal: controller.signal }).finally(() => clearTimeout(timer));
}

async function probeReachability(baseUrl: string): Promise<CheckResult> {
  const r = await timed(() => fetchWithTimeout(`${baseUrl}/public/api/signin`, { method: "OPTIONS" }));
  if (r.value) {
    // OPTIONS may 200, 204, or 405 depending on server — any HTTP response means reachable.
    return { name: "reachability", ok: r.value.status < 500, status: r.value.status, durationMs: r.ms };
  }
  return { name: "reachability", ok: false, durationMs: r.ms, detail: r.error ?? "no response" };
}

async function probeAuth(baseUrl: string, domain: string, email: string, password: string): Promise<CheckResult & { token?: string }> {
  const r = await timed(() => fetchWithTimeout(`${baseUrl}/public/api/signin`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username: email, password, domainName: domain }),
  }));
  if (!r.value) {
    return { name: "auth", ok: false, durationMs: r.ms, detail: r.error ?? "no response" };
  }
  const res = r.value;
  if (!res.ok) {
    const txt = (await res.text()).slice(0, 200);
    return { name: "auth", ok: false, status: res.status, durationMs: r.ms, detail: txt };
  }
  const body = await res.json().catch(() => ({} as any)) as { jwtToken?: string };
  if (!body.jwtToken) {
    return { name: "auth", ok: false, status: res.status, durationMs: r.ms, detail: "no jwtToken in response" };
  }
  return { name: "auth", ok: true, status: res.status, durationMs: r.ms, token: body.jwtToken };
}

async function probeAuthedEndpoint(baseUrl: string, token: string): Promise<CheckResult> {
  // /api/tenants/udafs is a cheap authenticated list — every healthy tenant has it.
  const r = await timed(() => fetchWithTimeout(`${baseUrl}/api/tenants/udafs`, {
    headers: { Authorization: `Bearer ${token}` },
  }));
  if (!r.value) {
    return { name: "authed-endpoint", ok: false, durationMs: r.ms, detail: r.error ?? "no response" };
  }
  const res = r.value;
  return {
    name: "authed-endpoint",
    ok: res.ok,
    status: res.status,
    durationMs: r.ms,
    detail: res.ok ? undefined : (await res.text()).slice(0, 200),
  };
}

function verdict(checks: CheckResult[]): EnvReport["overall"] {
  if (checks.some((c) => !c.ok)) return "DOWN";
  if (checks.some((c) => c.durationMs > SLOW_MS)) return "DEGRADED";
  return "HEALTHY";
}

function saveReport(report: EnvReport): void {
  mkdirSync(resolve(ROOT, "reports"), { recursive: true });
  writeFileSync(REPORT_PATH, JSON.stringify(report, null, 2) + "\n", "utf-8");
}

async function main(): Promise<number> {
  const opts = parseArgs(process.argv.slice(2));

  const baseUrl  = process.env.CDP_BASE_URL  ?? "https://cdpv2.ssd.uz";
  const domain   = process.env.CDP_DOMAIN    ?? "";
  const email    = process.env.CDP_EMAIL     ?? "";
  const password = process.env.CDP_PASSWORD  ?? "";
  const tenantId = process.env.CDP_TENANT_ID ?? "";

  const missing: string[] = [];
  if (!domain)   missing.push("CDP_DOMAIN");
  if (!email)    missing.push("CDP_EMAIL");
  if (!password) missing.push("CDP_PASSWORD");

  if (missing.length > 0) {
    const checks: CheckResult[] = [{
      name: "config",
      ok: false,
      durationMs: 0,
      detail: `missing .env keys: ${missing.join(", ")}`,
    }];
    const report: EnvReport = {
      version: 1,
      generatedAt: new Date().toISOString(),
      baseUrl,
      tenantId,
      overall: "DOWN",
      checks,
    };
    saveReport(report);
    if (opts.json) console.log(JSON.stringify(report, null, 2));
    else if (!opts.quiet) console.error(`[qa-env] DOWN — missing env: ${missing.join(", ")}`);
    return 1;
  }

  const checks: CheckResult[] = [];

  const reach = await probeReachability(baseUrl);
  checks.push(reach);

  let token: string | undefined;
  if (reach.ok) {
    const auth = await probeAuth(baseUrl, domain, email, password);
    token = auth.token;
    // strip the token before saving the check record — never leak secrets to disk
    const { token: _drop, ...publicFields } = auth;
    void _drop;
    checks.push(publicFields);

    if (auth.ok && token) {
      checks.push(await probeAuthedEndpoint(baseUrl, token));
    }
  }

  const overall = verdict(checks);
  const report: EnvReport = {
    version: 1,
    generatedAt: new Date().toISOString(),
    baseUrl,
    tenantId,
    overall,
    checks,
  };
  saveReport(report);

  if (opts.json) {
    console.log(JSON.stringify(report, null, 2));
  } else if (!opts.quiet) {
    const icon = overall === "HEALTHY" ? "✓" : overall === "DEGRADED" ? "⚠" : "✗";
    console.log(`[qa-env] ${icon} ${overall}  ${baseUrl}  tenant=${tenantId || "(unset)"}`);
    for (const c of checks) {
      const mark = c.ok ? "✓" : "✗";
      const slow = c.ok && c.durationMs > SLOW_MS ? "  (slow)" : "";
      const st   = c.status !== undefined ? ` status=${c.status}` : "";
      const dt   = c.detail ? `  ${c.detail.slice(0, 120)}` : "";
      console.log(`  ${mark} ${c.name.padEnd(18)} ${c.durationMs}ms${st}${slow}${dt}`);
    }
  }

  return overall === "DOWN" ? 1 : 0;
}

main().then((code) => process.exit(code)).catch((err) => {
  console.error(`[qa-env] fatal:`, (err as Error).message);
  process.exit(1);
});
