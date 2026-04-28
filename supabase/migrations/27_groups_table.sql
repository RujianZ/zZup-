-- =============================================================================
-- 27_groups_table.sql (rewritten 2026-04-17)
--
-- Changes from original:
--   - messages: column-level UPDATE limited to (content, edited_at)
--     (prevents editing identity_mode / group_id of existing messages)
--   - groups: column-level UPDATE limited to (name, description,
--     avatar_url, is_searchable) — prevents tampering with members_count,
--     chat_type, group_type, created_by
--   - NEW RPC leave_group(group_id) — atomic leave + auto-transfer if creator
--     (fixes silent RLS failure in groups.ts leaveGroup)
--   - NEW RPC transfer_group_ownership(group_id, new_owner_id) — explicit
--     transfer to a chosen member
--   - Index group_members(user_id), messages(group_id, created_at desc)
--
-- NOT changed (per product decision):
--   - groups.created_by / messages.user_id FKs stay ON DELETE SET NULL
--     (audit / content preservation per soft-delete philosophy)
--   - group_members FKs stay ON DELETE CASCADE (operational, no audit)
--   - No DELETE policy on messages (retention for moderation)
--   - messages SELECT does NOT filter blocked users — blocking only hides
--     DMs; group chat messages from blocked users remain visible (by design)
-- =============================================================================

-- Cleanup
drop trigger if exists on_owner_delete on profiles;
drop function if exists public.reassign_group_owner();
drop function if exists public.leave_group(uuid);
drop function if exists public.transfer_group_ownership(uuid, uuid);
drop trigger if exists on_group_member_insert on group_members;
drop trigger if exists on_group_member_delete on group_members;
drop function if exists public.update_members_count();
drop table if exists public.messages cascade;
drop table if exists public.group_members cascade;
drop table if exists public.groups cascade;
drop table if exists public.group_chats cascade;

-- =============================================================================
-- groups
-- =============================================================================

create table public.groups (
  id uuid default gen_random_uuid() primary key,
  name text not null,
  description text,
  avatar_url text,
  chat_type text not null default 'group' check (chat_type in ('group', 'direct')),
  group_type text not null check (group_type in ('official', 'edu_verified', 'open', 'direct')),
  university text,
  is_searchable boolean default true,
  created_by uuid references public.profiles(id) on delete set null,
  members_count integer default 0,
  created_at timestamptz default now()
);

alter table public.groups enable row level security;

create policy "Authenticated users can create group"
  on public.groups for insert with check (auth.uid() = created_by);

create policy "Creator can update group"
  on public.groups for update using (auth.uid() = created_by);

create policy "Creator can delete group"
  on public.groups for delete using (auth.uid() = created_by);

-- =============================================================================
-- reassign_group_owner trigger (fires when a profile is hard-deleted)
-- =============================================================================

create or replace function public.reassign_group_owner()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.groups
  set created_by = (
    select user_id from public.group_members
    where group_id = groups.id
      and user_id != old.id
    order by joined_at asc
    limit 1
  )
  where created_by = old.id;
  return old;
end;
$$;

create trigger on_owner_delete
  before delete on public.profiles
  for each row execute function public.reassign_group_owner();

-- =============================================================================
-- group_members
-- =============================================================================

create table public.group_members (
  id uuid default gen_random_uuid() primary key,
  group_id uuid references public.groups(id) on delete cascade not null,
  user_id uuid references public.profiles(id) on delete cascade not null,
  role text default 'member' check (role in ('admin', 'member')),
  joined_at timestamptz default now(),
  unique(group_id, user_id)
);

create index group_members_user_id_idx on public.group_members(user_id);

alter table public.group_members enable row level security;

create policy "Members can view group members"
  on public.group_members for select using (
    auth.uid() is not null
    and exists (
      select 1 from public.group_members gm
      where gm.group_id = group_members.group_id
        and gm.user_id = auth.uid()
    )
  );

create policy "Users can join group"
  on public.group_members for insert with check (auth.uid() = user_id);

create policy "Users can leave group"
  on public.group_members for delete using (auth.uid() = user_id);

create policy "Group creator can remove members"
  on public.group_members for delete
  using (
    auth.uid() = (select created_by from public.groups where id = group_id)
    and auth.uid() != user_id
  );

-- =============================================================================
-- groups SELECT policy (depends on group_members existing)
-- =============================================================================

create policy "Logged in users can view groups"
  on public.groups for select using (
    auth.uid() is not null
    and (
      exists (
        select 1 from public.group_members
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
              select university from public.profiles where id = auth.uid()
            )
          )
        )
      )
    )
  );

-- =============================================================================
-- messages
-- =============================================================================

