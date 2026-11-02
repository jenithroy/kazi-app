/**
 * Data-source selector for Roles & Duties: Supabase when configured (a failed read throws; no mock fallback), the mock otherwise.
 * Read-only: nothing on this screen is written.
 */
import { isSupabaseConfigured } from '@/lib/supabase';
import { liveRead } from '@/lib/supabase/read';

import * as live from './supabase';
import * as mock from './mock';

export const fetchRolesPage = isSupabaseConfigured ? liveRead('roles/page', live.fetchRolesPage) : mock.fetchRolesPage;
