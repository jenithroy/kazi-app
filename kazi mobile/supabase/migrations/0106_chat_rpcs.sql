-- =====================================================================
-- 0106 — starting and reshaping conversations, as three functions.
--
-- Creating a thread is two writes (the thread, then its membership) and the
-- client cannot do them as one: `chat_threads_read` is "am I in this thread",
-- so the row a plain INSERT ... RETURNING would hand back is filtered out by
-- the very policy that has not been satisfied yet. Splitting it client-side
-- also leaves a half-made thread behind whenever the second write fails.
--
-- So all three run in the database, SECURITY DEFINER, each re-checking the
-- caller's own rights first — the same checks the table policies make, since
-- DEFINER means the policies themselves no longer apply.
--
-- Still additive: new functions only, nothing existing is altered.
-- =====================================================================

-- The sorted uuid pair that makes a second dm between two people impossible.
create or replace function chat_dm_key(a uuid, b uuid)
returns text language sql immutable as $$
  select case when a < b then a::text || ':' || b::text else b::text || ':' || a::text end;
$$;

/*
 * Open the dm with someone, creating it only if it does not exist.
 *
 * Returning the existing thread rather than making a second one is the whole
 * point: two dms between the same pair would split the history in half and
 * neither side could tell which one the other was reading.
 */
create or replace function chat_start_dm(p_other uuid)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  v_me  uuid := app_person_id();
  v_key text;
  v_id  uuid;
begin
  if v_me is null then raise exception 'not signed in'; end if;
  if not app_can_edit('messenger') then raise exception 'no access to Messenger'; end if;
  if p_other is null or p_other = v_me then raise exception 'pick somebody else'; end if;
  if not exists (select 1 from people where id = p_other and status = 'Active') then
    raise exception 'that person is not on the staff list';
  end if;

  v_key := chat_dm_key(v_me, p_other);
  select id into v_id from chat_threads where dm_key = v_key;

  if v_id is null then
    insert into chat_threads (kind, dm_key, created_by) values ('dm', v_key, v_me)
      -- Two people tapping each other's name at once both get the same row.
      on conflict (dm_key) do update set updated_at = chat_threads.updated_at
      returning id into v_id;
  end if;

  -- Also the "un-leave": re-opening a dm you had removed brings it back with
  -- its history, which is what tapping the person's name is asking for.
  insert into chat_members (thread_id, person_id) values (v_id, v_me), (v_id, p_other)
    on conflict (thread_id, person_id) do update set left_at = null;

  return v_id;
end $$;

/* A new group, with its creator marked owner and every member added at once. */
create or replace function chat_create_group(p_name text, p_members uuid[])
returns uuid language plpgsql security definer set search_path = public as $$
declare
  v_me uuid := app_person_id();
  v_id uuid;
  v_members uuid[];
begin
  if v_me is null then raise exception 'not signed in'; end if;
  if not app_can_create_group() then raise exception 'your role cannot create groups'; end if;
  if coalesce(trim(p_name), '') = '' then raise exception 'a group needs a name'; end if;

  -- Only real, active staff, never a duplicate, never the creator twice.
  select coalesce(array_agg(distinct p.id), '{}') into v_members
    from people p where p.id = any(p_members) and p.status = 'Active' and p.id <> v_me;
  if array_length(v_members, 1) is null or array_length(v_members, 1) < 2 then
    raise exception 'a group needs at least two other people';
  end if;

  insert into chat_threads (kind, name, avatar_tint, created_by)
    values ('group', trim(p_name), 'dark', v_me) returning id into v_id;

  insert into chat_members (thread_id, person_id, member_role) values (v_id, v_me, 'owner');
  insert into chat_members (thread_id, person_id)
    select v_id, unnest(v_members);

  return v_id;
end $$;

/*
 * Rename a group and set who is in it, in one call.
 *
 * Removal is a soft `left_at`, matching what "delete conversation" does to
 * your own row: the person keeps the history they already have, and re-adding
 * them later restores the thread rather than starting a second one. The
 * caller can never remove themselves here — leaving is its own action.
 */
create or replace function chat_update_group(p_thread uuid, p_name text, p_members uuid[])
returns void language plpgsql security definer set search_path = public as $$
declare
  v_me uuid := app_person_id();
  v_members uuid[];
begin
  if v_me is null then raise exception 'not signed in'; end if;
  if not app_can_manage_group(p_thread) then raise exception 'your role cannot change this group'; end if;
  if not exists (select 1 from chat_threads where id = p_thread and kind = 'group') then
    raise exception 'that is not a group';
  end if;
  if coalesce(trim(p_name), '') = '' then raise exception 'a group needs a name'; end if;

  select coalesce(array_agg(distinct p.id), '{}') into v_members
    from people p where p.id = any(p_members) and p.status = 'Active' and p.id <> v_me;
  if array_length(v_members, 1) is null or array_length(v_members, 1) < 2 then
    raise exception 'a group needs at least two other people';
  end if;

  update chat_threads set name = trim(p_name), updated_at = now() where id = p_thread;

  insert into chat_members (thread_id, person_id)
    select p_thread, unnest(v_members)
    on conflict (thread_id, person_id) do update set left_at = null;

  update chat_members set left_at = now()
   where thread_id = p_thread
     and person_id <> v_me
     and left_at is null
     and person_id <> all (v_members);
end $$;

revoke all on function chat_start_dm(uuid)             from public;
revoke all on function chat_create_group(text, uuid[]) from public;
revoke all on function chat_update_group(uuid, text, uuid[]) from public;
grant execute on function chat_start_dm(uuid)             to authenticated;
grant execute on function chat_create_group(text, uuid[]) to authenticated;
grant execute on function chat_update_group(uuid, text, uuid[]) to authenticated;
