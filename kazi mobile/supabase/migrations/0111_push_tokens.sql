-- =====================================================================
-- 0111 — push_tokens
--
-- One row per (device, install) Expo push token. A physical device's token
-- is stable across sign-outs, so the same token can belong to a different
-- person after a relogin/reinstall — `token` is globally unique and
-- `register_push_token()` reassigns `person_id` on conflict rather than
-- creating a second row or leaving the old owner's row behind.
--
-- Written only through `register_push_token()` (SECURITY DEFINER), never by
-- a direct client insert/update: `insert ... on conflict (token) do update`
-- under a plain "person_id = app_person_id()" RLS policy would fail to
-- reassign a token still owned by the *previous* person on this device,
-- because Postgres's ON CONFLICT DO UPDATE can't act on a row the caller's
-- UPDATE policy doesn't make visible (it belongs to someone else) — it
-- raises a duplicate-key error instead of updating it. Routing the write
-- through a SECURITY DEFINER function (same shape as chat_start_dm() in
-- 0106_chat_rpcs.sql) sidesteps that entirely.
-- =====================================================================

create table if not exists push_tokens (
  id          uuid primary key default gen_random_uuid(),
  person_id   uuid not null references people(id) on delete cascade,
  token       text not null,
  platform    text not null default 'android' check (platform in ('android', 'ios')),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  unique (token)
);
create index if not exists push_tokens_person_idx on push_tokens (person_id);

alter table push_tokens enable row level security;

-- Nothing reads this yet (no "manage your devices" screen), but scoping
-- SELECT to your own rows costs nothing and matches every other table here.
drop policy if exists push_tokens_own_read on push_tokens;
create policy push_tokens_own_read on push_tokens for select to authenticated
  using (person_id = app_person_id());

-- Deliberately no insert/update/delete policy or grant for `authenticated`
-- — see the file header. All writes go through register_push_token(),
-- which runs as its owner and bypasses RLS entirely for its own writes.

drop policy if exists require_known_issuer on push_tokens;
create policy require_known_issuer on push_tokens
  as restrictive to authenticated using (app_issuer_ok());

grant select on push_tokens to authenticated;

-- Upsert-by-token. Re-derives identity from the caller's own session —
-- never trusts a client-supplied person id.
create or replace function register_push_token(p_token text, p_platform text default 'android')
returns void language plpgsql security definer set search_path = public as $$
declare
  v_me uuid := app_person_id();
begin
  if v_me is null then raise exception 'not signed in'; end if;
  if coalesce(trim(p_token), '') = '' then raise exception 'missing push token'; end if;

  insert into push_tokens (person_id, token, platform, updated_at)
    values (v_me, trim(p_token), coalesce(p_platform, 'android'), now())
  on conflict (token) do update
    set person_id  = excluded.person_id,
        platform   = excluded.platform,
        updated_at = now();
end $$;

revoke all on function register_push_token(text, text) from public;
grant execute on function register_push_token(text, text) to authenticated;
