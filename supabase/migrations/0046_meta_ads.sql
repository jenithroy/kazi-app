-- ============================================================================
-- 0046_meta_ads.sql
--
-- Meta (Facebook/Instagram) Ads: a read-only mirror of campaign/ad-set/ad
-- structure and daily performance, synced from the Graph API by the Worker
-- (worker/lib/metaSync.js), plus the two live controls asked for: pause/
-- resume and budget edits.
--
-- Auth: ONE Business Manager System User token, held only as the Worker
-- secret META_ACCESS_TOKEN. There is no per-user OAuth connection and this
-- schema stores no credential at all — deliberate, since a single Wrangler
-- secret is already encrypted at rest and there is only one token to hold.
--
-- Rates are never stored. impressions/clicks/spend/reach/conversions are
-- base counts; CTR/CPC/CPM/CPA/ROAS/frequency are derived at read time from
-- summed counts, everywhere, no exceptions — averaging a stored daily rate
-- would weight a 3-click day the same as a 3,000-click day.
--
-- meta_ad_insights is synced at THREE granularities independently (campaign,
-- adset, ad — three separate Graph API insights calls, since Meta's own
-- reporting works that way). This means the SAME underlying spend is present
-- at all three levels. Any read that sums across entity_level values will
-- triple-count. meta_campaign_insights below exists specifically so an
-- ordinary caller cannot make that mistake by accident.
--
-- daily_budget / lifetime_budget are MINOR units (cents), per Meta's own
-- campaign/adset object shape — stored as *_minor bigint. insights.spend is
-- a decimal string in MAJOR currency units, per Meta's own insights shape —
-- stored as numeric(14,2). Mixing these two up is a classic bug; the column
-- names say "minor" specifically so a future reader is not left guessing.
-- ============================================================================


-- --- 1. Which ad accounts we track -------------------------------------------
-- A small admin-editable list of act_... ids. A row with is_active = true is
-- what worker/lib/metaSync.js syncs; toggling it off stops future syncs
-- without losing history.

create table if not exists meta_ad_accounts (
  id             text primary key,              -- Meta's own "act_..." id
  name           text,
  currency       text,
  timezone_name  text,
  is_active      boolean not null default true,
  added_by       uuid references people(id) on delete set null,
  added_by_name  text,
  created_at     timestamptz not null default now(),
  last_synced_at timestamptz
);


-- --- 2. Campaign / ad set / ad hierarchy --------------------------------------
-- Ids are Meta's own (large integers as text), used verbatim so a re-sync's
-- upsert is a natural match on primary key.

create table if not exists meta_campaigns (
  id                    text primary key,
  ad_account_id         text not null references meta_ad_accounts(id) on delete cascade,
  name                  text not null,
  status                text not null,          -- Meta's own vocabulary: ACTIVE/PAUSED/ARCHIVED/DELETED
  effective_status      text,                    -- accounts for parent-level pauses/delivery issues
  objective             text,
  daily_budget_minor    bigint,
  lifetime_budget_minor bigint,
  created_time          timestamptz,
  meta_updated_time     timestamptz,
  last_synced_at        timestamptz not null default now()
);
create index if not exists meta_campaigns_account_idx on meta_campaigns (ad_account_id);

create table if not exists meta_adsets (
  id                    text primary key,
  campaign_id           text not null references meta_campaigns(id) on delete cascade,
  ad_account_id         text not null references meta_ad_accounts(id) on delete cascade,
  name                  text not null,
  status                text not null,
  effective_status      text,
  daily_budget_minor    bigint,
  lifetime_budget_minor bigint,
  created_time          timestamptz,
  meta_updated_time     timestamptz,
  last_synced_at        timestamptz not null default now()
);
create index if not exists meta_adsets_campaign_idx on meta_adsets (campaign_id);
create index if not exists meta_adsets_account_idx  on meta_adsets (ad_account_id);

create table if not exists meta_ads (
  id                     text primary key,
  adset_id               text not null references meta_adsets(id) on delete cascade,
  campaign_id            text not null references meta_campaigns(id) on delete cascade,
  ad_account_id          text not null references meta_ad_accounts(id) on delete cascade,
  name                   text not null,
  status                 text not null,
  effective_status       text,
  creative_thumbnail_url text,
  created_time           timestamptz,
  meta_updated_time      timestamptz,
  last_synced_at         timestamptz not null default now()
);
create index if not exists meta_ads_adset_idx    on meta_ads (adset_id);
create index if not exists meta_ads_campaign_idx on meta_ads (campaign_id);
create index if not exists meta_ads_account_idx  on meta_ads (ad_account_id);


