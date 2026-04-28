-- =============================================================================
-- 42_explorations.sql (rewritten 2026-04-17)
--
-- Changes from original:
--   - REVOKE all writes on explorations from authenticated.
--     SELECT remains owner-only (used by getMyTitles).
--   - Two SECURITY DEFINER RPCs replace direct JS writes:
--     - set_active_title(title) — equip/unequip with server-side validation
--     - discover_landmark(landmark_id, lat, lng, minutes_spent) — atomic visit
--       record with anti-cheat (clampMinutesSpent, optimistic lock, radius check)
--   - Index (user_id, week_start_date) for ranking queries
--
-- Security: users can no longer self-grant titles, fake visit_count, or top
-- the weekly ranking by direct UPDATE. All mutations go through validated RPCs.
--
-- Remaining TD-1: GPS coords are still client-supplied. discover_landmark
-- verifies coord is within landmark.radius_meters but cannot detect GPS spoofing.
-- Module 10 should add device attestation.
-- =============================================================================

drop function if exists public.discover_landmark(uuid, double precision, double precision, integer);
drop function if exists public.set_active_title(text);
drop table if exists public.explorations cascade;

create table public.explorations (
  id                uuid default gen_random_uuid() primary key,
  user_id           uuid references public.profiles(id) on delete cascade not null,
  landmark_id       uuid references public.landmarks(id) on delete cascade not null,
  visit_count       integer default 1,
  total_time_spent  integer default 0,
  weekly_time_spent integer default 0,
  week_start_date   date default date_trunc('week', (now() AT TIME ZONE 'America/Los_Angeles'))::date,
  titles_earned     text[] default '{}',
  active_title      text,
  first_visited_at  timestamptz default now(),
  last_visited_at   timestamptz default now(),
  unique(user_id, landmark_id)
);

-- Index used by get_weekly_rankings (filters by week_start_date per user)
create index explorations_user_week_idx
  on public.explorations(user_id, week_start_date);

alter table public.explorations enable row level security;

create policy "owner_can_read"
  on public.explorations for select
  using (auth.uid() = user_id);

-- No INSERT / UPDATE / DELETE policies for authenticated.
-- All writes go through SECURITY DEFINER RPCs below.
revoke all on public.explorations from authenticated;
revoke all on public.explorations from anon;
grant select on public.explorations to authenticated;

-- =============================================================================
-- RPC: set_active_title(title)
-- Equip the given title (or unequip if NULL).
-- Server-side validation: title must be in titles_earned for this user.
-- Ensures only one active_title across all the user's explorations.
-- =============================================================================

