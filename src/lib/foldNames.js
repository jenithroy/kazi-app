/**
 * Names that people typed ("UK sample", "Uk Sample", "uk sample") are one entry in a Filters list: they are grouped without caring about
 * capitals or extra spaces, and written the way most of the rows spell them. `keyOf` is what a filter compares, `nameOf` what it shows.
 *
 *   const customers = foldNames(orders, (o) => o.customerName);
 *   { id: "customer", kind: "select", of: (o) => customers.keyOf(o.customerName), nameOf: customers.nameOf, … }
 */
const clean = (v) => String(v ?? "").trim().replace(/\s+/g, " ");

export default function foldNames(rows, get) {
  const spellings = new Map();                                 // folded name -> Map(spelling -> how many)
  for (const r of rows) {
    const raw = clean(get(r));
    if (!raw) continue;
    const key = raw.toLowerCase();
    if (!spellings.has(key)) spellings.set(key, new Map());
    const m = spellings.get(key);
    m.set(raw, (m.get(raw) || 0) + 1);
  }
  const shown = new Map([...spellings].map(([key, m]) => [key, [...m.entries()].sort((a, b) => b[1] - a[1])[0][0]]));
  return { keyOf: (v) => clean(v).toLowerCase(), nameOf: (key) => shown.get(key) || key };
}
