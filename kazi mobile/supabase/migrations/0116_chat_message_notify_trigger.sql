-- =====================================================================
-- 0116 — server-side chat message notifications
--
-- notify()'s 'message.received' call only ever ran from kazi-mobile's own
-- client. The ERP web app (kazimfg.com.np) has its own, independently
-- written chat client (src/lib/chat.js in that repo) — it inserts into the
-- same chat_messages table but has never called anything that writes to
-- mobile_notifications. A message sent from there never produced a
-- notification row, so the recipient's phone never knew, no matter what
-- else got fixed on the mobile side (see 0115).
--
-- Moving the "you're in this conversation" notification to a trigger on
-- chat_messages fixes that for both clients at once, and is the only fix
-- that doesn't require touching the separate kazi-app repo. To avoid a
-- double notification when the sender IS kazi-mobile (whose client also
-- used to call notify() for this), the client-side call for
-- 'message.received' is removed in the same change (see hooks.ts) — this
-- trigger is now the only source for it.
--
-- @mention's richer "X mentioned you" copy stays client-side-only for now
-- (kazi-mobile only, unchanged) — a plain "new message" notification still
-- reaches a mentioned person via this trigger either way, just without the
-- special title.
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
         'Message from ' || v_sender_name, v_preview, '/chat', v_sender_name
    from chat_members cm
    join people p on p.id = cm.person_id
   where cm.thread_id = new.thread_id
     and cm.person_id <> new.author_id
     and cm.left_at is null
     and cm.muted is not true;

  return new;
exception when others then
  -- Same fire-and-forget contract as 0112's push trigger: a notification
  -- failure must never take the message send down with it.
  raise warning 'chat_messages_notify failed for message %: %', new.id, sqlerrm;
  return new;
end $$;

drop trigger if exists chat_messages_notify_trg on chat_messages;
create trigger chat_messages_notify_trg
  after insert on chat_messages
  for each row execute function chat_messages_notify();
