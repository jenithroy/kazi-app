import { useQuery } from '@tanstack/react-query';

import * as api from './api';
import { usageKeys } from './keys';
import type { RangeOption } from './types';

/** Everything the charts and leaderboards are built from — a year of it is a few hundred rows. */
export function useUsageDaily(range: RangeOption) {
  const since = api.sinceForRange(range);
  return useQuery({
    queryKey: usageKeys.daily(since),
    queryFn: () => api.fetchUsageDaily(since),
    staleTime: 60_000,
  });
}

/** The raw feed, newest first and capped — a feed, not an export. */
export function useActivityFeed(range: RangeOption) {
  const since = api.sinceForRange(range);
  return useQuery({
    queryKey: usageKeys.feed(since),
    queryFn: () => api.fetchActivityFeed(since),
    staleTime: 60_000,
  });
}
