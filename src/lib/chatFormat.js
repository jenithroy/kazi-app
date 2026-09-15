/**
 * Presentation helpers for Chat, plus the "who is everyone" registry they read.
 *
 * Ported from the mobile app's `src/data/chat/utils.ts` and `identity.ts`. The
 * registry is here for the same reason it is there: nearly every helper below
 * needs the signed-in person's id and the staff directory, and they are called
 * from places with no props to thread them through -- a `map` inside a sort
 * comparator, a title rendered by a component three levels down. Passing both
 * into every signature would touch every call site to say the same two things.
 *
 * So both are module-level, written once per session by `useTeamChat` and read
 * everywhere. Nothing else writes them, and nothing reads them before a session
 * exists -- the page sits behind `RequireSection`.
 */

const DAY = 86_400_000;

/* -- the registry ---------------------------------------------------- */

let currentId = null;
let directory = {};

/** Called by `useTeamChat` when the profile resolves. */
export function setChatMe(personId) {
  currentId = personId || null;
}

/** Called by `useTeamChat` once the roster is read. */
export function setChatDirectory(people) {
  directory = Object.fromEntries((people || []).map((p) => [p.id, p]));
}

export const myId = () => currentId;
export const isMe = (id) => !!id && id === currentId;

const UNKNOWN = { name: "Unknown", role: "", online: false, status: "" };

/**
 * A person by id. Never throws and never returns undefined: a message whose
 * author has since left the company still has to render.
 */
export function personFor(id) {
  const found = directory[id];
  if (found) return found;
  if (id && id === currentId) return { id, ...UNKNOWN, name: "You" };
  return { id, ...UNKNOWN };
}

/**
 * A stable hue per person, for `<Avatar hue>`.
 *
 * The mobile app picks from a named tint palette; the web `Avatar` takes an
 * oklch hue angle instead, so the seed is hashed into one. The same input
 * always gives the same colour, which is the only property that matters -- a
 * face you recognise by its colour must not change between sessions.
 */
export function hueFor(seed) {
  const s = String(seed || "");
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
  return Math.abs(h) % 360;
}

/* -- names and titles ------------------------------------------------ */

/** First name only -- group bubbles and reply quotes have no room for the rest. */
export const firstName = (id) => personFor(id).name.split(" ")[0];

export function threadTitle(thread) {
  if (!thread) return "";
  if (thread.kind === "group") return thread.name || "Group";
  return personFor(thread.memberIds[0]).name;
}

/** The small line beside the name: a dm shows the person's job, a group its size. */
export function threadRole(thread) {
  if (thread.kind === "dm") return personFor(thread.memberIds[0]).role;
  return `Group · ${thread.memberIds.length + 1}`;
}

/** The presence line under the title in the thread header. */
export function threadStatus(thread) {
  if (thread.kind === "dm") return personFor(thread.memberIds[0]).status;
  const online = thread.memberIds.filter((id) => personFor(id).online).length;
  return `${thread.memberIds.length + 1} members · ${online} on shift`;
}

/** A group counts as online while anyone in it is. */
export const threadOnline = (thread) =>
  thread.kind === "dm"
    ? personFor(thread.memberIds[0]).online
    : thread.memberIds.some((id) => personFor(id).online);

export const threadMemberNames = (thread) =>
  [personFor(myId()).name, ...thread.memberIds.map((id) => personFor(id).name)].join(", ");

/** The hue a thread's avatar takes: a dm borrows the other person's. */
export const threadHue = (thread) =>
  thread.kind === "dm" ? hueFor(thread.memberIds[0]) : hueFor(thread.id);

/* -- clocks and dates ------------------------------------------------ */

