/**
 * Live reader for Chat.
 *
 * Reads the real `chat_*` tables added in `0105_chat.sql`, plus `fs_employees`
 * for the staff directory. RLS does the filtering: `chat_threads`,
 * `chat_members`, `chat_messages` and `chat_reactions` each return only rows
 * belonging to threads the caller is actually in, so none of these queries
 * carry a `where` clause on the caller's own id — asking for everything IS
 * asking for everything I may see.
 *
 * Two things are derived here rather than stored, because a stored copy could
 * disagree with the messages that exist:
 *   - **unread**, from my `last_read_at` versus the messages after it;
 *   - **read receipts** on my own messages, from every *other* member's
 *     `last_read_at`. A group message reads as "Read" only when the last
 *     person has caught up, which is what the single receipt line can honestly
 *     claim.
 *
 * Attachments live in the private `chat-media` bucket, so every path is
 * exchanged for a signed URL in one batched call per read.
 */

import { tintFromSeed } from '@/components/ui/avatar';
import { isDirectorPosition } from '@/auth/permissions';
import { getSupabase } from '@/lib/supabase';
import { num, str } from '@/lib/data/normalise';

import { myId } from './identity';
import type {
  Attachment,
  GroupRights,
  Message,
  Person,
  PersonId,
  Thread,
  ThreadId,
} from './types';

type Row = Record<string, unknown>;

function failed(where: string, error: { message: string; code?: string }): Error {
  return new Error(`${where}: ${error.message}${error.code ? ` [${error.code}]` : ''}`);
}

const ms = (v: unknown): number => {
  const t = Date.parse(str(v));
  return Number.isFinite(t) ? t : 0;
};

// ------------------------------------------------------------- directory

function initialsOf(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return '?';
  return ((parts[0][0] ?? '') + (parts[1]?.[0] ?? '')).toUpperCase();
}

const clockOf = (atMs: number): string => {
  const d = new Date(atMs);
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
};

/**
 * Who is on the clock, as `person_id → clock-in time`.
 *
 * This used to be derived from the schedule on `fs_employees`, which is a
 * roster and not a fact — it announced "Off shift · starts 09:00" under the
 * name of somebody who had punched in an hour early and was sitting across the
 * room. Presence is now the punch itself.
 *
 * `chat_presence` (migration 0109) exists because `clock_ins` is RLS'd to your
 * own rows unless you hold attendance at tier >= 2, so reading the punches
 * directly would show everyone but the reader as off. It exposes only the id
 * and the clock-in time, and already drops punches older than sixteen hours —
 * a forgotten clock-out is not a person still at their machine.
 */
async function fetchPresence(): Promise<Map<PersonId, number>> {
  const { data, error } = await getSupabase().from('chat_presence').select('*');
  // Presence is decoration on a directory that has to render either way: a
  // missing view (an environment where 0109 has not been applied) or a denied
  // read means "nobody is known to be on the clock", not a broken screen.
  if (error) {
    console.warn('[chat] presence read failed', error.message);
    return new Map();
  }
  const out = new Map<PersonId, number>();
  for (const row of (data ?? []) as Row[]) {
    const id = str(row.personId).trim();
    if (id) out.set(id, ms(row.since));
  }
  return out;
}

function toPerson(row: Row, presence: Map<PersonId, number>): Person | null {
  const id = str(row.id).trim();
  const name = str(row.name).trim();
  if (!id || !name) return null;
  if (/inactive|disabled|left/i.test(str(row.status))) return null;

  const positionId = str(row.positionId).trim() || undefined;
  // Directors are UK-based and never clock in — showing "Not clocked in" on
  // someone who was never expected to is meaningless, not just untrue.
  const director = isDirectorPosition(positionId);
  const since = director ? undefined : presence.get(id);
  return {
    id,
    name,
    role: str(row.role).trim() || str(row.department).trim() || 'Staff',
    initials: initialsOf(name),
    avatarTint: tintFromSeed(id),
    online: since != null,
    status: director ? '' : since ? `On shift · since ${clockOf(since)}` : 'Not clocked in',
    onShiftSince: since,
    email: str(row.email).trim() || undefined,
    phone: str(row.phone).trim() || undefined,
    department: str(row.department).trim() || undefined,
    location: str(row.location).trim() || undefined,
    positionId,
  };
}

/** Every active member of staff. `fs_employees` runs as owner, so this is the whole roster whatever the caller's position. */
export async function fetchDirectory(): Promise<Person[]> {
  const [staff, presence] = await Promise.all([
    getSupabase().from('fs_employees').select('*'),
    fetchPresence(),
  ]);
  if (staff.error) throw failed('directory', staff.error);
  return ((staff.data ?? []) as Row[])
    .map((row) => toPerson(row, presence))
    .filter((p): p is Person => !!p)
    .sort((a, b) => a.name.localeCompare(b.name));
}

