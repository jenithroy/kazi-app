/**
 * A table as a CSV file, for the accountant who keeps her own sheet: what is on screen, in the order it is on screen, with the
 * amounts as plain numbers so a spreadsheet can add them up.
 */

const quote = (v) => {
  const s = v == null ? "" : String(v);
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

/** `columns`: [{ label, value: (row) => … }]. The first line is the labels. */
export function toCsv(columns, rows) {
  const head = columns.map((c) => quote(c.label)).join(",");
  const body = rows.map((r) => columns.map((c) => quote(c.value(r))).join(","));
  return [head, ...body].join("\r\n");
}

/** Hand the text to the browser as a download. A byte-order mark first, so Excel reads it as UTF-8. */
export function downloadCsv(filename, text) {
  const blob = new Blob(["﻿", text], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}
