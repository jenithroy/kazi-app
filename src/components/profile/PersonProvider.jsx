/**
 * Open anyone's profile from anywhere.
 *
 * The provider sits once, around the whole signed-in app (AppLayout). A name or photo anywhere on a page is a
 * <PersonLink>; pressing it calls `open({ personId, name })`, and the card appears over whatever page (or card) it was pressed on:
 *
 *   - your own name opens your own profile (components/ProfileModal.jsx, the card the top bar's picture opens: you can edit it);
 *   - anyone else's opens the read-only card for them (PersonCard.jsx). From there a "Reports to" link opens that person on top,
 *     and Back returns to the one before.
 *
 * The cards are fetched the first time they are wanted (and quietly a moment after sign-in, so the first press does not wait).
 * They are rendered here, beside the page, not inside the card or page that was pressed: a task card with a person's card over it
 * stays exactly as it was, Escape closes only the top one, and the cursor goes back to the name that was pressed.
 *
 * A name is turned into a person through the directory the avatars already load (AvatarContext.idFor): a name that is not a
 * staff member, or that two people share, is not a link at all, rather than a link to the wrong person.
 */
import { createContext, lazy, Suspense, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { useLocation } from "react-router-dom";
import { useAuth } from "../../context/AuthContext";
import { useAvatars } from "../../context/AvatarContext";

const loadCard = () => import("./PersonCard");
const loadOwn = () => import("../ProfileModal");
const PersonCard = lazy(loadCard);
const OwnCard = lazy(loadOwn);

const PersonContext = createContext({ open: null, resolve: () => null, warm: () => {}, me: null });

/** Start fetching the cards' code now (a pointer arriving on a name, or a quiet moment after sign-in). Asking again is free. */
function warm() {
  loadCard().catch(() => {});
}

export function PersonProvider({ children }) {
  const { profile } = useAuth();
  const { idFor } = useAvatars();
  const { pathname, search } = useLocation();
  const me = profile?.personId ? String(profile.personId) : null;

  // People opened one from another: [{ id, name }], the last one is on screen.
  const [trail, setTrail] = useState([]);

  const open = useCallback((ref) => {
    const id = ref?.personId ? String(ref.personId) : null;
    if (!id) return;
    setTrail((t) => (t.length && t[t.length - 1].id === id ? t : [...t, { id, name: ref.name || "" }]));
  }, []);
  const close = useCallback(() => setTrail([]), []);
  const back = useCallback(() => setTrail((t) => t.slice(0, -1)), []);

  // Going to another page, or signing out, puts the card away (the top bar's profile card does the same).
  useEffect(() => { setTrail([]); }, [pathname, search, me]);

  // A quiet moment after sign-in: fetch the card's code, so the first press opens it at once.
  useEffect(() => {
    if (!me) return undefined;
    const idle = window.requestIdleCallback
      ? window.requestIdleCallback(warm, { timeout: 6000 })
      : setTimeout(warm, 2500);
    return () => { if (window.cancelIdleCallback && window.requestIdleCallback) window.cancelIdleCallback(idle); else clearTimeout(idle); };
  }, [me]);

  const value = useMemo(
    () => ({ open: me ? open : null, resolve: idFor, warm, me }),
    [me, open, idFor],
  );

  const top = trail.length ? trail[trail.length - 1] : null;
  const before = trail.length > 1 ? trail[trail.length - 2] : null;

  return (
    <PersonContext.Provider value={value}>
      {children}
      {me && top && (
        <Suspense fallback={null}>
          {top.id === me
            ? <OwnCard key="me" onClose={close} />
            : <PersonCard key={top.id} personId={top.id} hintName={top.name} onClose={close} onBack={before ? back : undefined} backName={before?.name} />}
        </Suspense>
      )}
    </PersonContext.Provider>
  );
}

/** `{ open, resolve }`: `open({ personId, name })` shows that person's profile; null while nobody is signed in. */
export function usePerson() {
  return useContext(PersonContext);
}
