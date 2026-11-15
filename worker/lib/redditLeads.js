/**
 * Reddit Leads, server side: the check that pulls new posts into the database, and the route the page calls.
 *
 *   POST /api/reddit-leads/sync        "Check now": the same check the schedule runs (every 30 minutes, REDDIT_CRON)
 *
 * (Reading a business's contact pages on request is not Reddit's: it lives in worker/lib/emailFinder.js, with the Contact Finder page. The check
 * itself reads only a NEW lead's own website, step 4 below.)
 *
 * Where the posts come from: Arctic Shift (arctic-shift.photon-reddit.com), a free public archive of Reddit that needs no key. Reddit's
 * own feeds refuse most automated readers (its JSON gives 403, its RSS answers 429 after a couple of requests in a second, and a cloud
 * server's address is the first to be refused), and its official API now needs an approved application. Arctic Shift has no promise of
 * uptime, so every check says how it went (reddit_lead_settings.last_status / last_error) and the page shows it.
 *
 * What a check does, for each subreddit on the list the team edits on the page:
 *   1. asks for the posts since where the last check got to, less 6 hours (the archive can be a few hours behind; posts it has already
 *      given are skipped by the database, so the overlap costs only the request). It reads OLDEST FIRST, at most 300 posts: a busy
 *      subreddit (or the first look, 14 days back) that has more is finished by the next check, nothing is skipped, and the page says
 *      so while it is catching up;
 *   2. keeps the posts that score as leads (redditScore.js);
 *   3. adds the new ones to `reddit_leads`. A post that is already there is left exactly as it is: what the team wrote on it (status,
 *      brand, website, notes) is never touched, and so is its score. A post the database refuses is skipped and named, it never stops the
 *      others.
 *   4. for the NEW STRONG leads (a very likely buyer, score 70 or more) whose post names their own website (redditScore.js `websiteOf`: only a link the
 *      words around it call the poster's own, never a link somebody else was mentioned with), reads that website's public contact pages by itself and puts the company addresses it
 *      shows on the Contact Finder's list, each tied to its post (`readNewLeadSites`). Nobody has to press anything. This comes AFTER how the
 *      check went has been written down, and whatever goes wrong in it (a site that is down, one that asks robots to keep out) is not the check's
 *      failure: the check is reported as it was.
 * A subreddit the archive cannot answer for is skipped and named; the rest still go in. However a check ends, how it went is written down.
 */
import { checkMarketingPermission, noEdit } from "./marketingAccess.js";
import { patch, select, upsert } from "./supabaseRest.js";
import { chooseAddresses } from "./addressPick.js";
import { FinderError, findContacts } from "./contactFinder.js";
import { DEFAULT_SETTINGS, STRONG_SCORE, leadRow } from "./redditScore.js";

export const REDDIT_CRON = "10,40 * * * *";

const ARCTIC = "https://arctic-shift.photon-reddit.com/api/posts/search";
const UA = "KaziLeadMonitor/1.0 (+https://kazimfg.com.np)";
const FIELDS = "id,subreddit,title,selftext,url,created_utc";
const FIRST_LOOK_MS = 14 * 24 * 3600 * 1000;
const OVERLAP_MS = 6 * 3600 * 1000;
const PAGE = 100;
const MAX_PAGES = 3;                    // 300 posts of one subreddit per check
const SUB_OK = /^[A-Za-z0-9_]{2,21}$/;
const MANUAL_GAP_MS = 45 * 1000;        // "Check now" again within this long of the last check says so instead of asking the archive again
const SITES_MAX = 3;                    // the websites of new leads one check reads (the rest are left for Find emails on the Contact Finder page)
const SITES_BUDGET_MS = 25 * 1000;      // after this long, no further website is started

const isoSeconds = (ms) => new Date(ms).toISOString().replace(/\.\d{3}Z$/, "Z");
const oneLine = (s, n = 160) => String(s ?? "").replace(/\s+/g, " ").trim().slice(0, n);

/* ── The check ────────────────────────────────────────────────── */

