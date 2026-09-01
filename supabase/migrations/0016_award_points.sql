-- ============================================================================
-- 0016_award_points.sql
--
-- Awarding reward points, as one atomic operation.
--
-- The Firestore version ran a client transaction that read the transaction
-- record, the person's total and the leaderboard, then wrote all three. Ported
-- straight across that becomes four separate round trips with no transaction
-- around them: two awards landing together would both read the same total and
-- one would overwrite the other's points.
--
-- Idempotency was the deterministic document id "uid__event__source" -- writing
-- the same id twice was a no-op. Here that is the primary key of
-- point_transactions and an ON CONFLICT DO NOTHING, which is the same guarantee
-- enforced by the database rather than by choosing a key.
--
-- The feature is switched off at REWARDS_ENABLED in src/utils/rewardService.js.
-- This exists so that turning it on is a one-line change rather than a rebuild.
-- ============================================================================

create or replace function public.award_points(
  p_person_id    uuid,
  p_display_name text,
  p_event_type   text,
  p_source_id    text,
  p_points       integer,
  p_reason       text default null
)
returns integer
language plpgsql
volatile
security definer
set search_path to 'public'
as $$
declare
  tx_id     text := p_person_id::text || '__' || p_event_type || '__' || p_source_id;
  new_total integer;
begin
  if p_points is null or p_points <= 0 then
    return null;
  end if;

  -- Idempotency. A repeat award for the same person, event and source inserts
  -- nothing and we stop here, so the totals below never double-count.
  insert into point_transactions (id, person_id, event_type, source_id, points, reason)
  values (tx_id, p_person_id, p_event_type, p_source_id, p_points, coalesce(p_reason, p_event_type))
  on conflict (id) do nothing;

  if not found then
    return null;
  end if;

  insert into user_points (person_id, display_name, total_points, weekly_points, last_updated)
  values (p_person_id, p_display_name, p_points, p_points, now())
  on conflict (person_id) do update
    set total_points  = user_points.total_points  + excluded.total_points,
        weekly_points = user_points.weekly_points + excluded.weekly_points,
        display_name  = coalesce(excluded.display_name, user_points.display_name),
        last_updated  = now()
  returning total_points into new_total;

  -- The leaderboard is a cache of the ranked lists, rebuilt from the totals
  -- rather than incremented in place, so it cannot drift away from user_points.
  insert into leaderboard (id, all_time, weekly, last_updated)
  values (
    'current',
    (select coalesce(jsonb_agg(jsonb_build_object(
        'uid', person_id::text, 'displayName', display_name, 'points', total_points)
        order by total_points desc), '[]'::jsonb) from user_points),
    (select coalesce(jsonb_agg(jsonb_build_object(
        'uid', person_id::text, 'displayName', display_name, 'points', weekly_points)
        order by weekly_points desc), '[]'::jsonb) from user_points),
    now())
  on conflict (id) do update
    set all_time = excluded.all_time,
        weekly   = excluded.weekly,
        last_updated = now();

  return new_total;
end $$;

revoke all on function public.award_points(uuid, text, text, text, integer, text) from public, anon;
grant execute on function public.award_points(uuid, text, text, text, integer, text)
  to authenticated, service_role;
