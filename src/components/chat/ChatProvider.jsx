/**
 * Open Chat from anywhere, as a window over the page you are on.
 *
 * Chat used to be a page of its own (/messenger). It is a window now, the way a person's profile is
 * (components/profile/PersonProvider.jsx): the top bar's Chat button, a profile's Message button and the Send dialog's Open Chat all
 * call `open()`, and the window appears over whatever page (or card) was showing, which stays exactly as it was. Escape, the close
 * button or a press on the dimmed page puts it away, and the cursor goes back to the button that opened it.
 *
 *   open()                          the window, on the conversation list
 *   open({ with: <person id> })     the conversation you have with that person, started if there is none (a profile's "Message")
 *   open({ thread: <thread id> })   one conversation you are already in (the Send dialog's "Open Chat" after a group)
 *
 * It comes in two pieces because each has to see the other. The window shows names that open a profile, so it must sit inside
 * PersonProvider; the profile card has a Message button that opens the window, so the state it answers to must sit outside.
 *
 *   ChatProvider   the state, at the very top of the signed-in app (AppLayout), where the top bar can reach it
 *   ChatHost       the window itself, mounted once inside the other providers
 *
 * `open` is null for someone whose position has no Chat (and while nobody is signed in), so nothing draws a button that could only
 * fail. The window's code is fetched a quiet moment after sign-in, so the first press does not wait for it.
 */
import { createContext, lazy, Suspense, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { useLocation } from "react-router-dom";
import { useAuth } from "../../context/AuthContext";
import { sectionVisible } from "../../utils/permissions";
import ErrorBoundary from "../ErrorBoundary";
import Modal from "../Modal";

const loadWindow = () => import("./ChatPopup");
const ChatWindow = lazy(loadWindow);

const ChatContext = createContext({ open: null, close: () => {}, request: null, warm: () => {} });

/** Start fetching the window's code now (a pointer arriving on the Chat button, or a quiet moment after sign-in). Asking again is free. */
function warm() {
  loadWindow().catch(() => {});
}

export function ChatProvider({ children }) {
  const { profile } = useAuth();
  const { pathname, search } = useLocation();
  const me = profile?.personId ? String(profile.personId) : null;
  const can = Boolean(me) && sectionVisible(profile, "messenger");

  // null while the window is shut; otherwise what it was asked to do. `at` tells a second ask from the one before it.
  const [request, setRequest] = useState(null);

  const open = useCallback((target) => {
    setRequest({
      at: Date.now(),
      withId: target?.with ? String(target.with) : null,
      threadId: target?.thread ? String(target.thread) : null,
    });
  }, []);
  const close = useCallback(() => setRequest(null), []);

  // Going to another page puts the window away, as it does a profile card. Not on the first render: the /messenger address asks for
  // the window from its own first render (pages/Messenger.jsx), and that ask must not be undone here.
  const here = useRef(`${pathname}${search}`);
  useEffect(() => {
    const now = `${pathname}${search}`;
    if (here.current === now) return;
    here.current = now;
    setRequest(null);
  }, [pathname, search]);

  // Signing out, or a position that no longer has Chat, shuts it too.
  useEffect(() => { if (!can) setRequest(null); }, [can]);

  // A quiet moment after sign-in: fetch the window's code, so the first press opens it at once. Not on a connection that asked to
  // save data or a very slow one (the same courtesy lib/lazyPages.js shows the pages).
  useEffect(() => {
    if (!can) return undefined;
    const connection = typeof navigator === "undefined" ? null : navigator.connection;
    if (connection?.saveData || /(^|-)2g$/.test(connection?.effectiveType || "")) return undefined;
    const idle = window.requestIdleCallback
      ? window.requestIdleCallback(warm, { timeout: 6000 })
      : setTimeout(warm, 2500);
    return () => { if (window.cancelIdleCallback && window.requestIdleCallback) window.cancelIdleCallback(idle); else clearTimeout(idle); };
  }, [can]);

  const value = useMemo(() => ({ open: can ? open : null, close, request, warm }), [can, open, close, request]);

  return <ChatContext.Provider value={value}>{children}</ChatContext.Provider>;
}

/** What is left if the window could not be drawn (its code did not load, or it crashed): the page behind it carries on, and this says so. */
function ChatFailed({ onClose }) {
  return (
    <Modal title="Chat" size="sm" glass onClose={onClose} footer={<button type="button" className="primary-button" onClick={onClose}>Close</button>}>
      <p className="kmodal-msg kmodal-msg--err" role="alert">
        Chat ran into a problem and stopped. Close this and open it again. If it keeps happening, please tell us in Bug Report.
      </p>
    </Modal>
  );
}

/**
 * The window. Mounted once, inside the other providers (AppLayout), so a name in a conversation can open that person's profile.
 * It has a boundary of its own: it is drawn beside the page, not inside the page's boundary (ProtectedRoute), so without one a
 * crash here (or its code failing to load) would take the whole app down instead of one window.
 */
export function ChatHost() {
  const { request, close } = useContext(ChatContext);
  if (!request) return null;
  return (
    <ErrorBoundary fallback={<ChatFailed onClose={close} />}>
      <Suspense fallback={null}>
        <ChatWindow request={request} onClose={close} />
      </Suspense>
    </ErrorBoundary>
  );
}

/** `{ open, close, warm }`: `open()` shows the window (see the top of this file for what it can be asked); `open` is null when this person has no Chat. */
export function useChat() {
  return useContext(ChatContext);
}
