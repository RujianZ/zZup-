-- =============================================================================
-- 117_pulse_matches_strangers_only.sql
--
-- Pulse 只撮合陌生人。
--
-- ── 为什么 ───────────────────────────────────────────────────────────
-- 原来的 try_match_user **唯一**的排除条件是「不是自己」：
--     where mq.status = 'waiting' and mq.user_id != p_user_id
-- 没有好友排除、没有拉黑排除、没有软删排除。
--
-- 1) 产品前提就不成立 —— Pulse 卖的是「跟陌生人建立连接」，
--    配到一个已经能私聊的好友，这一轮撮合就白费了。
--
-- 2) 而且会**硬报错**。会话里那个「加好友」按钮走
--    send_friend_request_in_conversation → send_friend_request，那里写着：
--        if 已是好友 then raise exception 'Already friends';
--    用户点一下，拿到一个未经包装的异常。
--
-- 3) 2026-08-28 实测撞上过：00002 和 00006 是 accepted 好友，照样被配到一起。
--
-- ── 一并补的两条 ─────────────────────────────────────────────────────
-- 都是「别处早就在查、唯独撮合这一步没查」的前后不一致：
--   · **拉黑**：send_friend_request 早就双向查 blocked_users 了，
--     但撮合不查 —— 于是 A 拉黑 B 之后，两人还会被撮合进同一个会话。
--     苹果 1.2（UGC 四件套）要求封禁真实有效，这条有上架分量。
--   · **软删**：delete_my_account() 是软删，profile 行还在。
--     不排除的话，删了号的人还会被配进来。
--
-- ── ⚠️ 兜底那一段必须用同一套条件 ───────────────────────────────────
-- 第 2 段是「没人达标就按排队时间配最老的」。如果只给第 1 段加排除，
-- 所有限制都会被兜底绕过去 —— 而**人少的时候走的恰恰全是兜底**。
--
-- ── 副作用（测试时会撞上）────────────────────────────────────────────
-- 00002(Joe) 和 00006(Claude 测试号) 是好友，**从此不能用这两个号测 Pulse**。
-- 要测得先解除好友，或者开第三个号。
-- =============================================================================

create or replace function public.try_match_user(
  p_user_id uuid,
  p_interest_embedding vector,
  p_university text,
  p_match_threshold double precision
)
returns uuid
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_matched_user_id uuid;
  v_group_id uuid;
begin
  -- 1. 先按相似度找（同校优先 → 相似度高优先 → 排队久优先）
  select mq.user_id into v_matched_user_id
  from public.match_queue mq
  join public.profiles p on p.id = mq.user_id
  where mq.status = 'waiting'
    and mq.user_id <> p_user_id
    and p.deleted_at is null
    and p.interest_embedding is not null
    and (1 - (p.interest_embedding <=> p_interest_embedding)) > p_match_threshold
    -- Pulse = 陌生人。已是好友、或已有待处理的好友请求，都不撮合。
    and not exists (
      select 1 from public.friendships f
      where f.status in ('accepted','pending')
        and least(f.requester_id, f.addressee_id)    = least(p_user_id, mq.user_id)
        and greatest(f.requester_id, f.addressee_id) = greatest(p_user_id, mq.user_id)
    )
    -- 拉黑双向任一方向都算
    and not exists (
      select 1 from public.blocked_users b
      where (b.blocker_id = p_user_id and b.blocked_id = mq.user_id)
         or (b.blocker_id = mq.user_id and b.blocked_id = p_user_id)
    )
  order by
    case when p.university = p_university then 0 else 1 end,
    p.interest_embedding <=> p_interest_embedding,
    mq.joined_at asc
  limit 1
  for update skip locked;

  -- 2. 兜底：没人达标就按排队时间配最老的。**排除条件必须一模一样。**
  if v_matched_user_id is null then
    select mq.user_id into v_matched_user_id
    from public.match_queue mq
    join public.profiles p on p.id = mq.user_id
    where mq.status = 'waiting'
      and mq.user_id <> p_user_id
      and p.deleted_at is null
      and not exists (
        select 1 from public.friendships f
        where f.status in ('accepted','pending')
          and least(f.requester_id, f.addressee_id)    = least(p_user_id, mq.user_id)
          and greatest(f.requester_id, f.addressee_id) = greatest(p_user_id, mq.user_id)
      )
      and not exists (
        select 1 from public.blocked_users b
        where (b.blocker_id = p_user_id and b.blocked_id = mq.user_id)
           or (b.blocker_id = mq.user_id and b.blocked_id = p_user_id)
      )
    order by mq.joined_at asc
    limit 1
    for update skip locked;
  end if;

  -- 3. 配上了 → 建临时会话
  if v_matched_user_id is not null then
    insert into public.conversations (
      kind, created_by, members_count, is_temporary, is_agent_chat, expires_at
    )
    values (
      'petchat', p_user_id, 2, true, true,
      timezone('utc'::text, now()) + interval '3 hours'
    )
    returning id into v_group_id;

    insert into public.conversation_members (conversation_id, account_id, role)
    values (v_group_id, p_user_id, 'member'),
           (v_group_id, v_matched_user_id, 'member');

    insert into public.match_queue (user_id, status, matched_group_id)
    values (p_user_id, 'matched', v_group_id)
    on conflict (user_id) do update
    set status = 'matched', matched_group_id = v_group_id;

    update public.match_queue
    set status = 'matched', matched_group_id = v_group_id
    where user_id = v_matched_user_id;

    return v_group_id;
  else
    -- 4. 没配上 → 自己进队列等着
    insert into public.match_queue (user_id, status, matched_group_id, joined_at)
    values (p_user_id, 'waiting', null, timezone('utc'::text, now()))
    on conflict (user_id) do update
    set status = 'waiting', matched_group_id = null, joined_at = timezone('utc'::text, now());

    return null;
  end if;
end;
$function$;
