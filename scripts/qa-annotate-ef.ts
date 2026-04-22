/**
 * Annotate reports/expected-failures.json entries that have no bugId by
 * matching their test fullName against bug titles in bugs.md.
 *
 * Matching strategy (deterministic, no LLM):
 *   1. Parse every "## BUG-NNN: <title>" heading from bugs.md
 *   2. For each heading, collect the section body until the next "## " heading
 *   3. For each unclassified entry, tokenize its fullName into meaningful words
 *      (>=4 chars, lowercased, alphanumeric) and score every bug by the count
 *      of token matches in title + body
 *   4. A suggestion is CONFIDENT if score >= 3 AND the gap to the second-best
 *      match is >= 2; otherwise WEAK (written to suggestions but not applied).
 *
 * Usage:
 *   npx tsx scripts/qa-annotate-ef.ts             # suggest -> reports/ef-suggestions.json
 *   npx tsx scripts/qa-annotate-ef.ts --apply     # apply CONFIDENT suggestions to expected-failures.json
 *   npx tsx scripts/qa-annotate-ef.ts --json      # machine-readable stdout
 *   npx tsx scripts/qa-annotate-ef.ts --quiet     # no stdout, exit code only
 *
 * Exit codes:
 *   0 - at least one suggestion emitted (any strength)
 *   1 - no suggestions possible (bugs.md or expected-failures.json missing)
 *   2 - script-level error
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "fs";
import { resolve } from "path";

interface Bug { id: string; title: string; body: string; wordSet: Set<string> }
interface Entry { suite: string; file: string; fullName: string; bugId: string | null; firstSeen?: string; notes?: string }
interface Manifest { version: number; generatedAt: string; entries: Entry[] }
interface Suggestion { key: string; fullName: string; currentBugId: string | null;
                      suggestedBugId: string | null; confidence: "CONFIDENT" | "WEAK" | "NONE";
                      score: number; runnerUpScore: number; reason: string }
interface SuggestionReport { version: 1; generatedAt: string; total: number; unclassified: number;
                             confident: number; weak: number; none: number; applied: number;
                             suggestions: Suggestion[] }

interface Opts { apply: boolean; json: boolean; quiet: boolean }

const ROOT = process.cwd();
const BUGS_PATH = resolve(ROOT, "bugs.md");
const EF_PATH = resolve(ROOT, "reports", "expected-failures.json");
const SUGG_PATH = resolve(ROOT, "reports", "ef-suggestions.json");

const MIN_WORD_LEN = 4;
const CONFIDENT_SCORE = 3;
const CONFIDENT_GAP = 2;

// English stopwords + test-domain words that carry no signal ("should", "test", etc.)
const STOP = new Set([
  "should","when","then","given","with","from","into","test","tests","case","cases","handle","handles",
  "return","returns","returning","proper","properly","structure","endpoint","endpoints","api","api's",
  "have","this","that","which","where","what","does","doesn't","still","just","like","also","some","more",
  "find","finds","found","expect","expects","accept","accepts","accepted","value","values","data","record",
  "records","empty","null","true","false","same","exist","exists","existent","existing","work","works",
  "worked","correct","correctly","valid","invalid","check","checks","only","both","each","every",
  "before","after","create","creates","created","update","updates","updated","delete","deletes","deleted",
  "fetch","fetches","fetched","read","reads","write","writes","name","names","field","fields","type","types",
  "make","makes","made","response","responses","request","requests","proper","properties","body","bodies",
  "display","displays","normal","pass","passed","fail","failed","total","count","counts","show","shows",
  "through","against","able","cannot","canot","able","given","using","while","must","must't","unique",
]);

function parseArgs(argv: string[]): Opts {
  const o: Opts = { apply: false, json: false, quiet: false };
  for (const a of argv) {
    if (a === "--apply") o.apply = true;
    else if (a === "--json") o.json = true;
    else if (a === "--quiet") o.quiet = true;
    else if (a === "--help" || a === "-h") {
      console.log("Usage: npx tsx scripts/qa-annotate-ef.ts [--apply|--json|--quiet]");
      process.exit(0);
    }
  }
  return o;
}

function parseBugs(md: string): Bug[] {
  const lines = md.split("\n");
  const bugs: Bug[] = [];
  let current: Bug | null = null;
  const headingRe = /^## (BUG-\d{3,4}):\s*(.+)$/;
  for (const line of lines) {
    const m = line.match(headingRe);
    if (m) {
      if (current) bugs.push(current);
      current = { id: m[1], title: m[2].trim(), body: "", wordSet: new Set() };
    } else if (current) {
      // Stop accumulating body when we hit the next top-level heading (## or # )
      if (/^#{1,2}\s/.test(line) && !/^## BUG-/.test(line)) {
        if (current) { bugs.push(current); current = null; continue; }
      }
      current.body += line + "\n";
    }
  }
  if (current) bugs.push(current);
  for (const b of bugs) {
    b.wordSet = tokenize(b.title + " " + b.body);
  }
  return bugs;
}

function tokenize(s: string): Set<string> {
  const out = new Set<string>();
  const re = /[a-z][a-z0-9_]*/g;
  const lower = s.toLowerCase();
  for (const m of lower.matchAll(re)) {
    const w = m[0];
    if (w.length >= MIN_WORD_LEN && !STOP.has(w)) out.add(w);
  }
  return out;
}

