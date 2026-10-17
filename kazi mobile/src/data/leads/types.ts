/** One Instagram/Messenger DM conversation, as `meta-dm-bot`'s `/dashboard/leads` returns it. */

export type LeadConvoId = string;

export type ValueTier = 'high' | 'medium' | 'low';

export interface LeadValue {
  score: number | null;
  tier: ValueTier | null;
  reasons: string[];
}

export interface LeadLastMessage {
  role: 'user' | 'assistant';
  content: string | null;
  mediaType: string | null;
  createdAt: string;
}

export interface Lead {
  convo: LeadConvoId;
  platform: string;
  name: string | null;
  profilePic: string | null;
  referral: string | null;
  mutedUntil: number;
  /** The bot is silenced on this thread — a human (or nobody, once the handoff window lapses) is expected to answer. */
  isMuted: boolean;
  value: LeadValue;
  lastMessage: LeadLastMessage;
}

export interface LeadReplyPreview {
  id: number;
  content: string;
  mediaType: string | null;
}

/** One message inside a lead's conversation, oldest first. */
export interface LeadMessage {
  id: number;
  role: 'user' | 'assistant';
  content: string | null;
  media_type: string | null;
  media_path: string | null;
  referral: string | null;
  reply_to_mid: string | null;
  mid: string | null;
  created_at: string;
  /** A short-lived signed URL, resolved server-side — absent until the media loads or after the link lapses. */
  mediaUrl?: string;
  replyTo?: LeadReplyPreview;
}
