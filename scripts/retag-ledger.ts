/**
 * Walk current expected-failures.json and retag entries with bugId=null using
 * the same heuristics as update-ledger.ts. Used after diagnosing root causes
 * post-initial-ingest.
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

const LEDGER = "reports/expected-failures.json";
const ledger = JSON.parse(readFileSync(LEDGER, "utf8")) as { version: number; generatedAt: string; entries: Entry[] };

function mapBugId(suite: string, file: string, fullName: string): string | null {
  const n = fullName.toLowerCase();

  if (file.includes("categorizations-logic")) {
    if (n.includes("small_population")) return "BUG-081";
    if (n.includes("delete")) return "BUG-080";
    return "BUG-079";
  }
  if (file.includes("metrics-logic")) return "BUG-084";

  // temporal-segments.test.ts: relative-window UDAFs (BUG-091) + multi-predicate field filters (BUG-090)
  if (file.includes("temporal-segments")) {
    if (n.includes("udaf") || n.includes("buyer") || n.includes("non-buyer") || n.includes("lapsed")) return "BUG-091";
    return "BUG-090";
  }

  // event-behavior.test.ts: all UDAF-based behavioral targeting (BUG-091)
  if (file.includes("event-behavior")) return "BUG-091";

  // marketing-journeys.test.ts: 19 marketer-facing journeys. UDAF-based → BUG-091, rest → BUG-090.
  if (file.includes("marketing-journeys")) {
    if (n.includes("udaf-based") || n.includes("ltv targeting") || n.includes("purchase") || n.includes("purchases")) {
      return "BUG-091";
    }
    if (n.includes("categorization") || n.includes("tier sizing")) return "BUG-081";
    return "BUG-090";
  }

  // UDAF compute desync — customers with no events should return 0/null but get
  // 500 or stale values due to BUG-078 materialization issues.
  if (
    (file.includes("udaf-field-types") || file.includes("udaf-logic") ||
     file.includes("udaf-recalculation-flow")) &&
    (n.includes("no events") || n.includes("custnone") || n.includes("custdelta"))
  ) {
    return "BUG-078";
  }
  // udaf-oracle is the full-dataset regression — failures imply compute desync
  if (file.includes("udaf-oracle")) return "BUG-078";

  if (file.includes("pagination-edge-cases")) return "BUG-090";

  // cohort-changes.test.ts: 4 distinct buckets
  if (file.includes("cohort-changes")) {
    if (n.includes("late-ingest") || n.includes("scoped count == 3") || n.includes("ingested mid-suite")) return "BUG-105";
    if (n.includes("re-ingesting") || n.includes("last_name surfaces")) return "BUG-104";
    if (n.includes("flipping") || n.includes("subscribed segment")) return "BUG-090"; // predicate cascade
    return "BUG-090"; // catch-all for cohort tests using multi-predicate queries
  }
  if (file.includes("heatmap-logic") && (n.includes("cells") || n.includes("query"))) return "BUG-085";

  // BUG-090: multi-predicate AND/OR drops predicates after the first.
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

  // BUG-091: UDAF-as-predicate-param rejected with "requires non-empty value"
  if (file.includes("segmentation-udaf")) return "BUG-091";

  // BUG-092: commchan batch_size validation regressed
  if (file.includes("commchan-boundary")) return "BUG-092";

  // BUG-093: pagination boundaries now return 409 (fix; tests are stale)
  if (file.includes("boundary-edge-cases") && (n.includes("size=-1") || n.includes("page=-") || n.includes("calculate"))) return "BUG-093";

  // BUG-087: Template contract changed (htmlBody/css/grepejs/variables[])
  if (
    file.includes("template-commchan-probe") ||
    file.includes("template-lifecycle") ||
    file.endsWith("/template.test.ts") ||
    n.includes("create email template") ||
    n.includes("create a template") ||
    n.includes("create an email template") ||
    n.includes("create an html template") ||
    n.includes("create a text template") ||
    n.includes("create html email template") ||
    (n.includes("template") && n.includes("create"))
  ) {
    return "BUG-087";
  }

  // BUG-086: Campaign CREATE 409 cascade — channel state misleading error
  if (
    (file.includes("campaign-canary") || file.includes("campaign-lifecycle") ||
     file.includes("seg-campaign-chain") || file.includes("campaign-logic") ||
     file.includes("full-workflow") || file.includes("cross-feature-workflow") ||
     file.includes("campaign-send-probe") || file.includes("campaign-udaf-preview") ||
     file.includes("api-health-probe") || file.includes("api-contract-v2")) &&
    (n.includes("campaign") && (n.includes("create") || n.includes("targeting") || n.includes("verified channel")))
  ) {
    return "BUG-086";
  }

  // Scenario cluster
  if (file.includes("scenario-creation")) return "BUG-096";
  if (file.includes("scenario-status-delete")) {
    if (n.includes("delete")) return "BUG-094";
    if (n.includes("status") && n.includes("new")) return "BUG-095";
    if (n.includes("non-existent") || n.includes("404")) return "BUG-097";
    return "BUG-094"; // catch-all for this file
  }
  if (file.includes("scenario-builder")) return "BUG-098";
  if (file.includes("scenario-execution")) {
    if (n.includes("template")) return "BUG-087";
    // Steps 7+ all cascade from webhook action node failing due to commchan state
    return "BUG-086";
  }

  // BUG-088: campaign preview shape changed
  if (file.includes("campaign-udaf-preview") && (n.includes("preview") || n.includes("compute"))) return "BUG-088";
  // Other campaign-udaf-preview tests (campaign/segmentation detail with UDAF segment) — cascade from BUG-086
  // (no UDAF-linked campaign exists in shared tenant because campaign create fails)
  if (file.includes("campaign-udaf-preview")) return "BUG-086";

  // Remaining cluster mappings (final pass)
  if (file.includes("employees")) return "BUG-099";
  if (file.includes("commchan.test.ts") && n.includes("verified")) return "BUG-100";
  if (file.includes("udaf-grouping")) return "BUG-101";
  if (file.includes("crud-delete")) {
    if (n.includes("template")) return "BUG-087";
    return "BUG-102";
  }
  if (file.includes("commchan-template-full") && (n.includes("pagination") || n.includes("out-of-range"))) return "BUG-103";
  if (file.includes("commchan-template-full")) return "BUG-087"; // remaining template create + PUT 404 chains
  if (file.includes("crud-update") || file.includes("customer-update-cascade")) return "BUG-104";

  // UDAF compute cascade — already-known issues
  if (file.includes("udafs.test.ts") && n.includes("types")) return "BUG-077";
  if (file.includes("udaf-phase2-assert")) return "BUG-078";
  if (file.includes("udafs-crud") && n.includes("calculate")) return "BUG-093"; // 409 vs 404 = backend validation tightened
  if (file.includes("boundary-edge-cases") && n.includes("udaf types")) return "BUG-077";

  // BUG-090 cascade: invariant/integration tests that depend on filtered counts being correct
  if (file.includes("full-workflow") && n.includes("invariant")) return "BUG-090";
  if (file.includes("full-workflow") && n.includes("template")) return "BUG-087";
  if (file.includes("full-workflow") && n.includes("campaign")) return "BUG-086";
  if (file.includes("cross-feature-workflow")) {
    if (n.includes("template")) return "BUG-087";
    if (n.includes("save a segme") || n.includes("campaign")) return "BUG-086";
    return "BUG-090";
  }
  if (file.includes("v2-data-query")) return "BUG-090";
  if (file.includes("segmentation-create-preview")) return "BUG-090";
  if (file.includes("api-contract-v2") && n.includes("segmentation")) return "BUG-090";
  if (file.includes("api-contract-v2") && n.includes("bug-050")) return "BUG-093"; // backend now returns 409 instead of nil-ptr 500
  if (file.includes("campaign-canary") && (n.includes("get by id") || n.includes("preview"))) return "BUG-086";
  if (file.includes("campaign.test.ts")) return "BUG-086";
  if (file.includes("seg-campaign-chain")) return "BUG-086";
  if (file.includes("concurrent-api-stress")) return "BUG-087"; // template-write cascade

  return null;
}

let tagged = 0;
for (const e of ledger.entries) {
  if (e.bugId) continue;
  const bug = mapBugId(e.suite, e.file, e.fullName);
  if (bug) {
    e.bugId = bug;
    tagged++;
  }
}

const bak = `${LEDGER}.bak.retag.${Date.now()}`;
copyFileSync(LEDGER, bak);
ledger.generatedAt = new Date().toISOString();
writeFileSync(LEDGER, JSON.stringify(ledger, null, 2));

console.log(`retagged entries: ${tagged}`);
console.log(`backup:           ${bak}`);

// Summary of bug-id distribution
const counts: Record<string, number> = {};
for (const e of ledger.entries) {
  const k = e.bugId ?? "(unclassified)";
  counts[k] = (counts[k] ?? 0) + 1;
}
console.log("\n=== ledger bugId distribution ===");
for (const [k, v] of Object.entries(counts).sort((a, b) => b[1] - a[1])) {
  console.log(`  ${k.padEnd(20)} ${v}`);
}
