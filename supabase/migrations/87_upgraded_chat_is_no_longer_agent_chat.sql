-- =============================================================================
-- 87_upgraded_chat_is_no_longer_agent_chat.sql
-- 加好友升级之后，会话不再是 agent chat
--
-- ── 问题 ─────────────────────────────────────────────────────────────────────
-- handle_friendship_update 把会话升级成 kind='dm' / is_temporary=false，
-- 却把 is_agent_chat 留在 true。于是「已经是好友的普通私聊」在数据上仍然
-- 自称 agent chat，各处只好靠 `is_agent_chat and is_temporary` 这种组合条件
-- 去还原真相 —— 每个读它的人都得自己拼一遍，漏一处就出一个 bug
-- （列表里好友永远顶着代号、进去还是 AI 代理界面）。
--
-- ── 立场 ─────────────────────────────────────────────────────────────────────
-- 升级后的会话**就是好友消息**，只是历史里带着一段 AI 代理对话，
-- 那些消息仍然显示宠物头像、仍然点得进裸宠物页 —— 但那是**每条消息自己的
-- identity_mode** 决定的，跟会话是不是 agent chat 无关。
--
-- 所以 is_agent_chat 应该老老实实描述「这个会话现在是不是 AI 代理会话」。
--
-- ── 顺带的正确副作用 ─────────────────────────────────────────────────────────
-- trigger_agent_chat_reply（Ethan 的）第一步就是 `if is_agent_chat is not true
-- then return`。清掉这个标志之后，**加完好友 AI 就彻底不再替谁说话了** ——
-- 原来只有「双方都接管过」才停得下来，光加好友是停不住的。
-- 这是数据变准带来的结果，Ethan 的函数一个字没动。
--
-- 回滚：db-backups/2026-08-15/ROLLBACK_87.sql
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
      set is_temporary  = false,
          kind          = 'dm',
          expires_at    = null,
          -- 新增：升级完就不再是 AI 代理会话了
          is_agent_chat = false
      where id = v_group_id;
    end if;
  end if;
  return new;
end;
$function$;

-- 已经升级过、但标志还留在 true 的历史数据
update public.conversations
set is_agent_chat = false
where is_agent_chat = true
  and is_temporary = false;
