/**
 * Rollup health. Aggregates everything CI cares about into one verdict:
 *   reports/env.json    — backend reachable, auth works
 *   reports/triage.json — tests pass or only known bugs fail
 *   reports/perf.json   — no latency regressions
 *
 * Writes reports/health.json with a single verdict (PASS / WARN / FAIL) and a
 * per-signal breakdown. This is the file CI dashboards / Slack bots should
 * read — one fetch, full picture.
 *
 * No LLM. No browser. No test execution. Pure JSON aggregation.
 *
 * Usage:
 *   npx tsx scripts/qa-health.ts              full rollup -> reports/health.json + stdout
 *   npx tsx scripts/qa-health.ts --json       machine-readable stdout
 *   npx tsx scripts/qa-health.ts --quiet      no stdout, exit code only
 *   npx tsx scripts/qa-health.ts --strict     exit 1 on WARN (default: only FAIL -> 1)
 *
 * Exit codes:
 *   0 — PASS or WARN (default) / PASS (--strict)
 *   1 — FAIL, or required input missing (default) / WARN or FAIL (--strict)
 *   2 — unexpected error (malformed JSON, filesystem problem)
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "fs";
import { resolve } from "path";

type Verdict = "PASS" | "WARN" | "FAIL" | "UNKNOWN";

interface SignalReport {
  name: "env" | "triage" | "perf";
  verdict: Verdict;
  summary: string;
  source: string;
  present: boolean;
  raw?: unknown;
}

interface HealthReport {
  version: 1;
  generatedAt: string;
  verdict: Verdict;
  signals: SignalReport[];
  headline: string;
}

interface Opts {
  quiet: boolean;
  json: boolean;
  strict: boolean;
}

const ROOT = process.cwd();
const REPORT_PATH = resolve(ROOT, "reports", "health.json");

function parseArgs(argv: string[]): Opts {
  const opts: Opts = { quiet: false, json: false, strict: false };
  for (const a of argv) {
    if (a === "--quiet") opts.quiet = true;
    else if (a === "--json") opts.json = true;
    else if (a === "--strict") opts.strict = true;
    else if (a === "--help" || a === "-h") {
      console.log(`Usage:
  npx tsx scripts/qa-health.ts            rollup -> reports/health.json
  npx tsx scripts/qa-health.ts --json     machine-readable stdout
  npx tsx scripts/qa-health.ts --quiet    no stdout
  npx tsx scripts/qa-health.ts --strict   exit 1 on WARN (default: only FAIL -> 1)`);
      process.exit(0);
    }
  }
  return opts;
}

function readJson(path: string): unknown | null {
  if (!existsSync(path)) return null;
  try {
    return JSON.parse(readFileSync(path, "utf-8"));
  } catch {
    return null;
  }
}

function readEnv(): SignalReport {
  const src = "reports/env.json";
  const raw = readJson(resolve(ROOT, src)) as { overall?: string; checks?: { name: string; ok: boolean }[] } | null;
  if (!raw) {
    return { name: "env", verdict: "UNKNOWN", summary: "not yet run — `npm run qa:env`", source: src, present: false };
  }
  const verdict: Verdict = raw.overall === "HEALTHY" ? "PASS" : raw.overall === "DEGRADED" ? "WARN" : "FAIL";
  const failed = (raw.checks ?? []).filter((c) => !c.ok).map((c) => c.name);
  const summary = verdict === "PASS"
    ? "backend healthy"
    : verdict === "WARN"
      ? "backend slow (>2s on one or more probes)"
      : `backend down: ${failed.length > 0 ? failed.join(", ") : "unknown"}`;
  return { name: "env", verdict, summary, source: src, present: true, raw };
}

function readTriage(): SignalReport {
  const src = "reports/triage.json";
  const raw = readJson(resolve(ROOT, src)) as { verdict?: string; summary?: { newFailures?: number; knownFailures?: number; fixedKnownFailures?: number; passed?: number; total?: number } } | null;
  if (!raw) {
    return { name: "triage", verdict: "UNKNOWN", summary: "not yet run — `npm run qa:triage`", source: src, present: false };
  }
  const v = raw.verdict === "PASS" ? "PASS" : raw.verdict === "WARN" ? "WARN" : raw.verdict === "FAIL" ? "FAIL" : "UNKNOWN";
  const s = raw.summary ?? {};
  const summary = v === "FAIL"
    ? `${s.newFailures ?? "?"} new regression(s); ${s.passed ?? "?"}/${s.total ?? "?"} pass`
    : v === "WARN"
      ? `${s.fixedKnownFailures ?? "?"} known bug(s) now passing — update expected-failures`
      : `${s.passed ?? "?"}/${s.total ?? "?"} pass; ${s.knownFailures ?? 0} known failing`;
  return { name: "triage", verdict: v, summary, source: src, present: true, raw };
}

function readPerf(): SignalReport {
  const src = "reports/perf.json";
  const raw = readJson(resolve(ROOT, src)) as { verdict?: string; summary?: { regression?: number; degraded?: number; error?: number; total?: number; slowest?: { name: string; medianMs: number } } } | null;
  if (!raw) {
    return { name: "perf", verdict: "UNKNOWN", summary: "not yet run — `npm run qa:perf`", source: src, present: false };
  }
  const v = raw.verdict === "PASS" ? "PASS" : raw.verdict === "WARN" ? "WARN" : raw.verdict === "FAIL" ? "FAIL" : "UNKNOWN";
  const s = raw.summary ?? {};
  const slow = s.slowest ? ` (slowest ${s.slowest.name} @ ${s.slowest.medianMs}ms)` : "";
  const summary = v === "FAIL"
    ? `${s.regression ?? 0} regression(s), ${s.error ?? 0} error(s)${slow}`
    : v === "WARN"
      ? `${s.degraded ?? 0} degraded endpoint(s)${slow}`
      : `all stable${slow}`;
  return { name: "perf", verdict: v, summary, source: src, present: true, raw };
}

function rollup(signals: SignalReport[]): Verdict {
  // Required signals: env + triage. perf is optional — treat missing perf as UNKNOWN-pass.
  const env = signals.find((s) => s.name === "env")!;
  const triage = signals.find((s) => s.name === "triage")!;
  if (!env.present || !triage.present) return "FAIL";

  // Strong inputs win: any FAIL → FAIL.
  if (signals.some((s) => s.verdict === "FAIL")) return "FAIL";
  if (signals.some((s) => s.verdict === "WARN")) return "WARN";
  // UNKNOWN on optional signals is tolerable — still PASS.
  return "PASS";
}

function headline(verdict: Verdict, signals: SignalReport[]): string {
  const mark = verdict === "PASS" ? "✓" : verdict === "WARN" ? "⚠" : "✗";
  const env = signals.find((s) => s.name === "env")!;
  const triage = signals.find((s) => s.name === "triage")!;
  const perf = signals.find((s) => s.name === "perf")!;
  return `${mark} ${verdict}  env=${env.verdict}  triage=${triage.verdict}  perf=${perf.verdict}`;
}

function saveReport(report: HealthReport): void {
  mkdirSync(resolve(ROOT, "reports"), { recursive: true });
  // Don't persist raw JSON of the upstream reports — they're already on disk.
  const slim: HealthReport = {
    ...report,
    signals: report.signals.map(({ raw: _raw, ...rest }) => rest),
  };
  writeFileSync(REPORT_PATH, JSON.stringify(slim, null, 2) + "\n", "utf-8");
}

function printHuman(report: HealthReport): void {
  console.log(`[qa-health] ${report.headline}`);
  for (const s of report.signals) {
    const icon = s.verdict === "PASS" ? "✓" : s.verdict === "WARN" ? "⚠" : s.verdict === "FAIL" ? "✗" : "?";
    console.log(`  ${icon} ${s.name.padEnd(7)} ${s.verdict.padEnd(8)} ${s.summary}`);
  }
}

async function main(): Promise<number> {
  const opts = parseArgs(process.argv.slice(2));

  const signals: SignalReport[] = [readEnv(), readTriage(), readPerf()];
  const verdict = rollup(signals);
  const report: HealthReport = {
    version: 1,
    generatedAt: new Date().toISOString(),
    verdict,
    signals,
    headline: headline(verdict, signals),
  };

  try {
    saveReport(report);
  } catch (err) {
    console.error(`[qa-health] fatal write: ${(err as Error).message}`);
    return 2;
  }

  if (opts.json) console.log(JSON.stringify(report, null, 2));
  else if (!opts.quiet) printHuman(report);

  if (verdict === "FAIL") return 1;
  if (verdict === "WARN") return opts.strict ? 1 : 0;
  return 0;
}

main().then((code) => process.exit(code)).catch((err) => {
  console.error(`[qa-health] fatal:`, (err as Error).message);
  process.exit(2);
});
