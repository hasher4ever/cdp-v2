/**
 * Deterministic test-result triage.
 *
 * Reads vitest JSON output, classifies every test against reports/expected-failures.json,
 * writes reports/triage.json. No LLM calls. Safe to run in CI.
 *
 * Usage:
 *   npx tsx scripts/qa-triage.ts                    # triage current results
 *   npx tsx scripts/qa-triage.ts --bootstrap        # (re)generate expected-failures.json from today's fails
 *   npx tsx scripts/qa-triage.ts --suite=backend    # triage a single suite
 *
 * Inputs:
 *   reports/vitest-backend-results.json   (produced by `npm run test:backend -- --reporter=json`)
 *   reports/vitest-business-results.json  (produced by `npm run test:business -- --reporter=json`)
 *   reports/expected-failures.json        (manifest of known-bug test failures)
 *
 * Output:
 *   reports/triage.json   (verdict + classified lists; qa-gate reads this)
 */
import { readFileSync, writeFileSync, existsSync, mkdirSync } from "fs";
import { resolve, relative } from "path";

type SuiteName = "backend" | "business";

interface VitestAssertion {
  ancestorTitles: string[];
  fullName: string;
  status: "passed" | "failed" | "pending" | "skipped" | "todo";
  title: string;
  duration?: number;
  failureMessages: string[];
}

interface VitestFileResult {
  name: string;
  status?: string;
  assertionResults: VitestAssertion[];
  startTime?: number;
  endTime?: number;
}

interface VitestReport {
  numTotalTests: number;
  numPassedTests: number;
  numFailedTests: number;
  numPendingTests: number;
  success: boolean;
  startTime: number;
  testResults: VitestFileResult[];
}

interface ExpectedFailure {
  suite: SuiteName;
  file: string;
  fullName: string;
  bugId: string | null;
  firstSeen: string;
  notes?: string;
}

interface ExpectedFailuresManifest {
  version: 1;
  generatedAt: string;
  entries: ExpectedFailure[];
}

interface TestRecord {
  suite: SuiteName;
  file: string;
  fullName: string;
  status: "passed" | "failed" | "skipped";
  failureMessage?: string;
}

interface TriageOutput {
  version: 1;
  generatedAt: string;
  verdict: "PASS" | "FAIL" | "WARN";
  summary: Record<SuiteName | "overall", {
    total: number;
    passed: number;
    failed: number;
    skipped: number;
  }>;
  counts: {
    newFailures: number;
    knownFailures: number;
    fixedKnownFailures: number;
    stablePasses: number;
    skipped: number;
  };
  newFailures: Array<{ suite: SuiteName; file: string; fullName: string; failureMessage: string }>;
  fixedKnownFailures: Array<{ suite: SuiteName; file: string; fullName: string; bugId: string | null }>;
  knownFailures: Array<{ suite: SuiteName; file: string; fullName: string; bugId: string | null }>;
  unclassifiedFailures: Array<{ suite: SuiteName; file: string; fullName: string; failureMessage: string }>;
}

// npm scripts always run from repo root. Portable across CJS (tsx) and ESM.
const ROOT = process.cwd();
const REPORTS = resolve(ROOT, "reports");
const MANIFEST_PATH = resolve(REPORTS, "expected-failures.json");
const TRIAGE_PATH = resolve(REPORTS, "triage.json");

const SUITE_FILES: Record<SuiteName, string> = {
  backend: resolve(REPORTS, "vitest-backend-results.json"),
  business: resolve(REPORTS, "vitest-business-results.json"),
};

function readVitestJson(path: string): VitestReport | null {
  if (!existsSync(path)) return null;
  const raw = readFileSync(path, "utf-8");
  // Vitest JSON always starts with `{"numTotalTestSuites":` (or similar top-level
  // numeric key). Piped-through-npm runs prefix the file with log lines that may
  // themselves contain `{` (e.g. `{ override: true }` from dotenv). Anchor on the
  // actual payload marker instead of the first brace.
  const markers = [`{"numTotalTestSuites"`, `{"numTotalTests"`, `{"testResults"`];
  let start = -1;
  for (const m of markers) {
    const i = raw.indexOf(m);
    if (i !== -1 && (start === -1 || i < start)) start = i;
  }
  if (start === -1) {
    console.warn(`[qa-triage] ${path}: no vitest JSON payload found (file has ${raw.length} bytes; likely a failed/aborted run)`);
    return null;
  }
  const sliced = raw.slice(start);
  try {
    return JSON.parse(sliced) as VitestReport;
  } catch (err) {
    console.warn(`[qa-triage] ${path}: payload truncated or malformed (${(err as Error).message}) — skipping suite`);
    return null;
  }
}

