/**
 * API latency probe. Hits a curated set of cheap, authenticated endpoints,
 * takes 3 samples per endpoint, records the median, and diffs against a
 * persisted baseline in reports/perf-baseline.json.
 *
 * No LLM. No browser. No load testing — single-request latency only.
 *
 * Usage:
 *   npx tsx scripts/qa-perf.ts                # measure, diff against baseline
 *   npx tsx scripts/qa-perf.ts --baseline     # overwrite baseline with this run
 *   npx tsx scripts/qa-perf.ts --samples=5    # override sample count (default 3)
 *   npx tsx scripts/qa-perf.ts --json         # machine-readable stdout
 *   npx tsx scripts/qa-perf.ts --quiet        # no stdout, exit code only
 *
 * Outputs:
 *   reports/perf.json                         # latest snapshot (always)
 *   reports/perf-baseline.json                # baseline (only on --baseline)
 *
 * Exit codes:
 *   0 — all endpoints STABLE / IMPROVED / DEGRADED
 *   1 — at least one endpoint REGRESSION (>50% slower) or endpoint errored
 *
 * Credentials come from .env via dotenv, same as qa-env.ts.
 */
import dotenv from "dotenv";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "fs";
import { resolve } from "path";

dotenv.config();

type Status = "STABLE" | "IMPROVED" | "DEGRADED" | "REGRESSION" | "ERROR" | "NEW";

interface Endpoint {
  name: string;
  method: "GET" | "POST";
  path: string;
  body?: unknown;
}

interface EndpointResult {
  name: string;
  method: string;
  path: string;
  samples: number[];
  medianMs: number | null;
  httpStatus: number | null;
  error?: string;
}

interface EndpointDiff {
  name: string;
  medianMs: number | null;
  baselineMs: number | null;
  changePct: number | null;
  status: Status;
  error?: string;
}

interface PerfReport {
  version: 1;
  generatedAt: string;
  baseUrl: string;
  samplesPerEndpoint: number;
  endpoints: EndpointResult[];
  diff: EndpointDiff[];
  summary: {
    total: number;
    stable: number;
    improved: number;
    degraded: number;
    regression: number;
    error: number;
    newBaseline: number;
    slowest?: { name: string; medianMs: number };
  };
  verdict: "PASS" | "WARN" | "FAIL";
}

interface Baseline {
  version: 1;
  generatedAt: string;
  endpoints: Record<string, { medianMs: number }>;
}

interface Opts {
  setBaseline: boolean;
  samples: number;
  quiet: boolean;
  json: boolean;
}

const ROOT = process.cwd();
const REPORT_PATH = resolve(ROOT, "reports", "perf.json");
const BASELINE_PATH = resolve(ROOT, "reports", "perf-baseline.json");

const TIMEOUT_MS = 15000;
const DEGRADED_PCT = 10;     // > 10 % slower → DEGRADED
const REGRESSION_PCT = 50;   // > 50 % slower → REGRESSION

// Curated cheap endpoints. All GET unless noted. Selected for stable surface
// area — schema reads, list endpoints with small pagination, tenant metadata.
const ENDPOINTS: Endpoint[] = [
  { name: "tenants/info",                   method: "GET", path: "/api/tenants/info" },
  { name: "tenants/udafs",                  method: "GET", path: "/api/tenants/udafs" },
  { name: "tenants/udafs/types",            method: "GET", path: "/api/tenants/udafs/types" },
  { name: "schema/customers/fields",        method: "GET", path: "/api/tenants/schema/customers/fields" },
  { name: "schema/event-types",             method: "GET", path: "/api/tenants/schema/event-types" },
  { name: "commchan",                       method: "GET", path: "/api/tenants/commchan" },
  { name: "segmentation (list)",            method: "GET", path: "/api/tenants/segmentation?page=1&size=10" },
  { name: "campaign (list)",                method: "GET", path: "/api/tenants/campaign?page=1&size=10" },
  { name: "data/count",                     method: "GET", path: "/api/tenant/data/count" },
  { name: "template (list)",                method: "GET", path: "/api/tenant/template?page=1&size=10" },
  { name: "ui/settings",                    method: "GET", path: "/api/tenant/ui/settings" },
  { name: "data/customers (list)",          method: "POST", path: "/api/tenant/data/customers", body: { pagination: { page: 1, size: 10 } } },
];

function parseArgs(argv: string[]): Opts {
  const opts: Opts = { setBaseline: false, samples: 3, quiet: false, json: false };
  for (const a of argv) {
    if (a === "--baseline") opts.setBaseline = true;
    else if (a === "--quiet") opts.quiet = true;
    else if (a === "--json") opts.json = true;
    else if (a.startsWith("--samples=")) {
      const n = Number(a.split("=", 2)[1]);
      if (Number.isFinite(n) && n >= 1 && n <= 20) opts.samples = Math.floor(n);
    } else if (a === "--help" || a === "-h") {
      console.log(`Usage:
  npx tsx scripts/qa-perf.ts              measure + diff -> reports/perf.json
  npx tsx scripts/qa-perf.ts --baseline   overwrite reports/perf-baseline.json with this run
  npx tsx scripts/qa-perf.ts --samples=N  samples per endpoint (default 3, max 20)
  npx tsx scripts/qa-perf.ts --json       machine-readable stdout
  npx tsx scripts/qa-perf.ts --quiet      no stdout, exit code only`);
      process.exit(0);
    }
  }
  return opts;
}

