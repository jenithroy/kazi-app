-- =====================================================================
-- 0107 — make the chat-media storage policies safe against a bad path.
--
-- The policies from 0105 cast the first path segment straight to uuid:
--
--   app_in_thread(nullif(split_part(name, '/', 1), '')::uuid)
--
-- Every object the app writes is `<thread uuid>/<name>.<ext>`, so that is
-- fine for anything the app made. But a policy is evaluated per row for
-- EVERY object in the bucket, and one object whose first segment is not a
-- uuid — a stray upload from the dashboard, a future feature that lays the
-- bucket out differently — would raise `invalid input syntax for type uuid`
-- and fail the whole listing, not just that row. A permission check should
-- answer "no" to something it does not recognise, never throw.
--
-- So the cast moves into a function that returns false for anything that
-- isn't a thread id. Additive: same three policies, same rule, one helper.
-- =====================================================================

create or replace function app_in_thread_path(object_name text)
returns boolean language plpgsql stable security definer set search_path = public as $$
declare
  v_segment text := split_part(coalesce(object_name, ''), '/', 1);
begin
  if v_segment !~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$' then
    return false;
  end if;
  return app_in_thread(v_segment::uuid);
end $$;

revoke all on function app_in_thread_path(text) from public;
grant execute on function app_in_thread_path(text) to authenticated;

drop policy if exists chat_media_read on storage.objects;
create policy chat_media_read on storage.objects for select to authenticated
  using (bucket_id = 'chat-media' and app_in_thread_path(name));

drop policy if exists chat_media_insert on storage.objects;
create policy chat_media_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'chat-media' and app_can_edit('messenger') and app_in_thread_path(name));

-- Unchanged in substance — restated only so all three read the same way.
drop policy if exists chat_media_delete on storage.objects;
create policy chat_media_delete on storage.objects for delete to authenticated
  using (bucket_id = 'chat-media' and owner = auth.uid());
