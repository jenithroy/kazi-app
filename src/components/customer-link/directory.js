/**
 * The directory a customer's name is looked up in: every customer's id and name, read once (CustomerProvider does the reading).
 *
 * A name on a document is only ever typed text, so it is turned into a customer only when that is certain: the name must belong to
 * exactly one customer. Two customers with the same name (the owner knows there are duplicates and will clean them up later), or
 * none, or no name at all, give nobody, and the name stays plain text instead of opening the wrong customer.
 *
 * "The same name" is `sameName` in utils/billingClients.js (case and stray spacing are ignored); `nameKey` is that rule written
 * as a key, so a name is found in one step instead of by comparing it with every customer. It is kept here, with no imports, so
 * the provider (which is in the app's first download) does not pull the data layer in through billingClients.js for it.
 */

/** The key two names share exactly when `sameName(a, b)` is true. */
export const nameKey = (name) => String(name || "").trim().replace(/\s+/g, " ").toLowerCase();

/** What the directory is before anything has been read. */
export const IDLE = Object.freeze({ status: "idle", ids: new Set(), byName: new Map() });

/** `rows` are customers as `fetchAll("customers")` returns them. */
export function buildDirectory(rows) {
  const ids = new Set();
  const byName = new Map();           // key -> the customer's id, or null when two customers carry the name
  for (const r of Array.isArray(rows) ? rows : []) {
    if (!r || r.id === undefined || r.id === null || r.id === "") continue;
    const id = String(r.id);
    if (ids.has(id)) continue;
    ids.add(id);
    const key = nameKey(r.name);
    if (key) byName.set(key, byName.has(key) ? null : id);
  }
  return { ids, byName };
}

/** The one customer a name belongs to, or null (nobody has it, two customers share it, or it is empty). */
export function idByName(dir, name) {
  const key = nameKey(name);
  return key ? dir.byName.get(key) ?? null : null;
}
