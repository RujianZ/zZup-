-- =============================================================================
-- 26_friendships_table.sql  (v3 重构)
--
-- friendships:三态机 pending / rejected / accepted
--   - 每条请求独立一行;rejected = 该请求终结(不复用),历史留存
--   - 重发 = 新插一行 pending(反转通道)
--   - pending 锁:一对人同时最多 1 条 pending(分区唯一索引)
--   - accepted:一对人最多 1 条(分区唯一索引,双向)
--   - 仅真人↔真人(账号级);转换全走 SECURITY DEFINER RPC,客户端不裸写
-- blocked_users:身份级 (blocker, blocked, blocked_identity_type)
--   - 拉黑 real → 顺带删好友(pending+accepted);拉黑 pet → 不动好友
--   - SELECT 仅 blocker 可见(不向被拉黑方暴露);反查走 RPC
-- =============================================================================

drop function if exists public.send_friend_request(uuid, text);
drop function if exists public.respond_friend_request(uuid, boolean);
drop function if exists public.cancel_friend_request(uuid);
drop function if exists public.remove_friend(uuid);
drop function if exists public.block_identity(uuid, text);
drop function if exists public.unblock_identity(uuid, text);
drop table if exists public.blocked_users cascade;
drop table if exists public.friendships cascade;

-- ── friendships ──────────────────────────────────────────────
create table public.friendships (
  id           uuid default gen_random_uuid() primary key,
  requester_id uuid references public.profiles(id) on delete set null,
  addressee_id uuid references public.profiles(id) on delete set null,
  status       text not null default 'pending'
                 check (status in ('pending','rejected','accepted')),
  source       text check (source in ('search','qr','profile','zzup_id','petchat','driftbottle')),
  created_at   timestamptz default now(),
  responded_at timestamptz
);

-- pending 锁:一对人(无向)同时只能 1 条 pending
create unique index friendships_one_pending
  on public.friendships (least(requester_id, addressee_id), greatest(requester_id, addressee_id))
  where status = 'pending';

-- 好友唯一:一对人(无向)最多 1 条 accepted
create unique index friendships_one_accepted
  on public.friendships (least(requester_id, addressee_id), greatest(requester_id, addressee_id))
  where status = 'accepted';

create index friendships_addressee_status on public.friendships (addressee_id, status);
create index friendships_requester_status on public.friendships (requester_id, status);

alter table public.friendships enable row level security;

create policy "view own friendships"
  on public.friendships for select
  using (auth.uid() = requester_id or auth.uid() = addressee_id);

-- 写入全部走下面的 SECURITY DEFINER RPC;不开放裸 insert/update/delete
revoke all on public.friendships from authenticated;
revoke all on public.friendships from anon;
grant select on public.friendships to authenticated;

-- ── blocked_users(身份级)─────────────────────────────────────
create table public.blocked_users (
  blocker_id            uuid references public.profiles(id) on delete cascade not null,
  blocked_id            uuid references public.profiles(id) on delete cascade not null,
  blocked_identity_type text not null check (blocked_identity_type in ('real','pet')),
  created_at            timestamptz default now(),
  primary key (blocker_id, blocked_id, blocked_identity_type)
);

create index blocked_users_blocked_idx
  on public.blocked_users (blocked_id, blocked_identity_type);

alter table public.blocked_users enable row level security;

-- 仅 blocker 看得到自己的拉黑列表(不向被拉黑方暴露)
create policy "blocker can view own blocks"
  on public.blocked_users for select
  using (auth.uid() = blocker_id);

revoke all on public.blocked_users from authenticated;
revoke all on public.blocked_users from anon;
grant select on public.blocked_users to authenticated;

