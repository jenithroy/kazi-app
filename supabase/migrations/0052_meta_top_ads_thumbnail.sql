-- Include ad creative thumbnail url in meta_top_ads RPC
drop function if exists meta_top_ads(date, date, integer);

create or replace function meta_top_ads(date_from date default null, date_to date default null, entity_limit integer default 10)
returns table (
  "adId"                  text,
  "adName"                text,
  "campaignName"          text,
  "creativeThumbnailUrl"  text,
  currency                text,
  spend                   numeric,
  clicks                  bigint,
  impressions             bigint
)
language sql stable as $$
  select a.id, a.name, c.name, max(a.creative_thumbnail_url) as "creativeThumbnailUrl", max(i.currency),
         sum(i.spend), sum(i.clicks), sum(i.impressions)
    from meta_ad_insights i
    join meta_ads a       on a.id = i.entity_id
    join meta_campaigns c on c.id = a.campaign_id
   where i.entity_level = 'ad'
     and (date_from is null or i.date >= date_from)
     and (date_to   is null or i.date <= date_to)
   group by a.id, a.name, c.name
   order by sum(i.spend) desc
   limit greatest(entity_limit, 1);
$$;

grant execute on function meta_top_ads(date, date, integer) to authenticated;
