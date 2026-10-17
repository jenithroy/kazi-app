-- =====================================================================
-- 0120 — server-side @mention detection, bypassing mute
--
-- Two gaps the client-only version (hooks.ts's parseMentions + a separate
-- notify() call) left: a message from the ERP web app never ran mention
-- detection at all (same class of gap 0116 closed for the plain "new
-- message" notification), and even from kazi-mobile, a muted THREAD's
-- generic notification is correctly suppressed for a muted member — but an
-- @mention is supposed to cut through the mute, and nothing server-side was
-- computing it to do so.
--
-- This adds mention detection to the same chat_messages trigger, matching
-- hooks.ts's parseMentions exactly: `@` + a member's exact full name + a
-- word boundary, case-insensitive. Group threads only — a DM has nobody
-- else to @, same restriction the client applies. Deliberately NOT gated by
-- cm.muted, and deliberately additive to the plain notification a
-- non-muted mentioned member already gets from chat_messages_notify() —
-- same double-notification shape the client-side version always had.
-- =====================================================================

create or replace function chat_mentions_notify()
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
  select cm.person_id, p.email, 'mention', 'message.mention', 'messenger',
         v_sender_name || ' mentioned you', v_preview, '/chat?thread=' || new.thread_id::text, v_sender_name
    from chat_members cm
    join people p on p.id = cm.person_id
    join chat_threads t on t.id = new.thread_id
   where cm.thread_id = new.thread_id
     and cm.person_id <> new.author_id
     and cm.left_at is null
     and t.kind = 'group'
     and coalesce(new.body, '') ~* ('@' || regexp_replace(p.full_name, '([.^$*+?()\[\]{}|\\])', '\\\1', 'g') || '\y');

  return new;
exception when others then
  raise warning 'chat_mentions_notify failed for message %: %', new.id, sqlerrm;
  return new;
end $$;

drop trigger if exists chat_mentions_notify_trg on chat_messages;
create trigger chat_mentions_notify_trg
  after insert on chat_messages
  for each row execute function chat_mentions_notify();
