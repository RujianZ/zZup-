drop table if exists public.explorations;
create table public.explorations (
  id uuid default gen_random_uuid() primary key,
  user_id uuid references public.profiles(id) on delete cascade not null,
  landmark_id uuid references public.landmarks(id) on delete cascade not null,
  visit_count integer default 1,
  total_time_spent integer default 0,
  weekly_time_spent integer default 0,
  week_start_date date default date_trunc('week', current_date)::date,
  titles_earned text[] default '{}',
  active_title text,
  first_visited_at timestamptz default now(),
  last_visited_at timestamptz default now(),
  unique(user_id, landmark_id)
);
alter table public.explorations enable row level security;
create policy "owner_can_read"
  on public.explorations for select
  using (auth.uid() = user_id);
create policy "owner_can_insert"
  on public.explorations for insert
  with check (auth.uid() = user_id);
create policy "owner_can_update"
  on public.explorations for update
  using (auth.uid() = user_id);
