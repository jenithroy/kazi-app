-- ============================================================================
-- 0045_outreach_prospects.sql
--
-- A cold-outreach tracker for brand manufacturing partnerships, distinct from
-- Leads (0033) and Customers. Leads is inbound — a lead exists because a
-- customer messaged in via Instagram. Customers is post-sale — an order or
-- invoice exists. This table is for the stage before either: brands Kazi has
-- identified as plausible manufacturing customers and is cold-DMing/calling,
-- with no relationship yet in either direction.
--
-- Plain single-permission section, same shape as `customers` (0000_baseline)
-- rather than the tab-split shape Leads/Finance use — there's no separate
-- view/edit-of-what distinction here, just "can see this page" and "can log
-- outreach on it".
-- ============================================================================

create table if not exists outreach_prospects (
  "id"            uuid default gen_random_uuid() not null primary key,
  "tier"          text not null default 'C',
  "brand_name"    text not null,
  "country"       text,
  "category"      text,
  "website"       text,
  "instagram"     text,
  "email"         citext,
  "contact_note"  text,
  "rationale"     text,
  "status"        text not null default 'not_contacted',
  "notes"         text,
  "created_at"    timestamptz default now() not null,
  "updated_at"    timestamptz default now() not null
);

create index if not exists outreach_prospects_tier_idx on outreach_prospects (tier);

alter table outreach_prospects enable row level security;

create policy "require_known_issuer" on outreach_prospects
  as restrictive for all
  to authenticated
  using (app_issuer_ok());
create policy "sect_read" on outreach_prospects
  as permissive for select
  to authenticated
  using (app_can_view('outreach'::text));
create policy "sect_write" on outreach_prospects
  as permissive for all
  to authenticated
  using (app_can_edit('outreach'::text))
  with check (app_can_edit('outreach'::text));

grant delete, insert, references, select, trigger, truncate, update on outreach_prospects to anon;
grant delete, insert, references, select, trigger, truncate, update on outreach_prospects to authenticated;
grant delete, insert, references, select, trigger, truncate, update on outreach_prospects to service_role;


-- ─── The page joins the permission matrix ──────────────────────────────
-- Inserting this row fires grant_new_section_to_super_admins() from 0028, so
-- Director / System Admin / Developer get it immediately and everyone else
-- starts at None — to be granted in the Admin Panel like any other page.

insert into sections (id, label, aliases, is_personal, sort_order)
values ('outreach', 'Outreach', array['prospects', 'cold outreach', 'nepal brands'], false, 25)
on conflict (id) do update
  set label      = excluded.label,
      aliases    = excluded.aliases,
      sort_order = excluded.sort_order;


-- ─── Realtime, same reasoning as 0032's usage feed ─────────────────────
-- RLS applies to realtime the same as to a read, so nobody sees a row they
-- could not have queried directly.

do $$
begin
  if not exists (
    select 1 from pg_publication_tables
     where pubname = 'supabase_realtime'
       and schemaname = 'public'
       and tablename = 'outreach_prospects'
  ) then
    alter publication supabase_realtime add table public.outreach_prospects;
  end if;
end $$;


