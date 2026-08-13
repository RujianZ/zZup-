-- =============================================================================
-- 64_pet_identity_in_read_rpcs.sql
-- 读取 RPC 补齐宠物形象标识 (pet_breed / pet_stage)
--
-- 背景：宠物头像的美术资源是**本地资产** assets/pets/png/{breed}_{stage}.png
-- (10 品种 × 3 阶段 = 30 张)，不是远程 URL。而 profiles.pet_avatar_url 从注册
-- 流程起就从未被写入过 (OnboardingScreen 的 petAvatarUrl 只有 getter)，全库为
-- NULL，导致所有宠物头像退化成通用 🐾 图标。
--
-- 正解：宠物头像由 (breed, stage) 本地推导。自己的宠物客户端已有这两个字段；
-- **别人的**宠物拿不到 —— 本迁移就是把这两列补进读取 RPC 的返回。
--
-- 纯函数改动：不动表结构、不动数据、不动 RLS、不动 Ethan 的 Edge Function。
-- 可见性规则沿用既有约定：profile_visibility='real_only' 时宠物字段一律返回 null。
--
-- 回滚：db-backups/2026-08-13/ROLLBACK_64.sql
-- =============================================================================

-- 说明：RETURNS TABLE 增列无法用 CREATE OR REPLACE，必须先 drop。
-- 本迁移在单个事务内执行，drop→create 之间不会有可观测的空窗。

-- ── 1. list_conversations：补 display_breed / display_stage ──────────────────
-- 与 display_name / display_avatar 同源：zzuper_talk 取自己的宠物，
-- dm/petchat/driftbottle 中对方以宠物身份出现时取对方的宠物，其余为 null。
drop function if exists public.list_conversations();

create function public.list_conversations()
returns table(
  conversation_id uuid, kind text, is_temporary boolean,
  expires_at timestamptz, status text, my_identity text, peer_id uuid,
  display_name text, display_avatar text,
  display_breed text, display_stage text,
  members_count integer, last_message text, last_message_at timestamptz
)
language sql
security definer
set search_path to 'public'
as $function$
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
    -- 新增：宠物形象标识（仅当展示的是宠物身份时才有值）
    case
      when c.kind='zzuper_talk' then me.pet_breed
      when pe.peer_identity='pet' and pp.profile_visibility <> 'real_only' then pp.pet_breed
      else null
    end,
    case
      when c.kind='zzuper_talk' then me.pet_stage
      when pe.peer_identity='pet' and pp.profile_visibility <> 'real_only' then pp.pet_stage
      else null
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
$function$;

grant execute on function public.list_conversations() to authenticated;

-- ── 2. list_friends：补 pet_breed / pet_stage（追加在末尾）──────────────────
drop function if exists public.list_friends();

create function public.list_friends()
returns table(
  friendship_id uuid, id uuid, zzup_id text, profile_visibility text,
  real_name text, avatar_url text, university text,
  pet_name text, pet_avatar_url text, edu_verified boolean,
  pet_breed text, pet_stage text
)
language sql
security definer
set search_path to 'public'
as $function$
  select f.id,
    p.id, p.zzup_id, p.profile_visibility,
    case when p.profile_visibility='pet_only'  then null else p.real_name end,
    case when p.profile_visibility='pet_only'  then null else p.avatar_url end,
    case when p.profile_visibility='pet_only'  then null else p.university end,
    case when p.profile_visibility='real_only' then null else p.pet_name end,
    case when p.profile_visibility='real_only' then null else p.pet_avatar_url end,
    p.edu_verified,
    case when p.profile_visibility='real_only' then null else p.pet_breed end,
    case when p.profile_visibility='real_only' then null else p.pet_stage end
  from public.friendships f
  join public.profiles p
    on p.id = case when f.requester_id = auth.uid() then f.addressee_id else f.requester_id end
  where f.status='accepted'
    and (f.requester_id = auth.uid() or f.addressee_id = auth.uid())
    and p.deleted_at is null;
$function$;

grant execute on function public.list_friends() to authenticated;

-- ── 3. list_pending_requests ────────────────────────────────────────────────
drop function if exists public.list_pending_requests();

create function public.list_pending_requests()
returns table(
  friendship_id uuid, created_at timestamptz, id uuid, zzup_id text,
  profile_visibility text, real_name text, avatar_url text, university text,
  pet_name text, pet_avatar_url text, edu_verified boolean,
  pet_breed text, pet_stage text
)
language sql
security definer
set search_path to 'public'
as $function$
  select f.id, f.created_at,
    p.id, p.zzup_id, p.profile_visibility,
    case when p.profile_visibility='pet_only'  then null else p.real_name end,
    case when p.profile_visibility='pet_only'  then null else p.avatar_url end,
    case when p.profile_visibility='pet_only'  then null else p.university end,
    case when p.profile_visibility='real_only' then null else p.pet_name end,
    case when p.profile_visibility='real_only' then null else p.pet_avatar_url end,
    p.edu_verified,
    case when p.profile_visibility='real_only' then null else p.pet_breed end,
    case when p.profile_visibility='real_only' then null else p.pet_stage end
  from public.friendships f
  join public.profiles p on p.id = f.requester_id
  where f.status='pending' and f.addressee_id = auth.uid() and p.deleted_at is null;
