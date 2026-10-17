/**
 * Bug reports are relayed to the same endpoint the web ERP posts to
 * (`worker/index.js` → `POST /api/bug-report`), which holds the Discord webhook
 * in its own environment. The webhook URL must never ship in the app bundle,
 * so mobile talks to the worker, not to Discord.
 *
 * The worker's contract: `multipart/form-data`, with `title` and `description`
 * required; it rejects any other content type.
 */

import type { BugReport } from './types';

const ENDPOINT = (process.env.EXPO_PUBLIC_BUG_REPORT_URL ?? '').trim();

export function isRelayConfigured(): boolean {
  return ENDPOINT.length > 0;
}

export async function relayBugReport(report: BugReport): Promise<void> {
  if (!isRelayConfigured()) throw new Error('No bug-report endpoint is configured.');

  const form = new FormData();
  form.append('title', report.title);
  form.append('description', report.steps);
  form.append('reportedBy', report.reportedBy);
  form.append('severity', report.severity);
  // The worker labels this "Page/URL"; mobile has no URL, so name the app and
  // the report's own ref, and let `section` carry the area.
  form.append('pageUrl', `kazi-mobile · ${report.ref}`);
  form.append('section', report.area);

  const res = await fetch(ENDPOINT, { method: 'POST', body: form });
  if (!res.ok) {
    const body = (await res.json().catch(() => null)) as { error?: string } | null;
    throw new Error(body?.error ?? `Bug report relay failed (${res.status}).`);
  }
}
