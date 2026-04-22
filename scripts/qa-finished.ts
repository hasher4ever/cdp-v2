/**
 * Deterministic end-of-session closeout.
 *
 * Collects everything the LLM narrator of `/finished` needs to write a
 * close-the-loop summary without re-probing the filesystem or re-running CI:
 *
 *   - Git state (branch, staged/unstaged/untracked, last commit)
 *   - Report freshness (age + verdict) for env/triage/perf/health/next/self/coverage
 *   - Files modified this session, grouped by area (skills, scripts, wrappers, docs, tests)
 *   - A deterministic "punchlist" of follow-ups the narrator MUST mention
 *
 * No LLM. Narrative closeout, memory updates, and skill-improvement authorship
 * remain in the legacy /finished skill — but they now start from this JSON
 * instead of re-reading everything.
 *
 * Usage:
 *   npx tsx scripts/qa-finished.ts             closeout -> reports/closeout.json + stdout
 *   npx tsx scripts/qa-finished.ts --json      machine-readable stdout
 *   npx tsx scripts/qa-finished.ts --quiet     no stdout
 *
 * Exit code is always 0 — closeout is informational, not a gate.
 */
import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from "fs";
import { resolve } from "path";
import { execSync } from "child_process";

type Verdict = "PASS" | "WARN" | "FAIL" | "DOWN" | "UP" | "DEGRADED" | "missing" | "unknown";

interface ReportSnap {
  present: boolean;
  verdict: Verdict;
  ageSec?: number;
}

interface GitState {
  available: boolean;
  branch?: string;
  headShort?: string;
  lastMessage?: string;
  staged: string[];
  unstaged: string[];
  untracked: string[];
  commitsAhead?: number;
}

interface Modified {
  skills: string[];       // .claude/commands/*.md
  scripts: string[];      // scripts/qa-*.ts
  wrappers: string[];     // scripts/skill-wrappers/*.md
  docs: string[];         // docs/*.md, CLAUDE.md, bugs.md
  tests: string[];        // tests_backend/**, tests_business/**
  other: string[];
}

interface ClosoutReport {
  version: 1;
  generatedAt: string;
  git: GitState;
  reports: {
    env:      ReportSnap;
    triage:   ReportSnap;
    perf:     ReportSnap;
    health:   ReportSnap;
    next:     ReportSnap;
    self:     ReportSnap;
    coverage: ReportSnap;
    bugs:     ReportSnap;
  };
  modified: Modified;
  punchlist: string[];
}

interface Opts { json: boolean; quiet: boolean }

const ROOT = process.cwd();
const REPORTS = resolve(ROOT, "reports");
const OUT_PATH = resolve(REPORTS, "closeout.json");