-- --- 3. Daily base counts (never rates) ---------------------------------------

create table if not exists meta_ad_insights (
  entity_level  text not null check (entity_level in ('campaign', 'adset', 'ad')),
  entity_id     text not null,
  ad_account_id text not null references meta_ad_accounts(id) on delete cascade,
  date          date not null,
  impressions   bigint  not null default 0,
  clicks        bigint  not null default 0,
  spend         numeric(14,2) not null default 0,   -- major units (e.g. dollars, not cents)
  reach         bigint  not null default 0,
  conversions   jsonb   not null default '[]'::jsonb, -- Meta's raw `actions` array: [{action_type, value}, ...]
  currency      text    not null,                     -- ad account's currency, snapshotted per row
  synced_at     timestamptz not null default now(),
  primary key (entity_level, entity_id, date)
);
create index if not exists meta_ad_insights_account_date_idx on meta_ad_insights (ad_account_id, date);
create index if not exists meta_ad_insights_level_date_idx   on meta_ad_insights (entity_level, date);

-- Pre-filtered to campaign-level rows, so "spend by campaign" / the Overview
-- trend can never accidentally sum across entity_level and triple-count.
create or replace view meta_campaign_insights as
select entity_id as "campaignId", ad_account_id as "adAccountId", date,
       impressions, clicks, spend, reach, conversions, currency
  from meta_ad_insights
 where entity_level = 'campaign';
alter view meta_campaign_insights set (security_invoker = on);

-- Server-aggregated "top ads" for the Overview screen, so the client never
-- has to pull every ad-level daily insight row just to rank a handful of
-- them — ad-level rows are this schema's fastest-growing table (one row per
-- ad per day). security invoker: RLS on meta_ads/meta_ad_insights decides
-- what the caller sees, same rule as meta_campaign_attribution().
create or replace function meta_top_ads(date_from date default null, date_to date default null, entity_limit integer default 10)
returns table (
  "adId"         text,
  "adName"       text,
  "campaignName" text,
  currency       text,
  spend          numeric,
  clicks         bigint,
  impressions    bigint
)
language sql stable as $$
  select a.id, a.name, c.name, max(i.currency),
         sum(i.spend), sum(i.clicks), sum(i.impressions)
    from meta_ad_insights i
    join meta_ads a      on a.id = i.entity_id
    join meta_campaigns c on c.id = a.campaign_id
   where i.entity_level = 'ad'
     and (date_from is null or i.date >= date_from)
     and (date_to   is null or i.date <= date_to)
   group by a.id, a.name, c.name
   order by sum(i.spend) desc
   limit greatest(entity_limit, 1);
$$;

grant execute on function meta_top_ads(date, date, integer) to authenticated;


-- --- 4. Sync history -----------------------------------------------------------
-- Both the cron-triggered sync and the manual "Sync now" button write one of
-- these: inserted 'running' when it starts, updated to a final status when it
-- finishes (or crashes). Written by the Worker via the service key, so there
-- is deliberately no authenticated insert/update policy — a cron run has no
-- signed-in person to satisfy an actor-stamping trigger the way
-- meta_ads_actions' does below.

create table if not exists meta_sync_runs (
  id                      uuid primary key default gen_random_uuid(),
  trigger_type            text not null check (trigger_type in ('cron', 'manual')),
  triggered_by_person_id  uuid references people(id) on delete set null,
  triggered_by_name       text,
  started_at              timestamptz not null default now(),
  finished_at             timestamptz,
  status                  text not null default 'running' check (status in ('running', 'success', 'partial', 'failed')),
  ad_accounts_synced      text[] not null default '{}',
  campaigns_synced        integer not null default 0,
  adsets_synced           integer not null default 0,
  ads_synced              integer not null default 0,
  insight_rows_synced     integer not null default 0,
  error_message           text,
  detail                  jsonb not null default '{}'::jsonb
);
create index if not exists meta_sync_runs_started_idx on meta_sync_runs (started_at desc);


-- --- 5. Action audit trail -------------------------------------------------------
-- Every pause/resume/budget edit, with precise before/after values. Always a
-- real signed-in person: the database, not the client, asserts who did it —
-- same principle as activity_events' stamp_activity_actor() (0032).

