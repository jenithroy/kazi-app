/**
 * Data-source selector for the purchases module.
 *   reads  → Supabase when configured (a failed read throws; no mock fallback)
 *   writes → Supabase when configured, mirrored into the mock (see `liveWrite`)
 *
 * Writes hit the reference ERP's own `finance_purchases` collection.
 * `restoreEntries` (snapshot undo) is not reversed server-side.
 */

import { isSupabaseConfigured } from '@/lib/supabase';
import { liveRead } from '@/lib/supabase/read';
import { liveWrite } from '@/lib/supabase/write';

import * as live from './supabase';
import * as writeLive from './supabase-write';
import * as mock from './mock-api';

export const fetchEntries = isSupabaseConfigured
  ? liveRead('purchases', live.fetchEntries)
  : mock.fetchEntries;

export const addEntry = liveWrite('purchases/addEntry', writeLive.addEntry, mock.addEntry);
export const updateEntry = liveWrite('purchases/updateEntry', writeLive.updateEntry, mock.updateEntry);
export const deleteEntry = liveWrite('purchases/deleteEntry', writeLive.deleteEntry, mock.deleteEntry);
export const restoreEntries = liveWrite('purchases/restoreEntries', writeLive.restoreEntries, mock.restoreEntries);