/**
 * One subreddit's posts since `sinceMs`, OLDEST first, at most MAX_PAGES x PAGE of them: { posts, capped } where `capped` says there may be
 * more after the last one (the next check goes on from there). Throws a sentence that names what went wrong.
 */
export async function fetchSubredditPosts(sub, sinceMs, fetchImpl = fetch) {
  const posts = [];
  const seen = new Set();
  let after = isoSeconds(sinceMs);
  let full = false;
  for (let page = 0; page < MAX_PAGES; page += 1) {
    const q = new URLSearchParams({ subreddit: sub, after, limit: String(PAGE), sort: "asc", fields: FIELDS });
    let res;
    try {
      res = await fetchImpl(`${ARCTIC}?${q}`, { headers: { "User-Agent": UA, Accept: "application/json" }, signal: AbortSignal.timeout(20000) });
    } catch {
      throw new Error("the archive did not answer in time");
    }
    if (!res.ok) throw new Error(`the archive answered ${res.status}`);
    const body = await res.json().catch(() => null);
    if (!body || !Array.isArray(body.data)) throw new Error("the archive sent something unexpected");
    let newest = 0;
    for (const p of body.data) {
      if (!p || typeof p !== "object") continue;
      const t = Number(p.created_utc) * 1000;
      if (Number.isFinite(t)) newest = Math.max(newest, t);
      const key = String(p.id ?? "");
      if (key && seen.has(key)) continue;
      if (key) seen.add(key);
      posts.push(p);
    }
    full = body.data.length >= PAGE;
    if (!full || !newest) break;
    after = isoSeconds(newest);
  }
  return { posts, capped: full };
}

