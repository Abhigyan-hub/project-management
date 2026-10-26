/** CSV + printable-PDF report generation, all derived from live data. */
import { formatDateTime } from "@/lib/workspace";

export type Column<T> = { header: string; value: (row: T) => string | number };

function csvCell(value: string | number) {
  const s = String(value ?? "");
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export function downloadCsv<T>(filename: string, columns: Column<T>[], rows: T[]) {
  const lines = [
    columns.map((c) => csvCell(c.header)).join(","),
    ...rows.map((r) => columns.map((c) => csvCell(c.value(r))).join(",")),
  ];
  const blob = new Blob(["\uFEFF" + lines.join("\n")], { type: "text/csv;charset=utf-8;" });
  triggerDownload(blob, `${filename}.csv`);
}

function triggerDownload(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

/** Opens a print-ready window; the browser's "Save as PDF" produces the PDF. */
export function downloadPdf<T>(title: string, columns: Column<T>[], rows: T[]) {
  const head = columns.map((c) => `<th>${escapeHtml(c.header)}</th>`).join("");
  const body = rows
    .map(
      (r) =>
        `<tr>${columns.map((c) => `<td>${escapeHtml(String(c.value(r)))}</td>`).join("")}</tr>`,
    )
    .join("");

  const html = `<!doctype html><html><head><meta charset="utf-8" /><title>${escapeHtml(title)}</title>
  <style>
    body{font-family:ui-sans-serif,system-ui,sans-serif;color:#111;padding:32px}
    h1{font-size:20px;margin:0 0 4px}
    p.meta{color:#666;font-size:12px;margin:0 0 20px}
    table{width:100%;border-collapse:collapse;font-size:11px}
    th,td{border:1px solid #ddd;padding:6px 8px;text-align:left}
    th{background:#f4f4f5;text-transform:uppercase;letter-spacing:.04em;font-size:10px}
    tr:nth-child(even) td{background:#fafafa}
  </style></head><body>
  <h1>${escapeHtml(title)}</h1>
  <p class="meta">Generated ${formatDateTime(new Date().toISOString())} · ${rows.length} records</p>
  <table><thead><tr>${head}</tr></thead><tbody>${body}</tbody></table>
  <script>window.onload=function(){window.print()}</script>
  </body></html>`;

  const win = window.open("", "_blank", "width=1024,height=768");
  if (!win) return false;
  win.document.write(html);
  win.document.close();
  return true;
}

function escapeHtml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
