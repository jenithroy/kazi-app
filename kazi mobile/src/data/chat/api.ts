/**
 * Data-source selector for Chat.
 *   reads  → Supabase when configured (a failed read throws; no mock fallback)
 *   writes → Supabase when configured, with NO mock mirror
 *
 * Writes skip `liveWrite` on purpose, for the same reason the Admin Panel's
 * do. Elsewhere a refused write falls back to the mock so the screen stays
 * coherent; here that would show a sent message the recipient will never
 * receive, and the sender would have no way to know. A refusal surfaces, the
 * optimistic bubble rolls back, and the draft returns to the composer.
 */

import { isSupabaseConfigured } from '@/lib/supabase';
import { liveRead } from '@/lib/supabase/read';

import * as live from './supabase';
import * as writeLive from './supabase-write';
import * as mock from './mock-api';

export const fetchDirectory = isSupabaseConfigured
  ? liveRead('chat-directory', live.fetchDirectory)
  : mock.fetchDirectory;
export const fetchGroupRights = isSupabaseConfigured
  ? liveRead('chat-group-rights', live.fetchGroupRights)
  : mock.fetchGroupRights;
export const fetchThreads = isSupabaseConfigured ? liveRead('chat-threads', live.fetchThreads) : mock.fetchThreads;
export const fetchMessages = isSupabaseConfigured ? liveRead('chat-messages', live.fetchMessages) : mock.fetchMessages;
export const fetchUnread = isSupabaseConfigured ? liveRead('chat-unread', live.fetchUnread) : mock.fetchUnread;

export const sendMessage = isSupabaseConfigured ? writeLive.sendMessage : mock.sendMessage;
export const toggleReaction = isSupabaseConfigured ? writeLive.toggleReaction : mock.toggleReaction;
export const deleteMessages = isSupabaseConfigured ? writeLive.deleteMessages : mock.deleteMessages;
export const setThreadRead = isSupabaseConfigured ? writeLive.setThreadRead : mock.setThreadRead;
export const setThreadFlag = isSupabaseConfigured ? writeLive.setThreadFlag : mock.setThreadFlag;
export const deleteThread = isSupabaseConfigured ? writeLive.deleteThread : mock.deleteThread;
export const createDm = isSupabaseConfigured ? writeLive.createDm : mock.createDm;
export const createGroup = isSupabaseConfigured ? writeLive.createGroup : mock.createGroup;
export const updateGroup = isSupabaseConfigured ? writeLive.updateGroup : mock.updateGroup;