create table if not exists meta_ads_actions (
  id                     uuid primary key default gen_random_uuid(),
  person_id              uuid references people(id) on delete set null,
  person_name            text,
  entity_level           text not null check (entity_level in ('campaign', 'adset', 'ad')),
  entity_id              text not null,
  entity_name            text,
  action                 text not null check (action in ('pause', 'resume', 'budget_edit')),
  field                  text check (field in ('daily_budget', 'lifetime_budget')),  -- null for pause/resume
  before                 jsonb,
  after                  jsonb,
  confirmed_over_ceiling boolean not null default false,
  created_at             timestamptz not null default now()
);
create index if not exists meta_ads_actions_created_idx on meta_ads_actions (created_at desc);
create index if not exists meta_ads_actions_entity_idx  on meta_ads_actions (entity_level, entity_id, created_at desc);

create or replace function stamp_meta_ads_action_actor() returns trigger
language plpgsql security definer set search_path = public as $fn$
declare
  pid uuid := app_person_id();
begin
  if pid is null then
    raise exception 'No active staff record for this token.'
      using errcode = 'insufficient_privilege';
  end if;
  new.person_id  := pid;
  new.created_at := now();
  select pe.full_name into new.person_name from people pe where pe.id = pid;
  return new;
end $fn$;

drop trigger if exists meta_ads_actions_stamp_actor on meta_ads_actions;
create trigger meta_ads_actions_stamp_actor
  before insert on meta_ads_actions
  for each row execute function stamp_meta_ads_action_actor();


-- --- 6. Settings (budget guard rails) ---------------------------------------------
-- Single row, id fixed at 'default' by convention rather than a hard
-- single-row constraint. Enforced server-side in the Worker (a client-side
-- confirm dialog alone is not a real guard on live ad spend).

create table if not exists meta_ads_settings (
  id                      text primary key default 'default',
  budget_ceiling_minor    bigint,
  budget_ceiling_currency text,
  confirm_multiplier      numeric not null default 3,
  updated_at              timestamptz not null default now(),
  updated_by              uuid references people(id) on delete set null
);
insert into meta_ads_settings (id) values ('default') on conflict (id) do nothing;


-- --- 7. camelCase read views ---------------------------------------------------
-- Matches the fs_<table> convention used everywhere else in this app (e.g.
-- fs_customers) — writes still go straight to the tables above, translated
-- by schemaMap.js's snake_case field mapping.

create or replace view fs_meta_ad_accounts as
  select id, name, currency, timezone_name as "timezoneName",
    is_active as "isActive", added_by as "addedBy", added_by_name as "addedByName",
    created_at as "createdAt", last_synced_at as "lastSyncedAt"
  from meta_ad_accounts;
alter view fs_meta_ad_accounts set (security_invoker = on);

create or replace view fs_meta_campaigns as
  select id, ad_account_id as "adAccountId", name, status,
    effective_status as "effectiveStatus", objective,
    daily_budget_minor as "dailyBudgetMinor", lifetime_budget_minor as "lifetimeBudgetMinor",
    created_time as "createdTime", meta_updated_time as "metaUpdatedTime",
    last_synced_at as "lastSyncedAt"
  from meta_campaigns;
alter view fs_meta_campaigns set (security_invoker = on);

create or replace view fs_meta_adsets as
  select id, campaign_id as "campaignId", ad_account_id as "adAccountId", name, status,
    effective_status as "effectiveStatus",
    daily_budget_minor as "dailyBudgetMinor", lifetime_budget_minor as "lifetimeBudgetMinor",
    created_time as "createdTime", meta_updated_time as "metaUpdatedTime",
    last_synced_at as "lastSyncedAt"
  from meta_adsets;
alter view fs_meta_adsets set (security_invoker = on);

create or replace view fs_meta_ads as
  select id, adset_id as "adsetId", campaign_id as "campaignId", ad_account_id as "adAccountId",
    name, status, effective_status as "effectiveStatus",
    creative_thumbnail_url as "creativeThumbnailUrl",
    created_time as "createdTime", meta_updated_time as "metaUpdatedTime",
    last_synced_at as "lastSyncedAt"
  from meta_ads;
alter view fs_meta_ads set (security_invoker = on);

