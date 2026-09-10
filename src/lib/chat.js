/**
 * The data layer for team chat.
 *
 * Reads and writes the real `chat_*` tables created by the mobile app's
 * migrations 0105-0109 against the same Supabase project, so a message sent
 * from a phone on the factory floor appears here and vice versa. Nothing in
 * this file is web-only; it is the mobile app's `data/chat/supabase.ts` and
 * `supabase-write.ts` ported to plain JS.
 *
 * It deliberately bypasses `lib/db.js`. That shim exists to translate the
 * `fs_*` compatibility views back into the camelCase shapes the Firestore-era
 * pages expect; the chat tables were designed for Postgres from the start and
 * have no view to translate, so the shim would only be indirection.
 *
 * RLS does all the filtering. `chat_threads`, `chat_members`, `chat_messages`
 * and `chat_reactions` each return only rows from threads the caller is
 * actually in, which is why none of these queries carries a `where` clause on
 * the caller's own id -- asking for everything IS asking for everything I may
 * see. A write the policies refuse throws, and the caller rolls back.
 *
 * Two things are derived here rather than stored, because a stored copy could
 * drift from the messages that actually exist:
 *   - unread, from my `last_read_at` against the messages after it;
 *   - read receipts on my own messages, from every *other* member's
 *     `last_read_at`. A group message reads as "Read" only once the last
 *     person has caught up, which is the only thing a single receipt line can
 *     honestly claim.
 */

import { supabase } from "../supabase";
import { myId } from "./chatFormat";

const BUCKET = "chat-media";

/**
 * How far back a cold read goes. The thread list needs the newest message of
 * every conversation and an open thread needs enough history to scroll; one
 * bounded read covers both, and realtime keeps it current from there. Ordered
 * newest-first so the cap drops the OLDEST messages, then flipped back.
 */
const MESSAGE_WINDOW = 1000;

function fail(where, error) {
  throw new Error(`${where}: ${error.message}${error.code ? ` [${error.code}]` : ""}`);
}

const str = (v) => (v === null || v === undefined ? "" : String(v));
const num = (v) => (v === null || v === undefined || v === "" ? 0 : Number(v) || 0);

const ms = (v) => {
  const t = Date.parse(str(v));
  return Number.isFinite(t) ? t : 0;
};

/* ==================================================================== */
/*  Directory                                                            */
/* ==================================================================== */

const clockOf = (atMs) => {
  const d = new Date(atMs);
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
};

/**
 * Who is on the clock right now, as `person_id -> clock-in time`.
 *
 * `chat_presence` (migration 0109) is the punch itself, not the roster: the
 * schedule used to announce "Off shift, starts 09:00" over the name of someone
 * standing in the building with an open punch. The view exists separately
 * because `clock_ins` is RLS'd down to your own rows unless you hold
 * attendance at tier 2+, so reading punches directly would show everyone but
 * the reader as off.
 *
 * Presence is decoration on a directory that has to render either way, so a
 * failure here means "nobody is known to be on the clock", not a dead screen.
 */
async function fetchPresence() {
  const { data, error } = await supabase.from("chat_presence").select("*");
  if (error) {
    console.warn("[chat] presence read failed:", error.message);
    return new Map();
  }
  const out = new Map();
  for (const row of data || []) {
    const id = str(row.personId).trim();
    if (id) out.set(id, ms(row.since));
  }
  return out;
}

function toPerson(row, presence) {
  const id = str(row.id).trim();
  const name = str(row.name).trim();
  if (!id || !name) return null;
  if (/inactive|disabled|left/i.test(str(row.status))) return null;

  const since = presence.get(id);
  return {
    id,
    name,
    role: str(row.role).trim() || str(row.department).trim() || "Staff",
    online: since != null,
    status: since ? `On shift · since ${clockOf(since)}` : "Not clocked in",
    onShiftSince: since,
    email: str(row.email).trim() || undefined,
    phone: str(row.phone).trim() || undefined,
    department: str(row.department).trim() || undefined,
    location: str(row.location).trim() || undefined,
  };
}

