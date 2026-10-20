/**
 * Every write the Employees page makes to a person. Each one checks that the database really did it: row-level security drops a
 * refused update or delete without an error and hands the row back as it was, so a write that is not read back looks like success.
 * (The link of a new person's sign-in to their record, in createEmployeeLogin, is the old page's and is not checked.)
 *
 *   savePerson     change a person: only the fields that were changed, then read back
 *   createPerson   add a person, then create their sign-in and email them a link to choose a password
 *   removePerson   delete a person, then check they are gone
 *
 * Why only the changed fields: the directory view hides phone, address, pay, bank and PAN from staff who may not see them
 * (it returns null), and the old form wrote every field back — so saving anything could have blanked what its editor could
 * not see. It also carried a stale `region` copy of the location that overwrote a changed location (both fields are the same
 * column), so a change of location never saved.
 */
import { deleteRow, fetchOne, insertRow, updateRow } from "./db";
import { authClient, authRedirectUrl, createSignupClient, supabase } from "../supabase";
import { PRIVATE_FIELDS, createPayload, formProblem, patchOf, sameValue, writeProblem } from "./employees";

const GONE = "That person is no longer on the list.";

/** A failure the database named (a duplicate email, a refusal): worth saying as it is. Anything else may have gone through. */
const NAMED = /people_email_key|duplicate key|row-level security|permission denied|violates|invalid input/i;

const reasonOf = (err) => String(err?.message || err || "no reason given");

/**
 * A failed write, in words. A named failure is said as it is. Any other (a dropped connection, a read that failed after the write
 * went through) is not known to have failed, so it says so and has `ambiguous` set: the page looks at the database again.
 */
function failure(what, err, lookAt) {
  if (NAMED.test(reasonOf(err))) return { ok: false, message: `${what}: ${writeProblem(err)}` };
  return { ok: false, ambiguous: true, message: `${what}, as far as the page can tell (${reasonOf(err)}). Check ${lookAt} before you try again.` };
}
const NOT_SAVED = "Not saved. You may not have permission to change people.";
const NOT_DELETED = "Not deleted. You may not have permission to delete people.";

// Creates the employee's Supabase account on a throwaway client (so signing
// them up does not replace the admin's own session), links it to their
// people row, then emails them a link to set their own password.
//
// An address that already has an account is not an error — it means they were
// added before, or still sign in through Firebase — so we just send the
// set-password email and let them come across.
export async function createEmployeeLogin(email, fullName, personId) {
  const signup = createSignupClient();
  try {
    const { data, error } = await signup.auth.signUp({
      email,
      password: crypto.randomUUID(),
      options: {
        // Without this the account shows up nameless in the Supabase dashboard
        // and in any email template that greets by name. `display_name` is the
        // column the Users list actually reads; `full_name` matches what
        // provision-auth.cjs writes for everyone migrated ahead of this.
        data: { full_name: fullName, display_name: fullName },
        // If the project has "Confirm email" on, signUp also sends its own
        // confirmation email. Point it at the same place the reset link goes so
        // clicking whichever one arrives first still lands on the password form.
        emailRedirectTo: authRedirectUrl("/login"),
      },
    });
    if (error && !/already/i.test(error.message)) throw error;

    if (data?.user?.id && personId) {
      // Straight to the table: auth_uid is deliberately not exposed through
      // the employees view, so updateRow would drop it.
      await supabase.from("people").update({ auth_uid: data.user.id }).eq("id", personId);
    }
  } finally {
    await signup.auth.signOut().catch(() => {});
  }
  await authClient.auth.resetPasswordForEmail(email, {
    redirectTo: authRedirectUrl("/login"),
  });
}

/**
 * Change a person. `was` is the form as the card opened (lib/employees.js personForm), `form` is what is typed now.
 * `canSeePrivate`: false when the viewer cannot see pay and bank details, so a hidden null is never compared with what they wrote.
 * Resolves { ok, row, changed } or { ok: false, message, section? }. `unchanged` when there was nothing to write.
 */
export async function savePerson(row, was, form, { canSeePrivate = true } = {}) {
  const problem = formProblem(form, was);
  if (problem) return { ok: false, ...problem };
  const patch = patchOf(was, form);
  const keys = Object.keys(patch);
  if (keys.length === 0) return { ok: true, unchanged: true, row };
  try {
    const saved = await updateRow("employees", row.id, { ...patch, updatedAt: new Date().toISOString() });
    if (!saved) return { ok: false, gone: true, message: GONE };
    // a field the viewer cannot see, or one the directory view does not carry (`k in saved`), cannot be read back, so it is not judged
    const wrong = keys.filter((k) => k in saved && (canSeePrivate || !PRIVATE_FIELDS.includes(k)) && !sameValue(k, patch[k], saved[k]));
    if (wrong.length) return { ok: false, message: NOT_SAVED, row: saved };
    return { ok: true, row: saved, changed: keys };
  } catch (err) {
    console.error("Failed to save employee:", err);
    return failure("Not saved", err, "the person in the list");
  }
}

/**
 * Add a person, then give them a sign-in. Resolves { ok, row, login } where `login` is { ok: true } or { ok: false, message }
 * (the person is saved either way: a failed email is for the page to say, with how to invite them by hand).
 */
export async function createPerson(form) {
  const problem = formProblem(form);
  if (problem) return { ok: false, ...problem };
  const payload = createPayload(form);
  let row = null;
  try {
    row = await insertRow("employees", payload);
  } catch (err) {
    console.error("Failed to add employee:", err);
    // `insertRow` also reads the row back, and that read can fail after the insert went through: look in the list before adding again
    return failure("Not added", err, "the list");
  }

  let login = { ok: true };
  try {
    await createEmployeeLogin(payload.email, payload.name, row?.id || null);
  } catch (err) {
    console.warn("Failed to auto-create login:", err);
    login = { ok: false, message: err?.message || "no reason given" };
  }
  return { ok: true, row, login, name: payload.name, email: payload.email, status: payload.status };
}

/** Delete a person and check they are gone (a refused delete leaves the row and says nothing). */
export async function removePerson(row) {
  try {
    await deleteRow("employees", row.id);
  } catch (err) {
    console.error("Failed to delete employee:", err);
    return failure("Not deleted", err, "the list");
  }
  let still = null;
  try { still = await fetchOne("employees", row.id); } catch { /* the delete went through; the page looks again */ }
  return still ? { ok: false, message: NOT_DELETED } : { ok: true };
}
