/**
 * What Reddit Leads reads. A table can be longer than the server's limit of 1,000 rows a request (and stops there without an error), so
 * a list goes on from the oldest time it has got until a request comes back short; a row that shares that time is not counted twice.
 */
import { fetchAll } from "./db";

const PAGE = 1000;
const MAX_PAGES = 50;

async function everyRow(collection, field) {
  const rows = [];
  const seen = new Set();
  let before = null;
  for (let i = 0; i < MAX_PAGES; i += 1) {
    const page = await fetchAll(collection, {
      filters: before ? [{ field, op: "lte", value: before }] : [],
      orderBy: field, orderDir: "desc", limit: PAGE,
    });
    const fresh = page.filter((r) => !seen.has(r.id));
    fresh.forEach((r) => { seen.add(r.id); rows.push(r); });
    before = page.length ? page[page.length - 1][field] : null;
    if (page.length < PAGE || fresh.length === 0 || !before) break;
  }
  return rows;
}

/** Every post that scored as a lead, newest first. */
export const fetchRedditLeads = () => everyRow("reddit_leads", "postedAt");

/** Every address on the email list, newest first. */
export const fetchLeadEmails = () => everyRow("lead_emails", "foundAt");

/** The settings row (what to look for, how the last check went), or null when it is not there. */
export async function fetchRedditSettings() {
  const rows = await fetchAll("reddit_lead_settings");
  return rows[0] || null;
}
