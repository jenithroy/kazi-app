/**
 * Reports a person files from this phone. There is no bug-report table in the
 * shared Postgres, so the durable copy is the Discord relay (see `relay.ts`);
 * this keeps a local record so the reporter can still see what they sent.
 * AsyncStorage, so it survives a restart rather than vanishing.
 */

import AsyncStorage from '@react-native-async-storage/async-storage';

import { nextBugRef } from './mock';
import type { BugReport, BugReportDraft, BugStatus } from './types';

const KEY = 'kazi-mobile-bug-reports';

let cache: BugReport[] | null = null;

async function load(): Promise<BugReport[]> {
  if (cache) return cache;
  try {
    const raw = await AsyncStorage.getItem(KEY);
    cache = raw ? (JSON.parse(raw) as BugReport[]) : [];
  } catch {
    cache = [];
  }
  return cache;
}

async function save(next: BugReport[]): Promise<void> {
  cache = next;
  try {
    await AsyncStorage.setItem(KEY, JSON.stringify(next));
  } catch {
    // A full disk shouldn't lose the report that was just relayed to Discord.
  }
}

export async function fetchBugReports(): Promise<BugReport[]> {
  return [...(await load())];
}

export async function addBugReport(draft: BugReportDraft, reportedBy: string): Promise<BugReport> {
  const db = await load();
  const report: BugReport = {
    id: `b${Date.now()}`,
    ref: nextBugRef(db),
    title: draft.title.trim() || 'Untitled report',
    area: draft.area,
    severity: draft.severity,
    steps: draft.steps.trim(),
    status: 'open',
    reportedBy,
    createdAt: new Date().toISOString(),
    screenshot: draft.screenshot,
  };
  await save([report, ...db]);
  return report;
}

/** Drops a report that was saved locally but never reached the relay. */
export async function removeBugReport(id: string): Promise<void> {
  const db = await load();
  await save(db.filter((r) => r.id !== id));
}

export async function updateBugStatus(id: string, status: BugStatus): Promise<void> {
  const db = await load();
  await save(db.map((r) => (r.id === id ? { ...r, status } : r)));
}

/** Snapshot restore — the established undo path for status changes. */
export async function restoreBugReports(previous: BugReport[]): Promise<void> {
  await save([...previous]);
}
