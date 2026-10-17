/**
 * Data-source selector for Roles & permissions.
 *   reads  → Supabase when configured (a failed read throws; no mock fallback)
 *   writes → Supabase when configured, with NO mock mirror
 *
 * Writes deliberately skip `liveWrite`. Everywhere else a refused write falls
 * back to the mock so the screen stays coherent; here that would render access
 * the database never granted, which is exactly the lie this screen cannot
 * tell. A refusal surfaces, the draft survives, and the save can be retried.
 */

import { isSupabaseConfigured } from '@/lib/supabase';
import { liveRead } from '@/lib/supabase/read';

import * as live from './supabase';
import * as writeLive from './supabase-write';
import * as mock from './mock-api';

export const fetchAdminMatrix = isSupabaseConfigured
  ? liveRead('admin-panel', live.fetchAdminMatrix)
  : mock.fetchAdminMatrix;

export const saveRoleDraft = isSupabaseConfigured ? writeLive.saveRoleDraft : mock.saveRoleDraft;
export const createRole = isSupabaseConfigured ? writeLive.createRole : mock.createRole;
export const updateRole = isSupabaseConfigured ? writeLive.updateRole : mock.updateRole;
export const deleteRole = isSupabaseConfigured ? writeLive.deleteRole : mock.deleteRole;
export const setPersonRole = isSupabaseConfigured ? writeLive.setPersonRole : mock.setPersonRole;
