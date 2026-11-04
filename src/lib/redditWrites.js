/**
 * Every write Reddit Leads makes. Each resolves to `{ ok, message?, … }`, touches nothing on screen, and is READ BACK: row-level
 * security drops a refused update without an error, so a write that is not checked looks like success (the same rule as lib/metaWrites.js).
 *
 *   a lead         its status, brand, website and notes (and the customer made from it): the only columns the database lets a person change
 *   the email list added from the finder, flagged do-not-email, annotated, removed
 *   the settings   what to look for (never how the last check went: only the Worker writes that)
 *   a check        pulling new posts now (lib/redditApi.js)
 *   the finders    reading a website's contact pages, through the Worker (lib/emailFinderApi.js) or through the finder program on the person's own
 *                  computer (lib/localFinder.js), and the public notices on Find a Tender (lib/emailFinderApi.js)
 *
 * The email list is the Contact Finder page's, and a Reddit post's card writes to it too, so its writes live here with the rest.
 */
import { deleteRow, fetchAll, fetchOne, insertRow, updateRow } from "./db";
import { kathmanduDate } from "../utils/date";
import { runEmailFinder, runFindWebsite, runTenderSearch, runWebSearch } from "./emailFinderApi";
import { FinderOffline, runLocalEmailFinder, runLocalWebsiteFinder } from "./localFinder";
import { runRedditCheck } from "./redditApi";
import { bestEmail, brandFromSite, leadStatus, normalizeWebsite, settingsPayload } from "./redditLeads";

const NO_PERMISSION = "Not saved. You may not have permission to change this.";
const NO_CONNECTION = "Not saved. Check your connection and try again.";
const INVALID = "Not saved. Something in it is not allowed (a website must start with http:// or https://, and some fields have a length limit).";

const denied = (err) => err?.code === "42501" || /row-level security|permission denied/i.test(String(err?.message || ""));
const invalid = (err) => err?.code === "23514" || err?.code === "22001" || /violates check constraint|value too long/i.test(String(err?.message || ""));
const duplicate = (err) => err?.code === "23505" || /duplicate key|unique constraint/i.test(String(err?.message || ""));
const failure = (err) => ({ ok: false, message: denied(err) ? NO_PERMISSION : invalid(err) ? INVALID : NO_CONNECTION });

const text = (v) => String(v ?? "").trim();
const same = (a, b) => (a ?? null) === (b ?? null);

/* ── Checks and the finders ───────────────────────────────────── */

/** Pull new posts now. */
export async function checkNow() {
  try {
    return { ok: true, res: await runRedditCheck() };
  } catch (err) {
    return { ok: false, message: err?.message || "The check failed." };
  }
}

/** Read a website's public contact pages. `res` is the finder's answer; `ok` only says the server could be asked. `robots: false` leaves the site's robots.txt unread (the person's choice). */
export async function findEmails(url, { robots = true } = {}) {
  try {
    return { ok: true, res: await runEmailFinder(url, { robots }) };
  } catch (err) {
    return { ok: false, message: err?.message || "That didn't work. Try again." };
  }
}

/** Find a company's own website from its name. `res` is { site, host, confidence, evidence, tried } (`site` is null when there is none to be found). */
export async function findWebsite(name, { robots = true } = {}) {
  try {
    return { ok: true, res: await runFindWebsite(name, { robots }) };
  } catch (err) {
    return { ok: false, message: err?.message || "That didn't work. Try again." };
  }
}

/** Read the public notices on Find a Tender. `params` is { stage, days, words }; `res` is the search's answer (worker/lib/tenders.js). */
export async function findTenders(params) {
  try {
    return { ok: true, res: await runTenderSearch(params) };
  } catch (err) {
    return { ok: false, message: err?.message || "That didn't work. Try again." };
  }
}

/**
 * Search the web for businesses' websites. `res.results` is the companies to look at: [{ name, website, about }], the name made from the web address
 * (a search result's title is the page's, not the company's).
 */
export async function searchWeb(queries) {
  try {
    const res = await runWebSearch(queries);
    return { ok: true, res: { results: res.sites.map((s) => ({ name: brandFromSite(s.website), website: s.website, about: `Web search: "${s.query}"` })) } };
  } catch (err) {
    return { ok: false, message: err?.message || "That didn't work. Try again." };
  }
}

/**
 * The same, read by the finder program on this computer: in its browser (the default, which also runs the page's scripts) or, with `browser: false`, plainly
 * through this computer's internet connection. `unreachable` says the program is not running (or this browser would not let the page reach it): then
 * nothing was read, and the caller may read with the server instead.
 */
export async function findEmailsOnThisComputer(url, { browser = true, robots = true } = {}) {
  try {
    return { ok: true, res: await runLocalEmailFinder(url, { browser, robots }) };
  } catch (err) {
    return { ok: false, unreachable: err instanceof FinderOffline, message: err?.message || "That didn't work. Try again." };
  }
}

