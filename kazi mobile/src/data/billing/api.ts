/**
 * Data-source selector for the billing module.
 *   reads  → `fetchInvoices` / `fetchQuotations` / `fetchChallans` from Supabase
 *            when configured
 *   writes → invoice/quotation/challan creates + updates + payments to Supabase
 *
 * The number on a created document is drawn by the `next_doc_number` RPC before
 * the write (see `./doc-numbers`), so mobile and the website share one gap-free
 * IRD series per fiscal year. Invoices/quotations/challans stay un-deletable.
 * Snapshot-undo restores are not reversed server-side.
 */

import { isSupabaseConfigured } from '@/lib/supabase';
import { liveRead } from '@/lib/supabase/read';
import { liveWrite } from '@/lib/supabase/write';

import * as live from './supabase';
import * as writeLive from './supabase-write';
import * as mock from './mock-api';

export { removeOpenChallan } from './mock-api';

export const addInvoice = liveWrite('billing/addInvoice', writeLive.addInvoice, mock.addInvoice);
export const addQuotation = liveWrite('billing/addQuotation', writeLive.addQuotation, mock.addQuotation);
export const addChallan = liveWrite('billing/addChallan', writeLive.addChallan, mock.addChallan);

export const fetchInvoices = isSupabaseConfigured
  ? liveRead('billing/invoices', live.fetchInvoices)
  : mock.fetchInvoices;

export const fetchQuotations = isSupabaseConfigured
  ? liveRead('billing/quotations', live.fetchQuotations)
  : mock.fetchQuotations;

export const fetchChallans = isSupabaseConfigured
  ? liveRead('billing/challans', live.fetchChallans)
  : mock.fetchChallans;

export const fetchOpenChallans = isSupabaseConfigured
  ? liveRead('billing/openChallans', live.fetchOpenChallans)
  : mock.fetchOpenChallans;

export const updateChallan = liveWrite('billing/updateChallan', writeLive.updateChallan, mock.updateChallan);
export const updateChallanStatus = liveWrite(
  'billing/updateChallanStatus',
  writeLive.updateChallanStatus,
  mock.updateChallanStatus,
);
export const restoreChallans = liveWrite('billing/restoreChallans', writeLive.restoreChallans, mock.restoreChallans);

export const updateInvoice = liveWrite('billing/updateInvoice', writeLive.updateInvoice, mock.updateInvoice);
export const addPayment = liveWrite('billing/addPayment', writeLive.addPayment, mock.addPayment);
export const restoreInvoices = liveWrite('billing/restoreInvoices', writeLive.restoreInvoices, mock.restoreInvoices);

export const updateQuotation = liveWrite('billing/updateQuotation', writeLive.updateQuotation, mock.updateQuotation);
export const updateQuotationStatus = liveWrite(
  'billing/updateQuotationStatus',
  writeLive.updateQuotationStatus,
  mock.updateQuotationStatus,
);
export const restoreQuotations = liveWrite('billing/restoreQuotations', writeLive.restoreQuotations, mock.restoreQuotations);
