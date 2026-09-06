/**
 * Remembers that this page load arrived from a set-a-password link.
 *
 * Such a link comes back as `#access_token=…&type=recovery` (and `type=invite`
 * or `type=signup` for an account's very first email), and supabase-js turns
 * that hash into a session and *strips it from the address bar* on its own
 * timetable — usually before the login screen has mounted and subscribed to
 * PASSWORD_RECOVERY. Read either signal too late and the person is simply signed
 * in and pushed to the dashboard, with no password of their own set and no way
 * to set one.
 *
 * So this module reads the flag once, synchronously, at import time — which is
 * why main.jsx imports it before anything that touches Supabase — and holds it
 * until the new password is actually set. sessionStorage rather than a plain
 * variable so the flag survives the reload that follows a redirect.
 */
const KEY = "kazi-password-recovery";

function looksLikeRecovery() {
  if (typeof window === "undefined") return false;
  // Supabase puts it in the hash (implicit flow); a few paths use the query
  // string, so check both rather than guessing which one we are on.
  //
  // `recovery` is a "Forgot password?" link. `invite` and `signup` are the
  // first email a freshly created account gets — the person was signed up with
  // a random password nobody knows, so the one thing left for them to do is the
  // same as a recovery: choose a password. All three land on that form.
  return /(^|[#&?])type=(recovery|invite|signup)(&|$)/.test(
    window.location.hash + window.location.search
  );
}

if (looksLikeRecovery()) {
  try { sessionStorage.setItem(KEY, "1"); } catch { /* private mode — the live hash still covers this load */ }
}

/** True while a reset link has been followed but no new password set yet. */
export function isRecoveryPending() {
  if (looksLikeRecovery()) return true;
  try { return sessionStorage.getItem(KEY) === "1"; } catch { return false; }
}

/**
 * Call once the new password is saved, so a later visit is an ordinary login.
 *
 * The address bar is cleared too, not just the stored flag: if supabase-js has
 * not yet stripped the hash, `looksLikeRecovery()` would keep reporting true and
 * the guard in App.jsx would bounce the person back to the login screen they
 * have just finished with.
 */
export function clearRecoveryLink() {
  try { sessionStorage.removeItem(KEY); } catch { /* nothing to clear */ }
  if (typeof window === "undefined" || !looksLikeRecovery()) return;
  const url = new URL(window.location.href);
  url.hash = "";
  url.searchParams.delete("type");
  window.history.replaceState(window.history.state, "", url.toString());
}
