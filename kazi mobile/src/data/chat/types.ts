import type { AvatarTint } from '@/components/ui/avatar';

export type PersonId = string;
export type ThreadId = string;
export type MessageId = string;

export interface Person {
  id: PersonId;
  name: string;
  role: string;
  initials: string;
  avatarTint: AvatarTint;
  /** Clocked in and not yet clocked out — the real punch, not the roster. */
  online: boolean;
  status: string;
  email?: string;
  /** Epoch ms of the clock-in they are still on, when they are on one. */
  onShiftSince?: number;
  /** The rest of the profile card. All RLS-gated on `fs_employees`, so any of them can be absent. */
  phone?: string;
  department?: string;
  location?: string;
  /** `positions.id` — a director never clocks in, so `status`/`onShiftSince` are suppressed rather than computed. */
  positionId?: string;
}

export interface Reaction {
  emoji: string;
  /** Everyone who reacted, so a chip can show a count and whether it's mine. */
  by: PersonId[];
}

export type AttachmentKind = 'image' | 'video' | 'file' | 'voice';

/**
 * One file on a message. `path` is an object in the private `chat-media`
 * bucket; `url` is a signed link resolved when the thread is read, and is
 * absent until then (and again once the signature expires).
 */
export interface Attachment {
  kind: AttachmentKind;
  path: string;
  name: string;
  mime: string;
  size: number;
  width?: number;
  height?: number;
  /** Milliseconds — video or voice only. */
  duration?: number;
  url?: string;
}

export interface Message {
  id: MessageId;
  threadId: ThreadId;
  /** A `people.id`. Compare with `isMe` rather than a constant. */
  authorId: PersonId;
  text: string;
  /** Epoch ms. Every timestamp on screen is derived from this — nothing is stored pre-formatted. */
  at: number;
  replyTo?: MessageId;
  reactions: Reaction[];
  attachment?: Attachment;
  /** Own messages only — whether everyone else in the thread has read it. */
  read?: boolean;
  deleted?: boolean;
  /** Set while an optimistic message is still in flight. */
  pending?: boolean;
}

export type ThreadKind = 'dm' | 'group';

export interface Thread {
  id: ThreadId;
  kind: ThreadKind;
  /** Everyone but the signed-in user. A dm has exactly one. */
  memberIds: PersonId[];
  /** Groups only — a dm takes its title from the other member. */
  name?: string;
  /** Groups only — a dm takes its tint from the other member. */
  avatarTint?: AvatarTint;
  pinned?: boolean;
  muted?: boolean;
  /** Set when the thread is created, so a brand-new empty conversation still sorts near the top. */
  createdAt?: number;
  /** Whoever started a group — shown in the members list, grants nothing. */
  ownerId?: PersonId;
  /** A deleted/removed thread — still listed, but opening it lands on the not-found state instead of messages. */
  missing?: boolean;
  /** Only set for a missing thread, whose preview and stamp can't be derived from its (absent) messages. */
  preview?: string;
  previewTime?: string;
  ref?: string;
}

export type ChatView = 'list' | 'thread';

/** What the signed-in person's position lets them do to groups. */
export interface GroupRights {
  create: boolean;
  manage: boolean;
}

/** Offered first on the long-press sheet, above the full picker. */
export const QUICK_REACTIONS = ['👍', '❤️', '😂', '🎉', '✅', '🙏'] as const;
