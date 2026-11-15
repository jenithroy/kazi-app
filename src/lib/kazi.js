/**
 * Kazi, the assistant in the chat list: what the browser does for it. (The thinking is the Worker's: worker/lib/kazi.js.)
 *
 *   askKazi(messages, { onStatus, signal })   sends the conversation, hands the progress lines ("Checking the orders…") to onStatus as they
 *                                             come, and resolves with the answer: `{ text, lookups, saved }`. Throws an Error whose message
 *                                             is something to show a person.
 *   fetchKaziHistory()                        the person's earlier questions and answers (what the Worker saved), oldest first.
 *
 * The session token goes along, as it does for every Worker route (lib/workerApi.js): the Worker checks it against the database itself, so
 * Kazi sees only what this person's role may see. Kazi cannot change anything; there is no write in this file.
 */
import { supabase, getSupabaseAccessToken } from "../supabase";

/** The id Kazi's row and pane go by inside the chat window. A conversation's own id is a uuid, so this can never equal one. */
export const KAZI_ID = "kazi";

/** What the empty chat offers, in the words a person would type. */
export const SUGGESTIONS = [
  "What is late?",
  "What needs reordering?",
  "Who owes us money?",
  "Who is in today?",
  "What is due this week?",
];

/** Which part of the business each lookup is about, in words a person would use. */
const ABOUT = {
  orders_overview: "orders",
  list_orders: "orders",
  get_order: "orders",
  list_stock: "stock",
  get_stock_item: "stock",
  money_owed: "what customers owe",
  attendance_today: "attendance",
  list_tasks: "tasks",
};

/** "orders, stock" from the lookups an answer used: names as the Worker sent them live, or `{ tool }` objects as it saved them. */
export function lookedAt(lookups) {
  const names = (lookups || []).map((l) => (typeof l === "string" ? l : l?.tool));
  return [...new Set(names.map((n) => ABOUT[n]).filter(Boolean))];
}

export async function fetchKaziHistory(limit = 60) {
  const { data, error } = await supabase
    .from("kazi_messages")
    .select("id, seq, role, content, lookups, created_at")
    .order("seq", { ascending: false })
    .limit(limit);
  if (error) throw new Error(`Earlier chats with Kazi could not be loaded (${error.message}).`);
  return (data || []).reverse().map((r) => ({
    id: String(r.id),
    role: r.role,
    text: r.content,
    at: Date.parse(r.created_at) || 0,
    lookups: Array.isArray(r.lookups) ? r.lookups : [],
  }));
}

export async function askKazi(messages, { onStatus, signal } = {}) {
  const token = await getSupabaseAccessToken();
  if (!token) throw new Error("Sign in to use Kazi.");

  let res;
  try {
    res = await fetch("/api/kazi/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({ messages }),
      signal,
    });
  } catch (err) {
    if (err?.name === "AbortError") throw err;
    throw new Error("Could not reach the server. Check your connection and try again.");
  }

  // Anything that is not the stream of answer lines is an ordinary JSON failure (not signed in, no permission, not switched on, ...),
  // or the page's own HTML when the Worker has not been updated with Kazi yet.
  if (!res.ok || !(res.headers.get("content-type") || "").includes("ndjson")) {
    let json = null;
    try { json = await res.json(); } catch { /* not JSON: said below */ }
    if (typeof json?.error === "string") throw new Error(json.error);
    throw new Error(res.ok ? "Kazi's answer could not be read. Has the server been updated with Kazi?" : `That didn't work (${res.status}).`);
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let answer = null;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      buffer += decoder.decode(value || new Uint8Array(), { stream: !done });
      let at;
      while ((at = buffer.indexOf("\n")) >= 0) {
        const line = buffer.slice(0, at).trim();
        buffer = buffer.slice(at + 1);
        if (!line) continue;
        let event;
        try { event = JSON.parse(line); } catch { continue; }        // a half line cannot happen (lines end at "\n"), a stray one is skipped
        if (event.type === "status") onStatus?.(event.text);
        else if (event.type === "answer") answer = { text: String(event.text || ""), lookups: event.lookups || [], saved: event.saved !== false };
        else if (event.type === "error") throw Object.assign(new Error(event.message || "Kazi ran into a problem."), { said: true });
        // ({"type":"ping"} lines, and any kind this file does not know, are just ignored)
      }
      if (done) break;
    }
  } catch (err) {
    // The server's own words (an "error" line) and a deliberate Stop pass through; anything else is the connection failing in the middle
    // of the answer, which the browser words as "network error" or "Load failed".
    if (err?.name === "AbortError" || err?.said) throw err;
    throw new Error("The connection dropped while Kazi was answering. Try again.");
  }
  if (!answer) throw new Error("Kazi stopped before answering. Try again.");
  return answer;
}
