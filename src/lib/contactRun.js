/**
 * A run of the Contact Finder: what one press of "Find emails" does, and what it shows while it works and after.
 *
 * The run lives HERE, outside any component, so that leaving the page for another (the app is a single page, so that keeps this file loaded) does not
 * stop it; only closing the tab does. The page reads it with hooks/useContactRun.js and draws it (components/emails/RunPanel.jsx).
 *
 *   1. collecting   the companies are gathered from the sources the person turned on (lib/sources.js): Find a Tender is asked, the Reddit posts and the
 *                   typed lists are read, and the ones already on the list, or looked at lately with nothing found, are left out
 *   2. running      lib/autoFind.js `runAuto` does each company in turn: finds its website from its name, reads the website for its addresses and its social
 *                   links, saves the addresses worth writing to. With "Run on this computer" on and the finder program running here, the website is found and
 *                   read from this computer (its connection, and its browser for a site that shows no address); otherwise the server does it all
 *   3. done         the sum of it, and every company with what was found; the last run is kept in this browser so it is there on the next visit
 *
 * What was saved is already on the list; `saved` is the same rows again, for the page to show at once without reading the list for every company.
 */
import { runAuto } from "./autoFind";
import { buildTargets, targetKey } from "./sources";
import { pingLocalFinder } from "./localFinder";
import { findEmails, findEmailsOnThisComputer, findTenders, findWebsite, findWebsiteOnThisComputer, saveEmails, searchWeb } from "./redditWrites";

const LAST_KEY = "kazi.contactFinder.lastRun";
const TRIED_KEY = "kazi.contactFinder.tried";
const TRIED_KEEP_MS = 30 * 86_400_000;

const IDLE = { phase: "idle", startedAt: 0, finishedAt: 0, notes: [], message: "", rows: [], saved: [], local: false, stopping: false, restored: false };

/* ── What is kept in this browser ────────────────────────────── */

const store = {
  get(key) { try { return JSON.parse(localStorage.getItem(key)); } catch { return null; } },
  set(key, value) { try { localStorage.setItem(key, JSON.stringify(value)); } catch { /* a private window: it just isn't remembered */ } },
  remove(key) { try { localStorage.removeItem(key); } catch { /* nothing to remove */ } },
};

/** The last finished run, as it was kept: what was saved (the addresses), what was left alone and why, and the social links. */
function restore() {
  const last = store.get(LAST_KEY);
  if (!last || !Array.isArray(last.rows)) return IDLE;
  return { ...IDLE, phase: "done", restored: true, finishedAt: Number(last.finishedAt) || 0, notes: Array.isArray(last.notes) ? last.notes : [], message: String(last.message || ""), rows: last.rows };
}
const slim = (r) => ({
  name: r.name, website: r.website, status: r.status, note: r.note, via: r.via, about: r.about, leadId: r.leadId || null, socials: r.socials,
  saved: r.saved.map((s) => ({ email: s.email })), left: r.left.map(({ email, why }) => ({ email, why, canSave: false })),
});

/** { [targetKey]: when } for companies looked at with nothing found (dropped after a month). */
export function triedLately(now = Date.now()) {
  const all = store.get(TRIED_KEY);
  return all && typeof all === "object" ? Object.fromEntries(Object.entries(all).filter(([, at]) => now - Number(at) < TRIED_KEEP_MS)) : {};
}
/** Forget what was looked at, so the next run looks at those companies again. */
export const forgetTried = () => store.remove(TRIED_KEY);

/* ── The state, and who is told when it changes ──────────────── */

let state = restore();
let stopFlag = false;
const listeners = new Set();
function set(patch) {
  state = { ...state, ...patch };
  listeners.forEach((fn) => fn());
}
export const getRun = () => state;
export const subscribeRun = (fn) => { listeners.add(fn); return () => listeners.delete(fn); };
export const isBusy = () => state.phase === "collecting" || state.phase === "running";

function setRow(i, patch) {
  set({ rows: state.rows.map((r, j) => (j === i ? { ...r, ...patch } : r)) });
}

/* ── What a run calls ────────────────────────────────────────── */

/**
 * The functions `runAuto` calls. With the finder program on this computer in use, finding a website and a plain read go to it first; if it stops
 * answering part-way, the server does the rest. The browser read is only for a site that showed no address (autoFind.js `worthABrowser`).
 */
