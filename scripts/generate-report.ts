/**
 * Standalone HTML bug report generator.
 *
 * Usage: npx tsx scripts/generate-report.ts
 *
 * Reads vitest JSON output + bugs.md, produces a single self-contained HTML file.
 * No server needed — just open the .html in a browser.
 */
import { readFileSync, writeFileSync, existsSync } from "fs";
import { resolve } from "path";

const ROOT = resolve(__dirname, "..");
const REPORT_PATH = resolve(ROOT, "reports");

// Ensure reports dir
import { mkdirSync } from "fs";
mkdirSync(REPORT_PATH, { recursive: true });

// Read bugs.md
const bugsPath = resolve(ROOT, "bugs.md");
const bugsMd = existsSync(bugsPath) ? readFileSync(bugsPath, "utf-8") : "No bugs.md found";

// Parse bugs into structured data
interface Bug {
  id: string;
  title: string;
  severity: string;
  endpoint: string;
  curl: string;
  notes: string;
}

function parseBugs(md: string): Bug[] {
  const bugs: Bug[] = [];
  const sections = md.split(/^## /gm).filter(Boolean);
  for (const sec of sections) {
    const lines = sec.trim().split("\n");
    const titleLine = lines[0] || "";
    const idMatch = titleLine.match(/BUG-(\d+)/);
    if (!idMatch) continue;
    if (titleLine.includes("RESOLVED")) continue;

    const id = `BUG-${idMatch[1]}`;
    const title = titleLine.replace(/^~~|~~$/g, "").replace(/BUG-\d+:\s*/, "").trim();
    const sevMatch = sec.match(/\*\*Severity:\*\*\s*(.+)/);
    const severity = sevMatch ? sevMatch[1].trim() : "Unknown";
    const endpointMatch = sec.match(/\*\*Endpoint:\*\*\s*`([^`]+)`/);
    const endpoint = endpointMatch ? endpointMatch[1] : "";

    // Extract curl blocks
    const curlMatch = sec.match(/```bash\n([\s\S]*?)```/);
    const curl = curlMatch ? curlMatch[1].trim() : "";

    const notesMatch = sec.match(/\*\*Notes:\*\*([\s\S]*?)(?=\n---|$)/);
    const notes = notesMatch ? notesMatch[1].trim() : "";

    bugs.push({ id, title, severity, endpoint, curl, notes });
  }
  return bugs;
}

// Read vitest JSON results if available
let testResults: any = null;
const jsonPath = resolve(ROOT, "test-results.json");
if (existsSync(jsonPath)) {
  testResults = JSON.parse(readFileSync(jsonPath, "utf-8"));
}

const bugs = parseBugs(bugsMd);
const now = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);

// Generate HTML
const html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>CDP Test Report — ${now}</title>
<style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background: #f5f5f5; color: #333; padding: 20px; }
  .container { max-width: 1200px; margin: 0 auto; }
  h1 { font-size: 24px; margin-bottom: 8px; }
  .meta { color: #666; margin-bottom: 24px; font-size: 14px; }
  .summary { display: flex; gap: 16px; margin-bottom: 24px; flex-wrap: wrap; }
  .card { background: white; border-radius: 8px; padding: 16px 24px; box-shadow: 0 1px 3px rgba(0,0,0,0.1); }
  .card h3 { font-size: 14px; color: #666; margin-bottom: 4px; }
  .card .num { font-size: 32px; font-weight: 700; }
  .card .num.pass { color: #22c55e; }
  .card .num.fail { color: #ef4444; }
  .card .num.bug { color: #f59e0b; }
  .severity-high { background: #fef2f2; border-left: 4px solid #ef4444; }
  .severity-medium { background: #fffbeb; border-left: 4px solid #f59e0b; }
  .severity-low { background: #f0fdf4; border-left: 4px solid #22c55e; }
  .bug-card { background: white; border-radius: 8px; padding: 16px; margin-bottom: 12px; box-shadow: 0 1px 3px rgba(0,0,0,0.1); }
  .bug-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px; }
  .bug-id { font-weight: 700; font-size: 14px; color: #ef4444; }
  .bug-sev { font-size: 12px; padding: 2px 8px; border-radius: 4px; font-weight: 600; }
  .bug-sev.high { background: #fef2f2; color: #dc2626; }
  .bug-sev.medium { background: #fffbeb; color: #d97706; }
  .bug-sev.low { background: #f0fdf4; color: #16a34a; }
  .bug-title { font-size: 16px; font-weight: 600; margin-bottom: 4px; }
  .bug-endpoint { font-size: 13px; color: #666; font-family: monospace; margin-bottom: 8px; }
  .bug-notes { font-size: 13px; color: #555; margin-bottom: 8px; }
  .curl-block { position: relative; background: #1e1e1e; color: #d4d4d4; border-radius: 6px; padding: 12px 16px; font-family: 'Fira Code', monospace; font-size: 12px; white-space: pre-wrap; word-break: break-all; overflow-x: auto; margin-top: 8px; }
  .curl-block .copy-btn { position: absolute; top: 8px; right: 8px; background: #444; color: #fff; border: none; padding: 4px 10px; border-radius: 4px; cursor: pointer; font-size: 11px; }
  .curl-block .copy-btn:hover { background: #666; }
  .curl-block .copy-btn.copied { background: #22c55e; }
  h2 { font-size: 20px; margin: 24px 0 12px; }
  .filter-bar { margin-bottom: 16px; display: flex; gap: 8px; }
  .filter-bar button { padding: 6px 14px; border-radius: 6px; border: 1px solid #ddd; background: white; cursor: pointer; font-size: 13px; }
  .filter-bar button.active { background: #333; color: white; border-color: #333; }
</style>
</head>
<body>
<div class="container">
  <h1>CDP Test & Bug Report</h1>
  <div class="meta">Generated: ${new Date().toLocaleString()} | Environment: cdpv2.ssd.uz</div>

  <div class="summary">
    <div class="card"><h3>Total Tests</h3><div class="num">${testResults ? testResults.numTotalTests : '—'}</div></div>
    <div class="card"><h3>Passing</h3><div class="num pass">${testResults ? testResults.numPassedTests : '—'}</div></div>
    <div class="card"><h3>Failing</h3><div class="num fail">${testResults ? testResults.numFailedTests : '—'}</div></div>
    <div class="card"><h3>Bugs Found</h3><div class="num bug">${bugs.length}</div></div>
  </div>

  <h2>Bugs (${bugs.length})</h2>
  <div class="filter-bar">
    <button class="active" onclick="filterBugs('all')">All</button>
    <button onclick="filterBugs('high')">High</button>
    <button onclick="filterBugs('medium')">Medium</button>
    <button onclick="filterBugs('low')">Low</button>
  </div>
  <div id="bugs-list">
${bugs.map(b => `
    <div class="bug-card" data-severity="${b.severity.toLowerCase().split(' ')[0]}">
      <div class="bug-header">
        <span class="bug-id">${b.id}</span>
        <span class="bug-sev ${b.severity.toLowerCase().split(' ')[0]}">${b.severity}</span>
      </div>
      <div class="bug-title">${escapeHtml(b.title)}</div>
      <div class="bug-endpoint">${escapeHtml(b.endpoint)}</div>
      ${b.notes ? `<div class="bug-notes">${escapeHtml(b.notes)}</div>` : ''}
      ${b.curl ? `<div class="curl-block"><button class="copy-btn" onclick="copyCurl(this)">Copy</button>${escapeHtml(b.curl)}</div>` : ''}
    </div>
`).join('')}
  </div>
</div>

<script>
function copyCurl(btn) {
  const block = btn.parentElement;
  const text = block.textContent.replace('Copy', '').replace('Copied!', '').trim();
  navigator.clipboard.writeText(text).then(() => {
    btn.textContent = 'Copied!';
    btn.classList.add('copied');
    setTimeout(() => { btn.textContent = 'Copy'; btn.classList.remove('copied'); }, 2000);
  });
}
function filterBugs(sev) {
  document.querySelectorAll('.filter-bar button').forEach(b => b.classList.remove('active'));
  event.target.classList.add('active');
  document.querySelectorAll('.bug-card').forEach(c => {
    c.style.display = (sev === 'all' || c.dataset.severity === sev) ? '' : 'none';
  });
}
</script>
</body>
</html>`;

function escapeHtml(s: string) {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

const outPath = resolve(REPORT_PATH, `cdp-report-${now}.html`);
writeFileSync(outPath, html, "utf-8");
console.log(`Report generated: ${outPath}`);