function normalizeFile(absPath: string): string {
  const parts = absPath.replace(/\\/g, "/").split("/");
  const idx = parts.findIndex((p) => p === "tests_backend" || p === "tests_business" || p === "tests_e2e");
  if (idx === -1) {
    try { return relative(ROOT, absPath).replace(/\\/g, "/"); }
    catch { return absPath; }
  }
  return parts.slice(idx).join("/");
}

function extractBugId(fullName: string): string | null {
  const m = fullName.match(/BUG-\d{3,}/);
  return m ? m[0] : null;
}

function flatten(suite: SuiteName, report: VitestReport): TestRecord[] {
  const out: TestRecord[] = [];
  for (const file of report.testResults) {
    const norm = normalizeFile(file.name);
    for (const a of file.assertionResults) {
      const status =
        a.status === "failed" ? "failed" :
        a.status === "passed" ? "passed" : "skipped";
      out.push({
        suite,
        file: norm,
        fullName: a.fullName,
        status,
        failureMessage: a.failureMessages[0] ?? undefined,
      });
    }
  }
  return out;
}

function loadManifest(): ExpectedFailuresManifest {
  if (!existsSync(MANIFEST_PATH)) {
    return { version: 1, generatedAt: new Date().toISOString(), entries: [] };
  }
  const raw = readFileSync(MANIFEST_PATH, "utf-8");
  return JSON.parse(raw) as ExpectedFailuresManifest;
}

function saveJson(path: string, obj: unknown): void {
  mkdirSync(REPORTS, { recursive: true });
  writeFileSync(path, JSON.stringify(obj, null, 2) + "\n", "utf-8");
}

function key(r: { suite: SuiteName; file: string; fullName: string }): string {
  return `${r.suite}::${r.file}::${r.fullName}`;
}

function loadAll(onlySuite?: SuiteName): { records: TestRecord[]; summary: TriageOutput["summary"] } {
  const records: TestRecord[] = [];
  const summary: TriageOutput["summary"] = {
    backend:  { total: 0, passed: 0, failed: 0, skipped: 0 },
    business: { total: 0, passed: 0, failed: 0, skipped: 0 },
    overall:  { total: 0, passed: 0, failed: 0, skipped: 0 },
  };

  const suites: SuiteName[] = onlySuite ? [onlySuite] : ["backend", "business"];
  for (const suite of suites) {
    const report = readVitestJson(SUITE_FILES[suite]);
    if (!report) {
      console.warn(`[qa-triage] ${suite}: results file missing (${SUITE_FILES[suite]}) — skipping`);
      continue;
    }
    const recs = flatten(suite, report);
    records.push(...recs);
    summary[suite] = {
      total: report.numTotalTests,
      passed: report.numPassedTests,
      failed: report.numFailedTests,
      skipped: report.numPendingTests,
    };
  }

  summary.overall = {
    total:   summary.backend.total   + summary.business.total,
    passed:  summary.backend.passed  + summary.business.passed,
    failed:  summary.backend.failed  + summary.business.failed,
    skipped: summary.backend.skipped + summary.business.skipped,
  };

  return { records, summary };
}

function bootstrap(onlySuite?: SuiteName): void {
  const { records } = loadAll(onlySuite);
  const fails = records.filter((r) => r.status === "failed");
  const today = new Date().toISOString().slice(0, 10);

  const existing = loadManifest();
  const existingByKey = new Map(existing.entries.map((e) => [key(e), e]));

  const entries: ExpectedFailure[] = [];
  for (const f of fails) {
    const k = key(f);
    const prior = existingByKey.get(k);
    if (prior) {
      entries.push(prior);
    } else {
      entries.push({
        suite: f.suite,
        file: f.file,
        fullName: f.fullName,
        bugId: extractBugId(f.fullName),
        firstSeen: today,
        notes: "",
      });
    }
  }

  const withBug = entries.filter((e) => e.bugId).length;
  const withoutBug = entries.length - withBug;

  const manifest: ExpectedFailuresManifest = {
    version: 1,
    generatedAt: new Date().toISOString(),
    entries: entries.sort((a, b) =>
      a.suite.localeCompare(b.suite) ||
      a.file.localeCompare(b.file) ||
      a.fullName.localeCompare(b.fullName),
    ),
  };
  saveJson(MANIFEST_PATH, manifest);

  console.log(`[qa-triage:bootstrap] wrote ${MANIFEST_PATH}`);
  console.log(`  entries: ${entries.length}  (with bug id: ${withBug}, unclassified: ${withoutBug})`);
  if (withoutBug > 0) {
    console.log(`  -> ${withoutBug} unclassified entries need manual bugId assignment.`);
  }
}

