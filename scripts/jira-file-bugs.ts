/**
 * Bulk-file BUG-079..BUG-104 from bugs.md into ssduz.atlassian.net / CDP project.
 * Idempotency: skips bugs that already have a CDP-XXXX ticket via labels search.
 * Records mappings into reports/jira-mapping.json so subsequent runs are no-ops.
 *
 * Run: node --experimental-strip-types scripts/jira-file-bugs.ts
 * Required env: JIRA_TOKEN (Atlassian API token), JIRA_EMAIL (account email)
 */
import { readFileSync, writeFileSync, existsSync } from "node:fs";

const SITE = "ssduz.atlassian.net";
const PROJECT_KEY = "CDP";
const LABEL = "qa-suite-2026-06-02";
const BUG_RANGE = { lo: 79, hi: 104 };

const email = process.env.JIRA_EMAIL;
const token = process.env.JIRA_TOKEN;
if (!email || !token) { console.error("set JIRA_EMAIL + JIRA_TOKEN"); process.exit(1); }

const authHeader = "Basic " + Buffer.from(`${email}:${token}`).toString("base64");

type BugEntry = { id: string; summary: string; body: string };

function parseBugs(): BugEntry[] {
  const md = readFileSync("bugs.md", "utf8");
  const lines = md.split("\n");
  const entries: BugEntry[] = [];
  let cur: BugEntry | null = null;
  const headRe = /^## (BUG-\d+): (.+)$/;
  for (const line of lines) {
    const m = line.match(headRe);
    if (m) {
      if (cur) entries.push(cur);
      cur = { id: m[1], summary: m[2].trim(), body: "" };
      continue;
    }
    if (cur) {
      if (line.trim() === "---") {
        entries.push(cur);
        cur = null;
        continue;
      }
      cur.body += line + "\n";
    }
  }
  if (cur) entries.push(cur);

  const n = (id: string) => parseInt(id.replace("BUG-", ""), 10);
  return entries.filter(e => {
    const num = n(e.id);
    return num >= BUG_RANGE.lo && num <= BUG_RANGE.hi;
  });
}

// Convert plain markdown-ish text to a minimal ADF document.
// Atlassian REST v3 requires description as ADF; we build a `codeBlock` for the body
// so newlines + indentation survive and the reproducer stays copy-pasteable.
function toAdf(text: string, headline: string): unknown {
  return {
    type: "doc",
    version: 1,
    content: [
      { type: "paragraph", content: [{ type: "text", text: headline, marks: [{ type: "strong" }] }] },
      { type: "codeBlock", attrs: { language: "markdown" }, content: [{ type: "text", text: text.trim() || "(no body)" }] },
    ],
  };
}

async function findExisting(bugId: string): Promise<string | null> {
  const jql = encodeURIComponent(`project = ${PROJECT_KEY} AND summary ~ "${bugId}" AND labels = "${LABEL}"`);
  const res = await fetch(`https://${SITE}/rest/api/3/search?jql=${jql}&fields=summary&maxResults=1`, {
    headers: { Authorization: authHeader, Accept: "application/json" },
  });
  if (!res.ok) return null;
  const j = await res.json() as { issues?: Array<{ key: string }> };
  return j.issues?.[0]?.key ?? null;
}

async function createIssue(bug: BugEntry): Promise<string> {
  const summary = `[QA] ${bug.id}: ${bug.summary}`.slice(0, 240);
  const payload = {
    fields: {
      project: { key: PROJECT_KEY },
      issuetype: { name: "Bug" },
      summary,
      labels: [LABEL, bug.id.toLowerCase()],
      description: toAdf(bug.body, `${bug.id}: ${bug.summary}`),
    },
  };
  const res = await fetch(`https://${SITE}/rest/api/3/issue`, {
    method: "POST",
    headers: {
      Authorization: authHeader,
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    const txt = await res.text();
    throw new Error(`${res.status} ${txt.slice(0, 300)}`);
  }
  const j = await res.json() as { key: string };
  return j.key;
}

async function main() {
  const bugs = parseBugs();
  console.log(`Found ${bugs.length} bug entries in BUG-${BUG_RANGE.lo}..BUG-${BUG_RANGE.hi}`);

  const mapping: Record<string, string> = existsSync("reports/jira-mapping.json")
    ? JSON.parse(readFileSync("reports/jira-mapping.json", "utf8"))
    : {};

  let created = 0, skipped = 0, failed = 0;
  for (const bug of bugs) {
    if (mapping[bug.id]) {
      console.log(`  ${bug.id} → ${mapping[bug.id]}  (cached, skip)`);
      skipped++;
      continue;
    }
    const existing = await findExisting(bug.id);
    if (existing) {
      mapping[bug.id] = existing;
      console.log(`  ${bug.id} → ${existing}  (found existing, skip)`);
      skipped++;
      continue;
    }
    try {
      const key = await createIssue(bug);
      mapping[bug.id] = key;
      console.log(`  ${bug.id} → ${key}  CREATED`);
      created++;
    } catch (e: any) {
      console.log(`  ${bug.id} FAILED: ${e.message?.slice(0, 200)}`);
      failed++;
    }
    writeFileSync("reports/jira-mapping.json", JSON.stringify(mapping, null, 2));
    // Be polite to the API
    await new Promise(r => setTimeout(r, 300));
  }

  console.log(`\ncreated=${created} skipped=${skipped} failed=${failed}`);
  console.log(`mapping → reports/jira-mapping.json`);
}

main().catch(e => { console.error(e); process.exit(1); });