export function makeDeps({ robots, onThisComputer }) {
  const server = { findWebsite: (name) => findWebsite(name, { robots }), readSite: (url) => findEmails(url, { robots }) };
  if (!onThisComputer) return { ...server, readSiteOnThisComputer: null, save: saveEmails };
  let gone = false;                                   // the program stopped answering: the server takes over for the rest of the run
  const here = (local, fallback) => async (arg) => {
    if (gone) return fallback(arg);
    const out = await local(arg);
    if (out.unreachable) { gone = true; return fallback(arg); }
    return out;
  };
  return {
    findWebsite: here((name) => findWebsiteOnThisComputer(name, { robots }), server.findWebsite),
    readSite: here((url) => findEmailsOnThisComputer(url, { browser: false, robots }), server.readSite),
    readSiteOnThisComputer: (url) => findEmailsOnThisComputer(url, { browser: true, robots }),
    save: saveEmails,
  };
}

/* ── A run ────────────────────────────────────────────────────── */

const blank = (t) => ({ name: t.name, website: t.website || "", status: "waiting", note: "Waiting", saved: [], left: [], socials: {}, via: "", about: t.about || "", leadId: t.leadId || null });

function finish(patch) {
  const rows = patch.rows ?? state.rows;
  const finishedAt = Date.now();
  set({ ...patch, phase: "done", finishedAt, stopping: false });
  store.set(LAST_KEY, { finishedAt, notes: state.notes, message: state.message, rows: rows.map(slim) });
}

/**
 * Start a run. `config` is the person's sources (lib/sources.js), `local` whether they chose "Run on this computer", and `emails` and `leads` what the page
 * has loaded. Does nothing when a run is already going. Resolves when the run has ended (the page does not wait for it).
 */
export async function startRun({ config, local, emails, leads }) {
  if (isBusy()) return;
  stopFlag = false;
  set({ ...IDLE, phase: "collecting", startedAt: Date.now() });
  const notes = [];
  try {
    let onThisComputer = false;
    if (local) {
      const program = await pingLocalFinder();
      onThisComputer = program.running;
      if (!program.running) notes.push("\"Run on this computer\" is on, but the finder program isn't running here (or this browser didn't let the page reach it), so the server did the reading. See ? for how to start it.");
    }
    set({ local: onThisComputer });

    const built = await buildTargets(config, { leads, emails, tried: triedLately(), findTenders, searchWeb });
    notes.push(...built.notes);
    if (stopFlag) return finish({ notes, message: "Stopped before it began." });
    if (built.targets.length === 0) return finish({ notes, message: "Nothing new to look at. Change what to look for in Sources, or come back when there are new companies." });

    set({ phase: "running", notes, rows: built.targets.map(blank) });
    const results = await runAuto(built.targets, makeDeps({ robots: config.robots, onThisComputer }), {
      known: new Map((emails || []).map((e) => [e.email, e])),
      local: onThisComputer, people: config.people, pause: onThisComputer ? 300 : 800,
      onChange: (i, patch) => {
        setRow(i, patch);
        if (patch.status === "saved") set({ saved: [...state.saved, ...patch.saved] });
      },
      shouldStop: () => stopFlag,
    });

    const tried = triedLately();                     // companies where nothing was found are not looked at again for a while; one that failed, or never started, is
    results.forEach((r, i) => { if (r.status === "none" || r.status === "nosite") tried[targetKey(built.targets[i])] = Date.now(); });
    store.set(TRIED_KEY, tried);
    finish({ rows: state.rows, message: stopFlag ? "Stopped." : "" });
  } catch (err) {
    finish({ notes, message: `The run stopped: ${String(err?.message || err).slice(0, 160)}` });
  }
}

/** Ask the run to stop after the company it is on. */
export function stopRun() {
  if (!isBusy()) return;
  stopFlag = true;
  set({ stopping: true });
}

/** Clear a finished run from the page (and from this browser). */
export function dismissRun() {
  if (isBusy()) return;
  store.remove(LAST_KEY);
  set({ ...IDLE });
}

/** Save an address the run left alone because a person may well disagree (another domain, Gmail-type, a person's), with one press. */
export async function saveLeft(i, item) {
  const r = state.rows[i];
  if (!r || !item?.address) return { ok: false };
  const out = await saveEmails([{ ...item.address, brand: r.name, website: r.website, note: r.about || "Found automatically" }], { leadId: r.leadId, socials: r.socials });
  if (out.saved.length) {
    const count = r.saved.length + out.saved.length;
    setRow(i, { saved: [...r.saved, ...out.saved], left: r.left.filter((l) => l.email !== item.email), status: "saved", note: `Saved ${count} ${count === 1 ? "address" : "addresses"}.` });
    set({ saved: [...state.saved, ...out.saved] });
    store.set(LAST_KEY, { finishedAt: state.finishedAt, notes: state.notes, message: state.message, rows: state.rows.map(slim) });
  } else {
    setRow(i, { note: out.duplicates.length ? `${item.email} was already on the list.` : out.failed[0]?.message || "Not saved." });
  }
  return out;
}
