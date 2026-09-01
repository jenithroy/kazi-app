-- ============================================================================
-- 0013_realtime.sql
--
-- Several screens used Firestore's onSnapshot to redraw when someone else
-- changed something: the bank balance widget, the marketing calendar, the
-- dispatch list, and the dashboard's finance tiles. Postgres can do the same
-- through Supabase Realtime, but only for tables published to it, and the
-- publication was empty -- so those screens would have gone static.
--
-- Only the tables that actually back a live view are added. Publishing
-- everything would mean every client waking up for changes nobody is watching.
--
-- Realtime applies the same RLS policies as a normal read, so a change to a row
-- someone cannot see is not delivered to them.
-- ============================================================================

do $$
declare
  t text;
begin
  foreach t in array array[
    'bank_transactions',   -- cash-at-bank widget, fed by the n8n importer
    'content_calendar',    -- marketing calendar, edited by several people at once
    'order_assignments',   -- dispatch list on the dashboard
    'orders',              -- pipeline counts
    'invoices',            -- revenue tiles
    'payroll',             -- finance tiles
    'expenses',
    'purchases',
    'people',              -- headcount
    'messages'             -- messenger
  ]
  loop
    if not exists (
      select 1 from pg_publication_tables
       where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = t
    ) then
      execute format('alter publication supabase_realtime add table public.%I', t);
    end if;
  end loop;
end $$;
