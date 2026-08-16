-- =============================================================================
-- ROLLBACK_82.sql — 撤销 82_freeze_expired_conversations.sql
--
-- ⚠️ 回滚 = 恢复「临时会话到期就从列表消失」的行为。
--
--    后果是**举报功能在最需要它的场景里失效**：有人在 Pulse 里骚扰你，
--    三小时后对话从界面上消失，用户再也找不到入口去举报，
--    而 submit_report 的快照取的正是这个会话的消息。
--
--    要回滚的话，客户端那几处冻结态 UI 也要一并摘掉
--    （ChatScreen / AgentChatScreen 的 frozenNotice、InboxScreen 的 Ended 标记）。
-- =============================================================================

drop trigger if exists on_message_check_frozen on public.messages;
drop function if exists public.trg_block_frozen_sends();
drop function if exists public.is_conversation_frozen(uuid);

-- ── 恢复迁移 76 版本的 list_conversations（到期即隐藏，无 is_frozen）─────────
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
  last_msg as (
    select distinct on (m.conversation_id) m.conversation_id, m.content, m.created_at
    from public.messages m
    join my_convs mc on mc.conversation_id = m.conversation_id
    where mc.cleared_before is null or m.created_at > mc.cleared_before
    order by m.conversation_id, m.created_at desc
  )
  select
    c.id, c.kind, c.is_temporary, c.expires_at, c.status,
    mc.my_identity, pe.peer_id,
    case when c.kind='group' then c.name
         when c.kind='zzuper_talk' then me.pet_name
         when pe.peer_identity='pet' then pp.pet_name
         else pp.real_name end,
    case when c.kind='group' then c.avatar_url
         when c.kind='zzuper_talk' then me.pet_avatar_url
         when pe.peer_identity='pet' then pp.pet_avatar_url
         else pp.avatar_url end,
    case when c.kind='zzuper_talk' then me.pet_breed
         when pe.peer_identity='pet' then pp.pet_breed
         else null end,
    case when c.kind='zzuper_talk' then me.pet_stage
         when pe.peer_identity='pet' then pp.pet_stage
         else null end,
    c.members_count, lm.content, lm.created_at,
    mc.muted_at is not null, mc.cleared_before
  from my_convs mc
  join public.conversations c   on c.id = mc.conversation_id
  left join peer pe             on pe.conversation_id = c.id
  left join public.profiles pp  on pp.id = pe.peer_id
  left join public.profiles me  on me.id = auth.uid()
  left join last_msg lm         on lm.conversation_id = c.id
  where not (c.is_temporary and c.expires_at is not null and c.expires_at < now())
    and (mc.hidden_at is null or lm.created_at is not null)
  order by coalesce(lm.created_at, c.created_at) desc;
$function$;

grant execute on function public.list_conversations() to authenticated;

notify pgrst, 'reload schema';