create table public.messages (
  id uuid default gen_random_uuid() primary key,
  group_id uuid references public.groups(id) on delete cascade not null,
  user_id uuid references public.profiles(id) on delete set null,
  identity_mode text not null check (identity_mode in ('real', 'pet')),
  content text not null,
  image_url text,
  created_at timestamptz default now(),
  edited_at timestamptz
);

create index messages_group_id_created_at_idx
  on public.messages(group_id, created_at desc);

alter table public.messages enable row level security;

-- SELECT: must be group member. Bidirectional blocks NOT filtered here —
-- blocking only hides DMs; group chat content remains visible (by design).
create policy "Group members can view messages"
  on public.messages for select using (
    auth.uid() is not null
    and exists (
      select 1 from public.group_members
      where group_members.group_id = messages.group_id
        and group_members.user_id = auth.uid()
    )
  );

create policy "Group members can send messages"
  on public.messages for insert with check (
    auth.uid() = user_id
    and exists (
      select 1 from public.group_members
      where group_members.group_id = messages.group_id
        and group_members.user_id = auth.uid()
    )
  );

create policy "Users can edit own message"
  on public.messages for update using (auth.uid() = user_id);

-- (intentionally no DELETE policy — message retention for moderation)

-- =============================================================================
-- members_count triggers
-- =============================================================================

create or replace function public.update_members_count()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if TG_OP = 'INSERT' then
    update public.groups set members_count = members_count + 1 where id = NEW.group_id;
  elsif TG_OP = 'DELETE' then
    update public.groups set members_count = greatest(0, members_count - 1) where id = OLD.group_id;
  end if;
  return null;
end;
$$;

create trigger on_group_member_insert
  after insert on public.group_members
  for each row execute function public.update_members_count();

create trigger on_group_member_delete
  after delete on public.group_members
  for each row execute function public.update_members_count();

-- =============================================================================
-- Column-level privileges
-- =============================================================================

revoke all on public.groups from authenticated;
revoke all on public.groups from anon;
grant select, insert, delete on public.groups to authenticated;
grant update (name, description, avatar_url, is_searchable)
  on public.groups to authenticated;

revoke all on public.group_members from authenticated;
revoke all on public.group_members from anon;
grant select, insert, delete on public.group_members to authenticated;

revoke all on public.messages from authenticated;
revoke all on public.messages from anon;
grant select, insert on public.messages to authenticated;
grant update (content, edited_at) on public.messages to authenticated;

-- =============================================================================
-- RPC: leave_group(group_id)
-- Atomic: removes user from members + auto-transfers ownership to oldest
-- remaining member if user was creator. Replaces JS leaveGroup logic which
-- previously failed silently due to RLS WITH CHECK on the transfer UPDATE.
-- =============================================================================

create or replace function public.leave_group(p_group_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid;
  v_was_creator boolean;
  v_next_owner uuid;
begin
  v_user_id := auth.uid();
  if v_user_id is null then
    raise exception 'Not authenticated';
  end if;

  select (created_by = v_user_id) into v_was_creator
  from public.groups
  where id = p_group_id;

  if v_was_creator is null then
    return;  -- group doesn't exist
  end if;

  delete from public.group_members
  where group_id = p_group_id and user_id = v_user_id;

  if v_was_creator then
    select user_id into v_next_owner
    from public.group_members
    where group_id = p_group_id
    order by joined_at asc
    limit 1;

    update public.groups
    set created_by = v_next_owner
    where id = p_group_id;
  end if;
end;
$$;

grant execute on function public.leave_group(uuid) to authenticated;

-- =============================================================================
-- RPC: transfer_group_ownership(group_id, new_owner_id)
-- Explicit transfer of ownership by current creator to another member.
-- New owner must be an existing member of the group.
-- =============================================================================

create or replace function public.transfer_group_ownership(
  p_group_id uuid,
  p_new_owner_id uuid
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid;
  v_current_creator uuid;
begin
  v_user_id := auth.uid();
  if v_user_id is null then
    raise exception 'Not authenticated';
  end if;

  select created_by into v_current_creator
  from public.groups
  where id = p_group_id;

  if v_current_creator is null then
    raise exception 'Group not found';
  end if;

  if v_current_creator != v_user_id then
    raise exception 'Only the current group creator can transfer ownership';
  end if;

  if p_new_owner_id = v_user_id then
    raise exception 'Cannot transfer ownership to yourself';
  end if;

  if not exists (
    select 1 from public.group_members
    where group_id = p_group_id and user_id = p_new_owner_id
  ) then
    raise exception 'New owner must be a member of the group';
  end if;

  update public.groups
  set created_by = p_new_owner_id
  where id = p_group_id;
end;
$$;

grant execute on function public.transfer_group_ownership(uuid, uuid) to authenticated;
