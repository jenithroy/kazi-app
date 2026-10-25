/**
 * Open any customer's card from anywhere.
 *
 * The provider sits once, around the whole signed-in app (AppLayout, inside TechPackProvider so the card can open a tech pack). A
 * customer's name anywhere on a page (a bill, an order, a tech pack) is a <CustomerLink>; pressing it calls `open({ customerId, name })`
 * and the customer's card (the one the Customers and Sales pages open) appears over whatever page or card was pressed. It is drawn
 * here, beside the page, not inside the card or page that was pressed: that card stays exactly as it was underneath, Escape closes only
 * the top one, the cursor goes back to the name that was pressed, and going to another page puts the card away.
 *
 * The card's code is fetched when it is first wanted (a pointer arriving on a name, or a quiet moment after sign-in for someone who
 * may open it), and the card reads its own customer when it opens. If that code cannot be fetched, or the card throws, a small dialog
 * says so (CardBoundary): this provider sits above the page's own error screen, so without it one card could blank the whole app.
 *
 * A name is turned into a customer through a directory of every customer's id and name (directory.js). It is read the first time a
 * link is drawn or a name is looked up (one read of the customers), and never for a position that may not open Customers. If it
 * cannot be read, or the position can see no customers, every name stays plain text. A name two customers share is plain text too.
 * Customers change elsewhere (the Customers page, the clean-up of duplicates), and a name must never keep matching what is no longer
 * there, so once links have been drawn the directory is read again when the address changes, when the tab comes back after a minute,
 * after a customer is saved from the card, and (once for each) when a link carries an id the directory has never heard of.
 *
 *   const { open, resolve, warm } = useCustomer();
 *   open({ customerId, name, tab })   show the card (tab: "details" | "invoices" | "payments" | "orders"); null when a link is not allowed
 *   resolve(name)                     the one customer a typed name belongs to (their id), else null
 *   warm()                            start fetching the card's code
 *   has(id)  ensure(id)               the directory knows this id / read the directory (or read it again for an id it does not know)
 */
