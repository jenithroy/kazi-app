-- ============================================================================
-- 0047_meta_ads_attribution.sql
--
-- kazi-app has no public-facing quote form to capture UTM params on (that
-- lives on the separate public website) and no existing concept of "where
-- did this customer come from" — the customers table has no source/
-- campaign/lead field (see src/pages/Customers.jsx / customers in
-- 0000_baseline.sql). True click-to-order attribution is not buildable here.
--
-- This is the honest, minimal version instead: an OPTIONAL, MANUALLY-SET tag
-- on customers pointing at a real meta_campaigns row (a dropdown, not free
-- text), set by staff when they know a customer came from a specific ad —
-- e.g. an inbound WhatsApp/Instagram DM after seeing one. It is tagged once
-- per customer, not per order: customers is this app's existing relationship
-- root (orders already FK to customer_id; Customers.jsx already rolls up
-- orders/invoices/payments per customer), and every order from a tagged
-- customer inherits the tag. This will misattribute a later, unrelated order
-- from a long-standing customer — accepted as the honest cost of a manual,
-- minimal version.
--
-- The UI must label this "manually tagged", never "tracked" — there is no
-- session/cookie capture anywhere in this stack.
-- ============================================================================

alter table customers add column if not exists source_campaign_id text
  references meta_campaigns(id) on delete set null;
alter table customers add column if not exists source_note text;
alter table customers add column if not exists source_tagged_at timestamptz;
alter table customers add column if not exists source_tagged_by uuid
  references people(id) on delete set null;
create index if not exists customers_source_campaign_idx on customers (source_campaign_id);

-- fs_customers (0029) re-created to expose the four new columns. CREATE OR
-- REPLACE silently drops reloptions, so security_invoker is re-applied right
-- after, same as every other view redefinition in this codebase.
create or replace view fs_customers as
  select id::text as id,
    name,
    contact_person  as "contactPerson",
    email::text     as email,
    phone,
    address,
    city,
    country,
    notes,
    created_at      as "createdAt",
    region,
    source_campaign_id as "sourceCampaignId",
    source_note         as "sourceNote",
    source_tagged_at    as "sourceTaggedAt",
    source_tagged_by    as "sourceTaggedBy"
  from customers;
alter view fs_customers set (security_invoker = on);


-- One row per campaign that has at least a tagged customer or spend in the
-- requested window. date_from/date_to bound spend only — a point-in-time
-- manual tag and a windowed spend figure would otherwise produce misleading
-- mismatches at narrow ranges (e.g. a January-acquired customer's June order
-- compared against June-only spend), so tagged-customer/order counts stay
-- all-time; both date args default to null, meaning "everything synced".
--
-- security invoker (the default for a plain sql function): only returns what
-- the caller's own RLS on meta_campaigns / meta_ad_insights / customers /
-- orders already lets them see — a caller who cannot view Customers sees 0
-- tagged customers here rather than an error, same "UI is a courtesy, RLS is
-- the enforcement" rule as everywhere else in this app.
--
-- ROAS and cost-per-tagged-X are NOT computed here — spend and
-- tagged_order_value_npr are returned separately and combined at read time
-- in the component, per the "rates never stored/derived" rule. They are also
-- in DIFFERENT currencies (spend is the ad account's own Meta-reported
-- currency; tagged_order_value_npr is always NPR) — the component is
-- responsible for converting before dividing, never this function.
create or replace function meta_campaign_attribution(date_from date default null, date_to date default null)
returns table (
  "campaignId"         text,
  "campaignName"       text,
  "adAccountId"        text,
  currency             text,
  spend                numeric,
  "taggedCustomers"    bigint,
  "taggedOrders"       bigint,
  "taggedOrderValueNpr" numeric
)
language sql stable as $$
  select
    mc.id, mc.name, mc.ad_account_id,
    coalesce(sp.currency, aa.currency),
    coalesce(sp.total_spend, 0),
    coalesce(cu.tagged_customers, 0),
    coalesce(ord.tagged_orders, 0),
    coalesce(ord.tagged_order_value_npr, 0)
  from meta_campaigns mc
  join meta_ad_accounts aa on aa.id = mc.ad_account_id
  left join (
    select campaign_id, sum(spend) as total_spend, max(currency) as currency
      from meta_campaign_insights
     where (date_from is null or date >= date_from)
       and (date_to   is null or date <= date_to)
     group by campaign_id
  ) sp on sp.campaign_id = mc.id
  left join (
    select source_campaign_id, count(*) as tagged_customers
      from customers
     where source_campaign_id is not null
     group by source_campaign_id
  ) cu on cu.source_campaign_id = mc.id
  left join (
    select cust.source_campaign_id,
           count(distinct o.id) as tagged_orders,
           sum(o.total_value_npr) as tagged_order_value_npr
      from orders o
      join customers cust on cust.id = o.customer_id
     where cust.source_campaign_id is not null
     group by cust.source_campaign_id
  ) ord on ord.source_campaign_id = mc.id;
$$;

grant execute on function meta_campaign_attribution(date, date) to authenticated;
