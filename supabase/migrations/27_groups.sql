-- =============================================
-- 27_groups.sql
-- 群组、群成员、消息表
-- =============================================

-- groups 表
create table public.groups (
  id uuid default gen_random_uuid() primary key,
  name text not null,
  chat_type text not null check (chat_type in ('group', 'direct')),
  group_type text not null check (group_type in ('official', 'edu_verified', 'open', 'direct')),
  university text,
  is_searchable boolean default true,
  members_count integer default 0,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz default now()
);

-- 私聊不可被搜索
create or replace function set_direct_not_searchable()
returns trigger as $$
begin
  if new.chat_type = 'direct' then
    new.is_searchable = false;
  end if;
  return new;
end;
$$ language plpgsql;

create trigger enforce_direct_not_searchable
  before insert or update on public.groups
  for each row execute procedure set_direct_not_searchable();

-- 群主注销后第二个加入的成员自动接任（在 group_members 触发器里实现）

-- RLS
alter table public.groups enable row level security;

create policy "群成员可查看群信息"
  on public.groups for select
  using (
    auth.uid() in (
      select user_id from public.group_members where group_id = id
    )
    or is_searchable = true
  );

create policy "登录用户可创建群"
  on public.groups for insert
  with check (auth.uid() = created_by);

create policy "群管理员可更新群信息"
  on public.groups for update
  using (
    auth.uid() in (
      select user_id from public.group_members
      where group_id = id and role = 'admin'
    )
  );

-- =============================================
-- group_members 表
-- =============================================

create table public.group_members (
  id uuid default gen_random_uuid() primary key,
  group_id uuid references public.groups(id) on delete cascade not null,
  user_id uuid references public.profiles(id) on delete set null,
  role text default 'member' check (role in ('admin', 'member')),
  joined_at timestamptz default now(),
  unique(group_id, user_id)
);

-- 群主注销后第二个加入的成员接任 admin
create or replace function transfer_admin_on_leave()
returns trigger as $$
begin
  if old.role = 'admin' then
    update public.group_members
    set role = 'admin'
    where group_id = old.group_id
      and user_id != old.user_id
      and user_id is not null
    order by joined_at asc
    limit 1;
  end if;
  return old;
end;
$$ language plpgsql;

create trigger on_admin_leave
  after delete on public.group_members
  for each row execute procedure transfer_admin_on_leave();

-- RLS
alter table public.group_members enable row level security;

create policy "群成员可查看群成员列表"
  on public.group_members for select
  using (
    auth.uid() in (
      select user_id from public.group_members gm where gm.group_id = group_id
    )
  );

create policy "登录用户可加入群"
  on public.group_members for insert
  with check (auth.uid() = user_id);

create policy "本人可退出群"
  on public.group_members for delete
  using (auth.uid() = user_id);

-- =============================================
-- messages 表
-- =============================================

create table public.messages (
  id uuid default gen_random_uuid() primary key,
  group_id uuid references public.groups(id) on delete cascade not null,
  user_id uuid references public.profiles(id) on delete set null,
  identity_mode text default 'real' check (identity_mode in ('real', 'pet')),
  content text,
  image_url text,
  is_edited boolean default false,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- 消息允许编辑，不允许撤回（无 delete policy）
-- RLS
alter table public.messages enable row level security;

create policy "群成员可查看消息"
  on public.messages for select
  using (
    auth.uid() in (
      select user_id from public.group_members where group_id = messages.group_id
    )
  );

create policy "群成员可发送消息"
  on public.messages for insert
  with check (
    auth.uid() = user_id and
    auth.uid() in (
      select user_id from public.group_members where group_id = messages.group_id
    )
  );

create policy "本人可编辑自己的消息"
  on public.messages for update
  using (auth.uid() = user_id);
