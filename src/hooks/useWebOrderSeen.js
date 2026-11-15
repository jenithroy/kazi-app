/**
 * Which website orders this browser has opened (so the "N new from the website" button can go quiet for a person who may only look, and at
 * once for everyone: the shared answer, `webSeenAt`, is written by whoever can edit and arrives a moment later).
 *
 *   const { seen, markSeen } = useWebOrderSeen();     // seen: a Set of order ids; markSeen(id)
 *
 * Kept in localStorage under `kazi.webOrders.seen` as a list of ids, the newest last, at most 500 (older ones fall off: by then the shared
 * `webSeenAt` says the same). Every read and write is in a try/catch: a browser that refuses storage just forgets, and the button
 * stays until the shared answer clears it.
 */
import { useCallback, useEffect, useMemo, useState } from "react";

export const SEEN_KEY = "kazi.webOrders.seen";
export const SEEN_CAP = 500;

function read() {
  try {
    const list = JSON.parse(window.localStorage.getItem(SEEN_KEY) || "[]");
    return Array.isArray(list) ? list.filter((id) => typeof id === "string").slice(-SEEN_CAP) : [];
  } catch {
    return [];
  }
}

function write(list) {
  try {
    window.localStorage.setItem(SEEN_KEY, JSON.stringify(list.slice(-SEEN_CAP)));
  } catch {
    /* storage is full or refused: the shared answer still clears it */
  }
}

export default function useWebOrderSeen() {
  const [list, setList] = useState(read);

  // another tab of the same browser opened one
  useEffect(() => {
    const onStorage = (e) => { if (e.key === SEEN_KEY || e.key === null) setList(read()); };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, []);

  const seen = useMemo(() => new Set(list), [list]);

  const markSeen = useCallback((id) => {
    if (!id) return;
    setList((cur) => {
      if (cur.includes(id)) return cur;
      const next = [...cur, id].slice(-SEEN_CAP);
      write(next);
      return next;
    });
  }, []);

  return { seen, markSeen };
}
