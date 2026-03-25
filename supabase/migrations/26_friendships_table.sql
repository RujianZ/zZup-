drop table if exists public.friendships cascade;
create table public.friendships (
  id uuid default gen_random_uuid() primary key,
  requester_id uuid references public.profiles(id) on delete set null,
  addressee_id uuid references public.profiles(id) on delete set null,
  status text default 'pending' check (status in ('pending', 'accepted', 'blocked')),
  created_at timestamptz default now(),
  unique(requester_id, addressee_id)
);
-- RLS
alter table public.friendships enable row level security;
create policy "users_can_view_own_friendships"
  on public.friendships for select
  using (auth.uid() = requester_id or auth.uid() = addressee_id);
create policy "requester_can_create_friendship"
  on public.friendships for insert
  with check (auth.uid() = requester_id);
create policy "both_can_update_friendship"
  on public.friendships for update
  using (auth.uid() = requester_id or auth.uid() = addressee_id);
create policy "both_can_delete_friendship"
  on public.friendships for delete
  using (auth.uid() = requester_id or auth.uid() = addressee_id);