create or replace view fs_meta_ad_insights as
  select entity_level as "entityLevel", entity_id as "entityId", ad_account_id as "adAccountId",
    date, impressions, clicks, spend, reach, conversions, currency,
    synced_at as "syncedAt"
  from meta_ad_insights;
alter view fs_meta_ad_insights set (security_invoker = on);

create or replace view fs_meta_sync_runs as
  select id, trigger_type as "triggerType",
    triggered_by_person_id as "triggeredByPersonId", triggered_by_name as "triggeredByName",
    started_at as "startedAt", finished_at as "finishedAt", status,
    ad_accounts_synced as "adAccountsSynced", campaigns_synced as "campaignsSynced",
    adsets_synced as "adsetsSynced", ads_synced as "adsSynced",
    insight_rows_synced as "insightRowsSynced", error_message as "errorMessage", detail
  from meta_sync_runs;
alter view fs_meta_sync_runs set (security_invoker = on);

create or replace view fs_meta_ads_actions as
  select id, person_id as "personId", person_name as "personName",
    entity_level as "entityLevel", entity_id as "entityId", entity_name as "entityName",
    action, field, before, after,
    confirmed_over_ceiling as "confirmedOverCeiling", created_at as "createdAt"
  from meta_ads_actions;
alter view fs_meta_ads_actions set (security_invoker = on);

create or replace view fs_meta_ads_settings as
  select id, budget_ceiling_minor as "budgetCeilingMinor",
    budget_ceiling_currency as "budgetCeilingCurrency", confirm_multiplier as "confirmMultiplier",
    updated_at as "updatedAt", updated_by as "updatedBy"
  from meta_ads_settings;
alter view fs_meta_ads_settings set (security_invoker = on);


-- --- 8. Row level security ----------------------------------------------------
-- One shape, repeated per table: select needs marketing view AND the
-- meta_ads tab's own view; any write needs marketing edit AND the tab's own
-- edit (the Leads/messenger shape — both flags real, not Finance's
-- view-only-that-matters shape, since pausing a live ad is real-money
-- territory).

alter table meta_ad_accounts  enable row level security;
alter table meta_campaigns    enable row level security;
alter table meta_adsets       enable row level security;
alter table meta_ads          enable row level security;
alter table meta_ad_insights  enable row level security;
alter table meta_sync_runs    enable row level security;
alter table meta_ads_actions  enable row level security;
alter table meta_ads_settings enable row level security;

-- meta_ad_accounts: select/insert/update from the client (Settings screen
-- adds/edits/toggles accounts directly), delete not granted by policy (RLS
-- default-denies what no policy allows) so removing one is a service-role/
-- SQL-console action only, on purpose — history in meta_ad_insights should
-- not casually disappear.
create policy "require_known_issuer" on meta_ad_accounts
  as restrictive for all to authenticated using (app_issuer_ok());
create policy "meta_ads_read" on meta_ad_accounts
  as permissive for select to authenticated
  using (app_can_view('marketing') and app_can_view_marketing_tab('meta_ads'));
create policy "meta_ads_insert" on meta_ad_accounts
  as permissive for insert to authenticated
  with check (app_can_edit('marketing') and app_can_edit_marketing_tab('meta_ads'));
create policy "meta_ads_write" on meta_ad_accounts
  as permissive for update to authenticated
  using (app_can_edit('marketing') and app_can_edit_marketing_tab('meta_ads'))
  with check (app_can_edit('marketing') and app_can_edit_marketing_tab('meta_ads'));

create policy "require_known_issuer" on meta_campaigns
  as restrictive for all to authenticated using (app_issuer_ok());
create policy "meta_ads_read" on meta_campaigns
  as permissive for select to authenticated
  using (app_can_view('marketing') and app_can_view_marketing_tab('meta_ads'));
create policy "meta_ads_write" on meta_campaigns
  as permissive for update to authenticated
  using (app_can_edit('marketing') and app_can_edit_marketing_tab('meta_ads'))
  with check (app_can_edit('marketing') and app_can_edit_marketing_tab('meta_ads'));

create policy "require_known_issuer" on meta_adsets
  as restrictive for all to authenticated using (app_issuer_ok());
create policy "meta_ads_read" on meta_adsets
  as permissive for select to authenticated
  using (app_can_view('marketing') and app_can_view_marketing_tab('meta_ads'));
