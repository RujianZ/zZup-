-- =============================================================================
-- 85_conversation_list_respects_anonymity.sql
-- 会话列表补两件事：暴露 is_agent_chat，以及对未接管的 Pulse 对手保持匿名
--
-- ── 其一：is_agent_chat ──────────────────────────────────────────────────────
-- InboxScreen 一律跳 ChatScreen，于是 Pulse 会话退出去再进来就变成一个普通私聊
-- 界面 —— AI 代理提示、接管状态、加好友入口全没了。客户端要能区分，
-- 列表就得把这个标志带出来。
--
-- ── 其二：列表也得守匿名 ─────────────────────────────────────────────────────
-- 迁移 77 让聊天界面里未接管的对手只显示「A Time Lord」这样的代号，
-- 但**列表仍然直接显示 pp.real_name 和 pp.avatar_url**。
-- 聊天里小心翼翼遮住的东西，回到收件箱一眼就看见了 —— 等于没做。
--
-- 判据是「对方有没有以真人身份发过言」（identity_mode='real' 且 sender_id≠我），
-- 跟 AgentChatScreen 判断接管用的是同一个信号，两边不会各说各话。
--
-- 未接管时：display_name = 代号 + 品种（"A Time Lord Dog"），
--           display_avatar = null，breed/stage 照给 —— 客户端走本地形态图。
--
-- 加好友升级后 is_agent_chat 会被清掉（迁移 87），所以这里判一个标志就够了 ——
-- 不需要再拼 `and is_temporary` 去还原「现在到底是不是代理会话」。
--
-- 回滚：db-backups/2026-08-15/ROLLBACK_85.sql
-- =============================================================================

drop function if exists public.list_conversations();
create function public.list_conversations()
returns table(conversation_id uuid, kind text, is_temporary boolean,
              expires_at timestamp with time zone, status text, my_identity text,
              peer_id uuid, display_name text, display_avatar text,
              display_breed text, display_stage text, members_count integer,
              last_message text, last_message_at timestamp with time zone,
              is_muted boolean, cleared_before timestamp with time zone,
              is_frozen boolean, is_agent_chat boolean)
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
  -- Pulse 会话里，对方是否已经以真人身份发过言（= 自己揭了面具）
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
      -- 未接管的 Pulse 对手不给头像 URL，客户端走本地形态图
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
  where (mc.hidden_at is null or lm.created_at is not null)
  order by coalesce(lm.created_at, c.created_at) desc;
$function$;

grant execute on function public.list_conversations() to authenticated;
