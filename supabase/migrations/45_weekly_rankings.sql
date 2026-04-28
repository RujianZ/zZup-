-- =============================================================================
-- 45_weekly_rankings.sql (rewritten 2026-04-17)
--
-- Changes from original:
--   - Removed pet_avatar_url from return (was leaking pet identity to
--     rankings even when user chose ranking_identity_mode='real' or had
--     profile_visibility='real_only'). The avatar_url field already returns
--     the right one based on ranking_identity_mode.
--   - set search_path = public (defensive)
--
-- NOT changed:
--   - active_title aggregation by (user, place_type) — by design, titles
--     show only in the ranking matching the place where they were earned
--     (e.g., 'Bookworm' shows only in library ranking, not in gym ranking)
--   - SECURITY DEFINER (needed to read REVOKE'd ranking_* columns)
--   - Caller must be edu_verified at p_university
--   - Top 3 per place_type, in (library, coffee_shop, gym, dining)
-- =============================================================================

drop function if exists public.get_weekly_rankings(text);

create or replace function public.get_weekly_rankings(p_university text)
returns table (
  place_type        text,
  user_id           uuid,
  display_name      text,
  avatar_url        text,
  identity_mode     text,
  weekly_time_spent bigint,
  active_title      text,
  rank              bigint
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_week_start date := date_trunc('week', (now() AT TIME ZONE 'America/Los_Angeles'))::date;
begin
  if not exists (
    select 1 from public.profiles
    where id = auth.uid()
      and edu_verified = true
      and university = p_university
  ) then
    return;
  end if;

  return query
  with aggregated as (
    select
      lm.place_type,
      p.id as uid,
      p.real_name,
      p.avatar_url as real_avatar_url,
      p.pet_name,
      p.pet_avatar_url,
      p.ranking_identity_mode,
      sum(e.weekly_time_spent) as total_weekly,
      (array_agg(e.active_title order by e.weekly_time_spent desc)
        filter (where e.active_title is not null))[1] as active_title
    from public.explorations e
    join public.profiles  p  on p.id  = e.user_id
    join public.landmarks lm on lm.id = e.landmark_id
    where p.university    = p_university
      and p.edu_verified  = true
      and p.ranking_opt_in = true
      and e.week_start_date = v_week_start
      and e.weekly_time_spent > 0
      and lm.place_type in ('library', 'coffee_shop', 'gym', 'dining')
    group by
      lm.place_type, p.id, p.real_name, p.avatar_url,
      p.pet_name, p.pet_avatar_url, p.ranking_identity_mode
  ),
  ranked as (
    select
      a.*,
      row_number() over (partition by a.place_type order by a.total_weekly desc) as rn
    from aggregated a
  )
  select
    r.place_type,
    r.uid as user_id,
    case when r.ranking_identity_mode = 'pet' then r.pet_name
         else r.real_name end as display_name,
    case when r.ranking_identity_mode = 'pet' then r.pet_avatar_url
         else r.real_avatar_url end as avatar_url,
    r.ranking_identity_mode as identity_mode,
    r.total_weekly as weekly_time_spent,
    r.active_title,
    r.rn as rank
  from ranked r
  where r.rn <= 3
  order by r.place_type, r.total_weekly desc;
end;
$$;

grant execute on function public.get_weekly_rankings(text) to authenticated;
