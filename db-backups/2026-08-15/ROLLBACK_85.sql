-- =============================================================================
-- ROLLBACK_85.sql — 撤销 85_conversation_list_respects_anonymity.sql
--
-- ⚠️ 回滚有两个后果：
--
-- 1. **会话列表重新泄露未接管对手的真名和自定义头像。**
--    聊天界面里小心翼翼遮成「A Time Lord」的人，回到收件箱一眼就看见了 ——
--    匿名等于没做。这是本次回滚最实际的代价。
--
-- 2. **不再返回 is_agent_chat，客户端路由会失效。**
--    InboxScreen 靠它决定进 AgentChatScreen 还是普通 ChatScreen；
--    字段没了之后一律走 ChatScreen，Pulse 会话退出再进来就退化成普通私聊，
--    AI 代理身份、接管状态、加好友入口全部消失。
--    回滚这条**必须同时改客户端**（InboxScreen 的 onPress 和
--    lib/api/conversations.ts 的 ConversationListItem）。
--
-- 恢复的是迁移 82 的形状，**但保留了 last_msg 里的拉黑过滤** ——
-- 那是「拉黑之后会话预览仍然显示对方消息」的修复，跟本迁移无关，
-- 顺手一起回滚掉就是又开一个洞。
--
-- 前置：ROLLBACK_86 已执行。
-- =============================================================================

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
    where (mc.cleared_before is null or m.created_at > mc.cleared_before)
      -- 保留：拉黑过滤（迁移 83 的修复，不属于本次回滚范围）
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
