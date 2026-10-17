/**
 * Data-source selector for the budget & requirements module.
 *   reads  → Supabase when configured (a failed read throws; no mock fallback)
 *   writes → Supabase when configured, mirrored into the mock (see `liveWrite`)
 *
 * Both tabs read/write the reference ERP's own `budget_requests` collection
 * (`type` discriminates). Snapshot-undo restores are not reversed server-side.
 */

import { isSupabaseConfigured } from '@/lib/supabase';
import { liveRead } from '@/lib/supabase/read';
import { liveWrite } from '@/lib/supabase/write';

import * as live from './supabase';
import * as writeLive from './supabase-write';
import * as mock from './mock-api';

export const fetchRequirements = isSupabaseConfigured
  ? liveRead('budget-requirements/req', live.fetchRequirements)
  : mock.fetchRequirements;

export const fetchBudgetRequests = isSupabaseConfigured
  ? liveRead('budget-requirements/budget', live.fetchBudgetRequests)
  : mock.fetchBudgetRequests;

export const addRequirement = liveWrite('budget-requirements/addRequirement', writeLive.addRequirement, mock.addRequirement);
export const updateRequirement = liveWrite('budget-requirements/updateRequirement', writeLive.updateRequirement, mock.updateRequirement);
export const restoreRequirements = liveWrite('budget-requirements/restoreRequirements', writeLive.restoreRequirements, mock.restoreRequirements);

export const addBudgetRequest = liveWrite('budget-requirements/addBudgetRequest', writeLive.addBudgetRequest, mock.addBudgetRequest);
export const updateBudgetRequest = liveWrite('budget-requirements/updateBudgetRequest', writeLive.updateBudgetRequest, mock.updateBudgetRequest);
export const restoreBudgetRequests = liveWrite('budget-requirements/restoreBudgetRequests', writeLive.restoreBudgetRequests, mock.restoreBudgetRequests);
