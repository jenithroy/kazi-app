/**
 * A filed report goes two places: the Discord channel the web ERP already posts
 * to (the durable, shared copy) and this phone's own list. The relay is what
 * matters, so a relay failure fails the whole mutation — the local copy alone
 * would let someone believe the team had been told.
 */

import * as local from './local-store';
import { isRelayConfigured, relayBugReport } from './relay';
import type { BugReport, BugReportDraft } from './types';

export { fetchBugReports, updateBugStatus, restoreBugReports } from './local-store';
export { isRelayConfigured } from './relay';

export async function addBugReport(draft: BugReportDraft, reportedBy: string): Promise<BugReport> {
  const report = await local.addBugReport(draft, reportedBy);
  if (!isRelayConfigured()) return report;
  try {
    await relayBugReport(report);
  } catch (err) {
    // Keeping it would show as filed when nobody was told; drop it so the
    // person sees the error and can send it again.
    await local.removeBugReport(report.id);
    throw err;
  }
  return report;
}
