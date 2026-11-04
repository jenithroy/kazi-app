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
 */
const LOCAL_FINDER = "http://127.0.0.1:24781";                  // the port is also in scripts/email-finder/server.mjs
const GIVE_UP_MS = 90_000;                                      // the program stops a job itself at 75 seconds

export class FinderOffline extends Error {
  constructor() {
    super("The finder isn't running on this computer, or this browser didn't let the page reach it.");
    this.name = "FinderOffline";
  }
}

async function ask(path, body) {
  let res;
  try {
    res = await fetch(`${LOCAL_FINDER}${path}`, {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
      targetAddressSpace: "loopback",                           // Chrome wants a request to this computer to say so; other browsers ignore it
      signal: AbortSignal.timeout(GIVE_UP_MS),
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

/** Find a company's own website from its name, from this computer. Resolves to { site, host, confidence, evidence, tried, of } (worker/lib/siteFinder.js). */
export const runLocalWebsiteFinder = (name, { robots = true } = {}) => ask("/company", { name, robots });

/** Whether the program is running on this computer: { running: true, browser: "Chromium 152…", version: "1.1.0" } or { running: false }. Never throws; a refusal reads as "not running". */
export async function pingLocalFinder() {
  try {
    // a program that is not running refuses at once; the wait is for the browser's own question the first time ("allow this site to connect to apps on your computer?"), which a person needs a moment to answer
    const res = await fetch(`${LOCAL_FINDER}/ping`, { targetAddressSpace: "loopback", signal: AbortSignal.timeout(10_000) });
    const json = await res.json();
    return json?.app === "kazi-email-finder" ? { running: true, browser: String(json.browser || ""), version: String(json.version || "") } : { running: false };
  } catch {
    return { running: false };
  }
}
