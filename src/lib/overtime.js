/**
 * Overtime that is approved first. Someone who may edit Attendance approves a person's overtime for a day (from, until, and why),
 * and it has to be done BEFORE the person clocks in: the database refuses to add or change an approval once they have. Only the time
 * inside the approved window, after the person's own shift ends, counts as overtime (the `overtime_days` view reads it off the
 * approval and the clock times), so time beyond the window, or on a day nothing was approved, is never paid or counted.
 *
 * The table and the view are migration 0064; this file asks them questions and writes to them. Everything here fails quietly into
 * "not set up" when they are not on the database yet, so the app can ship before the migration is run.
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
  }));
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

/** What went wrong with an overtime write, in a sentence. */
export function overtimeProblem(err) {
  const text = String(err?.message || err || "");
  if (overtimeNotSetUp(err)) return "Overtime is not switched on in the database yet (it needs migration 0064).";
  if (/already clocked in|before the person clocks in|overtime_before_clock_in/i.test(text)) return "They have already clocked in that day, so overtime can no longer be approved for it. It has to be approved before they clock in.";
  if (/row-level security|permission denied/i.test(text)) return "You are not allowed to approve overtime.";
  if (/overtime_window/i.test(text)) return "The end time has to be after the start time.";
  if (/overtime_reason/i.test(text)) return "Choose one of the reasons.";
  if (/overtime_note_len/i.test(text)) return "The note can be at most 280 characters.";
  return "Not saved. Check your connection and try again.";
}
