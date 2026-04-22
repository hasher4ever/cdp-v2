/**
 * Backend test coverage inventory.
 *
 * Walks tests_backend/ and tests_business/, extracts every .test.ts file's
 * describe/it names, endpoint references, and BUG-NNN tokens. Cross-references
 * against the documented endpoint surface (docs/API-REFERENCE.md) and the
 * bug ledger (bugs.md if present) to produce:
 *
 *   reports/coverage.json
 *     {
 *       suites: { backend, business } counts,
 *       files:   [{ suite, file, testCount, endpoints[], bugs[] }],
 *       endpoints: [{ method, path, testsReferencing }],  // from API-REFERENCE
 *       bugCoverage: { [bugId]: testFileList },
 *       summary: { filesScanned, totalTests, documentedEndpoints, uncoveredEndpoints, bugsWithTests }
 *     }
 *
 * No LLM. No browser. No page_crawl cache. This is not UI coverage — it's
 * backend-API surface coverage, which is what this project actually tests.
 *
 * Usage:
 *   npx tsx scripts/qa-crawl.ts              scan -> reports/coverage.json + stdout
 *   npx tsx scripts/qa-crawl.ts --json       machine-readable stdout
 *   npx tsx scripts/qa-crawl.ts --quiet      no stdout
 *   npx tsx scripts/qa-crawl.ts --uncovered  only print endpoints with 0 tests
 *
 * Exit code is always 0 — this is inventory, not a gate.
 */
import { existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from "fs";
import { resolve, relative } from "path";

interface FileReport {
  suite: "backend" | "business";
  file: string;
  testCount: number;
  endpoints: string[];
  bugs: string[];
}

interface EndpointEntry {
  method: string;
  path: string;
  testsReferencing: number;
  referencedIn: string[];
}

interface CoverageReport {
  version: 1;
  generatedAt: string;
  suites: { backend: { files: number; tests: number }; business: { files: number; tests: number } };
  files: FileReport[];
  endpoints: EndpointEntry[];
  bugCoverage: Record<string, string[]>;
  summary: {
    filesScanned: number;
    totalTests: number;
    documentedEndpoints: number;
    coveredEndpoints: number;
    uncoveredEndpoints: number;
    bugsWithTests: number;
  };
}

interface Opts {
  json: boolean;
  quiet: boolean;
  uncovered: boolean;
}

const ROOT = process.cwd();
const REPORTS = resolve(ROOT, "reports");
const OUT_PATH = resolve(REPORTS, "coverage.json");

// Matches:
//   it("x > y > z", ...)   test("abc", ...)   describe("Q > R", ...)
// First capture group is the name.
const TEST_NAME_RE = /\b(?:it|test|describe)(?:\.skip|\.only|\.each\([^)]*\))?\s*\(\s*['"`]([^'"`]+)['"`]/g;

// Matches endpoint paths embedded in quotes. Covers GET/POST strings, path
// parameters, query strings. Excluded: leading/trailing whitespace.
const ENDPOINT_RE = /['"`](\/(?:public\/)?(?:api|cdp-ingest)\/[a-zA-Z0-9/_?={}.\-\[\]]+)['"`]/g;

const BUG_RE = /\bBUG-\d{3,4}\b/g;

// Matches `| GET | \`/api/path\` | Yes | ...` rows in API-REFERENCE.md
const API_REF_ROW_RE = /^\|\s*(GET|POST|PUT|PATCH|DELETE)\s*\|\s*`([^`]+)`/gm;

function parseArgs(argv: string[]): Opts {
  const opts: Opts = { json: false, quiet: false, uncovered: false };
  for (const a of argv) {
    if (a === "--json") opts.json = true;
    else if (a === "--quiet") opts.quiet = true;
    else if (a === "--uncovered") opts.uncovered = true;
    else if (a === "--help" || a === "-h") {
      console.log(`Usage:
  npx tsx scripts/qa-crawl.ts               scan -> reports/coverage.json
  npx tsx scripts/qa-crawl.ts --json        machine-readable stdout
  npx tsx scripts/qa-crawl.ts --uncovered   list endpoints with 0 tests
  npx tsx scripts/qa-crawl.ts --quiet       no stdout`);
      process.exit(0);
    }
  }
  return opts;
}

function walkTests(dir: string, acc: string[] = []): string[] {
  if (!existsSync(dir)) return acc;
  for (const entry of readdirSync(dir)) {
    const p = resolve(dir, entry);
    const s = statSync(p);
    if (s.isDirectory()) walkTests(p, acc);
    else if (s.isFile() && entry.endsWith(".test.ts")) acc.push(p);
  }
  return acc;
}

function scanFile(absPath: string, suite: "backend" | "business"): FileReport {
  const rel = relative(ROOT, absPath).split("\\").join("/");
  const src = readFileSync(absPath, "utf-8");

  let testCount = 0;
  const names: string[] = [];
  TEST_NAME_RE.lastIndex = 0;
  for (const m of src.matchAll(TEST_NAME_RE)) {
    names.push(m[1]);
    // Only it/test count as leaf tests. describe increments a container, not a test.
    if (/\b(?:it|test)\b/.test(m[0])) testCount++;
  }

  const endpoints = new Set<string>();
  ENDPOINT_RE.lastIndex = 0;
  for (const m of src.matchAll(ENDPOINT_RE)) {
    // Strip query string + trailing path params for normalization to the
    // documented form (e.g. "/api/tenants/campaign/abc-123" -> "/api/tenants/campaign/{id}").
    let p = m[1];
    p = p.split("?")[0];
    // Normalize UUIDs and numeric IDs to {id} placeholder so they match the doc form.
    p = p.replace(/\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi, "/{id}");
    p = p.replace(/\/\d{6,}/g, "/{id}");
    endpoints.add(p);
  }

  const bugs = new Set<string>();
  BUG_RE.lastIndex = 0;
  for (const m of src.matchAll(BUG_RE)) bugs.add(m[0]);

  return { suite, file: rel, testCount, endpoints: [...endpoints].sort(), bugs: [...bugs].sort() };
}

function loadDocumentedEndpoints(): { method: string; path: string }[] {
  const p = resolve(ROOT, "docs", "API-REFERENCE.md");
  if (!existsSync(p)) return [];
  const src = readFileSync(p, "utf-8");
  const out: { method: string; path: string }[] = [];
  API_REF_ROW_RE.lastIndex = 0;
  for (const m of src.matchAll(API_REF_ROW_RE)) {
    // Strip query string in the doc too so it matches the test-extracted form.
    const path = m[2].split("?")[0];
    out.push({ method: m[1], path });
  }
  // De-dupe (method, path)
  const seen = new Set<string>();
  return out.filter((e) => {
    const k = `${e.method} ${e.path}`;
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
}

function endpointPathsMatch(doc: string, test: string): boolean {
  // Exact match, OR the test path starts with the doc path (handles query-stripped
  // tests hitting a doc'd endpoint with extra segments), OR the paths are equal
  // after collapsing {id}-style placeholders.
  if (doc === test) return true;
  const norm = (s: string) => s.replace(/\{[^}]+\}/g, "{}");
  if (norm(doc) === norm(test)) return true;
  // Starts-with at segment boundary — only if doc is a prefix of test.
  if (test.startsWith(doc + "/") || test.startsWith(doc + "{")) return true;
  return false;
}

function buildEndpointCoverage(documented: { method: string; path: string }[], files: FileReport[]): EndpointEntry[] {
  const result: EndpointEntry[] = documented.map((d) => ({ ...d, testsReferencing: 0, referencedIn: [] }));
  for (const f of files) {
    for (const ep of f.endpoints) {
      for (const entry of result) {
        if (endpointPathsMatch(entry.path, ep)) {
          entry.testsReferencing++;
          if (!entry.referencedIn.includes(f.file)) entry.referencedIn.push(f.file);
        }
      }
    }
  }
  // Keep referencedIn bounded so the JSON stays small.
  for (const e of result) e.referencedIn = e.referencedIn.slice(0, 10);
  return result;
}

function buildBugCoverage(files: FileReport[]): Record<string, string[]> {
  const map: Record<string, string[]> = {};
  for (const f of files) {
    for (const bug of f.bugs) {
      if (!map[bug]) map[bug] = [];
      if (!map[bug].includes(f.file)) map[bug].push(f.file);
    }
  }
  return map;
}

function saveReport(r: CoverageReport): void {
  mkdirSync(REPORTS, { recursive: true });
  writeFileSync(OUT_PATH, JSON.stringify(r, null, 2) + "\n", "utf-8");
}

function printHuman(r: CoverageReport, opts: Opts): void {
  if (opts.uncovered) {
    const missing = r.endpoints.filter((e) => e.testsReferencing === 0);
    console.log(`[qa-crawl] ${missing.length} uncovered endpoint(s) of ${r.endpoints.length} documented:`);
    for (const e of missing) console.log(`  - ${e.method.padEnd(6)} ${e.path}`);
    return;
  }
  const s = r.summary;
  const covPct = r.endpoints.length > 0 ? Math.round((s.coveredEndpoints / s.documentedEndpoints) * 1000) / 10 : 0;
  console.log(`[qa-crawl] ${s.filesScanned} file(s), ${s.totalTests} test(s)`);
  console.log(`  suites:    backend=${r.suites.backend.tests} tests in ${r.suites.backend.files} files, business=${r.suites.business.tests}/${r.suites.business.files}`);
  console.log(`  endpoints: ${s.coveredEndpoints}/${s.documentedEndpoints} documented endpoints referenced (${covPct}%)`);
  console.log(`  bugs:      ${s.bugsWithTests} bug(s) referenced by at least one test`);
  if (s.uncoveredEndpoints > 0) {
    console.log(`  tip: npm run qa:crawl -- --uncovered  # list the ${s.uncoveredEndpoints} untested endpoint(s)`);
  }
}

