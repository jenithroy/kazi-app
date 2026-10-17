import { useCallback, useEffect, useState } from 'react';

import AsyncStorage from '@react-native-async-storage/async-storage';

/**
 * The emoji this person actually reaches for, most recent first.
 *
 * Per-device rather than per-account, and stored locally: it is a convenience
 * for one thumb, not a fact about the business, and putting it in Postgres
 * would mean a table, a policy and a round trip for something that only ever
 * reorders a row of buttons.
 */
const KEY = 'chat-recent-emoji';
const LIMIT = 24;

export function useRecentEmoji(): { recent: string[]; remember: (emoji: string) => void } {
  const [recent, setRecent] = useState<string[]>([]);

  useEffect(() => {
    let cancelled = false;
    AsyncStorage.getItem(KEY)
      .then((raw) => {
        if (cancelled || !raw) return;
        const parsed: unknown = JSON.parse(raw);
        if (Array.isArray(parsed)) setRecent(parsed.filter((e): e is string => typeof e === 'string'));
      })
      .catch(() => {
        // A stored list that will not parse is not worth surfacing — the
        // picker simply opens without a Recent row.
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const remember = useCallback((emoji: string) => {
    setRecent((current) => {
      const next = [emoji, ...current.filter((e) => e !== emoji)].slice(0, LIMIT);
      void AsyncStorage.setItem(KEY, JSON.stringify(next)).catch(() => {});
      return next;
    });
  }, []);

  return { recent, remember };
}
