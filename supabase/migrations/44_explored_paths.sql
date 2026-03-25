drop table if exists public.explored_tiles;
drop table if exists public.explored_paths;
create table public.explored_paths (
  id uuid default gen_random_uuid() primary key,
  user_id uuid references public.profiles(id) on delete cascade not null,
  coordinates jsonb not null,
  recorded_at timestamptz default now()
);
-- RLS
alter table public.explored_paths enable row level security;
create policy "owner_can_read"
  on public.explored_paths for select
  using (auth.uid() = user_id);
create policy "owner_can_insert"
  on public.explored_paths for insert
  with check (auth.uid() = user_id);
create policy "owner_can_delete"
  on public.explored_paths for delete
  using (auth.uid() = user_id);