$function$;

grant execute on function public.list_pending_requests() to authenticated;

-- ── 4. list_sent_requests ───────────────────────────────────────────────────
drop function if exists public.list_sent_requests();

create function public.list_sent_requests()
returns table(
  friendship_id uuid, created_at timestamptz, id uuid, zzup_id text,
  profile_visibility text, real_name text, avatar_url text, university text,
  pet_name text, pet_avatar_url text, edu_verified boolean,
  pet_breed text, pet_stage text
)
language sql
security definer
set search_path to 'public'
as $function$
  select f.id, f.created_at,
    p.id, p.zzup_id, p.profile_visibility,
    case when p.profile_visibility='pet_only'  then null else p.real_name end,
    case when p.profile_visibility='pet_only'  then null else p.avatar_url end,
    case when p.profile_visibility='pet_only'  then null else p.university end,
    case when p.profile_visibility='real_only' then null else p.pet_name end,
    case when p.profile_visibility='real_only' then null else p.pet_avatar_url end,
    p.edu_verified,
    case when p.profile_visibility='real_only' then null else p.pet_breed end,
    case when p.profile_visibility='real_only' then null else p.pet_stage end
  from public.friendships f
  join public.profiles p on p.id = f.addressee_id
  where f.status='pending' and f.requester_id = auth.uid() and p.deleted_at is null;
$function$;

grant execute on function public.list_sent_requests() to authenticated;

-- ── 5. search_users ─────────────────────────────────────────────────────────
drop function if exists public.search_users(text);

create function public.search_users(p_keyword text)
returns table(
  id uuid, zzup_id text, profile_visibility text,
  real_name text, avatar_url text, university text,
  pet_name text, pet_avatar_url text, edu_verified boolean,
  pet_breed text, pet_stage text
)
language sql
security definer
set search_path to 'public'
as $function$
  select
    p.id,
    p.zzup_id,
    p.profile_visibility,
    case when p.profile_visibility = 'pet_only'  then null else p.real_name end,
    case when p.profile_visibility = 'pet_only'  then null else p.avatar_url end,
    case when p.profile_visibility = 'pet_only'  then null else p.university end,
    case when p.profile_visibility = 'real_only' then null else p.pet_name end,
    case when p.profile_visibility = 'real_only' then null else p.pet_avatar_url end,
    p.edu_verified,
    case when p.profile_visibility = 'real_only' then null else p.pet_breed end,
    case when p.profile_visibility = 'real_only' then null else p.pet_stage end
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
$function$;

grant execute on function public.search_users(text) to authenticated;

-- ── 6. get_other_profile：补 pet_breed（已有 pet_stage）─────────────────────
create or replace function public.get_other_profile(target_id uuid)
returns json
language plpgsql
security definer
set search_path to 'public'
as $function$
declare p public.profiles; is_pet_only boolean; is_real_only boolean;
begin
  if auth.uid() is null then return null; end if;
  select * into p from public.profiles where id = target_id;
  if not found or p.deleted_at is not null then return null; end if;

  is_pet_only  := (p.profile_visibility = 'pet_only');
  is_real_only := (p.profile_visibility = 'real_only');

  return json_build_object(
    'id', p.id, 'zzup_id', p.zzup_id,
    'profile_visibility', p.profile_visibility,
    'edu_verified', p.edu_verified, 'created_at', p.created_at,
    'real_name',   case when is_pet_only then null else p.real_name end,
    'bio',         case when is_pet_only then null else p.bio end,
    'avatar_url',  case when is_pet_only then null else p.avatar_url end,
    'university',  case when is_pet_only then null else p.university end,
    'nationality', case when is_pet_only then null else p.nationality end,
    'gender',      case when is_pet_only then null else p.gender end,
    'age',         case when is_pet_only or p.date_of_birth is null then null
                        else extract(year from age(p.date_of_birth))::int end,
    'qr_code_url', case when is_pet_only or not p.allow_add_via_qr then null else p.qr_code_url end,
    'pet_name',       case when is_real_only then null else p.pet_name end,
    'pet_avatar_url', case when is_real_only then null else p.pet_avatar_url end,
    'pet_bio',        case when is_real_only then null else p.pet_bio end,
    'pet_level',      case when is_real_only then null else p.pet_level end,
    'pet_stage',      case when is_real_only then null else p.pet_stage end,
    'pet_breed',      case when is_real_only then null else p.pet_breed end
  );
end;
$function$;

grant execute on function public.get_other_profile(uuid) to authenticated;

notify pgrst, 'reload schema';
