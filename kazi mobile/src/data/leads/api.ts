/**
 * Client for `meta-dm-bot`'s dashboard API (`meta-dm-bot/app/dashboard.py`).
 *
 * That service is a separate Python app — not part of this build, not
 * Supabase — reachable over plain HTTPS. It checks the same Supabase session
 * token every other request in this app already carries (against this same
 * project's `my_permissions` / `my_messenger_tabs` views), so signing in once
 * covers both; there is no separate login or API key to manage here.
 *
 * Mirrors the web app's `src/lib/leadsBot.js` client 1:1 — same routes, same
 * error shape — so the two stay easy to compare.
 */

import { getSupabaseAccessToken } from '@/lib/supabase';

import type { Lead, LeadConvoId, LeadMessage } from './types';

const BASE_URL = (process.env.EXPO_PUBLIC_DM_BOT_URL ?? '').replace(/\/+$/, '');

export const isLeadsBotConfigured = Boolean(BASE_URL);

/** A local file about to go up as a lead's photo or voice-note reply. */
export interface LeadUploadFile {
  uri: string;
  name: string;
  mime: string;
}

async function call<T>(path: string, options: { method?: string; body?: unknown; isFormData?: boolean } = {}): Promise<T> {
  if (!BASE_URL) {
    throw new Error("The lead inbox isn't configured yet (EXPO_PUBLIC_DM_BOT_URL is missing).");
  }
  const token = await getSupabaseAccessToken();
  if (!token) throw new Error('Sign in to use the lead inbox.');

  const res = await fetch(`${BASE_URL}${path}`, {
    method: options.method ?? 'GET',
    body: options.body as BodyInit | undefined,
    headers: {
      ...(options.isFormData ? {} : options.body ? { 'Content-Type': 'application/json' } : {}),
      Authorization: `Bearer ${token}`,
    },
  });

  if (!res.ok) {
    let message = `That didn't work (${res.status}).`;
    try {
      const body = await res.json();
      if (typeof body?.detail === 'string') message = body.detail;
    } catch {
      // Non-JSON error body (a gateway timeout page, etc.) — the generic message stands.
    }
    throw new Error(message);
  }
  if (res.status === 204) return null as T;
  return res.json() as Promise<T>;
}

/** Every conversation, most recently active first. */
export const fetchLeads = (): Promise<Lead[]> => call('/dashboard/leads');

/** Full history for one conversation, oldest first. */
export const fetchLeadMessages = (convo: LeadConvoId): Promise<LeadMessage[]> =>
  call(`/dashboard/leads/${encodeURIComponent(convo)}/messages`);

/** Send a text reply via Instagram and log it — mutes the bot on this thread. */
export const sendLeadReply = (convo: LeadConvoId, text: string): Promise<void> =>
  call(`/dashboard/leads/${encodeURIComponent(convo)}/reply`, { method: 'POST', body: JSON.stringify({ text }) });

/** Take over a conversation (mute the bot) or hand it back (unmute). */
export const setLeadTakeover = (convo: LeadConvoId, muted: boolean): Promise<void> =>
  call(`/dashboard/leads/${encodeURIComponent(convo)}/takeover`, { method: 'POST', body: JSON.stringify({ muted }) });

/** Send an image or a recorded voice note via Instagram — mutes the bot, same as a text reply. */
export const sendLeadAttachment = (convo: LeadConvoId, file: LeadUploadFile): Promise<void> => {
  const form = new FormData();
  // React Native's FormData accepts this `{ uri, name, type }` shape in place
  // of a Blob for a local file — the RN bridge streams it from disk itself.
  form.append('file', { uri: file.uri, name: file.name, type: file.mime } as unknown as Blob);
  return call(`/dashboard/leads/${encodeURIComponent(convo)}/attachment`, { method: 'POST', body: form, isFormData: true });
};