-- ─── Seed: the first research pass (2026-09-23) ────────────────────────
-- 58 UK/EU brands, tiered S (warmest — already sourcing from Kathmandu) down
-- to D (unverified, from an earlier unstructured pass — confirm before
-- spending a DM on these). Cross-checked against the kill list in
-- ~/Documents/kazi/uk_brand_outreach.md (2026-08-13) so nothing already
-- ruled out (print-on-demand shops, brands over the size ceiling, "Made in
-- UK/Italy" brands whose whole story is local production) reappears here.

insert into outreach_prospects (tier, brand_name, country, category, website, instagram, email, contact_note, rationale)
values
  ('S', 'Hemp & Hope', 'UK (Scotland)', 'hemp-sustainable', 'hempandhope.com', null, null, null, 'Already sources hemp spun in Himalayan villages and cut-and-sewn by family-run businesses in Kathmandu AND Pokhara - same city as your factory. Not streetwear, but zero cultural/logistics barrier. Contact regardless of category fit.'),
  ('A', 'From The Terraces', 'UK', 'streetwear', 'fromtheterraces.co.uk', 'from_the_terraces', null, null, 'Every product has customisable team-colour patches - requires many small colourway runs by definition. Best-fit target on the whole list. 4.9 Trustpilot, 300+ reviews.'),
  ('A', 'Parlez', 'UK', 'streetwear', 'parlez.co.uk', 'parlezclothing', null, null, 'London skate-adjacent brand. Rugby/knitwear/jackets are real cut & sew, not decorated blanks. Already pushes sustainability - Nepal story has somewhere to land.'),
  ('A', 'Skateboard Cafe', 'UK', 'streetwear', 'skateboardcafe.com', null, null, null, 'Bristol skate brand, international stockists. Seasonal drops on tight timelines, usually quoted 12wk by factories - speed is the whole conversation.'),
  ('A', 'Terrace Cult', 'UK', 'streetwear', 'terracecult.com', null, null, null, 'Overshirts/cargo shorts/polos, has a stockist network. Higher price point, outerwear-heavy - a proper cut & sew customer, not just a blanks buyer.'),
  ('A', 'Flow Like Zen', 'UK', 'streetwear', 'flowlikezen.com', 'flowlikezen', null, null, 'Wide product range (tees/hoodies/joggers/tracksuits/jackets) means genuine cut & sew need. No GSM published anywhere - natural DM opener.'),
  ('A', 'British Vintage Boxing', 'UK', 'streetwear', 'britishvintageboxing.com', 'britishvintageboxing', null, null, '~27k IG. Tracksuits/tracktops are cut & sew. Heritage cotton and loopback suits capability well.'),
  ('A', 'Yardsale', 'UK', 'streetwear', null, null, null, 'needs IG verify', 'Well-known within skate, still independent - verify current size before spending the DM, may have outgrown a 50-unit MOQ pitch.'),
  ('A', 'Phrase Studios', 'Belgium', 'streetwear', 'phrasestudios.com', 'phrase.studios', 'phrase.studios@gmail.com', null, 'Small-batch numbered ''chapter'' drops, founded 2023, no visible factory partner. Close match to Cavalls Studio scale.'),
  ('A', 'CLRE', 'France', 'streetwear', 'clre.shop', null, null, null, 'Independent French label, capsule ''Drop.00X'' releases, small/anti-mass-production positioning.'),
  ('A', 'Hemp Horizon', 'UK', 'hemp-sustainable', 'hemphorizon.co.uk', null, null, null, 'Small UK zero-waste organic hemp designer, no visible in-house factory. Nepal hemp-weaving heritage is a natural pitch angle.'),
  ('A', 'BEWUSST Hempwear', 'Germany', 'hemp-sustainable', 'en.bewusst-wear.com', 'bewusst_pure_hemp_wear', null, 'founder Maren Oeding', 'Very small Berlin 100%-hemp label (~1.8k IG), currently EU-made - plausible cost-driven switch.'),
  ('A', 'Batera Brand', 'Spain', 'hemp-sustainable', 'baterabrand.com', 'baterabrand', 'hello@baterabrand.com', null, 'Basque hemp T-shirt/hoodie label, currently made in Spain/Portugal, viral small-batch drops.'),
  ('A', 'Boldwill (formerly Iron Roots)', 'Netherlands', 'hemp-sustainable', 'boldwill.com', 'boldwill.sports', 'info@boldwill.com', null, 'Small Dutch hemp/organic-cotton sportswear-loungewear brand, currently made via Portugal/Greece - strong hemp-story fit.'),
  ('A', 'Stalf', 'UK', 'loungewear', 'stalf.co.uk', 'stalf.studio', 'customerservice@stalf.co.uk', null, 'Handmade-in-house organic cotton/hemp sweats, 34K IG, one-studio production - growth pressure is real.'),
  ('A', 'MELAWEAR', 'Germany', 'loungewear', 'melawear.de', 'melawear', 'sales@melawear.de', null, 'Small GOTS-certified vegan basics/loungewear brand, independent, no owned factory.'),
  ('A', 'Berner Kuhl', 'Denmark', 'streetwear', 'bernerkuhl.com', 'bernerkuhl', null, null, 'Small independent Copenhagen menswear label, founded 2019, no visible owned factory.'),
  ('A', 'Sasuphi', 'Italy', 'streetwear', null, 'sasuphi_official', null, null, 'Small independent Italian label founded 2021, DTC-driven, no visible factory relationship.'),
  ('A', 'Ditsy Bits', 'Ireland', 'streetwear', 'ditsybits.com', 'ditsybitss', 'ditsybitsorders@gmail.com', null, 'Small Dublin drop-based brand, limited small-batch runs, no visible factory partner.'),
  ('A', 'Amoses', 'France (Lille)', 'streetwear', 'amosesclothing.com', 'amosesclothing', 'contact@amosesclothing.com', null, 'Solo-founder independent streetwear brand, small limited-edition collections.'),
  ('B', 'Morning Club Clothing', 'UK', 'streetwear', 'morningclubclothing.co.uk', 'morningclubclothing', null, null, 'Nottinghamshire, founder Laura. Already uses an India factory - no cultural barrier to overseas sourcing. Don''t use the duty angle, India is already duty-free.'),
  ('B', 'THTC', 'UK', 'hemp-sustainable', 'uk.thtc.com', 'thtcclothing', null, null, 'Hemp/bamboo/organic cotton streetwear since 1999. 25yrs old with existing wholesale programme - pitch as second source for a capsule, not a switch.'),
  ('B', 'Jnglst Clothing', 'UK', 'streetwear', 'jnglstclothing.com', 'junglistnetwork', null, null, 'UK jungle/DnB scene brand. Deliberately limited editions (''200 produced, never repeated'') - exactly what a 50 MOQ serves.'),
  ('B', 'MOTIV Gym Wear', 'UK', 'other', null, 'motivgymwear', null, null, 'Devon, incorporated Feb 2024, ~26k IG, no supplier lock-in. Caveat: activewear needs technical fabric/flatlock - only pitch if that capability is real.'),
  ('B', 'MKI Miyuki Zoku', 'UK', 'streetwear', 'mkimiyukizoku.com', null, null, null, 'Leeds, founded 2010. Caveat: also stocks designer collabs (Comme des Garcons) - confirm own-label split before pitching.'),
  ('B', 'WAWWA', 'UK', 'streetwear', 'wawwaclothing.com', null, null, null, 'Manchester social enterprise, organic cotton/Lenzing modal, unusually open about construction - they sell sewing patterns.'),
  ('B', 'Death & Friends', 'UK', 'streetwear', 'deathnfriends.com', 'deathandfriends.ltd', null, null, 'Alt/underground streetwear. Caveat: discloses no location/sourcing, prices in USD first - low conviction until IG is eyeballed.'),
  ('B', 'Unrecorded', 'Netherlands', 'hemp-sustainable', 'unrecorded.co', 'unrecorded.co', null, 'founders Jolle van der Mast & Daniel Archutowski', 'Small Amsterdam genderless organic-cotton essentials brand, DTC, no visible owned factory.'),
  ('B', 'Batch1', 'UK', 'loungewear', 'batch1.com', 'batch1uk', 'hello@batch1.com', null, 'South London brand making organic tees/hoodies in-house in small batches - growth likely forces outsourcing.'),
  ('B', 'Beaumont Organic', 'UK', 'loungewear', 'beaumontorganic.com', null, 'hannah@beaumontorganic.com', 'wholesale', 'Founder-led organic-cotton loungewear since 2008, currently produced in Europe - margin-driven switch candidate.'),
  ('B', 'Navygrey', 'UK', 'loungewear', 'navygrey.co', 'navygrey.co', null, 'founder Rachel Carvell-Spedding', 'Founder-led knitwear/loungewear B-Corp - could extend into cotton hoodies/tees via Nepal.'),
  ('B', 'Gravi Studios', 'Germany', 'streetwear', 'gravistudios.de', 'gravistudios', null, null, 'Bielefeld, oversized tees/hoodies, DTC drops.'),
  ('B', 'Emporium', 'Ireland', 'streetwear', null, null, null, null, 'Dublin, founded 2018, grew from pop-ups to one store - plausible outsourcing candidate as it scales.'),
  ('B', 'MORICO', 'Finland', 'hemp-sustainable', 'morico.fi', null, null, null, 'Slow-fashion/streetwear crossover, pre-order/low-waste model - natural-materials angle fits hemp/organic-cotton pitch.'),
  ('B', 'Human With Attitude (HWA)', 'France (Paris)', 'streetwear', 'humanwithattitude.com', 'humanwithattitude', null, null, '140K IG, limited rare drops - bigger but no visible in-house factory. Verify scale before pitching.'),
  ('B', 'Nubes Studio', 'France', 'streetwear', 'nubes-studio.com', 'nubes.studio', null, null, 'Independent French streetwear studio, distinctive drop culture, no visible factory.'),
  ('B', 'DivinByDivin', 'France (Lille)', 'streetwear', 'divinbydivin.com', null, null, null, 'Independent since 2017, small-scale, no visible factory.'),
  ('B', 'Bare Bones', 'Poland (Warsaw)', 'streetwear', 'barebones.pl', 'barebones_clothing', null, null, 'Independent since 2015, distinctive graphics, no visible factory.'),
  ('B', 'Hemptees', 'Belgium', 'hemp-sustainable', 'hemptees.be', null, null, 'contact page only', 'Small founder-led slow-fashion webshop selling 100% hemp basics.'),
  ('D', 'Garden', 'UK', 'streetwear', null, null, null, null, 'Skate brand - flagged in prior research, not yet verified for scale/fit.'),
  ('D', 'The National Skateboard Co', 'UK', 'streetwear', null, null, null, null, 'Skate brand - not yet verified for scale/fit.'),
  ('D', 'Isle', 'UK', 'streetwear', null, null, null, null, 'Skate brand - not yet verified for scale/fit.'),
  ('D', 'Blast Skates', 'UK', 'streetwear', null, null, null, null, 'Skate brand - not yet verified for scale/fit.'),
  ('D', 'Commotion', 'UK (Leeds)', 'streetwear', null, null, null, null, 'Leeds brand - not yet verified for scale/fit.'),
  ('D', 'Achieved Desires', 'UK (Leeds)', 'streetwear', null, null, null, null, 'Leeds brand - not yet verified for scale/fit.'),
  ('D', 'E2R', 'UK (Leeds)', 'streetwear', null, null, null, null, 'Leeds brand - not yet verified for scale/fit.'),
  ('D', 'Aerosoul Clothing', 'UK', 'streetwear', null, null, null, 'run by Leke', 'Jungle music scene brand - not yet verified for scale/fit.'),
  ('C', 'NoClout', 'France (Lyon)', 'streetwear', 'noclout.fr', 'noclout.fr', null, null, 'Fast-growing (~100k IG) - may be scaling past small-brand MOQ needs, verify before pitching.'),
  ('C', 'Story MFG', 'UK', 'hemp-sustainable', 'storymfg.com', null, null, null, 'Natural dyes/organic fabrics - verify how much craft is genuinely in-house before pitching.'),
  ('C', 'Baslager Clothing Co', 'UK', 'streetwear', 'baslager.com', 'baslagerclothingco', null, null, 'Scandinavian-inspired basics/streetwear, no visible factory relationship.'),
  ('C', 'Syxth Clothing', 'UK', 'streetwear', 'syxthclothing.co.uk', 'syxthclothing', null, null, 'Independent heavyweight graphic-tee brand, growing DTC customer base.'),
  ('C', 'Carsicko', 'UK', 'streetwear', 'carsickowear.com', null, null, null, 'Fast-growing London brand - may already be scaling past small-brand size, verify revenue first.'),
  ('C', 'Bonsai', 'Italy', 'streetwear', 'bonsaiclothing.com', 'bonsai.brand', null, null, 'Bologna label, but leans on Italian-fabric/local-artisan story - possible ''Made in Italy'' positioning overlap, verify.'),
  ('C', 'Never Enough', 'Czech Republic', 'streetwear', 'neverenough.shop', null, null, null, 'Prague brand positioning against fast fashion - production setup unconfirmed.'),
  ('C', 'FINELLI', 'Switzerland', 'streetwear', 'finelliclothing.com', null, null, null, 'Premium positioning may be above target margin band.'),
  ('C', 'OCTAGON', 'Poland', 'streetwear', 'fightershop.com.pl', 'octagon_fight_wear', null, null, '45K IG fight-culture streetwear, but has own ''produkcja'' (production) account - verify no in-house manufacturing first.'),
  ('C', 'Maison 52', 'France', 'streetwear', 'maison52.com', 'maison52_', null, null, 'Limited drops but positions ''made in Europe'' as part of premium story - verify fit.'),
  ('C', 'Yes Friends', 'UK', 'loungewear', 'yesfriends.co', 'yesfriendsbrand', null, null, 'Ethical basics/loungewear startup - already has an established fair-trade factory relationship. Test only on price/MOQ flexibility, not a full switch.');