function fetchWithTimeout(url: string, init: RequestInit = {}, ms = TIMEOUT_MS): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), ms);
  return fetch(url, { ...init, signal: controller.signal }).finally(() => clearTimeout(timer));
}

async function signIn(baseUrl: string, domain: string, email: string, password: string): Promise<string> {
  const res = await fetchWithTimeout(`${baseUrl}/public/api/signin`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username: email, password, domainName: domain }),
  });
  if (!res.ok) throw new Error(`signin ${res.status}: ${(await res.text()).slice(0, 200)}`);
  const body = await res.json() as { jwtToken?: string };
  if (!body.jwtToken) throw new Error("no jwtToken in signin response");
  return body.jwtToken;
}

async function measure(baseUrl: string, token: string, ep: Endpoint, samples: number): Promise<EndpointResult> {
  const headers: Record<string, string> = { Authorization: `Bearer ${token}` };
  if (ep.method === "POST") headers["Content-Type"] = "application/json";

  const times: number[] = [];
  let httpStatus: number | null = null;
  let error: string | undefined;

  // One warm-up call — discarded. Drops cold-cache noise so the 3 recorded
  // samples actually reflect steady-state latency.
  try {
    const warm = await fetchWithTimeout(`${baseUrl}${ep.path}`, {
      method: ep.method,
      headers,
      body: ep.body !== undefined ? JSON.stringify(ep.body) : undefined,
    });
    await warm.text();
  } catch { /* ignore warm-up failures — they'll surface on the real samples */ }

  for (let i = 0; i < samples; i++) {
    const t0 = Date.now();
    try {
      const res = await fetchWithTimeout(`${baseUrl}${ep.path}`, {
        method: ep.method,
        headers,
        body: ep.body !== undefined ? JSON.stringify(ep.body) : undefined,
      });
      const elapsed = Date.now() - t0;
      await res.text(); // drain body — some servers keep connection open until drained
      httpStatus = res.status;
      if (!res.ok) {
        error = error ?? `HTTP ${res.status}`;
        // still record the timing — a consistent 4xx can still be measured
      }
      times.push(elapsed);
    } catch (err) {
      error = error ?? (err as Error).message;
      times.push(Date.now() - t0);
    }
  }

  const medianMs = times.length > 0 ? median(times) : null;
  return { name: ep.name, method: ep.method, path: ep.path, samples: times, medianMs, httpStatus, error };
}

function median(xs: number[]): number {
  const sorted = [...xs].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? Math.round((sorted[mid - 1] + sorted[mid]) / 2) : sorted[mid];
}

function loadBaseline(): Baseline | null {
  if (!existsSync(BASELINE_PATH)) return null;
  try {
    const raw = readFileSync(BASELINE_PATH, "utf-8");
    return JSON.parse(raw) as Baseline;
  } catch (err) {
    console.error(`[qa-perf] warn: could not parse baseline: ${(err as Error).message}`);
    return null;
  }
}

function classify(current: EndpointResult, baseline: Baseline | null): EndpointDiff {
  if (current.error && current.medianMs === null) {
    return { name: current.name, medianMs: null, baselineMs: null, changePct: null, status: "ERROR", error: current.error };
  }
  const baselineEntry = baseline?.endpoints?.[current.name];
  if (!baselineEntry) {
    return { name: current.name, medianMs: current.medianMs, baselineMs: null, changePct: null, status: "NEW" };
  }
  const changePct = ((current.medianMs! - baselineEntry.medianMs) / baselineEntry.medianMs) * 100;
  let status: Status;
  if (current.error) status = "ERROR";
  else if (changePct > REGRESSION_PCT) status = "REGRESSION";
  else if (changePct > DEGRADED_PCT) status = "DEGRADED";
  else if (changePct < -DEGRADED_PCT) status = "IMPROVED";
  else status = "STABLE";
  return {
    name: current.name,
    medianMs: current.medianMs,
    baselineMs: baselineEntry.medianMs,
    changePct: Math.round(changePct * 10) / 10,
    status,
    error: current.error,
  };
}

