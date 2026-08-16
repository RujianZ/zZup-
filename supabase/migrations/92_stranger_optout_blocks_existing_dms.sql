-- =============================================================================
-- 92_stranger_optout_blocks_existing_dms.sql
-- 关掉陌生人开关 = 连**已存在的**私聊也发不进来；删好友时自己这边的窗口消失
--
-- ── 推翻了迁移 90 的一个决定 ─────────────────────────────────────────────────
-- 迁移 90 里我定的是「开关只拦新开窗口，已存在的会话照常」，理由是
-- 「抹掉过去是拉黑该干的事」。**这个决定是错的**，2026-08-16 真机实测时被推翻：
--
--   Joe 的原话：「我和你本来是好友，我给你删了，我这个允许陌生人私信关闭了，
--   我就该看不到你的消息。」
--
-- 按 90 的语义，删好友之后那个已存在的窗口还是通的 —— 用户不会这么理解，
-- 官网写的也是 "no stranger can **ever** open a chat with you"。
-- 所以这里把语义收紧成一句话：**不是好友 + 对方关了开关 = 发不进去**，
-- 跟这个窗口是什么时候建的无关。
--
-- ── 为什么是「发不出去」而不是「窗口消失」 ───────────────────────────────────
-- Joe 明确要的不对称：
--   · 删好友的人（我）：窗口在我这边**消失**
--   · 被删的人（对方）：**还看得见窗口**，但发消息发不出去
-- 这正好落在两个已有机制上，不用发明新东西：
--   · 消失 → hide_conversation()，写的是 conversation_members.hidden_at，
--            本来就是**按成员各存各的**（迁移 76）
--   · 发不出去 → messages 的 BEFORE INSERT 触发器，和迁移 82 的
--                on_message_check_frozen（会话冻结后禁止发言）同一个模式
--
-- 让对方**看得见但发不出去**是有意的：直接让窗口在对方那边消失，
-- 等于把「我删了你」这件事广播给对方；而报错只有他自己看得到。
-- 这和迁移 80 里「拉黑不跨身份，因为跨身份可观测就泄露了身份关联」是同一条原则。
--
-- ── 范围：只管两人会话 ───────────────────────────────────────────────────────
-- kind in ('dm','petchat','driftbottle') —— 库里这三种最大成员数都是 2。
-- **group 不在本迁移范围内**：群里一条消息是发给所有人的，按某一个成员的
-- 设置去拒绝插入，会把整条消息对**所有人**打掉，明显不对。
-- 群聊要做只能做读取侧过滤（对我隐藏非好友的发言），那是另一套机制，
-- 等 Joe 定了再单独做。
-- zzuper_talk 是自己跟自己的宠物，成员数 1，天然不涉及。
--
-- ── sender_id 的坑 ───────────────────────────────────────────────────────────
-- 客户端读到的宠物消息 sender_id 恒为 null（迁移 77/78 在**读取 RPC** 里抹掉的），
-- 但**表里这一列是有真值的**。触发器跑在表上，拿得到真实账号。
-- 万一真的是 null（AI 代发），直接放行 —— 归属不明就不拦，
-- 而且 Pulse 在迁移 91 已经从入队那一步就拦住了。
--
-- 回滚：db-backups/2026-08-16/ROLLBACK_92.sql
-- =============================================================================

-- ── 判定：sender 能不能往这个会话里发 ────────────────────────────────────────
create or replace function public.trg_block_stranger_sends()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_kind   text;
  v_sender uuid := coalesce(new.sender_id, auth.uid());
  v_peer   uuid;
begin
  -- 归属不明（AI 代发）不拦
  if v_sender is null then return new; end if;

  select kind into v_kind from public.conversations where id = new.conversation_id;
  if v_kind is null or v_kind not in ('dm','petchat','driftbottle') then
    return new;                       -- group / zzuper_talk 不在范围内，见文件头
  end if;

  -- 两人会话里的另一个人 = 收件人
  select cm.account_id into v_peer
  from public.conversation_members cm
  where cm.conversation_id = new.conversation_id
    and cm.account_id is distinct from v_sender
  limit 1;

  if v_peer is null then return new; end if;   -- 单人会话/数据异常，不拦

  if public.accepts_strangers(v_peer) then return new; end if;

  -- 收件人关了开关：只有已接受的好友能发进来
  if not exists (
    select 1 from public.friendships
    where status = 'accepted'
      and least(requester_id, addressee_id)    = least(v_sender, v_peer)
      and greatest(requester_id, addressee_id) = greatest(v_sender, v_peer))
  then
    raise exception 'This person only accepts messages from people they have added.'
      using errcode = '42501';
  end if;

  return new;
end;
$function$;

drop trigger if exists on_message_check_stranger on public.messages;
create trigger on_message_check_stranger
  before insert on public.messages
  for each row execute function public.trg_block_stranger_sends();

-- ── 删好友：自己这边的窗口一起消失 ───────────────────────────────────────────
-- 函数体取自 pg_get_functiondef 线上原文，只在删除成功之后补一段。
-- 只 hide **自己**那一行 conversation_members，对方那边原样保留 —— 见文件头。
create or replace function public.remove_friend(p_friendship_id uuid)
returns void
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_uid   uuid := auth.uid();
  v_other uuid;
begin
  if v_uid is null then raise exception 'Not authenticated'; end if;

  delete from public.friendships
  where id = p_friendship_id and status = 'accepted'
    and (requester_id = v_uid or addressee_id = v_uid)
  returning case when requester_id = v_uid then addressee_id else requester_id end
    into v_other;

  if not found then raise exception 'Friendship not found or not permitted'; end if;

  -- ── 迁移 92 ──────────────────────────────────────────────────────────────
  -- 把我和这个人之间所有两人会话，在**我这一侧**隐藏。
  -- 不能直接调 hide_conversation()：那个函数内部写死了 auth.uid()，
  -- 一次只能处理一个会话 id；这里要一次处理完，直接写同样的两列。
  if v_other is not null then
    update public.conversation_members cm
       set cleared_before = now(),
           hidden_at      = now()
     where cm.account_id = v_uid
       and cm.conversation_id in (
         select c.id
         from public.conversations c
         join public.conversation_members me    on me.conversation_id    = c.id and me.account_id    = v_uid
         join public.conversation_members other on other.conversation_id = c.id and other.account_id = v_other
         where c.kind in ('dm','petchat','driftbottle'));
  end if;
end;
$function$;

grant execute on function public.remove_friend(uuid) to authenticated;

notify pgrst, 'reload schema';
