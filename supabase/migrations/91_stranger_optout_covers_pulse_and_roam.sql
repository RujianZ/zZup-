-- =============================================================================
-- 91_stranger_optout_covers_pulse_and_roam.sql
-- 关掉陌生人开关 = 退出所有陌生人场景，不只是私信
--
-- ── 为什么补这一条 ───────────────────────────────────────────────────────────
-- 迁移 90 只拦了 create_dm，还在界面上写了句「不影响 Pulse 和 Roam」。
-- 那是个多余的豁免：一个叫「不接受陌生人」的开关，结果陌生人照样能通过
-- Pulse 匹配到你、照样能在你的 Roam 帖子下面出现 —— 用户不会这么理解，
-- 官网写的也是 "no stranger can **ever**"。
--
-- 现在的语义只有一句话：**关掉 = 你不参与陌生人场景**。
--   · 私信：非好友开不了新窗口（迁移 90）
--   · Pulse：进不了匹配队列
--   · Roam：发不了帖、也评论不了别人的帖
--
-- ── 判定为什么用触发器，而不是改函数 ────────────────────────────────────────
-- match_queue 和 travel_posts **两边都写**：客户端直接写一份，Ethan 的
-- agent-chat / travel-mode Edge Function 用 service_role 又写一份。
-- service_role 绕过 RLS，但**绕不过触发器**。
-- 所以触发器是唯一一处能同时盖住两条路、且完全不用碰 Ethan 文件的判定点。
--
-- 判定读的是**行自己的 user_id / author_id**，不是 auth.uid() ——
-- Edge Function 以 service_role 身份写入时 auth.uid() 是 null，用它会全部漏判。
--
-- ── 已知的小缺口，故意不补 ───────────────────────────────────────────────────
-- 「先进了队列，再去把开关关掉」这一种，本次不处理：
-- 队列是临时的（匹配上就出队，匹配不上会过期），缺口窗口只有几分钟，
-- 而要补它就得改 find_match 的候选人筛选，牵扯 Ethan 那侧的调用时序。
-- 不值得为几分钟的窗口去动那里。
--
-- 同理，关开关**不会**回收已发出的 Roam 帖子、不会解散已有的会话 ——
-- 和迁移 90 一致：这个开关管的是「以后别再来」，不是「把过去抹掉」。
-- 要抹掉过去那是拉黑/删号，不是一个设置项该顺手做的事。
--
-- 回滚：db-backups/2026-08-16/ROLLBACK_91.sql
-- =============================================================================

-- ── 共用判定 ─────────────────────────────────────────────────────────────────
create or replace function public.accepts_strangers(p_account uuid)
returns boolean
language sql
stable
security definer
set search_path to 'public'
as $function$
  -- 查不到就放行：宁可漏拦，也不能因为一行脏数据把人锁在功能外面
  select coalesce((select allow_stranger_dm from public.profiles where id = p_account), true);
$function$;

comment on function public.accepts_strangers(uuid) is
  '迁移 90/91：该账号是否参与陌生人场景（私信/Pulse/Roam）。查不到时返回 true。';

-- ── 触发器函数 ───────────────────────────────────────────────────────────────
-- 一个函数管三张表，靠 TG_TABLE_NAME 取对应的人物列 + 给对应的报错文案。
create or replace function public.enforce_stranger_optout()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_account uuid;
  v_msg     text;
begin
  case tg_table_name
    when 'match_queue' then
      -- 只拦「进队列」。匹配达成时 find_match 会再 upsert 一次把 status 改成
      -- 'matched'，那一次不该被拦 —— 拦了会把**对方**的匹配一起搞失败。
      if new.status is distinct from 'waiting' then return new; end if;
      v_account := new.user_id;
      v_msg := 'Turn on “Allow stranger DMs” in your profile to use Pulse.';

    when 'travel_posts' then
      v_account := new.user_id;
      v_msg := 'Turn on “Allow stranger DMs” in your profile to send your pet roaming.';

    when 'travel_comments' then
      v_account := new.author_id;
      v_msg := 'Turn on “Allow stranger DMs” in your profile to reply to other people’s notes.';

    else
      return new;
  end case;

  if v_account is not null and not public.accepts_strangers(v_account) then
    raise exception '%', v_msg using errcode = '42501';
  end if;

  return new;
end;
$function$;

