import AsyncStorage from '@react-native-async-storage/async-storage';

import { parseCommit, type RawCommit } from './parse';
import type { Commit, CommitFeed } from './types';

/** The mobile repo — the Changelog is its live commit history. */
const REPO = 'crrishav/kazi-mobile';
const CACHE_KEY = 'changelog:commits:v1';
const PER_PAGE = 100;
const MAX_PAGES = 3;

interface CachePayload {
  commits: Commit[];
  fetchedAt: string;
}

async function readCache(): Promise<CachePayload | null> {
  try {
    const raw = await AsyncStorage.getItem(CACHE_KEY);
    return raw ? (JSON.parse(raw) as CachePayload) : null;
  } catch {
    return null;
  }
}

/**
 * Fetches up to `MAX_PAGES × PER_PAGE` commits from the GitHub REST API,
 * newest first, caching the result. On any network / API failure it falls
 * back to the last cached feed (flagged `stale`); with no cache it rethrows.
 */
export async function fetchCommitFeed(): Promise<CommitFeed> {
  try {
    const all: RawCommit[] = [];
    for (let page = 1; page <= MAX_PAGES; page++) {
      const res = await fetch(
        `https://api.github.com/repos/${REPO}/commits?per_page=${PER_PAGE}&page=${page}`,
        { headers: { Accept: 'application/vnd.github+json' } },
      );
      // 404 here means the repository is private: this call is unauthenticated,
      // and a token can't ship in the bundle. Retrying will never succeed.
      if (res.status === 404) throw new Error('PRIVATE_REPO');
      if (!res.ok) throw new Error(`GitHub API ${res.status}`);
      const batch = (await res.json()) as RawCommit[];
      all.push(...batch);
      if (batch.length < PER_PAGE) break;
    }

    const commits = all.map(parseCommit);
    const fetchedAt = new Date().toISOString();
    await AsyncStorage.setItem(CACHE_KEY, JSON.stringify({ commits, fetchedAt } satisfies CachePayload));
    return { commits, fetchedAt, stale: false };
  } catch (err) {
    const cached = await readCache();
    if (cached) return { commits: cached.commits, fetchedAt: cached.fetchedAt, stale: true };
    throw err;
  }
}