function startOfDay(ms) {
  const d = new Date(ms);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

/** 0 = today, 1 = yesterday, and so on. */
const daysAgo = (ms) => Math.round((startOfDay(Date.now()) - startOfDay(ms)) / DAY);

const clockOf = (ms) => {
  const d = new Date(ms);
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
};

/** Thread-list stamp -- short, because it sits in a narrow right-hand column. */
export function listTime(ms) {
  if (!ms) return "";
  if (Date.now() - ms < 60_000) return "Just now";
  const days = daysAgo(ms);
  if (days === 0) return clockOf(ms);
  if (days === 1) return "Yesterday";
  return new Date(ms).toLocaleDateString("en-GB", { day: "numeric", month: "short" });
}

/** Day separator inside a thread. */
export function dayLabel(ms) {
  const days = daysAgo(ms);
  if (days === 0) return "Today";
  if (days === 1) return "Yesterday";
  return new Date(ms).toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short" });
}

/** The line under a bubble: the clock, plus a receipt on your own messages. */
export function messageMeta(message) {
  const days = daysAgo(message.at);
  const stamp = days === 0 ? clockOf(message.at) : `${dayLabel(message.at)} ${clockOf(message.at)}`;
  if (!isMe(message.authorId) || message.deleted) return stamp;
  if (message.pending) return `${stamp} · Sending…`;
  return `${stamp} · ${message.read ? "Read" : "Sent"}`;
}

/** Long form, for the message-info line on the actions menu. */
export const messageTimestamp = (message) => `${dayLabel(message.at)} at ${clockOf(message.at)}`;

/* -- message bodies -------------------------------------------------- */

const ATTACHMENT_LABEL = { image: "Photo", video: "Video", file: "File" };

/** What an attachment reads as where there is no room to render it. */
export const attachmentLabel = (message) =>
  message.attachment ? ATTACHMENT_LABEL[message.attachment.kind] || "File" : "";

export function messageText(message) {
  if (message.deleted) return "This message was deleted";
  if (message.text) return message.text;
  if (message.attachment) return `${attachmentLabel(message)} · ${message.attachment.name}`;
  return "";
}

/** Human file size -- 1 decimal, and never "0.0 KB". */
export function fileSize(bytes) {
  if (!bytes) return "";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/** `mm:ss` for a video's duration, from milliseconds. */
export function clipLength(ms) {
  const total = Math.round(ms / 1000);
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, "0")}`;
}

/** Thread-list preview. Groups get a sender prefix, so an unread row says *who* is waiting on you. */
export function previewOf(thread, last) {
  if (!last) return "No messages yet";
  const body = messageText(last);
  if (isMe(last.authorId)) return `You: ${body}`;
  if (thread.kind === "group") return `${firstName(last.authorId)}: ${body}`;
  return body;
}

/* -- grouping and ordering ------------------------------------------- */

/** Splits a thread into day sections, so the view draws one separator per day. */
export function groupByDay(messages) {
  const groups = [];
  for (const m of messages) {
    const key = String(startOfDay(m.at));
    const last = groups[groups.length - 1];
    if (last && last.key === key) last.items.push(m);
    else groups.push({ key, label: dayLabel(m.at), items: [m] });
  }
  return groups;
}

/**
 * Whether a bubble should drop its avatar and author name because the one
 * above it came from the same person moments earlier. Purely visual -- the
 * run of bubbles every messenger draws.
 */
export function continuesRun(message, previous) {
  if (!previous) return false;
  if (previous.authorId !== message.authorId) return false;
  if (previous.deleted || message.deleted) return false;
  return message.at - previous.at < 5 * 60_000;
}

/** Pinned first, then most recent. An empty new conversation falls back to when it was created. */
export function sortThreads(threads, lastAt) {
  const rank = (t) => Math.max(lastAt[t.id] || 0, t.createdAt || 0);
  return [...threads].sort((a, b) => {
    if (!!a.pinned !== !!b.pinned) return a.pinned ? -1 : 1;
    return rank(b) - rank(a);
  });
}

export const reactionCount = (message) => message.reactions.reduce((n, r) => n + r.by.length, 0);

/** Offered first on the reaction menu, above the full picker. */
export const QUICK_REACTIONS = ["👍", "❤️", "😂", "🎉", "✅", "🙏"];

/** The full picker, grouped the way people scan for one. */
export const EMOJI_PICKER = [
  "👍", "👎", "❤️", "🔥", "🎉", "😂", "😊", "😮",
  "😢", "😡", "🙏", "👏", "✅", "❌", "⚠️", "💡",
  "👀", "💯", "🚀", "⏰", "📦", "✂️", "🧵", "💰",
];
