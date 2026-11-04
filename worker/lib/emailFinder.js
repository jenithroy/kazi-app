/**
 * Contact Finder, server side: the routes the page calls. Nothing here saves anything: the page keeps what it finds, with the signed-in person's own
 * permissions, exactly as for any other address. (The routes keep the name /api/email-finder/ they were first built under.)
 *
 *   POST /api/email-finder/site      read one business's public contact pages (worker/lib/contactFinder.js)
 *   POST /api/email-finder/tenders   read the public notices on Find a Tender and say which are about clothing or textiles (worker/lib/tenders.js)
 *   POST /api/email-finder/company   find a company's own website from its name, by trying the likely addresses (worker/lib/siteFinder.js)
 *   POST /api/email-finder/search    search the web through Brave's Search API for the websites of businesses (worker/lib/webSearch.js); needs its key
 *
 * All need Edit on Marketing: they send requests to other people's servers on the signed-in person's behalf. `site` and `company` take
 * `robots: false` when the person has switched off "Respect robots.txt" in Sources.
 */
import { checkMarketingPermission, noEdit } from "./marketingAccess.js";
import { FinderError, findContacts } from "./contactFinder.js";
import { TenderError, searchTenders } from "./tenders.js";
import { findWebsiteFor } from "./siteFinder.js";
import { SearchError, searchSites } from "./webSearch.js";

const tooBig = (request) => Number(request.headers.get("content-length") || 0) > 4096;

export async function handleFindEmails(request, env) {
  const permission = await checkMarketingPermission(request, env);
  if (!permission.edit) return noEdit();
  if (tooBig(request)) return Response.json({ error: "That request is too big." }, { status: 413 });
  const body = await request.json().catch(() => null);
  try {
    return Response.json({ ok: true, result: await findContacts(body?.url, { respectRobots: body?.robots !== false }) });
  } catch (err) {
    if (err instanceof FinderError) return Response.json({ error: err.message }, { status: 400 });
    throw err;
  }
}

export async function handleTenderSearch(request, env) {
  const permission = await checkMarketingPermission(request, env);
  if (!permission.edit) return noEdit();
  if (tooBig(request)) return Response.json({ error: "That request is too big." }, { status: 413 });
  const body = await request.json().catch(() => null);
  try {
    return Response.json({ ok: true, result: await searchTenders(body || {}) });
  } catch (err) {
    if (err instanceof TenderError) return Response.json({ error: err.message }, { status: err.status });
    throw err;
  }
}

export async function handleFindWebsite(request, env) {
  const permission = await checkMarketingPermission(request, env);
  if (!permission.edit) return noEdit();
  if (tooBig(request)) return Response.json({ error: "That request is too big." }, { status: 413 });
  const body = await request.json().catch(() => null);
  const name = typeof body?.name === "string" ? body.name.trim() : "";
  if (!name) return Response.json({ error: "Type the company's name first." }, { status: 400 });
  if (name.length > 200) return Response.json({ error: "That name is too long." }, { status: 400 });
  return Response.json({ ok: true, result: await findWebsiteFor(name, { respectRobots: body?.robots !== false }) });
}

export async function handleWebSearch(request, env) {
  const permission = await checkMarketingPermission(request, env);
  if (!permission.edit) return noEdit();
  if (tooBig(request)) return Response.json({ error: "That request is too big." }, { status: 413 });
  const body = await request.json().catch(() => null);
  try {
    return Response.json({ ok: true, result: await searchSites(body?.queries, env) });
  } catch (err) {
    if (err instanceof SearchError) return Response.json({ error: err.message }, { status: err.status });
    throw err;
  }
}
