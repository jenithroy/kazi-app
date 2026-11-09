/**
 * The contact finder that runs on a person's own computer: `npm start` in this folder (see README.md).
 *
 * The Contact Finder page normally asks the Worker to find a company's website and read its contact pages. The Worker can only fetch plain
 * pages from a data centre, so a site that writes its address with JavaScript, or turns a server's request away, comes back empty. This
 * program is the other way to do it: the page asks it, on this same computer, and it works from this computer's own internet connection,
 * and when a site needs one, with the Chrome, Chromium or Edge already here (browser.mjs). It answers in the same shape as the Worker's
 * routes, so the page shows and saves the result exactly as it does a server read. It saves nothing itself and holds nobody's login.
 *
 *   GET  /ping      { ok, app, version, browser }
 *   POST /find      { url, browser?, robots? }  ->  { ok, result }     result as worker/lib/contactFinder.js `findContacts`, plus via:
 *                   "browser" (the page is opened in the browser, its scripts run) or "computer" (`browser: false`: a plain read, this connection)
 *   POST /company   { name, robots?, search?, help? }  ->  { ok, result }   result as worker/lib/siteFinder.js `findWebsiteFor`; when guessing the address
 *                   found nothing sure enough, a search for the name in this computer's browser is tried (`search: false` leaves it out), and says via: "search"
 *   POST /search    { queries, help? }          ->  { ok, result }     { searched, sites: [{ website, title, query }], engine, blocked, limited }: the page's
 *                   "Web search", done in this computer's browser on Bing, then DuckDuckGo (search.mjs). No search service and no key
 *   POST /socials   { name, help? }             ->  { ok, result }     { facebook?, instagram?, blocked, limited }: the company's Facebook and Instagram pages
 *                   as found by a search for its name. The links only; the pages are not opened
 *   `help: false` never opens a window for a person to answer a check a search engine asks (search.mjs says when one is opened).
 *   `robots: false` is the person's own choice (Sources, "Respect robots.txt"): the site's robots.txt is then not read. Sites that may not be
 *   read as a company's website (eBay, social networks, search engines) stay closed either way: a search engine is only ever SEARCHED, in the browser,
 *   the way a person does it, and a social network's page is never opened.
 *
 * Who may ask: only this computer (it listens on 127.0.0.1), and only a page from the Kazi site or one served from this computer. Any web
 * page can make your browser send a request here; one from another site is refused by its Origin, and a name that someone's DNS points at
 * this computer is refused by its Host. One site is read at a time. The address is checked by the finder itself (public web addresses
 * only), so this cannot be used to look at anything inside a network.
 */
import http from "node:http";
import { readFileSync } from "node:fs";
import { FinderError, findContacts } from "../../worker/lib/contactFinder.js";
import { findWebsiteFor } from "../../worker/lib/siteFinder.js";
import { MAX_QUERIES } from "../../worker/lib/webSearch.js";
import { openReader, startBrowser } from "./browser.mjs";
import { plainFetch } from "./plain.mjs";
import { HELP_MS, createSearcher, findSocialsBySearch, findWebsiteBySearch, searchSites } from "./search.mjs";

const PORT = 24781;                                               // the page knows this number too: src/lib/localFinder.js
const SITE = "https://kazimfg.com.np";
const LOCAL_PAGE = /^http:\/\/(?:localhost|127\.0\.0\.1)(?::\d{1,5})?$/;      // a page served from this computer: the app while it is being worked on
const MAX_BODY = 8192;
const READ_MS = 75_000;                                           // one site, all its pages
const SEARCH_MS = 120_000;                                         // a search or two (they are paced a few seconds apart) and the guesses before them
const MIN_CONFIDENCE = 0.9;                                       // a website worked out from a name is used by itself above this (src/lib/autoFind.js MIN_CONFIDENCE)
/** How long a job may take: more when a visible window may be opened for a person to answer a check (search.mjs). */
const searchLimit = (body) => (body?.help === false ? SEARCH_MS : SEARCH_MS + HELP_MS + 15_000);
const TOO_SLOW = Symbol("too slow");
const VERSION = JSON.parse(readFileSync(new URL("./package.json", import.meta.url), "utf8")).version;

const allowedOrigin = (origin) => origin === SITE || LOCAL_PAGE.test(String(origin));

/** Why a request is refused before anything is read, or null. */
function refusal(req) {
  const host = String(req.headers.host || "").toLowerCase();
  if (host !== `127.0.0.1:${PORT}` && host !== `localhost:${PORT}`) return "That address is not this program's.";
  const origin = req.headers.origin;
  if (origin !== undefined) return allowedOrigin(origin) ? null : "This page may not use the finder on this computer.";
  // No Origin: a program run by hand (curl) sends nothing, but a browser always says where a request comes from, so one that does is not that
  const from = req.headers["sec-fetch-site"];
  return from && from !== "none" ? "This page may not use the finder on this computer." : null;
}

