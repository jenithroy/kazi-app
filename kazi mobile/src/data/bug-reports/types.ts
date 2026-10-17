export type Severity = 'low' | 'medium' | 'high' | 'critical';
export type BugStatus = 'open' | 'in-progress' | 'resolved' | 'closed';

export type SeverityFilter = 'all' | Severity;
export type StatusFilter = 'all' | BugStatus;

export interface BugReport {
  id: string;
  /** Human ref, e.g. "BUG-014". */
  ref: string;
  title: string;
  /** Which part of the app — free text from a fixed list (see BUG_AREAS). */
  area: string;
  severity: Severity;
  /** Steps to reproduce / what happened vs what was expected. */
  steps: string;
  status: BugStatus;
  reportedBy: string;
  /** AD ISO date-time. */
  createdAt: string;
  /** Placeholder until the image-picker migration (plan item 5) — no real asset yet. */
  screenshot: boolean;
}

export interface BugReportDraft {
  title: string;
  area: string;
  severity: Severity;
  steps: string;
  screenshot: boolean;
}
