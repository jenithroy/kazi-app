/**
 * All of team chat's state, in one hook.
 *
 * The mobile app leans on React Query for caching, optimistic writes and
 * rollback. The web app has no such dependency, so the same three behaviours
 * are written out here:
 *
 *   - **one cold read** of threads, messages, unread counts and the staff
 *     directory, then realtime keeps them current;
 *   - **optimistic writes**, because a chat that waits on a round trip before
 *     showing your own click feels broken even when the round trip is fast;
 *   - **the server as the last word** -- every optimistic change is followed
 *     by a refetch, because only the database knows the id, the timestamp and
 *     whether anyone has read it.
 *
 * Messages are held in two pieces. `server` is what the last read returned;
 * `pending` is the messages this tab has sent that no read has come back with
 * yet. They are merged for rendering. Keeping them apart is what stops a
 * refetch -- which can land mid-send, since anyone else typing triggers one --
 * from wiping a bubble that is still in flight.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useAuth } from "../context/AuthContext";
import { sectionCanEdit } from "../utils/permissions";
import * as chat from "../lib/chat";
import { setChatDirectory, setChatMe, sortThreads } from "../lib/chatFormat";

/** How often to re-read the roster. Names change quarterly; the presence dot on every one of them changes with a punch, and nothing pushes that. */
const PRESENCE_INTERVAL = 5 * 60_000;

/** Realtime is chatty -- a burst of inserts should cost one refetch, not six. */
const REFETCH_DEBOUNCE = 250;

function mergeMessages(server, pending) {
  const out = {};
  for (const [threadId, list] of Object.entries(server)) out[threadId] = list;

  for (const [threadId, list] of Object.entries(pending)) {
    if (!list.length) continue;
    const base = out[threadId] || [];
    // A pending message whose real row has already arrived is a duplicate.
    const settled = new Set(base.map((m) => m.id));
    const extra = list.filter((m) => !settled.has(m.id));
    out[threadId] = extra.length ? [...base, ...extra].sort((a, b) => a.at - b.at) : base;
  }
  return out;
}

