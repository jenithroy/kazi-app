/**
 * Live writer for Chat.
 *
 * Deliberately NOT wrapped in `liveWrite`. Everywhere else a refused write
 * falls back to the mock so the screen stays coherent; a chat cannot do that —
 * a message that "sent" into an in-memory store is a message the recipient
 * will never see, and the sender has no way to tell. So a failure throws, the
 * optimistic bubble rolls back, and the draft comes back to be retried.
 *
 * Starting and reshaping a conversation goes through the three RPCs added in
 * `0106_chat_rpcs.sql` rather than raw inserts: creating a thread is two
 * writes, and doing them from here would leave a thread with no members
 * behind whenever the second one failed.
 */

import { getSupabase } from '@/lib/supabase';
import { str } from '@/lib/data/normalise';

import { myId } from './identity';
import type { Attachment, Message, MessageId, PersonId, Thread, ThreadId } from './types';

function check(where: string, error: { message: string; code?: string } | null): void {
  if (error) throw new Error(`${where}: ${error.message}${error.code ? ` [${error.code}]` : ''}`);
}

/** Mark my membership row as caught up. Called after I post, so my own message never counts as unread against me. */
async function touchRead(threadId: ThreadId): Promise<void> {
  await getSupabase()
    .from('chat_members')
    .update({ last_read_at: new Date().toISOString() })
    .eq('thread_id', threadId)
    .eq('person_id', myId());
}

export async function sendMessage(
  threadId: ThreadId,
  text: string,
  replyTo?: MessageId,
  attachment?: Attachment,
): Promise<Message> {
  const sentAt = new Date().toISOString();
  const { data, error } = await getSupabase()
    .from('chat_messages')
    .insert({
      thread_id: threadId,
      author_id: myId(),
      body: text,
      reply_to: replyTo ?? null,
      sent_at: sentAt,
      attachment_path: attachment?.path ?? null,
      attachment_kind: attachment?.kind ?? null,
      attachment_name: attachment?.name ?? null,
      attachment_mime: attachment?.mime ?? null,
      attachment_size: attachment?.size ?? null,
      attachment_width: attachment?.width ?? null,
      attachment_height: attachment?.height ?? null,
      attachment_duration: attachment?.duration ?? null,
    })
    .select('id, sent_at')
    .single();
  check('send message', error);

  await touchRead(threadId);
  const row = (data ?? {}) as Record<string, unknown>;
  return {
    id: str(row.id),
    threadId,
    authorId: myId(),
    text,
    at: Date.parse(str(row.sent_at, sentAt)),
    replyTo,
    attachment,
    reactions: [],
  };
}

/**
 * Add my reaction, or take it back if it was already there.
 *
 * The delete runs first and its row count decides: if it removed something I
 * had reacted, and we are done. That is one round trip in the common "undo"
 * case and two in the "react" case, and — unlike reading first — it cannot
 * double-insert when the same emoji is tapped twice quickly.
 */
export async function toggleReaction(_threadId: ThreadId, messageId: MessageId, emoji: string): Promise<void> {
  const sb = getSupabase();
  const removed = await sb
    .from('chat_reactions')
    .delete()
    .eq('message_id', messageId)
    .eq('person_id', myId())
    .eq('emoji', emoji)
    .select('emoji');
  check('remove reaction', removed.error);
  if ((removed.data ?? []).length > 0) return;

  const { error } = await sb
    .from('chat_reactions')
    .insert({ message_id: messageId, person_id: myId(), emoji });
  check('react', error);
}

/**
 * Tombstone, never remove: a reply pointing at a deleted message still has to
 * resolve to something. The attachment columns are cleared with the body, so
 * the storage object stops being reachable through the thread.
 *
 * The file itself is deleted too. Clearing the column alone would leave the
 * bytes in the bucket for ever with nothing left pointing at them, which is
 * exactly the storage nobody notices paying for. Storage's own policy allows
 * this only for the uploader, which is the same person the row filter below
 * allows to delete the message.
 */
