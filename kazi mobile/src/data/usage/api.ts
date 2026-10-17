import { isSupabaseConfigured } from '@/lib/supabase';
import { liveRead } from '@/lib/supabase/read';

import * as live from './supabase';
import * as mock from './mock';

export const fetchUsageDaily = isSupabaseConfigured ? liveRead('usage-daily', live.fetchUsageDaily) : mock.fetchUsageDaily;
export const fetchActivityFeed = isSupabaseConfigured ? liveRead('usage-feed', live.fetchActivityFeed) : mock.fetchActivityFeed;

export { sinceForRange } from './supabase';
