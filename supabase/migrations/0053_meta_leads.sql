-- ============================================================================
-- 0053_meta_leads.sql
--
-- Real-time Meta Lead Gen tracking: stores prospect submissions from Facebook
-- & Instagram Instant Forms (Lead Ads), captured via Meta Webhooks or manual
-- lead sync.
--
-- Each lead records:
--   - Meta's leadgen_id as primary key
--   - Ad account, campaign, adset, and ad foreign keys/names
--   - Instant form details (form_id, form_name)
--   - Extracted prospect contact: full_name, phone_number, email, city
--   - Full raw field_data JSON (custom questionnaire answers)
--   - Lead follow-up status: new -> contacted -> qualified -> converted -> archived
--   - Customer link: customer_id when converted to an ERP customer
-- ============================================================================

create table if not exists meta_leads (
  id               text primary key, -- Meta's leadgen_id (e.g. "1234567890")
  ad_account_id    text references meta_ad_accounts(id) on delete set null,
  campaign_id      text references meta_campaigns(id) on delete set null,
  campaign_name    text,
  adset_id         text references meta_adsets(id) on delete set null,
  adset_name       text,
  ad_id            text references meta_ads(id) on delete set null,
  ad_name          text,
  form_id          text,
  form_name        text,
  full_name        text,
  phone_number     text,
  email            text,
  city             text,
  raw_data         jsonb not null default '{}'::jsonb,
  status           text not null default 'new' check (status in ('new', 'contacted', 'qualified', 'converted', 'archived')),
  customer_id      text references customers(id) on delete set null,
  notes            text,
  lead_created_at  timestamptz not null default now(),
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);

create index if not exists meta_leads_created_idx   on meta_leads (created_at desc);
create index if not exists meta_leads_status_idx    on meta_leads (status);
create index if not exists meta_leads_campaign_idx  on meta_leads (campaign_id);
create index if not exists meta_leads_ad_idx        on meta_leads (ad_id);
create index if not exists meta_leads_phone_idx     on meta_leads (phone_number);

-- Compatibility view mapping to camelCase for the frontend db.js / schemaMap
create or replace view fs_meta_leads as
select
  id,
  ad_account_id    as "adAccountId",
  campaign_id      as "campaignId",
  campaign_name    as "campaignName",
  adset_id         as "adsetId",
  adset_name       as "adsetName",
  ad_id            as "adId",
  ad_name          as "adName",
  form_id          as "formId",
  form_name        as "formName",
  full_name        as "fullName",
  phone_number     as "phoneNumber",
  email,
  city,
  raw_data         as "rawData",
  status,
  customer_id      as "customerId",
  notes,
  lead_created_at  as "leadCreatedAt",
  created_at       as "createdAt",
  updated_at       as "updatedAt"
from meta_leads;

alter view fs_meta_leads set (security_invoker = on);

-- Row level security
alter table meta_leads enable row level security;

create policy "meta_leads_read" on meta_leads
  as permissive for select to authenticated
  using (app_can_view('marketing') and app_can_view_marketing_tab('meta_ads'));

create policy "meta_leads_write" on meta_leads
  as permissive for update to authenticated
  using (app_can_edit('marketing') and app_can_edit_marketing_tab('meta_ads'))
  with check (app_can_edit('marketing') and app_can_edit_marketing_tab('meta_ads'));

create policy "meta_leads_insert" on meta_leads
  as permissive for insert to authenticated
  with check (app_can_edit('marketing') and app_can_edit_marketing_tab('meta_ads'));

-- Permissions
grant delete, insert, references, select, trigger, truncate, update on meta_leads to anon, authenticated, service_role;
grant delete, insert, references, select, trigger, truncate, update on fs_meta_leads to anon, authenticated, service_role;
