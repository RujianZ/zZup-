drop table if exists public.landmark_cache_zones;
create table public.landmark_cache_zones (
  id         uuid default gen_random_uuid() primary key,
  latitude   double precision not null,
  longitude  double precision not null,
  cached_at  timestamptz default now(),
  expires_at timestamptz default (now() + interval '30 days'),
  unique(latitude, longitude)
);
alter table public.landmark_cache_zones enable row level security;
create policy "authenticated_can_read"
  on public.landmark_cache_zones for select
  using (auth.uid() is not null);
create policy "authenticated_can_insert"
  on public.landmark_cache_zones for insert
  with check (auth.uid() is not null);
create policy "authenticated_can_update"
  on public.landmark_cache_zones for update
  using (auth.uid() is not null);
