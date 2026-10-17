import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "../supabase";
import { useAuth } from "./AuthContext";

/**
 * Everyone's profile picture, loaded once and handed to every <Avatar>.
 *
 * A picture is found by the person's id, or by their name for the many places that
 * only have a name to go on (a task's assignee, a chat title). A name that two people
 * share finds nobody rather than the wrong face.
 *
 * Nothing here may break the app: until migration 0056 has been run the table is
 * missing, and then everyone simply keeps their initials.
 */

const AvatarContext = createContext({ urlFor: () => null, refresh: async () => {}, ready: false });

const EMPTY = { byId: {}, idByName: {}, ready: false };
const STALE_MS = 60_000;   // a tab that has been in the background this long reloads on return

const keyOf = (name) => String(name || "").trim().toLowerCase();

export function AvatarProvider({ children }) {
  const { profile } = useAuth();
  const signedIn = Boolean(profile?.personId);
  const [state, setState] = useState(EMPTY);
  const loadedAt = useRef(0);
  const warned = useRef(false);

  const refresh = useCallback(async () => {
    try {
      const [pics, people] = await Promise.all([
        supabase.from("person_avatars").select("person_id, url"),
        supabase.from("fs_employees").select("id, name"),
      ]);
      if (pics.error) throw pics.error;

      const byId = {};
      for (const row of pics.data || []) byId[row.person_id] = row.url;

      // name -> id, only for names that belong to exactly one person
      const seen = new Map();
      for (const p of people.data || []) {
        const k = keyOf(p.name);
        if (!k) continue;
        seen.set(k, seen.has(k) ? null : String(p.id));
      }
      const idByName = {};
      for (const [k, id] of seen) if (id) idByName[k] = id;

      loadedAt.current = Date.now();
      setState({ byId, idByName, ready: true });
    } catch (err) {
      if (!warned.current) {
        warned.current = true;
        console.warn("Profile pictures unavailable (has migration 0056 been run?):", err?.message || err);
      }
      setState((s) => ({ ...s, ready: true }));
    }
  }, []);

  useEffect(() => {
    if (!signedIn) {
      setState(EMPTY);
      loadedAt.current = 0;
      return undefined;
    }
    refresh();
    const onVisible = () => {
      if (document.visibilityState === "visible" && Date.now() - loadedAt.current > STALE_MS) refresh();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => document.removeEventListener("visibilitychange", onVisible);
  }, [signedIn, refresh]);

  const value = useMemo(() => ({
    ready: state.ready,
    refresh,
    /** The picture's URL for a person (by id, else by name), or null for their initials. */
    urlFor: ({ personId, name } = {}) => {
      if (personId && state.byId[personId]) return state.byId[personId];
      const id = name ? state.idByName[keyOf(name)] : null;
      return (id && state.byId[id]) || null;
    },
  }), [state, refresh]);

  return <AvatarContext.Provider value={value}>{children}</AvatarContext.Provider>;
}

export const useAvatars = () => useContext(AvatarContext);