-- =============================================================================
-- RPC: send_friend_request(addressee, source)
-- =============================================================================
create or replace function public.send_friend_request(p_addressee_id uuid, p_source text default null)
returns void language plpgsql security definer set search_path = public as $$
declare v_uid uuid := auth.uid();
begin
  if v_uid is null then raise exception 'Not authenticated'; end if;
  if p_addressee_id = v_uid then raise exception 'Cannot add yourself'; end if;

  -- 真人级拉黑(双向任一)→ 不可发送
  if exists (
    select 1 from public.blocked_users
    where blocked_identity_type = 'real'
      and ((blocker_id = v_uid and blocked_id = p_addressee_id)
        or (blocker_id = p_addressee_id and blocked_id = v_uid))
  ) then raise exception 'Cannot send friend request'; end if;

  -- 已是好友
  if exists (
    select 1 from public.friendships
    where status = 'accepted'
      and least(requester_id, addressee_id)    = least(v_uid, p_addressee_id)
      and greatest(requester_id, addressee_id) = greatest(v_uid, p_addressee_id)
  ) then raise exception 'Already friends'; end if;

  -- 对方已向我发 pending → 去接受
  if exists (
    select 1 from public.friendships
    where status = 'pending' and requester_id = p_addressee_id and addressee_id = v_uid
  ) then raise exception 'This user already sent you a request; accept it instead'; end if;

  -- 我已有 pending(pending 锁)
  if exists (
    select 1 from public.friendships
    where status = 'pending' and requester_id = v_uid and addressee_id = p_addressee_id
  ) then raise exception 'A pending request already exists'; end if;

  insert into public.friendships (requester_id, addressee_id, status, source)
  values (v_uid, p_addressee_id, 'pending', p_source);
end;
$$;
grant execute on function public.send_friend_request(uuid, text) to authenticated;

-- =============================================================================
-- RPC: respond_friend_request(friendship_id, accept)  — addressee 接受/拒绝
-- =============================================================================
create or replace function public.respond_friend_request(p_friendship_id uuid, p_accept boolean)
returns void language plpgsql security definer set search_path = public as $$
declare v_uid uuid := auth.uid();
begin
  if v_uid is null then raise exception 'Not authenticated'; end if;

  update public.friendships
  set status = case when p_accept then 'accepted' else 'rejected' end,
      responded_at = now()
  where id = p_friendship_id and addressee_id = v_uid and status = 'pending';

  if not found then raise exception 'Request not found or not permitted'; end if;
end;
$$;
grant execute on function public.respond_friend_request(uuid, boolean) to authenticated;

-- =============================================================================
-- RPC: cancel_friend_request(friendship_id) — requester 撤回自己的 pending
-- =============================================================================
create or replace function public.cancel_friend_request(p_friendship_id uuid)
returns void language plpgsql security definer set search_path = public as $$
declare v_uid uuid := auth.uid();
begin
  if v_uid is null then raise exception 'Not authenticated'; end if;
  delete from public.friendships
  where id = p_friendship_id and requester_id = v_uid and status = 'pending';
  if not found then raise exception 'Request not found or not permitted'; end if;
end;
$$;
grant execute on function public.cancel_friend_request(uuid) to authenticated;

-- =============================================================================
-- RPC: remove_friend(friendship_id) — 双方均可解除好友
-- =============================================================================
create or replace function public.remove_friend(p_friendship_id uuid)
returns void language plpgsql security definer set search_path = public as $$
declare v_uid uuid := auth.uid();
begin
  if v_uid is null then raise exception 'Not authenticated'; end if;
  delete from public.friendships
  where id = p_friendship_id and status = 'accepted'
    and (requester_id = v_uid or addressee_id = v_uid);
  if not found then raise exception 'Friendship not found or not permitted'; end if;
end;
$$;
grant execute on function public.remove_friend(uuid) to authenticated;

