-- ============================================================================
-- 0064_reddit_leads.sql
--
-- Reddit Leads (Marketing menu, /marketing/reddit-leads): Reddit posts from people looking for
-- a manufacturer, and the public business emails the team finds for them.
--
-- Three tables:
--   reddit_leads          one row per Reddit post that scored as a lead. The Worker adds them (service
--                         role only: nobody signed in can insert or delete one, or change what the scrape
--                         knew: score, link, title). What the team writes (status, brand, website, notes,
--                         the customer made from it) is the only thing a signed-in person can change.
--   lead_emails           the email list: one row per address, with where it was found and a "do not
--                         email" flag. Added and changed from the page; removed too, unless flagged.
--   reddit_lead_settings  ONE row ('main'): the subreddits and phrases the check looks for, which the team
--                         edits on the page, and how the last check went, which only the Worker writes.
--
-- Who may use it: whoever has the Marketing section (view to read, edit to change). There is no
-- permission of its own.
--
-- A lead is never deleted: the check would add the same post again. "Not a fit" is how one is put away.
--
-- Safe to run twice.
-- ============================================================================

-- ─── what a list of phrases may look like ──────────────────────────────────

create or replace function public.reddit_text_list_ok(items text[], max_items integer, max_len integer, pattern text default null)
 returns boolean
 language sql
 immutable parallel safe
 set search_path to 'pg_catalog'
as $function$
  select items is not null
     and coalesce(cardinality(items), 0) <= max_items
     and not exists (
       select 1 from unnest(items) as t(x)
        where x is null
           or char_length(btrim(x)) not between 1 and max_len
           or (pattern is not null and x !~ pattern)
     );
$function$;

-- ─── reddit_leads ──────────────────────────────────────────────────────────

