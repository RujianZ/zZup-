-- 114 — 修「隐藏会话」：它对任何有历史的会话都是失效的
--
-- ── 症状 ────────────────────────────────────────────────────────────────
--
-- 在收件箱里隐藏一个会话，它立刻又回来了。2026-08-20 出商店截图时撞上：
-- 手动把 hidden_at 写进 conversation_members 之后，那条会话照样在列表里。
--
-- ── 原因 ────────────────────────────────────────────────────────────────
--
-- list_conversations 的过滤条件是：
--
--     where (mc.hidden_at is null or lm.created_at is not null)
--
-- 意思是「只要这个会话有过任何一条消息，就无视 hidden_at」。
-- 而**有消息恰恰是用户想隐藏它的前提** —— 一个空会话没人会去隐藏。
-- 所以这个条件等价于「隐藏功能只对空会话生效」，也就是永远不生效。
--
-- 本意显然是「隐藏之后又来了**新**消息，就自动取消隐藏」，
-- 那需要拿最后一条消息的时间跟隐藏时间比，而不是判断它存不存在。
--
-- ── 改法 ────────────────────────────────────────────────────────────────
--
--     where (mc.hidden_at is null or lm.created_at > mc.hidden_at)
--
-- 四种情况都对得上：
--   · 没隐藏过                     → hidden_at is null    → 显示
--   · 隐藏了，之后没有新消息        → null 或 <= hidden_at → 隐藏 ← 修的就是这条
--   · 隐藏了，之后来了新消息        → > hidden_at          → 显示（自动取消隐藏）
--   · 隐藏了，且是个空会话          → lm.created_at is null → 隐藏
--
-- 注意 lm 这个 CTE 本来就过滤掉了 cleared_before 之前的、以及被拉黑者发的
-- 消息。所以「清空历史 + 隐藏」之后 lm 为空，会话保持隐藏 —— 也是对的。
--
-- 函数体其余部分逐字未动，只改了这一行。

CREATE OR REPLACE FUNCTION public.list_conversations()
 RETURNS TABLE(conversation_id uuid, kind text, is_temporary boolean, expires_at timestamp with time zone, status text, my_identity text, peer_id uuid, display_name text, display_avatar text, display_breed text, display_stage text, members_count integer, last_message text, last_message_at timestamp with time zone, is_muted boolean, cleared_before timestamp with time zone, is_frozen boolean, is_agent_chat boolean)
 LANGUAGE sql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
  revealed as (
    select m.conversation_id, bool_or(true) as yes
    from public.messages m
    where m.identity_mode = 'real' and m.sender_id <> auth.uid()
    group by m.conversation_id
  ),
  last_msg as (
    select distinct on (m.conversation_id) m.conversation_id, m.content, m.created_at
    from public.messages m
    join my_convs mc on mc.conversation_id = m.conversation_id
    where (mc.cleared_before is null or m.created_at > mc.cleared_before)
      and not public.is_message_blocked_for_me(m.sender_id, m.identity_mode, m.created_at)
    order by m.conversation_id, m.created_at desc
  )
  select
    c.id, c.kind, c.is_temporary, c.expires_at, c.status,
    mc.my_identity,
    pe.peer_id,
    case
      when c.kind='group'       then c.name
      when c.kind='zzuper_talk' then me.pet_name
      when c.is_agent_chat and coalesce(rv.yes,false) = false then
        coalesce(public.pet_alias(c.id, pe.peer_id) || ' ', '') ||
        initcap(replace(coalesce(pp.pet_breed,'pet'),'_',' '))
      when pe.peer_identity='pet' then pp.pet_name
      else pp.real_name
    end,
    case
      when c.kind='group'       then c.avatar_url
      when c.kind='zzuper_talk' then me.pet_avatar_url
      when c.is_agent_chat and coalesce(rv.yes,false) = false then null
      when pe.peer_identity='pet' then pp.pet_avatar_url
      else pp.avatar_url
    end,
    case
      when c.kind='zzuper_talk' then me.pet_breed
      when c.is_agent_chat and coalesce(rv.yes,false) = false then pp.pet_breed
      when pe.peer_identity='pet' then pp.pet_breed
      else null
    end,
    case
      when c.kind='zzuper_talk' then me.pet_stage
      when c.is_agent_chat and coalesce(rv.yes,false) = false then pp.pet_stage
      when pe.peer_identity='pet' then pp.pet_stage
      else null
    end,
    c.members_count,
    lm.content, lm.created_at,
    mc.muted_at is not null,
    mc.cleared_before,
    c.is_temporary and c.expires_at is not null and c.expires_at < now(),
    coalesce(c.is_agent_chat, false)
  from my_convs mc
  join public.conversations c   on c.id = mc.conversation_id
  left join peer pe             on pe.conversation_id = c.id
  left join revealed rv         on rv.conversation_id = c.id
  left join public.profiles pp  on pp.id = pe.peer_id
  left join public.profiles me  on me.id = auth.uid()
  left join last_msg lm         on lm.conversation_id = c.id
  where (mc.hidden_at is null or lm.created_at > mc.hidden_at)
  order by coalesce(lm.created_at, c.created_at) desc;
$function$;
