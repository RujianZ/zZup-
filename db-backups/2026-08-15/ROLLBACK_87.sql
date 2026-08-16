-- =============================================================================
-- ROLLBACK_87.sql — 撤销 87_upgraded_chat_is_no_longer_agent_chat.sql
--
-- ⚠️ 回滚有两个后果，第二个是不可逆的：
--
-- 1. 升级成好友的会话会重新自称 agent chat。于是各处又得靠
--    `is_agent_chat and is_temporary` 这种组合条件去还原真相 ——
--    漏一处就出一个 bug（列表里好友永远顶着代号、进去还是 AI 代理界面）。
--    **客户端也要一起改回去**：InboxScreen 的路由和 PetAvatar 的 anonymous、
--    以及 list_conversations 里的判断（见 ROLLBACK_85）。
--
-- 2. Ethan 的 trigger_agent_chat_reply 第一句是
--    `if is_agent_chat is not true then return`。标志恢复成 true 之后，
--    **加完好友 AI 会重新替人说话** —— 原来只有「双方都接管过」才停得下来。
--
-- ⚠️ 不可逆：迁移 87 的 backfill 把「已升级会话」的 is_agent_chat 一律置 false，
--    其中**哪些原本是 true、哪些原本就是 false，这个信息没有留下**。
--    下面的 backfill 只能按「kind='dm' 且存在宠物身份消息」去推断，
--    是近似还原，不是精确还原。要精确的话得从升级前的备份里取。
--
-- 前置：ROLLBACK_88 已执行。
-- =============================================================================

create or replace function public.handle_friendship_update()
returns trigger
language plpgsql
security definer
as $function$
declare
  v_group_id uuid;
begin
  if new.status = 'accepted' and old.status != 'accepted' then
    select cm1.conversation_id into v_group_id
    from public.conversation_members cm1
    join public.conversation_members cm2 on cm2.conversation_id = cm1.conversation_id
    join public.conversations c on c.id = cm1.conversation_id
    where c.kind = 'petchat'
      and c.is_temporary = true
      and cm1.account_id = new.requester_id
      and cm2.account_id = new.addressee_id
    limit 1;

    if v_group_id is not null then
      update public.conversations
      set is_temporary = false,
          kind         = 'dm',
          expires_at   = null
      where id = v_group_id;
    end if;
  end if;
  return new;
end;
$function$;

-- 近似还原：由 Pulse 升级来的私聊，历史里一定有宠物身份的消息
update public.conversations c
set is_agent_chat = true
where c.kind = 'dm'
  and c.is_temporary = false
  and c.is_agent_chat = false
  and exists (
    select 1 from public.messages m
    where m.conversation_id = c.id and m.identity_mode = 'pet'
  );
