-- =====================================================================
-- 0122 — resolve the assignee by name too, not just assignee_id
--
-- Checked live data: every task created from the ERP web app has
-- assignee_id null — its own task editor only ever writes the free-text
-- `assignee` name column, never the id. 0117/0121's trigger required
-- assignee_id, so it silently never fired for a single web-app-created or
-- -edited task. Same class of gap as chat (0116) and the same fix: resolve
-- the recipient the way kazi-mobile's own write shim already does for a
-- client-supplied name (ilike on people.full_name), so this works
-- regardless of which app wrote the row.
--
-- Reassignment detection now compares the *resolved* id on both sides too —
-- comparing raw old.assignee_id/new.assignee_id would never see a change at
-- all when neither side ever has it set.
-- =====================================================================

create or replace function tasks_notify()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_actor_id uuid := app_person_id();
  v_actor_name text;
  v_recipient_id uuid;
  v_old_recipient_id uuid;
  v_recipient_email citext;
  v_event text;
  v_title text;
  v_body text;
begin
  select id into v_recipient_id from people
   where new.assignee_id is not null and id = new.assignee_id
      or (new.assignee_id is null and trim(full_name) ilike trim(coalesce(new.assignee, '')) and trim(coalesce(new.assignee, '')) <> '')
   limit 1;
  if v_recipient_id is null or v_recipient_id = v_actor_id then return new; end if;

  if tg_op = 'INSERT' then
    v_event := 'task.assigned';
  else
    select id into v_old_recipient_id from people
     where old.assignee_id is not null and id = old.assignee_id
        or (old.assignee_id is null and trim(full_name) ilike trim(coalesce(old.assignee, '')) and trim(coalesce(old.assignee, '')) <> '')
     limit 1;
    if v_old_recipient_id is distinct from v_recipient_id then
      v_event := 'task.reassigned';
    elsif old.status is distinct from new.status then
      v_event := 'task.status_changed';
    elsif old.notes is distinct from new.notes and coalesce(new.notes, '') <> '' then
      v_event := 'task.note_added';
    else
      return new;
    end if;
  end if;

  select email into v_recipient_email from people where id = v_recipient_id;
  if v_recipient_email is null then return new; end if;

  select full_name into v_actor_name from people where id = v_actor_id;
  v_actor_name := coalesce(v_actor_name, 'Someone');

  v_title := case v_event
    when 'task.assigned'       then 'New task assigned to you'
    when 'task.reassigned'     then 'This task was assigned to you'
    when 'task.status_changed' then 'Task ' || lower(coalesce(new.status, 'updated'))
    when 'task.note_added'     then 'Note on your task'
  end;
  v_body := case v_event
    when 'task.status_changed' then v_actor_name || ' moved "' || coalesce(new.title, 'this task') || '" to ' || coalesce(new.status, 'a new status') || '.'
    when 'task.note_added'     then v_actor_name || ' added a note to "' || coalesce(new.title, 'this task') || '".'
    else v_actor_name || ' assigned "' || coalesce(new.title, 'a task') || '" to you.'
  end;

  insert into mobile_notifications (recipient_id, recipient_email, type, event_type, section, title, body, deep_link, actor_name)
  values (v_recipient_id, v_recipient_email, 'action', v_event, 'tasks', v_title, v_body, '/tasks?focus=' || new.id::text, v_actor_name);

  return new;
exception when others then
  raise warning 'tasks_notify failed for task %: %', new.id, sqlerrm;
  return new;
end $$;