/** A company's own website found from its name by the finder program on this computer (see `findWebsite`); `unreachable` as above. */
export async function findWebsiteOnThisComputer(name, { robots = true } = {}) {
  try {
    return { ok: true, res: await runLocalWebsiteFinder(name, { robots }) };
  } catch (err) {
    return { ok: false, unreachable: err instanceof FinderOffline, message: err?.message || "That didn't work. Try again." };
  }
}

/* ── A lead ───────────────────────────────────────────────────── */

/**
 * Save what the team wrote on a lead. `draft` is { status, brand, website, notes } as typed (a website that was changed already through
 * `normalizeWebsite`, so "" or a good address). Only what the PERSON changed is sent: `base` is what the card showed when it was opened,
 * and a field is compared with that, not with the latest row. Comparing with the latest row would write back, as if it were a change of
 * theirs, whatever a colleague saved while the card was open (a status they moved, an address they flagged).
 */
export async function saveLead(lead, draft, base = null) {
  const was = base || { status: leadStatus(lead), brand: lead.brand || "", website: lead.website || "", notes: lead.notes || "" };
  const patch = {};
  if (draft.status !== was.status) patch.status = draft.status;
  if (!same(text(draft.brand) || null, text(was.brand) || null)) patch.brand = text(draft.brand) || null;
  if (!same(draft.website || null, was.website || null)) patch.website = draft.website || null;
  if (!same(text(draft.notes) || null, text(was.notes) || null)) patch.notes = text(draft.notes) || null;
  if (Object.keys(patch).length === 0) return { ok: true, row: lead };
  try {
    const saved = await updateRow("reddit_leads", lead.id, patch);
    if (!saved) return { ok: false, gone: true, message: "That post is no longer on the list." };
    if (Object.entries(patch).some(([k, v]) => !same(saved[k] ?? null, v))) return { ok: false, message: NO_PERMISSION };
    return { ok: true, row: saved };
  } catch (err) {
    console.error("Failed to save a lead:", err);
    return failure(err);
  }
}

/**
 * Make a customer from a lead and link them. The customer needs a name (the brand); the best saved email goes in, and the source note says
 * where they came from. If the customer is made but the lead cannot be linked to them, `partial` is true and `customerId` says who, so the
 * caller never makes a second one (the same shape as lib/metaWrites.js convertLead).
 */
export async function addAsCustomer(lead, leadEmails) {
  const name = text(lead.brand);
  if (!name) return { ok: false, message: "Give the brand a name first, then save, then add it as a customer." };
  if (lead.customerId || leadStatus(lead) === "customer") return { ok: false, message: `${name} is already a customer.` };
  // The customer's source note carries this post's address, so it says whether a customer was already made from this post: by a press that
  // got an error after the customer was in, from another tab, or before the page was reloaded. Never make a second one.
  const already = await customerMadeFrom(lead);
  if (already) return { ...(await linkCustomer(lead, already.id)), reused: true };
  const email = bestEmail(leadEmails)?.email || "";
  let customer;
  try {
    customer = await insertRow("customers", {
      name, email, phone: "", city: "",
      sourceNote: `Reddit: r/${lead.subreddit} · ${kathmanduDate()} · ${lead.url}`,
      notes: text(lead.notes),
    });
  } catch (err) {
    console.error("Failed to create a customer from a lead:", err);
    // The insert may have gone in and only the read-back after it failed (that is an error too): look before saying the customer was not made.
    const made = denied(err) ? null : await customerMadeFrom(lead);
    if (!made) return { ok: false, message: denied(err) ? "The customer was not created. You may not have permission to add customers." : "The customer was not created. Check your connection and try again." };
    customer = made;
  }
  if (!customer?.id) return partial(null, "could not be read back to link the post");
  return linkCustomer(lead, customer.id);
}

/** The customer already made from this post (its source note holds the post's address), or null (also when the customers could not be read). */
async function customerMadeFrom(lead) {
  try {
    const rows = await fetchAll("customers", { filters: [{ field: "sourceNote", op: "ilike", value: `%${lead.url}%` }], limit: 1 });
    return rows[0] || null;
  } catch {
    return null;
  }
}

const partial = (customerId, why) => ({ ok: false, partial: true, customerId, message: `The customer was created, but ${why}. Do not add them again: find them in Customers.` });

/** Link a lead to a customer that already exists (the second half of addAsCustomer, which a card can run again on its own). */
export async function linkCustomer(lead, customerId) {
  try {
    const saved = await updateRow("reddit_leads", lead.id, { customerId, status: "customer" });
    if (!saved || saved.customerId !== customerId) return partial(customerId, "the post could not be marked as a customer");
    return { ok: true, customer: { id: customerId }, row: saved };
  } catch (err) {
    console.error("Failed to link a lead to its customer:", err);
    return partial(customerId, "the post could not be marked as a customer");
  }
}

/* ── The email list ───────────────────────────────────────────── */

/**
 * Save addresses the finder found. `found` is a list of { email, kind, ownDomain, source } and `site` is { brand, website, leadId, socials, note }
 * and goes on every row. An address of its own (a notice from Find a Tender names several organisations) can carry its own `brand`, `website`
 * and `note`, which are used instead of the site's. An address already on the list is skipped (the list has one row per address) and named,
 * never overwritten: it may be flagged do-not-email. Resolves to { ok, saved, duplicates, failed } where `ok` is false only when nothing at all
 * could be saved and something was refused.
 */
