/**
 * Release-readiness gate.
 *
 * Reads reports/triage.json and exits with a code suitable for CI:
 *   PASS → 0
 *   WARN → 0 (default) or 1 (--strict)
 *   FAIL → 1
 *
 * No LLM calls. No test execution. Pure read + decision.
 *
 * Usage:
 *   npx tsx scripts/qa-gate.ts              # default: PASS/WARN=0, FAIL=1
 *   npx tsx scripts/qa-gate.ts --strict     # WARN also fails (every fixed-known-fail must be cleaned up)
 *   npx tsx scripts/qa-gate.ts --quiet      # no stdout, exit code only (for wrapping)
 *   npx tsx scripts/qa-gate.ts --json       # machine-readable gate output on stdout
 *
 * Contract:
 *   Input:  reports/triage.json (produced by qa-triage)
 *   Output: exit code + optional stdout summary
 *
 * The gate does NOT re-classify — qa-triage is the single classification owner.
 * If triage.json is missing or malformed, the gate fails closed (exit 1).
 */
import { readFileSync, existsSync } from "fs";
import { resolve } from "path";

interface TriageJson {
  version: number;
  verdict: "PASS" | "FAIL" | "WARN";
  generatedAt: string;
  summary: {
    overall: { total: number; passed: number; failed: number; skipped: number };
  };
  counts: {
    newFailures: number;
    knownFailures: number;
    fixedKnownFailures: number;
    stablePasses: number;
    skipped: number;
  };
  newFailures: Array<{ suite: string; file: string; fullName: string; failureMessage: string }>;
  fixedKnownFailures: Array<{ suite: string; file: string; fullName: string; bugId: string | null }>;
}

interface Opts {
  strict: boolean;
  quiet: boolean;
  json: boolean;
}

const ROOT = process.cwd();
const TRIAGE_PATH = resolve(ROOT, "reports", "triage.json");

function parseArgs(argv: string[]): Opts {
  const opts: Opts = { strict: false, quiet: false, json: false };
  for (const arg of argv) {
    if (arg === "--strict") opts.strict = true;
    else if (arg === "--quiet") opts.quiet = true;
    else if (arg === "--json") opts.json = true;
    else if (arg === "--help" || arg === "-h") {
      console.log(`Usage:
  npx tsx scripts/qa-gate.ts            PASS/WARN exit 0, FAIL exit 1
  npx tsx scripts/qa-gate.ts --strict   WARN also exits 1
  npx tsx scripts/qa-gate.ts --quiet    no stdout, exit code only
  npx tsx scripts/qa-gate.ts --json     machine-readable stdout`);
      process.exit(0);
    }
  }
  return opts;
}

function loadTriage(): TriageJson | null {
  if (!existsSync(TRIAGE_PATH)) return null;
  try {
    return JSON.parse(readFileSync(TRIAGE_PATH, "utf-8")) as TriageJson;
  } catch {
    return null;
  }
}

const opts = parseArgs(process.argv.slice(2));
const triage = loadTriage();

if (!triage) {
  if (!opts.quiet) {
    console.error(`[qa-gate] reports/triage.json missing or malformed. Run \`npm run qa:triage\` first.`);
  }
  if (opts.json) {
    console.log(JSON.stringify({ verdict: "FAIL", reason: "missing-triage-json", exitCode: 1 }));
  }
  process.exit(1);
}

const { verdict, counts, summary } = triage;
const exitCode =
  verdict === "FAIL" ? 1 :
  verdict === "WARN" && opts.strict ? 1 :
  0;

if (opts.json) {
  console.log(JSON.stringify({
    verdict,
    exitCode,
    strict: opts.strict,
    counts,
    summary: summary.overall,
    firstNewFailure: triage.newFailures[0] ?? null,
  }, null, 2));
} else if (!opts.quiet) {
  const icon = verdict === "PASS" ? "✓" : verdict === "WARN" ? "⚠" : "✗";
  console.log(`[qa-gate] ${icon} ${verdict}  (exit=${exitCode}${opts.strict ? ", strict" : ""})`);
  console.log(`  tests: ${summary.overall.passed}/${summary.overall.total} pass (fail=${summary.overall.failed}, skip=${summary.overall.skipped})`);
  console.log(`  new failures:       ${counts.newFailures}${counts.newFailures > 0 ? "  ← blocking" : ""}`);
  console.log(`  known failures:     ${counts.knownFailures}`);
  console.log(`  fixed known fails:  ${counts.fixedKnownFailures}${counts.fixedKnownFailures > 0 ? "  ← update bugs.md + re-bootstrap" : ""}`);

  if (counts.newFailures > 0) {
    console.log(`\n  New failures (blocking):`);
    for (const f of triage.newFailures.slice(0, 10)) {
      console.log(`    [${f.suite}] ${f.file} > ${f.fullName}`);
    }
    if (triage.newFailures.length > 10) {
      console.log(`    ... ${triage.newFailures.length - 10} more in reports/triage.json`);
    }
  }

  if (counts.fixedKnownFailures > 0 && verdict !== "FAIL") {
    console.log(`\n  Fixed known failures (close in bugs.md + re-run qa:triage:bootstrap):`);
    for (const f of triage.fixedKnownFailures.slice(0, 10)) {
      console.log(`    [${f.suite}] ${f.bugId ?? "?"}  ${f.file} > ${f.fullName}`);
    }
  }
}

process.exit(exitCode);