create policy "meta_ads_write" on meta_adsets
  as permissive for update to authenticated
  using (app_can_edit('marketing') and app_can_edit_marketing_tab('meta_ads'))
  with check (app_can_edit('marketing') and app_can_edit_marketing_tab('meta_ads'));

create policy "require_known_issuer" on meta_ads
  as restrictive for all to authenticated using (app_issuer_ok());
create policy "meta_ads_read" on meta_ads
  as permissive for select to authenticated
  using (app_can_view('marketing') and app_can_view_marketing_tab('meta_ads'));
create policy "meta_ads_write" on meta_ads
  as permissive for update to authenticated
  using (app_can_edit('marketing') and app_can_edit_marketing_tab('meta_ads'))
  with check (app_can_edit('marketing') and app_can_edit_marketing_tab('meta_ads'));

create policy "require_known_issuer" on meta_ad_insights
  as restrictive for all to authenticated using (app_issuer_ok());
create policy "meta_ads_read" on meta_ad_insights
  as permissive for select to authenticated
  using (app_can_view('marketing') and app_can_view_marketing_tab('meta_ads'));

create policy "require_known_issuer" on meta_sync_runs
  as restrictive for all to authenticated using (app_issuer_ok());
create policy "meta_ads_read" on meta_sync_runs
  as permissive for select to authenticated
  using (app_can_view('marketing') and app_can_view_marketing_tab('meta_ads'));

create policy "require_known_issuer" on meta_ads_actions
  as restrictive for all to authenticated using (app_issuer_ok());
create policy "meta_ads_read" on meta_ads_actions
  as permissive for select to authenticated
  using (app_can_view('marketing') and app_can_view_marketing_tab('meta_ads'));
create policy "meta_ads_write" on meta_ads_actions
  as permissive for insert to authenticated
  with check (app_can_edit('marketing') and app_can_edit_marketing_tab('meta_ads'));

create policy "require_known_issuer" on meta_ads_settings
  as restrictive for all to authenticated using (app_issuer_ok());
create policy "meta_ads_read" on meta_ads_settings
  as permissive for select to authenticated
  using (app_can_view('marketing') and app_can_view_marketing_tab('meta_ads'));
create policy "meta_ads_write" on meta_ads_settings
  as permissive for update to authenticated
  using (app_can_edit('marketing') and app_can_edit_marketing_tab('meta_ads'))
  with check (app_can_edit('marketing') and app_can_edit_marketing_tab('meta_ads'));

grant delete, insert, references, select, trigger, truncate, update on meta_ad_accounts    to anon, authenticated, service_role;
grant delete, insert, references, select, trigger, truncate, update on meta_campaigns      to anon, authenticated, service_role;
grant delete, insert, references, select, trigger, truncate, update on meta_adsets         to anon, authenticated, service_role;
grant delete, insert, references, select, trigger, truncate, update on meta_ads            to anon, authenticated, service_role;
grant delete, insert, references, select, trigger, truncate, update on meta_ad_insights    to anon, authenticated, service_role;
grant delete, insert, references, select, trigger, truncate, update on meta_sync_runs      to anon, authenticated, service_role;
grant delete, insert, references, select, trigger, truncate, update on meta_ads_actions    to anon, authenticated, service_role;
grant delete, insert, references, select, trigger, truncate, update on meta_ads_settings   to anon, authenticated, service_role;
grant delete, insert, references, select, trigger, truncate, update on meta_campaign_insights to anon, authenticated, service_role;

grant delete, insert, references, select, trigger, truncate, update on fs_meta_ad_accounts  to anon, authenticated, service_role;
grant delete, insert, references, select, trigger, truncate, update on fs_meta_campaigns     to anon, authenticated, service_role;
grant delete, insert, references, select, trigger, truncate, update on fs_meta_adsets        to anon, authenticated, service_role;
grant delete, insert, references, select, trigger, truncate, update on fs_meta_ads           to anon, authenticated, service_role;
grant delete, insert, references, select, trigger, truncate, update on fs_meta_ad_insights   to anon, authenticated, service_role;
grant delete, insert, references, select, trigger, truncate, update on fs_meta_sync_runs     to anon, authenticated, service_role;
grant delete, insert, references, select, trigger, truncate, update on fs_meta_ads_actions   to anon, authenticated, service_role;
grant delete, insert, references, select, trigger, truncate, update on fs_meta_ads_settings  to anon, authenticated, service_role;