export async function saveEmails(found, site) {
  const saved = [], duplicates = [], failed = [];
  for (const f of found) {
    const email = text(f.email).toLowerCase();
    const website = normalizeWebsite(f.website ?? site.website);
    try {
      const row = await insertRow("lead_emails", {
        email, kind: f.kind, sameDomain: Boolean(f.ownDomain), sourceUrl: text(f.source) || null,
        brand: text(f.brand ?? site.brand).slice(0, 120) || null, website: website || null, leadId: site.leadId || null,
        socials: site.socials || {}, note: text(f.note ?? site.note).slice(0, 1000) || null,
      });
      if (!row) { failed.push({ email, message: NO_CONNECTION }); continue; }
      saved.push(row);
    } catch (err) {
      if (duplicate(err)) duplicates.push(email);
      else { console.error("Failed to save an email:", err); failed.push({ email, message: failure(err).message }); }
    }
  }
  return { ok: saved.length > 0 || failed.length === 0, saved, duplicates, failed };
}

/**
 * Change an address's brand, website, note or do-not-email flag (never the address itself). `patch` is what the card now shows; `base` is
 * what it showed when it was opened, and only what differs from THAT is sent (so a flag a colleague set while the card was open is not
 * quietly switched off by someone who only changed the note). Without `base` the latest row is the comparison.
 */
export async function updateEmail(email, patch, base = null) {
  const was = base || { brand: email.brand || "", website: email.website || "", note: email.note || "", doNotEmail: Boolean(email.doNotEmail) };
  const body = {};
  if ("brand" in patch && !same(text(patch.brand) || null, text(was.brand) || null)) body.brand = text(patch.brand) || null;
  if ("website" in patch && !same(patch.website || null, was.website || null)) body.website = patch.website || null;
  if ("note" in patch && !same(text(patch.note) || null, text(was.note) || null)) body.note = text(patch.note) || null;
  if ("doNotEmail" in patch && Boolean(patch.doNotEmail) !== Boolean(was.doNotEmail)) body.doNotEmail = Boolean(patch.doNotEmail);
  if (Object.keys(body).length === 0) return { ok: true, row: email };
  try {
    const saved = await updateRow("lead_emails", email.id, body);
    if (!saved) return { ok: false, gone: true, message: "That address is no longer on the list." };
    if (Object.entries(body).some(([k, v]) => !same(saved[k] ?? null, v))) return { ok: false, message: NO_PERMISSION };
    return { ok: true, row: saved };
  } catch (err) {
    console.error("Failed to change an email:", err);
    return failure(err);
  }
}

/** Take an address off the list. Read back: a refused delete (row-level security) removes nothing and says nothing. */
export async function removeEmail(email) {
  try {
    await deleteRow("lead_emails", email.id);
    if (await fetchOne("lead_emails", email.id)) return { ok: false, message: "Not removed. You may not have permission to remove this." };
    return { ok: true };
  } catch (err) {
    console.error("Failed to remove an email:", err);
    return { ok: false, message: denied(err) ? "Not removed. You may not have permission to remove this." : "Not removed. Check your connection and try again." };
  }
}

/* ── Settings ─────────────────────────────────────────────────── */

/**
 * Save what the check looks for. `draft` has been through `settingsProblem`; `base` is what the dialog showed when it was opened, and only the
 * lists (and the number) that differ from THAT are written. Writing all five would put back, as if it were this person's change, whatever a
 * colleague saved to another list while the dialog was open.
 */
export async function saveSettings(draft, base = null) {
  const next = settingsPayload(draft);
  const was = base ? settingsPayload(base) : null;
  const joined = (a) => JSON.stringify(a || []);
  const payload = {};
  if (!was || joined(next.subreddits) !== joined(was.subreddits)) payload.subreddits = next.subreddits;
  if (!was || joined(next.strong) !== joined(was.strong)) payload.strong = next.strong;
  if (!was || joined(next.weak) !== joined(was.weak)) payload.weak = next.weak;
  if (!was || joined(next.block) !== joined(was.block)) payload.block = next.block;
  if (!was || next.minScore !== was.minScore) payload.minScore = next.minScore;
  if (Object.keys(payload).length === 0) return { ok: true };            // only spacing or repeats changed: the lists are the same
  try {
    const saved = await updateRow("reddit_lead_settings", "main", payload);
    if (!saved) return { ok: false, message: "The settings row is missing. Has the Reddit Leads migration been applied?" };
    const same2 = ["subreddits", "strong", "weak", "block"].every((k) => !(k in payload) || joined(saved[k]) === joined(payload[k]))
      && (!("minScore" in payload) || Number(saved.minScore) === payload.minScore);
    if (!same2) return { ok: false, message: NO_PERMISSION };
    return { ok: true, row: saved };
  } catch (err) {
    console.error("Failed to save the Reddit settings:", err);
    return failure(err);
  }
}
