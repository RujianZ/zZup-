-- =============================================
-- 26_friendships.sql
-- 好友关系表
-- =============================================

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

create policy "双方可查看好友关系"
  on public.friendships for select
  using (auth.uid() = requester_id or auth.uid() = addressee_id);

create policy "发起人可创建好友请求"
  on public.friendships for insert
  with check (auth.uid() = requester_id);

create policy "双方可更新好友关系"
  on public.friendships for update
  using (auth.uid() = requester_id or auth.uid() = addressee_id);

create policy "双方可删除好友关系"
  on public.friendships for delete
  using (auth.uid() = requester_id or auth.uid() = addressee_id);
