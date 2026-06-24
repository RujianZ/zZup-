-- =============================================================================
-- 27_conversations.sql  (v3 重构 · 统一会话核心)
--
-- A 方案:conversations + conversation_members + messages 一套管道,
--   kind ∈ zzuper_talk / group / dm / petchat / driftbottle
--   身份是「成员」属性(member_identity),不是独立实体。
--   四个私聊窗口 = 4 行 kind='dm',靠 dm_key(规范化身份对)唯一区分。
--   Pet Chat / 漂流瓶 = kind='petchat'/'driftbottle',临时 3h,原地升级。
--
-- 匿名(本期 A 方案,见 docs/DEFERRED.md #10):库内照存真实 account_id;
--   直查 messages/members 会看到对方 account_id,去标识化由读取 RPC / API 层负责。
-- =============================================================================

drop trigger if exists on_owner_delete on public.profiles;
drop function if exists public.reassign_group_owner();
drop function if exists public.leave_group(uuid);
drop function if exists public.transfer_group_ownership(uuid, uuid);
drop function if exists public.update_members_count() cascade;
drop function if exists public.set_temp_conversation_expiry() cascade;
drop function if exists public.get_or_create_zzuper_talk();
drop function if exists public.create_dm(uuid, text, text);
drop function if exists public.create_group(text, text, text, uuid[]);
drop function if exists public.join_group(uuid);
drop table if exists public.messages cascade;
drop table if exists public.conversation_members cascade;
drop table if exists public.conversations cascade;
drop table if exists public.groups cascade;        -- 旧表清理
drop table if exists public.group_members cascade;  -- 旧表清理

-- =============================================================================
-- conversations
-- =============================================================================
create table public.conversations (
  id            uuid default gen_random_uuid() primary key,
  kind          text not null check (kind in ('zzuper_talk','group','dm','petchat','driftbottle')),
  -- 群聊专用
  name          text,
  description   text,
  avatar_url    text,
  group_type    text check (group_type in ('official','edu_verified','open')),
  university    text,
  is_searchable boolean default false,
  members_count integer default 0,
  -- 四窗口去重键(仅 kind='dm';规范化 "account:identity" 排序拼接)
  dm_key        text,
  -- 临时会话生命周期(petchat / driftbottle)
  is_temporary  boolean not null default false,
  expires_at    timestamptz,
  status        text not null default 'active' check (status in ('active','expired','upgraded')),
  created_by    uuid references public.profiles(id) on delete set null,
  created_at    timestamptz default now()
);

-- dm 四窗口唯一:一对(账号+身份)组合只有一个 dm 窗口
create unique index conversations_dm_key_unique
  on public.conversations (dm_key) where kind = 'dm';
-- zzuper_talk 每人唯一
create unique index conversations_zzuper_unique
  on public.conversations (created_by) where kind = 'zzuper_talk';

alter table public.conversations enable row level security;

-- =============================================================================
-- conversation_members
-- =============================================================================
create table public.conversation_members (
  id              uuid default gen_random_uuid() primary key,
  conversation_id uuid references public.conversations(id) on delete cascade not null,
  account_id      uuid references public.profiles(id) on delete cascade not null,
  member_identity text not null default 'real' check (member_identity in ('real','pet')),
  role            text default 'member' check (role in ('admin','member')),
  joined_at       timestamptz default now(),
  unique (conversation_id, account_id)
);
create index conversation_members_account_idx on public.conversation_members(account_id);

alter table public.conversation_members enable row level security;

-- =============================================================================
-- messages
-- =============================================================================
create table public.messages (
  id              uuid default gen_random_uuid() primary key,
  conversation_id uuid references public.conversations(id) on delete cascade not null,
  sender_id       uuid references public.profiles(id) on delete set null,
  identity_mode   text not null check (identity_mode in ('real','pet')),  -- 逐条头像渲染依据
  content         text not null,
  image_url       text,
  created_at      timestamptz default now(),
  edited_at       timestamptz
);
create index messages_conversation_created_idx
  on public.messages (conversation_id, created_at desc);

alter table public.messages enable row level security;

-- =============================================================================
-- 触发器:成员数维护
-- =============================================================================
create or replace function public.update_members_count()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if TG_OP = 'INSERT' then
    update public.conversations set members_count = members_count + 1 where id = NEW.conversation_id;
  elsif TG_OP = 'DELETE' then
    update public.conversations set members_count = greatest(0, members_count - 1) where id = OLD.conversation_id;
  end if;
  return null;
end; $$;
create trigger on_member_insert after insert on public.conversation_members
  for each row execute function public.update_members_count();
create trigger on_member_delete after delete on public.conversation_members
  for each row execute function public.update_members_count();

-- =============================================================================
-- 触发器:临时会话「首条消息触发 3h 窗口」
-- =============================================================================
create or replace function public.set_temp_conversation_expiry()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  update public.conversations
  set expires_at = NEW.created_at + interval '3 hours'
  where id = NEW.conversation_id and is_temporary = true and expires_at is null;
  return null;
end; $$;
create trigger on_message_set_expiry after insert on public.messages
  for each row execute function public.set_temp_conversation_expiry();

-- =============================================================================
-- RLS
-- =============================================================================
-- conversations:成员可见;群聊在可搜索条件下对外可见
create policy "view conversations" on public.conversations for select using (
  auth.uid() is not null and (
    exists (select 1 from public.conversation_members m
            where m.conversation_id = conversations.id and m.account_id = auth.uid())
    or (kind = 'group' and is_searchable and members_count >= 3 and (
         group_type in ('open','official')
         or (group_type = 'edu_verified'
             and university = (select university from public.profiles where id = auth.uid()))))
  )
);
create policy "creator update conversation" on public.conversations for update
  using (auth.uid() = created_by);
create policy "creator delete conversation" on public.conversations for delete
  using (auth.uid() = created_by);

-- conversation_members:同会话成员可见(注:会暴露 account_id,匿名由读取 RPC 处理)
create policy "view members of my conversations" on public.conversation_members for select using (
  exists (select 1 from public.conversation_members m2
          where m2.conversation_id = conversation_members.conversation_id
            and m2.account_id = auth.uid())
);

-- messages:成员可读可发;仅可编辑自己的
create policy "members view messages" on public.messages for select using (
  exists (select 1 from public.conversation_members m
          where m.conversation_id = messages.conversation_id and m.account_id = auth.uid())
);
create policy "members send messages" on public.messages for insert with check (
  auth.uid() = sender_id
  and exists (select 1 from public.conversation_members m
              where m.conversation_id = messages.conversation_id and m.account_id = auth.uid())
);
create policy "edit own message" on public.messages for update using (auth.uid() = sender_id);

-- =============================================================================
-- 列级权限(写入主要走下面的 SECURITY DEFINER RPC)
-- =============================================================================
revoke all on public.conversations from authenticated, anon;
grant select on public.conversations to authenticated;
grant update (name, description, avatar_url, is_searchable) on public.conversations to authenticated;
grant delete on public.conversations to authenticated;

revoke all on public.conversation_members from authenticated, anon;
grant select on public.conversation_members to authenticated;

revoke all on public.messages from authenticated, anon;
grant select, insert on public.messages to authenticated;
grant update (content, edited_at) on public.messages to authenticated;

-- =============================================================================
-- RPC: get_or_create_zzuper_talk() — 固定宠物会话(一人一个)
-- =============================================================================
create or replace function public.get_or_create_zzuper_talk()
returns uuid language plpgsql security definer set search_path = public as $$
declare v_uid uuid := auth.uid(); v_id uuid;
begin
  if v_uid is null then raise exception 'Not authenticated'; end if;
  select id into v_id from public.conversations where kind='zzuper_talk' and created_by=v_uid;
  if v_id is not null then return v_id; end if;
  insert into public.conversations (kind, created_by) values ('zzuper_talk', v_uid) returning id into v_id;
  insert into public.conversation_members (conversation_id, account_id, member_identity, role)
  values (v_id, v_uid, 'real', 'admin');
  return v_id;
end; $$;
grant execute on function public.get_or_create_zzuper_talk() to authenticated;

-- =============================================================================
-- RPC: create_dm(target, my_identity, target_identity) — 发起/复用私聊窗口
--   my_identity = 我自选;target_identity = 对方呈现的身份
-- =============================================================================
create or replace function public.create_dm(p_target_id uuid, p_my_identity text, p_target_identity text)
returns uuid language plpgsql security definer set search_path = public as $$
declare v_uid uuid := auth.uid(); v_a text; v_b text; v_key text; v_id uuid;
begin
  if v_uid is null then raise exception 'Not authenticated'; end if;
  if p_target_id = v_uid then raise exception 'Cannot DM yourself'; end if;
  if p_my_identity not in ('real','pet') or p_target_identity not in ('real','pet')
    then raise exception 'Invalid identity type'; end if;

  -- 身份级拉黑(双向)
  if exists (select 1 from public.blocked_users
             where blocker_id=v_uid and blocked_id=p_target_id and blocked_identity_type=p_target_identity)
     or exists (select 1 from public.blocked_users
             where blocker_id=p_target_id and blocked_id=v_uid and blocked_identity_type=p_my_identity)
    then raise exception 'Cannot start conversation'; end if;

  v_a := v_uid::text || ':' || p_my_identity;
  v_b := p_target_id::text || ':' || p_target_identity;
  v_key := case when v_a < v_b then v_a || '|' || v_b else v_b || '|' || v_a end;

  select id into v_id from public.conversations where kind='dm' and dm_key=v_key;
  if v_id is not null then return v_id; end if;

  begin
    insert into public.conversations (kind, dm_key, created_by) values ('dm', v_key, v_uid)
      returning id into v_id;
    insert into public.conversation_members (conversation_id, account_id, member_identity)
    values (v_id, v_uid, p_my_identity), (v_id, p_target_id, p_target_identity);
  exception when unique_violation then
    select id into v_id from public.conversations where kind='dm' and dm_key=v_key;
  end;
  return v_id;
end; $$;
grant execute on function public.create_dm(uuid, text, text) to authenticated;

-- =============================================================================
-- RPC: create_group(name, group_type, university, member_ids[]) — 仅从好友建群·≥3 人
-- =============================================================================
create or replace function public.create_group(p_name text, p_group_type text, p_university text, p_member_ids uuid[])
returns uuid language plpgsql security definer set search_path = public as $$
declare v_uid uuid := auth.uid(); v_id uuid; v_member uuid; v_count int;
begin
  if v_uid is null then raise exception 'Not authenticated'; end if;
  if p_group_type not in ('official','edu_verified','open') then raise exception 'Invalid group type'; end if;

  foreach v_member in array p_member_ids loop
    if v_member = v_uid then continue; end if;
    if not exists (select 1 from public.friendships where status='accepted'
        and least(requester_id,addressee_id)=least(v_uid,v_member)
        and greatest(requester_id,addressee_id)=greatest(v_uid,v_member))
      then raise exception 'Group members must be friends'; end if;
  end loop;

  select count(distinct m) into v_count from unnest(p_member_ids || v_uid) as m;
  if v_count < 3 then raise exception 'A group needs at least 3 members'; end if;

  insert into public.conversations (kind, name, group_type, university, is_searchable, created_by)
  values ('group', p_name, p_group_type, p_university, true, v_uid) returning id into v_id;

  insert into public.conversation_members (conversation_id, account_id, member_identity, role)
  values (v_id, v_uid, 'real', 'admin');
  insert into public.conversation_members (conversation_id, account_id, member_identity, role)
  select v_id, m, 'real', 'member' from unnest(p_member_ids) as m where m <> v_uid
  on conflict (conversation_id, account_id) do nothing;

  return v_id;
end; $$;
grant execute on function public.create_group(text, text, text, uuid[]) to authenticated;

-- =============================================================================
-- RPC: join_group(conversation_id) — 仅真人加入可搜索群
-- =============================================================================
create or replace function public.join_group(p_conversation_id uuid)
returns void language plpgsql security definer set search_path = public as $$
declare v_uid uuid := auth.uid(); v_kind text; v_searchable boolean;
begin
  if v_uid is null then raise exception 'Not authenticated'; end if;
  select kind, is_searchable into v_kind, v_searchable
  from public.conversations where id = p_conversation_id;
  if v_kind is null then raise exception 'Conversation not found'; end if;
  if v_kind <> 'group' then raise exception 'Can only join group chats'; end if;
  if not v_searchable then raise exception 'Group is not joinable'; end if;

  insert into public.conversation_members (conversation_id, account_id, member_identity, role)
  values (p_conversation_id, v_uid, 'real', 'member')
  on conflict (conversation_id, account_id) do nothing;
end; $$;
grant execute on function public.join_group(uuid) to authenticated;

-- =============================================================================
-- RPC: leave_group(conversation_id) — 退群;创建者退出则移交最早成员
-- =============================================================================
create or replace function public.leave_group(p_conversation_id uuid)
returns void language plpgsql security definer set search_path = public as $$
declare v_uid uuid := auth.uid(); v_was_creator boolean; v_next uuid;
begin
  if v_uid is null then raise exception 'Not authenticated'; end if;
  select (created_by = v_uid) into v_was_creator from public.conversations where id = p_conversation_id;
  if v_was_creator is null then return; end if;

  delete from public.conversation_members where conversation_id = p_conversation_id and account_id = v_uid;

  if v_was_creator then
    select account_id into v_next from public.conversation_members
    where conversation_id = p_conversation_id order by joined_at asc limit 1;
    if v_next is not null then
      update public.conversations set created_by = v_next where id = p_conversation_id;
    end if;
  end if;
end; $$;
grant execute on function public.leave_group(uuid) to authenticated;

-- =============================================================================
-- RPC: transfer_group_ownership(conversation_id, new_owner_id)
-- =============================================================================
create or replace function public.transfer_group_ownership(p_conversation_id uuid, p_new_owner_id uuid)
returns void language plpgsql security definer set search_path = public as $$
declare v_uid uuid := auth.uid();
begin
  if v_uid is null then raise exception 'Not authenticated'; end if;
  if not exists (select 1 from public.conversations where id=p_conversation_id and created_by=v_uid)
    then raise exception 'Not permitted'; end if;
  if not exists (select 1 from public.conversation_members
                 where conversation_id=p_conversation_id and account_id=p_new_owner_id)
    then raise exception 'New owner must be a group member'; end if;
  update public.conversations set created_by = p_new_owner_id where id = p_conversation_id;
end; $$;
grant execute on function public.transfer_group_ownership(uuid, uuid) to authenticated;

-- =============================================================================
-- list_conversations() — 当前用户的会话列表
--   - group:群名/群头像;zzuper_talk:自己宠物;dm/petchat/driftbottle:对方(按其 member_identity)
--   - 带末条消息预览;按最近活动排序
--   - 懒过滤:已过期且未升级的临时窗口不返回
--   - 匿名:本期 A 方案(返回 peer_id),见 docs/DEFERRED.md #10
-- =============================================================================
create or replace function public.list_conversations()
returns table (
  conversation_id uuid,
  kind            text,
  is_temporary    boolean,
  expires_at      timestamptz,
  status          text,
  my_identity     text,
  peer_id         uuid,
  display_name    text,
  display_avatar  text,
  members_count   integer,
  last_message    text,
  last_message_at timestamptz)
language sql security definer set search_path = public as $$
  with my_convs as (
    select cm.conversation_id, cm.member_identity as my_identity
    from public.conversation_members cm
    where cm.account_id = auth.uid()
  ),
  peer as (
    select cm.conversation_id, cm.account_id as peer_id, cm.member_identity as peer_identity
    from public.conversation_members cm
    join public.conversations c2 on c2.id = cm.conversation_id
    where cm.account_id <> auth.uid()
      and c2.kind in ('dm','petchat','driftbottle')
  ),
  last_msg as (
    select distinct on (m.conversation_id) m.conversation_id, m.content, m.created_at
    from public.messages m
    order by m.conversation_id, m.created_at desc
  )
  select
    c.id, c.kind, c.is_temporary, c.expires_at, c.status,
    mc.my_identity,
    pe.peer_id,
    case
      when c.kind='group'       then c.name
      when c.kind='zzuper_talk' then me.pet_name
      when pe.peer_identity='pet' then pp.pet_name
      else pp.real_name
    end,
    case
      when c.kind='group'       then c.avatar_url
      when c.kind='zzuper_talk' then me.pet_avatar_url
      when pe.peer_identity='pet' then pp.pet_avatar_url
      else pp.avatar_url
    end,
    c.members_count,
    lm.content, lm.created_at
  from my_convs mc
  join public.conversations c   on c.id = mc.conversation_id
  left join peer pe             on pe.conversation_id = c.id
  left join public.profiles pp  on pp.id = pe.peer_id
  left join public.profiles me  on me.id = auth.uid()
  left join last_msg lm         on lm.conversation_id = c.id
  where not (c.is_temporary and c.expires_at is not null and c.expires_at < now())
  order by coalesce(lm.created_at, c.created_at) desc;
$$;
grant execute on function public.list_conversations() to authenticated;
