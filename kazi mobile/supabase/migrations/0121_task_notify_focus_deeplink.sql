-- =====================================================================
-- 0121 — task notifications deep-link to the specific task
--
-- 0117 hardcoded deep_link to '/tasks' — same generic landing spot every
-- other section falls back to. tasks.tsx now reads ?focus=<id> and opens
-- that task's sheet on mount (same one-shot pattern billing.tsx's `focus`
-- already used), so the trigger can point at it directly.
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
  values (new.assignee_id, v_recipient_email, 'action', v_event, 'tasks', v_title, v_body, '/tasks?focus=' || new.id::text, v_actor_name);

  return new;
exception when others then
  raise warning 'tasks_notify failed for task %: %', new.id, sqlerrm;
  return new;
end $$;
