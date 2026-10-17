-- =====================================================================
-- 0117 — server-side task notifications
--
-- Same reasoning as 0116: kazi-mobile's client-side notify() calls for
-- task.assigned / task.reassigned / task.status_changed / task.note_added
-- (src/data/tasks/hooks.ts, useSaveTask's onSuccess) only ever ran when the
-- save happened through kazi-mobile's own client. A task created or edited
-- from the ERP web app never notified the assignee. Moving this to a
-- trigger on `tasks` fixes that for both apps at once; the client-side
-- calls are removed in the same change to avoid a double notification on a
-- kazi-mobile-originated save.
--
-- All four task events route to the same person — the assignee — so unlike
-- the rest of the routing.ts matrix this needs no section/role/position
-- lookup, just assignee_id. That's what makes it tractable as a trigger;
-- most other tables' rules are not this simple (see the reply where this
-- migration was introduced).
-- =====================================================================

create or replace function tasks_notify()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_actor_id uuid := app_person_id();
  v_actor_name text;
  v_recipient_email citext;
  v_event text;
  v_title text;
  v_body text;
begin
  if new.assignee_id is null or new.assignee_id = v_actor_id then return new; end if;

  if tg_op = 'INSERT' then
    v_event := 'task.assigned';
  elsif old.assignee_id is distinct from new.assignee_id then
    v_event := 'task.reassigned';
  elsif old.status is distinct from new.status then
    v_event := 'task.status_changed';
  elsif old.notes is distinct from new.notes and coalesce(new.notes, '') <> '' then
    v_event := 'task.note_added';
  else
    return new;
  end if;

  select email into v_recipient_email from people where id = new.assignee_id;
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
  values (new.assignee_id, v_recipient_email, 'action', v_event, 'tasks', v_title, v_body, '/tasks', v_actor_name);

  return new;
exception when others then
  raise warning 'tasks_notify failed for task %: %', new.id, sqlerrm;
  return new;
end $$;

drop trigger if exists tasks_notify_trg on tasks;
create trigger tasks_notify_trg
  after insert or update on tasks
  for each row execute function tasks_notify();
