/**
 * Data-source selector for the customers module.
 *   reads  → Supabase when configured (a failed read throws; no mock fallback)
 *   writes → Supabase when configured, mirrored into the mock (see `liveWrite`)
 *
 * Writes hit the reference ERP's own `customers` collection. `restoreCustomers`
 * (snapshot undo) re-inserts a deleted row at its original id — see
 * `supabase-write.ts`.
 */

import { isSupabaseConfigured } from '@/lib/supabase';
import { liveRead } from '@/lib/supabase/read';
import { liveWrite } from '@/lib/supabase/write';

import * as live from './supabase';
import * as writeLive from './supabase-write';
import * as mock from './mock-api';

export const fetchCustomers = isSupabaseConfigured
  ? liveRead('customers', live.fetchCustomers)
  : mock.fetchCustomers;

export const addCustomer = liveWrite('customers/addCustomer', writeLive.addCustomer, mock.addCustomer);
export const updateCustomer = liveWrite('customers/updateCustomer', writeLive.updateCustomer, mock.updateCustomer);
export const deleteCustomer = liveWrite('customers/deleteCustomer', writeLive.deleteCustomer, mock.deleteCustomer);
export const restoreCustomers = liveWrite('customers/restoreCustomers', writeLive.restoreCustomers, mock.restoreCustomers);
