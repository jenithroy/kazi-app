/**
 * Overtime that is approved first. Someone who may edit Attendance approves a person's overtime for a day (from, until, and why),
 * and it has to be done BEFORE the person clocks in: the database refuses to add or change an approval once they have. Only the time
 * inside the approved window, after the person's own shift ends, counts as overtime (the `overtime_days` view reads it off the
 * approval and the clock times), so time beyond the window, or on a day nothing was approved, is never paid or counted.
 *
 * The table and the view are migration 0064; this file asks them questions and writes to them. Everything here fails quietly into
 * "not set up" when they are not on the database yet, so the app can ship before the migration is run. Asking for overtime (a person's
 * request, before they clock in, that an approver then approves or declines) is migration 0065 and is at the end of this file.
 */
import { supabase } from "../supabase";
import { OT_REASONS } from "./workRules";

export { OT_REASONS };

/** True when the error just means the overtime table or view has not been added yet. */
export function overtimeNotSetUp(err) {
  const text = String(err?.message || err || "");
  return /does not exist|schema cache|could not find the table|PGRST205|42P01/i.test(text);
}

export const reasonLabel = (value) => OT_REASONS.find((r) => r.value === value)?.label || "Other";

const day = (v) => String(v || "").slice(0, 10);
const hm = (v) => String(v || "").slice(0, 5);

const approvalOf = (r) => ({
  id: r.id, personId: r.person_id, date: day(r.date), from: hm(r.from_time), until: hm(r.until_time), reason: r.reason || "other", note: r.note || "",
});

/** The approvals in a range of days (or for one person): [{ id, personId, date, from, until, reason, note }]. A person reads their own; an editor of Attendance reads everyone's. */
export async function fetchApprovals({ from, to, personId } = {}) {
  let q = supabase.from("overtime_approvals").select("*").order("date", { ascending: true });
  if (from) q = q.gte("date", from);
  if (to) q = q.lte("date", to);
  if (personId) q = q.eq("person_id", personId);
  const { data, error } = await q;
  if (error) throw error;
  return (data || []).map(approvalOf);
}

/**
 * What each approval came to: the approval with `minutes`, the overtime that counted (0 until they have clocked out, or if they
 * left before the shift ended or the window began), and whether they clocked in and out.
 */
export async function fetchOvertimeDays({ from, to, personId } = {}) {
  let q = supabase.from("overtime_days").select("*").order("date", { ascending: true });
  if (from) q = q.gte("date", from);
  if (to) q = q.lte("date", to);
  if (personId) q = q.eq("person_id", personId);
  const { data, error } = await q;
  if (error) throw error;
  return (data || []).map((r) => ({
    id: r.id, personId: r.person_id, date: day(r.date), from: hm(r.from_time), until: hm(r.until_time), reason: r.reason || "other", note: r.note || "",
    minutes: Number(r.minutes) || 0, clockedIn: Boolean(r.clocked_in_at), clockedOut: Boolean(r.clocked_out_at),
    shiftMinutes: Number(r.shift_minutes) || 0,      // the length of the person's shift that day (migration 0066); 0 until the database has it
  }));
}

/**
 * The hours the DATABASE counts as a person's normal day on a day: { start, end } as "HH:MM" (their saved hours for that weekday,
 * else the memo's 10:00 to 18:00). Overtime is only ever the time AFTER `end`; the dialog says so beside the times, from this, so
 * what it says is what is counted. Rejects when the database cannot say, and the dialog falls back to its own reading of their hours.
 */
export async function fetchShift({ personId, date }) {
  const { data, error } = await supabase.rpc("work_shift", { p_person: personId, p_date: date });
  if (error) throw error;
  const row = Array.isArray(data) ? data[0] : data;
  if (!row?.s_start || !row?.s_end) throw new Error("The database gave no hours for that day.");
  return { start: hm(row.s_start), end: hm(row.s_end) };
}

/** Add an approval, or change the one that person already has for that day. Rejects when they have already clocked in. */
export async function saveApproval({ personId, date, from, until, reason, note }) {
  const row = { person_id: personId, date, from_time: from, until_time: until, reason: reason || "other", note: String(note || "").trim() || null };
  const { data, error } = await supabase.from("overtime_approvals").upsert(row, { onConflict: "person_id,date" }).select().single();
  if (error) throw error;
  return approvalOf(data);
}

export async function removeApproval(id) {
  const { error } = await supabase.from("overtime_approvals").delete().eq("id", id);
  if (error) throw error;
}

