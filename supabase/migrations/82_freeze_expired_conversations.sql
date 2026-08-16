-- =============================================================================
-- 82_freeze_expired_conversations.sql
-- 临时会话到期后**冻结**，不再从列表里消失
--
-- 改动前：list_conversations 里有一句
--     where not (c.is_temporary and c.expires_at is not null and c.expires_at < now())
-- 到期的临时会话直接从列表消失，用户再也找不到它。
--
-- ── 为什么必须改成冻结（这条比产品理由更硬）────────────────────────────────
--
-- submit_report 快照的是「会话最近 50 条消息」。会话在界面上消失之后，
-- 用户根本没有入口去举报 —— **举报功能在最需要它的场景里失效**：
-- 有人在 Pulse 里骚扰你，三小时后对话没了，证据也就没了。
--
-- 另外 18 U.S.C. § 2258A / 2024 REPORT Act 要求涉未成年人内容保存 ≥1 年。
-- 界面上消失、数据层保留，才是能同时满足这两头的做法。
--
-- ── 冻结的语义（Joe 2026-08-15 定）─────────────────────────────────────────
--
--   允许：读历史、举报、拉黑、点头像看主页、左滑删除/免打扰
--   禁止：发消息（本迁移的触发器强制）、加好友（客户端隐藏入口）
--
-- 「不能加好友」是产品规则不是安全规则 —— 错过就永远错过，制造时限压力。
-- 所以只在客户端拦，没有做服务端强制。发消息不一样，那是防持续骚扰，
-- 必须服务端拦，抓包改请求也绕不过。
--
-- ⚠️ 触发器挂在 messages 上而不是发送 RPC 上，所以**所有写入路径**都覆盖，
--    包括 Ethan 的 Edge Function 用 service_role 直接 insert 的 AI 回复。
--    这是有意的：冻结的会话不该再有 AI 轮次。
--
-- 本迁移**不修改** try_match_user / handle_temporary_chat_reply /
-- set_temp_conversation_expiry / handle_friendship_update ——
-- 那几个是匹配与 AI 轮次的链路，属 Ethan 那块，只读不改。
--
-- 回滚：db-backups/2026-08-15/ROLLBACK_82.sql
-- =============================================================================

-- ── 判定：会话是不是冻结了 ──────────────────────────────────────────────────
create or replace function public.is_conversation_frozen(p_conversation uuid)
returns boolean
language sql
stable
security definer
set search_path to 'public'
as $function$
  select c.is_temporary
     and c.expires_at is not null
     and c.expires_at < now()
  from public.conversations c
  where c.id = p_conversation;
$function$;

grant execute on function public.is_conversation_frozen(uuid) to authenticated;

-- ── 冻结后禁止发言 ──────────────────────────────────────────────────────────
create or replace function public.trg_block_frozen_sends()
returns trigger
language plpgsql
set search_path to 'public'
as $function$
begin
  if coalesce(public.is_conversation_frozen(new.conversation_id), false) then
    raise exception 'This conversation has ended. You can still read it and report it.'
      using errcode = '42501';
  end if;
  return new;
end;
$function$;

drop trigger if exists on_message_check_frozen on public.messages;
create trigger on_message_check_frozen
  before insert on public.messages
  for each row execute function public.trg_block_frozen_sends();

-- ── list_conversations：不再隐藏，改成打标记 ────────────────────────────────
-- 返回签名新增 is_frozen，必须 DROP + CREATE。
drop function if exists public.list_conversations();
create function public.list_conversations()
returns table(conversation_id uuid, kind text, is_temporary boolean,
              expires_at timestamp with time zone, status text, my_identity text,
              peer_id uuid, display_name text, display_avatar text,
              display_breed text, display_stage text, members_count integer,
              last_message text, last_message_at timestamp with time zone,
              is_muted boolean, cleared_before timestamp with time zone,
              is_frozen boolean)
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
    mc.cleared_before,
    -- 到期 = 冻结。这里不再把它从结果里剔除 —— 见文件头。
    c.is_temporary and c.expires_at is not null and c.expires_at < now()
  from my_convs mc
  join public.conversations c   on c.id = mc.conversation_id
  left join peer pe             on pe.conversation_id = c.id
  left join public.profiles pp  on pp.id = pe.peer_id
  left join public.profiles me  on me.id = auth.uid()
  left join last_msg lm         on lm.conversation_id = c.id
  where (mc.hidden_at is null or lm.created_at is not null)
  order by coalesce(lm.created_at, c.created_at) desc;
$function$;

grant execute on function public.list_conversations() to authenticated;

notify pgrst, 'reload schema';
