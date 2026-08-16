-- =============================================================================
-- 77_message_read_rpcs.sql
-- 消息与成员的读取改走 RPC，宠物身份一律裸形态
--
-- 两件事：
--   1. 消息和成员列表目前**直接把 pet_name 发给客户端** —— 宠物名是自由文本，
--      熵极高，等于匿名马甲直接报出自己是谁。改成只给「种类 + 形态 + 会话内代号」。
--   2. `getMessages` 现在用 PostgREST 内嵌联查读 profiles，**依赖列级 SELECT 授权**。
--      下一个迁移要撤销那些授权，所以这一步是硬前置：不先改，锁一上聊天记录全空。
--
-- ── 一个设计改动：裸宠物按**代号**寻址，不按账号 id ──────────────────────────
--
-- 迁移 73 的 get_pet_identity 收的是 (会话, 账号)，意味着客户端手里必须有
-- 匿名宠物的 account_id —— 那它就能转手去调 get_other_profile 把真名查出来。
-- 靠「界面不提供这个入口」来防是不够的。
--
-- 改成收 (会话, 代号) 之后，客户端对匿名宠物**只知道一个会话内的字母**，
-- 跨会话不可关联、也换不出账号。list_messages 对宠物消息直接把 sender_id 置 null，
-- 改用 is_mine 布尔值让客户端判断左右对齐。
--
-- 已知边界（A 方案，隐私政策已如实披露）：Realtime 推送的原始行仍带 sender_id，
-- 抓包能拿到。这里堵的是**应用层**的路径，不是传输层。
--
-- 回滚：db-backups/2026-08-15/ROLLBACK_77.sql
-- =============================================================================

-- ⚠️ 下面这个 account_by_pet_alias 和 pet_alias 的「实时计算」实现
--    **已被迁移 78 取代**。实测发现按当前成员集合排名有两个致命问题：
--    加群/退群会让所有人的代号重排，且退群者的历史消息拿不到代号。
--    迁移 78 改成了持久化分配（conversation_aliases 表）。
--    这里保留原样只是迁移历史，不要照着它写新代码。

-- ── 代号 → 账号 的反查（内部用）─────────────────────────────────────────────
create or replace function public.account_by_pet_alias(
  p_conversation uuid,
  p_alias        text
)
returns uuid
language sql
stable
security definer
set search_path to 'public'
as $function$
  with ranked as (
    select cm.account_id,
           row_number() over (
             order by md5(p_conversation::text || cm.account_id::text)
           ) as n
    from public.conversation_members cm
    where cm.conversation_id = p_conversation
  )
  select account_id from ranked
  where case
          when n <= 26 then chr(64 + n::int)
          else chr(64 + (((n - 1) % 26) + 1)::int) || ((n - 1) / 26)::text
        end = p_alias;
$function$;

-- ── 裸宠物身份：改按代号寻址 ────────────────────────────────────────────────
drop function if exists public.get_pet_identity(text, uuid, uuid);
create function public.get_pet_identity(
  p_conversation uuid,
  p_alias        text
)
returns json
language plpgsql
stable
security definer
set search_path to 'public'
as $function$
declare
  p        public.profiles;
  v_account uuid;
begin
  if auth.uid() is null then return null; end if;

  -- 调用方必须在这个会话里，否则任何人都能拿 (会话, 代号) 去枚举
  if not exists (
    select 1 from public.conversation_members
    where conversation_id = p_conversation and account_id = auth.uid()
  ) then return null; end if;

  v_account := public.account_by_pet_alias(p_conversation, p_alias);
  if v_account is null then return null; end if;

  select * into p from public.profiles where id = v_account;
  if not found or p.deleted_at is not null then return null; end if;

  -- **刻意不返回**：pet_name / pet_bio / pet_avatar_url / pet_level /
  -- zzup_id / 账号 id / 任何真人字段。客户端拿不到就渲染不出来。
  return json_build_object(
    'alias',     p_alias,
    'pet_breed', p.pet_breed,
    'pet_stage', p.pet_stage,
    'label',     p_alias || ' ' || initcap(replace(coalesce(p.pet_breed, 'pet'), '_', ' '))
  );
end;
$function$;

grant execute on function public.get_pet_identity(uuid, text) to authenticated;

-- ── 消息列表 ─────────────────────────────────────────────────────────────────
-- 顺带把 cleared_before（迁移 76）也在服务端过滤掉，客户端不用再单独查一次。
create or replace function public.list_messages(
  p_conversation uuid,
  p_limit        int         default 30,
  p_before       timestamptz default null
)
returns table(
  id uuid,
  conversation_id uuid,
  sender_id uuid,               -- 宠物消息为 null，见文件头
  is_mine boolean,
  identity_mode text,
  content text,
  image_url text,
  attachments jsonb,
  created_at timestamptz,
  edited_at timestamptz,
  author_name text,             -- 真人=真名；宠物=代号标签（如 "A Dog"）
  author_avatar_url text,       -- 宠物为 null，客户端走本地形态图
  author_pet_breed text,
  author_pet_stage text,
  author_alias text             -- 仅宠物消息
)
language plpgsql
stable
security definer
set search_path to 'public'
as $function$
declare v_cleared timestamptz;
begin
  select cm.cleared_before into v_cleared
  from public.conversation_members cm
  where cm.conversation_id = p_conversation and cm.account_id = auth.uid();

  if not found then return; end if;   -- 不是成员，什么都不给

  return query
  select
    m.id,
    m.conversation_id,
    case when m.identity_mode = 'pet' then null else m.sender_id end,
    m.sender_id = auth.uid(),
    m.identity_mode,
    m.content,
    m.image_url,
    m.attachments,
    m.created_at,
    m.edited_at,
    case
      when m.identity_mode = 'pet' then
        public.pet_alias(m.conversation_id, m.sender_id) || ' ' ||
        initcap(replace(coalesce(p.pet_breed, 'pet'), '_', ' '))
      else p.real_name
    end,
    case when m.identity_mode = 'pet' then null else p.avatar_url end,
    case when m.identity_mode = 'pet' then p.pet_breed else null end,
    case when m.identity_mode = 'pet' then p.pet_stage else null end,
    case when m.identity_mode = 'pet'
         then public.pet_alias(m.conversation_id, m.sender_id) else null end
  from public.messages m
  left join public.profiles p on p.id = m.sender_id
  where m.conversation_id = p_conversation
    and (v_cleared is null or m.created_at > v_cleared)
    and (p_before is null or m.created_at < p_before)
  order by m.created_at desc
  limit p_limit;
