/**
 * QA Dashboard — Single HTML report aggregating ALL skill outputs.
 *
 * Usage: npx tsx scripts/generate-qa-dashboard.ts
 *
 * Reads: QA_COVERAGE.md, UX_AUDIT.md, QA_WRITE_LOG.md, QA_TRIAGE_REPORT.md,
 *        bugs.md, qa_coverage/*, ux_audit/*, page_crawl/index.md,
 *        qa_coverage/api-contracts.md, qa_coverage/business-rules.md,
 *        qa_coverage/docs-freshness.md
 *
 * Produces: reports/qa-dashboard-{timestamp}.html — self-contained, no server needed.
 */
import { readFileSync, writeFileSync, existsSync, mkdirSync, readdirSync } from "fs";
import { resolve, basename } from "path";

const ROOT = resolve(__dirname, "..");
const REPORT_PATH = resolve(ROOT, "reports");
mkdirSync(REPORT_PATH, { recursive: true });

// --- Helpers ---

function readIfExists(path: string): string {
  return existsSync(path) ? readFileSync(path, "utf-8") : "";
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

/** Simple markdown → HTML for embedding in the dashboard. Handles tables, headers, lists, bold, code, blockquotes. */
function renderMarkdown(md: string): string {
  if (!md) return '<p class="empty">File not found or empty.</p>';

  const lines = md.split("\n");
  const out: string[] = [];
  let inTable = false;
  let inList = false;
  let inCode = false;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    // Fenced code blocks
    if (line.trimStart().startsWith("```")) {
      if (inCode) {
        out.push("</code></pre>");
        inCode = false;
      } else {
        if (inList) { out.push("</ul>"); inList = false; }
        if (inTable) { out.push("</table>"); inTable = false; }
        out.push("<pre><code>");
        inCode = true;
      }
      continue;
    }
    if (inCode) {
      out.push(escapeHtml(line));
      continue;
    }

    const trimmed = line.trim();

    // Empty line — close open blocks
    if (trimmed === "") {
      if (inList) { out.push("</ul>"); inList = false; }
      if (inTable) { out.push("</table>"); inTable = false; }
      continue;
    }

    // Table separator row (|---|---|)
    if (/^\|[\s\-:|]+\|$/.test(trimmed)) continue;

    // Table row
    if (trimmed.startsWith("|") && trimmed.endsWith("|")) {
      const cells = trimmed.split("|").map(c => c.trim()).filter(Boolean);
      if (!inTable) {
        out.push('<table>');
        out.push("<tr>" + cells.map(c => `<th>${inlineFormat(c)}</th>`).join("") + "</tr>");
        inTable = true;
      } else {
        out.push("<tr>" + cells.map(c => `<td>${inlineFormat(c)}</td>`).join("") + "</tr>");
      }
      continue;
    }

    // Close table if we hit a non-table line
    if (inTable) { out.push("</table>"); inTable = false; }

    // Headers
    const hMatch = trimmed.match(/^(#{1,6})\s+(.+)/);
    if (hMatch) {
      if (inList) { out.push("</ul>"); inList = false; }
      const level = hMatch[1].length;
      out.push(`<h${level + 1}>${inlineFormat(hMatch[2])}</h${level + 1}>`);
      continue;
    }

    // Blockquote
    if (trimmed.startsWith("> ")) {
      out.push(`<blockquote>${inlineFormat(trimmed.slice(2))}</blockquote>`);
      continue;
    }

    // Unordered list
    if (/^[-*]\s+/.test(trimmed)) {
      if (!inList) { out.push("<ul>"); inList = true; }
      out.push(`<li>${inlineFormat(trimmed.replace(/^[-*]\s+/, ""))}</li>`);
      continue;
    }

    // Ordered list
    if (/^\d+\.\s+/.test(trimmed)) {
      if (!inList) { out.push("<ul>"); inList = true; }
      out.push(`<li>${inlineFormat(trimmed.replace(/^\d+\.\s+/, ""))}</li>`);
      continue;
    }

    // Close list if non-list line
    if (inList) { out.push("</ul>"); inList = false; }

    // Paragraph
    out.push(`<p>${inlineFormat(trimmed)}</p>`);
  }

  if (inList) out.push("</ul>");
  if (inTable) out.push("</table>");
  if (inCode) out.push("</code></pre>");

  return out.join("\n");
}

/** Inline formatting: bold, italic, code, links */
function inlineFormat(s: string): string {
  let r = escapeHtml(s);
  r = r.replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>");
  r = r.replace(/\*(.+?)\*/g, "<em>$1</em>");
  r = r.replace(/`([^`]+)`/g, '<code class="inline">$1</code>');
  r = r.replace(/~~(.+?)~~/g, "<del>$1</del>");
  return r;
}

function parseMarkdownTable(md: string, headerPattern: string): Record<string, string>[] {
  const lines = md.split("\n");
  let headerIdx = -1;
  for (let i = 0; i < lines.length; i++) {
    if (lines[i].includes(headerPattern)) { headerIdx = i; break; }
  }
  if (headerIdx === -1) return [];

  const headers = lines[headerIdx].split("|").map(h => h.trim()).filter(Boolean);
  const rows: Record<string, string>[] = [];

  for (let i = headerIdx + 2; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line.startsWith("|")) break;
    const cells = line.split("|").map(c => c.trim()).filter(Boolean);
    if (cells.length === 0) break;
    const row: Record<string, string> = {};
    headers.forEach((h, idx) => { row[h] = cells[idx] || ""; });
    rows.push(row);
  }
  return rows;
}

function countInContent(content: string, pattern: RegExp): number {
  const matches = content.match(pattern);
  return matches ? matches.length : 0;
}

// --- Read all data sources ---

const qaCoverage = readIfExists(resolve(ROOT, "reports/QA_COVERAGE.md"));
const uxAudit = readIfExists(resolve(ROOT, "reports/UX_AUDIT.md"));
const writeLog = readIfExists(resolve(ROOT, "reports/QA_WRITE_LOG.md"));
const triageReport = readIfExists(resolve(ROOT, "reports/QA_TRIAGE_REPORT.md"));
const bugsMd = readIfExists(resolve(ROOT, "bugs.md"));
const pageIndex = readIfExists(resolve(ROOT, "page_crawl/index.md"));
const apiContracts = readIfExists(resolve(ROOT, "qa_coverage/api-contracts.md"));
const businessRules = readIfExists(resolve(ROOT, "qa_coverage/business-rules.md"));
const docsFreshness = readIfExists(resolve(ROOT, "qa_coverage/docs-freshness.md"));

// --- Collect all embeddable files ---

interface EmbeddedFile {
  name: string;
  path: string;
  content: string;
  category: "index" | "per-page" | "analysis";
}

const embeddedFiles: EmbeddedFile[] = [];

// Index files
const indexFiles: [string, string, string][] = [
  ["QA_COVERAGE.md", resolve(ROOT, "reports/QA_COVERAGE.md"), "index"],
  ["UX_AUDIT.md", resolve(ROOT, "reports/UX_AUDIT.md"), "index"],
  ["QA_WRITE_LOG.md", resolve(ROOT, "reports/QA_WRITE_LOG.md"), "index"],
  ["QA_TRIAGE_REPORT.md", resolve(ROOT, "reports/QA_TRIAGE_REPORT.md"), "index"],
  ["bugs.md", resolve(ROOT, "bugs.md"), "index"],
  ["page_crawl/index.md", resolve(ROOT, "page_crawl/index.md"), "index"],
];
for (const [name, path, cat] of indexFiles) {
  const content = readIfExists(path);
  if (content) embeddedFiles.push({ name, path, content, category: cat as EmbeddedFile["category"] });
}

// Analysis files
const analysisFiles: [string, string][] = [
  ["qa_coverage/api-contracts.md", resolve(ROOT, "qa_coverage/api-contracts.md")],
  ["qa_coverage/business-rules.md", resolve(ROOT, "qa_coverage/business-rules.md")],
  ["qa_coverage/docs-freshness.md", resolve(ROOT, "qa_coverage/docs-freshness.md")],
];
for (const [name, path] of analysisFiles) {
  const content = readIfExists(path);
  if (content) embeddedFiles.push({ name, path, content, category: "analysis" });
}

// Per-page files (qa_coverage, ux_audit, page_crawl)
for (const dir of ["qa_coverage", "ux_audit", "page_crawl"]) {
  const dirPath = resolve(ROOT, dir);
  if (existsSync(dirPath)) {
    try {
      const files = readdirSync(dirPath).filter(f => f.endsWith(".md") && f !== "index.md");
      for (const f of files) {
        const fPath = resolve(dirPath, f);
        const content = readIfExists(fPath);
        if (content) embeddedFiles.push({ name: `${dir}/${f}`, path: fPath, content, category: "per-page" });
      }
    } catch { /* dir doesn't exist or can't be read */ }
  }
}

// --- Parse key metrics ---

// Bugs
const bugCount = countInContent(bugsMd, /^## BUG-\d+/gm);
const highBugs = countInContent(bugsMd, /\*\*Severity:\*\*\s*High/gi);
const medBugs = countInContent(bugsMd, /\*\*Severity:\*\*\s*Medium/gi);
const lowBugs = countInContent(bugsMd, /\*\*Severity:\*\*\s*Low/gi);

// Page crawl
const pageRoutes = parseMarkdownTable(pageIndex, "Route");
const crawledPages = pageRoutes.filter(r => r["Status"]?.includes("Done")).length;
const totalPages = pageRoutes.length;

// QA Coverage
const coverageRoutes = parseMarkdownTable(qaCoverage, "Route");

// UX Audit
const uxRoutes = parseMarkdownTable(uxAudit, "Route");
const totalP1 = uxRoutes.reduce((sum, r) => sum + (parseInt(r["P1"]) || 0), 0);
const totalP2 = uxRoutes.reduce((sum, r) => sum + (parseInt(r["P2"]) || 0), 0);
const totalP3 = uxRoutes.reduce((sum, r) => sum + (parseInt(r["P3"]) || 0), 0);

// Write log — latest run
const runBlocks = writeLog.split(/### Run \d+/).filter(Boolean);
const latestRun = runBlocks[runBlocks.length - 1] || "";

// Triage
const regressionCount = countInContent(triageReport, /^\| R\.\d+/gm);
const fixedCount = countInContent(triageReport, /^\| F\.\d+/gm);

// API contracts
const apiDrift = countInContent(apiContracts, /No — /gi);
const undocumented = countInContent(apiContracts, /undocumented/gi);

// Business rules
const brUntested = countInContent(businessRules, /\| No \|/gi);
const brPartial = countInContent(businessRules, /\| Partial \|/gi);
const brTested = countInContent(businessRules, /\| Yes \|/gi);
const brTotal = brTested + brPartial + brUntested;

// Docs freshness
const staleDocs = countInContent(docsFreshness, /^\| D\.\d+/gm);

// --- Build action items ---

interface ActionItem {
  priority: "critical" | "high" | "medium" | "low";
  category: string;
  action: string;
  detail: string;
}

const actions: ActionItem[] = [];

if (regressionCount > 0) {
  actions.push({ priority: "critical", category: "Regression", action: `Fix ${regressionCount} regression(s)`, detail: "Tests that were passing now fail. See QA_TRIAGE_REPORT.md." });
}
if (highBugs > 0) {
  actions.push({ priority: "critical", category: "Bugs", action: `Fix ${highBugs} high-severity bug(s)`, detail: "See bugs.md for reproduction steps." });
}
if (totalP1 > 0) {
  actions.push({ priority: "high", category: "UX", action: `Address ${totalP1} P1 UX finding(s)`, detail: "Usability blockers or WCAG violations. See UX_AUDIT.md." });
}
if (apiDrift > 0) {
  actions.push({ priority: "high", category: "API", action: `Fix ${apiDrift} API contract mismatch(es)`, detail: "Documented behavior doesn't match actual. See qa_coverage/api-contracts.md." });
}
if (brUntested > 0) {
  actions.push({ priority: "high", category: "Rules", action: `Write tests for ${brUntested} untested business rule(s)`, detail: "Run /qa-write --rules. See qa_coverage/business-rules.md." });
}
if (staleDocs > 0) {
  actions.push({ priority: "medium", category: "Docs", action: `Update ${staleDocs} stale doc claim(s)`, detail: "Documentation doesn't match current state. See qa_coverage/docs-freshness.md." });
}
if (undocumented > 0) {
  actions.push({ priority: "medium", category: "API", action: `Document ${undocumented} undocumented endpoint(s)`, detail: "API called by app but not in docs." });
}
if (medBugs > 0) {
  actions.push({ priority: "medium", category: "Bugs", action: `Triage ${medBugs} medium-severity bug(s)`, detail: "See bugs.md." });
}
if (totalP2 > 0) {
  actions.push({ priority: "medium", category: "UX", action: `Review ${totalP2} P2 UX finding(s)`, detail: "Friction and confusion issues. See UX_AUDIT.md." });
}
if (totalPages - crawledPages > 0) {
  actions.push({ priority: "low", category: "Coverage", action: `Crawl ${totalPages - crawledPages} remaining page(s)`, detail: "Run /bombardo to continue." });
}

actions.sort((a, b) => {
  const order = { critical: 0, high: 1, medium: 2, low: 3 };
  return order[a.priority] - order[b.priority];
});

// --- Generate HTML ---

const now = new Date();
const timestamp = now.toISOString().replace(/[:.]/g, "-").slice(0, 19);

const priorityColors: Record<string, { bg: string; text: string; border: string }> = {
  critical: { bg: "#fef2f2", text: "#991b1b", border: "#ef4444" },
  high: { bg: "#fff7ed", text: "#9a3412", border: "#f97316" },
  medium: { bg: "#fffbeb", text: "#92400e", border: "#f59e0b" },
  low: { bg: "#f0fdf4", text: "#166534", border: "#22c55e" },
};

// --- Build document browser HTML (outside template literal to avoid nesting issues) ---

function buildDocBrowser(): string {
  if (embeddedFiles.length === 0) {
    return '<h2>Documents <span class="badge">0 files</span></h2><div class="empty">No skill outputs found yet. Run /bombardo or /qa-crawl to generate data.</div>';
  }

  // Group files
  const groups: Record<string, EmbeddedFile[]> = { index: [], analysis: [], "per-page": [] };
  embeddedFiles.forEach(f => { if (groups[f.category]) groups[f.category].push(f); });

  const perPageByDir: Record<string, EmbeddedFile[]> = {};
  groups["per-page"].forEach(f => {
    const dir = f.name.split("/")[0];
    if (!perPageByDir[dir]) perPageByDir[dir] = [];
    perPageByDir[dir].push(f);
  });

  // Build sidebar
  let sidebar = "";

  if (groups.index.length > 0) {
    sidebar += '<div class="doc-group"><div class="doc-group-title">Index Files</div>';
    groups.index.forEach((f, i) => {
      const idx = embeddedFiles.indexOf(f);
      const cls = i === 0 ? ' active' : '';
      sidebar += '<a class="doc-link' + cls + '" onclick="showDoc(' + idx + ')" title="' + escapeHtml(f.name) + '"><span class="file-icon">&#128196;</span>' + escapeHtml(f.name) + '</a>';
    });
    sidebar += "</div>";
  }

  if (groups.analysis.length > 0) {
    sidebar += '<div class="doc-group"><div class="doc-group-title">Analysis</div>';
    groups.analysis.forEach(f => {
      const idx = embeddedFiles.indexOf(f);
      const label = f.name.split("/").pop() || f.name;
      sidebar += '<a class="doc-link" onclick="showDoc(' + idx + ')" title="' + escapeHtml(f.name) + '"><span class="file-icon">&#128202;</span>' + escapeHtml(label) + '</a>';
    });
    sidebar += "</div>";
  }

  for (const [dir, files] of Object.entries(perPageByDir)) {
    sidebar += '<div class="doc-group"><div class="doc-group-title">' + escapeHtml(dir) + ' (' + files.length + ')</div>';
    files.forEach(f => {
      const idx = embeddedFiles.indexOf(f);
      const label = f.name.split("/").pop() || f.name;
      sidebar += '<a class="doc-link" onclick="showDoc(' + idx + ')" title="' + escapeHtml(f.name) + '"><span class="file-icon">&#128196;</span>' + escapeHtml(label) + '</a>';
    });
    sidebar += "</div>";
  }

  // Build templates (hidden, for JS to swap)
  let templates = "";
  embeddedFiles.forEach((f, i) => {
    templates += '<template id="doc-tpl-' + i + '">' + renderMarkdown(f.content) + '</template>\n';
  });

  const firstTitle = escapeHtml(embeddedFiles[0].name);
  const firstContent = renderMarkdown(embeddedFiles[0].content);

  return '<h2>Documents <span class="badge">' + embeddedFiles.length + ' files</span></h2>\n' +
    '<div class="doc-browser">\n' +
    '  <div class="doc-sidebar">' + sidebar + '</div>\n' +
    '  <div class="doc-viewer" id="doc-viewer">\n' +
    '    <div class="doc-viewer-header" id="doc-header">\n' +
    '      <h3 id="doc-title">' + firstTitle + '</h3>\n' +
    '      <span class="doc-path" id="doc-path">' + firstTitle + '</span>\n' +
    '    </div>\n' +
    '    <div class="doc-viewer-body" id="doc-body">' + firstContent + '</div>\n' +
    '  </div>\n' +
    '</div>\n' +
    templates;
}

function buildDocScript(): string {
  if (embeddedFiles.length === 0) return "";
  const names = JSON.stringify(embeddedFiles.map(f => f.name));
  return 'var docNames = ' + names + ';\n' +
    'function showDoc(idx) {\n' +
    '  document.querySelectorAll(".doc-link").forEach(function(l) { l.classList.remove("active"); });\n' +
    '  event.currentTarget.classList.add("active");\n' +
    '  document.getElementById("doc-title").textContent = docNames[idx].split("/").pop() || docNames[idx];\n' +
    '  document.getElementById("doc-path").textContent = docNames[idx];\n' +
    '  var tpl = document.getElementById("doc-tpl-" + idx);\n' +
    '  if (tpl) { document.getElementById("doc-body").innerHTML = tpl.innerHTML; }\n' +
    '  document.getElementById("doc-body").scrollTop = 0;\n' +
    '}\n';
}

const html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>QA Dashboard — ${now.toLocaleDateString()}</title>
<style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background: #f8fafc; color: #1e293b; padding: 24px; }
  .container { max-width: 1200px; margin: 0 auto; }
  h1 { font-size: 28px; font-weight: 700; margin-bottom: 4px; }
  .meta { color: #64748b; margin-bottom: 24px; font-size: 14px; }

  /* Summary cards */
  .summary { display: grid; grid-template-columns: repeat(auto-fit, minmax(140px, 1fr)); gap: 12px; margin-bottom: 32px; }
  .card { background: white; border-radius: 10px; padding: 16px; box-shadow: 0 1px 3px rgba(0,0,0,0.08); text-align: center; }
  .card .label { font-size: 12px; color: #64748b; text-transform: uppercase; letter-spacing: 0.5px; margin-bottom: 4px; }
  .card .value { font-size: 28px; font-weight: 700; }
  .card .value.green { color: #16a34a; }
  .card .value.red { color: #dc2626; }
  .card .value.amber { color: #d97706; }
  .card .value.blue { color: #2563eb; }
  .card .sub { font-size: 11px; color: #94a3b8; margin-top: 2px; }

  /* Action items */
  h2 { font-size: 20px; font-weight: 600; margin: 28px 0 12px; display: flex; align-items: center; gap: 8px; }
  h2 .badge { font-size: 13px; background: #e2e8f0; color: #475569; padding: 2px 10px; border-radius: 12px; font-weight: 500; }
  .action-list { display: flex; flex-direction: column; gap: 8px; margin-bottom: 32px; }
  .action-item { background: white; border-radius: 8px; padding: 12px 16px; box-shadow: 0 1px 2px rgba(0,0,0,0.06); display: flex; align-items: flex-start; gap: 12px; border-left: 4px solid; }
  .action-priority { font-size: 11px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.5px; padding: 2px 8px; border-radius: 4px; white-space: nowrap; }
  .action-category { font-size: 11px; color: #64748b; background: #f1f5f9; padding: 2px 8px; border-radius: 4px; white-space: nowrap; }
  .action-text { font-size: 14px; font-weight: 600; }
  .action-detail { font-size: 13px; color: #64748b; margin-top: 2px; }
  .action-content { flex: 1; }

  /* Section tables */
  .section { background: white; border-radius: 10px; padding: 20px; margin-bottom: 20px; box-shadow: 0 1px 3px rgba(0,0,0,0.08); overflow-x: auto; }
  .section h3 { font-size: 16px; font-weight: 600; margin-bottom: 12px; }
  table { width: 100%; border-collapse: collapse; font-size: 13px; }
  th { text-align: left; padding: 8px 12px; border-bottom: 2px solid #e2e8f0; color: #64748b; font-weight: 600; font-size: 12px; text-transform: uppercase; letter-spacing: 0.5px; }
  td { padding: 8px 12px; border-bottom: 1px solid #f1f5f9; }
  tr:hover { background: #f8fafc; }
  .tag { display: inline-block; font-size: 11px; padding: 1px 8px; border-radius: 4px; font-weight: 600; }
  .tag-done { background: #dcfce7; color: #166534; }
  .tag-partial { background: #fef9c3; color: #854d0e; }
  .tag-missing { background: #fee2e2; color: #991b1b; }
  .tag-stale { background: #fef3c7; color: #92400e; }

  /* Empty state */
  .empty { color: #94a3b8; font-style: italic; padding: 12px 0; }

  /* Document browser — sidebar + full-width content */
  .doc-browser { display: grid; grid-template-columns: 260px 1fr; gap: 16px; margin-bottom: 32px; min-height: 400px; }
  .doc-sidebar { background: white; border-radius: 10px; box-shadow: 0 1px 3px rgba(0,0,0,0.08); overflow-y: auto; max-height: 80vh; position: sticky; top: 20px; }
  .doc-group { border-bottom: 1px solid #f1f5f9; }
  .doc-group-title { font-size: 11px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.5px; color: #64748b; padding: 12px 14px 4px; }
  .doc-link { display: block; padding: 6px 14px; font-size: 13px; color: #334155; cursor: pointer; text-decoration: none; border-left: 3px solid transparent; transition: all 0.1s; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .doc-link:hover { background: #f8fafc; color: #0f172a; }
  .doc-link.active { background: #eff6ff; border-left-color: #2563eb; color: #1d4ed8; font-weight: 600; }
  .doc-link .file-icon { margin-right: 6px; font-size: 11px; }
  .doc-viewer { background: white; border-radius: 10px; box-shadow: 0 1px 3px rgba(0,0,0,0.08); overflow: hidden; }
  .doc-viewer-header { padding: 12px 20px; border-bottom: 1px solid #e2e8f0; display: flex; justify-content: space-between; align-items: center; }
  .doc-viewer-header h3 { font-size: 14px; font-weight: 600; margin: 0; }
  .doc-viewer-header .doc-path { font-size: 12px; color: #94a3b8; font-family: monospace; }
  .doc-viewer-body { padding: 20px; font-size: 13px; line-height: 1.7; overflow-y: auto; max-height: 75vh; }
  .doc-viewer-body h2 { font-size: 18px; margin: 20px 0 10px; padding-bottom: 6px; border-bottom: 1px solid #f1f5f9; }
  .doc-viewer-body h3 { font-size: 15px; margin: 16px 0 8px; }
  .doc-viewer-body h4 { font-size: 13px; margin: 12px 0 6px; }
  .doc-viewer-body table { margin: 10px 0; }
  .doc-viewer-body p { margin: 8px 0; }
  .doc-viewer-body ul { padding-left: 20px; margin: 8px 0; }
  .doc-viewer-body li { margin: 4px 0; }
  .doc-viewer-body pre { background: #1e293b; color: #e2e8f0; border-radius: 6px; padding: 14px; margin: 10px 0; overflow-x: auto; font-size: 12px; }
  .doc-viewer-body code.inline { background: #f1f5f9; color: #0f172a; padding: 1px 5px; border-radius: 3px; font-size: 12px; }
  .doc-viewer-body blockquote { border-left: 3px solid #e2e8f0; padding-left: 12px; color: #64748b; margin: 10px 0; }
  .doc-viewer-body strong { font-weight: 600; }
  .doc-viewer-body del { color: #94a3b8; }
  .doc-placeholder { display: flex; align-items: center; justify-content: center; height: 300px; color: #94a3b8; font-size: 14px; }
  @media (max-width: 768px) {
    .doc-browser { grid-template-columns: 1fr; }
    .doc-sidebar { max-height: 200px; position: static; }
  }

  /* Footer */
  .footer { text-align: center; color: #94a3b8; font-size: 12px; margin-top: 40px; padding-top: 20px; border-top: 1px solid #e2e8f0; }
</style>
</head>
<body>
<div class="container">
  <h1>QA Dashboard</h1>
  <div class="meta">Generated ${now.toLocaleString()} &nbsp;|&nbsp; Skills: /bombardo /qa-crawl /qa-write /qa-triage /ux-audit</div>

  <!-- Summary Cards -->
  <div class="summary">
    <div class="card">
      <div class="label">Pages Crawled</div>
      <div class="value blue">${crawledPages}/${totalPages}</div>
    </div>
    <div class="card">
      <div class="label">Bugs</div>
      <div class="value ${bugCount > 0 ? 'red' : 'green'}">${bugCount}</div>
      <div class="sub">${highBugs}H ${medBugs}M ${lowBugs}L</div>
    </div>
    <div class="card">
      <div class="label">UX Issues</div>
      <div class="value ${totalP1 > 0 ? 'red' : 'amber'}">${totalP1 + totalP2 + totalP3}</div>
      <div class="sub">${totalP1}P1 ${totalP2}P2 ${totalP3}P3</div>
    </div>
    <div class="card">
      <div class="label">Regressions</div>
      <div class="value ${regressionCount > 0 ? 'red' : 'green'}">${regressionCount}</div>
    </div>
    <div class="card">
      <div class="label">API Drift</div>
      <div class="value ${apiDrift > 0 ? 'amber' : 'green'}">${apiDrift}</div>
    </div>
    <div class="card">
      <div class="label">Business Rules</div>
      <div class="value ${brUntested > 0 ? 'amber' : 'green'}">${brTotal > 0 ? Math.round((brTested / brTotal) * 100) + '%' : '—'}</div>
      <div class="sub">${brTested}ok ${brPartial}part ${brUntested}gap</div>
    </div>
    <div class="card">
      <div class="label">Stale Docs</div>
      <div class="value ${staleDocs > 0 ? 'amber' : 'green'}">${staleDocs}</div>
    </div>
  </div>

  <!-- Action Items -->
  <h2>What To Do Next <span class="badge">${actions.length} items</span></h2>
  ${actions.length === 0 ? '<div class="empty">No action items — everything looks good.</div>' : ''}
  <div class="action-list">
    ${actions.map(a => {
      const c = priorityColors[a.priority];
      return `<div class="action-item" style="border-left-color: ${c.border}">
        <span class="action-priority" style="background: ${c.bg}; color: ${c.text}">${a.priority}</span>
        <span class="action-category">${a.category}</span>
        <div class="action-content">
          <div class="action-text">${escapeHtml(a.action)}</div>
          <div class="action-detail">${escapeHtml(a.detail)}</div>
        </div>
      </div>`;
    }).join("\n    ")}
  </div>

  <!-- Page Coverage Table -->
  ${coverageRoutes.length > 0 ? `
  <div class="section">
    <h3>Page Test Coverage</h3>
    <table>
      <tr>${Object.keys(coverageRoutes[0]).map(h => `<th>${escapeHtml(h)}</th>`).join("")}</tr>
      ${coverageRoutes.map(r => `<tr>${Object.values(r).map(v => `<td>${escapeHtml(v)}</td>`).join("")}</tr>`).join("\n      ")}
    </table>
  </div>` : ''}

  <!-- UX Audit Table -->
  ${uxRoutes.length > 0 ? `
  <div class="section">
    <h3>UX Audit Summary</h3>
    <table>
      <tr>${Object.keys(uxRoutes[0]).map(h => `<th>${escapeHtml(h)}</th>`).join("")}</tr>
      ${uxRoutes.map(r => `<tr>${Object.values(r).map(v => `<td>${escapeHtml(v)}</td>`).join("")}</tr>`).join("\n      ")}
    </table>
  </div>` : ''}

  <!-- Document Browser -->
  ${buildDocBrowser()}

  <div class="footer">
    Generated by <code>npm run report:dashboard</code> &nbsp;|&nbsp; Data from /bombardo /qa-crawl /qa-write /qa-triage /ux-audit
  </div>
</div>

<script>
${buildDocScript()}
</script>
</body>
</html>`;

const outPath = resolve(REPORT_PATH, `qa-dashboard-${timestamp}.html`);
writeFileSync(outPath, html, "utf-8");
console.log(`Dashboard generated: ${outPath}`);
