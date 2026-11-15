/**
 * Which of the addresses a website showed are worth saving by themselves, and which are left alone and why. One list of rules in one place:
 * the Contact Finder page's automatic run (src/lib/autoFind.js) and the Reddit check's own reading of a new lead's website
 * (worker/lib/redditLeads.js) both use it, so the two can never disagree about what counts as "a company's address".
 *
 * What it saves by itself: the company's own (on its own website's domain), a company's address (sales@, enquiries@, contact@) and not a person's,
 * not Gmail-type, not already on the list, not meant for something other than selling to (jobs@, support@, privacy@ …), and at most three per company.
 * A person's address is personal data, and nobody is looking when this runs, so those are left for a person to choose, unless "people" is on.
 *
 * Pure: it knows nothing of a page or a network.
 */

export const MAX_PER_COMPANY = 3;

// the part before the @ of an address that is for something other than selling to: work, help, rules, accounts
export const NOT_FOR_SALES = new Set([
  "job", "jobs", "career", "careers", "recruit", "recruiting", "recruitment", "hr", "vacancies", "apply", "applications",
  "support", "help", "helpdesk", "privacy", "dpo", "gdpr", "legal", "abuse", "webmaster", "postmaster", "noreply", "no-reply", "donotreply",
  "do-not-reply", "press", "media", "accounts", "billing", "invoices", "invoice", "payments", "unsubscribe",
]);

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
