-- =====================================================================
-- 0118 — chat notifications deep-link to the actual conversation
--
-- 0116's trigger hardcoded deep_link to '/chat' — same generic landing spot
-- every other section falls back to. A chat notification can do better: it
-- already knows the thread. Tapping it now opens straight into that
-- conversation (chat.tsx reads ?thread=<id> and opens it on mount).
-- =====================================================================

create or replace function chat_messages_notify()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_sender_name text;
  v_body text;
  v_preview text;
begin
  select full_name into v_sender_name from people where id = new.author_id;
  v_sender_name := coalesce(v_sender_name, 'Someone');

  v_body := case when coalesce(new.body, '') <> '' then new.body else coalesce(new.attachment_name, '') end;
  v_preview := case when length(v_body) > 120 then left(v_body, 117) || '…' else v_body end;

  insert into mobile_notifications (recipient_id, recipient_email, type, event_type, section, title, body, deep_link, actor_name)
  select cm.person_id, p.email, 'mention', 'message.received', 'messenger',
         'Message from ' || v_sender_name, v_preview, '/chat?thread=' || new.thread_id::text, v_sender_name
    from chat_members cm
    join people p on p.id = cm.person_id
   where cm.thread_id = new.thread_id
     and cm.person_id <> new.author_id
     and cm.left_at is null
     and cm.muted is not true;

  return new;
exception when others then
  raise warning 'chat_messages_notify failed for message %: %', new.id, sqlerrm;
  return new;
end $$;
