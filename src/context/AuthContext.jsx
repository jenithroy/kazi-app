import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { onAuthStateChanged, signOut as firebaseSignOut } from "firebase/auth";
import { auth as firebaseAuth } from "../firebase";
import { authClient, supabase } from "../supabase";
import { initPushNotifications } from "../utils/native";

const AuthContext = createContext(null);

/**
 * Legacy role names, derived from the position's tier.
 *
 * Pages still branch on strings like "nepal_admin". Those checks predate the
 * position matrix and should be replaced with sectionCanEdit()/sectionVisible()
 * calls, which ask the real question ("may this person edit billing?") instead
 * of guessing from a job label. Until that happens this keeps them working.
 *
 * Nothing is *enforced* here. RLS decides what a query returns; this only
 * drives which buttons the UI bothers to draw.
 */
function legacyRole(tier, location) {
  if (tier >= 4) return "super_admin";
  if (tier >= 3) return location === "uk" ? "uk_admin" : "nepal_admin";
  if (tier >= 2) return "nepal_admin";
  if (tier >= 1) return "employee";
  return "nepal_staff";
}

/**
 * Load everything about the signed-in person in one round trip each.
 *
 * All three of these are answered by the database for whoever holds the token:
 * me() resolves the person, my_permissions runs app_can_view/app_can_edit over
 * every section, my_finance_tabs does the same for the finance sub-tabs. If the
 * token maps to nobody (removed from people, or set Inactive) me() comes back
 * empty and we return null — which the app treats as signed out.
 */
async function loadProfile() {
  const [meRes, permRes, tabRes] = await Promise.all([
    supabase.rpc("me"),
    supabase.from("my_permissions").select("section_id, aliases, can_view, can_edit"),
    supabase.from("my_finance_tabs").select("tab_id, can_view"),
  ]);

  if (meRes.error) throw meRes.error;

  const me = Array.isArray(meRes.data) ? meRes.data[0] : meRes.data;
  if (!me) return null;

  const permissions = {};
  const aliases = {};
  for (const row of permRes.data || []) {
    permissions[row.section_id] = { canView: !!row.can_view, canEdit: !!row.can_edit };
    for (const a of row.aliases || []) aliases[a] = row.section_id;
  }

  const financeTabs = {};
  for (const row of tabRes.data || []) financeTabs[row.tab_id] = !!row.can_view;

  const tier = Number.isFinite(me.tier) ? me.tier : -1;
  const role = legacyRole(tier, me.location);

  return {
    personId: me.person_id,
    id: me.person_id,
    name: me.full_name,
    email: me.email,
    positionId: me.position_id,
    positionLabel: me.position_label,
    displayRole: me.position_label,
    jobRole: me.position_label,
    tier,
    location: me.location,
    permissions,
    financeTabs,
    aliases,
    // Compatibility with pages that still branch on role strings.
    role,
    appRole: role,
  };
}

export function AuthProvider({ children }) {
  const [user, setUser]       = useState(null);
  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError]     = useState("");

  // Both SDKs fire on startup. Whichever resolves a person first wins; the
  // other must not then overwrite a good profile with null.
  const generation = useRef(0);

  const refresh = useCallback(async (identity) => {
    const gen = ++generation.current;

    if (!identity) {
      // Only clear if nothing else signed in while we were deciding.
      if (gen === generation.current) {
        setUser(null);
        setProfile(null);
        setLoading(false);
      }
      return;
    }

    try {
      const next = await loadProfile();
      if (gen !== generation.current) return; // superseded

      if (!next) {
        // A token that resolves to nobody is not a login. It happens when
        // someone has an auth account but no active `people` row — removed
        // from staff, or set Inactive. Every policy denies them anyway, so
        // holding the token open would only let them past the route guard to
        // a shell full of empty pages.
        //
        // Drop it rather than leave it sitting in storage, or the app bounces
        // between login and dashboard on every reload.
        //
        // State first, sign-out second, and deliberately so: signing out fires
        // both SDKs' listeners, which start another resolve and bump the
        // generation — so anything set after the await would be discarded as
        // superseded and the person would land back on login with no idea why.
        setUser(null);
        setProfile(null);
        setError("That account has no active staff record. Ask an administrator to check it.");
        setLoading(false);
        await Promise.allSettled([authClient.auth.signOut(), firebaseSignOut(firebaseAuth)]);
        return;
      }

      setUser(identity);
      setProfile(next);
      setError("");
    } catch (err) {
      if (gen !== generation.current) return;
      console.error("AuthContext: failed to load profile:", err);
      // Failing open here would be the whole bug: no profile must mean no
      // access, whether that is because there is no record or because the
      // lookup broke.
      setUser(null);
      setProfile(null);
      setError(err.message || "Could not load your profile.");
    } finally {
      if (gen === generation.current) setLoading(false);
    }
  }, []);

  useEffect(() => {
    let cancelled = false;

    // Whoever is signed in right now, preferring the Supabase session.
    async function resolve() {
      const { data } = await authClient.auth.getSession();
      if (cancelled) return;
      if (data?.session?.user) return refresh(data.session.user);
      if (firebaseAuth.currentUser) return refresh(firebaseAuth.currentUser);
      return refresh(null);
    }

    const { data: sub } = authClient.auth.onAuthStateChange((_event, session) => {
      if (cancelled) return;
      if (session?.user) refresh(session.user);
      // A Supabase sign-out does not mean signed out — the person may still
      // hold a Firebase session. Re-resolve rather than assuming.
      else resolve();
    });

    // Either way we re-resolve: a Firebase sign-in may or may not be the
    // identity we end up using, and a Firebase sign-out does not rule out a
    // live Supabase session.
    const unsubFirebase = onAuthStateChanged(firebaseAuth, () => {
      if (!cancelled) resolve();
    });

    resolve();

    return () => {
      cancelled = true;
      sub?.subscription?.unsubscribe();
      unsubFirebase();
    };
  }, [refresh]);

  // Register for push once we know which person to file the token against.
  // Native only — initPushNotifications returns immediately on the web.
  useEffect(() => {
    const personId = profile?.personId;
    if (!personId) return;
    initPushNotifications(async (token) => {
      if (!token) return;
      const { error: err } = await supabase
        .from("people")
        .update({ fcm_token: token })
        .eq("id", personId);
      if (err) console.warn("Could not save the push token:", err.message);
    });
  }, [profile?.personId]);

  const signOut = useCallback(async () => {
    generation.current++;
    setUser(null);
    setProfile(null);
    // Sign out of both, so a stale session on either side cannot revive access.
    await Promise.allSettled([authClient.auth.signOut(), firebaseSignOut(firebaseAuth)]);
    setLoading(false);
  }, []);

  const value = useMemo(
    () => ({
      user,
      profile,
      /**
       * The only thing route guards should test.
       *
       * Holding a token is not the same as being signed in: it has to resolve
       * to an active person before it means anything, because that person's
       * position is what every permission is read from. Checking `user` alone
       * let anyone with any account into the whole app.
       */
      authenticated: !!(user && profile),
      role: profile?.role,
      loading,
      error,
      signOut,
      logout: signOut, // the name Sidebar has always called it
      reloadProfile: () => refresh(user),
    }),
    [user, profile, loading, error, signOut, refresh]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used inside an AuthProvider");
  return ctx;
}

export default AuthContext;
