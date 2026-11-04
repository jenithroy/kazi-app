/**
 * The browser half of the finder program that runs on a person's own computer (see README.md in this folder).
 *
 * What it gives the finder: a `fetch` that opens a page in the Chrome, Chromium or Edge already installed here, lets the page's scripts
 * run, and hands back what the page looks like by then. Many shops write their contact address with JavaScript, or turn a server's request
 * away and let a person's browser in; this reads those.
 *
 * The finder's rules are NOT written again here. worker/lib/contactFinder.js (`findContacts`) takes the function it fetches with, and this
 * file is that function, so everything the server finder promises still holds: robots.txt is read first, at most the home page and two
 * contact pages, only that one site, every redirect checked, an honest name, nothing but public web addresses. What is added is only what a
 * browser can do that a plain request cannot, held to the same manners:
 *   - a page is read once its scripts have had a moment to write it (see `settle`), not when everything on it has finished loading;
 *   - the browser never follows a redirect on its own. A redirect, or a script that sends the page on to another address, is stopped
 *     before the new address is asked for and handed back as a redirect for `getPage` to judge (the same site? a public address?),
 *     exactly as for the server;
 *   - nothing is fetched for a page except from a public web address, and pictures, video and fonts are not fetched at all;
 *   - the name it gives is the browser's own with the finder's honest one added (worker/lib/contactFinder.js FINDER_UA), and nothing is
 *     done to hide that it is automated;
 *   - no cookies, sign-ins or history are kept: every read starts from an empty profile, and this computer's own Chrome profile is never opened.
 */
import { existsSync } from "node:fs";
import { chromium } from "playwright-core";
import { FINDER_UA, isPublicHostname } from "../../worker/lib/contactFinder.js";

const NAV_MS = 20_000;          // for a page to start coming
const SETTLE_MIN_MS = 1_000;    // then, always, for its scripts to write what they write (an address is quick, but not instant)
const SETTLE_MAX_MS = 3_000;    // and at most, for them to stop changing the page
const LOOK_MS = 250;            // how often that is looked at
const NOT_FETCHED = new Set(["Image", "Media", "Font"]);
const NO_BODY = new Set([101, 204, 205, 304]);

export const NO_BROWSER = "No Chrome, Chromium or Edge was found on this computer. Install Google Chrome (https://www.google.com/chrome) and start this again, "
  + "or set FINDER_BROWSER to the full path of the browser's program.";

/** Where Chrome, Chromium or Edge usually is, best first. */
function usualPlaces() {
  if (process.platform === "win32") {
    const roots = [process.env.PROGRAMFILES, process.env["PROGRAMFILES(X86)"], process.env.LOCALAPPDATA].filter(Boolean);
    return [
      ...roots.map((r) => `${r}\\Google\\Chrome\\Application\\chrome.exe`),
      ...roots.map((r) => `${r}\\Microsoft\\Edge\\Application\\msedge.exe`),
    ];
  }
  if (process.platform === "darwin") {
    return [
      "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
      "/Applications/Chromium.app/Contents/MacOS/Chromium",
      "/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge",
    ];
  }
  return [
    "/usr/bin/google-chrome-stable", "/usr/bin/google-chrome", "/usr/bin/chromium", "/usr/bin/chromium-browser", "/snap/bin/chromium",
    "/usr/bin/microsoft-edge-stable", "/usr/bin/microsoft-edge",
  ];
}

/** The browser to use: the one FINDER_BROWSER names, else the first usual place that has one, else null (Playwright's own, if it was installed). */
export function findBrowserPath(env = process.env) {
  if (env.FINDER_BROWSER) {
    if (!existsSync(env.FINDER_BROWSER)) throw new Error(`FINDER_BROWSER points at ${env.FINDER_BROWSER}, and there is no such file.`);
    return env.FINDER_BROWSER;
  }
  return usualPlaces().find((p) => existsSync(p)) || null;
}

/**
 * Start the browser (`args` are extra command-line switches, for tests). Resolves to { browser, path, name, userAgent }: `name` reads "Chromium 152.0.7977.82" for the start-up message and
 * `userAgent` is the browser's own name with the finder's honest one after it. Throws an Error whose message says what to do.
 */
export async function startBrowser({ args = [] } = {}) {
  const path = findBrowserPath();
  let browser;
  try {
    // Playwright starts the browser with its pop-up blocker off; a page the finder reads should not be able to open windows
    browser = await chromium.launch({ headless: true, args, ignoreDefaultArgs: ["--disable-popup-blocking"], ...(path ? { executablePath: path } : {}) });
  } catch (err) {
    if (!path) throw new Error(NO_BROWSER);
    throw new Error(`Could not start ${path}: ${String(err?.message || err).split("\n")[0]}`);
  }
  const probe = await browser.newPage();
  const own = await probe.evaluate(() => navigator.userAgent);
  await probe.close();
  return { browser, path, name: `Chromium ${browser.version()}`, userAgent: `${own} ${FINDER_UA}` };
}