/** The settings row as the rules want it. */
export function settingsFromRow(row) {
  const list = (v, fallback) => (Array.isArray(v) ? v.filter((x) => typeof x === "string") : fallback);
  const seen = new Set();
  const subreddits = list(row.subreddits, DEFAULT_SETTINGS.subreddits)
    .map((s) => s.trim().replace(/^\/?r\//i, ""))
    .filter((s) => SUB_OK.test(s) && !seen.has(s.toLowerCase()) && seen.add(s.toLowerCase()));          // "r/Foo" and "Foo" are one subreddit
  return {
    subreddits,
    strong: list(row.strong, DEFAULT_SETTINGS.strong),
    weak: list(row.weak, DEFAULT_SETTINGS.weak),
    block: list(row.block, DEFAULT_SETTINGS.block),
    minScore: Number.isFinite(Number(row.min_score)) ? Number(row.min_score) : DEFAULT_SETTINGS.minScore,
  };
}

/**
 * Save rows, one request for the lot; if the database refuses the batch, one request per row, so a single bad post is named and skipped.
 * Resolves to { saved, added }: how many were new, and those rows as the database holds them (a post that was already there is not one of them).
 */
async function saveRows(env, rows, problems) {
  const into = (batch) => upsert(env, "reddit_leads", batch, { onConflict: "reddit_id", ignoreDuplicates: true, returning: true });
  const added = [];
  for (let i = 0; i < rows.length; i += 200) {
    const batch = rows.slice(i, i + 200);
    try {
      const got = await into(batch);
      if (Array.isArray(got)) added.push(...got);
    } catch {
      for (const row of batch) {
        try {
          const got = await into([row]);
          if (Array.isArray(got)) added.push(...got);
        } catch (err) {
          problems.push(`post ${row.reddit_id} was not saved (${oneLine(err.message, 90)})`);
        }
      }
    }
  }
  return { saved: added.length, added };
}

/* ── A new lead's own website, read by itself ─────────────────── */

const SECOND_LEVEL = new Set(["co", "com", "org", "net", "ac", "gov", "edu", "ltd", "plc"]);

/** A brand name out of a web address ("https://www.acme-wear.co.uk/" gives "Acme wear"): what the list shows for an address nobody named. */
export function brandFromHost(website) {
  let host = "";
  try { host = new URL(website).hostname.toLowerCase().replace(/^www\./, ""); } catch { return ""; }
  const labels = host.split(".").filter(Boolean);
  if (labels.length === 0) return "";
  const at = labels.length >= 3 && labels[labels.length - 1].length === 2 && SECOND_LEVEL.has(labels[labels.length - 2]) ? labels.length - 3 : Math.max(0, labels.length - 2);
  return (labels[at] || labels[0]).replace(/[-_]+/g, " ").replace(/^./, (c) => c.toUpperCase()).slice(0, 120);
}

/**
 * The websites of NEW STRONG leads (rows just added to `reddit_leads`, each with an `id`, a `score`, a `website` and a `subreddit`; a weaker match is
 * left alone: it may be a manufacturer's advert or a tool, and its website stays on the post for a person to decide), read the moment they are saved: each
 * site's home page and up to two contact pages (worker/lib/contactFinder.js: robots.txt first, only public addresses, a pause between pages, an honest
 * name), and the addresses worth writing to put on the list, tied to the post (`lead_id`) and saying where they came from. Which addresses are worth
 * saving by themselves is worker/lib/addressPick.js, the same rules as the Contact Finder page's own run: a company's own address (sales@, info@), never a
 * person's, never Gmail-type, never jobs@ or support@, at most three. An address already on the list is skipped by the database (one row per address).
 *
 * At most `maxSites` websites and about `budgetMs` of reading per check: a lead beyond that keeps its website and is read by Find emails on the
 * Contact Finder page. A site that is down, closed to programs or shows no address saves nothing and is not an error. Resolves to
 * { read, saved, skipped } and never throws.
 */
export async function readNewLeadSites(env, added, { fetchImpl = fetch, maxSites = SITES_MAX, budgetMs = SITES_BUDGET_MS, pause } = {}) {
  const out = { read: 0, saved: 0, skipped: 0 };
  const started = Date.now();
  for (const lead of Array.isArray(added) ? added : []) {
    if (!lead || !lead.id || typeof lead.website !== "string" || !lead.website) continue;
    if (!(Number(lead.score) >= STRONG_SCORE)) continue;            // only a Strong match is read by itself
    if (out.read >= maxSites || Date.now() - started > budgetMs) { out.skipped += 1; continue; }
    out.read += 1;
    try {
      const res = await findContacts(lead.website, { fetchImpl, respectRobots: true, ...(pause === undefined ? {} : { pause }) });
      if (!res || !res.ok || res.closed || res.robotsBlocked) continue;
      const { pick } = chooseAddresses(res.emails, new Set(), { people: false });
      if (pick.length === 0) continue;
      const brand = brandFromHost(lead.website);
      const rows = pick.map((e) => ({
        email: String(e.email).toLowerCase(),
        kind: e.kind,
        same_domain: Boolean(e.ownDomain),
        source_url: typeof e.source === "string" && e.source.length <= 400 ? e.source : null,
        brand: brand || null,
        website: lead.website,
        lead_id: lead.id,
        socials: res.socials && typeof res.socials === "object" ? res.socials : {},
        note: `From a Reddit post (r/${lead.subreddit || "?"}), found automatically`.slice(0, 1000),
      }));
      const got = await upsert(env, "lead_emails", rows, { onConflict: "email", ignoreDuplicates: true, returning: true });
      out.saved += Array.isArray(got) ? got.length : 0;
    } catch (err) {
      if (err instanceof FinderError) continue;                    // an address the reader may not fetch (a private one, a closed site): expected, nothing to report
      console.error("Reddit leads: reading a new lead's website failed:", oneLine(err?.message, 120));
    }
  }
  return out;
}

/**
 * Run one check. Resolves to { ok, subreddits, fetched, matched, saved, errors, notes, sites, throttled } where `ok` is false only when no
 * subreddit could be read, `errors` names whatever could not be done and `notes` what is merely unfinished (a subreddit with more posts
 * than one check reads), and `sites` is { read, saved, skipped }: the new leads' own websites read by itself and the addresses saved from them.
 * Throws only when the settings cannot be read (the database is the one thing a check cannot do without).
 * `minGapMs` > 0 (the "Check now" button) answers from the last check when it was that recent.
 */
export async function runRedditSync(env, { fetchImpl = fetch, now = Date.now(), minGapMs = 0 } = {}) {
  const [row] = await select(env, "reddit_lead_settings", { id: "eq.main", select: "*" });
  if (!row) throw new Error("The Reddit lead settings are missing. Has migration 0064 been applied?");
  const last = Date.parse(row.last_checked_at);
  if (minGapMs > 0 && Number.isFinite(last) && now - last >= 0 && now - last < minGapMs) {
    return { ok: row.last_status !== "failed", throttled: true, subreddits: settingsFromRow(row).subreddits.length, fetched: row.last_fetched ?? 0, matched: row.last_saved ?? 0, saved: 0, errors: [] };
  }
  const settings = settingsFromRow(row);
  const marks = row.watermarks && typeof row.watermarks === "object" && !Array.isArray(row.watermarks) ? { ...row.watermarks } : {};
  const errors = [];
  const notes = [];
  let fetched = 0;
  let saved = 0;
  let matched = 0;
  let outcome = null;
  let added = [];                       // the leads this check added (not the ones that were already there)

  try {
    const found = new Map();
    for (const sub of settings.subreddits) {
      const key = sub.toLowerCase();
      const mark = Date.parse(marks[key]);
      const since = Number.isFinite(mark) ? mark - OVERLAP_MS : now - FIRST_LOOK_MS;
      let got;
      try {
        got = await fetchSubredditPosts(sub, since, fetchImpl);
      } catch (err) {
        errors.push(`r/${sub}: ${err.message}`);
        continue;
      }
      fetched += got.posts.length;
      let newest = Number.isFinite(mark) ? mark : 0;
      for (const p of got.posts) {
        const t = Number(p?.created_utc) * 1000;
        if (Number.isFinite(t)) newest = Math.max(newest, t);
        let lead = null;
        try { lead = leadRow(p, settings); } catch { lead = null; }                  // one odd post must not stop the rest
        if (lead) found.set(lead.reddit_id, lead);
      }
      // never past now (an archive record dated in the future would park the mark there for good); a quiet window still moves on a little
      marks[key] = new Date(Math.min(now, got.posts.length ? newest : Math.max(Number.isFinite(mark) ? mark : 0, now - 2 * OVERLAP_MS))).toISOString();
      if (got.capped) notes.push(`r/${sub} had more than ${MAX_PAGES * PAGE} posts to read; the next checks go on from where this one stopped`);
    }
    const rows = [...found.values()];
    matched = rows.length;
    const got = await saveRows(env, rows, errors);
    saved = got.saved;
    added = got.added;
  } catch (err) {
    errors.push(oneLine(err?.message, 120) || "the check stopped unexpectedly");
  } finally {
    const nothingRead = settings.subreddits.length > 0 && fetched === 0 && errors.length >= settings.subreddits.length;
    const problems = [...errors, ...notes];
    const stamp = new Date(now).toISOString();
    outcome = { nothingRead, problems };
    try {
      await patch(env, "reddit_lead_settings", { id: "main" }, {
        watermarks: marks,
        last_checked_at: stamp,
        ...(nothingRead ? {} : { last_ok_at: stamp }),
        last_status: problems.length === 0 ? "ok" : nothingRead ? "failed" : "partial",
        last_error: problems.length ? problems.join("; ").slice(0, 500) : null,
        last_fetched: fetched,
        last_saved: saved,
      });
    } catch (err) {
      console.error("Reddit leads: could not record how the check went:", err?.message || err);
    }
  }
  // after how the check went is written down: whatever happens to a lead's website is not the check's failure
  let sites = { read: 0, saved: 0, skipped: 0 };
  if (added.some((l) => l && l.website)) {
    try { sites = await readNewLeadSites(env, added, { fetchImpl }); } catch (err) { console.error("Reddit leads: reading the new leads' websites failed:", oneLine(err?.message, 120)); }
  }
  return { ok: !outcome.nothingRead, subreddits: settings.subreddits.length, fetched, matched, saved, errors, notes, sites };
}

/* ── The route ────────────────────────────────────────────────── */

export async function handleRedditSync(request, env) {
  const permission = await checkMarketingPermission(request, env);
  if (!permission.edit) return noEdit();
  return Response.json({ ok: true, ...(await runRedditSync(env, { minGapMs: MANUAL_GAP_MS })) });
}