function scoreMatch(entryWords: Set<string>, bug: Bug): number {
  let score = 0;
  for (const w of entryWords) if (bug.wordSet.has(w)) score++;
  // Boost for shared words that appear in the bug title specifically (high signal)
  const titleWords = tokenize(bug.title);
  for (const w of entryWords) if (titleWords.has(w)) score++;
  return score;
}

function keyOf(e: Entry): string {
  return e.suite + " :: " + e.file + " :: " + e.fullName;
}

function suggest(entries: Entry[], bugs: Bug[]): Suggestion[] {
  const out: Suggestion[] = [];
  for (const e of entries) {
    if (e.bugId && e.bugId !== "UNCLASSIFIED") continue;
    const words = tokenize(e.fullName + " " + e.file);
    const scored = bugs.map((b) => ({ bug: b, score: scoreMatch(words, b) }))
      .sort((a, z) => z.score - a.score);
    const best = scored[0];
    const second = scored[1];
    const runnerUp = second?.score ?? 0;

    let confidence: Suggestion["confidence"] = "NONE";
    let suggestedBugId: string | null = null;
    let reason = "no bug-title words matched";

    if (best && best.score > 0) {
      suggestedBugId = best.bug.id;
      if (best.score >= CONFIDENT_SCORE && (best.score - runnerUp) >= CONFIDENT_GAP) {
        confidence = "CONFIDENT";
        reason = "score=" + best.score + " (vs " + runnerUp + ") against " + best.bug.id + ": " + best.bug.title.slice(0, 60);
      } else {
        confidence = "WEAK";
        reason = "top=" + best.bug.id + " score=" + best.score + " gap=" + (best.score - runnerUp) + " (needs score>=" + CONFIDENT_SCORE + " and gap>=" + CONFIDENT_GAP + ")";
      }
    }

    out.push({
      key: keyOf(e),
      fullName: e.fullName,
      currentBugId: e.bugId ?? null,
      suggestedBugId,
      confidence,
      score: best?.score ?? 0,
      runnerUpScore: runnerUp,
      reason,
    });
  }
  return out;
}

function apply(entries: Entry[], suggestions: Suggestion[]): number {
  const bySugg = new Map(suggestions.map((s) => [s.key, s]));
  let n = 0;
  for (const e of entries) {
    if (e.bugId) continue;
    const s = bySugg.get(keyOf(e));
    if (s && s.confidence === "CONFIDENT" && s.suggestedBugId) {
      e.bugId = s.suggestedBugId;
      e.notes = (e.notes ? e.notes + " | " : "") + "auto-annotated by qa-annotate-ef.ts";
      n++;
    }
  }
  return n;
}

async function main(): Promise<number> {
  const opts = parseArgs(process.argv.slice(2));
  if (!existsSync(BUGS_PATH)) { console.error("[qa-annotate-ef] bugs.md missing at " + BUGS_PATH); return 1; }
  if (!existsSync(EF_PATH))   { console.error("[qa-annotate-ef] expected-failures.json missing"); return 1; }

  const bugs = parseBugs(readFileSync(BUGS_PATH, "utf-8"));
  const manifest = JSON.parse(readFileSync(EF_PATH, "utf-8")) as Manifest;
  const entries = manifest.entries ?? [];

  const suggestions = suggest(entries, bugs);
  const confident = suggestions.filter((s) => s.confidence === "CONFIDENT").length;
  const weak = suggestions.filter((s) => s.confidence === "WEAK").length;
  const none = suggestions.filter((s) => s.confidence === "NONE").length;

  let applied = 0;
  if (opts.apply) {
    applied = apply(entries, suggestions);
    manifest.generatedAt = new Date().toISOString();
    writeFileSync(EF_PATH, JSON.stringify(manifest, null, 2) + "\n", "utf-8");
  }

  const report: SuggestionReport = {
    version: 1,
    generatedAt: new Date().toISOString(),
    total: suggestions.length + entries.filter((e) => e.bugId).length,
    unclassified: suggestions.length,
    confident, weak, none, applied,
    suggestions,
  };
  mkdirSync(resolve(ROOT, "reports"), { recursive: true });
  writeFileSync(SUGG_PATH, JSON.stringify(report, null, 2) + "\n", "utf-8");

  if (opts.json) {
    console.log(JSON.stringify(report, null, 2));
  } else if (!opts.quiet) {
    console.log("[qa-annotate-ef] parsed " + bugs.length + " bugs from bugs.md");
    console.log("[qa-annotate-ef] unclassified=" + suggestions.length + " -> confident=" + confident + " weak=" + weak + " none=" + none);
    if (opts.apply) console.log("[qa-annotate-ef] applied " + applied + " CONFIDENT suggestion(s) to " + EF_PATH);
    else console.log("[qa-annotate-ef] (dry-run) rerun with --apply to write CONFIDENT suggestions");
    console.log("[qa-annotate-ef] details -> " + SUGG_PATH);
    // Show the top-5 confident so the user knows what would be applied
    const top5 = suggestions.filter((s) => s.confidence === "CONFIDENT").slice(0, 5);
    if (top5.length > 0) {
      console.log("sample CONFIDENT mappings:");
      for (const s of top5) console.log("  " + s.suggestedBugId + " <- " + s.fullName.slice(0, 80));
    }
  }
  return 0;
}

main().then((code) => process.exit(code)).catch((err) => {
  console.error("[qa-annotate-ef] fatal:", (err as Error).message);
  process.exit(2);
});
