/**
 * Deterministic bug-ledger audit.
 *
 * Parses bugs.md, detects duplicate IDs + gaps in numbering, and cross-references
 * against reports/coverage.json (if present) to find bugs with no regression test.
 * Emits reports/bugs-mechanical.json.
 *
 * No LLM. The LLM is only useful for drafting NEW bug reports or narrative
 * triage on top of this mechanical output — that remains in the /qa-bugs skill.
 *
 * Usage:
 *   npx tsx scripts/qa-bugs.ts              scan -> reports/bugs-mechanical.json + stdout
 *   npx tsx scripts/qa-bugs.ts --json       machine-readable stdout
 *   npx tsx scripts/qa-bugs.ts --uncovered  list bugs with no tests
 *   npx tsx scripts/qa-bugs.ts --issues     list duplicate IDs + gaps only
 *   npx tsx scripts/qa-bugs.ts --quiet      no stdout
 *
 * Exit codes:
 *   0 — always (inventory, not a gate)
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "fs";
import { resolve } from "path";

type Severity = "Critical" | "High" | "Medium" | "Low" | "Unknown";
type StatusKind = "Open" | "Resolved" | "Retracted" | "Reopened" | "Duplicate" | "Unknown";

interface BugEntry {
  id: string;                 // "BUG-001"
  numericId: number;          // 1
  title: string;
  severity: Severity;
  severityRaw: string;        // original ** Severity:** line content (may include session notes)
  status: StatusKind;
  statusRaw: string;
  endpoint: string | null;
  line: number;               // 1-based line in bugs.md
  duplicateOf: string[];      // IDs that share this numeric (others with same id)
}

interface BugsMechanicalReport {
  version: 1;
  generatedAt: string;
  totals: {
    entries: number;
    uniqueIds: number;
    duplicateIds: number;
    gaps: number;
    severityBreakdown: Record<Severity, number>;
    statusBreakdown: Record<StatusKind, number>;
  };
  issues: {
    duplicateIds: { id: string; occurrences: { line: number; title: string }[] }[];
    gaps: number[];                          // missing numeric IDs in [min,max]
    nextFreeId: string;                      // the next untaken BUG-NNN after max
    missingSeverity: string[];               // bug IDs with no recognized severity
    missingEndpoint: string[];               // bug IDs with no endpoint line
  };
  coverage: {
    present: boolean;
    withTests: string[];
    withoutTests: string[];
    byBug: Record<string, string[]>;         // BUG-NNN -> [test files]
  };
  bugs: BugEntry[];
}

interface Opts { json: boolean; quiet: boolean; uncovered: boolean; issues: boolean }

const ROOT = process.cwd();
const BUGS_PATH = resolve(ROOT, "bugs.md");
const COVERAGE_PATH = resolve(ROOT, "reports", "coverage.json");
const OUT_PATH = resolve(ROOT, "reports", "bugs-mechanical.json");

const HEADER_RE = /^## (BUG-(\d{3,4})):\s*(.+?)\s*$/;
const SEVERITY_RE = /^\*\*Severity:\*\*\s*(.+?)\s*$/i;
const STATUS_RE = /^\*\*Status:\*\*\s*(.+?)\s*$/i;
const ENDPOINT_RE = /^\*\*Endpoint:\*\*\s*`?(.+?)`?\s*$/i;

function parseArgs(argv: string[]): Opts {
  const opts: Opts = { json: false, quiet: false, uncovered: false, issues: false };
  for (const a of argv) {
    if (a === "--json") opts.json = true;
    else if (a === "--quiet") opts.quiet = true;
    else if (a === "--uncovered") opts.uncovered = true;
    else if (a === "--issues") opts.issues = true;
    else if (a === "--help" || a === "-h") {
      console.log(`Usage:
  npx tsx scripts/qa-bugs.ts             scan -> reports/bugs-mechanical.json
  npx tsx scripts/qa-bugs.ts --json      machine-readable stdout
  npx tsx scripts/qa-bugs.ts --uncovered list bugs without regression tests
  npx tsx scripts/qa-bugs.ts --issues    list duplicate IDs + numbering gaps
  npx tsx scripts/qa-bugs.ts --quiet     no stdout`);
      process.exit(0);
    }
  }
  return opts;
}

function classifySeverity(raw: string): Severity {
  const s = raw.toLowerCase();
  if (s.startsWith("critical")) return "Critical";
  if (s.startsWith("high")) return "High";
  if (s.startsWith("medium")) return "Medium";
  if (s.startsWith("low")) return "Low";
  return "Unknown";
}

function classifyStatus(raw: string): StatusKind {
  const s = raw.toLowerCase();
  if (s.startsWith("resolved")) return "Resolved";
  if (s.startsWith("retracted") || s.includes("retracted")) return "Retracted";
  if (s.startsWith("re-opened") || s.startsWith("reopened")) return "Reopened";
  if (s.includes("duplicate")) return "Duplicate";
  if (s.startsWith("open")) return "Open";
  return "Unknown";
}

function parseBugs(src: string): BugEntry[] {
  const lines = src.split(/\r?\n/);
  const bugs: BugEntry[] = [];
  let cur: BugEntry | null = null;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const h = line.match(HEADER_RE);
    if (h) {
      if (cur) bugs.push(cur);
      cur = {
        id: h[1],
        numericId: parseInt(h[2], 10),
        title: h[3],
        severity: "Unknown",
        severityRaw: "",
        status: "Unknown",
        statusRaw: "",
        endpoint: null,
        line: i + 1,
        duplicateOf: [],
      };
      continue;
    }
    if (!cur) continue;
    const sev = line.match(SEVERITY_RE);
    if (sev && !cur.severityRaw) {
      cur.severityRaw = sev[1];
      cur.severity = classifySeverity(sev[1]);
      continue;
    }
    const st = line.match(STATUS_RE);
    if (st && !cur.statusRaw) {
      cur.statusRaw = st[1];
      cur.status = classifyStatus(st[1]);
      continue;
    }
    const ep = line.match(ENDPOINT_RE);
    if (ep && !cur.endpoint) {
      cur.endpoint = ep[1].replace(/`/g, "").trim();
      continue;
    }
  }
  if (cur) bugs.push(cur);
  return bugs;
}

function detectIssues(bugs: BugEntry[]): {
  duplicateIds: BugsMechanicalReport["issues"]["duplicateIds"];
  gaps: number[];
  nextFreeId: string;
  missingSeverity: string[];
  missingEndpoint: string[];
} {
  const groups = new Map<number, BugEntry[]>();
  for (const b of bugs) {
    if (!groups.has(b.numericId)) groups.set(b.numericId, []);
    groups.get(b.numericId)!.push(b);
  }
  const duplicateIds: BugsMechanicalReport["issues"]["duplicateIds"] = [];
  for (const [numericId, group] of groups) {
    if (group.length > 1) {
      duplicateIds.push({
        id: "BUG-" + String(numericId).padStart(3, "0"),
        occurrences: group.map((g) => ({ line: g.line, title: g.title })),
      });
      const ids = group.map((g) => g.id);
      for (const g of group) g.duplicateOf = ids.filter((x) => x !== g.id);
    }
  }
  duplicateIds.sort((a, b) => a.id.localeCompare(b.id));

  const presentIds = new Set(bugs.map((b) => b.numericId));
  const gaps: number[] = [];
  if (presentIds.size > 0) {
    const min = Math.min(...presentIds);
    const max = Math.max(...presentIds);
    for (let n = min; n <= max; n++) if (!presentIds.has(n)) gaps.push(n);
  }
  const maxId = presentIds.size > 0 ? Math.max(...presentIds) : 0;
  const nextFreeId = "BUG-" + String(maxId + 1).padStart(3, "0");

  const missingSeverity = bugs.filter((b) => b.severity === "Unknown").map((b) => b.id).sort();
  const missingEndpoint = bugs.filter((b) => !b.endpoint).map((b) => b.id).sort();

  return { duplicateIds, gaps, nextFreeId, missingSeverity, missingEndpoint };
}

function loadCoverage(): Record<string, string[]> | null {
  if (!existsSync(COVERAGE_PATH)) return null;
  try {
    const j = JSON.parse(readFileSync(COVERAGE_PATH, "utf-8"));
    return (j.bugCoverage ?? {}) as Record<string, string[]>;
  } catch {
    return null;
  }
}

function computeCoverage(bugs: BugEntry[], map: Record<string, string[]> | null): BugsMechanicalReport["coverage"] {
  if (!map) {
    return { present: false, withTests: [], withoutTests: [], byBug: {} };
  }
  const withTests: string[] = [];
  const withoutTests: string[] = [];
  const byBug: Record<string, string[]> = {};
  for (const b of bugs) {
    const files = map[b.id] ?? [];
    if (files.length > 0) {
      withTests.push(b.id);
      byBug[b.id] = files;
    } else {
      withoutTests.push(b.id);
    }
  }
  return { present: true, withTests: withTests.sort(), withoutTests: withoutTests.sort(), byBug };
}

function buildReport(bugs: BugEntry[]): BugsMechanicalReport {
  const issues = detectIssues(bugs);
  const coverage = computeCoverage(bugs, loadCoverage());

  const severityBreakdown: Record<Severity, number> = {
    Critical: 0, High: 0, Medium: 0, Low: 0, Unknown: 0,
  };
  const statusBreakdown: Record<StatusKind, number> = {
    Open: 0, Resolved: 0, Retracted: 0, Reopened: 0, Duplicate: 0, Unknown: 0,
  };
  for (const b of bugs) {
    severityBreakdown[b.severity]++;
    statusBreakdown[b.status]++;
  }

  const uniqueIds = new Set(bugs.map((b) => b.numericId)).size;

  return {
    version: 1,
    generatedAt: new Date().toISOString(),
    totals: {
      entries: bugs.length,
      uniqueIds,
      duplicateIds: issues.duplicateIds.length,
      gaps: issues.gaps.length,
      severityBreakdown,
      statusBreakdown,
    },
    issues,
    coverage,
    bugs,
  };
}

function saveReport(report: BugsMechanicalReport): void {
  mkdirSync(resolve(ROOT, "reports"), { recursive: true });
  writeFileSync(OUT_PATH, JSON.stringify(report, null, 2) + "\n", "utf-8");
}

function printHuman(report: BugsMechanicalReport, opts: Opts): void {
  const t = report.totals;
  if (opts.uncovered) {
    if (!report.coverage.present) {
      console.log("[qa-bugs] coverage.json missing - run `npm run qa:crawl` first");
      return;
    }
    const without = report.coverage.withoutTests;
    console.log(`[qa-bugs] ${without.length} bug(s) without regression tests:`);
    for (const id of without) {
      const b = report.bugs.find((x) => x.id === id)!;
      console.log(`  - ${id} [${b.severity}/${b.status}] ${b.title}`);
    }
    return;
  }
  if (opts.issues) {
    console.log(`[qa-bugs] duplicate IDs: ${t.duplicateIds}, gaps: ${t.gaps}`);
    for (const d of report.issues.duplicateIds) {
      console.log(`  DUP ${d.id}:`);
      for (const o of d.occurrences) console.log(`    line ${o.line}: ${o.title}`);
    }
    if (report.issues.gaps.length > 0) {
      const gaps = report.issues.gaps.map((n) => "BUG-" + String(n).padStart(3, "0"));
      console.log(`  GAPS: ${gaps.join(", ")}`);
    }
    console.log(`  next free id: ${report.issues.nextFreeId}`);
    if (report.issues.missingSeverity.length > 0)
      console.log(`  missing severity: ${report.issues.missingSeverity.join(", ")}`);
    if (report.issues.missingEndpoint.length > 0)
      console.log(`  missing endpoint: ${report.issues.missingEndpoint.slice(0, 10).join(", ")}${report.issues.missingEndpoint.length > 10 ? " ..." : ""}`);
    return;
  }
  console.log(`[qa-bugs] ${t.entries} entries / ${t.uniqueIds} unique IDs`);
  const sev = t.severityBreakdown;
  console.log(`  severity: Critical=${sev.Critical} High=${sev.High} Medium=${sev.Medium} Low=${sev.Low} Unknown=${sev.Unknown}`);
  const st = t.statusBreakdown;
  console.log(`  status:   Open=${st.Open} Resolved=${st.Resolved} Retracted=${st.Retracted} Reopened=${st.Reopened} Unknown=${st.Unknown}`);
  if (t.duplicateIds > 0) console.log(`  ! duplicate IDs: ${t.duplicateIds} (see --issues)`);
  if (t.gaps > 0) console.log(`  . numbering gaps: ${t.gaps} (see --issues)`);
  console.log(`  next free id: ${report.issues.nextFreeId}`);
  if (report.coverage.present) {
    const c = report.coverage;
    const pct = t.entries > 0 ? Math.round((c.withTests.length / t.entries) * 1000) / 10 : 0;
    console.log(`  coverage: ${c.withTests.length}/${t.entries} bugs have tests (${pct}%)`);
    if (c.withoutTests.length > 0)
      console.log(`  tip: npm run qa:bugs -- --uncovered   # list ${c.withoutTests.length} bugs without tests`);
  } else {
    console.log(`  coverage: reports/coverage.json missing - run 'npm run qa:crawl' for test cross-ref`);
  }
}

async function main(): Promise<number> {
  const opts = parseArgs(process.argv.slice(2));
  if (!existsSync(BUGS_PATH)) {
    console.error("[qa-bugs] bugs.md not found at " + BUGS_PATH);
    return 2;
  }
  const src = readFileSync(BUGS_PATH, "utf-8");
  const bugs = parseBugs(src);
  const report = buildReport(bugs);
  saveReport(report);

  if (opts.json) console.log(JSON.stringify(report, null, 2));
  else if (!opts.quiet) printHuman(report, opts);

  return 0;
}

main().then((code) => process.exit(code)).catch((err) => {
  console.error("[qa-bugs] fatal:", (err as Error).message);
  process.exit(2);
});