/** Every active member of staff, with presence folded in. */
export async function fetchDirectory() {
  const [staff, presence] = await Promise.all([
    supabase.from("fs_employees").select("id, name, role, status, email, phone, department, location"),
    fetchPresence(),
  ]);
  if (staff.error) fail("directory", staff.error);

  return (staff.data || [])
    .map((row) => toPerson(row, presence))
    .filter(Boolean)
    .sort((a, b) => a.name.localeCompare(b.name));
}

/** Whether this person's position may start a group, and reshape one. */
export async function fetchGroupRights() {
  const { data, error } = await supabase.from("my_chat_group_permissions").select("*").maybeSingle();
  if (error) fail("group rights", error);
  return { create: data?.can_create === true, manage: data?.can_manage === true };
}

/* ==================================================================== */
/*  Threads                                                              */
/* ==================================================================== */

async function readMembers() {
  const { data, error } = await supabase
    .from("chat_members")
    .select("thread_id, person_id, member_role, pinned, muted, last_read_at, left_at");
  if (error) fail("chat members", error);

  return (data || [])
    .filter((r) => r.left_at == null)
    .map((r) => ({
      threadId: str(r.thread_id),
      personId: str(r.person_id),
      owner: str(r.member_role) === "owner",
      pinned: r.pinned === true,
      muted: r.muted === true,
      lastReadAt: ms(r.last_read_at),
    }));
}

/** My threads, with membership folded in. Threads I have left are already gone -- RLS drops them. */
export async function fetchThreads() {
  const me = myId();
  const [threadRes, members] = await Promise.all([
    supabase.from("chat_threads").select("id, kind, name, avatar_tint, created_by, created_at, updated_at"),
    readMembers(),
  ]);
  if (threadRes.error) fail("chat threads", threadRes.error);

  const byThread = new Map();
  for (const m of members) {
    const list = byThread.get(m.threadId);
    if (list) list.push(m);
    else byThread.set(m.threadId, [m]);
  }

  return (threadRes.data || [])
    .map((r) => {
      const id = str(r.id);
      const roster = byThread.get(id) || [];
      const mine = roster.find((m) => m.personId === me);
      // A thread whose membership row I cannot see is one I am not in. RLS
      // should already have hidden it; this is belt and braces.
      if (!mine) return null;

      const kind = str(r.kind) === "group" ? "group" : "dm";
      const memberIds = roster.filter((m) => m.personId !== me).map((m) => m.personId);
      // A dm whose other side has been deleted from `people` has nobody left
      // to name, so there is nothing to show in the list.
      if (kind === "dm" && memberIds.length === 0) return null;

      return {
        id,
        kind,
        memberIds,
        name: str(r.name).trim() || undefined,
        pinned: mine.pinned,
        muted: mine.muted,
        createdAt: ms(r.created_at) || ms(r.updated_at),
        ownerId: str(r.created_by).trim() || roster.find((m) => m.owner)?.personId,
      };
    })
    .filter(Boolean);
}

/* ==================================================================== */
/*  Messages                                                             */
/* ==================================================================== */

function toAttachment(r) {
  const path = str(r.attachment_path).trim();
  if (!path) return undefined;
  const kind = str(r.attachment_kind);
  return {
    kind: kind === "image" || kind === "video" ? kind : "file",
    path,
    name: str(r.attachment_name).trim() || path.split("/").pop() || "Attachment",
    mime: str(r.attachment_mime).trim() || "application/octet-stream",
    size: num(r.attachment_size),
    width: r.attachment_width == null ? undefined : num(r.attachment_width),
    height: r.attachment_height == null ? undefined : num(r.attachment_height),
    duration: r.attachment_duration == null ? undefined : num(r.attachment_duration),
  };
}

