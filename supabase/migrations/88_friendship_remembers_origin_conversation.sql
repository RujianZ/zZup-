-- =============================================================================
-- 88_friendship_remembers_origin_conversation.sql
-- 好友关系记住「是在哪个会话里加的」，升级就不用靠猜
--
-- ── 症状 ─────────────────────────────────────────────────────────────────────
-- 在 Pulse 会话里加了好友，对方也接受了，但**这个界面没有升级** ——
-- 倒计时照走，还是 AI 代理界面。
--
-- ── 根因 ─────────────────────────────────────────────────────────────────────
-- handle_friendship_update 是挂在 friendships 上的触发器，而 friendships 里
-- 根本没有「这段关系是在哪个会话里建立的」。于是它只能反查：
--
--     where c.kind='petchat' and c.is_temporary = true
--       and cm1.account_id = new.requester_id and cm2.account_id = new.addressee_id
--     limit 1                          -- ← 没有 order by
--
-- 两个人如果被 Pulse 匹配过不止一次，这里就是**任取一个**。
-- 实测：请求发自 c92e08d8（02:40 创建，屏幕上那个），
-- 触发器却升级了 e3615271（02:35 创建，早就被一方删掉的旧会话）。
-- 数据全对、没有报错、升级也确实发生了 —— 只是发生在别处。
--
-- ── 修法 ─────────────────────────────────────────────────────────────────────
-- 把会话记在关系上。send_friend_request_in_conversation 本来就知道是哪个会话，
-- 这个信息不该在传给触发器的路上丢掉。
--
-- 兜底路径（从搜索/二维码加的好友，没有来源会话）保留原来的反查，
-- 但补上 order by：按最后一条消息时间取最近的那个。猜也要猜得稳定。
--
-- 回滚：db-backups/2026-08-15/ROLLBACK_88.sql
-- =============================================================================

alter table public.friendships
  add column if not exists origin_conversation_id uuid
    references public.conversations(id) on delete set null;

comment on column public.friendships.origin_conversation_id is
  '这段好友关系是在哪个会话里建立的（Pulse 匹配聊天）。接受后升级的就是它。';

-- 发请求时把来源会话记下来
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

  -- source 取会话的 kind。**不能随手写 'pulse'** ——
  -- friendships_source_check 只认 search/qr/profile/zzup_id/petchat/driftbottle，
  -- 写别的会在 insert 时被约束打回，表现又是「点了没反应」。
  select c.kind into v_source from public.conversations c where c.id = p_conversation;
  if v_source not in ('petchat','driftbottle') then v_source := null; end if;

  -- 复用原有全部校验（互相拉黑 / 已是好友 / 已有 pending）
  perform public.send_friend_request(v_peer, v_source);

  -- 同一事务内补记来源会话
  update public.friendships
  set origin_conversation_id = p_conversation
  where requester_id = auth.uid()
    and addressee_id = v_peer
    and status = 'pending';
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
    -- 有来源会话就用它，不用猜
    v_group_id := new.origin_conversation_id;

    if v_group_id is not null then
      -- 但得确认它确实还是个待升级的临时匹配会话
      if not exists (
        select 1 from public.conversations c
        where c.id = v_group_id and c.kind = 'petchat' and c.is_temporary = true
      ) then
        v_group_id := null;
      end if;
    end if;

    -- 兜底：没有来源会话（搜索/二维码加的好友）时反查，取**最近活动**的那个
    if v_group_id is null then
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
    end if;

    if v_group_id is not null then
      update public.conversations
      set is_temporary  = false,
          kind          = 'dm',
          expires_at    = null,
          -- 升级完就不再是 AI 代理会话了（迁移 87）
          is_agent_chat = false
      where id = v_group_id;
    end if;
  end if;
  return new;
end;
$function$;
