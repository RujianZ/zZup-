-- =============================================================================
-- ROLLBACK_88.sql — 撤销 88_friendship_remembers_origin_conversation.sql
--
-- ⚠️ 回滚 = 让「加好友后升级哪个会话」重新变成猜的。
--
--    原来的反查是 `limit 1` 且**没有 order by**：两个人被 Pulse 匹配过不止一次时
--    任取一个。实测就是这么错的——请求发自屏幕上那个会话，触发器却升级了
--    另一个早被删掉的旧会话。数据全对、没报错，只是发生在别处。
--
--    下面保留了带 order by 的兜底反查（按最后消息时间取最近的），
--    这样即使丢掉 origin_conversation_id，至少还是**稳定**的猜法。
--
-- 前置：ROLLBACK_87 尚未执行（本脚本恢复的是 87 之后的版本）。
-- =============================================================================

create or replace function public.send_friend_request_in_conversation(p_conversation uuid)
returns void
language plpgsql
security definer
set search_path to 'public'
as $function$
declare v_peer uuid; v_source text;
begin
  if auth.uid() is null then raise exception 'Not authenticated'; end if;

  if public.is_conversation_frozen(p_conversation) then
    raise exception 'This conversation has ended.';
  end if;

  v_peer := public.conversation_peer_id(p_conversation);
  if v_peer is null then
    raise exception 'No one to add in this conversation.';
  end if;

  select c.kind into v_source from public.conversations c where c.id = p_conversation;
  if v_source not in ('petchat','driftbottle') then v_source := null; end if;

  perform public.send_friend_request(v_peer, v_source);
end;
$function$;

grant execute on function public.send_friend_request_in_conversation(uuid) to authenticated;

create or replace function public.handle_friendship_update()
returns trigger
language plpgsql
security definer
as $function$
declare
  v_group_id uuid;
begin
  if new.status = 'accepted' and old.status != 'accepted' then
    select c.id into v_group_id
    from public.conversations c
    join public.conversation_members cm1
      on cm1.conversation_id = c.id and cm1.account_id = new.requester_id
    join public.conversation_members cm2
      on cm2.conversation_id = c.id and cm2.account_id = new.addressee_id
    where c.kind = 'petchat' and c.is_temporary = true
    order by coalesce(
      (select max(m.created_at) from public.messages m where m.conversation_id = c.id),
      c.created_at
    ) desc
    limit 1;

    if v_group_id is not null then
      update public.conversations
      set is_temporary  = false,
          kind          = 'dm',
          expires_at    = null,
          is_agent_chat = false
      where id = v_group_id;
    end if;
  end if;
  return new;
end;
$function$;

-- 最后再删列（上面的函数已经不引用它了）
alter table public.friendships drop column if exists origin_conversation_id;