/**
 * Signed links for every attachment in one call.
 *
 * The bucket is private, so a path is not a URL. An hour outlives any single
 * sitting with a thread open, and a refetch re-signs well before it lapses. A
 * path that fails to sign renders as a tile without its media rather than
 * failing the whole read.
 */
async function signAttachments(messages) {
  const paths = [...new Set(messages.map((m) => m.attachment?.path).filter(Boolean))];
  if (!paths.length) return;

  const { data, error } = await supabase.storage.from(BUCKET).createSignedUrls(paths, 3600);
  if (error) {
    console.warn("[chat] could not sign attachment URLs:", error.message);
    return;
  }
  const urlByPath = new Map();
  for (const entry of data || []) {
    if (entry.signedUrl && entry.path) urlByPath.set(entry.path, entry.signedUrl);
  }
  for (const m of messages) {
    if (m.attachment) m.attachment.url = urlByPath.get(m.attachment.path);
  }
}

/** Every message I may see, as `threadId -> messages[]`, oldest first. */
export async function fetchMessages() {
  const me = myId();
  const [msgRes, reactRes, members] = await Promise.all([
    supabase.from("chat_messages").select("*").order("sent_at", { ascending: false }).limit(MESSAGE_WINDOW),
    supabase.from("chat_reactions").select("message_id, person_id, emoji"),
    readMembers(),
  ]);
  if (msgRes.error) fail("chat messages", msgRes.error);
  if (reactRes.error) fail("chat reactions", reactRes.error);

  // messageId -> emoji -> who
  const reactions = new Map();
  for (const r of reactRes.data || []) {
    const messageId = str(r.message_id);
    const byEmoji = reactions.get(messageId) || new Map();
    const emoji = str(r.emoji);
    byEmoji.set(emoji, [...(byEmoji.get(emoji) || []), str(r.person_id)]);
    reactions.set(messageId, byEmoji);
  }

  // The earliest point everyone *else* in a thread has read up to. My own
  // message counts as read once it is behind that line.
  const readFloor = new Map();
  for (const m of members) {
    if (m.personId === me) continue;
    const current = readFloor.get(m.threadId);
    readFloor.set(m.threadId, current == null ? m.lastReadAt : Math.min(current, m.lastReadAt));
  }

  const out = {};
  for (const t of new Set(members.filter((m) => m.personId === me).map((m) => m.threadId))) out[t] = [];

  const flat = [];
  for (const r of msgRes.data || []) {
    const threadId = str(r.thread_id);
    const id = str(r.id);
    const authorId = str(r.author_id);
    const deleted = r.deleted === true;
    const at = ms(r.sent_at);

    const message = {
      id,
      threadId,
      authorId,
      text: deleted ? "" : str(r.body),
      at,
      editedAt: r.edited_at && !deleted ? ms(r.edited_at) : undefined,
      replyTo: str(r.reply_to).trim() || undefined,
      attachment: deleted ? undefined : toAttachment(r),
      reactions: deleted
        ? []
        : [...(reactions.get(id) || new Map())].map(([emoji, by]) => ({ emoji, by })),
      deleted: deleted || undefined,
      read: authorId === me ? at <= (readFloor.get(threadId) || 0) : undefined,
    };

    (out[threadId] = out[threadId] || []).push(message);
    flat.push(message);
  }

  await signAttachments(flat);

  // The query came back newest-first so the window kept the newest; the view
  // renders oldest-first.
  for (const list of Object.values(out)) list.sort((a, b) => a.at - b.at);
  return out;
}

/**
 * Unread per thread -- messages after my `last_read_at` that somebody else
 * sent.
 *
 * Its own read rather than a count derived from `fetchMessages`, because the
 * two have separate lifetimes: opening a thread marks it read and has to
 * re-count without re-fetching every message body. Only four columns come
 * back, so the same window costs a fraction of the read above.
 */