-- =============================================================================
-- RPC: block_identity(blocked_id, identity_type)
--   拉黑 real → 顺带删两人好友(pending+accepted);拉黑 pet → 不动好友
-- =============================================================================
create or replace function public.block_identity(p_blocked_id uuid, p_identity_type text)
returns void language plpgsql security definer set search_path = public as $$
declare v_uid uuid := auth.uid();
begin
  if v_uid is null then raise exception 'Not authenticated'; end if;
  if p_blocked_id = v_uid then raise exception 'Cannot block yourself'; end if;
  if p_identity_type not in ('real','pet') then raise exception 'Invalid identity type'; end if;

  insert into public.blocked_users (blocker_id, blocked_id, blocked_identity_type)
  values (v_uid, p_blocked_id, p_identity_type)
  on conflict do nothing;

  if p_identity_type = 'real' then
    delete from public.friendships
    where status in ('pending','accepted')
      and least(requester_id, addressee_id)    = least(v_uid, p_blocked_id)
      and greatest(requester_id, addressee_id) = greatest(v_uid, p_blocked_id);
  end if;
end;
$$;
grant execute on function public.block_identity(uuid, text) to authenticated;

-- =============================================================================
-- RPC: unblock_identity(blocked_id, identity_type)
-- =============================================================================
create or replace function public.unblock_identity(p_blocked_id uuid, p_identity_type text)
returns void language plpgsql security definer set search_path = public as $$
declare v_uid uuid := auth.uid();
begin
  if v_uid is null then raise exception 'Not authenticated'; end if;
  delete from public.blocked_users
  where blocker_id = v_uid and blocked_id = p_blocked_id
    and blocked_identity_type = p_identity_type;
end;
$$;
grant execute on function public.unblock_identity(uuid, text) to authenticated;

-- =============================================================================
-- RPC: search_users(keyword) — 搜索用户(加好友用)
--   - zzup_id 精确匹配:永远可搜(不受开关影响)
--   - real_name 模糊匹配:仅当对方 searchable_by_real_name = true
--   - 排除:自己、已 soft delete、身份级拉黑(真人,双向)
--   - 返回按对方 S_A 过滤的展示字段
-- =============================================================================
create or replace function public.search_users(p_keyword text)
returns table (
  id               uuid,
  zzup_id          text,
  profile_visibility text,
  real_name        text,
  avatar_url       text,
  university       text,
  pet_name         text,
  pet_avatar_url   text,
  edu_verified     boolean
)
language sql security definer set search_path = public
as $$
  select
    p.id,
    p.zzup_id,
    p.profile_visibility,
    case when p.profile_visibility = 'pet_only'  then null else p.real_name end,
    case when p.profile_visibility = 'pet_only'  then null else p.avatar_url end,
    case when p.profile_visibility = 'pet_only'  then null else p.university end,
    case when p.profile_visibility = 'real_only' then null else p.pet_name end,
    case when p.profile_visibility = 'real_only' then null else p.pet_avatar_url end,
    p.edu_verified
  from public.profiles p
  where p.deleted_at is null
    and p.id <> auth.uid()
    and char_length(coalesce(p_keyword, '')) >= 1
    and (
      p.zzup_id = p_keyword
      or (p.searchable_by_real_name and p.real_name ilike '%' || p_keyword || '%')
    )
    and not exists (
      select 1 from public.blocked_users b
      where b.blocked_identity_type = 'real'
        and ((b.blocker_id = auth.uid() and b.blocked_id = p.id)
          or (b.blocker_id = p.id and b.blocked_id = auth.uid()))
    )
  limit 20;
$$;
grant execute on function public.search_users(text) to authenticated;

-- =============================================================================
-- 好友读取 RPC(都按对方 S_A 过滤;friendships 为真人↔真人)
-- =============================================================================

-- 已接受好友列表
create or replace function public.list_friends()
returns table (
  friendship_id uuid, id uuid, zzup_id text, profile_visibility text,
  real_name text, avatar_url text, university text,
  pet_name text, pet_avatar_url text, edu_verified boolean)