create or replace function public.set_active_title(p_title text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid;
  v_exploration_id uuid;
begin
  v_user_id := auth.uid();
  if v_user_id is null then
    raise exception 'Not authenticated';
  end if;

  -- Clear all active_title for this user (one-active-at-a-time invariant)
  update public.explorations
  set active_title = null
  where user_id = v_user_id;

  if p_title is null then return; end if;  -- unequip

  -- Find exploration that has earned this title
  select id into v_exploration_id
  from public.explorations
  where user_id = v_user_id and p_title = any(titles_earned)
  limit 1;

  if v_exploration_id is null then return; end if;  -- silently no-op (anti-cheat)

  update public.explorations
  set active_title = p_title
  where id = v_exploration_id;
end;
$$;

grant execute on function public.set_active_title(text) to authenticated;

-- =============================================================================
-- RPC: discover_landmark(landmark_id, lat, lng, minutes_spent)
-- Atomic visit record + anti-cheat + XP + title unlock.
-- Returns JSON with the same shape as the previous JS DiscoverResult.
-- =============================================================================

create or replace function public.discover_landmark(
  p_landmark_id   uuid,
  p_lat           double precision,
  p_lng           double precision,
  p_minutes_spent integer
) returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid;
  v_landmark public.landmarks;
  v_existing public.explorations;
  v_distance double precision;
  v_now timestamptz := now();
  v_week_start date;
  v_needs_reset boolean;
  v_prev_weekly integer;
  v_safe_minutes integer;
  v_safe_delta integer;
  v_elapsed_min double precision;
  v_xp_earned integer := 0;
  v_is_first_visit boolean := false;
  v_title_unlocked text := null;
  v_junior text;
  v_senior text;
  v_xp_reward integer;
  v_new_visit_count integer;
  v_new_titles text[];
  v_old_last_visited timestamptz;
  v_max_minutes constant integer := 480;
  v_tolerance constant integer := 10;
begin
  v_user_id := auth.uid();
  if v_user_id is null then
    raise exception 'Not authenticated';
  end if;

  select * into v_landmark from public.landmarks where id = p_landmark_id;
  if not found then return null; end if;

  -- Server-side coord check (anti-spoof, partial — can't detect GPS spoofing)
  v_distance := sqrt(
    pow((p_lat - v_landmark.latitude) * 111000, 2) +
    pow((p_lng - v_landmark.longitude) * 111000 * cos(p_lat * pi() / 180), 2)
  );
  if v_distance > v_landmark.radius_meters then return null; end if;

  -- Title and XP per place_type
  case v_landmark.place_type
    when 'library'     then v_junior := 'Bookworm';     v_senior := 'Library King';     v_xp_reward := 15;
    when 'gym'         then v_junior := 'Gym Newbie';   v_senior := 'Gym Fanatic';      v_xp_reward := 15;
    when 'coffee_shop' then v_junior := 'Coffee Lover'; v_senior := 'Coffee Addict';    v_xp_reward := 10;
    when 'dining'      then v_junior := 'Big Eater';    v_senior := 'Dining Hall King'; v_xp_reward := 10;
    else                    v_junior := 'Explorer';     v_senior := 'Master Explorer';  v_xp_reward := 8;
  end case;

  v_week_start := date_trunc('week', (v_now AT TIME ZONE 'America/Los_Angeles'))::date;

  select * into v_existing
  from public.explorations
  where user_id = v_user_id and landmark_id = p_landmark_id;

  if not found then
    -- First visit ever
    v_safe_minutes := least(greatest(0, p_minutes_spent), v_max_minutes);
    v_xp_earned := v_xp_reward;
    v_is_first_visit := true;

    insert into public.explorations (
      user_id, landmark_id, visit_count, total_time_spent, weekly_time_spent,
      week_start_date, titles_earned, first_visited_at, last_visited_at
    ) values (
      v_user_id, p_landmark_id, 1, v_safe_minutes, v_safe_minutes,
      v_week_start, '{}', v_now, v_now
    );

    perform public.add_xp(v_user_id, v_xp_earned);

    return json_build_object(
      'xp_earned', v_xp_earned,
      'is_first_visit', true,
      'title_unlocked', null,
      'last_visited_at', null,
      'visit_count', 1,
      'weekly_time_spent', v_safe_minutes
    );
  end if;

  -- Repeat visit
  v_old_last_visited := v_existing.last_visited_at;
  v_needs_reset := v_existing.week_start_date < v_week_start;
  v_prev_weekly := case when v_needs_reset then 0 else v_existing.weekly_time_spent end;

  if v_needs_reset then
    v_safe_minutes := least(greatest(0, p_minutes_spent), v_max_minutes);
  else
    v_elapsed_min := extract(epoch from (v_now - v_existing.last_visited_at)) / 60.0;
    v_safe_delta := least(
      greatest(0, p_minutes_spent - v_prev_weekly),
      v_max_minutes,
      ceil(v_elapsed_min)::integer + v_tolerance
    );
    v_safe_minutes := v_prev_weekly + v_safe_delta;
  end if;

  v_new_visit_count := v_existing.visit_count + 1;
  v_new_titles := coalesce(v_existing.titles_earned, '{}');

  if v_new_visit_count >= 7 and not (v_junior = any(v_new_titles)) then
    v_new_titles := v_new_titles || v_junior;
    v_title_unlocked := v_junior;
  end if;
  if v_new_visit_count >= 30 and not (v_senior = any(v_new_titles)) then
    v_new_titles := v_new_titles || v_senior;
    v_title_unlocked := v_senior;
  end if;

  -- Optimistic lock: only update if last_visited_at hasn't changed
  update public.explorations
  set visit_count       = v_new_visit_count,
      total_time_spent  = v_existing.total_time_spent + greatest(0, v_safe_minutes - v_prev_weekly),
      weekly_time_spent = v_safe_minutes,
      week_start_date   = v_week_start,
      titles_earned     = v_new_titles,
      last_visited_at   = v_now
  where id = v_existing.id
    and last_visited_at = v_old_last_visited;

  if not found then return null; end if;  -- concurrent update lost the lock

  return json_build_object(
    'xp_earned', 0,
    'is_first_visit', false,
    'title_unlocked', v_title_unlocked,
    'last_visited_at', v_old_last_visited,
    'visit_count', v_new_visit_count,
    'weekly_time_spent', v_safe_minutes
  );
end;
$$;

grant execute on function public.discover_landmark(uuid, double precision, double precision, integer) to authenticated;
