-- =============================================================================
-- 41_landmarks.sql (rewritten 2026-04-17)
--
-- Changes from original:
--   - Composite index (latitude, longitude) for spatial range queries
--     used by cacheNearbyPlaces in location.ts
--
-- NOT changed:
--   - INSERT/SELECT policies stay open to authenticated users.
--     This is intentional for MVP — Module 10 will move landmark caching
--     to an Edge Function (service_role) to prevent shared-cache pollution.
--     See TD-9 / TD-1 / TD-6 in code review.
-- =============================================================================

drop table if exists public.landmarks cascade;

create table public.landmarks (
  id            uuid default gen_random_uuid() primary key,
  place_id      text not null unique,
  name          text not null,
  latitude      double precision not null,
  longitude     double precision not null,
  place_type    text check (place_type in ('library', 'gym', 'coffee_shop', 'dining', 'other')),
  radius_meters integer default 50,
  cached_at     timestamptz default now(),
  expires_at    timestamptz default (now() + interval '30 days')
);

-- Spatial range index for cacheNearbyPlaces (lat/lng BETWEEN queries)
create index landmarks_lat_lng_idx
  on public.landmarks(latitude, longitude);

alter table public.landmarks enable row level security;

create policy "authenticated_users_can_read"
  on public.landmarks for select
  using (auth.uid() is not null);

create policy "authenticated_users_can_insert"
  on public.landmarks for insert
  with check (auth.uid() is not null);

-- Defense-in-depth: revoke unused table-level UPDATE / DELETE
revoke all on public.landmarks from authenticated;
revoke all on public.landmarks from anon;
grant select, insert on public.landmarks to authenticated;
