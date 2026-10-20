/**
 * Every write the content calendar makes: add something, change it (a card's Save, a drag onto a day, "back to the inbox"),
 * delete it. Each one checks that the database really did it: row-level security drops a refused update or delete without an
 * error and hands the row back as it was, so a write that is not read back looks like success.
 *
 * Each resolves to `{ ok, row?, message?, gone?, reload? }` and touches nothing on screen. `gone` says the row is no longer there
 * (somebody else deleted it); `reload` says the page's copy may be out of date after a write that went wrong.
 *
 * Note for whoever reads the policies: the table's row-level security asks for the `content` section while the page is opened with
 * `marketing`. If a position has one and not the other, the page opens and every write here says "not saved", which is the right
 * thing for it to say.
 */
import { deleteRow, fetchOne, insertRow, updateRow } from "./db";

const COLLECTION = "content_calendar";
const DENIED = "Not saved. You may not have permission to change the calendar.";
const OFFLINE = "Not saved. Check your connection and try again.";
const GONE = "Somebody has deleted that, so it was not saved.";

const denied = (err) => err?.code === "42501" || /row-level security|permission denied/i.test(String(err?.message || ""));
const failure = (err) => ({ ok: false, message: denied(err) ? DENIED : OFFLINE });

const same = (a, b) => String(a ?? "") === String(b ?? "");
/** Did the database keep everything that was sent? */
const kept = (row, sent) => Object.keys(sent).every((k) => same(row[k], sent[k]));

/** Add one. `payload` is what `payloadOf` makes. */
export async function createItem(payload) {
  try {
    const row = await insertRow(COLLECTION, payload);
    return { ok: true, row };
  } catch (err) {
    console.error("Failed to add to the content calendar:", err);
    return failure(err);
  }
}

/** Change the fields in `patch` (all of a card's, or just where it sits). */
export async function updateItem(id, patch) {
  try {
    const saved = await updateRow(COLLECTION, id, patch);
    if (!saved) return { ok: false, gone: true, reload: true, message: GONE };
    // a refused update comes back without an error, as the row it was
    if (!kept(saved, patch)) return { ok: false, reload: true, message: DENIED };
    return { ok: true, row: saved };
  } catch (err) {
    console.error("Failed to change a content calendar entry:", err);
    return { ...failure(err), reload: true };
  }
}

/** Put it on a day. (A row that is not in the inbox yet is moved out of it by the same write.) */
export const scheduleItem = (id, date) => updateItem(id, { status: "scheduled", scheduledDate: date });

/** Take it off its day, back into the inbox. */
export const unscheduleItem = (id) => updateItem(id, { status: "inbox", scheduledDate: null });

/** Delete it for good. */
export async function removeItem(id) {
  try {
    await deleteRow(COLLECTION, id);
    if (await fetchOne(COLLECTION, id)) return { ok: false, reload: true, message: "Could not delete. You may not have permission to change the calendar." };
    return { ok: true, reload: true };
  } catch (err) {
    console.error("Failed to delete a content calendar entry:", err);
    return { ok: false, reload: true, message: denied(err) ? "Could not delete. You may not have permission to change the calendar." : "Could not delete. Check your connection and try again." };
  }
}
