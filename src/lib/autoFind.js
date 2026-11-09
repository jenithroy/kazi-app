/**
 * The automatic finder: hand it companies and it does the whole job for each, one after another, with nobody pressing anything in between.
 *
 *   1. A company with no website: find its own website from its name (the Worker guesses addresses and checks that the page is that company's).
 *   2. Read the website for its public contact addresses and its social links. The Worker reads it; when that shows no address, or the site
 *      turns the Worker away, and the finder program is running on this computer, this computer's own browser reads it instead.
 *   3. Save the addresses worth writing to, each with where it came from.
 *
 * It reads a company's own website, which is what the manual finders read too. A social network's page is never opened (they ask for a sign-in and show
 * a program next to nothing without one). With the finder program running on this computer it also SEARCHES, in that computer's browser (Bing, then
 * DuckDuckGo, as a person would): for a company's website when guessing the address found nothing sure (that is the program's, see `findWebsite`), and for its
 * Facebook and Instagram pages when its own website did not link them, or it has no website: the links the search results give, nothing more. When a search
 * engine asks for a person to check, the program asks a person (one window) and the searches stop for the rest of the run if nobody answers: nothing is got past.
 *
 * Which addresses it saves by itself: the company's own (on its own website's domain), a company's address (sales@, enquiries@, contact@) and not
 * a person's, not Gmail-type, not already on the list, not meant for something other than selling to (jobs@, support@, privacy@ …), and at most
 * three per company. A person's address is personal data, and nobody is looking when this runs, so those are left for a person to choose, unless
 * they switched on "Also save a person's own address" (`people`). What it saw and left alone is said, with why, and the reasons a person may well
 * disagree with (a person's, another domain, Gmail-type) can be saved with one press.
 *
 * `runAuto` knows nothing of the page or the network: it is handed what to call (`deps`), so its rules can be tested on their own.
 */
import { brandFromSite, normalizeWebsite } from "./redditLeads";

export const MAX_COMPANIES = 100;
export const MAX_PER_COMPANY = 3;
// A website worked out from a name is only read, and its addresses only saved, by itself when the page was clearly that company's: a name made of
// common words ("The Window Treatments Company") can be matched by another business that uses the same words. Below this it is shown, not used.
export const MIN_CONFIDENCE = 0.9;

// the part before the @ of an address that is for something other than selling to: work, help, rules, accounts
export const NOT_FOR_SALES = new Set([
  "job", "jobs", "career", "careers", "recruit", "recruiting", "recruitment", "hr", "vacancies", "apply", "applications",
  "support", "help", "helpdesk", "privacy", "dpo", "gdpr", "legal", "abuse", "webmaster", "postmaster", "noreply", "no-reply", "donotreply",
  "do-not-reply", "press", "media", "accounts", "billing", "invoices", "invoice", "payments", "unsubscribe",
]);

const SEARCH_STOPPED = "A search engine asked for a person to check and nobody answered, so the browser stopped searching for the rest of this run (company websites are still read). Try again in a while.";
const SEARCH_USED_UP = "The hour's searches on this computer are used up, so the browser stopped searching for the rest of this run. Try again in a while.";