function send(req, res, status, body) {
  const headers = { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" };
  const origin = req.headers.origin;
  if (origin !== undefined && allowedOrigin(origin)) {
    Object.assign(headers, {
      "Access-Control-Allow-Origin": origin, Vary: "Origin", "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type", "Access-Control-Max-Age": "600",
    });
  }
  res.writeHead(status, headers);
  res.end(status === 204 ? undefined : JSON.stringify(body));
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    req.on("data", (chunk) => {
      size += chunk.length;
      if (size > MAX_BODY) { reject(new Error("too big")); req.destroy(); } else chunks.push(chunk);
    });
    req.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
    req.on("error", reject);
  });
}

function withDeadline(promise, ms) {
  let timer;
  const late = new Promise((_, reject) => { timer = setTimeout(() => reject(TOO_SLOW), ms); });
  return Promise.race([promise, late]).finally(() => clearTimeout(timer));
}

const clock = () => new Date().toLocaleTimeString([], { hour12: false });

let session = null;                                               // { browser, path, name, userAgent }
let starting = null;
async function browserNow() {
  if (session && session.browser.isConnected()) return session;
  starting ??= startBrowser().then((s) => { session = s; return s; }).finally(() => { starting = null; });
  return starting;
}

let searchContext = null;                                         // the headless browser's window searches are made in (in memory only: nothing of it is kept)
async function searchContextNow() {
  const s = await browserNow();
  if (!searchContext || searchContext.browser() !== s.browser) {
    searchContext = await s.browser.newContext({ userAgent: s.userAgent, acceptDownloads: false, serviceWorkers: "block", locale: "en-GB" });
  }
  return searchContext;
}
/** A window a person can see, for answering a check a search engine asks of a person. */
async function openWindow() {
  const s = await startBrowser({ headless: false });
  const context = await s.browser.newContext({ userAgent: s.userAgent, acceptDownloads: false, serviceWorkers: "block", locale: "en-GB" });
  console.log(`${clock()}  a search engine asked for a check: a window was opened for a person to answer it`);
  return { context, close: () => s.browser.close() };
}
let searcher = null;
const searcherNow = () => (searcher ??= createSearcher({ getContext: searchContextNow, openWindow, log: (message) => console.log(`${clock()}  ${message}`) }));

let busy = false;
/**
 * One job at a time (a second asks again in a moment). `work(body, onDone)` does the reading and resolves to the result; whatever it opens it hands
 * to `onDone` so it is closed whatever happens. The deadline is for the whole job.
 */
async function job(req, res, work, { ms = READ_MS } = {}) {
  if (!String(req.headers["content-type"] || "").toLowerCase().startsWith("application/json")) return send(req, res, 415, { error: "That request could not be read." });
  let body;
  try { body = JSON.parse(await readBody(req)); } catch { return send(req, res, 400, { error: "That request could not be read." }); }
  if (busy) return send(req, res, 429, { error: "The finder is still reading another site. Try again in a moment." });
  busy = true;
  let cleanup = null;
  let reply;
  try {
    const limit = typeof ms === "function" ? ms(body) : ms;
    const working = work(body, (fn) => { cleanup = fn; }, Date.now() + limit - 5_000);     // the searches stop themselves before the deadline, with what they have
    working.catch(() => {});                                       // if the deadline wins, what it throws later is of no interest
    reply = [200, { ok: true, result: await withDeadline(working, limit) }];
  } catch (err) {
    if (err instanceof FinderError) reply = [400, { error: err.message }];
    else if (err === TOO_SLOW) { console.log(`${clock()}  gave up after the job's time was up`); reply = [504, { error: "That took too long." }]; }
    else { console.error(`${clock()}  ${err?.message || err}`); reply = [500, { error: "The finder on this computer ran into a problem reading that site. Try again." }]; }
  }
  await cleanup?.();
  busy = false;                                                    // before the answer goes out: whoever gets it may press again at once
  send(req, res, ...reply);
}

/** Read a business's contact pages: in the browser (the default), or plainly from this computer's connection (`browser: false`). */
async function find(body, onDone) {
  const inBrowser = body?.browser !== false;
  let fetchImpl = plainFetch;
  if (inBrowser) {
    const reader = await openReader(await browserNow(), { plainFetch });
    onDone(() => reader.close());
    fetchImpl = reader.fetch;
  }
  const result = await findContacts(body?.url, { fetchImpl, respectRobots: body?.robots !== false });
  console.log(`${clock()}  ${result.host}  ${result.ok ? `${result.pages.length} page(s), ${result.emails.length} address(es)` : result.message}${inBrowser ? "  (browser)" : ""}`);
  return { ...result, via: inBrowser ? "browser" : "computer" };
}

