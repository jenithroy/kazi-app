import type { Theme } from '@/theme';

import type { ChangeType, Commit, CommitDay, FilterChipData, FilterKey } from './types';

/** Raw shape from `GET /repos/:owner/:repo/commits` (only the fields we read). */
export interface RawCommit {
  sha: string;
  html_url: string;
  commit: { message: string; author: { name?: string; date?: string } | null };
  author: { login?: string } | null;
}

const CONVENTIONAL = /^(\w+)(?:\(([^)]+)\))?!?:\s*(.+)$/;

const TYPE_MAP: Record<string, ChangeType> = {
  feat: 'Feature',
  fix: 'Fix',
  perf: 'Performance',
  refactor: 'Refactor',
  docs: 'Docs',
  chore: 'Chore',
  style: 'Style',
  test: 'Test',
  build: 'Build',
  ci: 'Build',
  revert: 'Revert',
};

export const TYPE_ORDER: ChangeType[] = [
  'Feature', 'Fix', 'Performance', 'Refactor', 'Docs', 'Chore', 'Style', 'Test', 'Build', 'Revert', 'Other',
];

export function parseCommit(raw: RawCommit): Commit {
  const message = raw.commit?.message ?? '';
  const [firstLine, ...rest] = message.split('\n');
  const match = firstLine.match(CONVENTIONAL);

  const type: ChangeType = match ? TYPE_MAP[match[1].toLowerCase()] ?? 'Other' : 'Other';
  const scope = match?.[2]?.trim() ?? '';
  const subject = (match ? match[3] : firstLine).trim();

  return {
    sha: raw.sha,
    shortSha: raw.sha.slice(0, 7),
    type,
    scope,
    subject: subject || '(no message)',
    body: rest.join('\n').trim(),
    authorName: raw.commit?.author?.name ?? 'Unknown',
    authorLogin: raw.author?.login ?? '',
    date: raw.commit?.author?.date ?? new Date().toISOString(),
    url: raw.html_url,
  };
}

export function buildFilters(commits: Commit[]): FilterChipData[] {
  const counts: Partial<Record<ChangeType, number>> = {};
  commits.forEach((c) => {
    counts[c.type] = (counts[c.type] ?? 0) + 1;
  });

  const chips: FilterChipData[] = [{ key: 'All', label: 'All', count: commits.length }];
  TYPE_ORDER.forEach((t) => {
    const count = counts[t];
    if (count) chips.push({ key: t as FilterKey, label: t, count });
  });
  return chips;
}

const DAY_FMT: Intl.DateTimeFormatOptions = { weekday: 'short', day: '2-digit', month: 'short', year: 'numeric' };

export function groupByDay(commits: Commit[]): CommitDay[] {
  const days: CommitDay[] = [];
  const sorted = commits.slice().sort((a, b) => b.date.localeCompare(a.date));
  sorted.forEach((c) => {
    const key = c.date.slice(0, 10);
    let day = days.find((d) => d.key === key);
    if (!day) {
      day = { key, title: new Date(c.date).toLocaleDateString('en-GB', DAY_FMT), commits: [] };
      days.push(day);
    }
    day.commits.push(c);
  });
  return days;
}

export function tally(commits: Commit[]) {
  const t = { Feature: 0, Fix: 0, other: 0 };
  commits.forEach((c) => {
    if (c.type === 'Feature') t.Feature++;
    else if (c.type === 'Fix') t.Fix++;
    else t.other++;
  });
  return t;
}

/** Relative "3h ago" / "2d ago" for the last-fetched line. */
export function relativeTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.round(diff / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.round(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.round(hrs / 24);
  return `${days}d ago`;
}

export interface TypePalette {
  bg: string;
  fg: string;
  dot: string;
}

/** Ported from the old `utils.typePalette` — Feature/Fix/Performance map onto wash tokens, Revert is the one inverted tag, everything else shares a neutral tag. */
export function typePalette(theme: Theme, type: ChangeType): TypePalette {
  switch (type) {
    case 'Feature':
      return { bg: theme.accentWash, fg: theme.accentWashText, dot: theme.scheme === 'light' ? '#22A97A' : theme.accent };
    case 'Fix':
      return { bg: theme.dangerWash, fg: theme.dangerWashText, dot: theme.scheme === 'light' ? theme.danger : theme.dangerWashText };
    case 'Performance':
      return { bg: theme.warningWash, fg: theme.warningWashText, dot: theme.warningWashText };
    case 'Refactor':
      return { bg: theme.draftWash, fg: theme.draftWashText, dot: theme.draftDot };
    case 'Revert':
      return { bg: theme.surfaceInverted, fg: theme.onDark.avatarText, dot: theme.surfaceInverted };
    default:
      return { bg: theme.draftWash, fg: theme.draftWashText, dot: theme.scheme === 'light' ? '#A3AFA9' : 'rgba(126,149,138,0.7)' };
  }
}