export async function deleteMessages(_threadId: ThreadId, ids: MessageId[]): Promise<void> {
  if (!ids.length) return;

  const attachments = await getSupabase()
    .from('chat_messages')
    .select('attachment_path')
    .in('id', ids)
    .eq('author_id', myId())
    .not('attachment_path', 'is', null);
  const paths = ((attachments.data ?? []) as Record<string, unknown>[])
    .map((r) => str(r.attachment_path))
    .filter(Boolean);

  const { error } = await getSupabase()
    .from('chat_messages')
    .update({
      deleted: true,
      body: '',
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
    .in('id', ids)
    .eq('author_id', myId());
  check('delete messages', error);

  // After the row, so a refused storage delete cannot leave a message still
  // pointing at a file that is gone. A leftover object is untidy; a bubble
  // with a broken tile is a bug somebody reports.
  if (paths.length) {
    const removed = await getSupabase().storage.from('chat-media').remove(paths);
    if (removed.error) console.warn('[chat] attachment left in storage', removed.error);
  }
}

/**
 * Read / unread, expressed as where my read line sits.
 *
 * "Mark unread" puts the line just before the newest message somebody else
 * sent, which is the only definition that makes the badge show 1 rather than
 * a number invented for the occasion.
 */
export async function setThreadRead(threadId: ThreadId, read: boolean): Promise<void> {
  const sb = getSupabase();
  let lastReadAt = new Date().toISOString();

  if (!read) {
    const { data } = await sb
      .from('chat_messages')
      .select('sent_at')
      .eq('thread_id', threadId)
      .neq('author_id', myId())
      .order('sent_at', { ascending: false })
      .limit(1);
    const newest = (data ?? [])[0] as { sent_at?: string } | undefined;
    lastReadAt = newest?.sent_at ? new Date(Date.parse(newest.sent_at) - 1).toISOString() : new Date(0).toISOString();
  }

  const { error } = await sb
    .from('chat_members')
    .update({ last_read_at: lastReadAt })
    .eq('thread_id', threadId)
    .eq('person_id', myId());
  check('mark read', error);
}

export async function setThreadFlag(threadId: ThreadId, flag: 'pinned' | 'muted', value: boolean): Promise<void> {
  const { error } = await getSupabase()
    .from('chat_members')
    .update({ [flag]: value })
    .eq('thread_id', threadId)
    .eq('person_id', myId());
  check(`set ${flag}`, error);
}

/**
 * Leave, rather than delete.
 *
 * "Delete conversation" takes it off MY list. The other side keeps every
 * message, because one person tidying their inbox must not be able to erase a
 * shared record — and because re-opening the dm later brings the history back
 * instead of starting a blank second thread.
 */
export async function deleteThread(threadId: ThreadId): Promise<void> {
  const { error } = await getSupabase()
    .from('chat_members')
    .update({ left_at: new Date().toISOString() })
    .eq('thread_id', threadId)
    .eq('person_id', myId());
  check('leave conversation', error);
}

async function threadById(id: ThreadId): Promise<Thread> {
  const { data, error } = await getSupabase()
    .from('chat_threads')
    .select('id, kind, name, avatar_tint, created_by, created_at')
    .eq('id', id)
    .single();
  check('read thread', error);
  const row = (data ?? {}) as Record<string, unknown>;
  const members = await getSupabase()
    .from('chat_members')
    .select('person_id, left_at')
    .eq('thread_id', id);
  check('read members', members.error);

  return {
    id,
    kind: str(row.kind) === 'group' ? 'group' : 'dm',
    name: str(row.name).trim() || undefined,
    avatarTint: (str(row.avatar_tint).trim() || undefined) as Thread['avatarTint'],
    memberIds: ((members.data ?? []) as Record<string, unknown>[])
      .filter((m) => m.left_at == null && str(m.person_id) !== myId())
      .map((m) => str(m.person_id)),
    createdAt: Date.parse(str(row.created_at)) || Date.now(),
    ownerId: str(row.created_by).trim() || undefined,
  };
}

export async function createDm(personId: PersonId): Promise<Thread> {
  const { data, error } = await getSupabase().rpc('chat_start_dm', { p_other: personId });
  check('start conversation', error);
  return threadById(str(data));
}

export async function createGroup(name: string, memberIds: PersonId[]): Promise<Thread> {
  const { data, error } = await getSupabase().rpc('chat_create_group', { p_name: name, p_members: memberIds });
  check('create group', error);
  return threadById(str(data));
}

export async function updateGroup(threadId: ThreadId, name: string, memberIds: PersonId[]): Promise<void> {
  const { error } = await getSupabase().rpc('chat_update_group', {
    p_thread: threadId,
    p_name: name,
    p_members: memberIds,
  });
  check('save group', error);
}
