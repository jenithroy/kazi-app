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

/**
 * The tech packs made for a customer (`patterns.customer_id`), read fresh. A position that may not read tech packs is answered an empty
 * list by row-level security, so it merges as it always did (the packs it cannot see are unlinked when the duplicate goes, as for a
 * delete). A database that does not have the column yet (migration 0063) has no linked packs either.
 */
async function packsOf(customerId) {
  try {
    return await fetchAll("patterns", { filters: [{ field: "customerId", value: customerId }], columns: "id" });     // (only the ids are moved)
  } catch (err) {
    if (err?.code === "42703") return [];          // undefined column
    throw err;
  }
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
 *
 * The tech packs made for the duplicate (`patterns.customer_id`) move too, read fresh (the page's copy has no tech packs in it) and
 * checked the same way. Only a position that may change tech packs can move them, and the database refuses the rest without an error,
 * so the first pack goes first and alone: a refusal stops the merge before anything else has been moved, and says so.
 */
export async function mergeCustomerRows(source, targetId) {
  let packs;
  try {
    packs = await packsOf(source.id);
  } catch (err) {
    console.error("Merge: could not read the tech packs:", err);
    return { ok: false, message: "Could not check which tech packs they have, so nothing was merged. Try again." };
  }
  try {
    const movePack = async (p) => (await updateRow("patterns", p.id, { customerId: targetId }))?.customerId === targetId;
    if (packs.length && !(await movePack(packs[0]))) {
      return { ok: false, message: `${source.name} has ${packs.length} tech ${packs.length === 1 ? "pack" : "packs"} and you may not move ${packs.length === 1 ? "it" : "them"}, so nothing was merged. Someone who can edit tech packs needs to move ${packs.length === 1 ? "it" : "them"} first.` };
    }
    const moved = await Promise.all([
      ...source.orders.map(async (o) => (await updateRow("orders", o.id, { customer_id: targetId }))?.customer_id === targetId),
      ...source.invoices.map(async (i) => (await updateRow("invoices", i.id, { customerId: targetId }))?.customerId === targetId),
      ...source.payments.map(async (p) => (await updateRow("payments", p.id, { customerId: targetId }))?.customerId === targetId),
      ...packs.slice(1).map(movePack),
    ]);
    if (moved.some((ok) => !ok)) throw new Error("The database refused to move some records.");
    if ((await linkedCount(source.id)) > 0 || (await packsOf(source.id)).length > 0) {
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

/**
 * Delete a customer (their orders, invoices and payments stay, unlinked). `c` is the page's row for them.
 * Their tech packs stay too, unlinked: `patterns.customer_id` is `on delete set null`, so the database does it and there is nothing to write.
 */
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
