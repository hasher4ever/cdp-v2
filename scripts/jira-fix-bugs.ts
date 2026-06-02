/**
 * Fix the 26 tickets I just created:
 *   1. Add component "New architecture" (id 10040) — required for board 411 visibility
 *   2. Rewrite description in proper ADF (heading + paragraph + codeBlock sections)
 *   3. Set priority from the bug entry's "Severity: ..." line
 *
 * Idempotent: re-running just re-applies the same fields. Reads reports/jira-mapping.json
 * for the BUG-N → CDP-NNNN mapping.
 */
import { readFileSync } from "node:fs";

const SITE = "ssduz.atlassian.net";
const COMPONENT_ID_NEW_ARCH = "10040";

const email = process.env.JIRA_EMAIL!;
const token = process.env.JIRA_TOKEN!;
const auth = "Basic " + Buffer.from(`${email}:${token}`).toString("base64");

const mapping = JSON.parse(readFileSync("reports/jira-mapping.json", "utf8")) as Record<string, string>;
const md = readFileSync("bugs.md", "utf8");

// ─── Parse bugs.md ────────────────────────────────────────────────────────────
type Bug = { id: string; summary: string; body: string };

function parseBugs(): Bug[] {
  const lines = md.split("\n");
  const out: Bug[] = [];
  let cur: Bug | null = null;
  const re = /^## (BUG-\d+): (.+)$/;
  for (const line of lines) {
    const m = line.match(re);
    if (m) {
      if (cur) out.push(cur);
      cur = { id: m[1], summary: m[2].trim(), body: "" };
      continue;
    }
    if (cur) {
      if (line.trim() === "---") { out.push(cur); cur = null; continue; }
      cur.body += line + "\n";
    }
  }
  if (cur) out.push(cur);
  return out;
}

// ─── Markdown → ADF ───────────────────────────────────────────────────────────
type ADFNode = any;

function textWithBoldRuns(line: string): ADFNode[] {
  // Convert **bold** segments to text + strong marks.
  const parts: ADFNode[] = [];
  const re = /\*\*([^*]+)\*\*/g;
  let last = 0;
  let m: RegExpExecArray | null;
  while ((m = re.exec(line)) !== null) {
    if (m.index > last) parts.push({ type: "text", text: line.slice(last, m.index) });
    parts.push({ type: "text", text: m[1], marks: [{ type: "strong" }] });
    last = m.index + m[0].length;
  }
  if (last < line.length) parts.push({ type: "text", text: line.slice(last) });
  return parts.length ? parts : [{ type: "text", text: line }];
}

function mdToAdf(body: string): ADFNode {
  const lines = body.split("\n");
  const content: ADFNode[] = [];
  let i = 0;

  const flushPara = (buf: string[]) => {
    if (!buf.length) return;
    const text = buf.join(" ").trim();
    if (!text) { buf.length = 0; return; }
    content.push({ type: "paragraph", content: textWithBoldRuns(text) });
    buf.length = 0;
  };

  const flushList = (items: string[]) => {
    if (!items.length) return;
    content.push({
      type: "bulletList",
      content: items.map(it => ({
        type: "listItem",
        content: [{ type: "paragraph", content: textWithBoldRuns(it) }],
      })),
    });
    items.length = 0;
  };

  let paraBuf: string[] = [];
  let listBuf: string[] = [];

  while (i < lines.length) {
    const line = lines[i];
    const trimmed = line.trim();

    // Fenced code block
    if (trimmed.startsWith("```")) {
      flushPara(paraBuf); flushList(listBuf);
      const lang = trimmed.slice(3).trim() || "text";
      const code: string[] = [];
      i++;
      while (i < lines.length && !lines[i].trim().startsWith("```")) {
        code.push(lines[i]); i++;
      }
      i++; // consume closing fence
      content.push({
        type: "codeBlock",
        attrs: { language: lang },
        content: [{ type: "text", text: code.join("\n") }],
      });
      continue;
    }

    // Heading
    const head = trimmed.match(/^(#{1,6})\s+(.+)$/);
    if (head) {
      flushPara(paraBuf); flushList(listBuf);
      content.push({
        type: "heading",
        attrs: { level: Math.min(head[1].length, 6) },
        content: textWithBoldRuns(head[2]),
      });
      i++; continue;
    }

    // Bullet
    const bullet = line.match(/^\s*[-*]\s+(.+)$/);
    if (bullet) {
      flushPara(paraBuf);
      listBuf.push(bullet[1]);
      i++; continue;
    }

    // Blank line — flush
    if (trimmed === "") {
      flushPara(paraBuf); flushList(listBuf);
      i++; continue;
    }

    // Regular paragraph line
    flushList(listBuf);
    paraBuf.push(trimmed);
    i++;
  }
  flushPara(paraBuf); flushList(listBuf);

  if (!content.length) content.push({ type: "paragraph", content: [{ type: "text", text: "(no body)" }] });

  return { type: "doc", version: 1, content };
}

// ─── Severity → priority ──────────────────────────────────────────────────────
function priorityFromBody(body: string): string {
  const m = body.match(/\*\*Severity:\*\*\s*([^\n]+)/i);
  if (!m) return "Medium";
  const sev = m[1].toLowerCase();
  if (sev.includes("critical")) return "Highest";
  if (sev.includes("high")) return "High";
  if (sev.includes("medium")) return "Medium";
  if (sev.includes("low")) return "Low";
  return "Medium";
}

// ─── Update ───────────────────────────────────────────────────────────────────
async function updateIssue(key: string, bug: Bug): Promise<void> {
  const priority = priorityFromBody(bug.body);
  const payload = {
    fields: {
      description: mdToAdf(bug.body),
      components: [{ id: COMPONENT_ID_NEW_ARCH }],
      priority: { name: priority },
    },
  };
  const res = await fetch(`https://${SITE}/rest/api/3/issue/${key}`, {
    method: "PUT",
    headers: { Authorization: auth, "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    const t = await res.text();
    throw new Error(`${res.status} ${t.slice(0, 300)}`);
  }
}

async function main() {
  const bugs = parseBugs().filter(b => mapping[b.id]);
  console.log(`Updating ${bugs.length} tickets…`);
  let ok = 0, fail = 0;
  for (const bug of bugs) {
    const key = mapping[bug.id];
    try {
      await updateIssue(key, bug);
      const p = priorityFromBody(bug.body);
      console.log(`  ${bug.id} → ${key}  OK  (priority=${p})`);
      ok++;
    } catch (e: any) {
      console.log(`  ${bug.id} → ${key}  FAILED: ${e.message?.slice(0, 200)}`);
      fail++;
    }
    await new Promise(r => setTimeout(r, 250));
  }
  console.log(`\nupdated=${ok}  failed=${fail}`);
}

main().catch(e => { console.error(e); process.exit(1); });
