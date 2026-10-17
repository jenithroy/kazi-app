export type ChangeType =
  | 'Feature'
  | 'Fix'
  | 'Performance'
  | 'Refactor'
  | 'Docs'
  | 'Chore'
  | 'Style'
  | 'Test'
  | 'Build'
  | 'Revert'
  | 'Other';

export interface Commit {
  sha: string;
  shortSha: string;
  /** Derived from the conventional-commit prefix (`feat:` → Feature); `Other` when there's no recognised prefix. */
  type: ChangeType;
  /** `feat(billing):` → "billing"; '' when absent. */
  scope: string;
  /** First line of the message, prefix stripped. */
  subject: string;
  /** Everything after the first line, trimmed. */
  body: string;
  authorName: string;
  /** GitHub login when the API resolved one, else ''. */
  authorLogin: string;
  /** Commit (author) date, AD ISO. */
  date: string;
  /** github.com commit page. */
  url: string;
}

export interface CommitDay {
  /** yyyy-mm-dd, used as the group key. */
  key: string;
  /** "Fri 29 Aug 2026". */
  title: string;
  commits: Commit[];
}

export type FilterKey = 'All' | ChangeType;

export interface FilterChipData {
  key: FilterKey;
  label: string;
  count: number;
}

export interface CommitFeed {
  commits: Commit[];
  /** When this feed was fetched (ISO). */
  fetchedAt: string;
  /** true when the network call failed and this came from the AsyncStorage cache. */
  stale: boolean;
}
