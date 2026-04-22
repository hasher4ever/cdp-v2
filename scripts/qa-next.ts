/**
 * What to do next. Reads reports/{env,triage,perf,health}.json and the
 * expected-failures manifest, walks a fixed decision tree, and emits a
 * rank-ordered action list to reports/next.json + stdout.
 *
 * No LLM. No state.md. No timestamp heuristics.
 */
import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from "fs";
import { resolve } from "path";

type Severity = "BLOCKER" | "HIGH" | "MEDIUM" | "LOW";

interface Action {
  id: string;
  severity: Severity;
  title: string;
  command?: string;
  why: string;
  detail?: string;
}

interface NextReport {
  version: 1;
  generatedAt: string;
  top: Action | null;
  actions: Action[];
  inputs: {
    env: { present: boolean; verdict?: string; ageSec?: number };
    triage: { present: boolean; verdict?: string; ageSec?: number };
    perf: { present: boolean; verdict?: string; ageSec?: number };
    health: { present: boolean; verdict?: string; ageSec?: number };
    expectedFailures: { present: boolean; total: number; unclassified: number };
  };
}

interface Opts { json: boolean; quiet: boolean; top: boolean }

const ROOT = process.cwd();
const REPORTS = resolve(ROOT, "reports");
const NEXT_PATH = resolve(REPORTS, "next.json");
const STALE_SEC = 24 * 60 * 60;

function parseArgs(argv: string[]): Opts {
  const opts: Opts = { json: false, quiet: false, top: false };
  for (const a of argv) {
    if (a === "--json") opts.json = true;
    else if (a === "--quiet") opts.quiet = true;
    else if (a === "--top") opts.top = true;
    else if (a === "--help" || a === "-h") {
      console.log("Usage: npx tsx scripts/qa-next.ts [--json|--quiet|--top]");
      process.exit(0);
    }
  }
  return opts;
}

function readJsonSafe<T = unknown>(path: string): T | null {
  if (!existsSync(path)) return null;
  try { return JSON.parse(readFileSync(path, "utf-8")) as T; }
  catch { return null; }
}

function ageSec(path: string): number | undefined {
  try { return Math.floor((Date.now() - statSync(path).mtimeMs) / 1000); }
  catch { return undefined; }
}

function severityWeight(s: Severity): number {
  return s === "BLOCKER" ? 0 : s === "HIGH" ? 1 : s === "MEDIUM" ? 2 : 3;
}

interface EnvReport { overall?: string; checks?: { name: string; ok: boolean; detail?: string }[] }
interface TriageReport { verdict?: string; summary?: { backend?: { passed?: number; failed?: number; total?: number }; business?: { passed?: number; failed?: number; total?: number }; overall?: { passed?: number; failed?: number; total?: number } } & Record<string, unknown>; counts?: { newFailures?: number; knownFailures?: number; fixedKnownFailures?: number }; lists?: { newFailures?: { suite: string; file: string; fullName: string }[]; fixedKnownFailures?: unknown[] } }
interface PerfReport { verdict?: string; summary?: { regression?: number; degraded?: number; error?: number; slowest?: { name: string; medianMs: number } }; diff?: { name: string; status: string; changePct: number | null }[] }
interface HealthReport { verdict?: string }
interface ExpectedFailures { entries?: { suite: string; file: string; fullName: string; bugId: string | null }[] }