drop trigger if exists trg_stranger_optout_match_queue     on public.match_queue;
drop trigger if exists trg_stranger_optout_travel_posts    on public.travel_posts;
drop trigger if exists trg_stranger_optout_travel_comments on public.travel_comments;

create trigger trg_stranger_optout_match_queue
  before insert on public.match_queue
  for each row execute function public.enforce_stranger_optout();

create trigger trg_stranger_optout_travel_posts
  before insert on public.travel_posts
  for each row execute function public.enforce_stranger_optout();

create trigger trg_stranger_optout_travel_comments
  before insert on public.travel_comments
  for each row execute function public.enforce_stranger_optout();

-- ── Roam 的回复私信：两边都要检查 ────────────────────────────────────────────
-- reply_to_travel_comment 是帖主给评论者开一个 driftbottle 私聊窗口。
-- 评论者这一侧本来就过不了上面的评论触发器，但**历史评论**是开关上线之前留下的，
-- 所以这里两边都查一次。
--
-- ⚠️ 函数体取自 pg_get_functiondef 的**线上原文**，不是迁移 61 的文本。
--    参数名必须是 p_reply_content（客户端 travel.ts:290 就是这么传的），
--    写成别的名字 create or replace 会直接报错，或者把 Roam 回复整个打挂。
--
-- 顺带补了一行 `set search_path to 'public'`：线上这个 SECURITY DEFINER 函数
-- 没设 search_path，是个真实的提权面。函数体里所有对象本来就是 public. 全限定的，
-- 补上不改变任何行为。**这一行超出了本迁移的主题，如果不想要就删掉它再跑。**
create or replace function public.reply_to_travel_comment(
  p_comment_id     uuid,
  p_reply_content  text
)
returns uuid
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_comment_author_id uuid;
  v_post_owner_id     uuid;
  v_travel_post_id    uuid;
  v_group_id          uuid;
begin
  select tc.author_id, tp.user_id, tc.travel_post_id
    into v_comment_author_id, v_post_owner_id, v_travel_post_id
  from public.travel_comments tc
  join public.travel_posts tp on tp.id = tc.travel_post_id
  where tc.id = p_comment_id;

  if v_comment_author_id is null or v_post_owner_id is null then
    raise exception 'Comment not found';
  end if;

  if auth.uid() != v_post_owner_id then
    raise exception 'Permission denied: Only the travel post owner can reply to this comment';
  end if;

  -- ── 迁移 91 ──────────────────────────────────────────────────────────────
  if not public.accepts_strangers(v_post_owner_id) then
    raise exception 'Turn on “Allow stranger DMs” in your profile to reply here.'
      using errcode = '42501';
  end if;
  if not public.accepts_strangers(v_comment_author_id) then
    raise exception 'This person is not accepting messages from people they have not added.'
      using errcode = '42501';
  end if;

  select cm1.conversation_id into v_group_id
  from public.conversation_members cm1
  join public.conversation_members cm2 on cm2.conversation_id = cm1.conversation_id
  join public.conversations c on c.id = cm1.conversation_id
  where c.kind = 'driftbottle'
    and cm1.account_id = v_post_owner_id
    and cm2.account_id = v_comment_author_id
  limit 1;

  if v_group_id is not null then
    update public.conversations
    set is_temporary = true,
        is_agent_chat = false,
        expires_at = timezone('utc'::text, now()) + interval '24 hours'
    where id = v_group_id;
  else
    insert into public.conversations (
      kind, description, created_by, members_count,
      is_temporary, is_agent_chat, expires_at
    )
    values (
      'driftbottle', '旅行留言回复', v_post_owner_id, 2,
      true, false, timezone('utc'::text, now()) + interval '24 hours'
    )
    returning id into v_group_id;

    insert into public.conversation_members (conversation_id, account_id, role)
    values (v_group_id, v_post_owner_id, 'member'),
           (v_group_id, v_comment_author_id, 'member');
  end if;

  insert into public.messages (conversation_id, sender_id, identity_mode, content)
  values (v_group_id, v_post_owner_id, 'real', p_reply_content);

  return v_group_id;
end;
$function$;

grant execute on function public.accepts_strangers(uuid) to authenticated;
grant execute on function public.reply_to_travel_comment(uuid, text) to authenticated;

notify pgrst, 'reload schema';
