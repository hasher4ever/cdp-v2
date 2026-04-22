/**
 * Deterministic self-audit of the QA tooling.
 *
 * Verifies the script/wrapper/npm-script trilogy:
 *   - Every `qa:*` npm script points at a script file that exists
 *   - Every `scripts/qa-*.ts` referenced by npm has a wrapper
 *   - Every wrapper has a backing script and valid frontmatter
 *   - Every canonical `reports/*.json` parses and has expected keys
 *
 * Usage:
 *   npx tsx scripts/qa-self.ts             audit -> reports/self.json + stdout
 *   npx tsx scripts/qa-self.ts --json      machine-readable stdout
 *   npx tsx scripts/qa-self.ts --strict    exit 1 on WARN too
 *   npx tsx scripts/qa-self.ts --quiet     no stdout
 *
 * Exit codes:
 *   0 = PASS or WARN (without --strict)
 *   1 = FAIL (or WARN with --strict)
 *   2 = script error
 */
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "fs";
import { resolve } from "path";

type Severity = "PASS" | "WARN" | "FAIL";

interface Finding {
  check: string;
  severity: Severity;
  message: string;
  detail?: string;
}

interface Inventory {
  npmQaScripts: string[];
  scriptFiles: string[];
  wrapperFiles: string[];
  activatedWrappers: string[];
  reportFiles: string[];
}

interface SelfReport {
  version: 1;
  generatedAt: string;
  verdict: Severity;
  counts: { pass: number; warn: number; fail: number };
  findings: Finding[];
  inventory: Inventory;
}

interface Opts { json: boolean; quiet: boolean; strict: boolean }

const ROOT = process.cwd();
const PKG_PATH = resolve(ROOT, "package.json");
const SCRIPTS_DIR = resolve(ROOT, "scripts");
const WRAPPERS_DIR = resolve(SCRIPTS_DIR, "skill-wrappers");
const COMMANDS_DIR = resolve(ROOT, ".claude", "commands");
const REPORTS_DIR = resolve(ROOT, "reports");
const OUT_PATH = resolve(REPORTS_DIR, "self.json");

const SCRIPT_REF_RE = /scripts\/(qa-[a-z-]+)\.ts/g;
const NPM_RUN_RE = /\bnpm\s+run\s+/;