async function main(): Promise<number> {
  const opts = parseArgs(process.argv.slice(2));

  const beFiles = walkTests(resolve(ROOT, "tests_backend")).map((p) => scanFile(p, "backend"));
  const buFiles = walkTests(resolve(ROOT, "tests_business")).map((p) => scanFile(p, "business"));
  const files = [...beFiles, ...buFiles];

  const documented = loadDocumentedEndpoints();
  const endpoints = buildEndpointCoverage(documented, files);
  const bugCoverage = buildBugCoverage(files);

  const suiteStats = (list: FileReport[]) => ({ files: list.length, tests: list.reduce((n, f) => n + f.testCount, 0) });
  const report: CoverageReport = {
    version: 1,
    generatedAt: new Date().toISOString(),
    suites: { backend: suiteStats(beFiles), business: suiteStats(buFiles) },
    files,
    endpoints,
    bugCoverage,
    summary: {
      filesScanned: files.length,
      totalTests: files.reduce((n, f) => n + f.testCount, 0),
      documentedEndpoints: documented.length,
      coveredEndpoints: endpoints.filter((e) => e.testsReferencing > 0).length,
      uncoveredEndpoints: endpoints.filter((e) => e.testsReferencing === 0).length,
      bugsWithTests: Object.keys(bugCoverage).length,
    },
  };
  saveReport(report);

  if (opts.json) console.log(JSON.stringify(report, null, 2));
  else if (!opts.quiet) printHuman(report, opts);

  return 0;
}

main().then((code) => process.exit(code)).catch((err) => {
  console.error(`[qa-crawl] fatal:`, (err as Error).message);
  process.exit(2);
});