export async function fetchUnread() {
  const me = myId();
  const [msgRes, members] = await Promise.all([
    supabase
      .from("chat_messages")
      .select("thread_id, author_id, sent_at, deleted")
      .order("sent_at", { ascending: false })
      .limit(MESSAGE_WINDOW),
    readMembers(),
  ]);
  if (msgRes.error) fail("chat unread", msgRes.error);

  const mine = new Map();
  for (const m of members) if (m.personId === me) mine.set(m.threadId, m.lastReadAt);

  const counts = {};
  for (const t of mine.keys()) counts[t] = 0;
  for (const r of msgRes.data || []) {
    const threadId = str(r.thread_id);
    if (!mine.has(threadId)) continue;
    if (str(r.author_id) === me || r.deleted === true) continue;
    if (ms(r.sent_at) > (mine.get(threadId) || 0)) counts[threadId] += 1;
  }
  return counts;
}

/* ==================================================================== */
/*  Writes                                                               */
/* ==================================================================== */

function check(where, error) {
  if (error) fail(where, error);
}

/** Mark my membership row caught up. Called after I post, so my own message never counts as unread against me. */
async function touchRead(threadId) {
  await supabase
    .from("chat_members")
    .update({ last_read_at: new Date().toISOString() })
    .eq("thread_id", threadId)
    .eq("person_id", myId());
}

export async function sendMessage(threadId, text, replyTo, attachment) {
  const sentAt = new Date().toISOString();
  const { data, error } = await supabase
    .from("chat_messages")
    .insert({
      thread_id: threadId,
      author_id: myId(),
      body: text,
      reply_to: replyTo || null,
      sent_at: sentAt,
      attachment_path: attachment?.path || null,
      attachment_kind: attachment?.kind || null,
      attachment_name: attachment?.name || null,
      attachment_mime: attachment?.mime || null,
      attachment_size: attachment?.size ?? null,
      attachment_width: attachment?.width ?? null,
      attachment_height: attachment?.height ?? null,
      attachment_duration: attachment?.duration ?? null,
    })
    .select("id, sent_at")
    .single();
  check("send message", error);

  await touchRead(threadId);

  return {
    id: str(data.id),
    threadId,
    authorId: myId(),
    text,
    at: ms(data.sent_at) || Date.parse(sentAt),
    replyTo,
    attachment,
    reactions: [],
  };
}

/** Edit my own message. The policy allows an update only where I am the author. */
export async function editMessage(messageId, text) {
  const { error } = await supabase
    .from("chat_messages")
    .update({ body: text, edited_at: new Date().toISOString() })
    .eq("id", messageId)
    .eq("author_id", myId());
  check("edit message", error);
}

/**
 * Add my reaction, or take it back if it was already there.
 *
 * The delete runs first and its row count decides: if it removed something, I
 * had reacted and we are done. One round trip in the common "undo" case, two
 * in the "react" case -- and, unlike reading first, it cannot double-insert
 * when the same emoji is clicked twice quickly.
 */
export async function toggleReaction(messageId, emoji) {
  const removed = await supabase
    .from("chat_reactions")
    .delete()
    .eq("message_id", messageId)
    .eq("person_id", myId())
    .eq("emoji", emoji)
    .select("emoji");
  check("remove reaction", removed.error);
  if ((removed.data || []).length > 0) return;

  const { error } = await supabase
    .from("chat_reactions")
    .insert({ message_id: messageId, person_id: myId(), emoji });
  check("react", error);
}

/**
 * Tombstone, never remove: a reply pointing at a deleted message still has to
 * resolve to something. The attachment columns are cleared with the body, so
 * the file stops being reachable through the thread -- and the object itself
 * goes too, because clearing the column alone would leave bytes in the bucket
 * for ever with nothing pointing at them.
 *
 * The row is updated first. A refused storage delete leaves an orphaned file,
 * which is untidy; the other order would leave a bubble pointing at a file
 * that is gone, which is a bug somebody reports.
 */