function decide(): { actions: Action[]; inputs: NextReport["inputs"] } {
  const envPath = resolve(REPORTS, "env.json");
  const triPath = resolve(REPORTS, "triage.json");
  const perfPath = resolve(REPORTS, "perf.json");
  const healthPath = resolve(REPORTS, "health.json");
  const efPath = resolve(REPORTS, "expected-failures.json");

  const env = readJsonSafe<EnvReport>(envPath);
  const triage = readJsonSafe<TriageReport>(triPath);
  const perf = readJsonSafe<PerfReport>(perfPath);
  const health = readJsonSafe<HealthReport>(healthPath);
  const ef = readJsonSafe<ExpectedFailures>(efPath);

  const efEntries = ef?.entries ?? [];
  const unclassified = efEntries.filter((e) => !e.bugId || e.bugId === "UNCLASSIFIED").length;

  const inputs: NextReport["inputs"] = {
    env:    { present: !!env,    verdict: env?.overall,    ageSec: ageSec(envPath) },
    triage: { present: !!triage, verdict: triage?.verdict, ageSec: ageSec(triPath) },
    perf:   { present: !!perf,   verdict: perf?.verdict,   ageSec: ageSec(perfPath) },
    health: { present: !!health, verdict: health?.verdict, ageSec: ageSec(healthPath) },
    expectedFailures: { present: !!ef, total: efEntries.length, unclassified },
  };

  const actions: Action[] = [];

  if (env && env.overall === "DOWN") {
    const failed = (env.checks ?? []).filter((c) => !c.ok).map((c) => c.name).join(", ") || "unknown";
    actions.push({
      id: "fix-env", severity: "BLOCKER",
      title: "Backend is DOWN - fix environment before running tests",
      command: "npm run qa:env",
      why: "env.json reports overall=DOWN (" + failed + ")",
      detail: "Check .env credentials, CDP_BASE_URL reachability, and whether the backend service is up.",
    });
  }

  if (!env) {
    actions.push({
      id: "run-env", severity: "HIGH",
      title: "Run environment pre-flight",
      command: "npm run qa:env",
      why: "reports/env.json does not exist - haven't verified the backend is reachable yet",
    });
  } else if (inputs.env.ageSec !== undefined && inputs.env.ageSec > STALE_SEC) {
    actions.push({
      id: "refresh-env", severity: "LOW",
      title: "Environment probe is stale - refresh before the next run",
      command: "npm run qa:env",
      why: "env.json is " + Math.floor((inputs.env.ageSec ?? 0) / 3600) + "h old",
    });
  }

  if (triage && triage.verdict === "FAIL") {
    const newCount = triage.counts?.newFailures ?? 0;
    const firstFew = (triage.lists?.newFailures ?? []).slice(0, 3).map((f) => f.fullName);
    actions.push({
      id: "investigate-regressions", severity: "BLOCKER",
      title: "Investigate " + newCount + " test regression(s)",
      command: "cat reports/triage.json | jq '.lists.newFailures[:5]'",
      why: "triage.json verdict=FAIL - tests that were passing are now failing",
      detail: firstFew.length > 0 ? "Top: " + firstFew.join(" | ") : undefined,
    });
  }

  if (triage && triage.verdict === "WARN") {
    const fixedCount = triage.counts?.fixedKnownFailures ?? 0;
    actions.push({
      id: "update-expected-failures", severity: "HIGH",
      title: "Update expected-failures manifest (" + fixedCount + " known bug(s) now passing)",
      command: "npm run qa:triage:bootstrap",
      why: "triage.json verdict=WARN - previously-failing tests are now passing. Either a bug was fixed (update bugs.md) or the test was accidentally weakened.",
    });
  }

  if (!triage) {
    actions.push({
      id: "run-triage", severity: "HIGH",
      title: "Run backend tests + triage",
      command: "npm run test:backend && npm run qa:triage",
      why: "reports/triage.json does not exist - no pass/fail picture for the current code",
    });
  }

  if (perf && perf.verdict === "FAIL") {
    const regressed = (perf.diff ?? []).filter((d) => d.status === "REGRESSION").slice(0, 3)
      .map((d) => d.name + " +" + d.changePct + "%").join(", ");
    actions.push({
      id: "investigate-perf-regression", severity: "BLOCKER",
      title: "Investigate " + (perf.summary?.regression ?? "?") + " latency regression(s)",
      command: "cat reports/perf.json | jq '.diff[] | select(.status==\"REGRESSION\")'",
      why: "perf.json verdict=FAIL - endpoints >50% slower than baseline",
      detail: regressed ? "Top: " + regressed : undefined,
    });
  }

  if (perf && perf.verdict === "WARN") {
    actions.push({
      id: "watch-perf", severity: "MEDIUM",
      title: "Watch " + (perf.summary?.degraded ?? "?") + " degraded endpoint(s)",
      command: "cat reports/perf.json | jq '.diff[] | select(.status==\"DEGRADED\")'",
      why: "perf.json verdict=WARN - endpoints 10-50% slower than baseline. Not a regression yet, but trending.",
    });
  }

  if (!perf) {
    actions.push({
      id: "run-perf", severity: "LOW",
      title: "Capture a perf baseline (first-run) or latest snapshot",
      command: existsSync(resolve(REPORTS, "perf-baseline.json")) ? "npm run qa:perf" : "npm run qa:perf:baseline",
      why: "reports/perf.json does not exist - no latency data for this build",
    });
  }

  if (ef && unclassified > 0) {
    actions.push({
      id: "annotate-expected-failures", severity: "MEDIUM",
      title: "Annotate " + unclassified + " unclassified failure(s) with bug IDs",
      command: "npx tsx scripts/qa-annotate-ef.ts --apply",
      why: "expected-failures.json has entries without bug IDs - qa-gate --strict will treat them as unvetted known failures",
      detail: "Run the annotator for suggestions; review reports/ef-suggestions.json before applying.",
    });
  }

  if (actions.length === 0) {
    actions.push({
      id: "full-cycle", severity: "LOW",
      title: "All signals green - run the full CI cycle",
      command: "npm run qa:ci",
      why: "env + triage + perf all PASS and no unclassified entries remain",
    });
  }

  actions.sort((a, b) => severityWeight(a.severity) - severityWeight(b.severity));
  return { actions, inputs };
}

