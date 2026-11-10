/**
 * The Conversation Record page's rules and wording, with no database in it (the reads are in lib/commRecordReads.js), so every line here
 * can be tried on its own.
 *
 * The record is the table comm_events (migration 0068): one row per message, call, voice note or transcript, whichever door it came through,
 * never edited and never deleted. Migration 0069 copies the Instagram lead chats into it (and team chat once the staff papers are signed)
 * and creates the `comms_record` permission this page is gated on. Times are Kathmandu, like the rest of the app.
 */

export const SECTION = "comms_record";
export const PAGE_SIZE = 60;
export const KTM = "Asia/Kathmandu";

/** Every door the record has a place for, in the order the page lists them. Only some are connected today. */
export const CHANNELS = [
  { key: "instagram",     label: "Instagram" },
  { key: "messenger",     label: "Messenger" },
  { key: "whatsapp_chat", label: "WhatsApp" },
  { key: "team_chat",     label: "Team chat" },
  { key: "team_call",     label: "Team calls" },
  { key: "whatsapp_call", label: "WhatsApp calls" },
  { key: "phone_note",    label: "Phone notes" },
  { key: "camera",        label: "Cameras" },
];

export const channelLabel = (key) => CHANNELS.find((c) => c.key === key)?.label || key || "Unknown";

/* ── Time ──────────────────────────────────────────────── */

/** The Kathmandu calendar day of a moment, YYYY-MM-DD. */
export const dayKey = (iso) => new Date(iso).toLocaleDateString("en-CA", { timeZone: KTM });

export function dayLabel(key, now = Date.now()) {
  const today = new Date(now).toLocaleDateString("en-CA", { timeZone: KTM });
  const yesterday = new Date(now - 86400000).toLocaleDateString("en-CA", { timeZone: KTM });
  if (key === today) return "Today";
  if (key === yesterday) return "Yesterday";
  return new Date(`${key}T12:00:00Z`).toLocaleDateString("en-GB", { timeZone: "UTC", weekday: "short", day: "numeric", month: "short", year: "numeric" });
}

export const clock = (iso) => new Date(iso).toLocaleTimeString("en-GB", { timeZone: KTM, hour: "2-digit", minute: "2-digit" });

export function ago(iso, now = Date.now()) {
  const t = Date.parse(iso);
  if (!Number.isFinite(t)) return "";
  const s = Math.round((now - t) / 1000);
  if (s < 45) return "just now";
  if (s < 3600) return `${Math.round(s / 60)}m ago`;
  if (s < 86400) return `${Math.round(s / 3600)}h ago`;
  if (s < 7 * 86400) return `${Math.round(s / 86400)}d ago`;
  return "";
}

/** The rows (newest first, as read) in runs of one Kathmandu day, each run keeping the order it came in. */
export function groupByDay(rows) {
  const out = [];
  for (const r of rows || []) {
    const key = dayKey(r.occurred_at);
    const last = out[out.length - 1];
    if (last && last.key === key) last.items.push(r);
    else out.push({ key, items: [r] });
  }
  return out;
}

/** 7 seconds → "0:07", 125 → "2:05". */
export function seconds(n) {
  const s = Math.max(0, Math.round(Number(n) || 0));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

/* ── Who and what ──────────────────────────────────────── */

const SIDE = { lead: "Lead", customer: "Customer", supplier: "Supplier", staff: "Colleague" };

/** A short code that tells two leads apart without showing the raw Instagram id: "ig:3f9a…" → "#3F9A". */
export function leadCode(threadRef) {
  const m = /^ig:([0-9a-f]{4})/i.exec(String(threadRef || ""));
  return m ? `#${m[1].toUpperCase()}` : "";
}

/** The person on the other side, in words ("Lead #3F9A"). An erased contact says so. */
export function counterpartyName(row) {
  if (row.redacted_at) return "Erased contact";
  const base = SIDE[row.counterparty_kind] || "Contact";
  const code = leadCode(row.thread_ref);
  return code ? `${base} ${code}` : base;
}

/** Who wrote it and to whom, as two names for the row's headline. */
export function sides(row) {
  if (row.direction === "internal") {
    const d = row.detail || {};
    const where = d.thread_name ? (d.thread_kind === "group" ? `${d.thread_name} (group)` : d.thread_name) : "team chat";
    return { from: row.staff_name || "Someone", to: where };
  }
  const them = counterpartyName(row);
  return row.direction === "in"
    ? { from: them, to: "Kazi" }
    : { from: row.staff_name || "Kazi", to: them };
}

/** "Photo", "Video", "Voice note 0:07"… for a row that carries a file; null for plain text. */
export function mediaWords(row) {
  if (row.kind === "image") return "Photo";
  if (row.kind === "voice") return row.media_seconds != null ? `Voice note ${seconds(row.media_seconds)}` : "Voice note";
  if (row.kind === "call") return row.media_seconds != null ? `Call ${seconds(row.media_seconds)}` : "Call";
  if (row.kind === "file") return /^video\//i.test(row.media_mime || "") ? "Video" : (row.detail?.attachment_name || "File");
  return null;
}

/** What the row says. Erased content says so; a file with no words shows what the file is. */
export function textOf(row) {
  if (row.redacted_at) return { text: "Erased on request. Only the fact that it happened is kept.", quiet: true };
  const body = String(row.body ?? "").trim();
  const media = mediaWords(row);
  if (body && media) return { text: body, quiet: false, media };
  if (body) return { text: body, quiet: false, media: null };
  if (media) return { text: media, quiet: true, media };
  return { text: "(no text)", quiet: true, media: null };
}

/** The consent mark on a row, in words, and whether it deserves a second look. */
export function consentWords(consent) {
  if (consent === "announced") return { text: "Caller was told", warn: false };
  if (consent === "staff_policy") return { text: "Staff papers", warn: false };
  return { text: "No consent recorded", warn: true };
}

/* ── What is being copied in ──────────────────────────── */

/**
 * Whether a channel is being copied into the record right now, from the switches (comm_mirror_settings). A channel with no switch (WhatsApp,
 * calls, cameras) is not connected yet.
 */
export function mirrorState(channel, settings) {
  const s = (settings || []).find((x) => x.channel === channel);
  if (!s) return { known: false, on: false, text: "Not connected yet" };
  if (s.enabled) {
    return { known: true, on: true, text: channel === "team_chat" ? (s.include_dms ? "Recording group and private chats" : "Recording group chats") : "Recording" };
  }
  return { known: true, on: false, text: channel === "team_chat" ? "Off until the staff papers are signed" : "Off" };
}

/** The channels the page shows a tile and a filter for: any with rows, or with a switch. The rest are listed in one line. */
export function visibleChannels(counts, settings) {
  const has = (k) => (counts?.[k] || 0) > 0 || (settings || []).some((s) => s.channel === k);
  return { shown: CHANNELS.filter((c) => has(c.key)), hidden: CHANNELS.filter((c) => !has(c.key)) };
}

/* ── Reads ─────────────────────────────────────────────── */

/** A person's words made safe to put inside a LIKE pattern (% and _ would otherwise act as wildcards). */
export const likeSafe = (text) => String(text || "").replace(/[\\%_]/g, (c) => `\\${c}`);

/** The database has no such table yet (migrations 0068/0069 not applied). */
export const tableMissing = (error) => error?.code === "PGRST205" || error?.code === "42P01";
