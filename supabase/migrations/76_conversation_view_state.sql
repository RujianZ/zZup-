-- =============================================================================
-- 76_conversation_view_state.sql
-- 会话的「每人一份」视图状态：清空聊天记录 / 删除会话 / 免打扰
--
-- 需求（2026-08-15）：
--   · 会话列表左滑 → 免打扰 / 删除会话
--     删除 = 这个会话从**我的**列表消失，聊天记录对我清空。
--     想重新聊只能走好友列表/群列表，**新窗口是空的**；
--     对方发来新消息时窗口重新出现，同样只有新消息。
--   · 会话内右上角 → 清空聊天记录（**不删会话**，会话仍在列表里）
--
-- ⚠️ **绝不删 messages 行**。这是硬约束，三个理由：
--   1. 对方的聊天记录会出现空洞
--   2. 举报证据没了 —— submit_report 快照的正是会话最近 50 条
--   3. 涉未成年人内容有 ≥1 年保存义务（18 U.S.C. § 2258A / 2024 REPORT Act）
--   所以全部做成**读取侧过滤**，落在 conversation_members（本就每人一行）。
--
-- 为什么放服务端而不是客户端本地：
--   · 多设备一致（同一账号手机/模拟器/MacBook 三端）
--   · 重装不复原 —— 因骚扰删掉的会话重装后又冒出来，是安全问题不是体验问题
--   · **免打扰必须在服务端**，否则拦不住服务器已经发出的推送通知
--
-- 回滚：db-backups/2026-08-15/ROLLBACK_76.sql
-- =============================================================================

alter table public.conversation_members
  add column if not exists cleared_before timestamptz,
  add column if not exists hidden_at      timestamptz,
  add column if not exists muted_at       timestamptz;

comment on column public.conversation_members.cleared_before is
  '只显示此时间之后的消息。清空记录和删除会话都会把它推到当前时间。';
comment on column public.conversation_members.hidden_at is
  '会话从「我的」列表隐藏的时刻。之后只要有新消息就自动重新出现。';
comment on column public.conversation_members.muted_at is
  '免打扰起始时刻。null = 未静音。';

-- 客户端只读，写一律走下面的 RPC
grant select (cleared_before, hidden_at, muted_at)
  on public.conversation_members to authenticated;

-- ── 清空聊天记录（保留会话）─────────────────────────────────────────────────
create or replace function public.clear_conversation_history(p_conversation uuid)
returns void
language sql
security definer
set search_path to 'public'
as $function$
  update public.conversation_members
     set cleared_before = now()
   where conversation_id = p_conversation
     and account_id = auth.uid();
$function$;

grant execute on function public.clear_conversation_history(uuid) to authenticated;

-- ── 删除会话（从我的列表移除 + 清空记录）────────────────────────────────────
-- 两个字段同时置为 now() 是有意的：这样「清空后仍有消息」就等价于
-- 「隐藏之后来了新消息」，重新出现的判断不需要额外逻辑。
create or replace function public.hide_conversation(p_conversation uuid)
returns void
language sql
security definer
set search_path to 'public'
as $function$
  update public.conversation_members
     set cleared_before = now(),
         hidden_at      = now()
   where conversation_id = p_conversation
     and account_id = auth.uid();
$function$;

grant execute on function public.hide_conversation(uuid) to authenticated;

-- ── 免打扰 ───────────────────────────────────────────────────────────────────
create or replace function public.set_conversation_muted(
  p_conversation uuid,
  p_muted        boolean
)
returns void
language sql
security definer
set search_path to 'public'
as $function$
  update public.conversation_members
     set muted_at = case when p_muted then now() else null end
   where conversation_id = p_conversation
     and account_id = auth.uid();
$function$;

grant execute on function public.set_conversation_muted(uuid, boolean) to authenticated;

-- ── list_conversations：按视图状态过滤 ───────────────────────────────────────
-- 返回签名变了（新增 is_muted / cleared_before），必须 DROP + CREATE。
drop function if exists public.list_conversations();
create function public.list_conversations()
returns table(conversation_id uuid, kind text, is_temporary boolean,
              expires_at timestamp with time zone, status text, my_identity text,
              peer_id uuid, display_name text, display_avatar text,
              display_breed text, display_stage text, members_count integer,
              last_message text, last_message_at timestamp with time zone,
              is_muted boolean, cleared_before timestamp with time zone)
language sql
security definer
set search_path to 'public'
as $function$
  with my_convs as (
    select cm.conversation_id, cm.member_identity as my_identity,
           cm.cleared_before, cm.hidden_at, cm.muted_at
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
  -- 最后一条消息按**当前用户的** cleared_before 过滤 ——
  -- 清空之后列表预览也不该再显示旧内容
  last_msg as (
    select distinct on (m.conversation_id) m.conversation_id, m.content, m.created_at
    from public.messages m
    join my_convs mc on mc.conversation_id = m.conversation_id
    where mc.cleared_before is null or m.created_at > mc.cleared_before
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
    case
      when c.kind='zzuper_talk' then me.pet_breed
      when pe.peer_identity='pet' then pp.pet_breed
      else null
    end,
    case
      when c.kind='zzuper_talk' then me.pet_stage
      when pe.peer_identity='pet' then pp.pet_stage
      else null
    end,
    c.members_count,
    lm.content, lm.created_at,
    mc.muted_at is not null,
    mc.cleared_before
  from my_convs mc
  join public.conversations c   on c.id = mc.conversation_id
  left join peer pe             on pe.conversation_id = c.id
  left join public.profiles pp  on pp.id = pe.peer_id
  left join public.profiles me  on me.id = auth.uid()
  left join last_msg lm         on lm.conversation_id = c.id
  where not (c.is_temporary and c.expires_at is not null and c.expires_at < now())
    -- 已隐藏的会话：只有在清空之后又来了新消息时才重新出现。
    -- 因为 hide 时 hidden_at 和 cleared_before 同时置为 now()，
    -- 「lm 非空」正好等价于「隐藏之后有新消息」。
    and (mc.hidden_at is null or lm.created_at is not null)
  order by coalesce(lm.created_at, c.created_at) desc;
$function$;

grant execute on function public.list_conversations() to authenticated;

notify pgrst, 'reload schema';