function saveReport(report: NextReport): void {
  mkdirSync(REPORTS, { recursive: true });
  writeFileSync(NEXT_PATH, JSON.stringify(report, null, 2) + "\n", "utf-8");
}

function printAction(a: Action, rank?: number): void {
  const icon = a.severity === "BLOCKER" ? "X" : a.severity === "HIGH" ? "!" : a.severity === "MEDIUM" ? "*" : "-";
  const head = rank !== undefined ? rank + ". " : "";
  console.log("  " + icon + " " + head + "[" + a.severity + "] " + a.title);
  if (a.command) console.log("      $ " + a.command);
  console.log("      why: " + a.why);
  if (a.detail) console.log("      " + a.detail);
}

function printHuman(report: NextReport): void {
  const n = report.actions.length;
  const summaryParts = Object.entries(report.inputs).map(([k, v]) => {
    if (k === "expectedFailures") {
      const x = v as { present: boolean; total: number; unclassified: number };
      return "ef=" + (x.present ? x.unclassified + "/" + x.total + " unclassified" : "missing");
    }
    const vt = v as { present: boolean; verdict?: string };
    return k + "=" + (vt.present ? (vt.verdict ?? "?") : "missing");
  });
  console.log("[qa-next] " + n + " action" + (n === 1 ? "" : "s") + " - inputs: " + summaryParts.join(" "));
  report.actions.forEach((a, i) => printAction(a, i + 1));
}

async function main(): Promise<number> {
  const opts = parseArgs(process.argv.slice(2));
  const { actions, inputs } = decide();
  const report: NextReport = {
    version: 1, generatedAt: new Date().toISOString(),
    top: actions[0] ?? null, actions, inputs,
  };
  saveReport(report);

  if (opts.json) console.log(JSON.stringify(report, null, 2));
  else if (!opts.quiet) {
    if (opts.top && report.top) printAction(report.top);
    else printHuman(report);
  }
  return 0;
}

main().then((code) => process.exit(code)).catch((err) => {
  console.error("[qa-next] fatal:", (err as Error).message);
  process.exit(2);
});