function summarize(diffs: EndpointDiff[], endpoints: EndpointResult[]): PerfReport["summary"] {
  const s = { total: diffs.length, stable: 0, improved: 0, degraded: 0, regression: 0, error: 0, newBaseline: 0 };
  for (const d of diffs) {
    if (d.status === "STABLE") s.stable++;
    else if (d.status === "IMPROVED") s.improved++;
    else if (d.status === "DEGRADED") s.degraded++;
    else if (d.status === "REGRESSION") s.regression++;
    else if (d.status === "ERROR") s.error++;
    else if (d.status === "NEW") s.newBaseline++;
  }
  const withMedian = endpoints.filter((e) => e.medianMs !== null) as Array<EndpointResult & { medianMs: number }>;
  let slowest: { name: string; medianMs: number } | undefined;
  for (const e of withMedian) {
    if (!slowest || e.medianMs > slowest.medianMs) slowest = { name: e.name, medianMs: e.medianMs };
  }
  return { ...s, slowest };
}

function decideVerdict(summary: PerfReport["summary"]): PerfReport["verdict"] {
  if (summary.regression > 0 || summary.error > 0) return "FAIL";
  if (summary.degraded > 0) return "WARN";
  return "PASS";
}

function saveReport(report: PerfReport): void {
  mkdirSync(resolve(ROOT, "reports"), { recursive: true });
  writeFileSync(REPORT_PATH, JSON.stringify(report, null, 2) + "\n", "utf-8");
}

function saveBaseline(endpoints: EndpointResult[]): void {
  const baseline: Baseline = {
    version: 1,
    generatedAt: new Date().toISOString(),
    endpoints: {},
  };
  for (const e of endpoints) {
    if (e.medianMs !== null && !e.error) {
      baseline.endpoints[e.name] = { medianMs: e.medianMs };
    }
  }
  mkdirSync(resolve(ROOT, "reports"), { recursive: true });
  writeFileSync(BASELINE_PATH, JSON.stringify(baseline, null, 2) + "\n", "utf-8");
}

function printHuman(report: PerfReport): void {
  const icon = report.verdict === "PASS" ? "✓" : report.verdict === "WARN" ? "⚠" : "✗";
  console.log(`[qa-perf] ${icon} ${report.verdict}  ${report.baseUrl}  samples=${report.samplesPerEndpoint}`);
  for (const d of report.diff) {
    const status = d.status.padEnd(11);
    const med = d.medianMs !== null ? `${d.medianMs}ms`.padStart(7) : "   ---";
    const base = d.baselineMs !== null ? `${d.baselineMs}ms`.padStart(7) : "   ---";
    const delta = d.changePct !== null ? `${d.changePct >= 0 ? "+" : ""}${d.changePct.toFixed(1)}%` : "     ";
    const err = d.error ? `  ${d.error.slice(0, 80)}` : "";
    console.log(`  ${status}  ${med}  (base ${base}, ${delta})  ${d.name}${err}`);
  }
  const s = report.summary;
  console.log(`  ─── stable=${s.stable} improved=${s.improved} degraded=${s.degraded} regression=${s.regression} error=${s.error} new=${s.newBaseline}`);
  if (s.slowest) console.log(`  slowest: ${s.slowest.name} @ ${s.slowest.medianMs}ms`);
}

async function main(): Promise<number> {
  const opts = parseArgs(process.argv.slice(2));

  const baseUrl  = process.env.CDP_BASE_URL  ?? "https://cdpv2.ssd.uz";
  const domain   = process.env.CDP_DOMAIN    ?? "";
  const email    = process.env.CDP_EMAIL     ?? "";
  const password = process.env.CDP_PASSWORD  ?? "";

  const missing: string[] = [];
  if (!domain)   missing.push("CDP_DOMAIN");
  if (!email)    missing.push("CDP_EMAIL");
  if (!password) missing.push("CDP_PASSWORD");
  if (missing.length > 0) {
    if (!opts.quiet) console.error(`[qa-perf] missing env: ${missing.join(", ")}`);
    return 1;
  }

  let token: string;
  try {
    token = await signIn(baseUrl, domain, email, password);
  } catch (err) {
    if (!opts.quiet) console.error(`[qa-perf] auth failed: ${(err as Error).message}`);
    return 1;
  }

  const endpoints: EndpointResult[] = [];
  for (const ep of ENDPOINTS) {
    endpoints.push(await measure(baseUrl, token, ep, opts.samples));
  }

  const baseline = opts.setBaseline ? null : loadBaseline();
  const diff = endpoints.map((e) => classify(e, baseline));
  const summary = summarize(diff, endpoints);
  const verdict = decideVerdict(summary);

  const report: PerfReport = {
    version: 1,
    generatedAt: new Date().toISOString(),
    baseUrl,
    samplesPerEndpoint: opts.samples,
    endpoints,
    diff,
    summary,
    verdict,
  };
  saveReport(report);

  if (opts.setBaseline) {
    saveBaseline(endpoints);
  }

  if (opts.json) {
    console.log(JSON.stringify(report, null, 2));
  } else if (!opts.quiet) {
    if (opts.setBaseline) console.log(`[qa-perf] baseline written -> ${BASELINE_PATH}`);
    printHuman(report);
  }

  return verdict === "FAIL" ? 1 : 0;
}

main().then((code) => process.exit(code)).catch((err) => {
  console.error(`[qa-perf] fatal:`, (err as Error).message);
  process.exit(1);
});