export async function deleteMessages(ids) {
  if (!ids.length) return;

  const attachments = await supabase
    .from("chat_messages")
    .select("attachment_path")
    .in("id", ids)
    .eq("author_id", myId())
    .not("attachment_path", "is", null);
  const paths = (attachments.data || []).map((r) => str(r.attachment_path)).filter(Boolean);

  const { error } = await supabase
    .from("chat_messages")
    .update({
      deleted: true,
      body: "",
      attachment_path: null,
      attachment_kind: null,
      attachment_name: null,
      attachment_mime: null,
      attachment_size: null,
      attachment_width: null,
      attachment_height: null,
      attachment_duration: null,
      edited_at: new Date().toISOString(),
    })
    .in("id", ids)
    .eq("author_id", myId());
  check("delete messages", error);

  if (paths.length) {
    const removed = await supabase.storage.from(BUCKET).remove(paths);
    if (removed.error) console.warn("[chat] attachment left in storage:", removed.error.message);
  }
}

/**
 * Read / unread, expressed as where my read line sits.
 *
 * "Mark unread" puts the line just before the newest message somebody else
 * sent, which is the only definition that makes the badge show 1 rather than a
 * number invented for the occasion.
 */
export async function setThreadRead(threadId, read) {
  let lastReadAt = new Date().toISOString();

  if (!read) {
    const { data } = await supabase
      .from("chat_messages")
      .select("sent_at")
      .eq("thread_id", threadId)
      .neq("author_id", myId())
      .order("sent_at", { ascending: false })
      .limit(1);
    const newest = (data || [])[0];
    lastReadAt = newest?.sent_at
      ? new Date(Date.parse(newest.sent_at) - 1).toISOString()
      : new Date(0).toISOString();
  }

  const { error } = await supabase
    .from("chat_members")
    .update({ last_read_at: lastReadAt })
    .eq("thread_id", threadId)
    .eq("person_id", myId());
  check("mark read", error);
}

export async function setThreadFlag(threadId, flag, value) {
  const { error } = await supabase
    .from("chat_members")
    .update({ [flag]: value })
    .eq("thread_id", threadId)
    .eq("person_id", myId());
  check(`set ${flag}`, error);
}

/**
 * Leave, rather than delete.
 *
 * "Delete conversation" takes it off MY list. The other side keeps every
 * message, because one person tidying their inbox must not be able to erase a
 * shared record -- and because re-opening the dm later brings the history back
 * instead of starting a blank second thread.
 */
export async function leaveThread(threadId) {
  const { error } = await supabase
    .from("chat_members")
    .update({ left_at: new Date().toISOString() })
    .eq("thread_id", threadId)
    .eq("person_id", myId());
  check("leave conversation", error);
}

/**
 * Starting and reshaping a conversation goes through the RPCs from migration
 * 0106, never raw inserts. Creating a thread is two writes, and the row a
 * plain INSERT ... RETURNING would hand back is filtered out by the very read
 * policy the second write has not yet satisfied.
 */
export async function createDm(personId) {
  const { data, error } = await supabase.rpc("chat_start_dm", { p_other: personId });
  check("start conversation", error);
  return str(data);
}

export async function createGroup(name, memberIds) {
  const { data, error } = await supabase.rpc("chat_create_group", { p_name: name, p_members: memberIds });
  check("create group", error);
  return str(data);
}

export async function updateGroup(threadId, name, memberIds) {
  const { error } = await supabase.rpc("chat_update_group", {
    p_thread: threadId,
    p_name: name,
    p_members: memberIds,
  });
  check("save group", error);
}

/* ==================================================================== */
/*  Attachments                                                          */
/* ==================================================================== */

const MAX_BYTES = 50 * 1024 * 1024; // matches the bucket's own ceiling

function kindOf(file) {
  if (file.type.startsWith("image/")) return "image";
  if (file.type.startsWith("video/")) return "video";
  return "file";
}

