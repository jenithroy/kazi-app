-- =====================================================================
-- 0119 — quick-reply action on chat push notifications
--
-- Tags the Expo push payload with categoryId 'chat-reply' whenever the
-- notification is a chat message with a thread to reply to (deep_link is
-- '/chat?thread=<id>', set by 0118). The client registers that category
-- with a text-input action (src/data/push/channel.ts) — this is what makes
-- the OS attach a "Reply" button with an inline text field to the
-- notification. A non-chat notification (no matching deep_link) gets no
-- categoryId, same as before.
-- =====================================================================

create or replace function mobile_notifications_push()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_tokens jsonb;
  v_category text;
begin
  select coalesce(jsonb_agg(pt.token), '[]'::jsonb)
    into v_tokens
    from push_tokens pt
   where pt.person_id = coalesce(
           new.recipient_id,
           (select id from people where email = new.recipient_email limit 1)
         );

  v_category := case when new.deep_link like '/chat?thread=%' then 'chat-reply' else null end;

  if jsonb_array_length(v_tokens) > 0 then
    perform net.http_post(
      url     := 'https://exp.host/--/api/v2/push/send',
      headers := jsonb_build_object(
        'Content-Type',    'application/json',
        'Accept',          'application/json',
        'Accept-Encoding', 'gzip, deflate'
      ),
      -- Merged rather than passed as a plain key so a null v_category omits
      -- categoryId entirely instead of sending it as a literal JSON null —
      -- Expo's push API is documented as treating the field as optional, not
      -- nullable, and this must not risk every other notification type's
      -- delivery over an untested edge case.
      body := jsonb_build_object(
        'to', v_tokens,
        'title', new.title,
        'body', new.body,
        'data', jsonb_build_object('deepLink', new.deep_link, 'id', new.id::text),
        'sound', 'default',
        'channelId', 'default'
      ) || case when v_category is not null then jsonb_build_object('categoryId', v_category) else '{}'::jsonb end
    );
  end if;

  return new;
exception when others then
  raise warning 'mobile_notifications_push failed for notification %: %', new.id, sqlerrm;
  return new;
end $$;
