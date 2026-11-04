/**
 * Client for this app's own Worker route behind Reddit Leads (worker/lib/redditLeads.js):
 *
 *   POST /api/reddit-leads/sync   "Check now": the same check the schedule runs every 30 minutes
 *
 * (Reading a brand's contact pages and the tender notices are the Contact Finder's: lib/emailFinderApi.js.)
 */
import { callWorker } from "./workerApi";

/** Run a check now. Resolves to { ok, subreddits, fetched, matched, saved, errors }. */
export const runRedditCheck = () => callWorker("/api/reddit-leads/sync", {}, { page: "Reddit Leads" });
