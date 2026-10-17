/**
 * Data-source selector for the marketing module.
 *   reads  → Supabase when configured (a failed read throws; no mock fallback)
 *   writes → Supabase when configured, mirrored into the mock (see `liveWrite`)
 *
 * Writes hit the reference ERP's own `content_calendar` collection.
 */

import { isSupabaseConfigured } from '@/lib/supabase';
import { liveRead } from '@/lib/supabase/read';
import { liveWrite } from '@/lib/supabase/write';

import * as live from './supabase';
import * as writeLive from './supabase-write';
import * as mock from './mock-api';

export const fetchEntries = isSupabaseConfigured
  ? liveRead('marketing', live.fetchEntries)
  : mock.fetchEntries;

export const addEntry = liveWrite('marketing/addEntry', writeLive.addEntry, mock.addEntry);
export const updateEntry = liveWrite('marketing/updateEntry', writeLive.updateEntry, mock.updateEntry);
export const removeEntry = liveWrite('marketing/removeEntry', writeLive.removeEntry, mock.removeEntry);
export const restoreEntry = liveWrite('marketing/restoreEntry', writeLive.restoreEntry, mock.restoreEntry);
