/**
 * Data-source selector for the employees & HR module.
 *   reads  → Supabase when configured (a failed read throws; no mock fallback)
 *   writes → Supabase when configured, mirrored into the mock (see `liveWrite`)
 *
 * Writes hit the reference ERP's own `employees` collection. Payroll month
 * approvals have no live collection and stay mock-only (the run periods
 * themselves are read from `finance_payroll`). `deleteEmployee` is a soft
 * delete (`status: 'Inactive'`) and `restoreEmployees` reverses it.
 */

import { isSupabaseConfigured } from '@/lib/supabase';
import { liveRead } from '@/lib/supabase/read';
import { liveWrite } from '@/lib/supabase/write';

import * as live from './supabase';
import * as writeLive from './supabase-write';
import * as mock from './mock-api';

export { fetchApprovals, approveMonth } from './mock-api';

export const fetchEmployees = isSupabaseConfigured
  ? liveRead('employees-hr', live.fetchEmployees)
  : mock.fetchEmployees;

export const fetchPayMonths = isSupabaseConfigured
  ? liveRead('employees-hr/payroll', live.fetchPayMonths)
  : mock.fetchPayMonths;

/** Reference data, not a module collection — falls back to the mock list itself. */
export const fetchPositions = live.fetchPositions;

export const addEmployee = liveWrite('employees-hr/addEmployee', writeLive.addEmployee, mock.addEmployee);
export const updateEmployee = liveWrite('employees-hr/updateEmployee', writeLive.updateEmployee, mock.updateEmployee);
export const deleteEmployee = liveWrite('employees-hr/deleteEmployee', writeLive.deleteEmployee, mock.deleteEmployee);
export const restoreEmployees = liveWrite('employees-hr/restoreEmployees', writeLive.restoreEmployees, mock.restoreEmployees);
