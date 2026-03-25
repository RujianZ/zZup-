drop table if exists public.landmarks cascade;
create table public.landmarks (
  id uuid default gen_random_uuid() primary key,
  place_id text not null unique,
  name text not null,
  latitude double precision not null,
  longitude double precision not null,
  place_type text,
  radius_meters integer default 50,
  cached_at timestamptz default now(),
  expires_at timestamptz default (now() + interval '30 days')
);
-- RLS
alter table public.landmarks enable row level security;
create policy "authenticated_users_can_read"
  on public.landmarks for select
  using (auth.uid() is not null);
create policy "authenticated_users_can_insert"
  on public.landmarks for insert
  with check (auth.uid() is not null);
create policy "authenticated_users_can_update"
  on public.landmarks for update
  using (auth.uid() is not null);
