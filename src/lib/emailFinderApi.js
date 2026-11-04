/**
 * Client for this app's own Worker routes behind the Contact Finder (worker/lib/emailFinder.js):
 *
 *   POST /api/email-finder/site     read one business's public contact pages and say what addresses they show
 *   POST /api/email-finder/tenders  read the public notices on Find a Tender and say which are about clothing or textiles, and who to write to
 *   POST /api/email-finder/company  find a company's own website from its name (it guesses addresses and checks the page is that company's)
 *   POST /api/email-finder/search   search the web through Brave's Search API for the websites of businesses (needs the key on the server)
 *
 * Same-origin, with the session token every query carries (lib/workerApi.js). The same two jobs (find a website, read a website) done on the
 * person's own computer instead, with its internet connection and its browser, are lib/localFinder.js.
 */
import { callWorker } from "./workerApi";

const PAGE = { page: "the Contact Finder" };

/**
 * Read a business's public contact pages. Resolves to the finder's `result` (see worker/lib/contactFinder.js findContacts). `robots: false` is the
 * person's own choice not to have the site's robots.txt read (Sources, "Respect robots.txt"); eBay, social networks and search engines stay closed.
 */
export async function runEmailFinder(url, { robots = true } = {}) {
  const json = await callWorker("/api/email-finder/site", { url, robots }, PAGE);
  if (!json.result) throw new Error("The server's answer could not be read.");
  return json.result;
}

/** Find a company's own website from its name. Resolves to { site, host, confidence, evidence, tried, of }; `site` is null when none could be found (`tried` under `of` means it ran out of time). */
export async function runFindWebsite(name, { robots = true } = {}) {
  const json = await callWorker("/api/email-finder/company", { name, robots }, PAGE);
  if (!json.result || !("site" in json.result)) throw new Error("The server's answer could not be read.");
  return json.result;
}

/** Read Find a Tender. `params` is { stage: "tender" | "award", days, words }. Resolves to the search's `result` (see worker/lib/tenders.js searchTenders). */
export async function runTenderSearch(params) {
  const json = await callWorker("/api/email-finder/tenders", params, PAGE);
  if (!json.result || !Array.isArray(json.result.notices)) throw new Error("The server's answer could not be read.");
  return json.result;
}

/** Search the web (through the server's search service) for the websites of businesses. `queries` is a list of phrases. Resolves to { searched, sites: [{ website, title, query }] }. */
export async function runWebSearch(queries) {
  const json = await callWorker("/api/email-finder/search", { queries }, PAGE);
  if (!json.result || !Array.isArray(json.result.sites)) throw new Error("The server's answer could not be read.");
  return json.result;
}
