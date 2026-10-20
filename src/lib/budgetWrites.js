/**
 * Every write the Budget page makes. Each one checks that the database really did it: row-level security drops a
 * refused update without an error and hands the row back as it was, so a save that is not read back looks like success.
 *
 *   decide     approve or reject a request that is still waiting
 *   undo       put a decision back to waiting (only while the request is still as the decision left it)
 *   submit     ask for something
 *
 * A decision is one statement, "set it WHERE it is still waiting": two people deciding at the same moment cannot both win,
 * and the one who lost is told who got there first. (Reading first and writing after would leave a gap between the two.)
 */
import { fetchOne, insertRow, supabase } from "./db";
import { logWrite } from "./activity";
import { UNDO_PATCH, buildPayload, decidedDay, decisionPatch, fmtShort, formProblem, isWaiting } from "./budget";

const NOT_ALLOWED = "Not saved. You may not have permission to decide this.";
const NO_CONNECTION = "Not saved. Check your connection and try again.";
const GONE = "That request is no longer there.";

/** "Wilson approved this on 26 Jul." — said when somebody got there first. */
function alreadyDecided(row) {
  const when = decidedDay(row);
  return `${row.reviewedBy || "Someone"} already ${String(row.status).toLowerCase()} this${when ? ` on ${fmtShort(when)}` : ""}.`;
}

/**
 * Sets a decision's three fields on the request, but only while its status is still `from`. Returns the row as the database
 * now has it, or null when nothing was written: somebody else got there first, or the database refused (row-level security
 * does not say which, so the caller reads the row to find out). A write that went through is never reported as failed because
 * the read-back after it did: what was written is returned.
 */
async function writeIf(id, from, patch) {
  const { data, error } = await supabase
    .from("budget_requests")
    .update({ status: patch.status, reviewed_by: patch.reviewedBy, reviewed_at: patch.reviewedAt })
    .eq("id", id)
    .eq("status", from)
    .select("id");
  if (error) throw error;
  if (!data || data.length === 0) return null;
  logWrite("budget_requests", "update", id);
  let saved = null;
  try { saved = await fetchOne("budget_requests", id); } catch (err) { console.error("Written, but could not be read back:", err); }
  return saved || { id, ...patch };
}

/** Nothing was written: say why. `settled` is the row as it is now, for a page that wants to show it. */
async function whyNot(id, decidedAs) {
  const now = await fetchOne("budget_requests", id);
  if (!now) return { ok: false, gone: true, message: GONE };
  if (decidedAs == null) {
    // a decision: it is not waiting any more (somebody else decided it), or it is and the database said no
    return isWaiting(now) ? { ok: false, message: NOT_ALLOWED } : { ok: false, settled: now, message: alreadyDecided(now) };
  }
  // an undo: already waiting again is what was wanted; still as decided means the database said no; anything else is somebody else's doing
  if (isWaiting(now)) return { ok: true, row: now };
  if (now.status === decidedAs) return { ok: false, message: "Could not put it back. You may not have permission to decide this." };
  return { ok: false, settled: now, message: "Somebody has changed it since, so it was left as it is." };
}

/** Approve or reject. `settled` is the row as the database has it now when somebody got there first. */
export async function decide(row, status, reviewer) {
  try {
    const written = await writeIf(row.id, "Pending", decisionPatch(status, reviewer));
    if (written) return { ok: true, row: written };
    return await whyNot(row.id, null);
  } catch (err) {
    console.error("Failed to decide budget request:", err);
    return { ok: false, message: NO_CONNECTION };
  }
}

/** Take a decision back. Refused when the request is no longer as `status` left it (somebody else has since decided it again). */
export async function undo(row, status) {
  try {
    const written = await writeIf(row.id, status, UNDO_PATCH);
    if (written) return { ok: true, row: written };
    return await whyNot(row.id, status);
  } catch (err) {
    console.error("Failed to undo budget decision:", err);
    return { ok: false, message: NO_CONNECTION };
  }
}

/** Ask for something. `form` has been through `formProblem` already, but it is judged again: the write must not trust the caller. */
export async function submit(form, ctx) {
  const problem = formProblem(form);
  if (problem) return { ok: false, message: problem };
  try {
    const row = await insertRow("budget_requests", buildPayload(form, ctx));
    return { ok: true, row };
  } catch (err) {
    console.error("Failed to submit budget request:", err);
    // `insertRow` also reads the row back, and that read can fail after the insert went through: look in the list before sending it again
    return { ok: false, message: "Not sent, as far as the page can tell (you may not be allowed to ask from here, or the connection dropped). Look in the list before you try again." };
  }
}