/**
 * Intrinsic dimensions, so a bubble can reserve the right space before the
 * image loads and the thread does not jump as attachments arrive.
 *
 * Failure is not an error: the columns are nullable and a tile without them
 * simply sizes itself once loaded.
 */
function measure(file, kind) {
  return new Promise((resolve) => {
    if (kind !== "image" && kind !== "video") return resolve({});
    const url = URL.createObjectURL(file);
    const done = (out) => {
      URL.revokeObjectURL(url);
      resolve(out);
    };

    if (kind === "image") {
      const img = new Image();
      img.onload = () => done({ width: img.naturalWidth, height: img.naturalHeight });
      img.onerror = () => done({});
      img.src = url;
      return;
    }

    const video = document.createElement("video");
    video.preload = "metadata";
    video.onloadedmetadata = () =>
      done({
        width: video.videoWidth,
        height: video.videoHeight,
        duration: Number.isFinite(video.duration) ? Math.round(video.duration * 1000) : undefined,
      });
    video.onerror = () => done({});
    video.src = url;
  });
}

/**
 * Put a file in the private bucket and describe it.
 *
 * The object path is `<threadId>/<uuid>.<ext>` because the storage policies
 * split on the first segment to ask whether the caller is in that thread --
 * the path IS the access check, so it cannot be shaped any other way.
 *
 * Nothing is written to `chat_messages` here. The caller sends the returned
 * descriptor as part of a message, which keeps a failed send from leaving a
 * bubble pointing at nothing.
 */
export async function uploadAttachment(threadId, file) {
  if (file.size > MAX_BYTES) {
    throw new Error(`${file.name} is ${Math.round(file.size / 1024 / 1024)} MB. The limit is 50 MB.`);
  }

  const kind = kindOf(file);
  const dims = await measure(file, kind);
  const ext = (file.name.split(".").pop() || "bin").toLowerCase().slice(0, 12);
  const path = `${threadId}/${crypto.randomUUID()}.${ext}`;

  const { error } = await supabase.storage.from(BUCKET).upload(path, file, {
    contentType: file.type || "application/octet-stream",
    upsert: false,
  });
  check("upload attachment", error);

  const signed = await supabase.storage.from(BUCKET).createSignedUrl(path, 3600);

  return {
    kind,
    path,
    name: file.name,
    mime: file.type || "application/octet-stream",
    size: file.size,
    width: dims.width,
    height: dims.height,
    duration: dims.duration,
    url: signed.data?.signedUrl,
  };
}

/** A fresh signed link, for downloading something whose hour has lapsed. */
export async function signedUrlFor(path) {
  const { data, error } = await supabase.storage.from(BUCKET).createSignedUrl(path, 3600);
  check("sign attachment", error);
  return data.signedUrl;
}

/**
 * Live updates, straight from Postgres.
 *
 * The four `chat_*` tables are in the `supabase_realtime` publication, so an
 * insert anywhere reaches every client. The payload is deliberately ignored: a
 * message row alone cannot say who has read it or how its reactions now stand,
 * and the reads above already assemble exactly that. A change just says
 * "something moved" and the hook refetches the parts that did.
 *
 * Realtime carries the subscriber's own RLS, so this only ever wakes for
 * threads the person is actually in.
 */
export function subscribeToChat({ onMessages, onThreads }) {
  const channel = supabase
    .channel(`kazi-chat-${Math.random().toString(36).slice(2)}`)
    .on("postgres_changes", { event: "*", schema: "public", table: "chat_messages" }, onMessages)
    .on("postgres_changes", { event: "*", schema: "public", table: "chat_reactions" }, onMessages)
    .on("postgres_changes", { event: "*", schema: "public", table: "chat_members" }, () => {
      onMessages();
      onThreads();
    })
    .on("postgres_changes", { event: "*", schema: "public", table: "chat_threads" }, onThreads)
    .subscribe();

  return () => {
    supabase.removeChannel(channel);
  };
}
