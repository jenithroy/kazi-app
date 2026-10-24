/**
 * Putting a record into Chat: who it can go to, and the sending itself.
 *
 * A record goes as an ordinary chat attachment (lib/chat.js `uploadAttachment` + `sendMessage`), with the sender's own words as the
 * message. Nothing here is special to the database: the file lands in the conversation's private folder, so everyone IN that
 * conversation can open it whatever their role (the bucket's read rule is "you are in this conversation", not "your position may open
 * Finance"), and the phone app, which reads the same tables, shows it like any other file.
 *
 * `lib/chat.js` asks the registry in lib/chatFormat.js who "me" is, and that is only filled in while the Chat page is open, so every
 * call here sets it first.
 */
import { createDm, fetchDirectory, fetchThreads, sendMessage, uploadAttachment } from "../chat";
import { setChatDirectory, setChatMe } from "../chatFormat";

/** More than this at once is a broadcast, not a message to people. */
export const MAX_TARGETS = 10;

/** Who a record can be sent to: every active member of staff except you, and the group chats you are in. */
export async function loadTargets(me) {
  setChatMe(me);
  const [people, threads] = await Promise.all([fetchDirectory(), fetchThreads()]);
  setChatDirectory(people);
  return {
    people: people.filter((p) => p.id !== me),
    groups: threads.filter((t) => t.kind === "group").sort((a, b) => (a.name || "").localeCompare(b.name || "")),
    dmByPerson: new Map(threads.filter((t) => t.kind === "dm").map((t) => [t.memberIds[0], t.id])),
  };
}

/** What went wrong, in words a person can act on. */
export function friendly(err) {
  const text = String(err?.message || err || "");
  if (/no access to messenger/i.test(text)) return "Your role cannot send messages.";
  if (/not on the staff list/i.test(text)) return "That person is not on the staff list.";
  if (/row-level security|violates|permission denied|not allowed/i.test(text)) return "You cannot send to that conversation.";
  if (/50 MB|limit is/i.test(text)) return text;
  if (/failed to fetch|network|timeout/i.test(text)) return "The connection dropped. Try again.";
  return text.replace(/^[a-z ]+: /i, "").slice(0, 160) || "That did not send.";
}

/**
 * Send `file` (a File) with `text` to each target in turn: a person (`{ kind: "person", id }`: the conversation with them is found or
 * started) or a group (`{ kind: "group", id }`). One that fails does not stop the others; each answer says which it was.
 */
export async function sendToTargets({ me, targets, text, file, dmByPerson }) {
  setChatMe(me);
  const out = [];
  for (const target of targets) {
    try {
      const threadId = target.kind === "group" ? target.id : (dmByPerson?.get(target.id) || await createDm(target.id));
      const attachment = await uploadAttachment(threadId, file);
      await sendMessage(threadId, text, null, attachment);
      out.push({ target, ok: true, threadId });
    } catch (err) {
      console.error("[share] could not send:", err);
      out.push({ target, ok: false, error: friendly(err) });
    }
  }
  return out;
}