end;
$function$;

grant execute on function public.list_messages(uuid, int, timestamptz) to authenticated;

-- ── 单条消息（Realtime 推来之后补作者信息用）────────────────────────────────
create or replace function public.get_message(p_message uuid)
returns json
language plpgsql
stable
security definer
set search_path to 'public'
as $function$
declare m public.messages; p public.profiles; v_cleared timestamptz; v_alias text;
begin
  select * into m from public.messages where id = p_message;
  if not found then return null; end if;

  select cm.cleared_before into v_cleared
  from public.conversation_members cm
  where cm.conversation_id = m.conversation_id and cm.account_id = auth.uid();
  if not found then return null; end if;
  if v_cleared is not null and m.created_at <= v_cleared then return null; end if;

  select * into p from public.profiles where id = m.sender_id;

  if m.identity_mode = 'pet' then
    v_alias := public.pet_alias(m.conversation_id, m.sender_id);
  end if;

  return json_build_object(
    'id', m.id,
    'conversation_id', m.conversation_id,
    'sender_id', case when m.identity_mode = 'pet' then null else m.sender_id end,
    'is_mine', m.sender_id = auth.uid(),
    'identity_mode', m.identity_mode,
    'content', m.content,
    'image_url', m.image_url,
    'attachments', m.attachments,
    'created_at', m.created_at,
    'edited_at', m.edited_at,
    'author_name', case
      when m.identity_mode = 'pet'
        then v_alias || ' ' || initcap(replace(coalesce(p.pet_breed,'pet'),'_',' '))
      else p.real_name end,
    'author_avatar_url', case when m.identity_mode = 'pet' then null else p.avatar_url end,
    'author_pet_breed', case when m.identity_mode = 'pet' then p.pet_breed else null end,
    'author_pet_stage', case when m.identity_mode = 'pet' then p.pet_stage else null end,
    'author_alias', v_alias
  );
end;
$function$;

grant execute on function public.get_message(uuid) to authenticated;

-- ── 成员列表：宠物身份成员不再暴露宠物名 ────────────────────────────────────
--
-- 注意 `conversation_members.member_identity` 目前**全库都是 'real'** ——
-- 宠物/真人是逐条消息切换的（messages.identity_mode），这个字段实际没在用。
-- 所以下面这段是**潜在正确性修正**，当前不改变任何实际行为。
--
-- ⚠️ 保留 account_id：踢人（remove_group_member）需要它。
--    一度想对宠物成员置空，那会打断群主踢人，而且解决的是不存在的问题。
--
-- 群成员列表按真名列出，这本身是**已接受的小群残余风险**：
-- 十个人的群里冒出一只匿名「成年猫」，配上强制公开的宠物主页基本能对上号。
-- 见 docs/待办清单_2026-08-15.md 第七节。
drop function if exists public.list_conversation_members(uuid);
create function public.list_conversation_members(p_conversation_id uuid)
returns table(account_id uuid, member_identity text, role text,
              joined_at timestamptz, display_name text, display_avatar text,
              pet_breed text, pet_stage text, is_me boolean)
language sql
security definer
set search_path to 'public'
as $function$
  select
    cm.account_id,
    cm.member_identity,
    cm.role,
    cm.joined_at,
    -- 宠物身份给代号标签，不给 pet_name（自由文本，熵极高）
    case when cm.member_identity = 'pet'
         then public.pet_alias(cm.conversation_id, cm.account_id) || ' ' ||
              initcap(replace(coalesce(p.pet_breed, 'pet'), '_', ' '))
         else p.real_name end,
    case when cm.member_identity = 'pet' then null else p.avatar_url end,
    case when cm.member_identity = 'pet' then p.pet_breed else null end,
    case when cm.member_identity = 'pet' then p.pet_stage else null end,
    cm.account_id = auth.uid()
  from public.conversation_members cm
  join public.profiles p on p.id = cm.account_id
  where cm.conversation_id = p_conversation_id
    and p.deleted_at is null
    and exists (
      select 1 from public.conversation_members me
      where me.conversation_id = p_conversation_id
        and me.account_id = auth.uid()
    )
  order by (cm.role = 'admin') desc, cm.joined_at asc;
$function$;

grant execute on function public.list_conversation_members(uuid) to authenticated;

notify pgrst, 'reload schema';
