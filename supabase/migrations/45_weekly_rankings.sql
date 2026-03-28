create or replace function public.get_weekly_rankings(p_university text)
returns table (
  place_type      text,
  user_id         uuid,
  display_name    text,
  avatar_url      text,
  pet_avatar_url  text,
  identity_mode   text,
  weekly_time_spent bigint,
  active_title    text,
  rank            bigint
)
language plpgsql security definer
as $$
declare
  v_week_start date := date_trunc('week', (now() AT TIME ZONE 'America/Los_Angeles'))::date;
begin
  -- 只有同校且已验证的用户才能调用
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
      p.id                        as uid,
      p.real_name,
      p.avatar_url                as real_avatar_url,
      p.pet_name,
      p.pet_avatar_url,
      p.ranking_identity_mode,
      sum(e.weekly_time_spent)    as total_weekly,
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
      and lm.place_type in ('library', 'cafe', 'gym', 'dining')
    group by
      lm.place_type, p.id, p.real_name, p.avatar_url,
      p.pet_name, p.pet_avatar_url, p.ranking_identity_mode
  ),
  ranked as (
    select
      *,
      row_number() over (partition by place_type order by total_weekly desc) as rn
    from aggregated
  )
  select
    r.place_type,
    r.uid,
    case when r.ranking_identity_mode = 'pet' then r.pet_name
         else r.real_name end                                    as display_name,
    case when r.ranking_identity_mode = 'pet' then r.pet_avatar_url
         else r.real_avatar_url end                              as avatar_url,
    r.pet_avatar_url,
    r.ranking_identity_mode,
    r.total_weekly,
    r.active_title,
    r.rn
  from ranked r
  where r.rn <= 3
  order by r.place_type, r.total_weekly desc;
end;
$$;
