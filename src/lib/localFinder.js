/**
 * Client for the finder program a person runs on their own computer (scripts/email-finder). It does the same two jobs as the Worker's routes
 * (lib/emailFinderApi.js), from that computer instead: finding a company's website from its name, and reading a website's contact pages, either
 * plainly through the computer's own internet connection (a server's data-centre address is turned away by many sites; a home connection is not)
 * or with the Chrome, Chromium or Edge already there, which also runs a page's scripts (a page that writes its own address with JavaScript).
 * It answers in the same shape as the Worker (a website read also says `via: "browser"` or `via: "computer"`), so the page shows and saves it the same way.
 *
 * The program listens only on this computer, so this is a request from the page to the machine it is open on. Chrome and Edge ask the
 * person once whether this site may connect to apps on their computer; Firefox lets it through; Safari does not. A refusal and a program
 * that is not running look the same from here (the request fails), so `FinderOffline` covers both and the caller can use the Worker instead.
 *
 * It also SEARCHES, with the browser on that computer (Bing, then DuckDuckGo), which the Worker cannot do without a paid search service and its key: the
 * page's Web search, a company's website from a search for its name when guessing the address found nothing sure, and a company's Facebook and Instagram
 * pages (the links only). A search engine may turn a search away and ask for a person; the program then opens one window on this computer for them to
 * answer (`help`), so those calls may take two minutes longer.
 */
const LOCAL_FINDER = "http://127.0.0.1:24781";                  // the port is also in scripts/email-finder/server.mjs
const GIVE_UP_MS = 90_000;                                      // the program stops a job itself at 75 seconds
const SEARCH_GIVE_UP_MS = 270_000;                              // a search may wait for a person to answer a check: the program stops itself by 255 seconds

export class FinderOffline extends Error {
  constructor() {
    super("Couldn't reach the finder program on this computer (it isn't started, or this browser blocked the connection).");
    this.name = "FinderOffline";
  }
}

async function ask(path, body, giveUpMs = GIVE_UP_MS) {
  let res;
  try {
    res = await fetch(`${LOCAL_FINDER}${path}`, {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
      targetAddressSpace: "loopback",                           // Chrome wants a request to this computer to say so; other browsers ignore it
      signal: AbortSignal.timeout(giveUpMs),
    });
  } catch (err) {
    if (err?.name === "TimeoutError") throw new Error("The finder on this computer took too long to answer.");
    throw new FinderOffline();
  }

  let json = null;
  try { json = await res.json(); } catch { /* not JSON: said below */ }
  if (res.status === 404 && !json?.result) throw new Error("The finder program on this computer is an older version. Close its window, update the folder and start it again.");
  if (!res.ok) throw new Error(typeof json?.error === "string" ? json.error : `The finder on this computer answered with an error (${res.status}).`);
  if (!json?.result) throw new Error("The finder's answer could not be read.");
  return json.result;
}

/**
 * Read a business's public contact pages from this computer. `browser: true` opens the page in this computer's browser; `false` reads it plainly through
 * this computer's connection (quicker). `robots: false` leaves the site's robots.txt unread (the person's own choice). Resolves to the finder's `result`
 * (worker/lib/contactFinder.js findContacts).
 */
export const runLocalEmailFinder = (url, { browser = true, robots = true } = {}) => ask("/find", { url, browser, robots });

/**
 * Find a company's own website from its name, from this computer: by trying the likely addresses, and, when that finds nothing sure, by a search for the name in
 * this computer's browser. Resolves to { site, host, confidence, evidence, tried, of, via?, searchBlocked? } (worker/lib/siteFinder.js, plus `via: "search"`).
 * `help: false` never opens a window for a person to answer a check a search engine asks.
 */
export const runLocalWebsiteFinder = (name, { robots = true, help = true } = {}) => ask("/company", { name, robots, help }, SEARCH_GIVE_UP_MS);

/** The Web search source, done in this computer's browser: each phrase searched, the results as the websites of businesses. Resolves to { searched, sites: [{ website, title, query }], engine, blocked, limited }. */
export const runLocalSearch = (queries, { help = true } = {}) => ask("/search", { queries, help }, SEARCH_GIVE_UP_MS);

/** A company's Facebook and Instagram pages, found by a search for its name (the links only). Resolves to { facebook?, instagram?, blocked, limited }. */
export const runLocalSocials = (name, { help = true } = {}) => ask("/socials", { name, help }, SEARCH_GIVE_UP_MS);

/** Whether the program is running on this computer: { running: true, browser: "Chromium 152…", version: "1.2.0", search: true } or { running: false }. `search` is false for a program too old to search. Never throws; a refusal reads as "not running". */
export async function pingLocalFinder() {
  try {
    // a program that is not running refuses at once; the wait is for the browser's own question the first time ("allow this site to connect to apps on your computer?"), which a person needs a moment to answer
    const res = await fetch(`${LOCAL_FINDER}/ping`, { targetAddressSpace: "loopback", signal: AbortSignal.timeout(10_000) });
    const json = await res.json();
    return json?.app === "kazi-email-finder" ? { running: true, browser: String(json.browser || ""), version: String(json.version || ""), search: json.search === true } : { running: false };
  } catch {
    return { running: false };
  }
}
