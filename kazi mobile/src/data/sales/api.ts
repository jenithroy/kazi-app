/**
 * Data-source selector for the sales/orders module.
 *   reads  → Supabase when configured (a failed read throws; no mock fallback)
 *   writes → Supabase when configured, mirrored into the mock (see `liveWrite`)
 *
 * Writes hit the reference ERP's own `orders` collection. `restoreOrders`
 * (snapshot undo) is not reversed server-side.
 */

import { isSupabaseConfigured } from '@/lib/supabase';
import { liveRead } from '@/lib/supabase/read';
import { liveWrite } from '@/lib/supabase/write';

import * as live from './supabase';
import * as writeLive from './supabase-write';
import * as mock from './mock-api';

export const fetchOrders = isSupabaseConfigured
  ? liveRead('sales', live.fetchOrders)
  : mock.fetchOrders;

export const addOrder = liveWrite('sales/addOrder', writeLive.addOrder, mock.addOrder);
export const updateOrder = liveWrite('sales/updateOrder', writeLive.updateOrder, mock.updateOrder);
export const setOrderStage = liveWrite('sales/setOrderStage', writeLive.setOrderStage, mock.setOrderStage);
export const setOrderEmbellishments = liveWrite('sales/setOrderEmbellishments', writeLive.setOrderEmbellishments, mock.setOrderEmbellishments);
export const addOrderNote = liveWrite('sales/addOrderNote', writeLive.addOrderNote, mock.addOrderNote);
export const setOrderStatus = liveWrite('sales/setOrderStatus', writeLive.setOrderStatus, mock.setOrderStatus);
export const deleteOrder = liveWrite('sales/deleteOrder', writeLive.deleteOrder, mock.deleteOrder);
export const restoreOrders = liveWrite('sales/restoreOrders', writeLive.restoreOrders, mock.restoreOrders);
