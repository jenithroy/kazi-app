// Clients that exist only as a typed name on a Billing document.
//
// Billing's "Client / Company Name" is free text, so a client who has been invoiced,
// sent a challan or quoted is a name on those documents and nothing more: no row in
// Customers, and so nothing for an order's customer picker to list. This collects
// those names so the picker can offer them.
//
// Names are compared ignoring case and stray spacing, because the same client turns
// up as "RetailCorp UK", "Retailcorp uk" and "RetailCorp  UK". The spelling kept is
// the one on the newest document, and the phone and address are taken from the
// newest document that has them, ready to file the client under Customers.
//
// A name that already matches a customer is left out — pass every customer, not just
// the region on screen, or a client filed under the other region would be offered
// again as if new. Cancelled documents are ignored.

import { fetchAll, insertRow } from "../lib/db";

const tidy = (s) => String(s || "").trim().replace(/\s+/g, " ");

// Same client, allowing for case and stray spacing.
export const sameName = (a, b) => tidy(a).toLowerCase() === tidy(b).toLowerCase();

export function clientsFromDocuments(docs, customers) {
  const known = new Set(customers.map((c) => tidy(c.name).toLowerCase()));
  const byKey = new Map();

  const newestFirst = [...docs].sort((a, b) => (b.date || "").localeCompare(a.date || ""));
  for (const d of newestFirst) {
    if (/^cancel/i.test(d.status || "")) continue;
    const name = tidy(d.clientName);
    const key = name.toLowerCase();
    if (!key || known.has(key)) continue;

    const entry = byKey.get(key) || { key, name, phone: "", address: "" };
    if (!entry.phone) entry.phone = tidy(d.clientPhone);
    if (!entry.address) entry.address = tidy(d.clientAddress);
    byKey.set(key, entry);
  }

  return [...byKey.values()].sort((a, b) => a.name.localeCompare(b.name));
}

/**
 * The customer an invoice for this client belongs to, adding the client to Customers
 * when they are new. Returns the customer's id, or null when there is nothing safe
 * to link.
 *
 * Built to be run before an invoice is saved without ever being able to get in its
 * way. An invoice is a legal document and its client name is exactly what was typed
 * on it, so this only ever produces a customerId for the caller to store next to it:
 *
 *   - the name is compared ignoring case and spacing, so "junkiri" finds "Junkiri";
 *     an existing customer is linked as it is and is never renamed;
 *   - a name that matches more than one customer is left unlinked rather than
 *     guessed at, so it cannot make a duplicate worse;
 *   - a new customer is filed under the client's own name as written on the invoice;
 *   - any failure (no permission to add customers, no connection) returns null,
 *     never throws, and leaves the invoice to save as it always did.
 */
export async function customerIdForClient({ clientName, clientPhone, clientAddress, region }) {
  const name = tidy(clientName);
  if (!name) return null;
  try {
    const same = (await fetchAll("customers")).filter((c) => sameName(c.name, name));
    if (same.length === 1) return same[0].id;
    if (same.length > 1) return null;
    const created = await insertRow("customers", {
      name, contactPerson: "", email: "",
      phone: tidy(clientPhone),
      city: "", address: tidy(clientAddress), notes: "",
      region: region || null,
    });
    return created.id;
  } catch (err) {
    console.error("Could not link the invoice to a customer:", err);
    return null;
  }
}
