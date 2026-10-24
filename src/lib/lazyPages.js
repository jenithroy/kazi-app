import { lazy } from "react";

/**
 * The pages, each in a chunk of its own.
 *
 * The whole app used to be one 3.4 MB script: every page, the PDF maker and the charts were downloaded and run
 * before the first screen, whichever page was wanted. Now a page's code is fetched the first time it is needed,
 * and everything below starts that fetch early so nobody waits for it:
 *
 *   - the page the address names is fetched at once, in parallel with the sign-in check (preloadForPath);
 *   - once somebody is signed in, the pages their menu shows are fetched quietly, one at a time (preloadQuietly),
 *     so moving between pages does not wait on the network.
 *
 * Login stays in the main script: it is the first thing a signed-out person sees. The stylesheets do not move,
 * see allStyles.js.
 */
const page = (load) => {
  const Page = lazy(load);
  Page.preload = load;
  return Page;
};

export const Dashboard = page(() => import("../pages/Dashboard"));
export const Attendance = page(() => import("../pages/Attendance"));
export const Production = page(() => import("../pages/Production"));
export const Inventory = page(() => import("../pages/Inventory"));
export const Finance = page(() => import("../pages/Finance"));
export const FiscalYearTransactions = page(() => import("../pages/FiscalYearTransactions"));
export const Purchases = page(() => import("../pages/Purchases"));
export const Tasks = page(() => import("../pages/Tasks"));
export const Budget = page(() => import("../pages/Budget"));
export const Billing = page(() => import("../pages/Billing"));
export const Employees = page(() => import("../pages/Employees"));
export const AdminPanel = page(() => import("../pages/AdminPanel"));
export const Usage = page(() => import("../pages/Usage"));
export const Roles = page(() => import("../pages/Roles"));
export const Leaderboard = page(() => import("../pages/Leaderboard"));
export const Customers = page(() => import("../pages/Customers"));
export const Messenger = page(() => import("../pages/Messenger"));
export const Sales = page(() => import("../pages/Sales"));
export const Marketing = page(() => import("../pages/Marketing"));
export const MetaAds = page(() => import("../pages/MetaAds"));
export const BugReport = page(() => import("../pages/BugReport"));
export const Changelog = page(() => import("../pages/Changelog"));

const exact = (path) => (pathname) => pathname === path;
const under = (path) => (pathname) => pathname === path || pathname.startsWith(`${path}/`);

/** Which page an address opens. The first match wins, so a more specific address goes above the one it sits under. */
const BY_PATH = [
  [under("/dashboard"), Dashboard],
  [under("/tasks"), Tasks],
  [under("/attendance"), Attendance],
  [under("/production"), Production],
  [under("/inventory"), Inventory],
  [under("/sales"), Sales],
  [exact("/finance"), Finance],
  [under("/finance"), FiscalYearTransactions],
  [under("/purchases"), Purchases],
  [under("/billing"), Billing],
  [under("/content"), Budget],
  [under("/employees"), Employees],
  [under("/customers"), Customers],
  [under("/marketing/meta-ads"), MetaAds],
  [under("/marketing"), Marketing],
  [under("/messenger"), Messenger],
  [under("/admin"), AdminPanel],
  [under("/usage"), Usage],
  [under("/roles"), Roles],
  [under("/leaderboard"), Leaderboard],
  [under("/bug-report"), BugReport],
  [under("/changelog"), Changelog],
];

const pageFor = (pathname) => (BY_PATH.find(([matches]) => matches(pathname)) || [])[1];

/** Start fetching the page an address asks for. Asking again costs nothing: the browser keeps the first download. */
export function preloadForPath(pathname) {
  const target = pathname === "/" ? Dashboard : pageFor(pathname);
  if (target) target.preload().catch(() => {});
}

/** Pages that bring a big library with them (the charts), so they are fetched only when somebody asks for them. */
const ONLY_WHEN_ASKED = new Set([Usage]);

/**
 * Fetch the pages these addresses open, one at a time, while the browser has nothing better to do. Returns a function
 * that stops it. Does nothing on a connection that asked to save data, or a very slow one.
 */
export function preloadQuietly(paths) {
  const connection = typeof navigator === "undefined" ? null : navigator.connection;
  if (connection?.saveData || /(^|-)2g$/.test(connection?.effectiveType || "")) return () => {};

  const queue = [...new Set(paths.map(pageFor).filter((target) => target && !ONLY_WHEN_ASKED.has(target)))];
  let stopped = false;
  let timer = 0;
  const whenIdle = (fn) => (window.requestIdleCallback ? window.requestIdleCallback(fn, { timeout: 4000 }) : setTimeout(fn, 400));
  const step = () => {
    const next = queue.shift();
    if (stopped || !next) return;
    next.preload().catch(() => {}).finally(() => { timer = setTimeout(() => whenIdle(step), 120); });
  };
  whenIdle(step);
  return () => { stopped = true; clearTimeout(timer); };
}

if (typeof window !== "undefined") {
  // The page this address asks for starts downloading now, while the sign-in check is still running.
  preloadForPath(window.location.pathname);

  // A tab left open across a deploy still asks for chunk files the new deploy no longer has. The first time that fails,
  // reload once so the tab picks up the new files (a form not yet saved is lost, which is why the pages are fetched ahead
  // of time and this is rare). If it happens again within seconds, stop and let the error show rather than loop.
  window.addEventListener("vite:preloadError", () => {
    let reload = false;
    try {
      const KEY = "kazi.chunkReloadAt";
      if (Date.now() - Number(sessionStorage.getItem(KEY) || 0) > 20000) {
        sessionStorage.setItem(KEY, String(Date.now()));
        reload = true;
      }
    } catch {
      // No sessionStorage: do not risk a reload loop.
    }
    // The error is never swallowed: it reaches the error screen with its real message whether or not the page reloads.
    if (reload) window.location.reload();
  });
}
