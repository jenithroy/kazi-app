/**
 * Every write the Customers page makes: save a customer, merge a duplicate into another, delete one.
 *
 * Each resolves to `{ ok, message?, reload? }` and touches nothing on screen (the page decides what to close and
 * when to look again; `reload` says the data it holds is out of date after a half-done or refused write). They are
 * the Sales page's three writes, which were checked by an independent review: the database's row-level security
 * drops a refused update without an error, so a write is never taken on trust. A save compares what came back with
 * what was sent; a merge checks each move, then reads what still points at the duplicate afresh (the page's copy
 * can be minutes old, and deleting a customer unlinks, never deletes, whatever the copy did not know about), then
 * checks the duplicate is really gone; a delete does the same fresh read and checks the customer is gone.
 */
import { deleteRow, fetchAll, fetchOne, insertRow, updateRow } from "./db";

/**
 * Did the database keep what was sent? Exactly (the typing is already trimmed), except an email, which the table compares without
 * regard to case: a refused edit that only changed a name's capitals must not read as saved.
 */
function kept(key, got, sent) {
  const a = String(got ?? "").trim();
  const b = String(sent ?? "").trim();
  return key === "email" ? a.toLowerCase() === b.toLowerCase() : a === b;
}

/** How many orders, invoices and payments still point at a customer, read fresh. */
async function linkedCount(customerId) {
  const [o, i, p] = await Promise.all([
    fetchAll("orders", { filters: [{ field: "customer_id", value: customerId }] }),
    fetchAll("invoices", { filters: [{ field: "customerId", value: customerId }] }),
    fetchAll("payments", { filters: [{ field: "customerId", value: customerId }] }),
  ]);
  return o.length + i.length + p.length;
}

/** Save a customer's details (`id` null: a new customer). */
export async function saveCustomerRow(payload, id) {
  try {
    if (id) {
      const saved = await updateRow("customers", id, payload);
      // a refused update comes back without an error, as the row it was
      const ok = saved && Object.keys(payload).every((k) => kept(k, saved[k], payload[k]));
      if (!ok) throw new Error("The database kept the old details.");
    } else {
      await insertRow("customers", payload);
    }
    return { ok: true };
  } catch (err) {
    console.error("Failed to save customer:", err);
    return { ok: false, message: "Not saved. You may not have permission to edit customers." };
  }
}

/**
 * Move every order, invoice and payment of `source` onto the customer `targetId`, then delete `source`. Done row by
 * row from the client because that is the only write path the app has; the foreign keys make the result consistent
 * either way. Each move is checked before anything is deleted, so a refused one cannot end with a customer gone and
 * their records left behind.
 */
export async function mergeCustomerRows(source, targetId) {
  try {
    const moved = await Promise.all([
      ...source.orders.map(async (o) => (await updateRow("orders", o.id, { customer_id: targetId }))?.customer_id === targetId),
      ...source.invoices.map(async (i) => (await updateRow("invoices", i.id, { customerId: targetId }))?.customerId === targetId),
      ...source.payments.map(async (p) => (await updateRow("payments", p.id, { customerId: targetId }))?.customerId === targetId),
    ]);
    if (moved.some((ok) => !ok)) throw new Error("The database refused to move some records.");
    if ((await linkedCount(source.id)) > 0) {
      return { ok: false, reload: true, message: `Something new was added to ${source.name} while you were merging, so they were not deleted. Merge again to move it too.` };
    }
    await deleteRow("customers", source.id);
    if (await fetchOne("customers", source.id)) {
      return { ok: false, reload: true, message: `Everything was moved, but ${source.name} could not be deleted. You may not have permission to edit customers.` };
    }
    return { ok: true, reload: true };
  } catch (err) {
    console.error("Merge failed:", err);
    return { ok: false, reload: true, message: "Merge failed partway. Check the customer before trying again." };
  }
}

/** Delete a customer (their orders, invoices and payments stay, unlinked). `c` is the page's row for them. */
export async function deleteCustomerRow(c) {
  try {
    if ((await linkedCount(c.id)) > c.orders.length + c.invoices.length + c.payments.length) {
      return { ok: false, reload: true, message: `Something new was linked to ${c.name} since you opened them, so nothing was deleted. Have another look.` };
    }
    await deleteRow("customers", c.id);
    if (await fetchOne("customers", c.id)) throw new Error("The database kept the customer.");
  } catch (err) {
    console.error("Failed to delete customer:", err);
    return { ok: false, message: "Could not delete. You may not have permission to edit customers." };
  }
  return { ok: true, reload: true };
}