language sql security definer set search_path = public as $$
  select f.id,
    p.id, p.zzup_id, p.profile_visibility,
    case when p.profile_visibility='pet_only'  then null else p.real_name end,
    case when p.profile_visibility='pet_only'  then null else p.avatar_url end,
    case when p.profile_visibility='pet_only'  then null else p.university end,
    case when p.profile_visibility='real_only' then null else p.pet_name end,
    case when p.profile_visibility='real_only' then null else p.pet_avatar_url end,
    p.edu_verified
  from public.friendships f
  join public.profiles p
    on p.id = case when f.requester_id = auth.uid() then f.addressee_id else f.requester_id end
  where f.status='accepted'
    and (f.requester_id = auth.uid() or f.addressee_id = auth.uid())
    and p.deleted_at is null;
$$;
grant execute on function public.list_friends() to authenticated;

-- 收到的待处理请求(我是 addressee)
create or replace function public.list_pending_requests()
returns table (
  friendship_id uuid, created_at timestamptz, id uuid, zzup_id text, profile_visibility text,
  real_name text, avatar_url text, university text,
  pet_name text, pet_avatar_url text, edu_verified boolean)
language sql security definer set search_path = public as $$
  select f.id, f.created_at,
    p.id, p.zzup_id, p.profile_visibility,
    case when p.profile_visibility='pet_only'  then null else p.real_name end,
    case when p.profile_visibility='pet_only'  then null else p.avatar_url end,
    case when p.profile_visibility='pet_only'  then null else p.university end,
    case when p.profile_visibility='real_only' then null else p.pet_name end,
    case when p.profile_visibility='real_only' then null else p.pet_avatar_url end,
    p.edu_verified
  from public.friendships f
  join public.profiles p on p.id = f.requester_id
  where f.status='pending' and f.addressee_id = auth.uid() and p.deleted_at is null;
$$;
grant execute on function public.list_pending_requests() to authenticated;

-- 我发出的待处理请求(我是 requester)
create or replace function public.list_sent_requests()
returns table (
  friendship_id uuid, created_at timestamptz, id uuid, zzup_id text, profile_visibility text,
  real_name text, avatar_url text, university text,
  pet_name text, pet_avatar_url text, edu_verified boolean)
language sql security definer set search_path = public as $$
  select f.id, f.created_at,
    p.id, p.zzup_id, p.profile_visibility,
    case when p.profile_visibility='pet_only'  then null else p.real_name end,
    case when p.profile_visibility='pet_only'  then null else p.avatar_url end,
    case when p.profile_visibility='pet_only'  then null else p.university end,
    case when p.profile_visibility='real_only' then null else p.pet_name end,
    case when p.profile_visibility='real_only' then null else p.pet_avatar_url end,
    p.edu_verified
  from public.friendships f
  join public.profiles p on p.id = f.addressee_id
  where f.status='pending' and f.requester_id = auth.uid() and p.deleted_at is null;
$$;
grant execute on function public.list_sent_requests() to authenticated;

-- 与某人的关系状态:none/pending_sent/pending_received/accepted/blocked
-- 对方拉黑我 → 返回 none(不暴露)
create or replace function public.get_friendship_status(p_target uuid)
returns text language plpgsql security definer set search_path = public as $$
declare v_uid uuid := auth.uid(); v_status text; v_requester uuid;
begin
  if v_uid is null then return 'none'; end if;
  if exists (select 1 from public.blocked_users
             where blocker_id=v_uid and blocked_id=p_target and blocked_identity_type='real')
    then return 'blocked'; end if;
  if exists (select 1 from public.blocked_users
             where blocker_id=p_target and blocked_id=v_uid and blocked_identity_type='real')
    then return 'none'; end if;

  select status, requester_id into v_status, v_requester
  from public.friendships
  where least(requester_id,addressee_id)=least(v_uid,p_target)
    and greatest(requester_id,addressee_id)=greatest(v_uid,p_target)
    and status in ('pending','accepted')
  order by created_at desc limit 1;

  if v_status is null then return 'none'; end if;
  if v_status='accepted' then return 'accepted'; end if;
  if v_requester = v_uid then return 'pending_sent'; else return 'pending_received'; end if;
end;
$$;
grant execute on function public.get_friendship_status(uuid) to authenticated;