export function useTeamChat() {
  const { profile } = useAuth();
  const personId = profile?.personId || null;
  const canPost = sectionCanEdit(profile, "messenger");

  const [directory, setDirectory] = useState([]);
  const [threads, setThreads] = useState([]);
  const [server, setServer] = useState({});
  const [pending, setPending] = useState({});
  const [unread, setUnread] = useState({});
  const [rights, setRights] = useState({ create: false, manage: false });

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  // Identity has to be registered before any read runs: `lib/chat.js` and every
  // formatting helper ask the registry who "me" is rather than taking it as an
  // argument. Set during render, not in an effect, so the first fetch below
  // cannot race ahead of it.
  if (personId) setChatMe(personId);

  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  /* -- reads --------------------------------------------------------- */

  const loadDirectory = useCallback(async () => {
    const people = await chat.fetchDirectory();
    if (!mounted.current) return;
    setChatDirectory(people);
    setDirectory(people);
  }, []);

  const loadThreads = useCallback(async () => {
    const rows = await chat.fetchThreads();
    if (mounted.current) setThreads(rows);
  }, []);

  const loadMessages = useCallback(async () => {
    const [msgs, counts] = await Promise.all([chat.fetchMessages(), chat.fetchUnread()]);
    if (!mounted.current) return;
    setServer(msgs);
    setUnread(counts);
    // Anything the server has now confirmed stops being "in flight".
    setPending((current) => {
      const next = {};
      for (const [threadId, list] of Object.entries(current)) {
        const settled = new Set((msgs[threadId] || []).map((m) => m.id));
        const still = list.filter((m) => !settled.has(m.id));
        if (still.length) next[threadId] = still;
      }
      return next;
    });
  }, []);

  const reload = useCallback(async () => {
    await Promise.all([loadThreads(), loadMessages()]);
  }, [loadThreads, loadMessages]);

  /* -- first read ---------------------------------------------------- */

  useEffect(() => {
    if (!personId) return;
    let cancelled = false;

    (async () => {
      setLoading(true);
      setError("");
      try {
        // The directory first and on its own: every name, avatar and job title
        // in the two reads that follow resolves through the registry it fills.
        await loadDirectory();
        const [, , groupRights] = await Promise.all([loadThreads(), loadMessages(), chat.fetchGroupRights()]);
        if (!cancelled && mounted.current) setRights(groupRights);
      } catch (err) {
        console.error("[chat] initial load failed:", err);
        if (!cancelled && mounted.current) setError(err.message || "Could not load your conversations.");
      } finally {
        if (!cancelled && mounted.current) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [personId, loadDirectory, loadThreads, loadMessages]);

  /* -- staying current ----------------------------------------------- */

  const timer = useRef(null);
  useEffect(() => {
    if (!personId) return undefined;

    const debounced = (fn) => () => {
      clearTimeout(timer.current);
      timer.current = setTimeout(() => {
        fn().catch((err) => console.warn("[chat] refresh failed:", err.message));
      }, REFETCH_DEBOUNCE);
    };

    const unsubscribe = chat.subscribeToChat({
      onMessages: debounced(loadMessages),
      onThreads: debounced(loadThreads),
    });

    return () => {
      clearTimeout(timer.current);
      unsubscribe();
    };
  }, [personId, loadMessages, loadThreads]);

  useEffect(() => {
    if (!personId) return undefined;
    const id = setInterval(() => {
      loadDirectory().catch((err) => console.warn("[chat] presence refresh failed:", err.message));
    }, PRESENCE_INTERVAL);
    return () => clearInterval(id);
  }, [personId, loadDirectory]);

  /* -- derived ------------------------------------------------------- */

  const messages = useMemo(() => mergeMessages(server, pending), [server, pending]);

  const lastByThread = useMemo(() => {
    const out = {};
    for (const [threadId, list] of Object.entries(messages)) {
      // A tombstone is still the newest thing that happened, and the preview
      // says so rather than silently showing an older message.
      out[threadId] = list[list.length - 1];
    }
    return out;
  }, [messages]);

  const orderedThreads = useMemo(() => {
    const lastAt = {};
    for (const [threadId, message] of Object.entries(lastByThread)) {
      if (message) lastAt[threadId] = message.at;
    }
    return sortThreads(threads, lastAt);
  }, [threads, lastByThread]);

  const totalUnread = useMemo(
    () => Object.values(unread).reduce((n, c) => n + c, 0),
    [unread]
  );

  /* -- writes -------------------------------------------------------- */

  /**
   * Apply a change to the local copy now, run the write, and let a refetch
   * settle it. On failure the refetch is what restores the truth -- there is
   * no saved snapshot to roll back to, because the realtime stream may have
   * legitimately changed other things in the meantime.
   *
   * It never rethrows. These are the writes with no second chance in the UI --
   * a pin, a mute, a reaction -- and they are called from click handlers and
   * effects that would otherwise leak an unhandled rejection. The failure is
   * reported once, in the error strip, and the refetch puts the screen back to
   * whatever actually happened.
   */
  const optimistic = useCallback(
    async (apply, write) => {
      apply();
      try {
        await write();
      } catch (err) {
        console.error("[chat] write failed:", err);
        setError(err.message || "That did not save.");
      } finally {
        reload().catch(() => {});
      }
    },
    [reload]
  );

  const patchMessage = useCallback((threadId, messageId, change) => {
    setServer((current) => ({
      ...current,
      [threadId]: (current[threadId] || []).map((m) => (m.id === messageId ? { ...m, ...change } : m)),
    }));
  }, []);

  const send = useCallback(
    async (threadId, text, replyTo, attachment) => {
      const draftId = `pending-${crypto.randomUUID()}`;
      const optimisticMessage = {
        id: draftId,
        threadId,
        authorId: personId,
        text,
        at: Date.now(),
        replyTo,
        attachment,
        reactions: [],
        pending: true,
      };

      setPending((current) => ({
        ...current,
        [threadId]: [...(current[threadId] || []), optimisticMessage],
      }));

      try {
        const saved = await chat.sendMessage(threadId, text, replyTo, attachment);
        // Swap the placeholder for the real row straight away. Waiting for the
        // refetch would blink the bubble out and back in.
        if (mounted.current) {
          setPending((current) => ({
            ...current,
            [threadId]: (current[threadId] || []).map((m) => (m.id === draftId ? saved : m)),
          }));
        }
        reload().catch(() => {});
        return saved;
      } catch (err) {
        // The placeholder goes, because the composer puts the text back in the
        // box and says why. Keeping a failed bubble as well would show the
        // same unsent message twice.
        if (mounted.current) {
          setPending((current) => ({
            ...current,
            [threadId]: (current[threadId] || []).filter((m) => m.id !== draftId),
          }));
        }
        throw err;
      }
    },
    [personId, reload]
  );

  const react = useCallback(
    (threadId, messageId, emoji) =>
      optimistic(
        () =>
          setServer((current) => ({
            ...current,
            [threadId]: (current[threadId] || []).map((m) => {
              if (m.id !== messageId) return m;
              const existing = m.reactions.find((r) => r.emoji === emoji);
              if (!existing) return { ...m, reactions: [...m.reactions, { emoji, by: [personId] }] };
              const by = existing.by.includes(personId)
                ? existing.by.filter((id) => id !== personId)
                : [...existing.by, personId];
              return {
                ...m,
                reactions: m.reactions
                  .map((r) => (r.emoji === emoji ? { ...r, by } : r))
                  .filter((r) => r.by.length > 0),
              };
            }),
          })),
        () => chat.toggleReaction(messageId, emoji)
      ),
    [optimistic, personId]
  );

  const edit = useCallback(
    (threadId, messageId, text) =>
      optimistic(
        () => patchMessage(threadId, messageId, { text, editedAt: Date.now() }),
        () => chat.editMessage(messageId, text)
      ),
    [optimistic, patchMessage]
  );

  const remove = useCallback(
    (threadId, ids) =>
      optimistic(
        () =>
          setServer((current) => {
            const set = new Set(ids);
            return {
              ...current,
              [threadId]: (current[threadId] || []).map((m) =>
                set.has(m.id) ? { ...m, text: "", deleted: true, attachment: undefined, reactions: [] } : m
              ),
            };
          }),
        () => chat.deleteMessages(ids)
      ),
    [optimistic]
  );

  const markRead = useCallback(
    (threadId, read = true) =>
      optimistic(
        () => setUnread((current) => ({ ...current, [threadId]: read ? 0 : Math.max(1, current[threadId] || 0) })),
        () => chat.setThreadRead(threadId, read)
      ),
    [optimistic]
  );

  const setFlag = useCallback(
    (threadId, flag, value) =>
      optimistic(
        () => setThreads((current) => current.map((t) => (t.id === threadId ? { ...t, [flag]: value } : t))),
        () => chat.setThreadFlag(threadId, flag, value)
      ),
    [optimistic]
  );

  const leave = useCallback(
    (threadId) =>
      optimistic(
        () => setThreads((current) => current.filter((t) => t.id !== threadId)),
        () => chat.leaveThread(threadId)
      ),
    [optimistic]
  );

  /** Not optimistic: the caller needs the server-assigned id to open the new thread. */
  const startDm = useCallback(
    async (otherPersonId) => {
      const threadId = await chat.createDm(otherPersonId);
      await reload();
      return threadId;
    },
    [reload]
  );

  const startGroup = useCallback(
    async (name, memberIds) => {
      const threadId = await chat.createGroup(name, memberIds);
      await reload();
      return threadId;
    },
    [reload]
  );

  const saveGroup = useCallback(
    async (threadId, name, memberIds) => {
      await chat.updateGroup(threadId, name, memberIds);
      await reload();
    },
    [reload]
  );

  return {
    me: personId,
    canPost,
    rights,
    directory,
    threads: orderedThreads,
    messages,
    lastByThread,
    unread,
    totalUnread,
    loading,
    error,
    dismissError: () => setError(""),
    reload,
    send,
    react,
    edit,
    remove,
    markRead,
    setFlag,
    leave,
    startDm,
    startGroup,
    saveGroup,
  };
}
