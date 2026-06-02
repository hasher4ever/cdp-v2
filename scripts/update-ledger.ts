/**
 * One-shot ledger updater — reads reports/triage.json + reports/expected-failures.json,
 * removes the fixed-known entries, adds new-failure entries with bugId tagging where
 * we can confidently map.
 *
 * Run: node --experimental-strip-types scripts/update-ledger.ts
 * Writes: reports/expected-failures.json (backup at .bak.<ts>)
 */
import { readFileSync, writeFileSync, copyFileSync } from "node:fs";

type Entry = {
  suite: "backend" | "business";
  file: string;
  fullName: string;
  bugId: string | null;
  firstSeen: string;
  notes: string;
};

type Triage = {
  newFailures: Array<{ suite: string; file: string; fullName: string; failureMessage?: string }>;
  fixedKnownFailures: Array<{ suite: string; file: string; fullName: string; bugId: string | null }>;
};

const LEDGER = "reports/expected-failures.json";
const TRIAGE = "reports/triage.json";
const TODAY = "2026-06-02";

const triage = JSON.parse(readFileSync(TRIAGE, "utf8")) as Triage;
const ledger = JSON.parse(readFileSync(LEDGER, "utf8")) as { version: number; generatedAt: string; entries: Entry[] };

// ─── Map a failing test to a bugId based on file + name + failure message ─────
function mapBugId(suite: string, file: string, fullName: string, msg = ""): string | null {
  const m = msg.toLowerCase();
  const n = fullName.toLowerCase();

  // Today's new findings
  if (file.includes("categorizations-logic")) {
    if (n.includes("small_population")) return "BUG-081";
    if (n.includes("put ") || n.includes("update") || n.includes("refresh") || n.includes("tier")) return "BUG-079";
    if (n.includes("delete")) return "BUG-080";
    return "BUG-079";
  }
  if (file.includes("metrics-logic")) return "BUG-084";
  if (file.includes("heatmap-logic") && (n.includes("cells") || n.includes("query"))) return "BUG-085";
  if (file.includes("marketing-flows")) {
    if (n.includes("deactivate") && n.includes("new")) return "BUG-082";
    if (n.includes("reactivate")) return "BUG-083";
    return null;
  }

  // Template contract change
  if (file.includes("template") || n.includes("template")) {
    if (m.includes("templatere") || m.includes("htmlbody") || m.includes("variables")) return "BUG-087";
  }

  // Campaign preview drift (resolves BUG-031 root cause)
  if (n.includes("preview") && (n.includes("campaign") || file.includes("campaign"))) return "BUG-088";

  // BUG-090: multi-predicate AND/OR group drops everything after the first predicate.
  // Affects v2 list filters and segmentation evaluations.
  if (
    file.includes("segmentation-advanced-predicates") ||
    file.includes("segmentation-field-types") ||
    file.includes("segmentation-complex") ||
    file.includes("segmentation-preview-logic") ||
    file.includes("segmentation-preview-correctness") ||
    file.includes("v2-events-query") ||
    file.includes("data-filtering") ||
    file.includes("data-integrity-edge-cases")
  ) {
    return "BUG-090";
  }

  return null;
}

const fixedSet = new Set(
  triage.fixedKnownFailures.map(f => `${f.suite}::${f.file}::${f.fullName}`)
);
const beforeLedgerCount = ledger.entries.length;
ledger.entries = ledger.entries.filter(e => !fixedSet.has(`${e.suite}::${e.file}::${e.fullName}`));
const removed = beforeLedgerCount - ledger.entries.length;

// Add new failures, deduped against current ledger
const inLedger = new Set(ledger.entries.map(e => `${e.suite}::${e.file}::${e.fullName}`));
let added = 0;
let tagged = 0;
for (const nf of triage.newFailures) {
  const key = `${nf.suite}::${nf.file}::${nf.fullName}`;
  if (inLedger.has(key)) continue;
  const bugId = mapBugId(nf.suite, nf.file, nf.fullName, nf.failureMessage ?? "");
  if (bugId) tagged++;
  ledger.entries.push({
    suite: nf.suite as "backend" | "business",
    file: nf.file,
    fullName: nf.fullName,
    bugId,
    firstSeen: TODAY,
    notes: "",
  });
  inLedger.add(key);
  added++;
}

// Sort for stable diffs: suite, file, fullName
ledger.entries.sort((a, b) =>
  (a.suite + a.file + a.fullName).localeCompare(b.suite + b.file + b.fullName)
);
ledger.generatedAt = new Date().toISOString();

const bak = `${LEDGER}.bak.${Date.now()}`;
copyFileSync(LEDGER, bak);
writeFileSync(LEDGER, JSON.stringify(ledger, null, 2));

console.log(`removed (fixed):  ${removed}`);
console.log(`added (new):      ${added}`);
console.log(`  with bugId:     ${tagged}`);
console.log(`  unclassified:   ${added - tagged}`);
console.log(`final entries:    ${ledger.entries.length}`);
console.log(`backup:           ${bak}`);
