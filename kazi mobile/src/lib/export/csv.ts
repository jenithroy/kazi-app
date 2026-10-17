/**
 * Minimal CSV serialiser — no dependencies. Real file-write / share-sheet is
 * item 5 (Track B); until then screens copy the string to the clipboard.
 */

export interface CsvColumn<Row> {
  header: string;
  value: (row: Row) => string | number | null | undefined;
}

/** RFC-4180-ish quoting: wrap in double quotes when the cell holds a comma, quote, or newline. */
function cell(v: string | number | null | undefined): string {
  const s = v == null ? '' : String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export function toCSV<Row>(rows: Row[], columns: CsvColumn<Row>[]): string {
  const head = columns.map((c) => cell(c.header)).join(',');
  const body = rows.map((r) => columns.map((c) => cell(c.value(r))).join(','));
  return [head, ...body].join('\r\n');
}