function triage(onlySuite?: SuiteName): TriageOutput {
  const { records, summary } = loadAll(onlySuite);
  const manifest = loadManifest();
  const expectedKeys = new Set(manifest.entries.map(key));
  const expectedByKey = new Map(manifest.entries.map((e) => [key(e), e]));

  const newFailures: TriageOutput["newFailures"] = [];
  const unclassifiedFailures: TriageOutput["unclassifiedFailures"] = [];
  const knownFailures: TriageOutput["knownFailures"] = [];
  const fixedKnownFailures: TriageOutput["fixedKnownFailures"] = [];
  let stablePasses = 0;
  let skipped = 0;

  for (const r of records) {
    const k = key(r);

    if (r.status === "skipped") { skipped++; continue; }

    if (r.status === "failed") {
      if (expectedKeys.has(k)) {
        const entry = expectedByKey.get(k)!;
        knownFailures.push({ suite: r.suite, file: r.file, fullName: r.fullName, bugId: entry.bugId });
      } else {
        const bugId = extractBugId(r.fullName);
        const failureMessage = (r.failureMessage ?? "").slice(0, 500);
        if (bugId) {
          knownFailures.push({ suite: r.suite, file: r.file, fullName: r.fullName, bugId });
        } else {
          newFailures.push({ suite: r.suite, file: r.file, fullName: r.fullName, failureMessage });
          unclassifiedFailures.push({ suite: r.suite, file: r.file, fullName: r.fullName, failureMessage });
        }
      }
      continue;
    }

    stablePasses++;
    if (expectedKeys.has(k)) {
      const entry = expectedByKey.get(k)!;
      fixedKnownFailures.push({ suite: r.suite, file: r.file, fullName: r.fullName, bugId: entry.bugId });
    }
  }

  const verdict: TriageOutput["verdict"] =
    newFailures.length > 0 ? "FAIL" :
    fixedKnownFailures.length > 0 ? "WARN" :
    "PASS";

  const output: TriageOutput = {
    version: 1,
    generatedAt: new Date().toISOString(),
    verdict,
    summary,
    counts: {
      newFailures: newFailures.length,
      knownFailures: knownFailures.length,
      fixedKnownFailures: fixedKnownFailures.length,
      stablePasses,
      skipped,
    },
    newFailures: newFailures.sort((a, b) => key(a).localeCompare(key(b))),
    fixedKnownFailures: fixedKnownFailures.sort((a, b) => key(a).localeCompare(key(b))),
    knownFailures: knownFailures.sort((a, b) => key(a).localeCompare(key(b))),
    unclassifiedFailures: unclassifiedFailures.sort((a, b) => key(a).localeCompare(key(b))),
  };

  saveJson(TRIAGE_PATH, output);

  const s = output.summary.overall;
  console.log(`[qa-triage] verdict=${verdict}`);
  console.log(`  tests:   ${s.passed}/${s.total} pass  (fail=${s.failed}, skip=${s.skipped})`);
  console.log(`  new failures:        ${output.counts.newFailures}`);
  console.log(`  known failures:      ${output.counts.knownFailures}`);
  console.log(`  fixed known fails:   ${output.counts.fixedKnownFailures}`);
  console.log(`  stable passes:       ${output.counts.stablePasses}`);
  if (output.counts.newFailures > 0) {
    console.log(`\n  NEW FAILURES (gate=FAIL):`);
    for (const f of output.newFailures.slice(0, 20)) {
      console.log(`    [${f.suite}] ${f.file} > ${f.fullName}`);
    }
    if (output.newFailures.length > 20) {
      console.log(`    ... ${output.newFailures.length - 20} more (see reports/triage.json)`);
    }
  }
  if (output.counts.fixedKnownFailures > 0) {
    console.log(`\n  FIXED KNOWN FAILS (update bugs.md + expected-failures.json):`);
    for (const f of output.fixedKnownFailures.slice(0, 20)) {
      console.log(`    [${f.suite}] ${f.bugId ?? "?"}  ${f.file} > ${f.fullName}`);
    }
  }

  return output;
}

function parseArgs(argv: string[]): { bootstrap: boolean; suite?: SuiteName } {
  const opts: { bootstrap: boolean; suite?: SuiteName } = { bootstrap: false };
  for (const arg of argv) {
    if (arg === "--bootstrap") opts.bootstrap = true;
    else if (arg.startsWith("--suite=")) {
      const v = arg.slice("--suite=".length) as SuiteName;
      if (v !== "backend" && v !== "business") throw new Error(`--suite must be backend|business (got ${v})`);
      opts.suite = v;
    } else if (arg === "--help" || arg === "-h") {
      console.log(`Usage:
  npx tsx scripts/qa-triage.ts                  triage current results -> reports/triage.json
  npx tsx scripts/qa-triage.ts --bootstrap      (re)generate reports/expected-failures.json
  npx tsx scripts/qa-triage.ts --suite=backend  triage a single suite`);
      process.exit(0);
    }
  }
  return opts;
}

const opts = parseArgs(process.argv.slice(2));
if (opts.bootstrap) {
  bootstrap(opts.suite);
} else {
  const output = triage(opts.suite);
  void output;
}
