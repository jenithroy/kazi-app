import { useCallback, useEffect, useRef, useState } from "react";

/**
 * Which finished tasks this person has cleared away, kept on this device only.
 *
 * "Clear" on the Tasks page's Done list hides tasks from the list and moves them to the
 * Archive, and it is personal: it is remembered in the browser (localStorage), under the
 * person's id, so it differs from one person to the next and from one device to the next.
 * Nothing about the task changes in the database, so clearing never hides it from anyone
 * else.
 *
 *   const { cleared, clear, restore, prune } = useClearedTasks(personId);
 *   clear(["task-id", …])     hide them on this device
 *   restore(["task-id", …])   show them again (Undo, or a task that was reopened)
 *   prune(new Set(ids))       forget every cleared id that is not in the set (the page
 *                             passes the ids of the tasks that are still finished, so
 *                             deleted and reopened tasks do not pile up here)
 *
 * It works without storage too (a private window, blocked site data): clearing then lasts
 * until the page is closed. Another tab of the same browser is kept in step.
 */

const keyFor = (personId) => `kazi.tasks.cleared.v1.${personId || "anon"}`;

function read(key) {
  try {
    const list = JSON.parse(localStorage.getItem(key) || "[]");
    return new Set(Array.isArray(list) ? list.filter((id) => typeof id === "string") : []);
  } catch {
    return new Set();
  }
}

function write(key, ids) {
  try {
    if (ids.size) localStorage.setItem(key, JSON.stringify([...ids]));
    else localStorage.removeItem(key);
  } catch { /* not remembered, but still cleared for now */ }
}

export function useClearedTasks(personId) {
  const key = keyFor(personId);
  const [cleared, setCleared] = useState(() => read(key));
  const current = useRef(cleared);
  current.current = cleared;

  // a different person on this browser, or the same person in another tab
  useEffect(() => {
    const again = () => setCleared(read(key));
    again();
    const onStorage = (e) => { if (e.key === key || e.key === null) again(); };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, [key]);

  const update = useCallback((change) => {
    const next = change(current.current);
    if (next === current.current) return;
    current.current = next;
    write(key, next);
    setCleared(next);
  }, [key]);

  const clear = useCallback((ids) => update((cur) => {
    if (ids.every((id) => cur.has(id))) return cur;
    const next = new Set(cur);
    ids.forEach((id) => next.add(id));
    return next;
  }), [update]);

  const restore = useCallback((ids) => update((cur) => {
    if (!ids.some((id) => cur.has(id))) return cur;
    const next = new Set(cur);
    ids.forEach((id) => next.delete(id));
    return next;
  }), [update]);

  const prune = useCallback((keep) => update((cur) => {
    const next = new Set([...cur].filter((id) => keep.has(id)));
    return next.size === cur.size ? cur : next;
  }), [update]);

  return { cleared, clear, restore, prune };
}