const URL_LIKE = /^(?:https?:\/\/)?(?:[a-z0-9-]+\.)+[a-z]{2,}(?::\d+)?(?:[/?#]\S*)?$/i;
const EBAY_STORE = /^(?:https?:\/\/)?(?:[a-z0-9-]+\.)?ebay\.[a-z.]{2,}\/(?:str|usr)\/([A-Za-z0-9._-]+)/i;

/**
 * One line somebody pasted, as a company to look for: { name, website, about } or null for a line with nothing in it. A line may be a website
 * ("brand.com"), a company name ("Hunter Apparel Solutions Ltd"), or both ("Sulis Silks, sulis.co.uk"). A link to an eBay store gives its
 * store name only (eBay itself is never read): the name is looked for like any other.
 */
export function targetFromLine(line) {
  const text = String(line ?? "").replace(/^\s*(?:[-*•]|\d+[.)])\s+/, "").replace(/^["'“‘]+|["'”’]+$/g, "").trim();
  if (text.length < 3) return null;
  const ebay = EBAY_STORE.exec(text);
  if (ebay) return { name: ebay[1].replace(/[._-]+/g, " ").trim(), website: "", about: "From an eBay store name" };
  const rest = [];
  let website = "";
  for (const token of text.split(/[\s,;|\t]+/).filter(Boolean)) {
    const site = !website && URL_LIKE.test(token) ? normalizeWebsite(token) : null;
    if (site) website = site; else rest.push(token);
  }
  const name = rest.join(" ").replace(/\s+/g, " ").trim().slice(0, 200);
  if (!website && name.length < 3) return null;
  return { name: name || brandFromSite(website), website, about: "From a list" };
}

/** A pasted list as companies: { targets, skipped, cut } where `skipped` counts lines with nothing usable (or repeats) and `cut` those beyond MAX_COMPANIES. */
export function targetsFromText(text) {
  const targets = [];
  const seen = new Set();
  let skipped = 0;
  let cut = 0;
  for (const line of String(text ?? "").split(/\r?\n/)) {
    if (!line.trim()) continue;
    const t = targetFromLine(line);
    const key = t ? (t.website ? new URL(t.website).hostname.replace(/^www\./, "") : t.name.toLowerCase()) : "";
    if (!t || seen.has(key)) { skipped += 1; continue; }
    if (targets.length >= MAX_COMPANIES) { cut += 1; continue; }
    seen.add(key);
    targets.push(t);
  }
  return { targets, skipped, cut };
}

/**
 * Roughly how many minutes a run takes: a company with only a name needs its website worked out first (about 15 seconds), one with a website about 6,
 * and a pause between companies. With the browser on this computer, a site that showed no address is read again by it (20 to 40 seconds): about a third do.
 */
export const estimateMinutes = (targets, { local = false } = {}) => Math.max(1, Math.round(targets.reduce((sum, t) => sum + (t.website ? 6 : 15) + 1 + (local ? 10 : 0), 0) / 60));

/** Whether a read is worth repeating in a real browser: it showed no address, or turned the reader away. Not a site that may not be read, one that asks robots to keep out, or one that could not be reached. */
export const worthABrowser = (res) => Boolean(res) && !res.closed && !res.robotsBlocked && (res.blocked === true || (res.ok === true && (res.emails || []).length === 0));

/**
 * Which of the addresses a website showed to save, and which to leave alone and why: { pick: [address…], left: [{ email, why, canSave }] }.
 * `have` is a Set of addresses already on the list. `canSave` marks the reasons a person may well disagree with. `people` also picks a person's
 * address on the company's own domain.
 */
export function chooseAddresses(emails, have, { people = false } = {}) {
  const pick = [];
  const left = [];
  for (const e of emails || []) {
    const local = String(e.email).split("@")[0].toLowerCase();
    if (have.has(e.email)) left.push({ email: e.email, why: "already on the list", canSave: false });
    else if (e.kind === "free") left.push({ email: e.email, why: "a Gmail-type address", canSave: true, address: e });
    else if (NOT_FOR_SALES.has(local)) left.push({ email: e.email, why: "not meant for sales", canSave: false });
    else if (!e.ownDomain) left.push({ email: e.email, why: "on another website's domain", canSave: true, address: e });
    else if (e.kind === "named" && !people) left.push({ email: e.email, why: "a person's address", canSave: true, address: e });
    else if (pick.length >= MAX_PER_COMPANY) left.push({ email: e.email, why: `more than ${MAX_PER_COMPANY} for one company`, canSave: false });
    else pick.push(e);
  }
  return { pick, left };
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/**
 * Run the companies one after another. `targets` is [{ name, website, about, leadId }]. `deps` is what to call:
 *   findWebsite(name)                  -> { ok, res: { site, confidence, evidence, tried, of } } | { ok: false, message }
 *   readSite(url)                      -> { ok, res: <a contact-page read> } | { ok: false, message }
 *   readSiteOnThisComputer(url)        -> the same, or { ok: false, unreachable: true } when the program is not running
 *   save(found, { leadId, socials })   -> { ok, saved, duplicates, failed }
 * `onChange(index, patch)` is told of every step; `shouldStop()` is asked between steps. Resolves to the final record of each company:
 * { name, website, status, note, via, saved: [rows], left: [...], socials }, where `status` is saved, none, nosite, unreadable, error or stopped.
 */
export async function runAuto(targets, deps, { known = [], local = false, people = false, pause = 800, onChange = () => {}, onNote = () => {}, shouldStop = () => false } = {}) {
  const have = new Set(known instanceof Map ? known.keys() : known);
  let browser = Boolean(local);                       // switched off for the rest of the run when the program turns out not to be running
  let socialSearch = Boolean(deps.findSocials);       // switched off for the rest of the run when the program is gone, or a search engine asked for a person and nobody answered
  const results = [];

  /** The Facebook and Instagram pages a search for the company's name gives: { facebook?, instagram? }, {} when there are none or searching is off. */
  async function socialsBySearch(name) {
    if (!socialSearch || !name) return {};
    const out = await deps.findSocials(name);
    if (!out.ok) { if (out.unreachable) socialSearch = false; return {}; }
    if (out.res.blocked || out.res.limited) {
      socialSearch = false;
      onNote(out.res.blocked ? SEARCH_STOPPED : SEARCH_USED_UP);
    }
    const found = {};
    for (const net of ["facebook", "instagram"]) if (out.res[net]) found[net] = out.res[net];
    return found;
  }

  for (let i = 0; i < targets.length; i += 1) {
    const t = targets[i];
    const rec = { name: t.name, website: t.website || "", status: "working", note: "", via: "", saved: [], left: [], socials: {}, about: t.about || "" };
    const say = (patch) => { Object.assign(rec, patch); onChange(i, { ...rec }); };
    results.push(rec);

    if (shouldStop()) { say({ status: "stopped", note: "Not started: stopped." }); continue; }
    try {
      if (!rec.website) {
        say({ note: "Finding the website…" });
        const f = await deps.findWebsite(t.name);
        if (!f.ok) { say({ status: "error", note: f.message || "Could not look for the website." }); continue; }
        if (f.res.searchBlocked || f.res.searchLimited) onNote(f.res.searchBlocked ? SEARCH_STOPPED : SEARCH_USED_UP);
        if (!f.res.site) {
          const outOfTime = Number(f.res.tried) < Number(f.res.of);
          const missed = outOfTime ? `No website found: it ran out of time after ${f.res.tried} of ${f.res.of} likely addresses. Trying again may find it.` : "No website found for this name.";
          // no website, but its social pages may be found by a search: shown with the company, there is no address to save with them
          say({ status: "nosite", note: socialSearch ? "No website found. Looking for its social pages…" : missed });
          const found = await socialsBySearch(t.name);
          const names = Object.keys(found).map((n) => (n === "facebook" ? "Facebook" : "Instagram"));
          say({ status: "nosite", socials: found, note: names.length ? `No website found, but a search found its ${names.join(" and ")} ${names.length === 1 ? "page" : "pages"}.` : missed });
          continue;
        }
        if (Number(f.res.confidence) < MIN_CONFIDENCE) {
          say({ status: "nosite", note: `Possible website: ${f.res.site} (${f.res.evidence || "a page with the name"}). Not sure enough to read it by itself: if it is theirs, put it in the list with the name.` });
          continue;
        }
        say({ website: f.res.site, note: "Found the website." });
      }

      say({ note: "Reading the website…" });
      const read = await deps.readSite(rec.website);
      if (!read.ok) { say({ status: "unreadable", note: read.message || "Could not read the website." }); continue; }
      let res = read.res;
      let via = res.via || "";                           // "computer" when this computer's connection read it, "" when the server did
      if (browser && worthABrowser(res)) {
        say({ note: "Reading it with the browser on this computer…" });
        const b = await deps.readSiteOnThisComputer(rec.website);
        if (b.ok) { res = b.res; via = "browser"; } else if (b.unreachable) browser = false;
      }
      rec.via = via;
      rec.socials = res.socials || {};
      if (!res.ok) { say({ status: "unreadable", note: res.message || "Could not read the website." }); continue; }
      if (Object.keys(rec.socials).length === 0 && socialSearch) {
        // its own website linked no social page: a search for its name may find them
        say({ note: "Looking for its social pages…" });
        const found = await socialsBySearch(t.name || brandFromSite(rec.website));
        if (Object.keys(found).length) rec.socials = found;
      }

      const { pick, left } = chooseAddresses(res.emails, have, { people });
      rec.left = left;
      if (pick.length === 0) {
        const why = left.length ? `Seen, not saved: ${left.map((l) => `${l.email} (${l.why})`).join("; ")}.` : (res.message || "No public email address on its pages.");
        say({ status: "none", note: why });
        continue;
      }
      const brand = t.name || brandFromSite(rec.website);
      const out = await deps.save(
        pick.map((e) => ({ ...e, brand, website: rec.website, note: t.about || "Found automatically" })),
        { leadId: t.leadId || null, socials: rec.socials },
      );
      rec.saved = out.saved || [];
      (out.saved || []).forEach((r) => have.add(r.email));
      (out.duplicates || []).forEach((e) => have.add(e));
      const problem = out.failed?.length ? ` ${out.failed.length} could not be saved: ${out.failed[0].message}` : "";
      say({ status: rec.saved.length ? "saved" : out.failed?.length ? "error" : "none", note: rec.saved.length ? `Saved ${rec.saved.length} ${rec.saved.length === 1 ? "address" : "addresses"}.${problem}` : (problem.trim() || "Already on the list.") });
    } catch (err) {
      say({ status: "error", note: String(err?.message || err).slice(0, 160) || "Something went wrong with this one." });
    }
    if (i < targets.length - 1 && pause > 0) await sleep(pause);
  }
  return results;
}
