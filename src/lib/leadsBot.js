/**
 * Client for the Instagram DM bot's dashboard API (meta-dm-bot/app/dashboard.py).
 *
 * That service is a separate Python app, not part of this build, reachable
 * over plain HTTPS rather than through the Supabase client. It checks the
 * same session token every Supabase query here already carries, so signing
 * in once covers both.
 */

import { getSupabaseAccessToken } from "../supabase";

const BASE_URL = (import.meta.env.VITE_DM_BOT_URL || "").replace(/\/+$/, "");

async function call(path, options = {}) {
  if (!BASE_URL) {
    throw new Error("The lead inbox isn't configured yet (VITE_DM_BOT_URL is missing).");
  }
  const token = await getSupabaseAccessToken();
  if (!token) throw new Error("Sign in to use the lead inbox.");

  // FormData sets its own Content-Type (with the multipart boundary) — the
  // browser can only do that correctly if we don't set one ourselves.
  const isFormData = options.body instanceof FormData;
  const res = await fetch(`${BASE_URL}${path}`, {
    ...options,
    headers: {
      ...(isFormData ? {} : { "Content-Type": "application/json" }),
      Authorization: `Bearer ${token}`,
      ...(options.headers || {}),
    },
  });

  if (!res.ok) {
    let message = `That didn't work (${res.status}).`;
    try {
      const body = await res.json();
      if (typeof body?.detail === "string") message = body.detail;
    } catch {
      // Non-JSON error body (a gateway timeout page, etc.) — the generic message stands.
    }
    throw new Error(message);
  }
  if (res.status === 204) return null;
  return res.json();
}

/** Every conversation, most recently active first. */
export const fetchLeads = () => call("/dashboard/leads");

/** Full history for one conversation, oldest first. */
export const fetchLeadMessages = (convo) => call(`/dashboard/leads/${encodeURIComponent(convo)}/messages`);

/** Send a text reply via Instagram and log it — mutes the bot on this thread. */
export const sendLeadReply = (convo, text) =>
  call(`/dashboard/leads/${encodeURIComponent(convo)}/reply`, {
    method: "POST",
    body: JSON.stringify({ text }),
  });

/** Take over a conversation (mute the bot) or hand it back (unmute). */
export const setLeadTakeover = (convo, muted) =>
  call(`/dashboard/leads/${encodeURIComponent(convo)}/takeover`, {
    method: "POST",
    body: JSON.stringify({ muted }),
  });

/** Send an image or a recorded voice note via Instagram — mutes the bot, same as a text reply. */
export const sendLeadAttachment = (convo, file) => {
  const form = new FormData();
  form.append("file", file, file.name || "attachment");
  return call(`/dashboard/leads/${encodeURIComponent(convo)}/attachment`, {
    method: "POST",
    body: form,
  });
};
