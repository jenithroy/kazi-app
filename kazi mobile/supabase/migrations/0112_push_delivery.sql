-- =====================================================================
-- 0112 — OS push delivery for mobile_notifications
--
-- Every insert into mobile_notifications (every notify() call — nothing
-- about that call graph changes) now also fires an async, fire-and-forget
-- HTTP POST to Expo's push API for whatever tokens the recipient has
-- registered. Zero tokens (not on this build yet, denied permission, or an
-- iOS device with no APNs credentials configured) => silent no-op; the
-- in-app notification is written either way and is never affected.
--
-- pg_net, not an Edge Function: this project has no Edge Functions deploy
-- pipeline at all (see scripts/migrate.cjs's own header) — pg_net gets the
-- same "call out to HTTP from a trigger" job done through the one deploy
-- mechanism this repo actually has, a plain SQL migration.
-- =====================================================================

create extension if not exists pg_net;

create or replace function mobile_notifications_push()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_tokens jsonb;
begin
  -- SECURITY DEFINER is load-bearing, not decorative: the row's recipient is
  -- essentially never the person whose write triggered notify(), and
  -- push_tokens' RLS only lets a person read their own tokens — without
  -- DEFINER this select would almost always see zero rows.
  select coalesce(jsonb_agg(pt.token), '[]'::jsonb)
    into v_tokens
    from push_tokens pt
   where pt.person_id = coalesce(
           new.recipient_id,
           (select id from people where email = new.recipient_email limit 1)
         );

  if jsonb_array_length(v_tokens) > 0 then
    perform net.http_post(
      url     := 'https://exp.host/--/api/v2/push/send',
      headers := jsonb_build_object(
        'Content-Type',    'application/json',
        'Accept',          'application/json',
        'Accept-Encoding', 'gzip, deflate'
      ),
      -- One POST per recipient row; all of that person's devices go in one
      -- `to` array (Expo accepts a single token or an array), same
      -- title/body/data fanned out to every device at once.
      body := jsonb_build_object(
        'to', v_tokens,
        'title', new.title,
        'body', new.body,
        'data', jsonb_build_object('deepLink', new.deep_link, 'id', new.id::text),
        'sound', 'default',
        'channelId', 'default'
      )
    );
    -- net.http_post only enqueues the request; a background worker performs
    -- it later. Nothing here reads the returned (bigint) request id or its
    -- eventual response row — this trigger cannot and must not block on it.
  end if;

  return new;
exception when others then
  -- A push-delivery failure must never take the underlying insert down with
  -- it — that would regress the in-app feed, the one thing this migration
  -- must not touch. Same fire-and-forget contract notify() already has on
  -- the client (dispatch(...).catch(warn)).
  raise warning 'mobile_notifications_push failed for notification %: %', new.id, sqlerrm;
  return new;
end $$;

drop trigger if exists mobile_notifications_push_trg on mobile_notifications;
create trigger mobile_notifications_push_trg
  after insert on mobile_notifications
  for each row execute function mobile_notifications_push();
