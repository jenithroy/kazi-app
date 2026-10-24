/**
 * "Send to chat" from anywhere: one dialog for every kind of record.
 *
 * The provider sits once around the signed-in app (AppLayout, beside PersonProvider). A record's card calls
 * `open({ type, record })` (or draws a <ShareButton>, which does) and the dialog (ShareDialog.jsx, fetched the first time it is wanted)
 * opens over whatever card or page it was pressed on: the card stays exactly as it was and Escape closes only the dialog.
 *
 * `open` is null for someone who may not post in Chat (their position has no edit rights on `messenger`), so a card draws no button for
 * them rather than a button that could only fail. It is also null while nobody is signed in.
 *
 * What is sent, and how each kind of record becomes a file, is lib/share/records.js.
 */
import { createContext, lazy, Suspense, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { useLocation } from "react-router-dom";
import { useAuth } from "../../context/AuthContext";
import { sectionCanEdit } from "../../utils/permissions";

const ShareDialog = lazy(() => import("./ShareDialog"));

const ShareContext = createContext({ open: null });

export function ShareProvider({ children }) {
  const { profile } = useAuth();
  const { pathname } = useLocation();
  const me = profile?.personId ? String(profile.personId) : null;
  const can = Boolean(me) && sectionCanEdit(profile, "messenger");
  const [job, setJob] = useState(null);                         // { type, record, at }

  const open = useCallback((next) => {
    if (next?.type && next?.record) setJob({ type: next.type, record: next.record, at: Date.now() });
  }, []);
  const close = useCallback(() => setJob(null), []);

  // Going to another page, or signing out, puts the dialog away.
  useEffect(() => { setJob(null); }, [pathname, me]);

  const value = useMemo(() => ({ open: can ? open : null }), [can, open]);

  return (
    <ShareContext.Provider value={value}>
      {children}
      {can && job && (
        <Suspense fallback={null}>
          <ShareDialog key={job.at} job={job} me={me} profile={profile} onClose={close} />
        </Suspense>
      )}
    </ShareContext.Provider>
  );
}

/** `{ open }`: `open({ type, record })` shows the dialog; null when this person cannot send to Chat. */
export function useShare() {
  return useContext(ShareContext);
}