/** Find a company's own website from its name. */
async function company(body, onDone, until) {
  const name = typeof body?.name === "string" ? body.name.trim() : "";
  if (!name) throw new FinderError("Type the company's name first.");
  if (name.length > 200) throw new FinderError("That name is too long.");
  let result = await findWebsiteFor(name, { fetchImpl: plainFetch, respectRobots: body?.robots !== false });
  const help = body?.help !== false;
  if ((!result.site || Number(result.confidence) < MIN_CONFIDENCE) && body?.search !== false && searcherNow().available(help)) {
    // guessing the address found nothing sure enough: search for the name in the browser, as a person would
    const found = await findWebsiteBySearch(searcherNow(), name, { help, until });
    if (found.site && Number(found.confidence) > Number(result.confidence || 0)) result = { ...result, ...found, tried: result.tried, of: result.of };
    if (found.blocked) result = { ...result, searchBlocked: true };
    if (found.limited) result = { ...result, searchLimited: true };
  }
  console.log(`${clock()}  "${name.slice(0, 50)}"  ${result.site ? `${result.host}${result.via === "search" ? "  (search)" : ""}` : `no website found (${result.tried} of ${result.of} tried)`}`);
  return result;
}

/** The page's Web search: each phrase searched in this computer's browser, the results as the websites of businesses. */
async function search(body, onDone, until) {
  const queries = [...new Set((Array.isArray(body?.queries) ? body.queries : []).map((q) => String(q ?? "").trim().replace(/\s+/g, " ")).filter((q) => q.length >= 3 && q.length <= 200))].slice(0, MAX_QUERIES);
  if (queries.length === 0) throw new FinderError("Type what to search for first.");
  const out = await searchSites(searcherNow(), queries, { help: body?.help !== false, until });
  console.log(`${clock()}  searched ${out.searched} of ${queries.length}${out.engine ? ` on ${out.engine}` : ""}: ${out.sites.length} website(s)${out.blocked ? (out.timeUp ? "  (ran out of time: stopped)" : "  (an engine asked for a person: stopped)") : ""}${out.limited ? "  (the hour's searches are used up)" : ""}`);
  return out;
}

/** A company's Facebook and Instagram pages, as found by a search for its name (the links only). */
async function socials(body, onDone, until) {
  const name = typeof body?.name === "string" ? body.name.trim() : "";
  if (!name) throw new FinderError("Type the company's name first.");
  if (name.length > 200) throw new FinderError("That name is too long.");
  const out = await findSocialsBySearch(searcherNow(), name, { help: body?.help !== false, until });
  console.log(`${clock()}  "${name.slice(0, 50)}"  socials: ${[out.facebook && "facebook", out.instagram && "instagram"].filter(Boolean).join(", ") || "none"}${out.blocked ? "  (an engine asked for a person)" : ""}`);
  return out;
}

async function handle(req, res) {
  const why = refusal(req);
  if (why) return send(req, res, 403, { error: why });
  const path = new URL(req.url, "http://127.0.0.1").pathname;
  if (req.method === "OPTIONS") return send(req, res, 204);
  if (req.method === "GET" && path === "/ping") return send(req, res, 200, { ok: true, app: "kazi-email-finder", version: VERSION, browser: session?.name || null, search: true });
  if (req.method === "POST" && path === "/find") return job(req, res, find);
  if (req.method === "POST" && path === "/company") return job(req, res, company, { ms: searchLimit });
  if (req.method === "POST" && path === "/search") return job(req, res, search, { ms: searchLimit });
  if (req.method === "POST" && path === "/socials") return job(req, res, socials, { ms: searchLimit });
  return send(req, res, 404, { error: "Not found." });
}

const server = http.createServer((req, res) => {
  handle(req, res).catch((err) => {
    console.error(`${clock()}  ${err?.message || err}`);
    if (!res.headersSent) send(req, res, 500, { error: "The finder on this computer ran into a problem. Try again." });
  });
});

server.on("error", (err) => {
  console.error(err.code === "EADDRINUSE" ? `Port ${PORT} is already in use. Is the finder already running in another window?` : err.message);
  process.exit(1);
});

let stopping = false;
async function stop() {
  if (stopping) return;
  stopping = true;
  server.close();
  await searcher?.close().catch(() => {});
  await session?.browser.close().catch(() => {});
  process.exit(0);
}
process.on("SIGINT", stop);
process.on("SIGTERM", stop);

try {
  await browserNow();                                              // start the browser now, so a missing one is said before anyone presses a button
} catch (err) {
  console.error(err.message);
  process.exit(1);
}
server.listen(PORT, "127.0.0.1", () => {
  console.log(`Kazi contact finder ${VERSION} is running.`);
  console.log(`  Browser:   ${session.name}${session.path ? ` (${session.path})` : ""}`);
  console.log(`  Listening: http://127.0.0.1:${PORT}   (this computer only)`);
  console.log(`  Used by:   ${SITE}, and pages served from this computer`);
  console.log("In the Contact Finder (Marketing menu), open Sources and turn on \"Run on this computer\", then press Find emails. Leave this window open; press Ctrl+C to stop.");
});
