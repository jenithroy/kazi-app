-- =====================================================================
-- 0101 — stop the reference tables from throwing on a Firebase token.
--
-- 0004 gated the five reference tables on `auth.uid() IS NOT NULL`. That
-- looks harmless, but `auth.uid()` CASTS the token's `sub` to uuid, and a
-- Firebase sub is a 28-character string like "yqQuxq7weYZvc9MBVCjfuyueEAD3".
-- The cast raises 22P02 rather than returning null, so the read fails.
--
-- It only shows up on reads that touch `positions` — any `security_invoker`
-- compat view joining it (fs_attendance, fs_employees, fs_users …) died with
--     invalid input syntax for type uuid
-- while fs_tasks and fs_orders, which don't join it, were fine.
--
-- `app_jwt_sub()` reads the same claim as text and never casts, so it works
-- for both a Firebase token and a native Supabase one.
-- =====================================================================

do $$
declare t text;
begin
  foreach t in array array['sections','finance_tabs','positions',
                           'position_permissions','position_finance_tabs'] loop
    execute format('drop policy if exists read_all on public.%I', t);
    execute format(
      'create policy read_all on public.%I for select to authenticated using (app_jwt_sub() <> '''')', t);
  end loop;
end $$;
