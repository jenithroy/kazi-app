-- ============================================================================
-- 0074_discount_mode_accepts_amount.sql
--
-- BUG: the Billing form's "Discount as: % | Amount" control saves the word 'amount' (components/billing/DocCard.jsx, utils/billing.jsx; DocPreview.jsx,
-- InvoicePDF.jsx and pages/Billing.jsx all compare against "amount"), but migration 0022 made the database accept only 'pct' and 'flat' on invoices,
-- quotations and challans. Nothing translates between the two, so choosing "Amount" and pressing Save was refused (check violation 23514) and the
-- person saw "Failed to save document". Found 2026-11-16 by a browser robot and reproduced directly against the database:
-- discount_mode = 'pct' -> saved, 'flat' -> saved, 'amount' -> refused [23514].
--
-- FIX (additive, no app change): the three checks also accept 'amount'. 'pct' and 'flat' keep working, no row changes (every existing document is
-- 'pct'), and a document with a flat-amount discount now saves, previews, prints and downloads as the app already expects.
--
-- Applied by hand on 2026-11-16, after a rehearsal on the live database in a transaction that was rolled back (6 checks: only the three checks
-- changed; 'amount' refused -> accepted for everyone who may edit billing, nobody else's result moved; 'pct' and 'flat' unchanged; no row touched).
-- Undo: supabase/undo/0074_discount_mode_accepts_amount.undo.sql.
-- ============================================================================

alter table public.invoices   drop constraint if exists invoices_discount_mode_check;
alter table public.invoices   add  constraint invoices_discount_mode_check   check (discount_mode in ('pct', 'flat', 'amount'));

alter table public.quotations drop constraint if exists quotations_discount_mode_check;
alter table public.quotations add  constraint quotations_discount_mode_check check (discount_mode in ('pct', 'flat', 'amount'));

alter table public.challans   drop constraint if exists challans_discount_mode_check;
alter table public.challans   add  constraint challans_discount_mode_check   check (discount_mode in ('pct', 'flat', 'amount'));