function parseArgs(argv: string[]): Opts {
  const opts: Opts = { json: false, quiet: false };
  for (const a of argv) {
    if (a === "--json") opts.json = true;
    else if (a === "--quiet") opts.quiet = true;
    else if (a === "--help" || a === "-h") {
      console.log("Usage: npx tsx scripts/qa-finished.ts [--json|--quiet]");
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

function snap(name: string, verdictField: string): ReportSnap {
  const path = resolve(REPORTS, name);
  if (!existsSync(path)) return { present: false, verdict: "missing" };
  const j = readJsonSafe<Record<string, unknown>>(path);
  if (!j) return { present: true, verdict: "unknown", ageSec: ageSec(path) };
  const v = j[verdictField];
  const verdict: Verdict = typeof v === "string" ? (v as Verdict) : "unknown";
  return { present: true, verdict, ageSec: ageSec(path) };
}

function gitShort(args: string): string {
  try {
    return execSync("git " + args, { cwd: ROOT, stdio: ["ignore", "pipe", "ignore"] }).toString().trim();
  } catch {
    return "";
  }
}

function readGit(): GitState {
  const branch = gitShort("rev-parse --abbrev-ref HEAD");
  if (!branch) return { available: false, staged: [], unstaged: [], untracked: [] };

  const headShort = gitShort("rev-parse --short HEAD");
  const lastMessage = gitShort("log -1 --pretty=%s");

  const statusRaw = gitShort("status --porcelain");
  const staged: string[] = [];
  const unstaged: string[] = [];
  const untracked: string[] = [];
  for (const rawLine of statusRaw.split(/\r?\n/)) {
    if (!rawLine) continue;
    const xy = rawLine.slice(0, 2);
    const path = rawLine.slice(3);
    if (xy === "??") untracked.push(path);
    else {
      if (xy[0] !== " " && xy[0] !== "?") staged.push(path);
      if (xy[1] !== " " && xy[1] !== "?") unstaged.push(path);
    }
  }

  let commitsAhead: number | undefined = undefined;
  const ahead = gitShort("rev-list --count @{u}..HEAD");
  if (ahead) {
    const n = parseInt(ahead, 10);
    if (!Number.isNaN(n)) commitsAhead = n;
  }

  return { available: true, branch, headShort, lastMessage, staged, unstaged, untracked, commitsAhead };
}

function categorize(paths: string[]): Modified {
  const m: Modified = { skills: [], scripts: [], wrappers: [], docs: [], tests: [], other: [] };
  for (const raw of paths) {
    const p = raw.replace(/^"/, "").replace(/"$/, "");
    const isDir = p.endsWith("/");
    const isMd = p.endsWith(".md");
    const isTs = p.endsWith(".ts");
    if (p.startsWith(".claude/commands/") && (isDir || isMd)) m.skills.push(p);
    else if (p.startsWith("scripts/skill-wrappers/") && (isDir || isMd)) m.wrappers.push(p);
    else if (p.startsWith("scripts/") && (isDir || isTs)) m.scripts.push(p);
    else if (p.startsWith("docs/") || p === "CLAUDE.md" || p === "bugs.md") m.docs.push(p);
    else if (p.startsWith("tests_backend/") || p.startsWith("tests_business/") || p.startsWith("tests/")) m.tests.push(p);
    else m.other.push(p);
  }
  return m;
}

function buildPunchlist(r: ClosoutReport): string[] {
  const items: string[] = [];

  // Verdict-driven items
  if (r.reports.env.verdict === "DOWN") items.push("BLOCKER: backend env=DOWN - don't declare work done");
  if (r.reports.triage.verdict === "FAIL") items.push("BLOCKER: triage verdict=FAIL - regressions need investigation");
  if (r.reports.triage.verdict === "WARN") items.push("triage verdict=WARN - update expected-failures manifest");
  if (r.reports.perf.verdict === "FAIL") items.push("BLOCKER: perf verdict=FAIL - latency regressions outstanding");
  if (r.reports.health.verdict === "FAIL") items.push("health verdict=FAIL - see reports/health.json");
  if (r.reports.self.verdict === "FAIL") items.push("qa-self verdict=FAIL - tooling drift detected");

  // Missing-report items
  if (!r.reports.env.present)    items.push("no reports/env.json this session - consider running npm run qa:env");
  if (!r.reports.triage.present) items.push("no reports/triage.json this session - no pass/fail picture captured");

  // Modified-code items
  if (r.modified.skills.length > 0)
    items.push(r.modified.skills.length + " skill file(s) modified - append to reports/skill-improvements.md");
  if (r.modified.scripts.length > 0)
    items.push(r.modified.scripts.length + " script(s) modified - run npm run qa:self to verify trilogy consistency");
  if (r.modified.wrappers.length > 0)
    items.push(r.modified.wrappers.length + " wrapper(s) modified - run npm run qa:self");
  if (r.modified.docs.length > 0)
    items.push(r.modified.docs.length + " doc file(s) modified - CLAUDE.md doc routing table still accurate?");
  if (r.modified.tests.length > 0)
    items.push(r.modified.tests.length + " test file(s) modified - rerun npm run qa:triage before declaring done");

  // Git hygiene
  if (r.git.unstaged.length > 0 && r.git.untracked.length > 0) {
    items.push("git: " + r.git.unstaged.length + " unstaged + " + r.git.untracked.length + " untracked file(s) - commit or clean up");
  } else if (r.git.unstaged.length > 0) {
    items.push("git: " + r.git.unstaged.length + " unstaged modification(s)");
  } else if (r.git.untracked.length > 0) {
    items.push("git: " + r.git.untracked.length + " untracked file(s)");
  }

  return items;
}

function saveReport(report: ClosoutReport): void {
  mkdirSync(REPORTS, { recursive: true });
  writeFileSync(OUT_PATH, JSON.stringify(report, null, 2) + "\n", "utf-8");
}

function printHuman(r: ClosoutReport): void {
  console.log("[qa-finished] closeout snapshot");
  const verdicts = [
    "env=" + r.reports.env.verdict,
    "triage=" + r.reports.triage.verdict,
    "perf=" + r.reports.perf.verdict,
    "health=" + r.reports.health.verdict,
    "self=" + r.reports.self.verdict,
  ].join(" ");
  console.log("  verdicts: " + verdicts);

  if (r.git.available) {
    const gitLine = "branch=" + r.git.branch
      + " head=" + (r.git.headShort ?? "?")
      + " staged=" + r.git.staged.length
      + " unstaged=" + r.git.unstaged.length
      + " untracked=" + r.git.untracked.length;
    console.log("  git: " + gitLine);
  } else {
    console.log("  git: not available");
  }

  const mod = r.modified;
  const modLine = "skills=" + mod.skills.length
    + " scripts=" + mod.scripts.length
    + " wrappers=" + mod.wrappers.length
    + " docs=" + mod.docs.length
    + " tests=" + mod.tests.length
    + " other=" + mod.other.length;
  console.log("  modified: " + modLine);

  if (r.punchlist.length === 0) {
    console.log("  punchlist: (clean)");
  } else {
    console.log("  punchlist:");
    for (const item of r.punchlist) console.log("    - " + item);
  }
}

async function main(): Promise<number> {
  const opts = parseArgs(process.argv.slice(2));

  const git = readGit();
  const changedPaths = [...new Set([...git.staged, ...git.unstaged, ...git.untracked])];
  const modified = categorize(changedPaths);

  const reports = {
    env:      snap("env.json",              "overall"),
    triage:   snap("triage.json",           "verdict"),
    perf:     snap("perf.json",             "verdict"),
    health:   snap("health.json",           "verdict"),
    next:     snap("next.json",             "verdict"),     // next has no verdict; remains "unknown" — fine
    self:     snap("self.json",             "verdict"),
    coverage: snap("coverage.json",         "verdict"),     // coverage has none too; remains "unknown"
    bugs:     snap("bugs-mechanical.json",  "verdict"),     // bugs has none too; remains "unknown"
  };

  const report: ClosoutReport = {
    version: 1,
    generatedAt: new Date().toISOString(),
    git, reports, modified,
    punchlist: [],
  };
  report.punchlist = buildPunchlist(report);

  saveReport(report);

  if (opts.json) console.log(JSON.stringify(report, null, 2));
  else if (!opts.quiet) printHuman(report);

  return 0;
}

main().then((code) => process.exit(code)).catch((err) => {
  console.error("[qa-finished] fatal:", (err as Error).message);
  process.exit(2);
});