function parseArgs(argv: string[]): Opts {
  const opts: Opts = { json: false, quiet: false, strict: false };
  for (const a of argv) {
    if (a === "--json") opts.json = true;
    else if (a === "--quiet") opts.quiet = true;
    else if (a === "--strict") opts.strict = true;
    else if (a === "--help" || a === "-h") {
      console.log("Usage: npx tsx scripts/qa-self.ts [--json|--quiet|--strict]");
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

function listByPrefix(dir: string, prefix: string, suffix: string): string[] {
  if (!existsSync(dir)) return [];
  return readdirSync(dir).filter((f) => f.startsWith(prefix) && f.endsWith(suffix)).sort();
}

function hasFrontmatter(content: string): { ok: boolean; name?: string } {
  const m = content.match(/^---\s*\n([\s\S]*?)\n---/);
  if (!m) return { ok: false };
  const body = m[1];
  const nameMatch = body.match(/^name:\s*(.+)$/m);
  const descMatch = body.match(/^description:\s*/m);
  const name = nameMatch ? nameMatch[1].trim() : undefined;
  const hasDesc = !!descMatch;
  return { ok: !!name && hasDesc, name };
}

function audit(): { findings: Finding[]; inventory: Inventory } {
  const findings: Finding[] = [];

  const pkg = readJsonSafe<{ scripts?: Record<string, string> }>(PKG_PATH);
  if (!pkg || !pkg.scripts) {
    findings.push({ check: "package.json", severity: "FAIL", message: "package.json missing or has no scripts field" });
    return {
      findings,
      inventory: { npmQaScripts: [], scriptFiles: [], wrapperFiles: [], activatedWrappers: [], reportFiles: [] },
    };
  }

  const npmQaScripts = Object.keys(pkg.scripts).filter((k) => k.startsWith("qa:")).sort();
  const scriptFiles = listByPrefix(SCRIPTS_DIR, "qa-", ".ts");
  const wrapperFiles = listByPrefix(WRAPPERS_DIR, "qa-", ".md");
  const activatedWrappers = listByPrefix(COMMANDS_DIR, "qa-", ".md");
  const reportFiles = existsSync(REPORTS_DIR)
    ? readdirSync(REPORTS_DIR).filter((f) => f.endsWith(".json")).sort()
    : [];

  const referencedStems = new Set<string>();
  for (const key of npmQaScripts) {
    const cmd = pkg.scripts[key];
    SCRIPT_REF_RE.lastIndex = 0;
    let mm: RegExpExecArray | null;
    while ((mm = SCRIPT_REF_RE.exec(cmd)) !== null) referencedStems.add(mm[1]);
  }

  // Check 1: every qa:* npm command resolves (direct script or composite).
  for (const key of npmQaScripts) {
    const cmd = pkg.scripts[key];
    SCRIPT_REF_RE.lastIndex = 0;
    const directStems: string[] = [];
    let mm: RegExpExecArray | null;
    while ((mm = SCRIPT_REF_RE.exec(cmd)) !== null) directStems.push(mm[1]);
    const isComposite = NPM_RUN_RE.test(cmd);
    if (directStems.length === 0 && !isComposite) {
      findings.push({ check: "npm-script:" + key, severity: "WARN", message: "not a scripts/qa-*.ts invocation or npm-composite", detail: cmd });
      continue;
    }
    for (const stem of directStems) {
      const scriptPath = resolve(SCRIPTS_DIR, stem + ".ts");
      if (!existsSync(scriptPath)) {
        findings.push({ check: "npm-script:" + key, severity: "FAIL", message: "points to missing file", detail: "scripts/" + stem + ".ts" });
      }
    }
  }

  // Check 2: every first-class scripts/qa-*.ts has a wrapper.
  for (const file of scriptFiles) {
    const stem = file.replace(/\.ts$/, "");
    if (!referencedStems.has(stem)) continue;
    const wrapperExists = wrapperFiles.includes(stem + ".md") || activatedWrappers.includes(stem + ".md");
    if (!wrapperExists) {
      findings.push({
        check: "wrapper:" + stem,
        severity: "WARN",
        message: "no wrapper in scripts/skill-wrappers/ or .claude/commands/",
        detail: "script: scripts/" + file,
      });
    }
  }

  // Check 3: every staged wrapper has a backing script.
  for (const wf of wrapperFiles) {
    const stem = wf.replace(/\.md$/, "");
    if (!scriptFiles.includes(stem + ".ts")) {
      findings.push({
        check: "wrapper-orphan:" + stem,
        severity: "WARN",
        message: "wrapper has no backing scripts/qa-*.ts",
        detail: "wrapper: scripts/skill-wrappers/" + wf,
      });
    }
  }

  // Check 4: every wrapper has valid frontmatter.
  for (const wf of wrapperFiles) {
    const path = resolve(WRAPPERS_DIR, wf);
    const fm = hasFrontmatter(readFileSync(path, "utf-8"));
    if (!fm.ok) {
      findings.push({
        check: "frontmatter:" + wf,
        severity: "FAIL",
        message: "missing name: or description: in frontmatter",
      });
    } else {
      const expectedName = wf.replace(/\.md$/, "");
      if (fm.name !== expectedName) {
        findings.push({
          check: "frontmatter:" + wf,
          severity: "WARN",
          message: "frontmatter name does not match filename",
          detail: "got=" + fm.name + " expected=" + expectedName,
        });
      }
    }
  }

  // Check 5: every canonical report that exists parses as JSON.
  const OWNED_REPORTS = [
    "env.json", "triage.json", "perf.json", "perf-baseline.json",
    "health.json", "next.json", "coverage.json", "bugs-mechanical.json",
    "expected-failures.json", "ef-suggestions.json", "self.json",
  ];
  for (const rf of OWNED_REPORTS) {
    const path = resolve(REPORTS_DIR, rf);
    if (!existsSync(path)) continue;
    try { JSON.parse(readFileSync(path, "utf-8")); }
    catch (err) {
      findings.push({
        check: "report-json:" + rf,
        severity: "FAIL",
        message: "invalid JSON",
        detail: (err as Error).message,
      });
    }
  }

  // Check 6: contract integrity for core reports.
  const contracts: { file: string; keys: string[] }[] = [
    { file: "env.json",               keys: ["overall", "checks"] },
    { file: "triage.json",            keys: ["verdict", "summary"] },
    { file: "perf.json",              keys: ["verdict", "diff"] },
    { file: "health.json",            keys: ["verdict"] },
    { file: "next.json",              keys: ["actions", "inputs"] },
    { file: "coverage.json",          keys: ["files", "endpoints", "summary"] },
    { file: "bugs-mechanical.json",   keys: ["bugs", "totals", "issues"] },
    { file: "expected-failures.json", keys: ["entries"] },
  ];
  for (const c of contracts) {
    const path = resolve(REPORTS_DIR, c.file);
    if (!existsSync(path)) continue;
    const j = readJsonSafe<Record<string, unknown>>(path);
    if (!j) continue;
    const missing = c.keys.filter((k) => !(k in j));
    if (missing.length > 0) {
      findings.push({
        check: "contract:" + c.file,
        severity: "FAIL",
        message: "missing keys: " + missing.join(","),
      });
    }
  }

  // Check 7: expected-failures debt ratio.
  const ef = readJsonSafe<{ entries?: { bugId: string | null }[] }>(resolve(REPORTS_DIR, "expected-failures.json"));
  if (ef && Array.isArray(ef.entries)) {
    const total = ef.entries.length;
    const unclassified = ef.entries.filter((e) => !e.bugId || e.bugId === "UNCLASSIFIED").length;
    if (total > 0 && unclassified / total >= 0.5) {
      findings.push({
        check: "expected-failures-debt",
        severity: "WARN",
        message: unclassified + " of " + total + " entries have no bugId",
        detail: "Run scripts/qa-annotate-ef.ts to surface suggestions.",
      });
    }
  }

  if (findings.length === 0) {
    findings.push({ check: "all", severity: "PASS", message: "script/wrapper/report inventory consistent" });
  }

  return {
    findings,
    inventory: { npmQaScripts, scriptFiles, wrapperFiles, activatedWrappers, reportFiles },
  };
}

function verdictOf(findings: Finding[]): Severity {
  if (findings.some((f) => f.severity === "FAIL")) return "FAIL";
  if (findings.some((f) => f.severity === "WARN")) return "WARN";
  return "PASS";
}

function saveReport(report: SelfReport): void {
  mkdirSync(REPORTS_DIR, { recursive: true });
  writeFileSync(OUT_PATH, JSON.stringify(report, null, 2) + "\n", "utf-8");
}

function printHuman(report: SelfReport): void {
  const head = "[qa-self] verdict=" + report.verdict
    + " PASS=" + report.counts.pass
    + " WARN=" + report.counts.warn
    + " FAIL=" + report.counts.fail;
  console.log(head);
  const inv = "  inventory: scripts=" + report.inventory.scriptFiles.length
    + " wrappers=" + report.inventory.wrapperFiles.length
    + " activated=" + report.inventory.activatedWrappers.length;
  console.log(inv);
  for (const f of report.findings) {
    if (f.severity === "PASS" && report.findings.length > 1) continue;
    console.log("  [" + f.severity + "] " + f.check + ": " + f.message);
    if (f.detail) console.log("      " + f.detail);
  }
}

async function main(): Promise<number> {
  const opts = parseArgs(process.argv.slice(2));
  const { findings, inventory } = audit();
  const verdict = verdictOf(findings);
  const counts = {
    pass: findings.filter((f) => f.severity === "PASS").length,
    warn: findings.filter((f) => f.severity === "WARN").length,
    fail: findings.filter((f) => f.severity === "FAIL").length,
  };
  const report: SelfReport = {
    version: 1,
    generatedAt: new Date().toISOString(),
    verdict, counts, findings, inventory,
  };
  saveReport(report);

  if (opts.json) console.log(JSON.stringify(report, null, 2));
  else if (!opts.quiet) printHuman(report);

  if (verdict === "FAIL") return 1;
  if (verdict === "WARN" && opts.strict) return 1;
  return 0;
}

main().then((code) => process.exit(code)).catch((err) => {
  console.error("[qa-self] fatal:", (err as Error).message);
  process.exit(2);
});