/**
 * After a page has started, give its scripts the time to write what they write: at least SETTLE_MIN_MS, then until the page's TEXT is the same on two
 * looks in a row (half a second), or SETTLE_MAX_MS is up. The page's own `load` is not waited for (it waits for every advertisement and tracker, and
 * on a shop took 3 to 6 seconds a page for nothing a reader needs), nor is the network going quiet (a modern page talks to its analytics and chat
 * widgets for ever). The text, not the markup, is what is compared: a slider or a cookie banner keeps changing the markup.
 */
async function settle(page) {
  let last = -1;
  let still = 0;
  for (let waited = 0; waited < SETTLE_MAX_MS;) {
    await page.waitForTimeout(LOOK_MS);
    waited += LOOK_MS;
    const size = await page.evaluate(() => (document.documentElement.textContent || "").length).catch(() => -1);
    still = size === last ? still + 1 : 0;
    last = size;
    if (still >= 2 && waited >= SETTLE_MIN_MS) return;
  }
}

const sentOnTo = (location) => new Response(null, { status: 302, headers: { location } });
const answer = (status, body, headers) => new Response(NO_BODY.has(status) ? null : body, { status: Math.min(599, Math.max(200, status)), headers });

/**
 * One read of one site. Resolves to { fetch, close }: `fetch` is what `findContacts` takes as `fetchImpl`, and `close` ends the browser
 * window it used (always call it). `plainFetch` reads robots.txt, which is a file and not a page and is asked for the way the server asks.
 */
export async function openReader({ browser, userAgent }, { plainFetch = fetch } = {}) {
  const context = await browser.newContext({ userAgent, acceptDownloads: false, serviceWorkers: "block", locale: "en-US" });

  /**
   * Take charge of what the page's window asks for, at the level of the browser's own network layer. Playwright's `route` is not enough:
   * it never sees a redirect's second request, so the browser would already have gone to the new address when it could be judged. Here a
   * redirect is seen as the answer it is, before it is followed, and refused. Returns the record of what was refused: { sentOn }.
   */
  async function guard(page) {
    const cdp = await context.newCDPSession(page);
    const mainFrame = (await cdp.send("Page.getFrameTree")).frameTree.frame.id;
    const record = { sentOn: null };
    let documents = 0;              // the page's own documents asked for: the first is the address read, any later one is the page being sent on
    const refuse = (id) => cdp.send("Fetch.failRequest", { requestId: id, errorReason: "BlockedByClient" }).catch(() => {});
    const proceed = (id) => cdp.send("Fetch.continueRequest", { requestId: id }).catch(() => {});
    cdp.on("Fetch.requestPaused", (e) => {
      const own = e.frameId === mainFrame && e.resourceType === "Document";
      if (e.responseStatusCode !== undefined || e.responseErrorReason !== undefined) {              // an answer, not yet acted on
        const where = (e.responseHeaders || []).find((h) => h.name.toLowerCase() === "location")?.value;
        if (own && e.responseStatusCode >= 300 && e.responseStatusCode < 400 && where) { record.sentOn = where; return refuse(e.requestId); }
        return proceed(e.requestId);
      }
      let to;
      try { to = new URL(e.request.url); } catch { return refuse(e.requestId); }
      if (own) {
        documents += 1;
        if (documents > 1) { record.sentOn = e.request.url; return refuse(e.requestId); }
      }
      if ((to.protocol === "http:" || to.protocol === "https:") && !isPublicHostname(to.hostname)) return refuse(e.requestId);
      if (NOT_FETCHED.has(e.resourceType)) return refuse(e.requestId);
      return proceed(e.requestId);
    });
    await cdp.send("Fetch.enable", { patterns: [{ urlPattern: "*", requestStage: "Request" }, { urlPattern: "*", resourceType: "Document", requestStage: "Response" }] });
    return record;
  }

  async function readPage(url) {
    const page = await context.newPage();
    page.on("popup", (popup) => popup.close().catch(() => {}));          // the browser's own pop-up blocker is on; this is for one that gets through
    try {
      const read = await guard(page);
      let resp;
      try {
        resp = await page.goto(url, { waitUntil: "domcontentloaded", timeout: NAV_MS });
      } catch (err) {
        if (read.sentOn) return sentOnTo(read.sentOn);                          // the server redirected: the hop was not made
        if (/download is starting/i.test(String(err?.message))) return answer(200, null, { "content-type": "application/octet-stream" });
        throw err;                                                              // not reachable: `getPage` says so
      }
      if (read.sentOn) return sentOnTo(read.sentOn);
      const status = resp ? resp.status() : 200;
      const type = String((resp && resp.headers()["content-type"]) || "").toLowerCase();
      const readable = !type || type.includes("html") || type.includes("text/") || type.includes("xml");
      if (status >= 400 || !readable) return answer(status, null, type ? { "content-type": type } : {});
      await settle(page);
      if (read.sentOn) return sentOnTo(read.sentOn);                            // a script moved the page on while it settled
      return answer(status, await page.content(), { "content-type": "text/html; charset=utf-8" });
    } finally {
      await page.close().catch(() => {});
    }
  }

  return {
    fetch: (url, init = {}) => (new URL(url).pathname === "/robots.txt" ? plainFetch(url, init) : readPage(url)),
    close: () => context.close().catch(() => {}),
  };
}