export async function fetchGroupRights(): Promise<GroupRights> {
  const { data, error } = await getSupabase().from('my_chat_group_permissions').select('*').maybeSingle();
  if (error) throw failed('group rights', error);
  const row = (data ?? {}) as Row;
  return { create: row.can_create === true, manage: row.can_manage === true };
}

// --------------------------------------------------------------- threads

interface MemberRow {
  threadId: ThreadId;
  personId: PersonId;
  owner: boolean;
  pinned: boolean;
  muted: boolean;
  lastReadAt: number;
}

async function readMembers(): Promise<MemberRow[]> {
  const { data, error } = await getSupabase()
    .from('chat_members')
    .select('thread_id, person_id, member_role, pinned, muted, last_read_at, left_at');
  if (error) throw failed('chat members', error);
  return ((data ?? []) as Row[])
    .filter((r) => r.left_at == null)
    .map((r) => ({
      threadId: str(r.thread_id),
      personId: str(r.person_id),
      owner: str(r.member_role) === 'owner',
      pinned: r.pinned === true,
      muted: r.muted === true,
      lastReadAt: ms(r.last_read_at),
    }));
}

/** My threads, with membership folded in. Threads I have left are already gone — RLS drops them. */
export async function fetchThreads(): Promise<Thread[]> {
  const me = myId();
  const sb = getSupabase();

  const [threadRes, members] = await Promise.all([
    sb.from('chat_threads').select('id, kind, name, avatar_tint, created_by, created_at, updated_at'),
    readMembers(),
  ]);
  if (threadRes.error) throw failed('chat threads', threadRes.error);

  const byThread = new Map<ThreadId, MemberRow[]>();
  for (const m of members) {
    const list = byThread.get(m.threadId);
    if (list) list.push(m);
    else byThread.set(m.threadId, [m]);
  }

  return ((threadRes.data ?? []) as Row[])
    .map((r): Thread | null => {
      const id = str(r.id);
      const roster = byThread.get(id) ?? [];
      const mine = roster.find((m) => m.personId === me);
      // A thread whose membership row I cannot see is one I am not in; RLS
      // should already have hidden it, so this is belt-and-braces.
      if (!mine) return null;
      const kind = str(r.kind) === 'group' ? 'group' : 'dm';
      const memberIds = roster.filter((m) => m.personId !== me).map((m) => m.personId);
      // A dm whose other side has been deleted from `people` has nobody left
      // to name; the thread list renders that as the "not found" state.
      if (kind === 'dm' && memberIds.length === 0) return null;
      return {
        id,
        kind,
        memberIds,
        name: str(r.name).trim() || undefined,
        avatarTint: (str(r.avatar_tint).trim() || undefined) as Thread['avatarTint'],
        pinned: mine.pinned,
        muted: mine.muted,
        createdAt: ms(r.created_at) || ms(r.updated_at),
        ownerId: str(r.created_by).trim() || roster.find((m) => m.owner)?.personId,
      };
    })
    .filter((t): t is Thread => !!t);
}

// -------------------------------------------------------------- messages

/**
 * How far back a cold read goes, **per thread**. The thread list needs the
 * newest message of every conversation, and an open thread needs enough history
 * to scroll — a bounded read per thread covers both, and realtime keeps it
 * current from there. Ordered newest-first so the cap drops the OLDEST
 * messages, then flipped back.
 *
 * One window across every thread at once is what this used to be, and it
 * starves quiet conversations: once the workspace has more messages than the
 * cap, the busiest thread fills it and everything else reads as empty.
 */
const MESSAGE_WINDOW = 1000;

function toAttachment(r: Row): Attachment | undefined {
  const path = str(r.attachment_path).trim();
  if (!path) return undefined;
  const kind = str(r.attachment_kind);
  return {
    kind: kind === 'image' || kind === 'video' || kind === 'voice' ? kind : 'file',
    path,
    name: str(r.attachment_name).trim() || path.split('/').pop() || 'Attachment',
    mime: str(r.attachment_mime).trim() || 'application/octet-stream',
    size: num(r.attachment_size),
    width: r.attachment_width == null ? undefined : num(r.attachment_width),
    height: r.attachment_height == null ? undefined : num(r.attachment_height),
    duration: r.attachment_duration == null ? undefined : num(r.attachment_duration),
  };
}

/** Signed links for every attachment in one call. A path that fails simply renders without its media rather than failing the whole read. */
async function signAttachments(messages: Message[]): Promise<void> {
  const paths = [...new Set(messages.map((m) => m.attachment?.path).filter((p): p is string => !!p))];
  if (!paths.length) return;
  // An hour is longer than any single sitting with a thread open, and the
  // query refetches (and re-signs) well before it lapses.
  const { data, error } = await getSupabase().storage.from('chat-media').createSignedUrls(paths, 3600);
  if (error) {
    console.warn('[chat] could not sign attachment URLs', error);
    return;
  }
  const urlByPath = new Map<string, string>();
  for (const entry of data ?? []) {
    if (entry.signedUrl && entry.path) urlByPath.set(entry.path, entry.signedUrl);
  }
  for (const m of messages) {
    if (m.attachment) m.attachment.url = urlByPath.get(m.attachment.path);
  }
}