import { createContext, lazy, Suspense, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { useLocation } from "react-router-dom";
import { useAuth } from "../../context/AuthContext";
import { fetchAll } from "../../lib/db";
import { sectionVisible } from "../../utils/permissions";
import CardBoundary from "./CardBoundary";
import { IDLE, buildDirectory, idByName } from "./directory";
import "./customer-link.css";

const loadHost = () => import("./CustomerHost");
const CustomerHost = lazy(loadHost);

const Ctx = createContext({ open: null, resolve: () => null, warm: () => {}, has: () => false, ensure: () => {} });

const SOON_MS = 4_000;          // the least time between two looks caused by an id the directory does not know
const RETRY_MS = 30_000;        // how soon a directory that could not be read tries again
const STALE_MS = 60_000;        // a tab that has been in the background this long looks again when it comes back

/** Start fetching the card's code (a pointer arriving on a name, or a quiet moment after sign-in). Asking again is free. */
function warm() {
  loadHost().catch(() => {});
}

export function CustomerProvider({ children }) {
  const { profile } = useAuth();
  const { pathname, search } = useLocation();
  const me = profile?.personId ? String(profile.personId) : null;
  // The database lets exactly the positions with Customers read customers (row-level security), so this is the same answer the read would get,
  // asked before any read is made: a position without it never reads the customers at all.
  const canSee = Boolean(me) && sectionVisible(profile, "customers");

  const [dir, setDir] = useState(IDLE);                       // { status: idle | loading | ready | failed, ids, byName }
  // What has been read, kept up to date the moment it changes and not at the next draw: a read quicker than a draw must not be asked for twice.
  const dirRef = useRef(IDLE);
  const setDirectory = useCallback((next) => { dirRef.current = next; setDir(next); }, []);
  const busy = useRef(false);
  const again = useRef(false);                                // somebody asked for a fresh look while one was on its way: another follows it
  const stamp = useRef(0);                                    // when the last look started
  const gen = useRef(0);                                      // which person's session a look belongs to
  const alive = useRef(true);
  useEffect(() => { alive.current = true; return () => { alive.current = false; }; }, []);

  // A different person signed in (or out): what was read for the last one is thrown away. (Not on the first run: nothing has been read yet.)
  const lastMe = useRef(me);
  const asked = useRef(new Set());                            // ids a fresh look has already been asked for (one each, so one that never turns up costs one read)
  const later = useRef(0);
  useEffect(() => {
    if (lastMe.current === me) return;
    lastMe.current = me;
    gen.current += 1;
    setDirectory(IDLE);
    stamp.current = 0;
    asked.current = new Set();
    again.current = false;
    clearTimeout(later.current);
    later.current = 0;
  }, [me, setDirectory]);
  useEffect(() => () => clearTimeout(later.current), []);

  const load = useCallback(async function run() {
    if (!canSee || busy.current) return;
    busy.current = true;
    const mine = gen.current;
    stamp.current = Date.now();
    if (dirRef.current.status === "idle") setDirectory({ ...dirRef.current, status: "loading" });
    try {
      const rows = await fetchAll("customers");
      if (alive.current && mine === gen.current) setDirectory({ status: "ready", ...buildDirectory(rows) });
    } catch (err) {
      // a directory that cannot be read means no links, never a wrong one; what was read before stays
      console.warn("Customer links are off:", err?.message || err);
      if (alive.current && mine === gen.current && dirRef.current.status !== "ready") setDirectory({ ...IDLE, status: "failed" });
    } finally {
      busy.current = false;
      if (again.current) { again.current = false; run(); }
    }
  }, [canSee, setDirectory]);

  // A fresh look, because something may have changed. Never the FIRST read (that belongs to the first link drawn), and never lost: when a
  // look is already on its way, another follows it, so whatever changed meanwhile is not missed.
  const refresh = useCallback(() => {
    if (!canSee || dirRef.current.status === "idle") return;
    if (busy.current) { again.current = true; return; }
    load();
  }, [canSee, load]);

  // The first link drawn starts the read. After that a fresh look is only for an id the directory does not know (a customer added a
  // moment ago: once for each such id, a few seconds after the last look), or a retry after a failure.
  const ensure = useCallback((unknownId) => {
    if (!canSee) return;
    const d = dirRef.current;
    if (d.status === "idle") { load(); return; }
    if (d.status === "loading") return;
    if (d.status === "failed") { if (Date.now() - stamp.current > RETRY_MS) load(); return; }
    const id = unknownId ? String(unknownId) : "";
    if (!id || d.ids.has(id) || asked.current.has(id)) return;
    asked.current.add(id);
    const wait = Math.max(0, SOON_MS - (Date.now() - stamp.current));
    if (wait === 0) refresh();
    else if (!later.current) later.current = setTimeout(() => { later.current = 0; refresh(); }, wait);
  }, [canSee, load, refresh]);

  // Another page may have added, renamed, merged or deleted customers (the owner's clean-up of duplicates is exactly that), so going to
  // another page looks again; the names keep matching what was there until the answer is back.
  const lastPath = useRef(pathname);
  useEffect(() => {
    if (lastPath.current === pathname) return;       // (only a change of page: the first draw has nothing to look again at)
    lastPath.current = pathname;
    refresh();
  }, [pathname, refresh]);

  // The tab coming back after a while: names may have changed or been added elsewhere.
  useEffect(() => {
    if (!canSee) return undefined;
    const back = () => {
      if (document.visibilityState === "visible" && Date.now() - stamp.current > STALE_MS) refresh();
    };
    document.addEventListener("visibilitychange", back);
    return () => document.removeEventListener("visibilitychange", back);
  }, [canSee, refresh]);

  // A quiet moment after sign-in: fetch the card's CODE (not any customer), so the first press opens at once. Not for a position that may not open it.
  useEffect(() => {
    if (!canSee) return undefined;
    const idle = window.requestIdleCallback
      ? window.requestIdleCallback(warm, { timeout: 6000 })
      : setTimeout(warm, 2500);
    return () => { if (window.cancelIdleCallback && window.requestIdleCallback) window.cancelIdleCallback(idle); else clearTimeout(idle); };
  }, [canSee]);

  /* ── The card on screen ─────────────────────────────────────── */

  const [shown, setShown] = useState(null);                   // { id, name, tab, from, n }: the customer being shown
  const shownRef = useRef(shown);
  shownRef.current = shown;
  const seq = useRef(0);

  const open = useCallback((ref = {}) => {
    const id = ref.customerId ? String(ref.customerId) : idByName(dirRef.current, ref.name);
    if (!id) return;
    seq.current += 1;
    setShown({ id, name: ref.name || "", tab: ref.tab, from: ref.from || null, n: seq.current });
  }, []);

  const close = useCallback(() => {
    const from = shownRef.current?.from;
    setShown(null);
    // The dialog gives the cursor back to whatever had it, but a browser that does not focus a button when it is clicked (Safari) leaves
    // that as the page itself: so the name that was pressed is asked for it as well.
    if (from) requestAnimationFrame(() => { if (from.isConnected) from.focus({ preventScroll: true }); });
  }, []);

  // Going to another page, or signing out, puts the card away.
  useEffect(() => { setShown(null); }, [pathname, search, me]);

  const value = useMemo(() => ({
    open: canSee ? open : null,
    resolve: (name) => {
      if (!canSee) return null;
      // asked from a render: the read starts a moment later, and every name stays plain text until it is back
      if (dir.status === "idle") Promise.resolve().then(() => ensure());
      return idByName(dir, name);
    },
    has: (id) => Boolean(id) && dir.ids.has(String(id)),
    ensure,
    warm,
  }), [canSee, open, dir, ensure]);

  return (
    <Ctx.Provider value={value}>
      {children}
      {canSee && shown && (
        <CardBoundary key={shown.n} name={shown.name} onClose={close}>
          <Suspense fallback={null}>
            <CustomerHost customerId={shown.id} name={shown.name} tab={shown.tab} onClose={close} onChanged={refresh} />
          </Suspense>
        </CardBoundary>
      )}
    </Ctx.Provider>
  );
}

/** `{ open, resolve, warm }`: `open({ customerId, name })` shows that customer's card; `open` is null while nobody is signed in or the position may not open Customers. */
export function useCustomer() {
  return useContext(Ctx);
}
