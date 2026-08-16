-- =============================================================================
-- 86_conversation_addressed_friendship.sql
-- Pulse 匹配会话里的加好友：改为**按会话寻址**，客户端不再需要对方的账号 id
--
-- ── 症状 ─────────────────────────────────────────────────────────────────────
-- Pulse 会话里点「加好友 → 确认」，没有报错，没有任何反应。
--
-- ── 根因 ─────────────────────────────────────────────────────────────────────
-- AgentChatScreen 这样找对方：
--     from('conversation_members').select('account_id').eq('conversation_id', …)
--     members.find(m => m.account_id !== myId)
--
-- 而 conversation_members 的 RLS 是 `auth.uid() = account_id` —— **只看得见自己那一行**。
-- 于是 find() 恒为 undefined，partnerId 恒为 null，点确认直接静默 return。
--
-- 这不是「查询写错了」，是**它本来就不该拿得到**：Pulse 的匿名性建立在
-- 客户端拿不到对方账号 id 之上（拿到了就能转手查出真名）。
-- list_conversation_members 会返回 account_id，所以它也不是这里的答案 ——
-- 用它等于给未接管的匹配对象开一条揭面具的路。
--
-- ── 修法 ─────────────────────────────────────────────────────────────────────
-- 跟匿名宠物用「会话 + 代号」寻址同一个思路：加好友也改成按**会话**寻址。
-- 对方是谁在服务端解析，账号 id 一步都不出库。
--
-- 顺带在服务端补上「冻结后不能再加好友」—— 客户端只是把入口藏了。
--
-- 回滚：db-backups/2026-08-15/ROLLBACK_86.sql
-- =============================================================================

-- 内部助手：解析双人会话里的另一方。
-- **故意不授权给客户端** —— 授权了就等于把上面那条揭面具的路重新打开。
create or replace function public.conversation_peer_id(p_conversation uuid)
returns uuid
language sql
stable
security definer
set search_path to 'public'
as $function$
  select cm.account_id
  from public.conversation_members cm
  join public.profiles p on p.id = cm.account_id
  where cm.conversation_id = p_conversation
    and cm.account_id <> auth.uid()
    and p.deleted_at is null
    and exists (
      select 1 from public.conversation_members me
      where me.conversation_id = p_conversation
        and me.account_id = auth.uid()
    )
  limit 1;
$function$;

revoke all on function public.conversation_peer_id(uuid) from public, anon, authenticated;

-- 好友状态（按会话）。返回 friendship_id 只是为了让「接受请求」有的放矢；
-- 它不指向任何身份信息，接受之后双方本来就互相可见了。
create or replace function public.conversation_friendship_state(p_conversation uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path to 'public'
as $function$
declare
  v_uid  uuid := auth.uid();
  v_peer uuid;
  v_status text;
  v_fid uuid;
begin
  if v_uid is null then
    return jsonb_build_object('status', 'none', 'friendship_id', null);
  end if;

  v_peer := public.conversation_peer_id(p_conversation);
  if v_peer is null then
    return jsonb_build_object('status', 'none', 'friendship_id', null);
  end if;

  v_status := public.get_friendship_status(v_peer);

  if v_status = 'pending_received' then
    select id into v_fid
    from public.friendships
    where requester_id = v_peer and addressee_id = v_uid and status = 'pending'
    order by created_at desc
    limit 1;
  end if;

  return jsonb_build_object('status', v_status, 'friendship_id', v_fid);
end;
$function$;

grant execute on function public.conversation_friendship_state(uuid) to authenticated;

-- 发送好友请求（按会话）。
create or replace function public.send_friend_request_in_conversation(p_conversation uuid)
returns void
language plpgsql
security definer
set search_path to 'public'
as $function$
declare v_peer uuid; v_source text;
begin
  if auth.uid() is null then raise exception 'Not authenticated'; end if;

  -- 冻结的会话不能再加好友。客户端只是把按钮藏了 ——
  -- 真正的边界得在这里，否则改个客户端就绕过去了。
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
end;
$function$;

grant execute on function public.send_friend_request_in_conversation(uuid) to authenticated;

-- 对方的真实资料 —— **只在对方自己揭了面具之后才给**。
--
-- 原来这个门槛在客户端：拿到 id，先判断历史里有没有对方的真人消息，有才去查。
-- 判断对了，但位置错了 —— 改个客户端就能跳过。搬到服务端来，
-- 「没揭面具」这件事就变成拿不到数据，而不是「说好了不显示」。
create or replace function public.conversation_peer_profile(p_conversation uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path to 'public'
as $function$
declare v_peer uuid; v_out jsonb;
begin
  v_peer := public.conversation_peer_id(p_conversation);
  if v_peer is null then return null; end if;

  -- 揭面具的判据有两条，满足其一即可：
  --   1. 对方在本会话里以真人身份发过言（跟客户端判断接管用的是同一个信号）
  --   2. 已经是好友 —— **加好友本身就是揭面具**。少了这条，加完好友却还
  --      拿不到对方名字，升级后的会话头部会是空的。
  if not exists (
    select 1 from public.messages m
    where m.conversation_id = p_conversation
      and m.sender_id = v_peer
      and m.identity_mode = 'real'
  ) and not exists (
    select 1 from public.friendships f
    where f.status = 'accepted'
      and least(f.requester_id, f.addressee_id)    = least(auth.uid(), v_peer)
      and greatest(f.requester_id, f.addressee_id) = greatest(auth.uid(), v_peer)
  ) then
    return null;
  end if;

  select jsonb_build_object(
           'id', p.id,
           'real_name', p.real_name,
           'avatar_url', p.avatar_url,
           'pet_breed', p.pet_breed,
           'pet_stage', p.pet_stage
         )
    into v_out
  from public.profiles p
  where p.id = v_peer and p.deleted_at is null;

  return v_out;
end;
$function$;

grant execute on function public.conversation_peer_profile(uuid) to authenticated;
