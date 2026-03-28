drop table if exists blocked_users cascade;
drop table if exists public.friendships cascade;

-- ==================== friendships ====================
create table public.friendships (
  id           uuid default gen_random_uuid() primary key,
  requester_id uuid references public.profiles(id) on delete set null,
  addressee_id uuid references public.profiles(id) on delete set null,
  status       text default 'pending' check (status in ('pending', 'accepted')),
  created_at   timestamptz default now(),
  unique(requester_id, addressee_id)
);

alter table public.friendships enable row level security;

create policy "users_can_view_own_friendships"
  on public.friendships for select
  using (auth.uid() = requester_id or auth.uid() = addressee_id);

create policy "requester_can_create_friendship"
  on public.friendships for insert
  with check (auth.uid() = requester_id);

create policy "addressee_can_update_friendship"
  on public.friendships for update
  using (auth.uid() = addressee_id);

create policy "both_can_delete_friendship"
  on public.friendships for delete
  using (auth.uid() = requester_id or auth.uid() = addressee_id);

-- ==================== blocked_users ====================
create table public.blocked_users (
  blocker_id uuid references public.profiles(id) on delete cascade not null,
  blocked_id uuid references public.profiles(id) on delete cascade not null,
  created_at timestamptz default now(),
  primary key (blocker_id, blocked_id)
);

alter table public.blocked_users enable row level security;

create policy "blocker_can_view_own_blocks"
  on public.blocked_users for select
  using (auth.uid() = blocker_id or auth.uid() = blocked_id);

create policy "blocker_can_insert"
  on public.blocked_users for insert
  with check (auth.uid() = blocker_id);

create policy "blocker_can_delete"
  on public.blocked_users for delete
  using (auth.uid() = blocker_id);