/* ── Asking for overtime ──────────────────────────────────────────
 * A person asks for themselves (before they clock in, for today or a coming day); an approver approves it (an approval, above) or
 * declines it. A request is "pending" or "declined" in the database; "approved" is not stored, it is an approval existing for that
 * person and day (`requestState`), so approving a request and approving the day from the form are one and the same.
 * The table is migration 0065; without it everything here reads as "not switched on" and the rest of the overtime page still works.
 */

const requestOf = (r) => ({
  id: r.id, personId: r.person_id, date: day(r.date), from: hm(r.from_time), until: hm(r.until_time),
  reason: r.reason || "other", note: r.note || "", status: r.status === "declined" ? "declined" : "pending",
  decidedBy: r.decided_by || null, decidedAt: r.decided_at || null, decisionNote: r.decision_note || "", createdAt: r.created_at || null,
});

/** True when the error just means the requests table has not been added yet (migration 0065). */
export const requestsNotSetUp = (err) => overtimeNotSetUp(err) && /overtime_requests/i.test(String(err?.message || err || ""));

/** The requests in a range of days (or for one person): [{ id, personId, date, from, until, reason, note, status, decisionNote }]. A person reads their own; an approver reads everyone's. */
export async function fetchRequests({ from, to, personId } = {}) {
  let q = supabase.from("overtime_requests").select("*").order("date", { ascending: true });
  if (from) q = q.gte("date", from);
  if (to) q = q.lte("date", to);
  if (personId) q = q.eq("person_id", personId);
  const { data, error } = await q;
  if (error) throw error;
  return (data || []).map(requestOf);
}

/** Ask for overtime, or change the request that person already has for that day (which also asks again after a decline). Rejects after they have clocked in, and for a day that has passed. */
export async function saveRequest({ personId, date, from, until, reason, note }) {
  const row = { person_id: personId, date, from_time: from, until_time: until, reason: reason || "other", note: String(note || "").trim() || null, status: "pending" };
  const { data, error } = await supabase.from("overtime_requests").upsert(row, { onConflict: "person_id,date" }).select().single();
  if (error) throw error;
  return requestOf(data);
}

export async function withdrawRequest(id) {
  const { error } = await supabase.from("overtime_requests").delete().eq("id", id);
  if (error) throw error;
}

/** Decline a request, with a word on why. Only an approver may; a refused write comes back as no row, which is said as a sentence. */
export async function declineRequest(id, note) {
  const { data, error } = await supabase.from("overtime_requests").update({ status: "declined", decision_note: String(note || "").trim() || null }).eq("id", id).select().maybeSingle();
  if (error) throw error;
  if (!data) throw new Error("row-level security: nothing was changed");
  return requestOf(data);
}

/**
 * Where a request stands, for showing: "approved" (an approval exists for that person and day, whoever made it), "declined", "late"
 * (still pending but its day has passed, so it can no longer be approved), or "waiting". `approvals` are fetchOvertimeDays rows.
 */
export function requestState(request, approvals, today) {
  const approval = approvals.find((a) => a.personId === request.personId && a.date === request.date);
  if (approval) return { state: "approved", approval };
  if (request.status === "declined") return { state: "declined", approval: null };
  if (request.date < today) return { state: "late", approval: null };
  return { state: "waiting", approval: null };
}

/** What went wrong with an overtime write, in a sentence. `self` is a person acting on their own request (so "you", not "they"). */
export function overtimeProblem(err, { self = false } = {}) {
  const text = String(err?.message || err || "");
  const who = self ? "You have" : "They have";
  if (requestsNotSetUp(err)) return "Asking for overtime is not switched on in the database yet (it needs migration 0065).";
  if (overtimeNotSetUp(err)) return "Overtime is not switched on in the database yet (it needs migration 0064).";
  if (/already clocked in|before the person clocks in|overtime_before_clock_in|overtime_request_before_clock_in/i.test(text)) {
    return `${who} already clocked in that day, so overtime can no longer be ${self ? "asked for" : "asked for or approved"}. It has to be before ${self ? "you clock" : "they clock"} in.`;
  }
  if (/overtime_request_past_day|today or a coming day/i.test(text)) return "Overtime can only be asked for today or a coming day.";
  if (/duplicate key|overtime_request_once|23505/i.test(text)) return "There is already a request for that day. Change that one instead.";
  if (/row-level security|permission denied|nothing was changed/i.test(text)) return self ? "You are not allowed to do that." : "You are not allowed to approve overtime.";
  if (/overtime_window|overtime_request_window/i.test(text)) return "The end time has to be after the start time.";
  if (/overtime_reason|overtime_request_reason/i.test(text)) return "Choose one of the reasons.";
  if (/overtime_note_len|overtime_request_note_len/i.test(text)) return "The note can be at most 280 characters.";
  return "Not saved. Check your connection and try again.";
}
