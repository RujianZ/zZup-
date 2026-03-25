-- 清理
drop trigger if exists on_owner_delete on profiles;
drop function if exists reassign_group_owner();
drop table if exists messages cascade;
drop table if exists group_members cascade;
drop table if exists groups cascade;
drop table if exists public.group_chats cascade;
-- ==================== groups ====================
create table groups (
  id uuid default gen_random_uuid() primary key,
  name text not null,
  description text,
  avatar_url text,
  chat_type text not null default 'group' check (chat_type in ('group', 'direct')),
  group_type text not null check (group_type in ('official', 'edu_verified', 'open', 'direct')),
  university text,
  is_searchable boolean default true,
  created_by uuid references profiles(id) on delete set null,
  members_count integer default 0,
  created_at timestamptz default now()
);
alter table groups enable row level security;
create policy "Authenticated users can create group"
  on groups for insert with check (auth.uid() = created_by);
create policy "Creator can update group"
  on groups for update using (auth.uid() = created_by);
create policy "Creator can delete group"
  on groups for delete using (auth.uid() = created_by);
create or replace function reassign_group_owner()
returns trigger as $$
begin
  update groups
  set created_by = (
    select user_id from group_members
    where group_id = groups.id
      and user_id != old.id
    order by joined_at asc
    limit 1
  )
  where created_by = old.id;
  return old;
end;
$$ language plpgsql security definer;
create trigger on_owner_delete
  before delete on profiles
  for each row execute function reassign_group_owner();
-- ==================== group_members ====================
create table group_members (
  id uuid default gen_random_uuid() primary key,
  group_id uuid references groups(id) on delete cascade not null,
  user_id uuid references profiles(id) on delete cascade not null,
  role text default 'member' check (role in ('admin', 'member')),
  joined_at timestamptz default now(),
  unique(group_id, user_id)
);
alter table group_members enable row level security;
create policy "Members can view group members"
  on group_members for select using (
    auth.uid() is not null
    and exists (
      select 1 from group_members gm
      where gm.group_id = group_members.group_id
        and gm.user_id = auth.uid()
    )
  );
create policy "Users can join group"
  on group_members for insert with check (auth.uid() = user_id);
create policy "Users can leave group"
  on group_members for delete using (auth.uid() = user_id);
-- ==================== groups select policy ====================
create policy "Logged in users can view groups"
  on groups for select using (
    auth.uid() is not null
    and (
      exists (
        select 1 from group_members
        where group_members.group_id = groups.id
          and group_members.user_id = auth.uid()
      )
      or (
        chat_type = 'group'
        and members_count >= 3
        and is_searchable = true
        and (
          group_type = 'open'
          or group_type = 'official'
          or (
            group_type = 'edu_verified'
            and university = (
              select university from profiles where id = auth.uid()
            )
          )
        )
      )
    )
  );
-- ==================== messages ====================
create table messages (
  id uuid default gen_random_uuid() primary key,
  group_id uuid references groups(id) on delete cascade not null,
  user_id uuid references profiles(id) on delete set null,
  identity_mode text not null check (identity_mode in ('real', 'pet')),
  content text not null,
  image_url text,
  created_at timestamptz default now(),
  edited_at timestamptz
);
alter table messages enable row level security;
create policy "Group members can view messages"
  on messages for select using (
    auth.uid() is not null
    and exists (
      select 1 from group_members
      where group_members.group_id = messages.group_id
        and group_members.user_id = auth.uid()
    )
  );
create policy "Group members can send messages"
  on messages for insert with check (
    auth.uid() = user_id
    and exists (
      select 1 from group_members
      where group_members.group_id = messages.group_id
        and group_members.user_id = auth.uid()
    )
  );
create policy "Users can edit own message"
  on messages for update using (auth.uid() = user_id);
