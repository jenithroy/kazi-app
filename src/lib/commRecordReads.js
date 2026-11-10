/**
 * What the Conversation Record page reads from the database. Read only: the record is written by the database's own copy triggers and by
 * the Worker, never from the browser (comm_events has no insert, update or delete for signed-in users).
 *
 * Row level security does the gating. Everything here answers with no rows for someone who does not have the `comms_record` permission,
 * and refuses the anonymous (migration 0068 and 0069).
 */
import { supabase } from "../supabase";
import { CHANNELS, PAGE_SIZE, likeSafe } from "./commRecord";

const COLUMNS = "id, occurred_at, channel, direction, kind, staff_person_id, staff_name, counterparty_kind, counterparty_ref, thread_ref, body, language, media_path, media_mime, media_seconds, consent, lineage, redacted_at, detail";

/** One page of the record, newest first. `channel` and `search` narrow it; `offset` is how many are already on screen. */
export async function fetchEvents({ channel = null, search = "", offset = 0, limit = PAGE_SIZE } = {}) {
  let q = supabase.from("comm_events").select(COLUMNS)
    .order("occurred_at", { ascending: false })
    .order("id", { ascending: false })
    .range(offset, offset + limit - 1);
  if (channel) q = q.eq("channel", channel);
  const words = String(search || "").trim();
  if (words) q = q.ilike("body", `%${likeSafe(words)}%`);
  const { data, error } = await q;
  if (error) throw error;
  return data || [];
}

/** Every message of one conversation, oldest first (a thread is a few dozen messages; 500 is a ceiling, not a target). */
export async function fetchThread(threadRef) {
  const { data, error } = await supabase.from("comm_events").select(COLUMNS)
    .eq("thread_ref", threadRef)
    .order("occurred_at", { ascending: true })
    .order("id", { ascending: true })
    .limit(500);
  if (error) throw error;
  return data || [];
}

/** How many rows each channel holds, as { instagram: 526, … }. One small count per channel. */
export async function fetchCounts() {
  const pairs = await Promise.all(CHANNELS.map(async (c) => {
    const { count, error } = await supabase.from("comm_events").select("id", { count: "exact", head: true }).eq("channel", c.key);
    if (error) throw error;
    return [c.key, count || 0];
  }));
  return Object.fromEntries(pairs);
}

/** Which chats are being copied in, and since when they were last changed. */
export async function fetchSettings() {
  const { data, error } = await supabase.from("comm_mirror_settings").select("channel, enabled, include_dms, consent, note, changed_at");
  if (error) throw error;
  return data || [];
}
