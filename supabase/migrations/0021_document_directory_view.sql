-- ============================================================================
-- 0021_document_directory_view.sql
--
-- Documentation only. No behaviour changes.
--
-- fs_employees is the one view in the schema that deliberately does NOT run as
-- the caller. 0102 rebuilt it as a company directory: every signed-in person
-- sees the roster (name, email, position, department, location, status), while
-- phone, address, salary, bank details, PAN and join date come back NULL unless
-- it is your own row or you hold employees access at tier 2 or above.
--
-- That masking IS the access control, and it only works because the view can
-- read every row of `people`. Enabling security_invoker on it — which is the
-- correct fix for every other view, and what 0018 did across the board — would
-- cut it back to the caller's own row and silently destroy the directory.
--
-- Recording that here so the next person to run a security_invoker audit can
-- tell a deliberate definer view apart from one that simply lost the setting.
-- If this view is ever rewritten, the column masking must be preserved.
-- ============================================================================

comment on view fs_employees is
  'Company directory. Deliberately SECURITY DEFINER (no security_invoker): it '
  'must read all of people so it can return the roster to everyone while '
  'masking phone/address/salary/bank/PAN/join_date to your own row or '
  'employees access at tier >= 2. Do not enable security_invoker — the column '
  'masking is the access control, not row level security. See migration 0102.';

comment on view fs_orders is
  'Firestore-shaped read model for orders. Runs as the caller (security_invoker), '
  'so row level security on `orders` applies. Re-apply that setting after any '
  'CREATE OR REPLACE — it silently drops reloptions. See migration 0018.';