export async function fetchMessages(): Promise<Record<ThreadId, Message[]>> {
  const me = myId();
  const sb = getSupabase();

  const members = await readMembers();
  const myThreads = [...new Set(members.filter((m) => m.personId === me).map((m) => m.threadId))];

  const [reactRes, msgResults] = await Promise.all([
    sb.from('chat_reactions').select('message_id, person_id, emoji'),
    Promise.all(
      myThreads.map((threadId) =>
        sb
          .from('chat_messages')
          .select('*')
          .eq('thread_id', threadId)
          .order('sent_at', { ascending: false })
          .limit(MESSAGE_WINDOW),
      ),
    ),
  ]);
  for (const res of msgResults) if (res.error) throw failed('chat messages', res.error);
  if (reactRes.error) throw failed('chat reactions', reactRes.error);

  // messageId → emoji → who
  const reactions = new Map<string, Map<string, PersonId[]>>();
  for (const r of ((reactRes.data ?? []) as Row[])) {
    const messageId = str(r.message_id);
    const byEmoji = reactions.get(messageId) ?? new Map<string, PersonId[]>();
    const emoji = str(r.emoji);
    byEmoji.set(emoji, [...(byEmoji.get(emoji) ?? []), str(r.person_id)]);
    reactions.set(messageId, byEmoji);
  }

  // The earliest point everyone *else* in a thread has read up to. My own
  // message counts as read once it is behind that line.
  const readFloor = new Map<ThreadId, number>();
  for (const m of members) {
    if (m.personId === me) continue;
    const current = readFloor.get(m.threadId);
    readFloor.set(m.threadId, current == null ? m.lastReadAt : Math.min(current, m.lastReadAt));
  }

  const out: Record<ThreadId, Message[]> = {};
  for (const t of myThreads) out[t] = [];

  const flat: Message[] = [];
  for (const r of msgResults.flatMap((res) => (res.data ?? []) as Row[])) {
    const threadId = str(r.thread_id);
    const id = str(r.id);
    const authorId = str(r.author_id);
    const deleted = r.deleted === true;
    const at = ms(r.sent_at);
    const message: Message = {
      id,
      threadId,
      authorId,
      text: deleted ? '' : str(r.body),
      at,
      replyTo: str(r.reply_to).trim() || undefined,
      attachment: deleted ? undefined : toAttachment(r),
      reactions: deleted
        ? []
        : [...(reactions.get(id) ?? new Map<string, PersonId[]>())].map(([emoji, by]) => ({ emoji, by })),
      deleted: deleted || undefined,
      read: authorId === me ? at <= (readFloor.get(threadId) ?? 0) : undefined,
    };
    (out[threadId] ??= []).push(message);
    flat.push(message);
  }

  await signAttachments(flat);

  // The query came back newest-first so the window kept the newest; the view
  // renders oldest-first.
  for (const list of Object.values(out)) list.sort((a, b) => a.at - b.at);
  return out;
}

/**
 * Unread per thread — messages after my `last_read_at` that somebody else
 * sent.
 *
 * Its own read rather than a count derived from `fetchMessages`, because the
 * two are separate queries with separate lifetimes: opening a thread marks it
 * read and has to re-count without re-fetching every message body. Only four
 * columns come back, so the same per-thread window costs a fraction of the one
 * above.
 */
export async function fetchUnread(): Promise<Record<ThreadId, number>> {
  const me = myId();
  const sb = getSupabase();

  const members = await readMembers();
  const mine = new Map<ThreadId, number>();
  for (const m of members) if (m.personId === me) mine.set(m.threadId, m.lastReadAt);

  const msgResults = await Promise.all(
    [...mine.keys()].map((threadId) =>
      sb
        .from('chat_messages')
        .select('thread_id, author_id, sent_at, deleted')
        .eq('thread_id', threadId)
        .order('sent_at', { ascending: false })
        .limit(MESSAGE_WINDOW),
    ),
  );
  for (const res of msgResults) if (res.error) throw failed('chat unread', res.error);

  const counts: Record<ThreadId, number> = {};
  for (const t of mine.keys()) counts[t] = 0;
  for (const r of msgResults.flatMap((res) => (res.data ?? []) as Row[])) {
    const threadId = str(r.thread_id);
    if (!mine.has(threadId)) continue;
    if (str(r.author_id) === me || r.deleted === true) continue;
    if (ms(r.sent_at) > (mine.get(threadId) ?? 0)) counts[threadId] += 1;
  }
  return counts;
}
