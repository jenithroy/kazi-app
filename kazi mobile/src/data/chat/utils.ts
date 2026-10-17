import { useEffect, useState } from 'react';

import type { AvatarTint } from '@/components/ui/avatar';

import { isMe, myId, personFor } from './identity';
import type { Message, Thread } from './types';

const DAY = 86_400_000;

export { isMe, myId, personFor } from './identity';

/** First name only — group bubbles and typing lines have no room for the rest. */
export function firstName(id: string): string {
  return personFor(id).name.split(' ')[0];
}

export function threadTitle(thread: Thread): string {
  if (thread.kind === 'group') return thread.name ?? 'Group';
  return personFor(thread.memberIds[0]).name;
}

export function threadInitials(thread: Thread): string {
  if (thread.kind === 'dm') return personFor(thread.memberIds[0]).initials;
  const words = (thread.name ?? 'Group').split(/\s+/).filter(Boolean);
  return (words.length > 1 ? words[0][0] + words[1][0] : (thread.name ?? 'G').slice(0, 2)).toUpperCase();
}

export function threadTint(thread: Thread): AvatarTint {
  return thread.kind === 'dm' ? personFor(thread.memberIds[0]).avatarTint : (thread.avatarTint ?? 'dark');
}

/** The uppercase mono line beside the name: a dm shows the person's job, a group its size. */
export function threadRole(thread: Thread): string {
  if (thread.kind === 'dm') return personFor(thread.memberIds[0]).role;
  return `Group · ${thread.memberIds.length + 1}`;
}

/** The presence line under the title in the thread header. */
export function threadStatus(thread: Thread): string {
  if (thread.kind === 'dm') return personFor(thread.memberIds[0]).status;
  const online = thread.memberIds.filter((id) => personFor(id).online).length;
  return `${thread.memberIds.length + 1} members · ${online} on shift`;
}

/** A group counts as online while anyone in it is. */
export function threadOnline(thread: Thread): boolean {
  return thread.memberIds.some((id) => personFor(id).online);
}

export function threadMemberNames(thread: Thread): string {
  return [personFor(myId()).name, ...thread.memberIds.map((id) => personFor(id).name)].join(', ');
}

function startOfDay(ms: number): number {
  const d = new Date(ms);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

/** 0 = today, 1 = yesterday, and so on. */
function daysAgo(ms: number): number {
  return Math.round((startOfDay(Date.now()) - startOfDay(ms)) / DAY);
}

function clockOf(ms: number): string {
  const d = new Date(ms);
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

function dateOf(ms: number): string {
  const d = new Date(ms);
  return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
}

/**
 * Re-renders the caller on a slow timer, so the stamps below stop reading
 * "Just now" a quarter of an hour later. Half the shortest stamp's lifetime,
 * which is all the resolution a relative time needs.
 */
export function useTimeTick(everyMs = 30_000): void {
  const [, tick] = useState(0);
  useEffect(() => {
    const timer = setInterval(() => tick((n) => n + 1), everyMs);
    return () => clearInterval(timer);
  }, [everyMs]);
}

/** Thread-list stamp — short, because it sits in a narrow right column. */
export function listTime(ms: number): string {
  if (Date.now() - ms < 60_000) return 'Just now';
  const days = daysAgo(ms);
  if (days === 0) return clockOf(ms);
  if (days === 1) return 'Yesterday';
  return dateOf(ms);
}

/** Day separator inside a thread. */
export function dayLabel(ms: number): string {
  const days = daysAgo(ms);
  if (days === 0) return 'Today';
  if (days === 1) return 'Yesterday';
  const d = new Date(ms);
  return d.toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' });
}

/** The line under a bubble: the clock, plus a receipt on own messages. */
export function messageMeta(message: Message): string {
  const days = daysAgo(message.at);
  const stamp = days === 0 ? clockOf(message.at) : `${dayLabel(message.at)} ${clockOf(message.at)}`;
  if (!isMe(message.authorId) || message.deleted) return stamp;
  if (message.pending) return `${stamp} · Sending…`;
  return `${stamp} · ${message.read ? 'Read' : 'Sent'}`;
}

/** Long form for the message-info block on the long-press sheet. */
export function messageTimestamp(message: Message): string {
  return `${dayLabel(message.at)} at ${clockOf(message.at)}`;
}

const ATTACHMENT_LABEL: Record<string, string> = { image: 'Photo', video: 'Video', file: 'File', voice: 'Voice note' };

/** What an attachment reads as where there is no room to render it — previews, copies, quotes. */
export function attachmentLabel(message: Message): string {
  if (!message.attachment) return '';
  return ATTACHMENT_LABEL[message.attachment.kind] ?? 'File';
}

export function messageText(message: Message): string {
  if (message.deleted) return 'This message was deleted';
  if (message.text) return message.text;
  if (message.attachment) return `${attachmentLabel(message)} · ${message.attachment.name}`;
  return '';
}

/** Human file size for the attachment tile — 1 decimal, and never "0.0 KB". */
export function fileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/** `mm:ss` for a video's duration, from milliseconds. */
export function clipLength(ms: number): string {
  const total = Math.round(ms / 1000);
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, '0')}`;
}

/** `mm:ss` from seconds — the voice recorder and player read elapsed time this way, not in milliseconds. */
export function clipTime(seconds: number): string {
  const total = Math.max(0, Math.round(seconds));
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, '0')}`;
}

/** Thread-list preview. Groups get a sender prefix so an unread row says *who* is waiting on you. */
export function previewOf(thread: Thread, last: Message | undefined): string {
  if (thread.preview) return thread.preview;
  if (!last) return 'No messages yet';
  const body = messageText(last);
  if (isMe(last.authorId)) return `You: ${body}`;
  if (thread.kind === 'group') return `${firstName(last.authorId)}: ${body}`;
  return body;
}

export interface DayGroup {
  key: string;
  label: string;
  items: Message[];
}

/** Splits a thread into day sections, so the view renders one separator per day instead of a hardcoded "Today". */
export function groupByDay(messages: Message[]): DayGroup[] {
  const groups: DayGroup[] = [];
  for (const m of messages) {
    const key = String(startOfDay(m.at));
    const last = groups[groups.length - 1];
    if (last?.key === key) last.items.push(m);
    else groups.push({ key, label: dayLabel(m.at), items: [m] });
  }
  return groups;
}

export function reactionCount(message: Message): number {
  return message.reactions.reduce((n, r) => n + r.by.length, 0);
}

/** Pinned first, then most recent. An empty new conversation falls back to when it was created. */
export function sortThreads(threads: Thread[], lastAt: Record<string, number>): Thread[] {
  const rank = (t: Thread) => Math.max(lastAt[t.id] ?? 0, t.createdAt ?? 0);
  return [...threads].sort((a, b) => {
    if (!!a.pinned !== !!b.pinned) return a.pinned ? -1 : 1;
    return rank(b) - rank(a);
  });
}