create table if not exists public.reddit_leads (
  id          uuid primary key default gen_random_uuid(),
  reddit_id   text not null,
  subreddit   text not null,
  title       text not null,
  excerpt     text,
  url         text not null,
  posted_at   timestamptz not null,
  score       integer not null default 0,
  hits        text[] not null default '{}',
  status      text not null default 'new',
  brand       text,
  website     text,
  notes       text,
  customer_id uuid references public.customers(id) on delete set null,
  found_at    timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

-- Separate statements so they also tighten a table an earlier run created.
alter table public.reddit_leads drop constraint if exists reddit_leads_reddit_id_key;
alter table public.reddit_leads add constraint reddit_leads_reddit_id_key unique (reddit_id);

alter table public.reddit_leads drop constraint if exists reddit_leads_reddit_id_fmt;
alter table public.reddit_leads add constraint reddit_leads_reddit_id_fmt check (reddit_id ~ '^[a-z0-9]{3,12}$');

alter table public.reddit_leads drop constraint if exists reddit_leads_subreddit_fmt;
alter table public.reddit_leads add constraint reddit_leads_subreddit_fmt check (subreddit ~ '^[A-Za-z0-9_]{2,21}$');

alter table public.reddit_leads drop constraint if exists reddit_leads_url_fmt;
alter table public.reddit_leads add constraint reddit_leads_url_fmt check (url ~ '^https://www\.reddit\.com/r/[A-Za-z0-9_]{2,21}/comments/[a-z0-9]{3,12}/$');

alter table public.reddit_leads drop constraint if exists reddit_leads_status_ok;
alter table public.reddit_leads add constraint reddit_leads_status_ok check (status in ('new', 'contacted', 'replied', 'not_fit', 'customer'));

alter table public.reddit_leads drop constraint if exists reddit_leads_lengths;
alter table public.reddit_leads add constraint reddit_leads_lengths check (
  char_length(title) between 1 and 300
  and (excerpt is null or char_length(excerpt) <= 600)
  and (brand is null or char_length(brand) <= 120)
  and (notes is null or char_length(notes) <= 2000)
  and score between 0 and 1000
  and cardinality(hits) <= 12
);

-- a website is an address a browser can open, nothing else (no javascript: or data: links)
alter table public.reddit_leads drop constraint if exists reddit_leads_website_fmt;
alter table public.reddit_leads add constraint reddit_leads_website_fmt check (website is null or (char_length(website) <= 300 and website ~* '^https?://[^[:space:]]+$'));

create index if not exists reddit_leads_posted_idx on public.reddit_leads (posted_at desc);
create index if not exists reddit_leads_status_idx on public.reddit_leads (status);

create or replace function public.reddit_leads_touch()
 returns trigger
 language plpgsql
 set search_path to 'pg_catalog'
as $function$
begin
  new.updated_at := now();
  return new;
end;
$function$;

drop trigger if exists reddit_leads_touch on public.reddit_leads;
create trigger reddit_leads_touch before update on public.reddit_leads
  for each row execute function public.reddit_leads_touch();

-- ─── lead_emails ───────────────────────────────────────────────────────────

create table if not exists public.lead_emails (
  id           uuid primary key default gen_random_uuid(),
  email        text not null,
  brand        text,
  website      text,
  source_url   text,
  kind         text not null default 'named',
  same_domain  boolean not null default false,
  socials      jsonb not null default '{}'::jsonb,
  lead_id      uuid references public.reddit_leads(id) on delete set null,
  do_not_email boolean not null default false,
  note         text,
  found_by     uuid references public.people(id) on delete set null default public.app_person_id(),
  found_at     timestamptz not null default now()
);

alter table public.lead_emails drop constraint if exists lead_emails_email_key;
alter table public.lead_emails add constraint lead_emails_email_key unique (email);

-- stored in lower case and shaped like an address, so one address is one row
alter table public.lead_emails drop constraint if exists lead_emails_email_fmt;
alter table public.lead_emails add constraint lead_emails_email_fmt check (
  email = lower(email) and char_length(email) <= 254 and email ~ '^[^[:space:]@<>"'']{1,64}@[^[:space:]@<>"'']{1,189}\.[a-z]{2,}$'
);

alter table public.lead_emails drop constraint if exists lead_emails_kind_ok;
alter table public.lead_emails add constraint lead_emails_kind_ok check (kind in ('role', 'named', 'free'));

alter table public.lead_emails drop constraint if exists lead_emails_lengths;
alter table public.lead_emails add constraint lead_emails_lengths check (
  (brand is null or char_length(brand) <= 120)
  and (note is null or char_length(note) <= 1000)
  and (source_url is null or char_length(source_url) <= 400)
  and (website is null or char_length(website) <= 300)
  and jsonb_typeof(socials) = 'object'
  and pg_column_size(socials) <= 2000
);

alter table public.lead_emails drop constraint if exists lead_emails_website_fmt;
alter table public.lead_emails add constraint lead_emails_website_fmt check (website is null or website ~* '^https?://[^[:space:]]+$');

alter table public.lead_emails drop constraint if exists lead_emails_source_fmt;
alter table public.lead_emails add constraint lead_emails_source_fmt check (source_url is null or source_url ~* '^https?://[^[:space:]]+$');

create index if not exists lead_emails_found_idx on public.lead_emails (found_at desc);
create index if not exists lead_emails_lead_idx on public.lead_emails (lead_id);

-- ─── reddit_lead_settings ──────────────────────────────────────────────────

create table if not exists public.reddit_lead_settings (
  id              text primary key default 'main',
  subreddits      text[] not null default '{}',
  strong          text[] not null default '{}',
  weak            text[] not null default '{}',
  block           text[] not null default '{}',
  min_score       integer not null default 30,
  watermarks      jsonb not null default '{}'::jsonb,
  last_checked_at timestamptz,
  last_ok_at      timestamptz,
  last_status     text,
  last_error      text,
  last_fetched    integer,
  last_saved      integer,
  updated_at      timestamptz not null default now()
);

alter table public.reddit_lead_settings drop constraint if exists reddit_lead_settings_one_row;
alter table public.reddit_lead_settings add constraint reddit_lead_settings_one_row check (id = 'main');

alter table public.reddit_lead_settings drop constraint if exists reddit_lead_settings_lists;
alter table public.reddit_lead_settings add constraint reddit_lead_settings_lists check (
  public.reddit_text_list_ok(subreddits, 30, 21, '^[A-Za-z0-9_]{2,21}$')
  and public.reddit_text_list_ok(strong, 80, 80)
  and public.reddit_text_list_ok(weak, 80, 80)
  and public.reddit_text_list_ok(block, 80, 80)
  and min_score between 1 and 200
);

alter table public.reddit_lead_settings drop constraint if exists reddit_lead_settings_status_ok;
alter table public.reddit_lead_settings add constraint reddit_lead_settings_status_ok check (last_status is null or last_status in ('ok', 'partial', 'failed'));

create or replace function public.reddit_lead_settings_touch()
 returns trigger
 language plpgsql
 set search_path to 'pg_catalog'
as $function$
begin
  new.updated_at := now();
  return new;
end;
$function$;

drop trigger if exists reddit_lead_settings_touch on public.reddit_lead_settings;
create trigger reddit_lead_settings_touch before update on public.reddit_lead_settings
  for each row execute function public.reddit_lead_settings_touch();

-- the first row: what the check looks for until the team changes it (the same lists as worker/lib/redditScore.js DEFAULT_SETTINGS)
insert into public.reddit_lead_settings (id, subreddits, strong, weak, block, min_score)
values (
  'main',
  array[
    'ClothingStartups', 'streetwearstartup', 'clothingbrandstartup', 'ClothingBrand', 'manufacturing', 'smallbusiness',
    'ecommerce'
  ],
  array[
    'looking for a * manufacturer', 'looking for * manufacturers', 'looking for a * factory', 'need a * manufacturer',
    'need * manufacturer', 'need a * factory', 'find a * manufacturer', 'finding a * manufacturer',
    'find * manufacturers', 'manufacturer needed', 'recommend a * manufacturer', 'manufacturer recommendation',
    'manufacturer recommendations', 'who makes', 'who can make', 'cut and sew', 'cut & sew', 'private label',
    'white label', 'tech pack', 'techpack', 'low moq', 'apparel manufacturer', 'garment manufacturer',
    'clothing manufacturer', 'small batch', 'sample run', 'production run'
  ],
  array[
    'moq', 'minimum order', 'sourcing', 'supplier', 'manufacturer', 'manufacturing', 'startup', 'clothing line',
    'clothing brand', 'first collection', 'start a clothing', 'starting a clothing', 'launch my brand', 'apparel',
    'garment'
  ],
  array[
    'for hire', 'we are a * manufacturer', 'we are a * manufacturing', 'we are a * factory', 'we are a * supplier',
    'we are a * company', 'we manufacture', 'we offer', 'we help brands', 'our factory', 'our services', 'dm us',
    'dm for quote', 'get a quote', 'we are hiring', 'i''m hiring', 'hiring', 'job', 'jobs', 'salary', 'career',
    'resume', 'internship', 'interview', 'layoff', 'union'
  ],
  30
)
on conflict (id) do nothing;

-- ─── row-level security ────────────────────────────────────────────────────

alter table public.reddit_leads enable row level security;
alter table public.lead_emails enable row level security;
alter table public.reddit_lead_settings enable row level security;

-- reddit_leads: read with Marketing view, change with Marketing edit. No insert and no delete for anybody signed in.
drop policy if exists "read" on public.reddit_leads;
create policy "read" on public.reddit_leads
  as permissive for select to authenticated
  using (app_can_view('marketing'));

drop policy if exists "change" on public.reddit_leads;
create policy "change" on public.reddit_leads
  as permissive for update to authenticated
  using (app_can_edit('marketing'))
  with check (app_can_edit('marketing'));

drop policy if exists "require_known_issuer" on public.reddit_leads;
create policy "require_known_issuer" on public.reddit_leads
  as restrictive for all to authenticated
  using (app_issuer_ok());

-- lead_emails: the team's own list, so they can add, change and remove
drop policy if exists "read" on public.lead_emails;
create policy "read" on public.lead_emails
  as permissive for select to authenticated
  using (app_can_view('marketing'));

drop policy if exists "add" on public.lead_emails;
create policy "add" on public.lead_emails
  as permissive for insert to authenticated
  with check (app_can_edit('marketing'));

drop policy if exists "change" on public.lead_emails;
create policy "change" on public.lead_emails
  as permissive for update to authenticated
  using (app_can_edit('marketing'))
  with check (app_can_edit('marketing'));

-- An address marked do-not-email cannot be removed: the row IS the memory that somebody must not be written to (delete it and the next
-- search of their site would offer it again, ready to tick). To remove one, mark it "may email" first, which is a decision somebody makes.
drop policy if exists "remove" on public.lead_emails;
create policy "remove" on public.lead_emails
  as permissive for delete to authenticated
  using (app_can_edit('marketing') and not do_not_email);

drop policy if exists "require_known_issuer" on public.lead_emails;
create policy "require_known_issuer" on public.lead_emails
  as restrictive for all to authenticated
  using (app_issuer_ok());

-- reddit_lead_settings: read, and change the lists (never the last-check columns: only the Worker writes those)
drop policy if exists "read" on public.reddit_lead_settings;
create policy "read" on public.reddit_lead_settings
  as permissive for select to authenticated
  using (app_can_view('marketing'));

drop policy if exists "change" on public.reddit_lead_settings;
create policy "change" on public.reddit_lead_settings
  as permissive for update to authenticated
  using (app_can_edit('marketing'))
  with check (app_can_edit('marketing'));

drop policy if exists "require_known_issuer" on public.reddit_lead_settings;
create policy "require_known_issuer" on public.reddit_lead_settings
  as restrictive for all to authenticated
  using (app_issuer_ok());

-- ─── what each role may touch ──────────────────────────────────────────────
-- Supabase hands every new table to anon and authenticated with every privilege. Take it all back,
-- then give back only what the page uses, column by column where it matters.

revoke all on public.reddit_leads from anon, authenticated;
grant select on public.reddit_leads to authenticated;
grant update (status, brand, website, notes, customer_id) on public.reddit_leads to authenticated;
grant select, insert, update, delete on public.reddit_leads to service_role;

revoke all on public.lead_emails from anon, authenticated;
grant select, delete on public.lead_emails to authenticated;
grant insert (email, brand, website, source_url, kind, same_domain, socials, lead_id, note) on public.lead_emails to authenticated;
grant update (brand, website, note, do_not_email) on public.lead_emails to authenticated;
grant select, insert, update, delete on public.lead_emails to service_role;

revoke all on public.reddit_lead_settings from anon, authenticated;
grant select on public.reddit_lead_settings to authenticated;
grant update (subreddits, strong, weak, block, min_score) on public.reddit_lead_settings to authenticated;
grant select, insert, update, delete on public.reddit_lead_settings to service_role;

-- ─── the camelCase views the app reads (same pattern as fs_meta_leads) ─────

create or replace view public.fs_reddit_leads as
select
  id,
  reddit_id   as "redditId",
  subreddit,
  title,
  excerpt,
  url,
  posted_at   as "postedAt",
  score,
  hits,
  status,
  brand,
  website,
  notes,
  customer_id as "customerId",
  found_at    as "foundAt",
  updated_at  as "updatedAt"
from public.reddit_leads;

create or replace view public.fs_lead_emails as
select
  id,
  email,
  brand,
  website,
  source_url   as "sourceUrl",
  kind,
  same_domain  as "sameDomain",
  socials,
  lead_id      as "leadId",
  do_not_email as "doNotEmail",
  note,
  found_by     as "foundBy",
  found_at     as "foundAt"
from public.lead_emails;

create or replace view public.fs_reddit_lead_settings as
select
  id,
  subreddits,
  strong,
  weak,
  block,
  min_score       as "minScore",
  last_checked_at as "lastCheckedAt",
  last_ok_at      as "lastOkAt",
  last_status     as "lastStatus",
  last_error      as "lastError",
  last_fetched    as "lastFetched",
  last_saved      as "lastSaved",
  updated_at      as "updatedAt"
from public.reddit_lead_settings;

alter view public.fs_reddit_leads set (security_invoker = on);
alter view public.fs_lead_emails set (security_invoker = on);
alter view public.fs_reddit_lead_settings set (security_invoker = on);

revoke all on public.fs_reddit_leads, public.fs_lead_emails, public.fs_reddit_lead_settings from anon, authenticated;
grant select on public.fs_reddit_leads, public.fs_lead_emails, public.fs_reddit_lead_settings to authenticated, service_role;
